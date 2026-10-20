// Prepare the frozen development corpora with the app's actual browser image
// decoder/resize path. No model output, inferred recipe or human reference.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {loadEvidence} from './diagnostic-evidence.mjs';
import {loadMenuEvidence} from './menu-evidence.mjs';
const args=process.argv.slice(2),arg=(key,def)=>args.includes(key)?args[args.indexOf(key)+1]:def;
if(!arg('--output'))throw Error('Required: --output NEW-DIRECTORY [--labels evidence.jsonl] [--menus menu-evidence.jsonl]');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(arg('--output'));
const corpora=[];
if(arg('--labels'))corpora.push({...await loadEvidence(arg('--labels')),kind:'label',manifest:path.resolve(arg('--labels'))});
if(arg('--menus'))corpora.push({...await loadMenuEvidence(arg('--menus')),kind:'menu',manifest:path.resolve(arg('--menus'))});
if(!corpora.length)throw Error('No supplied development corpus');
const images=new Map();
for(const corpus of corpora)for(const row of corpus.records){
 if(!/^[a-zA-Z0-9_-]+$/u.test(row.capture_id))throw Error('Capture identity must be a safe filename');
 if(row.images.length!==1||images.has(row.capture_id))throw Error('This diagnostic expects one unique image per capture');
 images.set(row.capture_id,{row,kind:corpus.kind,path:path.join(corpus.root,row.images[0].path)});
}
await fs.mkdir(out,{recursive:false});
const inputSource=await fs.readFile(path.join(root,'src/image.js'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/') {res.setHeader('Content-Type','text/html');res.end('<script type="module">import {preprocess} from "/image.js";globalThis.prepareImage=preprocess;</script>');return;}
  if(u.pathname==='/image.js'){res.setHeader('Content-Type','text/javascript');res.end(inputSource);return;}
  const image=images.get(u.searchParams.get('id'));if(u.pathname!=='/image'||!image)throw Error('Not supplied');
  res.setHeader('Content-Type',image.path.endsWith('.png')?'image/png':'image/jpeg');res.end(await fs.readFile(image.path));
 }catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'adpai-prep-'));
const chrome=spawn(process.env.CHROMIUM_PATH||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','pipe']});
let log='',socket;chrome.stderr.on('data',chunk=>log+=chunk);
try{
 const deadline=Date.now()+20000;
 while(!/DevTools listening on (ws:\/\/\S+)/u.test(log)){
  if(Date.now()>deadline||chrome.exitCode!=null)throw Error('Chromium startup failed');
  await new Promise(r=>setTimeout(r,50));
 }
 const ws=log.match(/DevTools listening on (ws:\/\/\S+)/u)[1];
 const pages=await(await fetch(new URL('/json/list',ws.replace('ws:','http:')))).json();
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let id=0;const pending=new Map();
 socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
 const output=[];
 for(const [capture_id,image] of images){
  const response=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const end=Date.now()+10000;while(!globalThis.prepareImage){if(Date.now()>end)throw Error('preprocessor not loaded');await new Promise(r=>setTimeout(r,20))}const blob=await(await fetch('/image?id='+encodeURIComponent(${JSON.stringify(capture_id)}))).blob();const canvas=await prepareImage(new File([blob],'input',{type:blob.type}),false);return {width:canvas.width,height:canvas.height,data:canvas.toDataURL('image/png').split(',')[1]}})()`});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
  const {width,height,data}=response.result.value,bytes=Buffer.from(data,'base64'),file=capture_id+'.png';
  await fs.writeFile(path.join(out,file),bytes,{flag:'wx'});
  output.push({capture_id,kind:image.kind,file,sha256:sha(bytes),width,height,original_sha256:image.row.images[0].sha256});
 }
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify({kind:'browser-preprocessed inputs for optional native development diagnostic; not human reference',image_module_sha256:sha(inputSource),capture_count:output.length,corpora:corpora.map(c=>({manifest:c.manifest,sha256:c.dataset_sha256})),photos_uploaded_to_external_service:false},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({prepared:output.length,output:out}));
}finally{
 socket?.close();
 const stopped=once(chrome,'exit');chrome.kill('SIGTERM');
 let timer;await Promise.race([stopped,new Promise(resolve=>{timer=setTimeout(resolve,5000)})]);clearTimeout(timer);
 if(chrome.exitCode==null){chrome.kill('SIGKILL');await stopped;}
 await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
