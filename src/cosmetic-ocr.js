import {createManagedWorker} from './ocr-worker.js?v=1.11.1';
import {preprocess,rotateCanvas,releasePhotoSource,needsRetake} from './image.js?v=1.11.1';
import {cosmeticItemsFrom} from './cosmetic-items.js?v=1.11.1';
import {menuReadCanvases,mapMenuItems} from './menu-image.js?v=1.11.1';
import {COSMETIC_GLOSSARY} from './cosmetic-glossary.js?v=1.11.1';

// Complementary decoding of the same pixels is one OCR family, not
// independent allergy corroboration. No food or recipe evaluator runs here.
export const COSMETIC_OCR_PROFILES=Object.freeze([
 {id:'cosmetic-korean-full',langs:['kor'],legacyCore:true,cachePath:'adpai-cosmetic-kor-full-1.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor@1.0.0/4.0.0',passes:[{oem:1,psm:'6'},{oem:0,psm:'6'}]},
 {id:'cosmetic-english',langs:['eng'],legacyCore:false,langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',passes:[{oem:1,psm:'6'}]},
]);
export async function readCosmeticPhotos(files,{onProgress=()=>{},createWorker=globalThis.ADPAI_CREATE_OCR_WORKER||createManagedWorker,prepare=preprocess,rotate=rotateCanvas,maxPhotoMs=65000,now=Date.now}={}){
 const sources=[],errors=[],spent=files.map(()=>0);
 const userWords=[...new Set(COSMETIC_GLOSSARY.flatMap(e=>e.aliases).filter(alias=>/[가-힣]/u.test(alias)&&!/[\r\n]/u.test(alias)))];
 if(!files.length)return {sources,errors};
 for(const profile of COSMETIC_OCR_PROFILES){
  if(spent.every(time=>time>=maxPhotoMs))break;
  let worker,expired=false;
  const open=()=>createWorker(profile.langs,1,{langPath:profile.langPath,cachePath:profile.cachePath,
   ...globalThis.ADPAI_OCR_OPTIONS?.(profile),legacyCore:profile.legacyCore,userWords:profile.legacyCore?userWords:[],logger:()=>{}});
  try{
   worker=await open();
   for(const [photoIndex,file] of files.entries()){
    let canvas;const started=now(),remaining=()=>maxPhotoMs-spent[photoIndex]-(now()-started);
    const deadline=()=>errors.push({photoIndex,profile:profile.id,message:'Cosmetic OCR photo time budget reached'});
    if(remaining()<=0){deadline();continue}
    try{
     if(worker.closed||expired){worker=await open();expired=false}onProgress(photoIndex+1,files.length);
     canvas=await prepare(file,false,{preserveOriginal:true});
     const ow=canvas.ocrOriginal?.naturalWidth||canvas.width,oh=canvas.ocrOriginal?.naturalHeight||canvas.height;
     const frame={x:0,y:0,scale:canvas.width/ow,scaleY:canvas.height/oh,width:ow,height:oh,cropWidth:ow,cropHeight:oh};
     const read=async(view,pass,rotation=0)=>{
      if(worker.closed||expired||remaining()<=0){view.release?.();deadline();return false}
      const currentWorker=worker;let timer,attemptExpired=false;
      try{
       const attempt=(async()=>{
        if(currentWorker.reinitialize)await currentWorker.reinitialize(profile.langs,pass.oem);
        if(attemptExpired)throw Error('Photo deadline');
        if(currentWorker.setParameters)await currentWorker.setParameters({tessedit_pageseg_mode:pass.psm});
        if(attemptExpired)throw Error('Photo deadline');
        return currentWorker.recognize(rotate(view.canvas,rotation),{timeoutMs:Math.max(1,remaining())});
       })();
       const result=await Promise.race([attempt,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=attemptExpired=true;try{Promise.resolve(currentWorker.terminate()).catch(()=>{})}catch{}reject(Error('Photo deadline'))},Math.max(1,remaining()))})]);
       sources.push({familyId:'korean',photoIndex,rotation,profile:profile.id,oem:pass.oem,variant:view.variant,model_languages:profile.langs,
        segmentation:pass.psm,confidence_scope:'uncalibrated_ocr_token_not_safety',frame:view.frame,
        items:rotation?cosmeticItemsFrom(result,{legacy:pass.oem===0}):mapMenuItems(cosmeticItemsFrom(result,{legacy:pass.oem===0}),view.frame)});
       return true;
      }catch{errors.push({photoIndex,profile:profile.id,oem:pass.oem,message:expired?'Cosmetic OCR photo time budget reached':'Cosmetic label reading incomplete'});return !worker.closed&&!expired}
      finally{clearTimeout(timer);view.release?.()}
     };
     for(const pass of profile.passes)if(!await read({canvas,frame,variant:'cosmetic-paragraph'},pass))break;
     if(!worker.closed&&!expired&&remaining()>0&&needsRetake(sources.filter(s=>s.photoIndex===photoIndex&&s.profile===profile.id))){
      const enhanced=await prepare(file,true),view={canvas:enhanced,variant:'cosmetic-enhanced',frame:{...frame,scale:enhanced.width/ow,scaleY:enhanced.height/oh}};
      try{for(const pass of profile.passes)if(!await read(view,pass))break}finally{if(enhanced!==canvas)enhanced.width=enhanced.height=1}
     }
     if(!worker.closed&&!expired&&remaining()>0&&canvas.ocrOriginal&&Math.max(ow,oh)>2400){
      const details=menuReadCanvases(canvas).filter(view=>view.variant.startsWith('menu-detail-')).slice(0,2);
      for(const view of details)if(!await read({...view,variant:view.variant.replace('menu-','cosmetic-')},profile.passes[0]))break;
     }
     if(!worker.closed&&!expired&&remaining()>0&&needsRetake(sources.filter(s=>s.photoIndex===photoIndex&&s.profile===profile.id))){
      for(const rotation of [90,270,180])if(!await read({canvas,frame,variant:'cosmetic-rotated'},profile.passes[0],rotation))break;
     }
    }catch{errors.push({photoIndex,profile:profile.id,message:'Cosmetic photo processing incomplete'})}
    finally{spent[photoIndex]+=now()-started;releasePhotoSource(canvas)}
   }
  }catch{errors.push({profile:profile.id,message:'Cosmetic OCR model could not start'})}
  finally{try{await worker?.terminate()}catch{}}
 }
 return {sources,errors};
}
