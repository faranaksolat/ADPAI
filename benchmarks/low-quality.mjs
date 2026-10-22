// Compare a frozen source snapshot with the candidate using real bundled OCR.
// Generated EN/KO text has known references. No real-food/native accuracy claim.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {editDistance} from './evaluate.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
if(!arg('--baseline')||!arg('--output'))throw Error('Usage: node benchmarks/low-quality.mjs --baseline frozen-source-directory --output NEW-directory [--budget-ms 45000]');
const repo=path.resolve(import.meta.dirname,'..'),baseline=path.resolve(arg('--baseline')),out=path.resolve(arg('--output')),budget=Number(arg('--budget-ms',45000));
if(!Number.isFinite(budget)||budget<1000)throw Error('Invalid photo budget');
await fs.mkdir(out);await fs.mkdir(path.join(out,'fixtures'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshots=async()=>{
 const result={};for(const [name,root] of [['baseline',baseline],['candidate',repo]]){
  result[name]={};for(const file of (await fs.readdir(path.join(root,'src'))).filter(x=>x.endsWith('.js')))result[name][file]=sha(await fs.readFile(path.join(root,'src',file)));
 }return result;
};
const before=await snapshots(),versions={baseline:JSON.parse(await fs.readFile(path.join(baseline,'package.json'))).version,candidate:JSON.parse(await fs.readFile(path.join(repo,'package.json'))).version};
const server=http.createServer(async(req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://local').pathname);let file;
  if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><script type="module" src="/runner.js"></script>');return}
  if(p==='/runner.js')file=path.join(repo,'benchmarks/low-quality-browser.js');
  else{
   const routes=[['/baseline/src/',path.join(baseline,'src')],['/candidate/src/',path.join(repo,'src')],['/vendor/',path.join(repo,'dist/vendor')],['/fixture/',path.join(out,'fixtures')]];
   const route=routes.find(([prefix])=>p.startsWith(prefix));if(!route)throw Error('Unserved path');
   file=path.resolve(route[1],p.slice(route[0].length));if(!file.startsWith(route[1]+path.sep))throw Error('Outside root');
  }
  res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end()}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const userData=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-quality-'));
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${userData}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='',socket;chrome.stderr.on('data',x=>stderr+=x);
try{
 const deadline=Date.now()+20000;while(!/DevTools listening on (ws:\/\/\S+)/u.test(stderr)){if(Date.now()>deadline||chrome.exitCode!=null)throw Error('Chromium startup failed');await new Promise(r=>setTimeout(r,50))}
 const ws=stderr.match(/DevTools listening on (ws:\/\/\S+)/u)[1],targets=await(await fetch(new URL('/json/list',ws.replace('ws:','http:')))).json();
 socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let counter=0;const pending=new Map(),listeners=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else for(const fn of listeners.get(m.method)||[])fn(m.params)});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:budget+90000});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await send('Page.enable');await send('Runtime.enable');
 listeners.set('Fetch.requestPaused',[e=>send('Fetch.failRequest',{requestId:e.requestId,errorReason:'InternetDisconnected'}).catch(()=>{})]);await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
 const loaded=new Promise(r=>listeners.set('Page.loadEventFired',[r]));await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});await loaded;
 const fixtures=[];
 for(const language of ['en','ko'])for(const variant of ['clean','small','dim','blur','tilted']){
  const {png,...reference}=await evaluate(`makeQualityFixture(${JSON.stringify(language)},${JSON.stringify(variant)})`),id=language+'-'+variant,bytes=Buffer.from(png,'base64');
  await fs.writeFile(path.join(out,'fixtures',id+'.png'),bytes);fixtures.push({...reference,id,sha256:sha(bytes)});
 }
 await fs.writeFile(path.join(out,'fixtures','manifest.json'),JSON.stringify(fixtures,null,2)+'\n');
 const rows=[];
 for(const [i,fixture] of fixtures.entries())for(const name of i%2?['candidate','baseline']:['baseline','candidate']){
  const result=await evaluate(`readQualityFixture('/${name}',${JSON.stringify(versions[name])},${JSON.stringify(fixture.id)},${budget})`);
  rows.push({id:fixture.id,implementation:name,...result});await fs.appendFile(path.join(out,'predictions.jsonl'),JSON.stringify(rows.at(-1))+'\n');console.log(`${fixture.id} ${name}: ${result.latency_ms.toFixed(0)}ms; ${result.items.length} entries`);
 }
 await evaluate('finishQualityBenchmark()');
 const normal=s=>String(s).normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim(),nameKey=s=>normal(s).replace(/[^\p{L}\p{N}]/gu,'');
 const summary={};
 for(const implementation of ['baseline','candidate']){
  const cases=fixtures.map(f=>{
   const r=rows.find(r=>r.id===f.id&&r.implementation===implementation),expected=new Set(f.entries.flatMap(e=>e.allergens.map(id=>nameKey(e.name)+':'+id))),found=new Set(r.items.flatMap(e=>e.matches.map(h=>nameKey(e.name)+':'+h.allergen_id))),confident=new Set(r.items.flatMap(e=>e.matches.filter(h=>!h.uncertain).map(h=>nameKey(e.name)+':'+h.allergen_id)));
   const reference=normal(f.reference_text),prediction=normal(r.selected_ocr_text);
   return {id:f.id,character_edits:editDistance([...reference],[...prediction]),reference_characters:reference.length,word_edits:editDistance(reference.split(' '),prediction.split(' ')),reference_words:reference.split(' ').length,known_positive_pairs:expected.size,
    warned_pairs:[...expected].filter(x=>found.has(x)).length,confident_warned_pairs:[...expected].filter(x=>confident.has(x)).length,
    additional_warning_pairs:[...found].filter(x=>!expected.has(x)),pork_warning:r.items.some(e=>nameKey(e.name)===nameKey(f.entries[2].name)&&(e.dietary_matches||[]).some(h=>h.preference_id==='avoid_pork'&&h.kind==='conflict')),
    unsafe_outputs:r.safe_items.length+r.items.filter(e=>['safe','clear','no_listed_conflict'].includes(e.status)).length,latency_ms:r.latency_ms,complete:r.complete,errors:r.errors,selected_ocr_variant:r.selected_ocr_variant};
  });
  const sum=key=>cases.reduce((n,c)=>n+c[key],0),times=cases.map(c=>c.latency_ms).sort((a,b)=>a-b);
  summary[implementation]={cer:sum('character_edits')/sum('reference_characters'),wer:sum('word_edits')/sum('reference_words'),warned_pairs:sum('warned_pairs'),confident_warned_pairs:sum('confident_warned_pairs'),known_positive_pairs:sum('known_positive_pairs'),missed_pairs:sum('known_positive_pairs')-sum('warned_pairs'),additional_warning_pairs:cases.reduce((n,c)=>n+c.additional_warning_pairs.length,0),pork_cases_warned:cases.filter(c=>c.pork_warning).length,unsafe_outputs:sum('unsafe_outputs'),latency_median_ms:(times[4]+times[5])/2,latency_p95_ms:times.at(-1),cases};
 }
 if(JSON.stringify(before)!==JSON.stringify(await snapshots()))throw Error('Source changed during comparison');
 const metadata={kind:'synthetic_degradation_comparison_not_real_menu_validation',versions,budget_ms:budget,source_sha256:before,browser:await send('Browser.getVersion'),font:execFileSync('fc-match',['Noto Sans CJK KR'],{encoding:'utf8'}).trim(),models:{},latency:'warm reusable local Tesseract worker; includes image preprocessing, OCR passes and parsing; excludes initial worker/model load, camera/UI; not Android ML Kit or phone latency',ocr_selection:'highest fixed confidence/length heuristic among upright full-image readings; no ground-truth selection',warning_metric:'strict printed title-allergen association; uncertain warnings reported separately from confident warnings',references:'authored fixture strings fixed before OCR, all derived images correlated; no human-reviewed real package/menu reference or training',scope:'Actual shared web menu reader + parser; native pixel routing has separate controlled tests, not physical-device recognition validation'};
 for(const lang of ['kor','eng','fra'])metadata.models[lang]=sha(await fs.readFile(path.join(repo,'dist/vendor/tessdata',lang+'.traineddata')));
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({metadata,summary},null,2)+'\n');console.log(JSON.stringify({output:out,summary:Object.fromEntries(Object.entries(summary).map(([k,{cases,...rest}])=>[k,rest]))},null,2));
 if(Object.values(summary).some(s=>s.unsafe_outputs))process.exitCode=1;
}finally{socket?.close();chrome.kill();if(chrome.exitCode==null)await once(chrome,'exit');server.close();await fs.rm(userData,{recursive:true,force:true,maxRetries:3})}
