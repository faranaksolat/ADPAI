import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateB2CPilot} from '../src/pilot-metrics.js';
const review=(risk)=>({adjudicated:true,photoSha256:'c'.repeat(64),reviewers:['r1','r2'],risk});
test('misses, missing scans and abstentions stay in positive denominator',()=>{
 const report=evaluateB2CPilot({cases:[
  {reference:review('direct'),observed:{barcodeRead:true,status:'conflict',latencyMs:1500,catalogSource:'adpai-reviewed-korean-label'}},
  {reference:review('direct'),observed:{barcodeRead:false,status:'unverified',latencyMs:8000}},
  {reference:review('caution'),observed:{}},
  {reference:review('none'),observed:{barcodeRead:true,status:'no_listed_conflict',latencyMs:2000}},
  {reference:{risk:'direct',adjudicated:false},observed:{status:'conflict'}}
 ]});
 assert.equal(report.eligible,4);
 assert.equal(report.unreviewed,1);
 assert.equal(report.rates.directRecallPercent,50);
 assert.equal(report.rates.cautionRecallPercent,0);
 assert.equal(report.missingObservations,1);
 assert.equal(report.rates.barcodeReadPercent,50);
 assert.equal(report.rates.p95Ms,8000);
});
test('unsafe reassurance is flagged when known-positive ground truth gets a negative',()=>{
 const report=evaluateB2CPilot({cases:[{reference:review('direct'),observed:{status:'no_listed_conflict'}}]});
 assert.equal(report.unsafeNegativeOnPositive,1);
 assert.equal(report.missedDirect,1);
});
test('empty or non-adjudicated data never fabricates accuracy',()=>{
 const report=evaluateB2CPilot({cases:[]});
 assert.equal(report.rates.directRecallPercent,null);
 assert.equal(report.rates.barcodeReadPercent,null);
});
