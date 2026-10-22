// Exploratory restaurant-menu diagnostic through the actual app OCR and menu evaluator.
// Model-visual references are not independent human ground truth; no recipe inference.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {ALLERGEN_IDS} from './evaluate.mjs';
import {loadMenuEvidence as loadDataset,summarizeMenus as evaluatePredictions} from './menu-evidence.mjs';
import {loadUserMenus,summarizeUserMenus} from './user-menu-evidence.mjs';

const args=process.argv.slice(2);
function arg(name,fallback) {const i=args.indexOf(name);return i<0?fallback:args[i+1]}
const uploaded=arg('--upload-inventory');
if(!arg('--dataset')&&!uploaded)throw new Error('Usage: node benchmarks/diagnose-menu.mjs --dataset manifest.jsonl OR --upload-inventory inventory.json --references references.json --output NEW-results');
if(uploaded&&!arg('--references'))throw Error('Uploaded diagnostics require references frozen before OCR');
const loadChosenDataset=()=>uploaded?loadUserMenus(uploaded,arg('--references')):loadDataset(arg('--dataset'));
const score=uploaded?summarizeUserMenus:evaluatePredictions;
const diagnosticProfile={allergens:ALLERGEN_IDS,...(uploaded?{dietary_preferences:['avoid_pork','avoid_beef','vegetarian']}:{})};
const repoRoot=path.resolve(import.meta.dirname,'..');
const root=path.resolve(arg('--app-root',repoRoot));
const snapshot=JSON.parse(await fs.readFile(path.join(root,'source-snapshot.json'),'utf8').catch(()=>'{"commit":null}'));
const filePath=file=>path.join(file.startsWith('dist/')||file.startsWith('benchmarks/')?repoRoot:root,file);
const {records:all,root:dataRoot,dataset_sha256}=await loadChosenDataset();
const captures=arg('--captures')?.split(',');
const records=all.filter(x=>(!arg('--split')||x.split===arg('--split'))&&(!captures||captures.includes(x.capture_id)));
if(captures&&(new Set(captures).size!==captures.length||captures.some(id=>!all.some(x=>x.capture_id===id))))throw Error('Unknown/duplicate selected capture');
if(!records.length)throw new Error('Selected split has zero images.');
const out=path.resolve(arg('--output','benchmarks/results/latest'));
const sourceFiles=[...(await fs.readdir(path.join(root,'src'))).filter(x=>x.endsWith('.js')).map(x=>'src/'+x),'package-lock.json','benchmarks/diagnose-menu.mjs','benchmarks/menu-evidence.mjs','benchmarks/user-menu-evidence.mjs','benchmarks/evaluate.mjs','dist/vendor/tesseract/tesseract.min.js','dist/vendor/tesseract/worker.min.js','dist/vendor/tessdata/kor.traineddata','dist/vendor/tessdata/eng.traineddata','dist/vendor/tessdata/fra.traineddata'];
const fingerprints=async()=>{
  const sha256={};
  for(const file of sourceFiles)sha256[file]=createHash('sha256').update(await fs.readFile(filePath(file))).digest('hex');
  return sha256;
};
const timeout=Number(arg('--timeout-ms','240000'));
if(!Number.isFinite(timeout)||timeout<1000)throw new Error('Invalid timeout');
await fs.access(path.join(repoRoot,'dist/vendor/tesseract/tesseract.min.js')).catch(()=>{throw new Error('Run npm run build:mobile first to prepare the official local OCR models.')});
const initialHashes=await fingerprints();
for(const [name,digest] of Object.entries(snapshot.sha256||{})){if(initialHashes[name]&&initialHashes[name]!==digest)throw Error("Snapshot hash mismatch: "+name)}
await fs.mkdir(out,{recursive:true});
for(const name of ['predictions.jsonl','summary.json','metadata.json']) {
  try {await fs.access(path.join(out,name));throw new Error(`Output already exists: ${name}; use a new output directory.`)}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
// Build scripts replace dist/ atomically. Serve a verified private snapshot so
// a concurrent mobile build cannot remove a worker/model midway through OCR.
const vendorSnapshot=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-benchmark-vendor-'));
await fs.cp(path.join(repoRoot,'dist/vendor'),vendorSnapshot,{recursive:true});
for(const file of sourceFiles.filter(file=>file.startsWith('dist/vendor/'))){
  const bytes=await fs.readFile(path.join(vendorSnapshot,file.slice('dist/vendor/'.length)));
  if(createHash('sha256').update(bytes).digest('hex')!==initialHashes[file])throw Error('Vendor snapshot changed during copy');
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
      file=path.resolve(vendorSnapshot,decodeURIComponent(url.pathname.slice((prefix+'vendor/').length)));
      if(!file.startsWith(vendorSnapshot+path.sep))throw new Error('Outside vendor');
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
        const {evaluateMenu}=await import('./src/menu.js?v=${version}');
        const imageNames=${JSON.stringify(row.images.map(x=>x.path))};
        const photos=await Promise.all(imageNames.map(async(name,index)=>{
          const response=await fetch('/dataset?path='+encodeURIComponent(name));if(!response.ok)throw new Error('Image unavailable');
          const blob=await response.blob();return {file:new File([blob],'label-'+index,{type:blob.type})};
        }));
        const start=performance.now();let timer;
        try {
          globalThis.ADPAI_DIAGNOSTIC_PROGRESS=[];
          const result=await Promise.race([analyzeProducts([{id:1,photos}],${JSON.stringify(diagnosticProfile)},{purpose:'menu',nativeReader:null,onProgress:message=>globalThis.ADPAI_DIAGNOSTIC_PROGRESS.push({message,elapsed_ms:performance.now()-start})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('analysis_timeout')),${timeout})})]);
          const p=result.products[0];
          const menu=evaluateMenu({sources:p.sources,profile:${JSON.stringify(diagnosticProfile)},errors:p.errors});
          return {...menu,progress:globalThis.ADPAI_DIAGNOSTIC_PROGRESS,latency_ms:performance.now()-start,ocr_errors:p.errors,sources:p.sources,error:p.sources.some(s=>s.items.some(x=>x.text.trim()))?null:'no_text_read'};
        } finally {clearTimeout(timer)}
      })()`});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      prediction={capture_id:row.capture_id,cache_state:index===0?'first_call':'subsequent_call',...result.result.value};
    } catch(error) {
      const diagnostic=await send('Runtime.evaluate',{returnByValue:true,expression:'globalThis.ADPAI_DIAGNOSTIC_PROGRESS||[]'}).catch(()=>null);
      prediction={progress:diagnostic?.result?.value||[],capture_id:row.capture_id,status:'unverified',items:[],unassigned:[],safe_items:[],elapsed_until_failure_ms:Date.now()-callStarted,error:String(error.message||error)};
      // Destroy the old page/workers; a timed-out inference must not continue
      // consuming memory or contaminate the next capture's timing.
      await loadPage();
    }
    predictions.push(prediction);
    await fs.appendFile(path.join(out,'predictions.jsonl'),JSON.stringify(prediction)+'\n');
    console.log(`${index+1}/${records.length} ${row.capture_id}: ${prediction.status}${prediction.error?' (failure)':''}`);
  }
  const summary=score(records,predictions);
  summary.by_split=Object.fromEntries([...new Set(records.map(x=>x.split))].map(split=>{
    const selected=records.filter(x=>x.split===split),ids=new Set(selected.map(x=>x.capture_id));
    return [split,score(selected,predictions.filter(x=>ids.has(x.capture_id)))];
  }));
  const sha256=await fingerprints();
  for(const file of sourceFiles)if(sha256[file]!==initialHashes[file])throw new Error(`Source/model changed during benchmark: ${file}; this run is incomplete.`);
  const finalDataset=await loadChosenDataset();
  if(finalDataset.dataset_sha256!==dataset_sha256)throw new Error('Dataset changed during benchmark; this run is incomplete.');
  let commit='unknown',dirty=true;
  try {commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()}catch{}
  const metadata={started_utc:started,finished_utc:new Date().toISOString(),commit:snapshot.commit||commit,execution_repository_commit:commit,working_tree_dirty:dirty,app_root:root,reference_method:"model_visual_not_independent_human",source_snapshot:snapshot,app_version:version,dataset_sha256,
    browser:await send('Browser.getVersion'),platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,total_memory_bytes:os.totalmem(),
    implementation:'shipped analyzeProducts(purpose:menu) + evaluateMenu with bundled official models; no camera/UI timing',
    profile:diagnosticProfile,network:'external HTTPS blocked; experimental fallback downloads may fail and are recorded',
    latency:'one menu capture per call; includes preprocessing, worker/model initialization, rotations and retries; excludes image loading, camera and model downloads; desktop timings are not phone timings',timeout_ms:timeout,sha256};
  await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({output:out,validity:summary.validity,captures:summary.capture_count,detected:summary.detected_known_pairs,missed:summary.missed_known_pairs,unsafe_outputs:summary.unsafe_outputs}));
  if(predictions.some(x=>x.error)||summary.unsafe_outputs)process.exitCode=1;
} finally {
  socket?.close();chrome.kill();if(chrome.exitCode==null)await once(chrome,'exit');server.close();
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
  await fs.rm(vendorSnapshot,{recursive:true,force:true,maxRetries:3});
}
