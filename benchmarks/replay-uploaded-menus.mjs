// Re-evaluate saved actual OCR words after a menu-parser-only change. This is
// deliberately labeled a replay: no new image recognition or latency claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {evaluateMenu} from '../src/menu.js';
import {loadUserMenus,summarizeUserMenus} from './user-menu-evidence.mjs';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--inventory','--references','--input','--output'])if(!args.includes(name)||!arg(name))throw Error('Missing '+name);
const root=path.resolve(import.meta.dirname,'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {records,dataset_sha256}=await loadUserMenus(arg('--inventory'),arg('--references'));
const parent=JSON.parse(await fs.readFile(path.join(arg('--input'),'metadata.json'))),bytes=await fs.readFile(path.join(arg('--input'),'predictions.jsonl'));
if(parent.dataset_sha256!==dataset_sha256)throw Error('Reference dataset changed');
for(const [file,digest] of Object.entries(parent.sha256))if((file.startsWith('src/')&&file!=='src/menu.js')||file==='package-lock.json')
 if(hash(await fs.readFile(path.join(root,file)))!==digest)throw Error('OCR/engine input changed: '+file+'; run image recognition again');
const predictions=bytes.toString().trim().split('\n').map(JSON.parse).map(p=>{
 if(!Array.isArray(p.sources)||!p.sources.length)throw Error('Cannot replay a missing OCR result');
 const start=performance.now(),result=evaluateMenu({sources:p.sources,profile:parent.profile,errors:p.ocr_errors||p.errors||[]});
 return {...p,...result,parser_replay_ms:performance.now()-start};
});
if(predictions.length!==records.length)throw Error('Incomplete parent run');
const summary=summarizeUserMenus(records,predictions),out=path.resolve(arg('--output'));
await fs.mkdir(out); // Refuse to overwrite a prior run.
const metadata={...parent,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 evaluation_replay:{method:'Menu parser replay over immutable actual OCR words; no new image recognition',parent_ocr_commit:parent.commit,parent_predictions_sha256:hash(bytes),menu_evaluator_sha256:hash(await fs.readFile(path.join(root,'src/menu.js'))),finished_utc:new Date().toISOString()},
 latency:'latency_ms is the parent full image run, before the final numeric/blank-title guard; parser_replay_ms is measured separately, not a new end-to-end measurement'};
await fs.writeFile(path.join(out,'predictions.jsonl'),predictions.map(p=>JSON.stringify(p)).join('\n')+'\n');
await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({captures:summary.capture_count,titles:summary.matched_titles,known_pairs:summary.confident_known_pairs,unsafe_outputs:summary.unsafe_outputs}));
if(summary.unsafe_outputs)process.exitCode=1;
