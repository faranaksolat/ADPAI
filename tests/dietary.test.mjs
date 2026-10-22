import test from 'node:test';
import assert from 'node:assert/strict';
import {dietaryEvidence, dietaryConflict, normalizeDietary} from '../src/dietary.js';
import {evaluateMenu} from '../src/menu.js';
import {evaluateProduct} from '../src/engine.js';

const all=['avoid_pork','avoid_beef','vegetarian'];
const lines=(text,score=.95)=>[{words:text.split(' ').map(text=>({text,score}))}];
const evidence=(text,prefs=all,score=.95)=>dietaryEvidence(lines(text,score),prefs);
const conflicts=(text,prefs=all)=>evidence(text,prefs).filter(h=>h.kind==='conflict').map(h=>h.preference_id);
const source=(rows,score=.95)=>({photoIndex:0,familyId:'korean',items:rows.map((text,i)=>({text,score,lineId:i,box:{x0:10,y0:i*32,x1:400,y1:i*32+20}}))});
const menu=(rows,prefs=all,score=.95)=>evaluateMenu({sources:[source(rows,score)],profile:{allergens:[],custom_avoid:[],dietary_preferences:prefs}});

test('preferences accept only the three known ids, without duplicates',()=>{
 assert.deepEqual(normalizeDietary(['vegetarian','unknown','avoid_pork','vegetarian']),['avoid_pork','vegetarian']);
 for(const value of [null,{},'avoid_pork'])assert.deepEqual(normalizeDietary(value),[]);
 assert.deepEqual(evidence('pork',[]),[]);
});
test('explicit English and Korean species and derivatives map only to relevant preferences',()=>{
 for(const term of ['pork','porcine gelatin','lard','돼지고기','돈육','돼지뼈','돼지기름','삼겹살']){
  assert.deepEqual([...new Set(conflicts(term))],['avoid_pork','vegetarian'],term);
 }
 for(const term of ['beef','veal','bovine gelatin','소고기','쇠고기','우육','우지','소뼈']){
  assert.deepEqual([...new Set(conflicts(term))],['avoid_beef','vegetarian'],term);
 }
});
test('vegetarian excludes poultry, fish, seafood and explicit animal derivatives',()=>{
 for(const term of ['chicken broth','turkey','duck','lamb','fish sauce','anchovy stock','shrimp','gelatin','animal fat','닭육수','오리고기','멸치육수','새우','젤라틴','액젓'])assert.ok(conflicts(term,['vegetarian']).includes('vegetarian'),term);
});
test('vegetarian permits milk and eggs; beef avoidance does not imply dairy avoidance',()=>{
 for(const term of ['milk, eggs, cheese, butter','우유, 달걀, 치즈'])assert.deepEqual(evidence(term),[]);
});
test('ambiguous stocks and fats never identify an animal species',()=>{
 for(const term of ['broth','stock','gelatin','animal fat','bacon','ham','sausage','육수','젤라틴','베이컨']){
  const hits=evidence(term,['avoid_pork','avoid_beef']);assert.ok(hits.length,term);
  assert.ok(hits.every(h=>h.kind==='uncertain'&&h.reason==='origin_unknown'),term);
 }
 for(const term of ['stock','rennet','shortening','육수'])assert.ok(evidence(term,['vegetarian']).every(h=>h.kind==='uncertain'),term);
});
test('explicit other species and plant stocks cannot imply pork or beef',()=>{
 for(const term of ['chicken broth','fish stock','vegetable broth','mushroom stock','닭육수','멸치 육수','채소 육수'])assert.deepEqual(evidence(term,['avoid_pork','avoid_beef']),[],term);
 assert.deepEqual(evidence('bovine gelatin',['avoid_pork']),[]);
 assert.deepEqual(evidence('pork-derived gelatin',['avoid_beef']),[]);
});
test('local negation and plant alternatives do not trigger a conflict or certify safety',()=>{
 for(const term of ['no pork','without beef','pork-free','vegan beef','plant-based pork','식물성 소고기','돼지고기 없음','소고기 없이'])assert.deepEqual(evidence(term),[],term);
 assert.ok(conflicts('no pork with beef').includes('avoid_beef'));
 assert.ok(conflicts('no pork but beef').includes('avoid_beef'));
 assert.ok(conflicts('plant-based pork, pork fat').includes('avoid_pork'));
 assert.ok(conflicts('not vegan pork').includes('avoid_pork'));
 assert.ok(conflicts('non-vegetarian beef').includes('avoid_beef'));
 assert.deepEqual(menu(['Burger: plant-based pork']).safe_items,[]);
});
test('may-contain, flavour and weak negations remain uncertain',()=>{
 for(const term of ['may contain pork','pork-flavoured sauce','소고기맛','돼지고기 혼입 가능']){
  const hits=evidence(term);assert.ok(hits.length,term);assert.ok(hits.every(h=>h.kind==='uncertain'),term);
 }
 const rows=lines('no pork');rows[0].words[0].score=.2;
 assert.ok(dietaryEvidence(rows,all).every(h=>h.kind==='uncertain'));
});
test('missing, invalid or low OCR scores are not converted to confident conflicts',()=>{
 for(const score of [undefined,null,NaN,Infinity,2,-1,true,'0.95',.2]){
  const hits=dietaryEvidence([{words:[{text:'pork',score}]}],all);assert.ok(hits.length);assert.ok(hits.every(h=>h.kind==='uncertain'),String(score));
 }
 const r=menu(['Soup: pork'],all,0);assert.equal(r.status,'unverified');assert.equal(r.items[0].status,'unverified');
});
test('Latin substring matches cannot turn unrelated words into ingredients',()=>{
 assert.deepEqual(evidence('hamster stockroom beefy porky hamburger'),[]);
});
test('menu dietary evidence stays separate from allergy evidence and may be the only profile selection',()=>{
 const r=menu(['Rice bowl: pork','Soup: beef broth','Salad: lettuce']);
 assert.equal(r.items.length,3);assert.ok(r.items.every(i=>i.matches.length===0));
 assert.equal(r.items[0].status,'potential_risk');assert.equal(r.items[1].status,'potential_risk');assert.equal(r.items[2].status,'unverified');
 assert.deepEqual(r.safe_items,[]);assert.equal(r.complete_menu_verified,false);
 const p={allergens:['milk'],dietary_preferences:all};
 const mixed=evaluateMenu({sources:[source(['Soup: cream, pork'])],profile:p});
 assert.deepEqual(mixed.items[0].matches.map(h=>h.allergen_id),['milk']);assert.ok(dietaryConflict(mixed.items[0].dietary_matches));
});
test('recipe names without printed ingredients remain unverified without recipe inference',()=>{
 const r=menu(['Bulgogi 12,000원','Tonkotsu 12,000원','Ramen 12,000원']);
 assert.ok(r.items.every(i=>i.status==='unverified'&&i.dietary_matches.length===0));assert.deepEqual(r.safe_items,[]);
});
test('global and ambiguous dietary evidence never borrows a dish association',()=>{
 const r=menu(['Salad 9,000원','May contain pork']);
 assert.equal(r.items[0].dietary_matches.length,0);assert.equal(r.unassigned[0].association_verified,false);
 assert.ok(r.unassigned[0].dietary_matches.every(h=>h.kind==='uncertain'));
 const s=source(['Salad','Ingredients: pork']);s.items.forEach(i=>delete i.box);
 const unknown=evaluateMenu({sources:[s],profile:{dietary_preferences:all}});
 assert.equal(unknown.items.length,0);assert.equal(unknown.unassigned[0].association_verified,false);
});
test('repeated OCR readings preserve actual low scores without inventing confidence',()=>{
 const s=source(['Soup: pork'],.4);
 const r=evaluateMenu({sources:[s,s],profile:{dietary_preferences:all}});
 assert.equal(r.items.length,1);assert.equal(r.items[0].status,'unverified');
 assert.ok(r.items[0].dietary_matches.every(h=>h.score===.4&&h.kind==='uncertain'));
});
test('dietary ingredients in another column cannot be attributed to the first dish',()=>{
 const s=source(['Salad 9,000원','Ingredients: pork']);s.items[1].box={x0:700,y0:32,x1:1000,y1:52};
 const r=evaluateMenu({sources:[s],profile:{dietary_preferences:all}});
 assert.equal(r.items[0].dietary_matches.length,0);assert.equal(r.items[0].status,'unverified');
 assert.equal(r.unassigned[0].association_verified,false);assert.ok(dietaryConflict(r.unassigned[0].dietary_matches));
});
test('shopping engine output is unchanged if a dietary field is supplied',()=>{
 const input={sources:[source(['INGREDIENTS: pork, milk'])],profile:{allergens:['milk'],custom_avoid:[]}};
 assert.deepEqual(evaluateProduct({...input,profile:{...input.profile,dietary_preferences:all}}),evaluateProduct(input));
});
