import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMenus,validateMenuEvidence} from '../benchmarks/menu-evidence.mjs';
// Schema-only fixtures, never a collected restaurant or an accuracy reference.
const row=()=>({capture_id:'schema-fixture',kind:'real_restaurant_menu',split:'development',
 reference_method:'model_visual_before_app_ocr',human_reviewed:false,frozen_utc:'fixture',languages:['ko','en'],
 restaurant:{name:'Schema fixture only',country:'KR',location_evidence:{source_url:'https://example.invalid/location',quote:'fixture'}},
 images:[{path:'fixture.png',sha256:'a'.repeat(64),license:'fixture',attribution:'test author',source_url:'https://example.invalid/image'}],
 entries:[{name:'Soup',printed_text:'Soup: milk',ingredient_quote:'milk',positive_allergens:['milk']},{name:'샐러드',printed_text:'샐러드: 채소',positive_allergens:[]}],unassigned_evidence:[]});
test('zero menus, source hints and fake human review cannot produce a real-menu score',()=>{
 assert.throws(()=>summarizeMenus([],[]),/Zero/u);
 for(const change of [r=>r.human_reviewed=true,r=>r.kind='synthetic_menu',r=>r.restaurant.country='US',r=>r.restaurant.location_evidence=null,r=>r.entries[0].ingredient_quote='']){
  const r=row();change(r);assert.throws(()=>validateMenuEvidence([r]));
 }
});
test('missing menu and wrong dish association stay misses, even if allergen is found elsewhere',()=>{
 assert.equal(summarizeMenus([row()],[]).missed_known_pairs,1);
 const r=summarizeMenus([row()],[{capture_id:'schema-fixture',status:'potential_risk',items:[{name:'샐러드',matches:[{allergen_id:'milk'}]}]}]);
 assert.equal(r.detected_known_pairs,0);assert.equal(r.missed_known_pairs,1);assert.equal(r.cases[0].additional_associations_needing_review.length,1);
 assert.equal(r.precision,null);assert.equal(r.false_positive_rate,null);assert.equal(r.ocr_cer,null);
});
test('a correct printed title association is separate from forbidden safe output',()=>{
 const r=summarizeMenus([row()],[{capture_id:'schema-fixture',status:'potential_risk',items:[{name:'Soup',matches:[{allergen_id:'milk'}]},{name:'샐러드',status:'safe',matches:[]}],latency_ms:25}]);
 assert.equal(r.detected_known_pairs,1);assert.equal(r.unsafe_outputs,1);assert.equal(r.human_reviewed_references,0);
 assert.equal(r.desktop_returned_latency_ms.p95,25);
 assert.throws(()=>summarizeMenus([row()],[{capture_id:'foreign',status:'unverified'}]),/Foreign/u);
});
test('bilingual views cannot be inflated into duplicate independent image cases',()=>{
 const a=row(),b={...row(),capture_id:'another'};
 assert.throws(()=>validateMenuEvidence([a,b]),/Duplicate image/u);
});
