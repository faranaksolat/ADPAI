// Exploratory model-visual evidence, deliberately separate from human references.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ALLERGEN_IDS} from './evaluate.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function loadEvidence(manifest) {
  const bytes=await fs.readFile(manifest),root=path.dirname(path.resolve(manifest));
  const records=bytes.toString('utf8').split(/\r?\n/u).filter(x=>x.trim()).map(JSON.parse);
  if(!records.length)throw Error('No diagnostic images');
  const ids=new Set();
  for(const row of records){
    if(ids.has(row.capture_id)||!row.capture_id||!['en','ko'].includes(row.language))throw Error('Invalid diagnostic identity/language');
    ids.add(row.capture_id);
    if(row.reference_method!=='model_visual_before_app_ocr'||row.human_reviewed!==false||row.split!=='development')throw Error('Diagnostic evidence must not claim human review or holdout status');
    if(!row.images?.length||!Array.isArray(row.positive_evidence)||!row.reference_text||!row.frozen_utc)throw Error('Missing diagnostic evidence');
    const pairs=new Set();
    for(const e of row.positive_evidence){
      const pair=e.context+':'+e.allergen;
      if(!ALLERGEN_IDS.includes(e.allergen)||!['direct','caution'].includes(e.context)||!e.quote||pairs.has(pair))throw Error('Invalid/duplicate visible evidence');
      pairs.add(pair);
    }
    for(const image of row.images){
      if(!image.path||path.isAbsolute(image.path)||image.path.split(/[\\/]/u).includes('..')||!image.license||!image.attribution)throw Error('Invalid image rights/path');
      const actual=await fs.realpath(path.join(root,image.path));
      if(!actual.startsWith(await fs.realpath(root)+path.sep)||hash(await fs.readFile(actual))!==image.sha256)throw Error('Diagnostic image integrity failed');
    }
  }
  return {records,root,dataset_sha256:hash(bytes)};
}
export function summarizeEvidence(records,predictions){
  if(!records.length)throw Error('No diagnostic images');
  const byId=new Map();
  for(const p of predictions){
    if(byId.has(p.capture_id)||!records.some(r=>r.capture_id===p.capture_id))throw Error('Invalid/duplicate diagnostic prediction');
    if(!['conflict','caution','unverified','safe','clear','no_listed_conflict'].includes(p.status))throw Error('Invalid diagnostic status');
    byId.set(p.capture_id,p);
  }
  const cases=records.map(row=>{
    const p=byId.get(row.capture_id)||{status:'unverified',direct_allergens:[],caution_allergens:[],error:'missing_prediction'};
    const found=new Set([...(p.direct_allergens||[]),...(p.caution_allergens||[])]);
    const known=[...new Set(row.positive_evidence.map(e=>e.allergen))];
    return {capture_id:row.capture_id,language:row.language,status:p.status,error:p.error||null,
      known_positive_allergens:known,detected_known:known.filter(a=>found.has(a)),missed_known:known.filter(a=>!found.has(a)),
      context_mismatches:row.positive_evidence.filter(e=>found.has(e.allergen)&&!(p[e.context+'_allergens']||[]).includes(e.allergen)),
      additional_predictions_needing_review:[...found].filter(a=>!known.includes(a)),
      latency_ms:p.latency_ms??null,elapsed_until_failure_ms:p.elapsed_until_failure_ms??null,ocr_errors:p.ocr_errors||[],
      expected_abstention_for_negative:row.positive_evidence.length===0,
      reassuring_negative:['safe','clear','no_listed_conflict'].includes(p.status)};
  });
  const total=cases.reduce((n,c)=>n+c.known_positive_allergens.length,0),detected=cases.reduce((n,c)=>n+c.detected_known.length,0);
  const times=cases.filter(c=>!c.error&&Number.isFinite(c.latency_ms)).map(c=>c.latency_ms).sort((a,b)=>a-b);
  const q=x=>times.length?times[Math.ceil(x*times.length)-1]:null;
  return {validity:'exploratory_model_visual_development_NOT_human_reference_NOT_release_accuracy',
    capture_count:records.length,known_positive_pairs:total,detected_known_positive_pairs:detected,missed_known_positive_pairs:total-detected,
    observed_visible_evidence_detection_fraction:total?detected/total:null,
    human_reviewed_references:0,ocr_cer:null,ocr_wer:null,precision:null,false_positive_rate:null,
    limitations:'Partial model-read excerpts are not independent human ground truth; unlisted allergens are unknown, so extra predictions require review. Convenience/source-OCR-screened sample; no population accuracy or phone latency claim.',
    status_counts:Object.fromEntries(['conflict','caution','unverified'].map(s=>[s,cases.filter(c=>c.status===s).length])),
    failed_captures:cases.filter(c=>c.error).map(c=>({capture_id:c.capture_id,error:c.error})),
    captures_with_ocr_errors:cases.filter(c=>c.ocr_errors.length).map(c=>({capture_id:c.capture_id,errors:c.ocr_errors})),
    captures_with_deadlines:cases.filter(c=>/timeout|time budget/iu.test(c.error||'')||c.ocr_errors.some(e=>/timeout|time budget/iu.test(e.message||''))).map(c=>c.capture_id),
    reassuring_negative_captures:cases.filter(c=>c.reassuring_negative).length,
    desktop_successful_latency_ms:{count:times.length,p50:q(.5),p95:q(.95)},cases};
}
