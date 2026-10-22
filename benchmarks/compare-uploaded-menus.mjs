// Publish only aggregate counts and anonymous case IDs. Uploaded photographs,
// original filenames, reference transcripts and OCR dumps stay local.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadUserMenus,summarizeUserMenus} from './user-menu-evidence.mjs';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--inventory','--references','--before','--after','--output'])if(!args.includes(name)||!arg(name))throw Error('Missing '+name);
const {records,dataset_sha256}=await loadUserMenus(arg('--inventory'),arg('--references'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=['capture_count','known_title_count','matched_titles','raw_title_signals','known_positive_pairs','confident_known_pairs','warned_known_pairs','missed_warning_pairs','additional_item_titles_needing_review','empty_menu_count','unsafe_outputs','desktop_returned_latency_ms'];
async function readRun(root){
 const bytes=await fs.readFile(path.join(root,'predictions.jsonl'));
 const predictions=bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse),metadata=JSON.parse(await fs.readFile(path.join(root,'metadata.json')));
 if(metadata.dataset_sha256!==dataset_sha256||predictions.length!==records.length)throw Error('Incompatible/incomplete dataset run');
 const summary=summarizeUserMenus(records,predictions);
 return {app_version:metadata.app_version,commit:metadata.commit,source_sha256:metadata.sha256,started_utc:metadata.started_utc,finished_utc:metadata.finished_utc,
  predictions_sha256:sha(bytes),metrics:Object.fromEntries(fields.map(key=>[key,summary[key]])),failures:summary.cases.filter(c=>c.error).length,
  cases:summary.cases.map(c=>({capture_id:c.capture_id,known_titles:c.known_title_count,matched_titles:c.matched_titles,raw_title_signals:c.raw_title_signals,known_positive_pairs:c.known_positive_pairs,confident_pairs:c.confident_pairs,warned_pairs:c.warned_pairs,additional_titles_needing_review:c.additional_item_titles_needing_review,ocr_error_count:c.ocr_errors.length,latency_ms:c.latency_ms,error:c.error?'analysis_failed':null}))};
}
const result={validity:'Partial model-visual development references; not independent human ground truth, not a holdout accuracy or safety validation.',
 dataset_sha256,scorer_sha256:sha(await fs.readFile(new URL('./user-menu-evidence.mjs',import.meta.url))),
 privacy:'No source images, original filenames, reference text or OCR transcripts in this report.',
 definitions:{matched_titles:'Exact printed alias after case, Unicode, spacing and punctuation normalization. Missing predictions remain misses.',
  confident_known_pairs:'A referenced dish and risk pair with the same printed title; allergen word score >= .58 and not uncertain, or dietary kind conflict. Uncalibrated OCR heuristic, not a probability.',
  warned_known_pairs:'Same-dish referenced risk pair with any matching warning, including uncertainty and unknown dietary source. This is not confirmed ingredient identification.',
  additional_item_titles_needing_review:'Predicted titles outside the partial reference list. Includes legitimate unannotated items, duplicates and OCR noise; cannot be called false positives.',
  latency:'Desktop call time, including preprocessing, initialization/retries; excludes camera, transfer and model downloads. Not physical-phone timing.'},
 before:await readRun(arg('--before')),after:await readRun(arg('--after'))};
await fs.writeFile(arg('--output'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({before:result.before.metrics,after:result.after.metrics},null,2));
if(result.before.failures||result.after.failures||result.after.metrics.unsafe_outputs)process.exitCode=1;
