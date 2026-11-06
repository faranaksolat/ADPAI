import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBarcode,validGTIN,normalizeOFFResponse,statusFor,recentItems,safeStoredList} from '../src/barcode-core.js';
const code='8801791000055';
test('GTIN check digit and non-digit rejection',()=>{
 assert.equal(validGTIN(code),true);assert.equal(validGTIN(code.slice(0,-1)+'4'),false);
 assert.equal(validGTIN('8801234567890'),false);assert.equal(validGTIN('3017620422003'),true);
 assert.equal(validGTIN(''),false);assert.equal(validGTIN('880a791000055'),false);
});
test('normalize spaces and hyphens',()=>{assert.equal(normalizeBarcode(' 8801-791000055 '),code);assert.equal(validGTIN('8801 791000055'),true)});
test('never infer Korean manufacture from GTIN',()=>{
 const p=normalizeOFFResponse(code,{status:1,product:{code,product_name_ko:'테스트',ingredients_text_ko:'밀, 우유'}});
 assert.equal(p.marketConfirmed,false);assert.equal(p.manufactureVerified,false);
 assert.equal(p.ingredients,'밀, 우유');assert.equal(statusFor(p,1),'CONFLICT');
});
test('country tags indicate market, not manufacture',()=>{
 const p=normalizeOFFResponse(code,{status:1,product:{code,countries_tags:['en:south-korea'],ingredients_text:'wheat'}});
 assert.equal(p.marketConfirmed,true);assert.equal(p.manufactureVerified,false);
 assert.equal(statusFor(p,0,1),'CAUTION');assert.equal(statusFor(p),'UNVERIFIED');
});
test('reject mismatched product identifiers',()=>assert.throws(()=>normalizeOFFResponse(code,{status:1,product:{code:'3017620422003'}}),/BARCODE_MISMATCH/));
test('no record is not a safe result',()=>assert.equal(normalizeOFFResponse(code,{status:0}),null));
test('recent barcodes deduplicate and invalid JSON fails closed',()=>{
 const item={barcode:code,name:'테스트'};assert.deepEqual(recentItems([item],item),[item]);
 assert.deepEqual(safeStoredList('not json'),[]);assert.deepEqual(safeStoredList(JSON.stringify([{barcode:'abc',name:'invalid'},item])),[item]);
});

test('barcode-only API record is not falsely presented as a found product',()=>{
 assert.equal(normalizeOFFResponse(code,{status:1,product:{code}}),null);
});

test('real export GTIN example cannot claim a Korean-market formula',()=>{
 const code='8801043150620'; // independently identified Nongshim export package
 const record=normalizeOFFResponse(code,{status:1,product:{code,product_name:'Shin Ramyun Instant Noedels',ingredients_text:'Tarwebloem, soja',countries_tags:['en:netherlands']}});
 assert.equal(record.regionalLabelUnverified,true);
 assert.equal(record.marketConfirmed,false);
 assert.equal(record.manufactureVerified,false);
 assert.equal(record.completeness,'CROWDSOURCED_UNVERIFIED_LABEL');
 assert.equal(statusFor(record), 'UNVERIFIED');
});
test('Korean-market listing without a Korean ingredient panel is still regional-unverified',()=>{
 const code='8801043150620';
 const record=normalizeOFFResponse(code,{status:1,product:{code,product_name:'Shin Ramyun',ingredients_text:'wheat',countries_tags:['en:south-korea']}});
 assert.equal(record.marketConfirmed,true);
 assert.equal(record.regionalLabelUnverified,true);
});
test('a Korean OCR-like field is not proof of manufacture or package completeness',()=>{
 const code='8801043150620';
 const record=normalizeOFFResponse(code,{status:1,product:{code,product_name_ko:'신라면',ingredients_text_ko:'밀, 대두',countries_tags:['en:south-korea']}});
 assert.equal(record.regionalLabelUnverified,false);
 assert.equal(record.manufactureVerified,false);
 assert.equal(statusFor(record), 'UNVERIFIED');
});
