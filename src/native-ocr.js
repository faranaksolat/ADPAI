import {evaluateProduct} from './engine.js?v=1.7.0';
import {extractIngredients} from './ingredients.js?v=1.7.0';
import {preprocess,rotateCanvas} from './image.js?v=1.7.0';

// Native word scores are uncalibrated model outputs, not probabilities of food
// safety. Both script recognizers and rotations remain one OCR family.
export function nativeItems(result){
  return (result?.items||[]).filter(item=>typeof item.text==='string'&&item.text.trim()).map(item=>{
    const score=Number(item.score),b=item.box;
    const box=b&&['x0','y0','x1','y1'].every(key=>Number.isFinite(b[key]))&&b.x1>b.x0&&b.y1>b.y0?{...b}:null;
    return {...item,score:Number.isFinite(score)&&score>=0&&score<=1?score:0,box,
      confidence_scope:'native_word_uncalibrated'};
  });
}

export async function analyzeNativeProducts(products,profile,{nativeReader,prepare=preprocess,rotate=rotateCanvas,onProgress=()=>{}}={}){
  const results=[];
  for(const [index,product] of products.entries()){
    const sources=[],errors=[];
    for(const [photoIndex,photo] of product.photos.entries()){
      let canvas;
      try{canvas=await prepare(photo.file,false)}
      catch{errors.push({family:'korean',photoIndex,message:'Image could not be decoded'});continue}
      const read=async(rotation,script)=>{
        onProgress('Reading photo text on this device…');
        let timer;
        try{
          const base64=rotate(canvas,rotation).toDataURL('image/png').split(',')[1];
          const output=await Promise.race([nativeReader({base64,script}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native OCR deadline reached')),50000)})]);
          sources.push({familyId:'korean',photoIndex,rotation,variant:'native-original',engine:output.engine,
            model_languages:[script],confidence_scope:'native_word_uncalibrated',items:nativeItems(output)});
          return true;
        }catch(error){errors.push({family:'korean',photoIndex,rotation,script,message:String(error?.message||error)});return false}
        finally{clearTimeout(timer)}
      };
      for(const script of ['ko','en'])await read(0,script);
      const letters=sources.filter(s=>s.photoIndex===photoIndex).flatMap(s=>s.items).filter(w=>/\p{L}/u.test(w.text));
      // An upright sidebar can be readable while a different panel is rotated;
      // do not claim completeness from this routing heuristic.
      if(letters.length<6&&!errors.some(e=>e.photoIndex===photoIndex)){
        for(const rotation of [90,270,180])if(!await read(rotation,'ko'))break;
      }
    }
    const value=evaluateProduct({sources,profile,requiredFamilies:['korean'],familyStatus:{korean:{attempted:true,ok:!errors.length}}});
    results.push({...value,product_id:product.id??index+1,label:`Product ${index+1}`,message:value.reason,
      sources,errors,ingredients:extractIngredients(sources),ocr_families_used:['Native Korean / English']});
  }
  return {status:'ok',products:results,summary:{product_count:results.length}};
}
