import {evaluateProduct,containsAny,MARKERS} from './engine.js?v=1.10.1';
import {extractIngredients} from './ingredients.js?v=1.10.1';
import {preprocess,rotateCanvas,needsRetake,releasePhotoSource} from './image.js?v=1.10.1';
import {menuReadCanvases,mapMenuItems} from './menu-image.js?v=1.10.1';

// Native word scores are uncalibrated model outputs, not probabilities of food
// safety. Both script recognizers and rotations remain one OCR family.
export function nativeItems(result){
  return (result?.items||[]).filter(item=>typeof item.text==='string'&&item.text.trim()).map(item=>{
    const score=item.score,b=item.box;
    const box=b&&['x0','y0','x1','y1'].every(key=>Number.isFinite(b[key]))&&b.x1>b.x0&&b.y1>b.y0?{...b}:null;
    return {...item,score:Number.isFinite(score)&&score>=0&&score<=1?score:0,box,
      confidence_scope:'native_word_uncalibrated'};
  });
}

export async function analyzeNativeProducts(products,profile,{nativeReader,prepare=preprocess,rotate=rotateCanvas,onProgress=()=>{},purpose='shopping',makeMenuViews=menuReadCanvases,maxPhotoMs=65000,now=Date.now}={}){
  const results=[];
  for(const [index,product] of products.entries()){
    const sources=[],errors=[];
    for(const [photoIndex,photo] of product.photos.entries()){
      let canvas;const started=now();let exhausted=false;
      const budgetError=()=>{if(!exhausted)errors.push({family:'korean',photoIndex,message:'Native OCR photo time budget reached'});exhausted=true};
      try{canvas=await prepare(photo.file,false,{preserveOriginal:true})}
      catch{errors.push({family:'korean',photoIndex,message:'Image could not be decoded'});continue}
      const ow=canvas.ocrOriginal?.naturalWidth||canvas.width,oh=canvas.ocrOriginal?.naturalHeight||canvas.height;
      const original={canvas,variant:'native-original',...(canvas.ocrOriginal?{frame:{x:0,y:0,scale:canvas.width/ow,scaleY:canvas.height/oh,width:ow,height:oh,cropWidth:ow,cropHeight:oh}}:{})};
      const read=async(view,rotation,script)=>{
        if(exhausted||now()-started>=maxPhotoMs){budgetError();return false}
        onProgress('Reading photo text on this device…');
        let timer;
        try{
          const base64=rotate(view.canvas,rotation).toDataURL('image/png').split(',')[1];
          const remaining=maxPhotoMs-(now()-started);if(remaining<=0){budgetError();return false}
          const output=await Promise.race([nativeReader({base64,script}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native OCR deadline reached')),Math.min(50000,remaining))})]);
          const frame=rotation?undefined:view.frame,items=nativeItems(output);
          sources.push({familyId:'korean',photoIndex,rotation,variant:view.variant,engine:output.engine,frame,
            model_languages:[script],confidence_scope:'native_word_uncalibrated',items:frame?mapMenuItems(items,frame):items});
          return true;
        }catch(error){errors.push({family:'korean',photoIndex,rotation,script,phase:view.variant,message:String(error?.message||error)});if(/deadline/iu.test(String(error?.message||error)))exhausted=true;return !exhausted}
        finally{clearTimeout(timer)}
      };
      for(const script of ['ko','en'])if(!await read(original,0,script))break;
      const photoSources=()=>sources.filter(s=>s.photoIndex===photoIndex);
      const bestWords=()=>photoSources().map(s=>s.items.filter(w=>/\p{L}/u.test(w.text)))
        .sort((a,b)=>b.reduce((n,w)=>n+w.score*w.text.length,0)-a.reduce((n,w)=>n+w.score*w.text.length,0))[0]||[];
      const letters=bestWords(),chars=letters.reduce((n,w)=>n+w.text.length,0);
      const mean=letters.reduce((n,w)=>n+w.score*w.text.length,0)/Math.max(1,chars);
      const value=evaluateProduct({sources:photoSources(),profile});
      const hits=[...value.direct_matches,...value.caution_matches];
      const selected=(profile.allergens||[]).length+(profile.custom_avoid||[]).length;
      const satisfied=selected>0&&(profile.allergens||[]).every(id=>hits.some(h=>h.allergen_id===id))&&(profile.custom_avoid||[]).every(term=>hits.some(h=>h.allergen_id==='custom'&&h.term.toLowerCase()===term.toLowerCase()));
      const panel=photoSources().some(s=>containsAny(s.items.map(w=>w.text).join(' '),[...MARKERS.ingredient_headings,...MARKERS.direct_markers,...MARKERS.caution_markers]));
      // A working recognizer gets real alternate pixels, not a confidence bonus.
      // Missing models/zero word scores use the existing Tesseract fallback.
      if(!exhausted&&letters.some(w=>w.score>0)&&(purpose==='menu'||(!satisfied&&(letters.length<10||mean<.75||!panel)))){
        try{
          let views;
          if(purpose==='menu')views=makeMenuViews(canvas).slice(1);
          else{
            const enhanced=await prepare(photo.file,true);
            views=enhanced===canvas?[]:[{canvas:enhanced,variant:'native-enhanced',frame:{x:0,y:0,scale:enhanced.width/ow,scaleY:enhanced.height/oh,width:ow,height:oh,cropWidth:ow,cropHeight:oh}}];
            if(canvas.ocrOriginal&&Math.max(ow,oh)>2400)views.push(...makeMenuViews(canvas).filter(v=>v.variant.startsWith('menu-detail-')));
          }
          for(const view of views){for(const script of ['ko','en'])if(!await read(view,0,script))break;view.release?.();if(exhausted)break}
        }catch(error){errors.push({family:'korean',photoIndex,phase:'enhancement',message:String(error?.message||error)})}
      }
      // An upright sidebar can be readable while a different panel is rotated;
      // do not claim completeness from this routing heuristic.
      if(bestWords().filter(w=>w.score>=.58).length<6&&!errors.some(e=>e.photoIndex===photoIndex)){
        for(const rotation of [90,270,180])if(!await read(original,rotation,'ko'))break;
      }
      releasePhotoSource(canvas);
    }
    const value=evaluateProduct({sources,profile,requiredFamilies:['korean'],familyStatus:{korean:{attempted:true,ok:!errors.length}}});
    results.push({...value,product_id:product.id??index+1,label:`Product ${index+1}`,message:value.reason,
      sources,errors,retake_recommended:needsRetake(sources),ingredients:extractIngredients(sources),ocr_families_used:['Native Korean / English']});
  }
  return {status:'ok',products:results,summary:{product_count:results.length}};
}
