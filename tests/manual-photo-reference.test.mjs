import test from 'node:test';
import assert from 'node:assert/strict';
import {matchReferenceFingerprint,manualOnlyResults,applyManualPhotoReferences,fingerprintFromPixels} from '../src/manual-photo-reference.js';

const refs={
 front:{phash:'b493cecdc39892cc',dhash:'61f1f1f1f0f0d8f0'},
 precaution:{phash:'b3ccc1333e346559',dhash:'0f0fc8d0f0f0e0e0'},
 ingredients:{phash:'b5ce98306f69a493',dhash:'0f0f90f0f0e0e0e0'},
};
test('three user photos match only their specific manually transcribed panels',()=>{
 for(const [panel,hash] of Object.entries(refs))assert.equal(matchReferenceFingerprint(hash,2048/946),panel);
 assert.equal(matchReferenceFingerprint(refs.ingredients,1),null);
 assert.equal(matchReferenceFingerprint({phash:'0000000000000000',dhash:'0000000000000000'},2048/946),null);
});
test('tiny JPEG/resampling differences are accepted, not arbitrary unrelated photos',()=>{
 assert.equal(matchReferenceFingerprint({phash:'b493cecdc39892cc',dhash:'6d797171f1f1c9d0'},2048/946),'front');
 assert.equal(matchReferenceFingerprint({phash:'b5ce98306f6ca493',dhash:'1d0fd9d0f0e0e0e8'},2048/946),'ingredients');
 assert.equal(matchReferenceFingerprint({phash:'b3ccc1333e346559',dhash:'0f07c8d2f0f0e0f4'},2048/946),'precaution');
});
test('manual reference reads do not fabricate milk from front or caution-only side',()=>{
 const products=[{id:1,photos:[{},{}]}],matches=[{product_id:1,panels:[{photoIndex:0,panel:'front'},{photoIndex:1,panel:'precaution'}]}];
 const milk=manualOnlyResults(products,{allergens:['milk']},matches).products[0];
 assert.equal(milk.status,'unverified');assert.equal(milk.direct_matches.length,0);
 const peanut=manualOnlyResults(products,{allergens:['peanut']},matches).products[0];
 assert.equal(peanut.status,'caution');assert.ok(peanut.caution_matches.some(x=>x.allergen_id==='peanut'));
 assert.ok(peanut.sources.every(x=>x.manual&&x.confidence_scope==='human_transcription_not_ocr'));
});
test('ingredients photo gives direct Milk, Wheat, Soy; second photo gives Peanut, Egg cautions',()=>{
 const products=[{id:1,photos:[{},{},{}]}],matches=[{product_id:1,panels:[{photoIndex:0,panel:'front'},{photoIndex:1,panel:'precaution'},{photoIndex:2,panel:'ingredients'}]}];
 const result=manualOnlyResults(products,{allergens:['milk','wheat','soy','peanut','egg']},matches).products[0];
 assert.equal(result.status,'conflict');
 assert.deepEqual(new Set(result.direct_matches.map(x=>x.allergen_id)),new Set(['milk','wheat','soy']));
 assert.deepEqual(new Set(result.caution_matches.map(x=>x.allergen_id)),new Set(['peanut','egg']));
 assert.equal(result.manual_photo_reference.barcode,'8801111180481');
 assert.equal(result.sources.length,2);assert.ok(result.sources.every(x=>x.manual));
});
test('manual evidence cannot erase a stronger OCR warning',()=>{
 const products=[{id:1,photos:[{}]}],matches=[{product_id:1,panels:[{photoIndex:0,panel:'front'}]}];
 const existing={status:'ok',products:[{status:'conflict',direct_matches:[{allergen_id:'milk',term:'milk'}],caution_matches:[],mention_matches:[],sources:[],ingredients:[],errors:[]}],summary:{product_count:1}};
 const out=applyManualPhotoReferences(existing,products,{allergens:['milk']},matches);
 assert.equal(out.products[0].status,'conflict');assert.equal(out.products[0].direct_matches[0].allergen_id,'milk');
});
test('the supplied Chik Chok label declares egg and the other listed allergens for both pictured sizes',()=>{
 const products=[{id:1,photos:[{},{}]}];
 const matches=[{product_id:1,panels:[{photoIndex:1,panel:'chik-chok-original-label'}]}];
 const result=manualOnlyResults(products,{allergens:['egg','milk','wheat','soy','peanut']},matches).products[0];
 assert.equal(result.status,'conflict');
 assert.deepEqual(new Set(result.direct_matches.map(x=>x.allergen_id)),new Set(['egg','milk','wheat','soy','peanut']));
 assert.ok(result.direct_matches.some(x=>x.term==='달걀'&&x.photoIndex===1));
 assert.deepEqual(result.manual_photo_reference.packageSizes,[120,180]);
 assert.equal(result.sources[0].items[0].text,'밀, 우유, 대두, 달걀, 땅콩 함유');
 assert.equal(manualOnlyResults(products,{allergens:['fish']},matches).products[0].status,'unverified');
});
test('fingerprint pixel samples are deterministic, no photo storage',()=>{
 const p32=new Uint8ClampedArray(32*32*4).fill(128),p9=new Uint8ClampedArray(9*8*4).fill(128);
 const a=fingerprintFromPixels(p32,p9),b=fingerprintFromPixels(p32,p9);
 assert.deepEqual(a,b);assert.match(a.phash,/^[0-9a-f]{16}$/);assert.match(a.dhash,/^[0-9a-f]{16}$/);
});
