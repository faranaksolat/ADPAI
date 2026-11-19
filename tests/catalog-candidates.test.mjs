import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validGTIN} from '../src/barcode-core.js';
test('online candidates have real GTIN checksums and retained references',async()=>{
 const q=JSON.parse(await readFile('data/catalog-korea-review-queue.json','utf8'));
 assert.equal(q.records.length,10);
 assert.equal(q.quarantined.length,1);
 const seen=new Set();
 for(const x of q.records){
  assert.equal(validGTIN(x.barcode),true,x.barcode);
  assert.equal(x.status,'NEEDS_PHYSICAL_LABEL');
  assert.equal(x.independentReviewers,0);
  assert.equal(x.photoSaved,false);
  assert.ok(!seen.has(x.barcode));seen.add(x.barcode);
  assert.ok(x.sourceLinks.length>0);
  for(const s of x.sourceLinks)assert.ok(s.url.startsWith('https://'));
 }
 assert.equal(seen.has('8801043150620'),false);
});
test('candidate data is never inserted into trusted production catalogue',async()=>{
 const c=JSON.parse(await readFile('data/catalog-korea-verified.json','utf8'));
 assert.equal(c.records.length,0);
});
