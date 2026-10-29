import {createManagedWorker} from './ocr-worker.js?v=1.11.0';
import {preprocess,rotateCanvas,releasePhotoSource} from './image.js?v=1.11.0';
import {itemsFrom} from './tesseract.js?v=1.11.0';
import {readMenuPhoto} from './menu-ocr.js?v=1.11.0';

// Reuse only the bounded multi-column pixel reader. No dish, food allergen,
// recipe, or medical classifier runs on cosmetic labels.
export async function readCosmeticPhotos(files,{onProgress=()=>{},createWorker=globalThis.ADPAI_CREATE_OCR_WORKER||createManagedWorker,prepare=preprocess,rotate=rotateCanvas,maxPhotoMs=65000}={}){
 const sources=[],errors=[];let worker;
 try{
  worker=await createWorker(['kor','eng'],1,{...globalThis.ADPAI_OCR_OPTIONS?.({langs:['kor','eng']}),logger:()=>{}});
  for(const [photoIndex,file] of files.entries()){
   let canvas;const started=Date.now();
   try{
    if(worker.closed)throw Error('OCR worker unavailable');onProgress(photoIndex+1,files.length);
    canvas=await prepare(file,false,{preserveOriginal:true});
    if(typeof worker.reinitialize==='function'&&typeof worker.setParameters==='function'){
     // Ingredient panels are dense paragraphs. Sparse menu segmentation can
     // drop commas and confuse Korean syllables, so read actual whole-panel
     // pixels with paragraph segmentation in each language before sparse views.
     for(const language of ['kor','eng']){
      if(worker.closed||Date.now()-started>=maxPhotoMs)break;
      try{
       await worker.reinitialize([language],1);await worker.setParameters({tessedit_pageseg_mode:'6'});
       const result=await worker.recognize(canvas,{timeoutMs:Math.max(1,maxPhotoMs-(Date.now()-started))});
       sources.push({familyId:'korean',photoIndex,rotation:0,variant:'cosmetic-paragraph-'+language,model_languages:[language],segmentation:'6',items:itemsFrom(result)});
      }catch{errors.push({photoIndex,message:'Cosmetic paragraph reading incomplete'})}
     }
     const remaining=maxPhotoMs-(Date.now()-started);
     if(remaining>0&&!worker.closed){const result=await readMenuPhoto({worker,canvas,photoIndex,familyId:'korean',rotate,itemsFrom,maxPhotoMs:remaining});sources.push(...result.sources);errors.push(...result.errors)}
     else errors.push({photoIndex,message:'Cosmetic OCR photo time budget reached'});
    }else{
     const result=await worker.recognize(canvas,{timeoutMs:maxPhotoMs});sources.push({familyId:'korean',photoIndex,rotation:0,items:itemsFrom(result)});
    }
   }catch{errors.push({photoIndex,message:'Cosmetic label reading incomplete'})}
   finally{releasePhotoSource(canvas)}
  }
 }catch{errors.push({message:'Cosmetic OCR could not start'})}
 finally{try{await worker?.terminate()}catch{}}
 return {sources,errors};
}
