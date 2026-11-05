import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEnteredLabel} from '../src/reviewed-label.js';

const profile={allergens:['wheat','soy','milk','egg']};
test('Korean direct declaration identifies wheat and soy without a safe status',()=>{
 const result=reviewEnteredLabel('밀, 대두 함유\n우유, 돼지고기, 계란 혼입가능',profile);
 assert.equal(result.status,'conflict');
 const direct=new Set(result.direct_matches.map(x=>x.allergen_id));
 assert.ok(direct.has('wheat'));
 assert.ok(direct.has('soy'));
 assert.ok(result.caution_matches.some(x=>x.allergen_id==='milk'));
 assert.equal(result.panel_completeness_verified,false);
});
test('Korean precaution does not become confirmed ingredient',()=>{
 const result=reviewEnteredLabel('우유, 계란 혼입가능',{allergens:['milk','egg']});
 assert.equal(result.status,'caution');
 assert.equal(result.direct_matches.length,0);
});
test('No matches never returns safe or a completed label verification',()=>{
 for(const text of ['', '나트륨 600 mg', '밀, 대두, 우유 무첨가']){
  const result=reviewEnteredLabel(text,profile);
  assert.equal(result.status,'unverified');
  if(text)assert.equal(result.panel_completeness_verified,false);
 }
});
test('Input is explicitly user-entered, bounded, and does not carry original photo metadata',()=>{
 const r=reviewEnteredLabel('Ingredients: Wheat flour',profile);
 assert.equal(r.provenance,'user_entered_unverified_completeness');
 assert.equal(r.status,'conflict');
 assert.throws(()=>reviewEnteredLabel('x'.repeat(12001),profile));
 assert.deepEqual(Object.keys(r).includes('image'),false);
});
