// Dataset validation and metrics. No OCR output is ever used as ground truth.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const ALLERGEN_IDS=['milk','egg','peanut','tree_nuts','soy','wheat','sesame','fish','shellfish'];
const positive=new Set(['conflict','caution']);
const negative=new Set(['safe','clear','no_listed_conflict']);
const validStatuses=new Set([...positive,...negative,'unverified']);
const normal=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();
const ratio=(a,b)=>b?a/b:null;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=message=>{throw new Error(message)};

export function validateRecords(records,{allowProvisional=false}={}) {
  if(!records.length)fail('No annotated records: a zero-image dataset is not a benchmark.');
  const captures=new Set(),families=new Map(),products=new Map(),imageSplits=new Map();
  for(const row of records) {
    for(const key of ['product_id','family_id','capture_id','language','split','kind'])if(!row[key])fail(`Missing ${key}`);
    if(captures.has(row.capture_id))fail(`Duplicate capture_id: ${row.capture_id}`);
    captures.add(row.capture_id);
    if(!['development','validation','holdout'].includes(row.split))fail('Invalid split');
    if(!['real_package','synthetic'].includes(row.kind))fail('Invalid image kind');
    const known=families.get(row.family_id);
    if(known && known!==row.split)fail(`Product family leaks across splits: ${row.family_id}`);
    families.set(row.family_id,row.split);
    if(products.has(row.product_id)&&products.get(row.product_id)!==row.split)fail('Product leaks across splits.');
    products.set(row.product_id,row.split);
    const review=row.annotation;
    const allowed=review?.status==='adjudicated' || allowProvisional && review?.status==='single_review';
    if(!allowed || !Array.isArray(review.reviewers) || !review.reviewers.length)fail(`Unreviewed reference: ${row.capture_id}`);
    if(review.status==='adjudicated' && new Set(review.reviewers).size<2)fail('Adjudicated references require two distinct reviewers.');
    if(!row.images?.length || row.images.length>3)fail('Expected 1–3 photos per product capture.');
    if(!Array.isArray(row.ingredients) || typeof row.required_abstention!=='boolean')fail('Missing ingredient reference or abstention label');
    for(const key of ['direct_allergens','caution_allergens']) {
      if(!Array.isArray(row[key]) || row[key].some(id=>!ALLERGEN_IDS.includes(id)))fail(`Invalid ${key}`);
      if(new Set(row[key]).size!==row[key].length)fail(`Duplicate ${key}`);
    }
    if(row.direct_allergens.some(id=>row.caution_allergens.includes(id)))fail('Direct label takes precedence: do not also label that allergen caution.');
    for(const image of row.images) {
      if(!image.path || path.isAbsolute(image.path) || image.path.split(/[\\/]/u).includes('..'))fail('Images must have local relative paths.');
      if(!/^[a-f0-9]{64}$/u.test(image.sha256||''))fail('Missing image SHA-256');
      if(typeof image.transcript!=='string' || !image.transcript.trim())fail('Missing independently transcribed reference text');
      if(!image.license || !image.attribution || !image.source_url)fail('Missing image rights/provenance');
      if(row.kind==='real_package' && !/^https:\/\//u.test(image.source_url))fail('Real packages need their original HTTPS source URL.');
      const previous=imageSplits.get(image.sha256);
      if(previous && previous!==row.split)fail('Identical images leak across splits.');
      imageSplits.set(image.sha256,row.split);
    }
  }
  return records;
}

export async function loadDataset(manifest,options={}) {
  const bytes=await fs.readFile(manifest);
  const records=bytes.toString('utf8').split(/\r?\n/u).filter(x=>x.trim()).map(x=>JSON.parse(x));
  validateRecords(records,options);
  const root=path.dirname(path.resolve(manifest));
  const realRoot=await fs.realpath(root);
  for(const row of records)for(const image of row.images) {
    const resolved=await fs.realpath(path.resolve(root,image.path));
    if(!resolved.startsWith(realRoot+path.sep))fail('Image path escapes the dataset directory.');
    if(hash(await fs.readFile(resolved))!==image.sha256)fail(`Image checksum mismatch: ${image.path}`);
  }
  return {records,root,dataset_sha256:hash(bytes)};
}

export function editDistance(reference,prediction) {
  let previous=Array.from({length:prediction.length+1},(_,i)=>i);
  for(let i=0;i<reference.length;i++) {
    const current=[i+1];
    for(let j=0;j<prediction.length;j++)current[j+1]=Math.min(current[j]+1,previous[j+1]+1,previous[j]+(reference[i]===prediction[j]?0:1));
    previous=current;
  }
  return previous[prediction.length];
}

function compareSets(expected,predicted) {
  const e=new Set(expected),p=new Set(predicted);
  return {tp:[...e].filter(x=>p.has(x)).length,fp:[...p].filter(x=>!e.has(x)).length,fn:[...e].filter(x=>!p.has(x)).length};
}
function scored(counts) {
  const precision=ratio(counts.tp,counts.tp+counts.fp),recall=ratio(counts.tp,counts.tp+counts.fn);
  return {...counts,precision,recall,false_negative_rate:ratio(counts.fn,counts.tp+counts.fn),false_positive_rate:counts.tn!=null?ratio(counts.fp,counts.fp+counts.tn):null,f1:precision!=null&&recall!=null&&precision+recall?2*precision*recall/(precision+recall):precision===0||recall===0?0:null};
}
function percentile(xs,q) {
  if(!xs.length)return null;
  const sorted=[...xs].sort((a,b)=>a-b);return sorted[Math.ceil(q*sorted.length)-1];
}

export function evaluatePredictions(records,predictions) {
  if(!records.length)fail('Cannot score an empty benchmark.');
  const byId=new Map();
  for(const prediction of predictions) {
    if(byId.has(prediction.capture_id))fail('Duplicate prediction');
    if(!records.some(row=>row.capture_id===prediction.capture_id))fail('Prediction is not part of this dataset.');
    if(!validStatuses.has(prediction.status))fail(`Unknown prediction status: ${prediction.status}`);
    for(const key of ['direct_allergens','caution_allergens'])if(!Array.isArray(prediction[key]) || prediction[key].some(x=>!ALLERGEN_IDS.includes(x)))fail('Invalid predicted allergens');
    byId.set(prediction.capture_id,prediction);
  }
  const contexts={direct:{tp:0,fp:0,fn:0,tn:0},caution:{tp:0,fp:0,fn:0,tn:0},any:{tp:0,fp:0,fn:0,tn:0}};
  const perAllergen=Object.fromEntries(ALLERGEN_IDS.map(id=>[id,{tp:0,fp:0,fn:0,tn:0}]));
  const ingredientCounts={tp:0,fp:0,fn:0},failures=[],misses=[],latencies=[];
  let charEdits=0,charCount=0,compactEdits=0,compactCount=0,wordEdits=0,wordCount=0,unsafeNegatives=0,negativeOutputs=0,abstentions=0,missing=0;
  for(const row of records) {
    const prediction=byId.get(row.capture_id)||{capture_id:row.capture_id,status:'unverified',direct_allergens:[],caution_allergens:[],ingredients:[],transcripts:[],error:'missing_prediction'};
    if(!byId.has(row.capture_id))missing++;
    if(prediction.error)failures.push({capture_id:row.capture_id,error:prediction.error});
    if(prediction.status==='unverified')abstentions++;
    if(negative.has(prediction.status))negativeOutputs++;
    if(negative.has(prediction.status) && (row.required_abstention||row.direct_allergens.length||row.caution_allergens.length))unsafeNegatives++;
    const expected=[...new Set([...row.direct_allergens,...row.caution_allergens])];
    const predicted=[...new Set([...prediction.direct_allergens,...prediction.caution_allergens])];
    const sets={direct:[row.direct_allergens,prediction.direct_allergens],caution:[row.caution_allergens,prediction.caution_allergens],any:[expected,predicted]};
    for(const [context,[e,p]] of Object.entries(sets)) {
      for(const [key,n] of Object.entries(compareSets(e,p)))contexts[context][key]+=n;
      contexts[context].tn+=ALLERGEN_IDS.filter(id=>!e.includes(id)&&!p.includes(id)).length;
    }
    for(const id of ALLERGEN_IDS) {
      if(expected.includes(id))perAllergen[id][predicted.includes(id)?'tp':'fn']++;
      else if(predicted.includes(id))perAllergen[id].fp++;
      else perAllergen[id].tn++;
    }
    const missed=expected.filter(id=>!predicted.includes(id));
    if(missed.length)misses.push({capture_id:row.capture_id,allergens:missed,status:prediction.status});
    for(const [key,n] of Object.entries(compareSets(row.ingredients.map(normal),(prediction.ingredients||[]).map(normal))))ingredientCounts[key]+=n;
    for(const [i,image] of row.images.entries()) {
      const reference=normal(image.transcript),text=normal(prediction.transcripts?.[i]||'');
      charCount+=[...reference].length;charEdits+=editDistance([...reference],[...text]);
      const refCompact=[...reference.replace(/\s/gu,'')],predCompact=[...text.replace(/\s/gu,'')];
      compactCount+=refCompact.length;compactEdits+=editDistance(refCompact,predCompact);
      const words=reference.split(' '),actual=text?text.split(' '):[];
      wordCount+=words.length;wordEdits+=editDistance(words,actual);
    }
    if(Number.isFinite(prediction.latency_ms)&&!prediction.error)latencies.push(prediction.latency_ms);
  }
  const real=records.filter(x=>x.kind==='real_package');
  return {
    validity:real.length!==records.length?'synthetic_or_mixed_not_real_package_validation':records.some(x=>x.annotation.status!=='adjudicated')?'provisional_single_review':'reviewed_package_pilot_not_release_certification',
    capture_count:records.length,product_count:new Set(records.map(x=>x.product_id)).size,
    real_package_capture_count:real.length,synthetic_capture_count:records.length-real.length,
    ocr:{character_edits:charEdits,reference_characters:charCount,cer:ratio(charEdits,charCount),space_ignored_character_edits:compactEdits,space_ignored_reference_characters:compactCount,space_ignored_cer:ratio(compactEdits,compactCount),word_edits:wordEdits,reference_words:wordCount,wer:ratio(wordEdits,wordCount)},
    allergens:Object.fromEntries(Object.entries(contexts).map(([k,v])=>[k,scored(v)])),
    per_allergen:Object.fromEntries(Object.entries(perAllergen).map(([k,v])=>[k,scored(v)])),
    ingredients_exact_rows:scored(ingredientCounts),
    missed_positive_pairs:contexts.any.fn,missed_positive_captures:misses,
    unsafe_negative_captures:unsafeNegatives,reassuring_negative_captures:negativeOutputs,abstention_count:abstentions,abstention_rate:abstentions/records.length,
    missing_predictions:missing,failed_captures:failures,
    captures_with_ocr_errors:predictions.filter(x=>x.ocr_errors?.length).length,
    successful_latency_ms:{count:latencies.length,p50:percentile(latencies,.5),p95:percentile(latencies,.95)},
  };
}
