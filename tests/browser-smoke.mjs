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
const mime={'.css':'text/css','.js':'text/javascript','.html':'text/html','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm'};
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
const downloads=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-downloads-'));
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
  const stub=`globalThis.Tesseract={createWorker:async()=>({recognize:async()=>{if(globalThis.testOcrDelay)await new Promise(r=>setTimeout(r,globalThis.testOcrDelay));return {data:{words:(globalThis.testOcrText||'INGREDIENTS: milk, sugar').split('\\n').flatMap((line,line_num)=>line.split(' ').map((text,i)=>({text,confidence:95,block_num:0,par_num:0,line_num,bbox:{x0:i*40,y0:line_num*40,x1:i*40+38,y1:line_num*40+24}})))}}},terminate:async()=>{}})};globalThis.ADPAI_CREATE_OCR_WORKER=(...args)=>globalThis.Tesseract.createWorker(...args);`;

  listeners.set('Fetch.requestPaused',[event=>{
    (realOcr ? send('Fetch.failRequest',{requestId:event.requestId,errorReason:'InternetDisconnected'})
      : send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(stub).toString('base64')})).catch(e=>errors.push(e.message));
  }]);
  await send('Runtime.enable');
  if(!realOcr) await send('Fetch.enable',{patterns:[{urlPattern:'https://cdn.jsdelivr.net/*'},{urlPattern:'*vendor/tesseract/tesseract.min.js'}]});
  else if(mobileWeb) await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:Number(process.env.VIEWPORT_WIDTH||390),height:Number(process.env.VIEWPORT_HEIGHT||844),deviceScaleFactor:1,mobile:true});
  if(mobileWeb)await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.ADPAI_NATIVE={};'});
  const loaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}`});
  await loaded;
  const evaluate=async(expression)=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const tap=async(selector)=>{
    const point=await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.mark')).display`),'grid','app stylesheet must load');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'phone layout overflows horizontally');
  assert.equal(await evaluate(`document.querySelector('#workflow').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#menuDietary').hidden`),true);
  if(process.env.HOME_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(process.env.HOME_SCREENSHOT,Buffer.from(data,'base64'))}
  if(process.env.KO_HOME_SCREENSHOT){
    await evaluate(`document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'Korean home overflows horizontally');
    const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(process.env.KO_HOME_SCREENSHOT,Buffer.from(data,'base64'));
    await evaluate(`document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
  }
  assert.equal(await evaluate(`document.querySelectorAll('#modeSelection button').length`),2);
  const navigation=Number(process.env.VIEWPORT_WIDTH||390)<=760?'.mobileNavigation':'.railNavigation';
  await tap(navigation+' [data-nav-mode=menu]');
  assert.equal(await evaluate(`document.body.dataset.mode`),'menu');
  assert.equal(await evaluate(`document.querySelector('#menuWarning').hidden`),false);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(navigation+' [data-nav-mode=menu]')}).getAttribute('aria-current')`),'page');
  await tap(navigation+' [data-nav-mode=home]');
  assert.equal(await evaluate(`document.querySelector('#workflow').hidden`),true);
  await tap('#shoppingMode');
  assert.equal(await evaluate(`document.querySelector('#workflow').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('#menuDietary').hidden`),true);
  if(!mobileWeb) {
    await evaluate(`document.querySelector('#installHelp').click()`);
    assert.equal(await evaluate(`document.querySelector('#installDialog').open`),true);
    assert.ok((await evaluate(`document.querySelector('#installBody').textContent`)).includes('Add to Home Screen'));
    await evaluate(`document.querySelector('#closeInstall').click()`);
    assert.equal(await evaluate(`document.querySelector('#installDialog').open`),false);
  }
  if(process.env.SHOPPING_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(process.env.SHOPPING_SCREENSHOT,Buffer.from(data,'base64'))}
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=400;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,400);ctx.fillStyle='black';ctx.font='48px sans-serif';
    ctx.fillText('INGREDIENTS: MILK, SUGAR, WHEAT',30,80);ctx.fillText('CONTAINS: MILK',30,180);
    ctx.fillText('Please check the original ingredient label.',30,280);
    if(${realOcr&&process.env.LOW_QUALITY_LABEL==='1'}){
      if(${process.env.KOREAN_LABEL==='1'}){
        ctx.fillStyle='white';ctx.fillRect(0,0,1400,400);ctx.fillStyle='black';ctx.font='48px "Noto Sans CJK KR", sans-serif';
        ctx.fillText('원재료명: 우유, 설탕, 밀',30,80);ctx.fillText('우유, 밀 함유',30,180);ctx.fillText('원본 라벨을 확인해 주세요.',30,280);
      }
      const small=document.createElement('canvas');small.width=700;small.height=200;small.getContext('2d').drawImage(canvas,0,0,700,200);
      canvas.width=700;canvas.height=200;ctx.drawImage(small,0,0);const pixels=ctx.getImageData(0,0,700,200);
      for(let i=0;i<pixels.data.length;i+=4)for(let k=0;k<3;k++)pixels.data[i+k]=30+pixels.data[i+k]*.23;
      ctx.putImageData(pixels,0,0);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    const input=document.querySelector('#products input[type=file]');
    globalThis.testPhotoFile=new File([blob],'label.png',{type:'image/png'});
    const files=new DataTransfer();files.items.add(globalThis.testPhotoFile);input.files=files.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const milk=document.querySelector('#chips input[value=milk]');milk.checked=true;milk.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  assert.equal(await evaluate(`document.querySelector('#continuePhotos').disabled`),false);
  await evaluate(`document.querySelector('#continuePhotos').click()`);
  assert.equal(await evaluate(`document.activeElement.id`),'scanHeading');
  const cases=[['INGREDIENTS: milk, sugar, citric acid (E330)','Conflict detected'],['INGREDIENTS: sugar and cocoa','Unable to verify'],['Nutrition facts: per 100 g 500 kcal','Unable to verify']];
  for(const [text,expected] of realOcr ? cases.slice(0,1) : cases) {
    const result=await evaluate(`(async()=>{globalThis.testOcrText=${JSON.stringify(text)};document.querySelector('#analyze').click();const end=Date.now()+${realOcr?180000:20000};while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw new Error('analysis timeout');await new Promise(r=>setTimeout(r,25));}const visible=document.body.cloneNode(true);visible.querySelectorAll('.rawOcr').forEach(el=>el.remove());return {title:document.querySelector('#rtitle').textContent,icon:document.querySelector('#ricon').textContent,badge:document.querySelector('.presult .badge').textContent,body:visible.textContent,hasCalorieElements:!!document.querySelector('#calTotal,.kcal')};})()`);
    assert.equal(result.title,expected);
    assert.equal(result.badge,expected);
    await tap(navigation+' [data-nav-mode=shopping]');
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),true,'returning to the active tab must preserve the current result');
    assert.equal(result.icon,'!');
    assert.equal(result.hasCalorieElements,false);
    assert.equal(await evaluate(`document.querySelector('.workflowSteps [aria-current=step]').dataset.stage`),'3');
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
    // Retake advice appears for unreadable text. Exercise the real canvas
    // preprocessing and native bridge routing with controlled word outputs;
    // this verifies pixels/coordinates and UI, not ML Kit accuracy on a phone.
    await evaluate(`(async()=>{globalThis.testOcrText='...';document.querySelector('#analyze').click();const end=Date.now()+20000;while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw Error('retake timeout');await new Promise(r=>setTimeout(r,25))}})()`);
    assert.ok((await evaluate(`document.querySelector('.retakeAdvice').textContent`)).includes('가까이서'));
    await evaluate(`document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
    assert.ok((await evaluate(`document.querySelector('.retakeAdvice').textContent`)).includes('Move closer'));
    await evaluate(`globalThis.testNativeSizes=[];globalThis.ADPAI_NATIVE_OCR=async({base64})=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();globalThis.testNativeSizes.push(image.naturalWidth);const enhanced=image.naturalWidth>1400;return {items:(enhanced?['INGREDIENTS:','milk,','sugar,','cocoa,','salt,','water']:['unclear']).map((text,i)=>({text,score:enhanced?.9:.2,lineId:0,box:{x0:i*80,x1:i*80+75,y0:0,y1:20}}))}};document.querySelector('#analyze').click()`);
    await evaluate(`(async()=>{const end=Date.now()+20000;while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw Error('native enhance timeout');await new Promise(r=>setTimeout(r,25))}})()`);
    assert.equal(await evaluate(`document.querySelector('#rtitle').textContent`),'Conflict detected');
    assert.equal(await evaluate(`globalThis.testNativeSizes[0]`),1400);
    assert.equal(await evaluate(`globalThis.testNativeSizes.some(w=>w===2800)&&globalThis.testNativeSizes.every(w=>w<=3000)`),true);
    assert.ok((await evaluate(`document.querySelector('.rawOcr').textContent`)).includes('native-enhanced'));
    await evaluate(`delete globalThis.ADPAI_NATIVE_OCR;document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
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
    if(!mobileWeb){
    const cornerColors=await evaluate(`(async()=>{
      const {rectifyPhoto}=await import('./src/geometry.js?v=1.11.0');const c=document.createElement('canvas');c.width=c.height=40;const ctx=c.getContext('2d');
      for(let y=0;y<40;y++)for(let x=0;x<40;x++){ctx.fillStyle='rgb('+x*6+','+y*6+',0)';ctx.fillRect(x,y,1,1)}
      const output=await rectifyPhoto(c,[{x:10,y:5},{x:30,y:10},{x:35,y:30},{x:5,y:35}]);const d=output.getContext('2d').getImageData(0,0,output.width,output.height).data;
      return [0,(output.width-1)*4,(output.height*output.width-1)*4,((output.height-1)*output.width)*4].map(i=>[d[i],d[i+1],d[i+2]]);
    })()`);
    [[60,30,0],[180,60,0],[210,180,0],[30,210,0]].forEach((expected,i)=>expected.forEach((n,c)=>assert.ok(Math.abs(cornerColors[i][c]-n)<=2,'rectified corner pixel must come from the selected source corner')));
    }
    // Four-corner correction is explicit, reversible, and retains original pixels.
    await evaluate(`document.querySelector('.cropPhoto').click()`);
    await evaluate(`(async()=>{while(!document.querySelector('.cropDialog'))await new Promise(r=>setTimeout(r,10))})()`);
    await evaluate(`document.querySelector('[data-crop-action=perspective]').click();document.querySelector('.cornerControls button').click()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
    await evaluate(`document.querySelector('[data-crop-action=apply]').click()`);
    await evaluate(`(async()=>{const end=Date.now()+20000;while(document.querySelector('.cropDialog')){if(Date.now()>end)throw Error('perspective timeout');await new Promise(r=>setTimeout(r,15))}})()`);
    assert.equal(await evaluate(`!!document.querySelector('.restorePhoto')`),true);
    await evaluate(`document.querySelector('.restorePhoto').click()`);
    assert.equal(await evaluate(`(async()=>{const image=document.querySelector('.photo img');await image.decode();return image.naturalWidth})()`),1400);
    assert.equal(await evaluate(`document.querySelectorAll('.qualityHint').length`),1);
    // Users cannot change the product/profile during inference and accidentally
    // associate old OCR with a new photograph or selection.
    await evaluate(`globalThis.testOcrDelay=30;document.querySelector('#analyze').click()`);
    assert.equal(await evaluate(`document.querySelector('#chips input').disabled && document.querySelector('.photo .x').disabled && document.querySelector('#lang').disabled`),true);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-nav-mode],#continuePhotos')].every(button=>button.disabled)`),true);
    await evaluate(`(async()=>{while(document.querySelector('#analyze').disabled)await new Promise(r=>setTimeout(r,25));globalThis.testOcrDelay=0})()`);
    await evaluate(`document.querySelector('.photo .x').click()`);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled`),true);
    await evaluate(`globalThis.ADPAI_NATIVE={pickPhotos:async()=>[globalThis.testPhotoFile],takePhoto:async()=>{throw new Error('User cancelled')}};document.querySelector('[data-gallery]').click()`);
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
    // A real browser MediaStream with a controlled still-photo provider. This
    // validates camera UI/lifecycle/resolution routing, not a physical camera.
    await evaluate(`(async()=>{
      globalThis.savedCapture=globalThis.ImageCapture;globalThis.savedDevices=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');
      globalThis.captureStops=0;globalThis.captureStreams=[];
      const still=document.createElement('canvas');still.width=4032;still.height=3024;const sc=still.getContext('2d');sc.fillStyle='white';sc.fillRect(0,0,4032,3024);sc.fillStyle='black';sc.font='36px sans-serif';sc.fillText('INGREDIENTS: milk, sugar',700,1200);
      globalThis.fullStill=new File([await new Promise(r=>still.toBlob(r))],'still.png',{type:'image/png'});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
        const c=document.createElement('canvas');c.width=640;c.height=480;const pc=c.getContext('2d');pc.fillStyle='#eaf0e2';pc.fillRect(0,0,640,480);pc.fillStyle='white';pc.fillRect(65,55,510,365);pc.fillStyle='#25382b';pc.font='28px sans-serif';pc.fillText('Menu',100,110);pc.font='20px sans-serif';pc.fillText('Noodles',100,175);pc.fillText('Ingredients: wheat, egg',100,210);pc.fillText('Tomato soup',100,285);pc.fillText('Ingredients: cream, tomato',100,320);const stream=c.captureStream(2),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{globalThis.captureStops++;stop()};globalThis.captureStreams.push(stream);return stream;
      }}});
      globalThis.ImageCapture=class{async takePhoto(){return globalThis.fullStill}};
      document.querySelector('[data-camera]').click();
      const end=Date.now()+15000;while(!document.querySelector('[data-camera-action=take]')||document.querySelector('[data-camera-action=take]').disabled){if(Date.now()>end)throw Error('live camera start timeout');await new Promise(r=>setTimeout(r,25))}
    })()`);
    if(process.env.CAMERA_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(process.env.CAMERA_SCREENSHOT,Buffer.from(data,'base64'))}
    await evaluate(`document.querySelector('[data-camera-action=take]').click()`);
    await evaluate(`(async()=>{while(document.querySelector('.cameraDialog'))await new Promise(r=>setTimeout(r,15));const image=[...document.querySelectorAll('.photo img')].at(-1);await image.decode();globalThis.stillWidth=image.naturalWidth})()`);
    assert.equal(await evaluate(`globalThis.stillWidth`),4032,'still capture must retain resolution beyond video preview');
    assert.ok(await evaluate(`globalThis.captureStops>=1`));
    if(!mobileWeb){
      const route=await evaluate(`(async()=>{
        const {analyzeProducts}=await import('./src/tesseract.js?v=1.11.0');
        const r=await analyzeProducts([{photos:[{file:globalThis.fullStill}]}],{allergens:['milk']},{purpose:'menu',nativeReader:null,
          createWorker:async()=>({reinitialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{words:[{text:'milk',confidence:40,bbox:{x0:20,y0:20,x1:90,y1:40}}]}})})});
        const p=r.products[0];return {originalRegions:p.sources.filter(s=>s.frame?.from_original&&s.frame.width===4032).length,unchangedScores:p.sources.every(s=>s.items.every(w=>w.score===.4)),status:p.status};
      })()`);
      assert.ok(route.originalRegions>0,'shipped analyzeProducts must retain original photo for region OCR');assert.equal(route.unchangedScores,true);assert.equal(route.status,'unverified');
    }
    await evaluate(`document.querySelector('.photoWrap:last-child .x').click();document.querySelector('[data-camera]').click()`);
    await evaluate(`(async()=>{while(!document.querySelector('.cameraDialog'))await new Promise(r=>setTimeout(r,10));document.querySelector('[data-camera-action=cancel]').click();await new Promise(r=>setTimeout(r,50))})()`);
    assert.equal(await evaluate(`document.querySelectorAll('.photo').length`),1);
    assert.equal(await evaluate(`globalThis.captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))`),true);
    await evaluate(`globalThis.ImageCapture=undefined;globalThis.systemCaptureCalls=0;globalThis.savedInputClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.hasAttribute('capture'))globalThis.systemCaptureCalls++;else globalThis.savedInputClick.call(this)};document.querySelector('[data-camera]').click()`);
    assert.equal(await evaluate(`globalThis.systemCaptureCalls`),1);
    assert.equal(await evaluate(`!!document.querySelector('.cameraDialog')`),false);
    await evaluate(`HTMLInputElement.prototype.click=globalThis.savedInputClick;globalThis.ImageCapture=globalThis.savedCapture;if(globalThis.savedDevices)Object.defineProperty(navigator,'mediaDevices',globalThis.savedDevices);else delete navigator.mediaDevices`);
  }
  // Mode-scoped photographs/results, menu disclaimer and ingredient-only risk.
  await evaluate(`document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'));document.querySelector('#restaurantMode').click()`);
  assert.equal(await evaluate(`document.querySelector('#menuWarning').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('#addProduct').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
  assert.ok((await evaluate(`document.querySelector('#menuWarning').textContent`)).includes('ADPAI may make mistakes'));
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=520;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1600,520);ctx.fillStyle='black';ctx.font='42px sans-serif';
    ctx.fillText('Peanut noodles: peanut, wheat',30,100);ctx.fillText('Tomato soup: cream, tomato',30,240);ctx.fillText('Garden salad: lettuce, tomato',30,380);
    if(${realOcr&&process.env.MENU_CARD_OCR==='1'}){
      // Authored synthetic card menu, not the user's Naver image or a real menu.
      canvas.width=1000;canvas.height=620;ctx.fillStyle='#193e79';ctx.fillRect(0,0,1000,620);ctx.fillStyle='white';
      ctx.font='28px sans-serif';ctx.fillText('Tomato soup',45,105);ctx.fillText('Garden salad',535,105);ctx.fillText('굴 라멘',45,350);
      ctx.font='17px sans-serif';ctx.fillText('Cream and tomato',45,132);ctx.fillText('Lettuce and tomato',535,132);ctx.fillText('통영에서 받은 굴을 사용한',45,380);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));globalThis.testMenuFile=new File([blob],'menu.png',{type:'image/png'});const files=new DataTransfer();files.items.add(globalThis.testMenuFile);
    const input=document.querySelector('#products input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    for(const id of ${JSON.stringify(realOcr&&process.env.MENU_CARD_OCR==='1'?['milk','peanut','shellfish']:['milk','peanut'])}){const c=document.querySelector('#chips input[value='+id+']');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))}
    globalThis.testOcrText='Peanut noodles: peanut, wheat\\nTomato soup: cream, tomato\\nGarden salad: lettuce, tomato';
    document.querySelector('#analyze').click();const end=Date.now()+${realOcr?180000:20000};while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw Error('menu analysis timeout');await new Promise(r=>setTimeout(r,25))}
  })()`);
  if(process.env.GENERATED_MENU_IMAGE){
    const data=await evaluate(`(async()=>{return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(globalThis.testMenuFile)})})()`);
    await fs.writeFile(process.env.GENERATED_MENU_IMAGE,Buffer.from(data,'base64'));
  }
  assert.equal(await evaluate(`document.querySelector('#rtitle').textContent`),'Menu review');
  const menuCards=await evaluate(`[...document.querySelectorAll('.presult')].map(e=>({name:e.querySelector('.prtitle').textContent,message:e.querySelector('.prmsg').textContent}))`);
  if(process.env.MENU_DIAGNOSTICS)await fs.writeFile(process.env.MENU_DIAGNOSTICS,JSON.stringify({cards:menuCards,body:await evaluate(`document.querySelector('#result').textContent`)},null,2)+'\n');
  if(process.env.MENU_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(process.env.MENU_SCREENSHOT,Buffer.from(data,'base64'))}
  assert.ok(menuCards.some(c=>/Tomato/i.test(c.name)&&c.message.includes('Potential risk')));
  if(realOcr&&process.env.MENU_CARD_OCR==='1')assert.ok(menuCards.some(c=>/굴/u.test(c.name)&&c.message.includes('Potential risk')),'printed Korean oyster must be read and associated');
  assert.ok(menuCards.every(c=>!/(?:verified safe|no listed conflict)/i.test(c.message)));
  assert.ok((await evaluate(`document.querySelector('#productResults .rawOcr').textContent`)).includes('Dish names alone cannot establish ingredients or safety.'));
  if(!realOcr){assert.equal(menuCards.length,3);assert.ok(menuCards.find(c=>c.name==='Garden salad').message.includes('Ingredients incomplete'))}
  await evaluate(`document.querySelector('#lang').value='ko';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
  assert.ok((await evaluate(`document.querySelector('#menuWarning').textContent`)).includes('오류'));
  assert.equal(await evaluate(`document.querySelector('#menuDietary').hidden`),false);
  assert.ok((await evaluate(`document.querySelector('#vegetarianDetail').textContent`)).includes('우유와 달걀은 허용'));
  if(!realOcr){
    // A menu-only preference works with zero allergens/custom terms, is locked
    // during OCR, invalidates stale results and never leaks into shopping.
    await evaluate(`document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'));for(const input of document.querySelectorAll('#chips input')){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}))}const pork=document.querySelector('#menuDietary input[value=avoid_pork]');pork.checked=true;pork.dispatchEvent(new Event('change',{bubbles:true}));globalThis.testOcrText='Rice bowl: pork\\nSoup: broth\\nSalad: lettuce';globalThis.testOcrDelay=25;document.querySelector('#analyze').click()`);
    assert.equal(await evaluate(`[...document.querySelectorAll('#menuDietary input')].every(e=>e.disabled)`),true);
    await evaluate(`(async()=>{const end=Date.now()+20000;while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw Error('dietary menu timeout');await new Promise(r=>setTimeout(r,25))}globalThis.testOcrDelay=0})()`);
    assert.equal(await evaluate(`document.querySelector('.presult').classList.contains('danger')`),true);
    assert.ok((await evaluate(`document.querySelector('.presult .evidence').textContent`)).includes('Avoid pork (pork)'));
    assert.ok((await evaluate(`document.querySelectorAll('.presult')[1].textContent`)).includes('Source or reading uncertain'));
    assert.ok((await evaluate(`document.querySelectorAll('.presult')[2].textContent`)).includes('Ingredients incomplete'));
    await evaluate(`(async()=>{globalThis.testOcrText='Letters without dish boundaries';document.querySelector('#analyze').click();const end=Date.now()+20000;while(!document.querySelector('#result').classList.contains('show')){if(Date.now()>end)throw Error('raw menu timeout');await new Promise(r=>setTimeout(r,25))}})()`);
    assert.equal(await evaluate(`document.querySelectorAll('.presult').length`),0);
    assert.ok((await evaluate(`document.querySelector('#productResults').textContent`)).includes('Some text was read, but dishes could not be separated reliably.'));
    assert.ok((await evaluate(`document.querySelector('#productResults .rawOcr').textContent`)).includes('Letters without dish boundaries'));
    assert.equal(await evaluate(`Object.hasOwn(JSON.parse(localStorage.getItem('aller_profile')),'dietary_preferences')`),false);
    await evaluate(`const v=document.querySelector('#menuDietary input[value=vegetarian]');v.checked=true;v.dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
    assert.equal(await evaluate(`document.querySelector('#continuePhotos').disabled`),false);
    assert.ok((await evaluate(`document.querySelector('#vegetarianDetail').textContent`)).includes('Milk and eggs allowed'));
    if(process.env.DIETARY_SCREENSHOT){
      await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
      const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(process.env.DIETARY_SCREENSHOT,Buffer.from(data,'base64'));
    }
    await evaluate(`document.querySelector('#shoppingMode').click()`);
    assert.equal(await evaluate(`document.querySelector('#menuDietary').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled && document.querySelector('#continuePhotos').disabled`),true);
    assert.ok((await evaluate(`document.querySelector('#selectionCount').textContent`)).includes('No ingredients selected'));
    await evaluate(`document.querySelector('#restaurantMode').click()`);
    assert.equal(await evaluate(`document.querySelector('#analyze').disabled`),false);
    const reloaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));await send('Page.reload');await reloaded;
    await evaluate(`document.querySelector('#restaurantMode').click()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#menuDietary input:checked')].map(e=>e.value)`),['avoid_pork','vegetarian']);
    assert.equal(await evaluate(`document.querySelectorAll('#chips input:checked').length`),0);
    assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
  }
  await evaluate(`document.querySelector('#backHome').click()`);
  assert.equal(await evaluate(`document.querySelector('#workflow').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#result').classList.contains('show')`),false);
  await evaluate(`document.querySelector('#shoppingMode').click();document.querySelector('#lang').value='en';document.querySelector('#lang').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#menuWarning').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#menuDietary').hidden`),true);
  // Cosmetics uses separate rules. Controlled OCR here does not measure accuracy.
  if(!realOcr){
    const foodProfile=await evaluate(`localStorage.getItem('aller_profile')`);
    assert.ok((await evaluate(`document.querySelector('#cosmeticsMode').getAttribute('href')`)).endsWith('cosmetics.html'));
    const careLoaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}cosmetics.html`});await careLoaded;
    await evaluate(`(async()=>{const end=Date.now()+10000;while(!document.querySelector('#catalogScope').textContent){if(Date.now()>end)throw Error('cosmetic page load timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.equal(await evaluate(`document.querySelector('#careAnalyze').disabled`),true);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'cosmetics phone layout overflow');
    await evaluate(`(async()=>{
      document.querySelector('#careInputMode').value='typed';document.querySelector('#careInputMode').dispatchEvent(new Event('change'));
      document.querySelector('#avoidCoconut').checked=true;document.querySelector('#avoidCoconut').dispatchEvent(new Event('change'));
      document.querySelector('#careText').value='Ingredients: Water, Cocos Nucifera (Coconut) Oil, Cocamidopropyl Betaine, Unknown Complex 7';document.querySelector('#careText').dispatchEvent(new Event('input'));document.querySelector('#careAnalyze').click();
      const end=Date.now()+10000;while(document.querySelector('#careResult').hidden){if(Date.now()>end)throw Error('cosmetic manual result timeout');await new Promise(r=>setTimeout(r,10))}
    })()`);
    assert.ok((await evaluate(`document.querySelector('#careResultTitle').textContent`)).includes('Selected name listed'));
    assert.ok((await evaluate(`document.querySelector('#careSummary').textContent`)).includes('entered text, not OCR'));
    assert.ok((await evaluate(`document.querySelector('#careMatches').textContent`)).includes('not proof of coconut protein'));
    assert.ok((await evaluate(`document.querySelector('#careRows').textContent`)).includes('Unknown Complex 7'));
    await evaluate(`document.querySelector('#careLang').value='ko';document.querySelector('#careLang').dispatchEvent(new Event('change'))`);
    assert.ok((await evaluate(`document.querySelector('#careRows').textContent`)).includes('코코넛 오일'));
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true,'Korean cosmetics phone layout overflow');
    if(process.env.COSMETICS_SCREENSHOT){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(process.env.COSMETICS_SCREENSHOT,Buffer.from(data,'base64'))}
    await evaluate(`(async()=>{
      document.querySelector('#careInputMode').value='photos';document.querySelector('#careInputMode').dispatchEvent(new Event('change'));
      globalThis.testOcrText='전성분: 정제수, 나이아신아마이드, 코코넛야자오일, 코카미도프로필베타인, 미등록성분999';
      const c=document.createElement('canvas');c.width=1200;c.height=400;c.getContext('2d').fillRect(0,0,1200,400);const f=new File([await new Promise(r=>c.toBlob(r))],'cosmetic-label.png',{type:'image/png'});
      const transfer=new DataTransfer();transfer.items.add(f);const input=document.querySelector('#careFiles');input.files=transfer.files;input.dispatchEvent(new Event('change'));document.querySelector('#careAnalyze').click();
      const end=Date.now()+15000;while(document.querySelector('#careResult').hidden){if(Date.now()>end)throw Error('cosmetic photo result timeout');await new Promise(r=>setTimeout(r,20))}
    })()`);
    assert.ok((await evaluate(`document.querySelector('#careResultTitle').textContent`)).includes('성분명이 표시됨'));
    assert.ok((await evaluate(`document.querySelector('#careSummary').textContent`)).includes('OCR 추정'));
    assert.ok((await evaluate(`document.querySelector('#careRows').textContent`)).includes('Niacinamide'));
    assert.ok((await evaluate(`document.querySelector('#careRows').textContent`)).includes('미등록성분999'));
    assert.equal(await evaluate(`localStorage.getItem('aller_profile')`),foodProfile,'cosmetics must not read or overwrite the food allergy profile');
    await evaluate(`document.querySelector('#careReset').click()`);
    assert.equal(await evaluate(`document.querySelector('#careResult').hidden&&document.querySelector('#careAnalyze').disabled`),true);
    await evaluate(`(async()=>{document.querySelector('#careInputMode').value='typed';document.querySelector('#careInputMode').dispatchEvent(new Event('change'));document.querySelector('#careLang').value='en';document.querySelector('#careLang').dispatchEvent(new Event('change'));document.querySelector('#careText').value='Ingredients: Mystery compound';document.querySelector('#careText').dispatchEvent(new Event('input'));document.querySelector('#careAnalyze').click();await new Promise(r=>setTimeout(r,20))})()`);
    assert.equal(await evaluate(`document.querySelector('#careResultTitle').textContent`),'Unable to verify suitability');
    const returnLoaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}`});await returnLoaded;
  }
  if(!mobileWeb&&!realOcr){
    const labLoaded=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}device-check.html`});await labLoaded;
    await evaluate(`(async()=>{const end=Date.now()+10000;while(document.querySelector('#checkVersion').textContent!=='1.11.0'){if(Date.now()>end)throw Error('device page load timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.equal(await evaluate(`document.querySelector('#takeTestPhoto').disabled`),true);
    await evaluate(`document.querySelector('#physicalConfirmed').checked=true;document.querySelector('#physicalConfirmed').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`document.querySelector('#takeTestPhoto').disabled`),true,'capture target must be chosen rather than silently recorded as paper');
    await evaluate(`(async()=>{
      document.querySelector('#target').value='screen';document.querySelector('#target').dispatchEvent(new Event('change'));
      globalThis.labShares=[];
      Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>['image/png','text/plain'].includes(files[0].type)});
      Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{globalThis.labShares.push({name:data.files[0].name,type:data.files[0].type,content:data.files[0].type==='text/plain'?await data.files[0].text():null,size:data.files[0].size});if(globalThis.shareError)throw new DOMException('cancelled or unavailable',globalThis.shareError)}});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(globalThis.clipboardError)throw Error('clipboard unavailable');globalThis.labCopied=text}}});
      const still=document.createElement('canvas');still.width=1600;still.height=1200;still.getContext('2d').fillRect(0,0,1600,1200);globalThis.labStill=new File([await new Promise(r=>still.toBlob(r))],'private-original-name.png',{type:'image/png'});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);globalThis.labStream=c.captureStream(2);return globalThis.labStream}}});
      globalThis.ImageCapture=class{async takePhoto(){return globalThis.labStill}};
      document.querySelector('#physicalConfirmed').checked=true;document.querySelector('#physicalConfirmed').dispatchEvent(new Event('change'));document.querySelector('#takeTestPhoto').click();
      const end=Date.now()+15000;while(!document.querySelector('[data-camera-action=take]')||document.querySelector('[data-camera-action=take]').disabled){if(Date.now()>end)throw Error('lab camera timeout');await new Promise(r=>setTimeout(r,20))}
      document.querySelector('[data-camera-action=take]').click();
      const resultEnd=Date.now()+30000;while(document.querySelector('#testResult').hidden){if(Date.now()>resultEnd)throw Error('device report timeout');await new Promise(r=>setTimeout(r,25))}
    })()`);
    const lab=await evaluate(`JSON.parse(document.querySelector('#reportPreview').value)`);
    assert.equal(lab.capture.route,'image_capture');assert.equal(lab.capture.width,1600);assert.equal(lab.capture.preview_width,640);
    assert.equal(lab.physical_capture_confirmed_by_user,true);assert.equal(lab.physical_hardware_verified,false);assert.equal(lab.accuracy_validated,false);
    assert.deepEqual(lab.analysis.direct_allergens,['milk']);assert.deepEqual(lab.analysis.missing_known_allergens,['wheat','egg']);
    assert.equal(lab.privacy.automatic_upload,false);assert.ok(!JSON.stringify(lab).includes('private-original-name'));
    assert.equal(lab.capture.target_declared,'screen');
    assert.equal(await evaluate(`document.querySelector('#downloadReport').hasAttribute('href')`),true);
    assert.equal(await evaluate(`globalThis.labShares.length`),0,'exports cannot happen automatically');
    assert.equal(await evaluate(`globalThis.labStream.getTracks().every(t=>t.readyState==='ended')`),true);
    await evaluate(`(async()=>{document.querySelector('#shareReport').click();const end=Date.now()+5000;while(document.querySelector('#shareReport').disabled){if(Date.now()>end)throw Error('share timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    const reportShare=await evaluate(`globalThis.labShares[0]`);assert.equal(reportShare.name,'adpai-device-report.txt');assert.equal(reportShare.type,'text/plain');assert.deepEqual(JSON.parse(reportShare.content),lab,'JSON-unsupported file sharing must retain the exact report');
    await evaluate(`(async()=>{globalThis.shareError='AbortError';document.querySelector('#sharePhoto').click();const end=Date.now()+5000;while(document.querySelector('#sharePhoto').disabled){if(Date.now()>end)throw Error('cancelled share timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.ok((await evaluate(`document.querySelector('#exportStatus').textContent`)).includes('لغو شد'));
    assert.equal(await evaluate(`globalThis.labShares[1].name`),'adpai-camera-original.png');
    assert.equal(await evaluate(`globalThis.labShares[1].size===globalThis.labStill.size`),true,'photo sharing must not recompress the original');
    assert.equal(await evaluate(`document.querySelector('#testResult').hidden||document.querySelector('#photoExport').hidden`),false,'cancelled sharing must retain the result');
    await evaluate(`(async()=>{globalThis.shareError='NotSupportedError';document.querySelector('#shareReport').click();const end=Date.now()+5000;while(document.querySelector('#shareReport').disabled){if(Date.now()>end)throw Error('failed share timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.ok((await evaluate(`document.querySelector('#exportStatus').textContent`)).includes('انجام نشد'));
    await evaluate(`(async()=>{document.querySelector('#copyReport').click();const end=Date.now()+5000;while(!globalThis.labCopied){if(Date.now()>end)throw Error('copy report timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.deepEqual(await evaluate(`JSON.parse(globalThis.labCopied)`),lab);
    await evaluate(`(async()=>{globalThis.clipboardError=true;document.querySelector('#copyReport').click();const end=Date.now()+5000;while(!document.querySelector('#exportStatus').textContent.includes('کپی خودکار')){if(Date.now()>end)throw Error('manual copy timeout');await new Promise(r=>setTimeout(r,10))}})()`);
    assert.equal(await evaluate(`(()=>{const box=document.querySelector('#reportPreview');return document.querySelector('#reportDetails').open&&box.selectionStart===0&&box.selectionEnd===box.value.length})()`),true,'report must remain selectable without clipboard/download/Web Share support');
    await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
    assert.equal(await evaluate(`document.querySelector('#testResult').hidden`),false,'back navigation or external viewer must not clear completed evidence');
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    await tap('#downloadReport');await tap('#downloadPhoto');
    const downloadEnd=Date.now()+10000;
    while(true){try{await fs.access(path.join(downloads,'adpai-device-report.json'));await fs.access(path.join(downloads,'adpai-camera-original.png'));break}catch{if(Date.now()>downloadEnd)throw Error('local evidence download timeout');await new Promise(r=>setTimeout(r,20))}}
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(downloads,'adpai-device-report.json'),'utf8')),lab);
    const downloadedPhoto=await fs.readFile(path.join(downloads,'adpai-camera-original.png'));
    const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(downloadedPhoto).digest('hex'),lab.capture.image_sha256,'download must contain original photo bytes');
    await evaluate(`document.querySelector('#target').value='paper';document.querySelector('#target').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`!document.querySelector('#downloadReport').hasAttribute('href')&&document.querySelector('#testResult').hidden`),true,'changed test conditions must invalidate the previous report');
    assert.equal(await evaluate(`document.querySelector('#photoExport').hidden&&!document.querySelector('#openPhoto').hasAttribute('href')&&document.querySelector('#copyReport').disabled`),true);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
    const restored=new Promise(resolve=>listeners.set('Page.loadEventFired',[resolve]));await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${prefix}`});await restored;
  }
  if(!mobileWeb) {
    await evaluate(`(async()=>{await navigator.serviceWorker.ready;const end=Date.now()+15000;while(!navigator.serviceWorker.controller){if(Date.now()>end)throw new Error('service worker did not claim page');await new Promise(r=>setTimeout(r,25))}})()`);
    const cache=await evaluate(`(async()=>({scope:(await navigator.serviceWorker.ready).scope,urls:(await Promise.all((await caches.keys()).map(async key=>(await (await caches.open(key)).keys()).map(r=>r.url)))).flat()}))()`);
    assert.ok(cache.scope.endsWith(prefix));
    assert.ok(cache.urls.some(url=>url.endsWith('/src/engine.js?v=1.11.0')));
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
    const offlineStatus=await evaluate(`(async()=>{const {analyzeProducts}=await import('./src/tesseract.js?v=1.11.0');globalThis.Tesseract=undefined;const result=await analyzeProducts([{id:1,photos:[{file:{}}]}],{allergens:['milk']});return result.products[0].status})()`);
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
  await fs.rm(downloads,{recursive:true,force:true,maxRetries:3});
}
