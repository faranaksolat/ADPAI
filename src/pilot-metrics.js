// Only independently adjudicated physical-label cases count toward accuracy.
// Unknowns, failed scans and incomplete results stay in the denominator.
const expected=new Set(['direct','caution','none']);
const predicted=new Set(['conflict','caution','unverified','no_listed_conflict']);
const percent=(num,den)=>den?Math.round(num/den*10000)/100:null;
const quantile=(xs,p)=>xs.length?xs[Math.ceil(xs.length*p)-1]:null;
export function evaluateB2CPilot(input){
 const cases=Array.isArray(input?.cases)?input.cases:[];
 const report={submitted:cases.length,eligible:0,unreviewed:0,verifiedCatalog:0,
  barcodeRead:0,groundTruthDirect:0,groundTruthCaution:0,groundTruthNone:0,
  directDetected:0,cautionDetected:0,missedDirect:0,missedCaution:0,
  falseConflictsOnNone:0,unsafeNegativeOnPositive:0,unverifiedOutputs:0,
  missingObservations:0,latenciesMs:[]};
 for(const entry of cases){
  const ref=entry?.reference,obs=entry?.observed;
  const reviewed=ref?.adjudicated===true&&typeof ref?.photoSha256==='string'&&
    /^[a-f0-9]{64}$/i.test(ref.photoSha256)&&Array.isArray(ref.reviewers)&&
    ref.reviewers.length>=2&&new Set(ref.reviewers).size===ref.reviewers.length;
  if(!reviewed||!expected.has(ref?.risk)){report.unreviewed++;continue}
  report.eligible++;
  if(obs?.barcodeRead===true)report.barcodeRead++;
  if(obs?.catalogSource==='adpai-reviewed-korean-label')report.verifiedCatalog++;
  const status=predicted.has(obs?.status)?obs.status:null;
  if(!status)report.missingObservations++;
  if(status==='unverified')report.unverifiedOutputs++;
  if(Number.isFinite(obs?.latencyMs)&&obs.latencyMs>=0)report.latenciesMs.push(obs.latencyMs);
  if(ref.risk==='direct'){
   report.groundTruthDirect++;
   if(status==='conflict')report.directDetected++;else report.missedDirect++;
  }else if(ref.risk==='caution'){
   report.groundTruthCaution++;
   if(status==='caution')report.cautionDetected++;else report.missedCaution++;
  }else{
   report.groundTruthNone++;
   if(status==='conflict')report.falseConflictsOnNone++;
  }
  if(ref.risk!=='none'&&status==='no_listed_conflict')report.unsafeNegativeOnPositive++;
 }
 const xs=report.latenciesMs.sort((a,b)=>a-b);
 return {
  ...report,latenciesMs:undefined,
  rates:{
   barcodeReadPercent:percent(report.barcodeRead,report.eligible),
   reviewedCatalogCoveragePercent:percent(report.verifiedCatalog,report.eligible),
   directRecallPercent:percent(report.directDetected,report.groundTruthDirect),
   cautionRecallPercent:percent(report.cautionDetected,report.groundTruthCaution),
   falseConflictPercentOnKnownNone:percent(report.falseConflictsOnNone,report.groundTruthNone),
   unknownPercent:percent(report.unverifiedOutputs+report.missingObservations,report.eligible),
   p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95)
  },
  disclosure:'Only double-reviewed independent cases. A software test does not establish real-device or population accuracy.'
 };
}
