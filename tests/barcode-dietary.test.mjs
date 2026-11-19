import test from 'node:test';
import assert from 'node:assert/strict';
import {barcodeDietaryEvidence} from '../src/barcode-dietary.js';
const hits=(ingredients,prefs)=>barcodeDietaryEvidence({ingredients},prefs);
test('pork, beef and vegetarian preferences use shared explicit-ingredient rules',()=>{
 for(const [value,pref] of [['돈육','avoid_pork'],['돼지기름','avoid_pork'],['쇠고기','avoid_beef'],['beef stock','avoid_beef'],['멸치 육수','vegetarian']]){
  assert.ok(hits(value,[pref]).some(x=>x.preference_id===pref&&x.kind==='conflict'),value);
 }
 assert.deepEqual(hits('소고기',['avoid_pork']),[]);
});
test('negated and ambiguous terms do not imply a species-specific conflict',()=>{
 for(const value of ['plant-based pork','돼지고기 없음','vegetable stock','gelatin','육수','shortening']){
  assert.equal(hits(value,['avoid_pork','avoid_beef']).some(x=>x.kind==='conflict'),false,value);
 }
});
test('missing data and absent preferences do not make a food safe',()=>{
 assert.deepEqual(barcodeDietaryEvidence(null,['avoid_pork']),[]);
 assert.deepEqual(barcodeDietaryEvidence({ingredients:''},['avoid_pork']),[]);
 assert.deepEqual(hits('돈육',[]),[]);
});
test('precautionary language is uncertainty',()=>{
 const rows=hits('돼지고기 혼입 가능',['avoid_pork']);
 assert.ok(rows.length);assert.ok(rows.every(x=>x.kind==='uncertain'));
});
