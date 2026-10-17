import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateProduct, REQUIRED_BASE_FAMILIES} from '../src/engine.js';
import {extractCaloriesFromText, extractProductCalories} from '../src/nutrition.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('../shared/regressions.json', import.meta.url)));
const familyStatus = Object.fromEntries(REQUIRED_BASE_FAMILIES.map(id => [id,{ok:true}]));
const ids = hits => [...new Set(hits.map(h => h.allergen_id))].sort();
for (const c of fixtures.allergens) test(`allergens: ${c.name}`, () => {
  const result = evaluateProduct({...c, familyStatus});
  assert.equal(result.status,c.status);
  assert.deepEqual(ids(result.direct_matches),c.direct);
  assert.deepEqual(ids(result.caution_matches),c.caution);
  assert.equal(result.coverage.complete,false);
  if (c.name.includes('weak')) assert.ok(result.mention_matches.length || result.status === 'conflict');
});
for (const c of fixtures.nutrition) test(`nutrition: ${c.name}`, () => {
  assert.equal(extractCaloriesFromText(c.text).package_kcal,c.expected);
});
test('contradictory OCR readings do not produce calories', () => {
  assert.equal(extractProductCalories([300,500].map(kcal => ({items:[{text:`Net weight 100 g. Per 100 g ${kcal} kcal`}]}))).package_kcal,null);
});
test('do not join package weight from one photo with energy from another', () => {
  assert.equal(extractProductCalories([{photoIndex:0,items:[{text:'Net weight 100 g'}]},{photoIndex:1,items:[{text:'Per 100 g 500 kcal'}]}]).package_kcal,null);
});
test('confidence belongs to the allergen word, not the adjacent heading', () => {
  const result = evaluateProduct({familyStatus,profile:{allergens:['milk']},sources:[{familyId:'latin',items:[{text:'INGREDIENTS:',score:.99,lineId:0},{text:'milk',score:.2,lineId:0}]}]});
  assert.equal(result.status,'unverified');
  assert.ok(result.mention_matches.length);
});
