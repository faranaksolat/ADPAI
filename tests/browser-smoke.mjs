// Run explicitly with `npm run test:browser`; needs Chromium, no external OCR
// downloads. The CDN is intercepted with controlled OCR output; this validates
// the shipped page/module/UI path, not recognition accuracy on photographs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const root=path.resolve(import.meta.dirname,'..');
const realOcr=process.env.REAL_OCR==='1';
const mime={'.js':'text/javascript','.html':'text/html'};
const server=http.createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'aller-browser-'));
const proxy=realOcr && process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [];
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',...proxy,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';chrome.stderr.on('data',data=>{stderr+=data;});
let socket;
try {
  const deadline=Date.now()+20000;
  while(!/DevTools listening on (ws:\/\/\S+)/u.test(stderr)) {
    if(Date.now()>deadline || chrome.exitCode!=null) throw new Error('Chromium startup failed: '+stderr);
    await new Promise(r=>setTimeout(r,50));
  }
  const browserWs=stderr.match(/DevTools listening on (ws:\/\/\S+)/u)[1];
  const targets=await (await fetch(new URL('/json/list',browserWs.replace('ws:','http:')))).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await once(socket,'open');
  let id=0;
  const pending=new Map(),listeners=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  socket.addEventListener('message',({data})=>{
    const message=JSON.parse(data);
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}
    else for(const listener of listeners.get(message.method)||[]) listener(message.params);
  });
  const errors=[];
  listeners.set('Runtime.exceptionThrown',[event=>errors.push(event.exceptionDetails.text+': '+(event.exceptionDetails.exception?.description||''))]);
  const stub=`globalThis.Tesseract={createWorker:async()=>({recognize:async()=>({data:{words:(globalThis.testOcrText||'INGREDIENTS: milk, sugar').split(' ').map((text,i)=>({text,confidence:95,bbox:{x0:i*40,y0:0,x1:i*40+38,y1:24}}))}}),terminate:async()=>{}})};`;
  listeners.set('Fetch.requestPaused',[event=>{
    send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(stub).toString('base64')}).catch(e=>errors.push(e.message));
  }]);
  await send('Runtime.enable');
  if(!realOcr) await send('Fetch.enable',{patterns:[{urlPattern:'https://cdn.jsdelivr.net/*'}]});
  await send('Page.enable');
  const loaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await loaded;
  const evaluate=async(expression)=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=400;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,400);ctx.fillStyle='black';ctx.font='48px sans-serif';
    ctx.fillText('INGREDIENTS: MILK, SUGAR, WHEAT',30,80);ctx.fillText('CONTAINS: MILK',30,180);
    ctx.fillText('Please check the original ingredient label.',30,280);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    const input=document.querySelector('#products input[type=file]');
    const files=new DataTransfer();files.items.add(new File([blob],'label.png',{type:'image/png'}));input.files=files.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const milk=document.querySelector('#chips input[value=milk]');milk.checked=true;milk.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const cases=[['INGREDIENTS: milk, sugar','Conflict detected'],['INGREDIENTS: sugar and cocoa','Unable to verify'],['Nutrition facts: per 100 g 500 kcal','Unable to verify']];
  for(const [text,expected] of realOcr ? cases.slice(0,1) : cases) {
    const result=await evaluate(`(async()=>{globalThis.testOcrText=${JSON.stringify(text)};document.querySelector('#analyze').click();const end=Date.now()+${realOcr?180000:20000};while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw new Error('analysis timeout');await new Promise(r=>setTimeout(r,25));}return {title:document.querySelector('#rtitle').textContent,icon:document.querySelector('#ricon').textContent,badge:document.querySelector('.presult .badge').textContent,body:document.body.textContent,hasCalorieElements:!!document.querySelector('#calTotal,.kcal')};})()`);
    assert.equal(result.title,expected);
    assert.equal(result.badge,expected);
    assert.equal(result.icon,'!');
    assert.equal(result.hasCalorieElements,false);
    assert.ok(!/calorie|kcal|열량|칼로리/iu.test(result.body));
  }
  await evaluate(`document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'));`);
  assert.ok(!/calorie|kcal|열량|칼로리/iu.test(await evaluate(`document.body.textContent`)));
  assert.deepEqual(errors,[]);
  console.log(realOcr ? 'PASS: real Tesseract browser inference on a generated label; not a package benchmark' : 'PASS: shipped browser page, imports, image selection, conflict and unverified UI; controlled OCR');
} finally {
  socket?.close();
  chrome.kill();
  if(chrome.exitCode==null) await once(chrome,'exit');
  server.close();
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
}
