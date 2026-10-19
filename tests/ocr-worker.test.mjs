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
