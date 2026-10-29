import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedWorker,flattenWords} from '../src/ocr-worker.js';
function fake({fail,hang}={}){
 let terminated=0;
 class Worker{
  postMessage(message){
   if(message.action===hang)return;
   queueMicrotask(()=>this.onmessage({data:{jobId:message.jobId,status:message.action===fail?'reject':'resolve',data:message.action===fail?'model unavailable':message.action==='recognize'?{text:'milk',blocks:[{paragraphs:[{lines:[{bbox:{x0:1,y0:2,x1:40,y1:30},words:[{text:'milk',confidence:31,bbox:{x0:1,y0:2,x1:40,y1:30}}]}]}]}]}:{}}}));
  }
  terminate(){terminated++}
 }
 return {Worker,get terminated(){return terminated}};
}
test('loadLanguage rejection rejects initialization and terminates the worker',async()=>{
 const f=fake({fail:'loadLanguage'});
 await assert.rejects(createManagedWorker(['eng'],1,{WorkerClass:f.Worker,initializationTimeoutMs:200}),/model unavailable/u);
 assert.equal(f.terminated,1);
});
test('a model load that never replies has a bounded deadline and releases the worker',async()=>{
 const f=fake({hang:'loadLanguage'});
 await assert.rejects(createManagedWorker(['eng'],1,{WorkerClass:f.Worker,initializationTimeoutMs:10}),/OCR timeout/u);
 assert.equal(f.terminated,1);
});
test('recognition preserves low word confidence and line bounds, then terminates',async()=>{
 const f=fake(),w=await createManagedWorker(['eng'],1,{WorkerClass:f.Worker});
 const r=await w.recognize(new Blob(['fixture']));
 assert.equal(r.data.words[0].confidence,31);assert.equal(r.data.words[0].line.bbox.y0,2);
 await w.terminate();await w.terminate();assert.equal(f.terminated,1);assert.equal(w.closed,true);
 assert.equal(flattenWords({words:[{confidence:10}]}).words[0].confidence,10);
});
test('optional local vocabulary is installed before initialization and retained across language switches',async()=>{
 const calls=[];class Worker{
  postMessage(message){calls.push(message);queueMicrotask(()=>this.onmessage({data:{jobId:message.jobId,status:'resolve',data:message.action==='recognize'?{words:[{text:'코코넛야자오일',confidence:21}]}:{}}}))}
  terminate(){}
 }
 const w=await createManagedWorker(['kor','eng'],1,{WorkerClass:Worker,userWords:['코코넛야자오일','나이아신아마이드']});
 const file=calls.find(c=>c.action==='FS');assert.equal(file.payload.method,'writeFile');assert.ok(calls.indexOf(file)<calls.findIndex(c=>c.action==='initialize'));
 assert.ok(file.payload.args[1].includes('코코넛야자오일\n'));await w.reinitialize(['kor']);
 const inits=calls.filter(c=>c.action==='initialize');assert.ok(inits.every(c=>c.payload.config.user_words_file===file.payload.args[0]));
 const r=await w.recognize(new Blob(['fixture']));assert.equal(r.data.words[0].confidence,21,'lexicon cannot overwrite returned word scores');await w.terminate();
 await assert.rejects(createManagedWorker(['kor'],1,{WorkerClass:Worker,userWords:['bad\nconfiguration']}),/Invalid OCR vocabulary/u);
});
test('classic decoding is opt-in and cannot silently change the normal LSTM-only food reader',async()=>{
 const calls=[];class Worker{postMessage(message){calls.push(message);queueMicrotask(()=>this.onmessage({data:{jobId:message.jobId,status:'resolve',data:{}}}))}terminate(){}}
 const normal=await createManagedWorker(['kor'],1,{WorkerClass:Worker});assert.equal(calls.find(c=>c.action==='load').payload.options.lstmOnly,true);await assert.rejects(normal.reinitialize(['kor'],0),/not enabled/u);await normal.terminate();calls.length=0;
 const dual=await createManagedWorker(['kor'],1,{WorkerClass:Worker,legacyCore:true,cachePath:'separate-model-cache'});assert.equal(calls.find(c=>c.action==='load').payload.options.lstmOnly,false);assert.equal(calls.find(c=>c.action==='loadLanguage').payload.options.cachePath,'separate-model-cache');await dual.reinitialize(['kor'],0);await dual.terminate();
});
