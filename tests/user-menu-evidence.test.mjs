import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadUserMenus,summarizeUserMenus} from '../benchmarks/user-menu-evidence.mjs';
const row=()=>({capture_id:'fixture',entries:[{name:'Soup',aliases:['Soup','수프'],printed_quote:'milk',positive_allergens:['milk'],positive_dietary:[]}]});
test('partial upload references cannot claim CER, precision, human review or successful detection on the wrong dish',()=>{
 const r=summarizeUserMenus([row()],[{capture_id:'fixture',items:[{name:'Salad',matches:[{allergen_id:'milk'}]}],sources:[{items:[{text:'Soup milk'}]}]}]);
 assert.equal(r.matched_titles,0);assert.equal(r.raw_title_signals,1);assert.equal(r.detected_known_pairs,0);assert.equal(r.missed_known_pairs,1);
 assert.equal(r.human_reviewed_references,0);assert.equal(r.precision,null);assert.equal(r.ocr_cer,null);assert.equal(r.false_positive_rate,null);
 assert.equal(summarizeUserMenus([row()],[]).missed_known_pairs,1);
 assert.throws(()=>summarizeUserMenus([row()],[{capture_id:'foreign'}]),/Foreign/);
 assert.throws(()=>summarizeUserMenus([row()],[{capture_id:'fixture'},{capture_id:'fixture'}]),/duplicate/);
});
test('printed bilingual aliases are one case and unsupported safe outputs always fail the gate',()=>{
 const r=summarizeUserMenus([row()],[{capture_id:'fixture',items:[{name:'수프',matches:[{allergen_id:'milk'}],status:'safe'}],safe_items:['수프']}]);
 assert.equal(r.capture_count,1);assert.equal(r.matched_titles,1);assert.equal(r.detected_known_pairs,1);assert.equal(r.unsafe_outputs,1);
 const diet=row();diet.entries[0].positive_dietary=['avoid_pork'];diet.entries[0].positive_allergens=[];
 assert.equal(summarizeUserMenus([diet],[{capture_id:'fixture',items:[{name:'Soup',dietary_matches:[{preference_id:'avoid_pork',kind:'uncertain'}]}]}]).detected_known_pairs,0);
 const weak=summarizeUserMenus([row()],[{capture_id:'fixture',items:[{name:'Soup',matches:[{allergen_id:'milk',score:.2,uncertain:true}]}]}]);
 assert.equal(weak.warned_known_pairs,1);assert.equal(weak.confident_known_pairs,0);
});
test('upload loader checks identity, actual file hashes, boundaries and honest reference provenance',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-upload-schema-'));
 try{
  const bytes=Buffer.from('synthetic schema bytes, not a collected menu');await fs.writeFile(path.join(root,'fixture.png'),bytes);
  const inventory={source:'user_supplied_archive',images:[{capture_id:'fixture',path:'fixture.png',sha256:createHash('sha256').update(bytes).digest('hex')}]};
  const refs={reference_method:'model_visual_before_app_ocr',human_reviewed:false,frozen_utc:'schema fixture only',cases:[row()]};
  const inv=path.join(root,'inventory.json'),ref=path.join(root,'references.json');
  const save=async()=>{await fs.writeFile(inv,JSON.stringify(inventory));await fs.writeFile(ref,JSON.stringify(refs))};
  await save();const loaded=await loadUserMenus(inv,ref);assert.equal(loaded.records.length,1);assert.equal(loaded.records[0].split,'development');
  refs.human_reviewed=true;await save();await assert.rejects(loadUserMenus(inv,ref),/non-human/);refs.human_reviewed=false;
  inventory.images[0].sha256='a'.repeat(64);await save();await assert.rejects(loadUserMenus(inv,ref),/integrity/);
  inventory.images[0].path='../fixture.png';await save();await assert.rejects(loadUserMenus(inv,ref),/Invalid/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
