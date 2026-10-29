// Compare frozen synthetic development captures, never a clinical accuracy claim.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [baselineFile,currentFile,output]=process.argv.slice(2);
if(!baselineFile||!currentFile||!output)throw Error('Usage: node benchmarks/compare-cosmetics.mjs BASELINE.json CURRENT.json OUTPUT.json');
const buffers=await Promise.all([baselineFile,currentFile].map(file=>fs.readFile(file)));
const [baseline,current]=buffers.map(bytes=>JSON.parse(bytes));
for(const report of [baseline,current]){
 if(report.physical_device_tests!==0||report.real_product_images!==0||report.clinical_validation!==false||!report.results?.length)throw Error('Expected authored non-clinical development reports');
 const ids=report.results.map(r=>r.card);if(new Set(ids).size!==ids.length)throw Error('Duplicate capture');
 for(const r of report.results){
  if(!Number.isInteger(r.expected)||r.expected<1||r.recovered!==r.expected-r.missed.length||new Set(r.missed).size!==r.missed.length||r.context_verified_recovered>r.recovered||!/^[a-f0-9]{64}$/u.test(r.fixture_sha256))throw Error('Invalid recovery record');
 }
}
if(baseline.results.length!==current.results.length)throw Error('Different capture counts');
for(const file of ['tests/real-cosmetic-ocr.mjs','benchmarks/cosmetics-cards.mjs'])if(baseline.source_sha256?.[file]!==current.source_sha256?.[file])throw Error('Evaluator/reference changed: '+file);
const pairs=current.results.map(row=>{
 const previous=baseline.results.find(r=>r.card===row.card);
 if(!previous||previous.fixture_sha256!==row.fixture_sha256||previous.expected!==row.expected||previous.language!==row.language)throw Error('Fixture or reference changed: '+row.card);
 return {baseline:previous,current:row};
});
const sum=(rows,key)=>rows.reduce((n,row)=>n+row[key],0);
const median=values=>{const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2};
const summarize=rows=>({expected:sum(rows,'expected'),names_available_for_explanation:sum(rows,'recovered'),names_in_verified_ingredient_context:sum(rows,'context_verified_recovered'),
 missing_names:rows.reduce((n,r)=>n+r.missed.length,0),additional_identity_predictions:rows.reduce((n,r)=>n+r.additional_identity_predictions.length,0),
 additional_context_verified_predictions:rows.reduce((n,r)=>n+r.context_verified_additional.length,0),observed_desktop_median_ms:median(rows.map(r=>r.elapsed_ms))});
const result={schema:'adpai-cosmetic-development-comparison-v1',scope:'authored_development_cards_not_real_product_or_independent_holdout_accuracy',
 clinical_validation:false,real_product_images:0,physical_device_tests:0,global_accuracy_estimate:null,
 input_sha256:buffers.map(buffer=>createHash('sha256').update(buffer).digest('hex')),
 capture_count:pairs.length,identical_fixture_hashes:true,baseline:summarize(baseline.results),current:summarize(current.results),
 languages:Object.fromEntries([...new Set(current.results.map(r=>r.language))].map(language=>[language,{baseline:summarize(baseline.results.filter(r=>r.language===language)),current:summarize(current.results.filter(r=>r.language===language))}])),
 recognition_gate_passed:current.release_gate_passed,notes:['Names can be explained while their ingredient-panel context remains uncertain; this is not absence-of-allergen testing.','Deliberately unregistered strings, where present, are negative vocabulary controls, not real ingredients.','Cache state was not measured; timings are a small desktop development observation, not phone latency.','The data were used during development; no independent human reference or held-out market benchmark is claimed.'],
 cases:pairs.map(({baseline:a,current:b})=>({card:b.card,language:b.language,fixture_sha256:b.fixture_sha256,expected:b.expected,before:a.recovered,after:b.recovered,context_verified_before:a.context_verified_recovered,context_verified_after:b.context_verified_recovered,still_missing:b.missed,additional:b.additional_identity_predictions}))};
await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({before:result.baseline,current:result.current,gate_passed:result.recognition_gate_passed}));
