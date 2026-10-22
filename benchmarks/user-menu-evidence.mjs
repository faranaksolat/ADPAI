// Partial model-visual development references for user-provided images. No
// location, restaurant provenance, image redistribution rights or human review
// are inferred from an upload. Never use OCR output to fill reference fields.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ALLERGEN_IDS} from './evaluate.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const dietary=new Set(['avoid_pork','avoid_beef','vegetarian']);
const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export async function loadUserMenus(inventory,references){
 const bytes=await fs.readFile(inventory),referenceBytes=await fs.readFile(references),data=JSON.parse(bytes),refs=JSON.parse(referenceBytes);
 if(data.source!=='user_supplied_archive'||refs.reference_method!=='model_visual_before_app_ocr'||refs.human_reviewed!==false||!refs.frozen_utc)throw Error('Uploaded menu references must disclose their provisional, non-human status');
 if(!data.images?.length||!Array.isArray(refs.cases))throw Error('Zero images/references');
 const root=await fs.realpath(path.dirname(path.resolve(inventory))),seen=new Set(),hashes=new Set(),records=[];
 for(const image of data.images){
  if(!image.capture_id||seen.has(image.capture_id)||!image.path||path.isAbsolute(image.path)||image.path.split(/[\\/]/u).includes('..')||!/^[a-f0-9]{64}$/u.test(image.sha256))throw Error('Invalid or duplicate uploaded image');
  seen.add(image.capture_id);
  if(hashes.has(image.sha256))throw Error('Duplicate image cannot inflate capture count');hashes.add(image.sha256);
  const actual=await fs.realpath(path.join(root,image.path));if(!actual.startsWith(root+path.sep)||hash(await fs.readFile(actual))!==image.sha256)throw Error('Uploaded image integrity/path failed');
  const matching=refs.cases.filter(r=>r.capture_id===image.capture_id);if(matching.length!==1||!Array.isArray(matching[0].entries))throw Error('Missing/duplicate reference identity');
  const entryNames=new Set();
  for(const entry of matching[0].entries){
   if(!entry.name||!entry.aliases?.length||!entry.aliases.includes(entry.name)||entry.aliases.some(n=>!key(n)))throw Error('Missing printed title aliases');
   for(const name of new Set(entry.aliases.map(key))){if(entryNames.has(name))throw Error('Ambiguous reference title alias');entryNames.add(name)}
   if(!Array.isArray(entry.positive_allergens)||entry.positive_allergens.some(id=>!ALLERGEN_IDS.includes(id))||!Array.isArray(entry.positive_dietary)||entry.positive_dietary.some(id=>!dietary.has(id)))throw Error('Unknown reference preference');
   if((entry.positive_allergens.length||entry.positive_dietary.length)&&!entry.printed_quote)throw Error('Positive reference requires visible text, not a recipe inference');
  }
  records.push({capture_id:image.capture_id,split:'development',images:[image],entries:matching[0].entries});
 }
 if(refs.cases.length!==records.length)throw Error('Foreign reference identity');
 return {records,root,dataset_sha256:hash(Buffer.concat([bytes,referenceBytes]))};
}
const titleMatches=(item,entry)=>entry.aliases.some(alias=>key(alias)===key(item.name));
export function summarizeUserMenus(records,predictions){
 if(!records.length)throw Error('Zero uploaded cases');
 const seen=new Set();for(const p of predictions){if(seen.has(p.capture_id)||!records.some(r=>r.capture_id===p.capture_id))throw Error('Foreign/duplicate prediction');seen.add(p.capture_id)}
 const cases=records.map(row=>{
  const p=predictions.find(p=>p.capture_id===row.capture_id)||{items:[],sources:[],error:'missing_prediction'},items=p.items||[];
  const text=(p.sources||[]).map(s=>(s.items||[]).map(w=>w.text).join(' ')).join('\n'),raw=key(text);
  const pairs=row.entries.flatMap(entry=>[...entry.positive_allergens.map(id=>({entry,id,kind:'allergen'})),...entry.positive_dietary.map(id=>({entry,id,kind:'dietary'}))]);
  const found=pair=>items.some(item=>titleMatches(item,pair.entry)&&(pair.kind==='allergen'?(item.matches||[]).some(h=>h.allergen_id===pair.id):(item.dietary_matches||[]).some(h=>h.preference_id===pair.id&&h.kind==='conflict')));
  const confident=pair=>items.some(item=>titleMatches(item,pair.entry)&&(pair.kind==='allergen'
    ?(item.matches||[]).some(h=>h.allergen_id===pair.id&&h.uncertain!==true&&Number.isFinite(h.score)&&h.score>=.58)
    :(item.dietary_matches||[]).some(h=>h.preference_id===pair.id&&h.kind==='conflict')));
  const warned=pair=>items.some(item=>titleMatches(item,pair.entry)&&(pair.kind==='allergen'
    ?(item.matches||[]).some(h=>h.allergen_id===pair.id)
    :(item.dietary_matches||[]).some(h=>h.preference_id===pair.id&&['conflict','uncertain'].includes(h.kind))));
  const titles=row.entries.filter(entry=>items.some(item=>titleMatches(item,entry))).length;
  return {capture_id:row.capture_id,known_title_count:row.entries.length,raw_title_signals:row.entries.filter(e=>e.aliases.some(a=>raw.includes(key(a)))).length,matched_titles:titles,
   item_count:items.length,recognized_characters:text.replace(/\s/gu,'').length,known_positive_pairs:pairs.length,detected_pairs:pairs.filter(found).length,
   missed_pairs:pairs.filter(pair=>!found(pair)).map(pair=>({title:pair.entry.name,kind:pair.kind,id:pair.id})),
   confident_pairs:pairs.filter(confident).length,warned_pairs:pairs.filter(warned).length,
   additional_item_titles_needing_review:items.filter(item=>!row.entries.some(entry=>titleMatches(item,entry))).length,
   unsafe_output:['safe','clear','no_listed_conflict'].includes(p.status)||(p.safe_items||[]).length>0||items.some(i=>['safe','clear','no_listed_conflict'].includes(i.status)),
   empty_menu:items.length===0,error:p.error||null,ocr_errors:p.ocr_errors||p.errors||[],latency_ms:p.latency_ms??null};
 });
 const sum=k=>cases.reduce((n,c)=>n+c[k],0),times=cases.map(c=>c.latency_ms).filter(Number.isFinite).sort((a,b)=>a-b);
 return {validity:'user_upload_partial_model_visual_development_NOT_human_reference_NOT_accuracy_validation',capture_count:records.length,known_title_count:sum('known_title_count'),matched_titles:sum('matched_titles'),raw_title_signals:sum('raw_title_signals'),known_positive_pairs:sum('known_positive_pairs'),detected_known_pairs:sum('detected_pairs'),missed_known_pairs:sum('known_positive_pairs')-sum('detected_pairs'),confident_known_pairs:sum('confident_pairs'),warned_known_pairs:sum('warned_pairs'),missed_warning_pairs:sum('known_positive_pairs')-sum('warned_pairs'),additional_item_titles_needing_review:sum('additional_item_titles_needing_review'),empty_menu_count:cases.filter(c=>c.empty_menu).length,unsafe_outputs:cases.filter(c=>c.unsafe_output).length,human_reviewed_references:0,ocr_cer:null,precision:null,false_positive_rate:null,desktop_returned_latency_ms:{p50:times.length?times[Math.ceil(times.length*.5)-1]:null,p95:times.length?times[Math.ceil(times.length*.95)-1]:null},cases};
}
