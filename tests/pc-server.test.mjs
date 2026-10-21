import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRead} from '../pc_server/static/core.js';
const data={status:'unverified',automatic_negative_results:false,errors:[],sources:[{familyId:'pc-paddle',photoIndex:0,items:[{text:'Ingredients: milk, sugar',score:0,raw_line_score:.99,lineId:0}]}]};
test('PC high line score cannot become a verified product or reassuring negative',()=>{
 const result=reviewRead(data,{allergens:['milk']},'shopping');
 assert.equal(result.status,'unverified');assert.ok(result.matches.some(m=>m.allergen_id==='milk'));
 assert.equal(result.matches.find(m=>m.allergen_id==='milk').score,0);
});
test('PC response rejects fabricated word confidence or a reassuring server status',()=>{
 assert.throws(()=>reviewRead({...data,status:'safe'},{allergens:['milk']},'shopping'));
 assert.throws(()=>reviewRead({...data,sources:[{items:[{text:'milk',score:.99}]}]},{allergens:['milk']},'shopping'));
 const noMatch=reviewRead(data,{allergens:['peanut']},'shopping');assert.equal(noMatch.status,'unverified');assert.equal(noMatch.matches.length,0);
 const menu=reviewRead(data,{allergens:['milk']},'menu');assert.equal(menu.complete_menu_verified,false);assert.deepEqual(menu.safe_items,[]);
});
