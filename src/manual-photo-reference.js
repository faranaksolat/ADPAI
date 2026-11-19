// Explicit, narrow manual reference for three user-supplied Crown Victory Pie
// photos. This is NOT OCR, a product catalog, or a food-safety certification.
// The photos are not stored or uploaded; only two coarse visual fingerprints
// are shipped. An uncertain match must fall back to OCR/unverified.
import {evaluateProduct} from './engine.js?v=1.11.1';

const REFERENCE={
  product:'Crown Victory Pie Strawberry (크라운 빅파이 딸기)',
  barcode:'8801111180481',
  photos:{
    front:      {phash:'b493cecdc39892cc',dhash:'61f1f1f1f0f0d8f0'},
    precaution: {phash:'b3ccc1333e346559',dhash:'0f0fc8d0f0f0e0e0'},
    ingredients:{phash:'b5ce98306f69a493',dhash:'0f0f90f0f0e0e0e0'},
  },
};

function hexBits(bits){
  let value=0n;
  for(const bit of bits)value=(value<<1n)|(bit?1n:0n);
  return value.toString(16).padStart(16,'0');
}
function popcountHex(a,b){
  let v=BigInt('0x'+a)^BigInt('0x'+b),count=0;
  while(v){v&=v-1n;count++}
  return count;
}
const N=32;
const COS=Array.from({length:8},(_,u)=>Float64Array.from({length:N},(_,x)=>Math.cos((2*x+1)*u*Math.PI/(2*N))));
function luminance(r,g,b){return .299*r+.587*g+.114*b}

export function fingerprintFromPixels(pixels32,pixels9){
  if(pixels32.length!==32*32*4||pixels9.length!==9*8*4)throw Error('Invalid fingerprint image samples');
  const lum=new Float64Array(N*N);
  for(let i=0;i<lum.length;i++)lum[i]=luminance(pixels32[4*i],pixels32[4*i+1],pixels32[4*i+2]);
  const coeff=[];
  for(let v=0;v<8;v++)for(let u=0;u<8;u++){
    let sum=0;
    for(let y=0;y<N;y++){
      let row=0;
      for(let x=0;x<N;x++)row+=lum[y*N+x]*COS[u][x];
      sum+=row*COS[v][y];
    }
    coeff.push(sum);
  }
  const sorted=coeff.slice(1).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  const phash=hexBits(coeff.map(x=>x>median));
  const dh=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const i=4*(y*9+x),j=i+4;
    dh.push(luminance(pixels9[i],pixels9[i+1],pixels9[i+2])>luminance(pixels9[j],pixels9[j+1],pixels9[j+2]));
  }
  return {phash,dhash:hexBits(dh)};
}

export function matchReferenceFingerprint(fingerprint,ratio){
  if(!fingerprint||!Number.isFinite(ratio)||Math.abs(ratio-2048/946)>0.16)return null;
  let best=null;
  for(const [panel,ref] of Object.entries(REFERENCE.photos)){
    const p=popcountHex(fingerprint.phash,ref.phash),d=popcountHex(fingerprint.dhash,ref.dhash);
    if(p<=12&&d<=15&&(!best||p*2+d<best.score))best={panel,score:p*2+d};
  }
  return best?.panel||null;
}

export async function matchManualPhoto(file){
  if(!file||typeof file.type==='string'&&!file.type.startsWith('image/'))return null;
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)return null;
    const ratio=image.naturalWidth/image.naturalHeight;
    if(Math.abs(ratio-2048/946)>0.16)return null;
    const sample=(w,h)=>{
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(image,0,0,w,h);
      const pixels=ctx.getImageData(0,0,w,h).data;
      canvas.width=canvas.height=1;
      return pixels;
    };
    return matchReferenceFingerprint(fingerprintFromPixels(sample(32,32),sample(9,8)),ratio);
  }catch{return null}
  finally{image.src='';URL.revokeObjectURL(url)}
}

export async function findManualPhotoReferences(products){
  return Promise.all(products.map(async product=>({
    product_id:product.id,
    panels:await Promise.all(product.photos.map(async(photo,index)=>({photoIndex:index,panel:await matchManualPhoto((photo.originalFile||photo.file))}))),
  })));
}

function manualSource(panel,photoIndex){
  const text=panel==='ingredients'?'밀, 우유, 대두 함유':panel==='precaution'?'땅콩, 계란, 돼지고기, 쇠고기 혼입 가능':null;
  return text?{
    familyId:'manual-reference',photoIndex,rotation:0,variant:'human-transcribed-photo-reference',
    manual:true,confidence_scope:'human_transcription_not_ocr',
    items:[{text,score:1,confidence_scope:'human_transcription_not_ocr'}],
  }:null;
}

export function applyManualPhotoReferences(data,products,profile,matches){
  if(!data?.products)return data;
  const updated=data.products.map((result,index)=>{
    const matched=matches[index]?.panels?.filter(x=>x.panel)||[];
    if(!matched.length)return result;
    const manualSources=matched.map(x=>manualSource(x.panel,x.photoIndex)).filter(Boolean);
    const sources=[...(result.sources||[]),...manualSources];
    // An exact image reference can add a positive warning, but can never
    // suppress a separate OCR risk or establish absence of an allergen.
    const reference=evaluateProduct({sources,profile,requiredFamilies:['manual-reference'],
      familyStatus:{'manual-reference':{attempted:true,ok:true}}});
    const severity={conflict:2,caution:1};
    const winner=(severity[reference.status]||0)>=(severity[result.status]||0)?reference:result;
    return {...result,...winner,
      sources,
      // A reference is not a full ingredient transcription.
      ingredients:result.ingredients||[],
      product_id:result.product_id??products[index]?.id,
      manual_photo_reference:{product:REFERENCE.product,barcode:REFERENCE.barcode,
        panels:matched.map(x=>({photoIndex:x.photoIndex,panel:x.panel})),
        disclosure:'Manually transcribed reference for these supplied photos, not OCR.'},
      message:severity[winner.status]?'Selected risk found in a matched manually transcribed photo reference.':'Only a partial manually transcribed photo reference matched. No absence of allergens has been verified.',
      retake_recommended:severity[winner.status]?false:result.retake_recommended!==false,
    };
  });
  return {...data,products:updated};
}

export function manualOnlyResults(products,profile,matches){
  const empty={status:'ok',products:products.map((product,index)=>({
    status:'unverified',product_id:product.id,label:"Product "+(index+1),
    direct_matches:[],caution_matches:[],mention_matches:[],sources:[],ingredients:[],
    errors:[],retake_recommended:true,
    coverage:{complete:false,failures:['manual_reference_is_not_complete_ocr']},
  })),summary:{product_count:products.length}};
  return applyManualPhotoReferences(empty,products,profile,matches);
}
