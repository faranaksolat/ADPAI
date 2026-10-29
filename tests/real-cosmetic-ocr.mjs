// Explicit integration check, not a market/clinical accuracy benchmark.
// Two authored, clear synthetic cards; real bundled Tesseract, no image API.
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {COSMETIC_CARDS} from '../benchmarks/cosmetics-cards.mjs';
const repoRoot=path.resolve(import.meta.dirname,'..'),appRoot=path.resolve(process.env.COSMETIC_APP_ROOT||repoRoot),root=path.join(appRoot,'dist');
await fs.access(path.join(root,'cosmetics.js'));
const sourceFiles=['cosmetics.html','src/cosmetic-ocr.js','src/cosmetic-items.js','src/cosmetics.js','src/cosmetic-glossary.js','src/image.js','src/menu-ocr.js','src/menu-image.js','src/tesseract.js','src/ocr-worker.js','mobile/cosmetics-entry.js','mobile/platform.js','tests/real-cosmetic-ocr.mjs','benchmarks/cosmetics-cards.mjs','dist/cosmetics.js','dist/vendor/tessdata/kor.traineddata','dist/vendor/tessdata-cosmetic/kor.traineddata','dist/vendor/tessdata/eng.traineddata'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>{
 const base=['tests/real-cosmetic-ocr.mjs','benchmarks/cosmetics-cards.mjs'].includes(file)?repoRoot:appRoot;
 try{return [file,createHash('sha256').update(await fs.readFile(path.join(base,file))).digest('hex')]}
 catch(error){if(appRoot!==repoRoot&&error.code==='ENOENT'&&['src/cosmetic-items.js','dist/vendor/tessdata-cosmetic/kor.traineddata'].includes(file))return[file,null];throw error}
})));
const before=await hashes();
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),file=path.resolve(root,decodeURIComponent(url.pathname.slice(1))||'cosmetics.html');
  if(!file.startsWith(root+path.sep))throw Error('Outside bundle');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end()}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-real-cosmetics-'));
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='',socket;chrome.stderr.on('data',chunk=>stderr+=chunk);
const cards=process.env.COSMETIC_EXTRA_CASES==='1'?COSMETIC_CARDS:COSMETIC_CARDS.slice(0,2);
try{
 const deadline=Date.now()+20000;while(!/DevTools listening on (ws:\/\/\S+)/u.test(stderr)){if(Date.now()>deadline)throw Error('Chromium start timeout');await new Promise(r=>setTimeout(r,50))}
 const address=stderr.match(/DevTools listening on (ws:\/\/\S+)/u)[1],targets=await(await fetch(new URL('/json/list',address.replace('ws:','http:')))).json();
 socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await once(socket,'open');let id=0;const pending=new Map(),listeners=new Map(),errors=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
 socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else for(const fn of listeners.get(m.method)||[])fn(m.params)});
 listeners.set('Runtime.exceptionThrown',[event=>errors.push(event.exceptionDetails.text)]);
 listeners.set('Fetch.requestPaused',[event=>send('Fetch.failRequest',{requestId:event.requestId,errorReason:'InternetDisconnected'}).catch(()=>{})]);
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const results=[];
 for(const card of cards){
  const loaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/cosmetics.html`});await loaded;
  const result=await evaluate(`(async()=>{
   const end=Date.now()+120000;while(!document.querySelector('#catalogScope').textContent){if(Date.now()>end)throw Error('Page did not initialize');await new Promise(r=>setTimeout(r,20))}
   document.querySelector('#avoidCoconut').checked=true;document.querySelector('#avoidCoconut').dispatchEvent(new Event('change'));
   const c=document.createElement('canvas');c.width=1600;c.height=500;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='40px "Noto Sans CJK KR", sans-serif';
   ${JSON.stringify(card.lines)}.forEach((line,i)=>{if(ctx.measureText(line).width>c.width-100)throw Error('Authored fixture is clipped');ctx.fillText(line,50,100+i*100)});
   const f=new File([await new Promise(r=>c.toBlob(r))],'authored-card.png',{type:'image/png'}),digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer()),fixture_sha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),transfer=new DataTransfer();transfer.items.add(f);const input=document.querySelector('#careFiles');input.files=transfer.files;input.dispatchEvent(new Event('change'));const started=performance.now();document.querySelector('#careAnalyze').click();
   while(document.querySelector('#careResult').hidden){if(Date.now()>end)throw Error('OCR analysis timeout');await new Promise(r=>setTimeout(r,50))}
   return {fixture_sha256,elapsed_ms:performance.now()-started,identities:[...document.querySelectorAll('.careIdentity')].map(e=>e.textContent.split(' · ')[0]),confirmed_identities:[...document.querySelectorAll('.careRow[data-uncertain=false] .careIdentity')].map(e=>e.textContent.split(' · ')[0]),title:document.querySelector('#careResultTitle').textContent,raw:document.querySelector('#careRaw').textContent,rows:[...document.querySelectorAll('.careRow')].map(e=>e.textContent),${process.env.COSMETIC_FIXTURE_DIR?"fixture_png:c.toDataURL('image/png'),":''}};
  })()`);
  const expected=card.expected,missed=expected.filter(name=>!result.identities.includes(name)),additional=[...new Set(result.identities)].filter(name=>!expected.includes(name));
  results.push({card:card.id,language:card.language,fixture_sha256:result.fixture_sha256,scope:'synthetic_clear_integration_only',expected:expected.length,recovered:expected.length-missed.length,missed,additional_identity_predictions:additional,context_verified_recovered:expected.filter(name=>result.confirmed_identities.includes(name)).length,context_verified_additional:[...new Set(result.confirmed_identities)].filter(name=>!expected.includes(name)),elapsed_ms:Math.round(result.elapsed_ms),physical_device:false});
  console.log(JSON.stringify(results.at(-1)));
  if(process.env.COSMETIC_DEBUG==='1'&&missed.length)console.log(JSON.stringify({synthetic_diagnostic_only:card.id,raw:result.raw,rows:result.rows}));
  if(process.env.COSMETIC_FIXTURE_DIR){await fs.writeFile(path.join(process.env.COSMETIC_FIXTURE_DIR,card.id+'.png'),Buffer.from(result.fixture_png.split(',')[1],'base64'));delete result.fixture_png;await fs.writeFile(path.join(process.env.COSMETIC_FIXTURE_DIR,card.id+'.json'),JSON.stringify(result,null,2)+'\n')}
 }
 assert.deepEqual(await hashes(),before,'Source or bundled models changed during OCR');
 const report={schema:'adpai-authored-cosmetic-ocr-gate-v1',scope:'authored_development_cards_not_a_real_product_benchmark',physical_device_tests:0,real_product_images:0,independently_reviewed_labels:0,clinical_validation:false,global_accuracy_estimate:null,cache_state:'not_measured',timing_scope:'Browser desktop, label processing and model initialization; excludes initial page load and shutter.',created_utc:new Date().toISOString(),release_gate_passed:results.every(r=>r.context_verified_recovered===r.expected&&!r.context_verified_additional.length&&!r.additional_identity_predictions.length),source_sha256:before,results};
 if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
 assert.equal(report.release_gate_passed,true,'Full identity recovery gate failed; inspect reported misses, do not deploy the cosmetic scanner');
 assert.deepEqual(errors,[]);console.log('PASS: real bundled EN/KO cosmetic OCR on two authored clear cards; no real-package or clinical accuracy claim.');
}finally{socket?.close();chrome.kill();if(chrome.exitCode==null)await once(chrome,'exit');server.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:3})}
