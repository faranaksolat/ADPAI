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

const mobileWeb=process.env.MOBILE_WEB==='1';
const root=path.resolve(import.meta.dirname,'..',mobileWeb?'dist':'.');
const realOcr=process.env.REAL_OCR==='1';
const prefix='/ADPAI/';
const mime={'.js':'text/javascript','.html':'text/html','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
    if(!pathname.startsWith(prefix))throw new Error('outside app scope');
    const name=pathname.slice(prefix.length)||'index.html';
    const file=path.resolve(root,name);
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
  const stub=`globalThis.Tesseract={createWorker:async()=>({recognize:async()=>{if(globalThis.testOcrDelay)await new Promise(r=>setTimeout(r,globalThis.testOcrDelay));return {data:{words:(globalThis.testOcrText||'INGREDIENTS: milk, sugar').split(' ').map((text,i)=>({text,confidence:95,bbox:{x0:i*40,y0:0,x1:i*40+38,y1:24}}))}}},terminate:async()=>{}})};`;
  listeners.set('Fetch.requestPaused',[event=>{
    (realOcr ? send('Fetch.failRequest',{requestId:event.requestId,errorReason:'InternetDisconnected'})
      : send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(stub).toString('base64')})).catch(e=>errors.push(e.message));
  }]);
  await send('Runtime.enable');
  if(!realOcr) await send('Fetch.enable',{patterns:[{urlPattern:'https://cdn.jsdelivr.net/*'},{urlPattern:'*vendor/tesseract/tesseract.min.js'}]});
  else if(mobileWeb) await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  if(mobileWeb)await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.ADPAI_NATIVE={};'});
  const loaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}`});
  await loaded;
  const evaluate=async(expression)=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'phone layout overflows horizontally');
  if(!mobileWeb) {
    await evaluate(`document.querySelector('#installHelp').click()`);
    assert.equal(await evaluate(`document.querySelector('#installDialog').open`),true);
    assert.ok((await evaluate(`document.querySelector('#installBody').textContent`)).includes('Add to Home Screen'));
    await evaluate(`document.querySelector('#closeInstall').click()`);
    assert.equal(await evaluate(`document.querySelector('#installDialog').open`),false);
  }
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=400;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,400);ctx.fillStyle='black';ctx.font='48px sans-serif';
    ctx.fillText('INGREDIENTS: MILK, SUGAR, WHEAT',30,80);ctx.fillText('CONTAINS: MILK',30,180);
    ctx.fillText('Please check the original ingredient label.',30,280);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    const input=document.querySelector('#products input[type=file]');
    globalThis.testPhotoFile=new File([blob],'label.png',{type:'image/png'});
    const files=new DataTransfer();files.items.add(globalThis.testPhotoFile);input.files=files.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const milk=document.querySelector('#chips input[value=milk]');milk.checked=true;milk.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const cases=[['INGREDIENTS: milk, sugar, citric acid (E330)','Conflict detected'],['INGREDIENTS: sugar and cocoa','Unable to verify'],['Nutrition facts: per 100 g 500 kcal','Unable to verify']];
  for(const [text,expected] of realOcr ? cases.slice(0,1) : cases) {
    const result=await evaluate(`(async()=>{globalThis.testOcrText=${JSON.stringify(text)};document.querySelector('#analyze').click();const end=Date.now()+${realOcr?180000:20000};while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw new Error('analysis timeout');await new Promise(r=>setTimeout(r,25));}const visible=document.body.cloneNode(true);visible.querySelectorAll('.rawOcr').forEach(el=>el.remove());return {title:document.querySelector('#rtitle').textContent,icon:document.querySelector('#ricon').textContent,badge:document.querySelector('.presult .badge').textContent,body:visible.textContent,hasCalorieElements:!!document.querySelector('#calTotal,.kcal')};})()`);
    assert.equal(result.title,expected);
    assert.equal(result.badge,expected);
    assert.equal(result.icon,'!');
    assert.equal(result.hasCalorieElements,false);
    assert.ok(!/calorie|kcal|열량|칼로리/iu.test(result.body));
    if(text.includes('citric')&&!realOcr) {
      assert.ok(result.body.includes('Adjusts tartness and acidity.'));
      assert.ok(await evaluate(`document.querySelector('.rawOcr pre').textContent.includes('citric acid')`));
      await evaluate(`document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
      assert.ok((await evaluate(`document.querySelector('.ingredientSection').textContent`)).includes('신맛과 산도를 조절'));
      await evaluate(`document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
      if(process.env.BROWSER_SCREENSHOT) {
        const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        await fs.writeFile(process.env.BROWSER_SCREENSHOT,Buffer.from(data,'base64'));
      }
    }
  }
  await evaluate(`document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'));`);
  assert.equal(await evaluate(`document.querySelector('#rtitle').textContent`),realOcr?'주의 성분 확인':'확인 불가');
  assert.ok(!/calorie|kcal|열량|칼로리/iu.test(await evaluate(`(()=>{const body=document.body.cloneNode(true);body.querySelectorAll('.rawOcr').forEach(el=>el.remove());return body.textContent})()`)));
  if(process.env.BROWSER_SCREENSHOT && realOcr) {
    const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await fs.writeFile(process.env.BROWSER_SCREENSHOT,Buffer.from(data,'base64'));
  }
  if(mobileWeb)assert.equal(await evaluate(`document.querySelector('#installPanel').hidden`),true);
  if(!realOcr) {
    // Explicit crop works on touch-sized UI; cancellation preserves a result,
    // applying/restoring invalidates it and restores the original pixels.
    await evaluate(`document.querySelector('.cropPhoto').click()`);
    await evaluate(`(async()=>{while(!document.querySelector('.cropDialog'))await new Promise(r=>setTimeout(r,10))})()`);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled`),true);
    await evaluate(`document.querySelector('[data-crop-action=cancel]').click()`);
    await evaluate(`(async()=>{while(document.querySelector('.cropDialog'))await new Promise(r=>setTimeout(r,10))})()`);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),true);
    await evaluate(`document.querySelector('.cropPhoto').click()`);
    await evaluate(`(async()=>{while(!document.querySelector('.cropDialog'))await new Promise(r=>setTimeout(r,10))})()`);
    const rect=await evaluate(`(()=>{const r=document.querySelector('.cropDialog canvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.w*.1,y:rect.y+rect.h*.1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.w*.9,y:rect.y+rect.h*.8}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await evaluate(`document.querySelector('[data-crop-action=apply]').click()`);
    await evaluate(`(async()=>{while(document.querySelector('.cropDialog'))await new Promise(r=>setTimeout(r,10))})()`);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    const cropped=await evaluate(`(async()=>{const image=document.querySelector('.photo img');await image.decode();return {w:image.naturalWidth,h:image.naturalHeight}})()`);
    assert.ok(Math.abs(cropped.w-1120)<=2 && Math.abs(cropped.h-280)<=2);
    await evaluate(`document.querySelector('.restorePhoto').click()`);
    assert.equal(await evaluate(`(async()=>{const image=document.querySelector('.photo img');await image.decode();return image.naturalWidth})()`),1400);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
    // Users cannot change the product/profile during inference and accidentally
    // associate old OCR with a new photograph or selection.
    await evaluate(`globalThis.testOcrDelay=30;document.querySelector('#analyze').click()`);
    assert.equal(await evaluate(`document.querySelector('#chips input').disabled && document.querySelector('.photo .x').disabled && document.querySelector('#lang').disabled`),true);
    await evaluate(`(async()=>{while(document.querySelector('#analyze').disabled)await new Promise(r=>setTimeout(r,25));globalThis.testOcrDelay=0})()`);
    await evaluate(`document.querySelector('.photo .x').click()`);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled`),true);
    await evaluate(`globalThis.ADPAI_NATIVE={pickPhotos:async()=>[globalThis.testPhotoFile],takePhoto:async()=>{throw new Error('User cancelled')}};document.querySelector('.capture .primary').click()`);
    await evaluate(`(async()=>{while(document.querySelector('#analyze').disabled)await new Promise(r=>setTimeout(r,25))})()`);
    assert.equal(await evaluate(`document.querySelectorAll('.photo').length`),1);
    await evaluate(`document.querySelector('[data-camera]').click()`);
    await evaluate(`(async()=>{while(document.querySelector('#analyze').disabled)await new Promise(r=>setTimeout(r,25))})()`);
    assert.equal(await evaluate(`document.querySelectorAll('.photo').length`),1);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    await evaluate(`globalThis.testAlerts=[];globalThis.alert=message=>globalThis.testAlerts.push(message);globalThis.ADPAI_NATIVE.takePhoto=async()=>{throw new Error('Permission denied')};document.querySelector('[data-camera]').click()`);
    await evaluate(`(async()=>{while(document.querySelector('#analyze').disabled)await new Promise(r=>setTimeout(r,25))})()`);
    assert.equal(await evaluate(`globalThis.testAlerts.length`),1);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    await evaluate(`delete globalThis.ADPAI_NATIVE;document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
  }
  if(!mobileWeb) {
    await evaluate(`(async()=>{await navigator.serviceWorker.ready;const end=Date.now()+15000;while(!navigator.serviceWorker.controller){if(Date.now()>end)throw new Error('service worker did not claim page');await new Promise(r=>setTimeout(r,25))}})()`);
    const cache=await evaluate(`(async()=>({scope:(await navigator.serviceWorker.ready).scope,urls:(await Promise.all((await caches.keys()).map(async key=>(await (await caches.open(key)).keys()).map(r=>r.url)))).flat()}))()`);
    assert.ok(cache.scope.endsWith(prefix));
    assert.ok(cache.urls.some(url=>url.endsWith('/src/engine.js?v=1.6.1')));
    assert.ok(cache.urls.every(url=>url.startsWith(cache.scope) && !/blob:|api\/|label\.png|profile/iu.test(url)));
    await send('Fetch.disable');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    const offlineLoaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
    await send('Page.reload');await offlineLoaded;
    assert.equal(await evaluate(`document.querySelector('.name').textContent.includes('ADPAI')`),true);
    assert.equal(await evaluate(`document.querySelector('#offlineNotice').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    assert.equal(await evaluate(`document.querySelectorAll('.photo').length`),0);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled`),true);
    assert.equal(await evaluate(`(async()=>(await fetch('./privacy.html')).ok)()`),true);
    // An offline shell is usable even when the CDN runtime is unavailable.
    const offlineStatus=await evaluate(`(async()=>{const {analyzeProducts}=await import('./src/tesseract.js?v=1.6.1');globalThis.Tesseract=undefined;const result=await analyzeProducts([{id:1,photos:[{file:{}}]}],{allergens:['milk']});return result.products[0].status})()`);
    assert.equal(offlineStatus,'unverified');
  }
  assert.deepEqual(errors,[]);
  console.log(realOcr ? `PASS: real ${mobileWeb?'bundled offline':'CDN'} Tesseract on a generated label; not a package benchmark` : `PASS: ${mobileWeb?'mobile bundle':'Pages /ADPAI/ + offline PWA'}, conflict/unverified UI, camera cancellation/permission and stale-result prevention; controlled OCR`);
} finally {
  socket?.close();
  chrome.kill();
  if(chrome.exitCode==null) await once(chrome,'exit');
  server.close();
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
}
