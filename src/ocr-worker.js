// Own the pinned Tesseract.js 5.1.1 worker lifecycle. Its createWorker promise
// does not reject a failed loadLanguage/initialize job. Owning the Worker lets
// us reject, terminate and release memory on every error/timeout instead.
const SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
export function flattenWords(data){
  if(Array.isArray(data.words))return data;
  const words=[];
  for(const [block_num,block] of (data.blocks||[]).entries())
    for(const [par_num,paragraph] of (block.paragraphs||[]).entries())
      for(const [line_num,line] of (paragraph.lines||[]).entries())
        for(const word of line.words||[])words.push({...word,block_num,par_num,line_num,line:{bbox:line.bbox}});
  return {...data,words};
}
export async function createManagedWorker(langs,oem=1,options={}){
  const {workerPath=SCRIPT,logger=()=>{},initializationTimeoutMs=45000,recognitionTimeoutMs=30000,
    WorkerClass=globalThis.Worker,userWords=[],legacyCore=false,...runtime}=options;
  if(!Array.isArray(userWords)||userWords.length>1000||userWords.some(word=>typeof word!=='string'||!word.trim()||word.length>200||/[\r\n\0]/u.test(word)))throw Error('Invalid OCR vocabulary');
  const vocabulary=[...new Set(userWords)].join('\n')+'\n';
  if(new TextEncoder().encode(vocabulary).length>131072)throw Error('OCR vocabulary too large');
  const config=userWords.length?{user_words_file:'/adpai-user-words'}:{};
  const script=new URL(workerPath,globalThis.location?.href);
  if(!['https:','http:'].includes(script.protocol))throw Error('Unsupported OCR worker URL');
  const bootstrap=URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(script.href)});`],{type:'application/javascript'}));
  let worker,closed=false,counter=0;
  const pending=new Map();
  const terminate=(reason=new Error('OCR worker terminated'))=>{
    if(closed)return;closed=true;worker?.terminate();URL.revokeObjectURL(bootstrap);
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(reason)}
    pending.clear();
  };
  try{worker=new WorkerClass(bootstrap)}catch(error){terminate(error);throw error}
  const job=(action,payload,timeout)=>new Promise((resolve,reject)=>{
    if(closed){reject(Error('OCR worker is closed'));return}
    const jobId=String(++counter),timer=setTimeout(()=>terminate(new Error('OCR timeout: '+action)),timeout);
    pending.set(jobId,{resolve,reject,timer});
    try{worker.postMessage({workerId:'adpai',jobId,action,payload})}catch(error){terminate(error)}
  });
  worker.onmessage=({data:message})=>{
    const current=pending.get(message.jobId);if(!current)return;
    if(message.status==='progress'){logger(message.data);return}
    if(message.status==='reject'){terminate(new Error(String(message.data||'OCR worker failed')));return}
    if(message.status==='resolve'){
      clearTimeout(current.timer);pending.delete(message.jobId);current.resolve({data:message.data});
    }
  };
  worker.onerror=event=>terminate(new Error(event.message||'OCR worker failed'));
  worker.onmessageerror=()=>terminate(new Error('OCR worker message could not be decoded'));
  try{
    await job('load',{options:{lstmOnly:!legacyCore,corePath:runtime.corePath,logging:false}},initializationTimeoutMs);
    await job('loadLanguage',{langs,options:{...runtime,lstmOnly:!legacyCore,gzip:runtime.gzip!==false}},initializationTimeoutMs);
    if(userWords.length)await job('FS',{method:'writeFile',args:['/adpai-user-words',vocabulary]},initializationTimeoutMs);
    await job('initialize',{langs,oem,config},initializationTimeoutMs);
  }catch(error){terminate(error);throw error}
  return {
    get closed(){return closed},
    async reinitialize(nextLangs,nextOem=oem){
      const loaded=new Set(typeof langs==='string'?langs.split('+'):langs);
      if(!nextLangs.every(lang=>loaded.has(lang)))throw Error('OCR language was not loaded');
      if(nextOem===0&&!legacyCore)throw Error('Legacy OCR was not enabled');
      return job('initialize',{langs:nextLangs,oem:nextOem,config},initializationTimeoutMs);
    },
    async recognize(image,{timeoutMs=recognitionTimeoutMs}={}){
      let blob;
      if(image instanceof Blob)blob=image;
      else if(image?.convertToBlob)blob=await image.convertToBlob({type:'image/png'});
      else if(image?.toBlob)blob=await new Promise((resolve,reject)=>image.toBlob(value=>value?resolve(value):reject(Error('Image encoding failed')),'image/png'));
      else throw Error('Unsupported OCR image');
      const result=await job('recognize',{image:new Uint8Array(await blob.arrayBuffer()),options:{},output:{blocks:true,text:true,hocr:false,tsv:false}},Math.max(1,Math.min(recognitionTimeoutMs,timeoutMs)));
      return {data:flattenWords(result.data)};
    },
    setParameters:params=>job('setParameters',{params},initializationTimeoutMs),
    terminate:async()=>terminate(),
  };
}
