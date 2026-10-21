// The real PC page/modules with controlled API words. Not an OCR/device test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=path.resolve(import.meta.dirname,'..'),token='fixture-only-'+('x'.repeat(40));
let apiStatus=200,menu=false,calls=0;const requests=[];
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');requests.push(url.pathname+url.search);
  if(url.pathname==='/api/jobs'||url.pathname.startsWith('/api/jobs/')){
   assert.equal(req.headers.authorization,'Bearer '+token);
   if(req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk.toString('latin1');assert.ok(body.includes('name="images"'));assert.ok(!body.includes('name="profile"'));assert.ok(!body.includes(token));calls++;
    res.writeHead(apiStatus===200?202:apiStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({state:'running',job_id:'x'.repeat(32)}));return;
   }
   res.writeHead(apiStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({state:'complete',result:{status:'unverified',automatic_negative_results:false,errors:[],sources:[{familyId:'pc-paddle',items:[{text:menu?'Tomato soup: cream, tomato':'Ingredients: milk, sugar',score:0,raw_line_score:.99,lineId:0}]}]}}));return;
  }
  const rel=url.pathname==='/'?'pc_server/static/index.html':url.pathname.startsWith('/client/')?'pc_server/static/'+url.pathname.slice(8):url.pathname.slice(1);
  const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error('Outside test root');
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch(error){res.writeHead(500);res.end('Test server failure');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const realApi=Boolean(process.env.PC_SERVER_URL);
const base=realApi?process.env.PC_SERVER_URL:`http://127.0.0.1:${server.address().port}/`;
if(!/^http:\/\/127\.0\.0\.1:\d+\/$/u.test(base))throw Error('Real PC smoke accepts loopback only');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-pc-browser-'));
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','pipe']});
let log='',socket;chrome.stderr.on('data',chunk=>log+=chunk);
try{
 const deadline=Date.now()+20000;while(!/DevTools listening on (ws:\/\/\S+)/u.test(log)){if(Date.now()>deadline||chrome.exitCode!=null)throw Error('Chromium startup failed');await new Promise(r=>setTimeout(r,50))}
 const ws=log.match(/DevTools listening on (ws:\/\/\S+)/u)[1],pages=await(await fetch(new URL('/json/list',ws.replace('ws:','http:')))).json();
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let id=0;const pending=new Map(),events=new Map(),errors=[],external=[];
 socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else for(const callback of events.get(m.method)||[])callback(m.params)});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
 const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');events.set('Runtime.exceptionThrown',[e=>errors.push(e.exceptionDetails.text)]);
 events.set('Network.requestWillBeSent',[e=>{if(/^https?:/u.test(e.request.url)&&!e.request.url.startsWith(base))external.push(e.request.url)}]);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const loaded=new Promise(resolve=>events.set('Page.loadEventFired',[resolve]));await send('Page.navigate',{url:base+'#token='+token});await loaded;
 await evaluate(`(async()=>{const end=Date.now()+15000;while(document.querySelector('#scanner').hidden){if(Date.now()>end)throw Error('Pairing did not load');await new Promise(r=>setTimeout(r,25))}})()`);
 assert.equal(await evaluate('location.hash'),'');assert.ok(!requests.some(x=>x.includes(token)));
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.mark')).display`),'grid');
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
 await evaluate(`document.querySelector('#allergens input[value=milk]').click()`);
 const addPhoto=()=>evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=380;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1400,380);c.fillStyle='black';c.font='48px sans-serif';c.fillText('INGREDIENTS: MILK, SUGAR, WHEAT',35,85);c.fillText('CONTAINS: MILK',35,185);const blob=await new Promise(r=>canvas.toBlob(r));const list=new DataTransfer();list.items.add(new File([blob],'test.png',{type:'image/png'}));const input=document.querySelector('#photos');input.files=list.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 const read=()=>evaluate(`(async()=>{document.querySelector('#read').click();const end=Date.now()+${realApi?180000:15000};while(document.querySelector('#read').disabled){if(Date.now()>end)throw Error('PC request did not finish');await new Promise(r=>setTimeout(r,25))}})()`);
 await addPhoto();await read();if(!realApi)assert.equal(calls,1);
 assert.equal(await evaluate(`document.querySelector('#results').hidden`),false);
 assert.ok((await evaluate(`document.querySelector('#cards').textContent`)).includes('Potential risk'));
 if(process.env.PC_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(process.env.PC_SCREENSHOT,Buffer.from(data,'base64'))}
 if(!realApi){
 await evaluate(`document.querySelector('#language').value='ko';document.querySelector('#language').dispatchEvent(new Event('change'))`);
 assert.equal(await evaluate(`document.querySelector('#results').hidden`),true);await read();assert.ok((await evaluate(`document.querySelector('#cards').textContent`)).includes('주의 가능성'));
 await evaluate(`document.querySelector('#menu').click()`);assert.equal(await evaluate(`document.querySelector('#photos').files.length`),0);menu=true;await addPhoto();await read();assert.ok((await evaluate(`document.querySelector('#cards').textContent`)).includes('Tomato soup'));
 apiStatus=503;await read();assert.equal(await evaluate(`document.querySelector('#results').hidden`),true);assert.ok((await evaluate(`document.querySelector('#error').textContent`)).includes('판독 실패'));
 await evaluate(`document.querySelector('#disconnect').click()`);assert.equal(await evaluate(`sessionStorage.getItem('adpai_pc_pairing')`),null);assert.equal(await evaluate(`document.querySelector('#scanner').hidden`),true);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(realApi?'PASS: actual PC browser -> local HTTP job API -> actual Paddle -> potential milk warning on generated label; not Windows/tunnel/camera or package accuracy':'PASS: paired PC page EN/KO, uploads, menu, uncertainty, stale results and failed server; controlled API only, no native/Windows/tunnel accuracy claim');
}finally{
 socket?.close();const ended=once(chrome,'exit');chrome.kill();if(chrome.exitCode==null)await ended;
 await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
