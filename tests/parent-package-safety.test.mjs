import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProduct} from '../src/engine.js';
import {reviewEnteredLabel} from '../src/reviewed-label.js';
const src=(text,familyId='korean')=>({familyId,items:String(text).split('\n').map((text,lineId)=>({text,lineId,score:.94}))});
test('photographed package: direct wheat and soy, precautionary milk/egg/shellfish',()=>{
 const input='밀, 대두 함유\n우유,돼지고기,계란,새우,게 혼입가능\n소비자 기본법에 의한 피해보상';
 const profile={allergens:['wheat','soy','milk','egg','shellfish']};
 const r=evaluateProduct({sources:[src(input)],profile,requiredFamilies:[]});
 assert.equal(r.status,'conflict');
 const direct=new Set(r.direct_matches.map(x=>x.allergen_id));
 const caution=new Set(r.caution_matches.map(x=>x.allergen_id));
 assert.ok(direct.has('wheat')&&direct.has('soy'));
 for(const id of ['milk','egg','shellfish']){
   assert.equal(direct.has(id),false,'Incorrect direct match: '+id);
   assert.ok(caution.has(id),'Missing precautionary alert: '+id);
 }
});
test('truncated warning line does not inherit direct declaration from previous line',()=>{
 const r=evaluateProduct({sources:[src('밀, 대두 함유\n우유, 돼지고기, 계란, 새우, 게')],profile:{allergens:['milk','egg','shellfish']},requiredFamilies:[]});
 assert.equal(r.status,'unverified');
 assert.equal(r.direct_matches.length,0);
 assert.equal(r.caution_matches.length,0);
});
test('mixed OCR variants must not invent confirmed direct presence for caution words',()=>{
 const good='밀, 대두 함유\n우유, 돼지고기, 계란, 새우, 게 혼입가능';
 const truncated='밀, 대두 함유\n우유, 돼지고기, 계란, 새우, 게';
 const r=evaluateProduct({sources:[src(good),src(truncated)],profile:{allergens:['milk','egg','shellfish']},requiredFamilies:[]});
 assert.equal(r.status,'caution');assert.equal(r.direct_matches.length,0);
});
test('corrected original-photo text remains non-clearing',()=>{
 const r=reviewEnteredLabel('밀, 대두 함유\n우유, 계란 혼입가능',{allergens:['wheat','soy','milk','egg']});
 assert.equal(r.status,'conflict');assert.ok(r.caution_matches.some(x=>x.allergen_id==='milk'));
 assert.equal(r.panel_completeness_verified,false);
});
