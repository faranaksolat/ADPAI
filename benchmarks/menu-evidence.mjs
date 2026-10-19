// Exploratory menu diagnostics, never independent human-reference certification.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ALLERGEN_IDS} from './evaluate.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const nameKey=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');

export function validateMenuEvidence(records){
  if(!records.length)throw Error('Zero real-menu captures; no benchmark can be scored');
  const ids=new Set(),imageHashes=new Set();
  for(const row of records){
    if(!row.capture_id||ids.has(row.capture_id))throw Error('Duplicate or missing capture identity');
    ids.add(row.capture_id);
    if(row.kind!=='real_restaurant_menu'||row.split!=='development'||row.reference_method!=='model_visual_before_app_ocr'||row.human_reviewed!==false||!row.frozen_utc)throw Error('Must disclose real development menus with model-visual, non-human references');
    if(row.restaurant?.country!=='KR'||!row.restaurant.name||!row.restaurant.location_evidence?.source_url||!row.restaurant.location_evidence?.quote)throw Error('Missing evidence that restaurant is in Korea');
    if(!row.languages?.length||row.languages.some(l=>!['ko','en'].includes(l)))throw Error('Verify Korean/English menu languages before admission');
    if(!row.images?.length||!Array.isArray(row.entries)||!Array.isArray(row.unassigned_evidence))throw Error('Missing menu evidence');
    const names=new Set();
    for(const entry of row.entries){
      const key=nameKey(entry.name);
      if(!key||names.has(key)||!entry.printed_text||!Array.isArray(entry.positive_allergens)||entry.positive_allergens.some(a=>!ALLERGEN_IDS.includes(a)))throw Error('Invalid printed menu entry');
      if(entry.positive_allergens.length&&!entry.ingredient_quote)throw Error('Known positive requires a printed ingredient quote, not a recipe inference');
      names.add(key);
    }
    for(const e of row.unassigned_evidence){if(!e.quote||!ALLERGEN_IDS.includes(e.allergen))throw Error('Invalid unassigned printed evidence')}
    for(const image of row.images){
      if(!image.path||path.isAbsolute(image.path)||image.path.split(/[\\/]/u).includes('..')||!image.license||!image.attribution||!image.source_url||!/^[0-9a-f]{64}$/u.test(image.sha256))throw Error('Missing image rights/path/hash');
      if(imageHashes.has(image.sha256))throw Error('Duplicate image bytes across menu captures; group bilingual views instead');
      imageHashes.add(image.sha256);
    }
  }
}
export async function loadMenuEvidence(manifest){
  const bytes=await fs.readFile(manifest),root=await fs.realpath(path.dirname(path.resolve(manifest)));
  const records=bytes.toString('utf8').split(/\r?\n/u).filter(x=>x.trim()).map(JSON.parse);
  validateMenuEvidence(records);
  for(const row of records)for(const image of row.images){
    const actual=await fs.realpath(path.join(root,image.path));
    if(!actual.startsWith(root+path.sep)||hash(await fs.readFile(actual))!==image.sha256)throw Error('Menu image integrity/path failed');
  }
  return {records,root,dataset_sha256:hash(bytes)};
}
export function summarizeMenus(records,predictions){
  validateMenuEvidence(records);
  const byId=new Map();
  for(const p of predictions){
    if(byId.has(p.capture_id)||!records.some(r=>r.capture_id===p.capture_id))throw Error('Foreign/duplicate menu prediction');
    if(!['potential_risk','unverified','safe','clear','no_listed_conflict'].includes(p.status))throw Error('Unknown menu prediction status');
    byId.set(p.capture_id,p);
  }
  const cases=records.map(row=>{
    const p=byId.get(row.capture_id)||{status:'unverified',items:[],unassigned:[],error:'missing_prediction'};
    const known=row.entries.flatMap(e=>e.positive_allergens.map(a=>({dish:e.name,allergen:a})));
    const found=(p.items||[]).flatMap(i=>(i.matches||[]).map(m=>({dish:i.name,allergen:m.allergen_id})));
    const equal=(a,b)=>nameKey(a.dish)===nameKey(b.dish)&&a.allergen===b.allergen;
    const unassigned=row.unassigned_evidence.map(e=>({...e,detected:(p.unassigned||[]).some(u=>(u.matches||[]).some(m=>m.allergen_id===e.allergen))}));
    return {capture_id:row.capture_id,languages:row.languages,status:p.status,error:p.error||null,
      known_dish_allergen_pairs:known,detected:known.filter(k=>found.some(f=>equal(k,f))),missed:known.filter(k=>!found.some(f=>equal(k,f))),
      additional_associations_needing_review:found.filter(f=>!known.some(k=>equal(k,f))),
      exact_known_titles_found:row.entries.filter(e=>(p.items||[]).some(i=>nameKey(i.name)===nameKey(e.name))).length,
      known_title_count:row.entries.length,unassigned_evidence:unassigned,
      forbidden_safe_output:['safe','clear','no_listed_conflict'].includes(p.status)||(p.safe_items||[]).length>0||(p.items||[]).some(i=>['safe','clear','no_listed_conflict'].includes(i.status)),
      latency_ms:p.latency_ms??null,elapsed_until_failure_ms:p.elapsed_until_failure_ms??null,ocr_errors:p.ocr_errors||[]};
  });
  const total=cases.reduce((n,c)=>n+c.known_dish_allergen_pairs.length,0),detected=cases.reduce((n,c)=>n+c.detected.length,0);
  const times=cases.filter(c=>!c.error&&Number.isFinite(c.latency_ms)).map(c=>c.latency_ms).sort((a,b)=>a-b);
  const q=x=>times.length?times[Math.ceil(x*times.length)-1]:null;
  return {validity:'exploratory_real_menu_model_visual_development_NOT_human_reference_NOT_release_accuracy',
    capture_count:records.length,restaurant_count:new Set(records.map(r=>r.restaurant.name)).size,
    known_dish_allergen_pairs:total,detected_known_pairs:detected,missed_known_pairs:total-detected,
    observed_known_pair_fraction:total?detected/total:null,human_reviewed_references:0,ocr_cer:null,ocr_wer:null,precision:null,false_positive_rate:null,
    unsafe_outputs:cases.filter(c=>c.forbidden_safe_output).length,failed_captures:cases.filter(c=>c.error).map(c=>({capture_id:c.capture_id,error:c.error})),
    desktop_returned_latency_ms:{count:times.length,p50:q(.5),p95:q(.95)},
    limitations:'Partial model-visual references, exact normalized dish-title association; unlisted ingredients/dishes are unknown, no recipe inference or food-safety negatives. Bilingual captures are correlated. Not phone/camera timing. No independent human/menu holdout validation.',cases};
}
