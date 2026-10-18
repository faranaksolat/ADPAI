// Real OCR through the exact shipped analyzeProducts adapter. Local official
// models make the baseline independent of CDN access; external HTTPS is blocked.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {ALLERGEN_IDS,loadDataset,evaluatePredictions} from './evaluate.mjs';
import {evaluateProduct} from '../src/engine.js';

const args=process.argv.slice(2);
function arg(name,fallback) {const i=args.indexOf(name);return i<0?fallback:args[i+1]}
if(!arg('--dataset'))throw new Error('Usage: node benchmarks/run.mjs --dataset path/labels.jsonl --output path/results [--allow-provisional] [--split holdout]');
const root=path.resolve(import.meta.dirname,'..');
const {records:all,root:dataRoot,dataset_sha256}=await loadDataset(arg('--dataset'),{allowProvisional:args.includes('--allow-provisional')});
const records=arg('--split')?all.filter(x=>x.split===arg('--split')):all;
if(!records.length)throw new Error('Selected split has zero images.');
const out=path.resolve(arg('--output','benchmarks/results/latest'));
const sourceFiles=['src/tesseract.js','src/image.js','src/engine.js','src/ontology.js','src/ingredients.js','src/ingredient-glossary.js','src/label-pattern.js','package-lock.json','benchmarks/run.mjs','benchmarks/evaluate.mjs','dist/vendor/tessdata/kor.traineddata','dist/vendor/tessdata/eng.traineddata','dist/vendor/tessdata/fra.traineddata'];
const fingerprints=async()=>{
  const sha256={};
  for(const file of sourceFiles)sha256[file]=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  return sha256;
};
const timeout=Number(arg('--timeout-ms','180000'));
if(!Number.isFinite(timeout)||timeout<1000)throw new Error('Invalid timeout');
await fs.access(path.join(root,'dist/vendor/tesseract/tesseract.min.js')).catch(()=>{throw new Error('Run npm run build:mobile first to prepare the official local OCR models.')});
const initialHashes=await fingerprints();
await fs.mkdir(out,{recursive:true});
for(const name of ['predictions.jsonl','summary.json','metadata.json']) {
  try {await fs.access(path.join(out,name));throw new Error(`Output already exists: ${name}; use a new output directory.`)}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const imagePaths=new Map(records.flatMap(row=>row.images.map(image=>[image.path,path.join(dataRoot,image.path)])));
const prefix='/ADPAI/';
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://local');
    let file;
    if(url.pathname==='/dataset') {
      file=imagePaths.get(url.searchParams.get('path'));
      if(!file)throw new Error('Image not in manifest');
    } else if(url.pathname===prefix+'benchmark.html') {
      res.setHeader('Content-Type','text/html');
      res.end(`<meta charset="utf-8"><script src="./vendor/tesseract/tesseract.min.js"></script><script>
        globalThis.ADPAI_OCR_OPTIONS=def=>({workerPath:new URL('./vendor/tesseract/worker.min.js',location.href).href,corePath:new URL('./vendor/tesseract-core/',location.href).href,...(def.langs.every(x=>['kor','eng','fra'].includes(x))?{langPath:new URL('./vendor/tessdata/',location.href).href,gzip:false}:{})});
      </script>`);return;
    } else if(url.pathname.startsWith(prefix+'src/')) {
      file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length)));
      if(!file.startsWith(path.join(root,'src')+path.sep))throw new Error('Outside source');
    } else if(url.pathname.startsWith(prefix+'vendor/')) {
      file=path.resolve(root,'dist',decodeURIComponent(url.pathname.slice(prefix.length)));
      if(!file.startsWith(path.join(root,'dist/vendor')+path.sep))throw new Error('Outside vendor');
    } else throw new Error('Not found');
    res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-benchmark-'));
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='',socket;
chrome.stderr.on('data',chunk=>stderr+=chunk);
const predictions=[];
const started=new Date().toISOString();
try {
  const deadline=Date.now()+20000;
  while(!/DevTools listening on (ws:\/\/\S+)/u.test(stderr)) {
    if(Date.now()>deadline||chrome.exitCode!=null)throw new Error('Chromium could not start: '+stderr);
    await new Promise(r=>setTimeout(r,50));
  }
  const ws=stderr.match(/DevTools listening on (ws:\/\/\S+)/u)[1];
  const targets=await(await fetch(new URL('/json/list',ws.replace('ws:','http:')))).json();
  socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let id=0;const pending=new Map(),listeners=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
  socket.addEventListener('message',({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}
    else for(const listener of listeners.get(m.method)||[])listener(m.params);
  });
  listeners.set('Fetch.requestPaused',[event=>send('Fetch.failRequest',{requestId:event.requestId,errorReason:'InternetDisconnected'}).catch(()=>{})]);
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
  const version=pkg.version;
  const loadPage=async()=>{
    const loaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}benchmark.html`});await loaded;
  };
  await loadPage();
  for(const [index,row] of records.entries()) {
    let prediction;
    const callStarted=Date.now();
    try {
      const result=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,timeout:timeout+5000,expression:`(async()=>{
        const {analyzeProducts}=await import('./src/tesseract.js?v=${version}');
        const {sourceTranscript}=await import('./src/ingredients.js?v=${version}');
        const imageNames=${JSON.stringify(row.images.map(x=>x.path))};
        const photos=await Promise.all(imageNames.map(async(name,index)=>{
          const response=await fetch('/dataset?path='+encodeURIComponent(name));if(!response.ok)throw new Error('Image unavailable');
          const blob=await response.blob();return {file:new File([blob],'label-'+index,{type:blob.type})};
        }));
        const start=performance.now();let timer;
        try {
          const result=await Promise.race([analyzeProducts([{id:1,photos}],{allergens:${JSON.stringify(ALLERGEN_IDS)}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('analysis_timeout')),${timeout})})]);
          const p=result.products[0];
          const transcripts=photos.map((_,photoIndex)=>sourceTranscript(p.sources.find(s=>s.photoIndex===photoIndex&&s.familyId==='korean'&&s.variant==='original')||{items:[]}).text);
          return {status:p.status,direct_allergens:[...new Set(p.direct_matches.map(x=>x.allergen_id))],caution_allergens:[...new Set(p.caution_matches.map(x=>x.allergen_id))],ingredients:p.ingredients.map(x=>x.original),transcripts,latency_ms:performance.now()-start,ocr_errors:p.errors,sources:p.sources,error:p.sources.some(s=>s.items.some(x=>x.text.trim()))?null:'no_text_read'};
        } finally {clearTimeout(timer)}
      })()`});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      prediction={capture_id:row.capture_id,cache_state:index===0?'first_call':'subsequent_call',...result.result.value};
    } catch(error) {
      prediction={capture_id:row.capture_id,status:'unverified',direct_allergens:[],caution_allergens:[],ingredients:[],transcripts:[],elapsed_until_failure_ms:Date.now()-callStarted,error:String(error.message||error)};
      // Destroy the old page/workers; a timed-out inference must not continue
      // consuming memory or contaminate the next capture's timing.
      await loadPage();
    }
    predictions.push(prediction);
    await fs.appendFile(path.join(out,'predictions.jsonl'),JSON.stringify(prediction)+'\n');
    console.log(`${index+1}/${records.length} ${row.capture_id}: ${prediction.status}${prediction.error?' (failure)':''}`);
  }
  const summary=evaluatePredictions(records,predictions);
  summary.by_split=Object.fromEntries([...new Set(records.map(x=>x.split))].map(split=>{
    const selected=records.filter(x=>x.split===split),ids=new Set(selected.map(x=>x.capture_id));
    return [split,evaluatePredictions(selected,predictions.filter(x=>ids.has(x.capture_id)))];
  }));
  // Semantic-only layer uses the independent manual reference, not OCR.
  const referencePredictions=records.map(row=>{
    const p=evaluateProduct({sources:row.images.map((image,photoIndex)=>({photoIndex,familyId:'korean',items:image.transcript.split('\n').map((text,lineId)=>({text,lineId,score:1}))})),profile:{allergens:ALLERGEN_IDS}});
    return {capture_id:row.capture_id,status:p.status,direct_allergens:p.direct_matches.map(x=>x.allergen_id),caution_allergens:p.caution_matches.map(x=>x.allergen_id),transcripts:row.images.map(x=>x.transcript),ingredients:[]};
  });
  const semantic=evaluatePredictions(records,referencePredictions);
  summary.reference_text_semantics={allergens:semantic.allergens,missed_positive_captures:semantic.missed_positive_captures,unsafe_negative_captures:semantic.unsafe_negative_captures};
  const sha256=await fingerprints();
  for(const file of sourceFiles)if(sha256[file]!==initialHashes[file])throw new Error(`Source/model changed during benchmark: ${file}; this run is incomplete.`);
  const finalDataset=await loadDataset(arg('--dataset'),{allowProvisional:args.includes('--allow-provisional')});
  if(finalDataset.dataset_sha256!==dataset_sha256)throw new Error('Dataset changed during benchmark; this run is incomplete.');
  let commit='unknown',dirty=true;
  try {commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()}catch{}
  const metadata={started_utc:started,finished_utc:new Date().toISOString(),commit,working_tree_dirty:dirty,app_version:version,dataset_sha256,
    browser:await send('Browser.getVersion'),platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,total_memory_bytes:os.totalmem(),
    implementation:'shipped analyzeProducts source adapter with bundled official models; no camera/UI timing',
    profile:{allergens:ALLERGEN_IDS},network:'external HTTPS blocked; experimental fallback downloads may fail and are recorded',
    latency:'one product per call; includes preprocessing, worker/model initialization, rotations and retries; excludes image loading, camera and model downloads; desktop timings are not phone timings',timeout_ms:timeout,sha256};
  await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({output:out,validity:summary.validity,real_images:summary.real_package_capture_count,cer:summary.ocr.cer,allergen_recall:summary.allergens.any.recall,missed_positive_pairs:summary.missed_positive_pairs,unsafe_negatives:summary.unsafe_negative_captures}));
  if(predictions.some(x=>x.error)||summary.reassuring_negative_captures)process.exitCode=1;
} finally {
  socket?.close();chrome.kill();if(chrome.exitCode==null)await once(chrome,'exit');server.close();
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
}
