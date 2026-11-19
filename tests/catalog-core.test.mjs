import test from 'node:test';
import assert from 'node:assert/strict';
import {findVerifiedKoreanProduct,verifiedKoreanRecord,auditKoreanCatalog} from '../src/catalog-core.js';
const barcode='8801043014830';
const record={
 barcode,market:'KR',productName:'테스트 제품',brand:'예시',packageVariant:'100 g / KR',
 ingredientsText:'밀가루, 우유, 대두',allergenDeclaration:'밀, 우유, 대두 함유',
 crossContactDeclaration:'땅콩 혼입 가능',
 evidence:{type:'physical-package',photoSha256:'a'.repeat(64),privatePhotoRef:'private/evidence/sha256-ref',capturedAt:'2026-11-09'},
 review:{status:'verified',verifiedAt:'2026-11-10',reviewers:['reviewer-a','reviewer-b']}
};
test('only double-reviewed Korean physical-label products become trusted',()=>{
 const p=verifiedKoreanRecord(record);
 assert.equal(p?.name,'테스트 제품');
 assert.equal(p?.regionalLabelUnverified,false);
 assert.equal(p?.manufactureVerified,false);
 assert.equal(p?.completeness,'HUMAN_REVIEWED_PHYSICAL_LABEL');
});
test('unreviewed and synthetic catalog candidates never surface as verified',()=>{
 for(const changed of [
  {...record,market:'NL'}, {...record,barcode:'invalid'}, 
  {...record,review:{...record.review,reviewers:['same','same']}},
  {...record,review:{...record.review,status:'pending'}},
  {...record,evidence:{...record.evidence,type:'manufacturer-website'}},
  {...record,evidence:{...record.evidence,photoSha256:'bad'}}
 ])assert.equal(verifiedKoreanRecord(changed),null);
});
test('catalog handles missing, duplicate and invalid review without false mapping',()=>{
 const catalog={schemaVersion:1,records:[record]};
 assert.equal(findVerifiedKoreanProduct(catalog,barcode)?.source,'adpai-reviewed-korean-label');
 assert.equal(findVerifiedKoreanProduct(catalog,'3017620422003'),null);
 assert.equal(findVerifiedKoreanProduct({...catalog,records:[record,record]},barcode),null);
 assert.equal(findVerifiedKoreanProduct({...catalog,records:[{...record,review:{...record.review,status:'pending'}}]},barcode),null);
 assert.equal(auditKoreanCatalog(catalog).valid,true);
 assert.equal(auditKoreanCatalog({...catalog,records:[record,record]}).valid,false);
});
test('shipped catalog starts empty: no invented physically verified products',async()=>{
 const {readFile}=await import('node:fs/promises');
 const catalog=JSON.parse(await readFile('data/catalog-korea-verified.json','utf8'));
 assert.deepEqual(catalog.records,[]);
});

test('invalid calendar dates do not pass physical evidence validation',()=>{
 for(const date of ['2026-02-31','2026-13-01','2026-00-01']){
  assert.equal(verifiedKoreanRecord({...record,evidence:{...record.evidence,capturedAt:date}}),null,date);
 }
});
