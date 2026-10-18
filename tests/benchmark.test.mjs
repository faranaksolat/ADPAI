import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluatePredictions,validateRecords,loadDataset,editDistance} from '../benchmarks/evaluate.mjs';
const reference=()=>({product_id:'p1',family_id:'family1',capture_id:'c1',language:'ko',split:'development',kind:'synthetic',
  annotation:{status:'single_review',reviewers:['fixture-author']},
  images:[{path:'label.png',sha256:'a'.repeat(64),transcript:'우유 함유',source_url:'generated:fixture',license:'CC0-1.0',attribution:'fixture-author'}],
  ingredients:['우유'],direct_allergens:['milk'],caution_allergens:[],required_abstention:false});
test('an abstention and a missing prediction remain missed allergens, never successful negatives',()=>{
  const rows=[reference()];
  const report=evaluatePredictions(rows,[]);
  assert.equal(report.allergens.any.recall,0);assert.equal(report.missed_positive_pairs,1);
  assert.equal(report.missing_predictions,1);assert.equal(report.abstention_count,1);assert.equal(report.unsafe_negative_captures,0);
  assert.equal(report.allergens.any.false_negative_rate,1);assert.equal(report.allergens.any.tn,8);
  assert.equal(report.ocr.cer,1);assert.equal(report.successful_latency_ms.p95,null);
  const unsafe=evaluatePredictions(rows,[{capture_id:'c1',status:'safe',direct_allergens:[],caution_allergens:[]}]);
  assert.equal(unsafe.unsafe_negative_captures,1);
});
test('wrong precaution context, false positives and synthetic validity are explicit',()=>{
  const row=reference();row.direct_allergens=[];row.caution_allergens=['milk'];
  const report=evaluatePredictions([row],[{capture_id:'c1',status:'conflict',direct_allergens:['milk','soy'],caution_allergens:[],ingredients:['우유'],transcripts:['우유 함유'],latency_ms:20}]);
  assert.equal(report.allergens.any.recall,1);assert.equal(report.allergens.any.fp,1);
  assert.equal(report.allergens.any.tn,7);assert.equal(report.allergens.any.false_positive_rate,1/8);
  assert.equal(report.per_allergen.soy.false_positive_rate,1);
  assert.equal(report.per_allergen.milk.false_positive_rate,null);
  assert.equal(report.allergens.direct.fp,2);assert.equal(report.allergens.caution.fn,1);
  assert.equal(report.ocr.cer,0);assert.equal(report.ingredients_exact_rows.f1,1);
  assert.equal(report.real_package_capture_count,0);assert.ok(report.validity.startsWith('synthetic'));
});
test('zero tests, unreviewed labels, invalid statuses and split leakage cannot pass',()=>{
  assert.throws(()=>evaluatePredictions([],[]),/empty/u);
  assert.throws(()=>validateRecords([]),/zero-image/u);
  assert.throws(()=>validateRecords([reference()]),/Unreviewed/u);
  validateRecords([reference()],{allowProvisional:true});
  const leaked={...reference(),capture_id:'c2',split:'holdout'};
  assert.throws(()=>validateRecords([reference(),leaked],{allowProvisional:true}),/leaks/u);
  assert.throws(()=>evaluatePredictions([reference()],[{capture_id:'c1',status:'probably_ok'}]),/Unknown/u);
  const fake=reference();fake.annotation.status='adjudicated';
  assert.throws(()=>validateRecords([fake]),/two distinct/u);
  assert.equal(editDistance([...'우유'],[...'두유']),1);
});
test('dataset loading rejects changed image bytes and symlinks outside the dataset',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-dataset-test-'));
  try {
    const data=path.join(root,'data');await fs.mkdir(data);
    const image=Buffer.from('fixture bytes; this test only verifies provenance integrity');
    const row=reference();row.images[0].sha256=createHash('sha256').update(image).digest('hex');
    const manifest=path.join(data,'labels.jsonl');
    await fs.writeFile(manifest,JSON.stringify(row)+'\n');
    await fs.writeFile(path.join(data,'label.png'),image);
    assert.equal((await loadDataset(manifest,{allowProvisional:true})).records.length,1);
    await fs.writeFile(path.join(data,'label.png'),'changed');
    await assert.rejects(loadDataset(manifest,{allowProvisional:true}),/checksum mismatch/u);
    await fs.rm(path.join(data,'label.png'));
    await fs.writeFile(path.join(root,'outside.png'),image);
    await fs.symlink(path.join(root,'outside.png'),path.join(data,'label.png'));
    await assert.rejects(loadDataset(manifest,{allowProvisional:true}),/escapes/u);
  } finally {await fs.rm(root,{recursive:true,force:true})}
});
