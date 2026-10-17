import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateProduct, REQUIRED_BASE_FAMILIES} from '../src/engine.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('../shared/regressions.json', import.meta.url)));
const familyStatus = Object.fromEntries(REQUIRED_BASE_FAMILIES.map(id => [id,{ok:true}]));
const ids = hits => [...new Set(hits.map(h => h.allergen_id))].sort();
for (const c of fixtures.allergens) test(`allergens: ${c.name}`, () => {
  const result = evaluateProduct({...c, familyStatus});
  assert.equal(result.status,c.status);
  assert.deepEqual(ids(result.direct_matches),c.direct);
  assert.deepEqual(ids(result.caution_matches),c.caution);
  assert.equal(result.coverage.complete,false);
  assert.ok(!('calories' in result));
  if (c.name.includes('weak')) assert.ok(result.mention_matches.length || result.status === 'conflict');
});
test('confidence belongs to the allergen word, not the adjacent heading', () => {
  const result = evaluateProduct({familyStatus,profile:{allergens:['milk']},sources:[{familyId:'latin',items:[{text:'INGREDIENTS:',score:.99,lineId:0},{text:'milk',score:.2,lineId:0}]}]});
  assert.equal(result.status,'unverified');
  assert.ok(result.mention_matches.length);
});
