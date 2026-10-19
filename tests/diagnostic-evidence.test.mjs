import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEvidence} from '../benchmarks/diagnostic-evidence.mjs';
const rows=[{capture_id:'one',language:'en',positive_evidence:[{allergen:'milk',context:'direct',quote:'contains milk'}]}];
test('diagnostic missing/abstaining predictions are misses, not a passing benchmark',()=>{
 const result=summarizeEvidence(rows,[]);
 assert.equal(result.missed_known_positive_pairs,1);assert.equal(result.human_reviewed_references,0);
 assert.equal(result.ocr_cer,null);assert.equal(result.false_positive_rate,null);
 assert.match(result.validity,/NOT_human_reference/u);
});
test('unlisted allergens stay unknown and wrong context stays visible',()=>{
 const result=summarizeEvidence(rows,[{capture_id:'one',status:'caution',direct_allergens:[],caution_allergens:['milk','soy']}]);
 assert.equal(result.detected_known_positive_pairs,1);assert.equal(result.cases[0].context_mismatches.length,1);
 assert.deepEqual(result.cases[0].additional_predictions_needing_review,['soy']);
 assert.equal(result.precision,null);
});
test('reassuring negatives, duplicate and foreign predictions are exposed',()=>{
 assert.equal(summarizeEvidence(rows,[{capture_id:'one',status:'safe'}]).reassuring_negative_captures,1);
 assert.throws(()=>summarizeEvidence(rows,[{capture_id:'other',status:'unverified'}]),/Invalid/u);
});
