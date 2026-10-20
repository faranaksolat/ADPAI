// Rule-only replay of saved OCR words. This never runs an OCR engine or a UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateMenu} from '../src/menu.js';
import {ALLERGEN_IDS} from './evaluate.mjs';
import {loadMenuEvidence,summarizeMenus} from './menu-evidence.mjs';

const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--dataset','--predictions','--output'])if(!args.includes(name)||!arg(name))throw Error('Usage: node benchmarks/replay-menu.mjs --dataset manifest.jsonl --predictions saved.jsonl --output NEW-directory');
const {records,dataset_sha256}=await loadMenuEvidence(arg('--dataset'));
const bytes=await fs.readFile(arg('--predictions'));
const raw=bytes.toString('utf8').split(/\r?\n/u).filter(x=>x.trim()).map(JSON.parse);
const predictions=raw.map(row=>({capture_id:row.capture_id,
  ...evaluateMenu({sources:row.sources||[],profile:{allergens:ALLERGEN_IDS},errors:row.ocr_errors||(row.error?[{message:row.error}]:[])}),
  sources:row.sources||[],error:row.error||null,ocr_errors:row.ocr_errors||[],latency_ms:null}));
const summary=summarizeMenus(records,predictions);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=path.resolve(import.meta.dirname,'..'),files=['src/menu.js','src/engine.js','src/ontology.js','src/label-pattern.js','benchmarks/replay-menu.mjs','benchmarks/menu-evidence.mjs'];
const metadata={kind:'saved-word rule replay; no new OCR, camera, UI or latency measurement',dataset_sha256,
  input_path:path.resolve(arg('--predictions')),input_sha256:sha(bytes),source_sha256:{}};
for(const file of files)metadata.source_sha256[file]=sha(await fs.readFile(path.join(root,file)));
await fs.mkdir(arg('--output'),{recursive:false});
await fs.writeFile(path.join(arg('--output'),'predictions.jsonl'),predictions.map(x=>JSON.stringify(x)).join('\n')+'\n');
await fs.writeFile(path.join(arg('--output'),'summary.json'),JSON.stringify(summary,null,2)+'\n');
await fs.writeFile(path.join(arg('--output'),'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({kind:metadata.kind,detected:summary.detected_known_pairs,missed:summary.missed_known_pairs,unsafe_outputs:summary.unsafe_outputs}));
