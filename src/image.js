// Bounded, deterministic preprocessing. It remaps existing intensities and
// resamples pixels; it never generates letters, changes OCR scores or replaces
// the original read. Avoid a single glare/shadow outlier defining the contrast.
export function normalizeOcrPixels(pixels){
 const gray=new Uint8Array(pixels.length/4),histogram=new Uint32Array(256);
 for(let i=0,j=0;i<pixels.length;i+=4,j++){
  const alpha=pixels[i+3]/255;
  gray[j]=Math.round((.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])*alpha+255*(1-alpha));
  histogram[gray[j]]++;
 }
 const peak=histogram.indexOf(Math.max(...histogram));
 const lower=histogram.slice(0,Math.max(0,peak-16)).reduce((a,b)=>a+b,0),upper=histogram.slice(Math.min(256,peak+17)).reduce((a,b)=>a+b,0);
 // Dim paper also has a dark histogram peak. Invert only when the minority
 // marks are predominantly lighter than that background, as on a dark menu.
 const inverted=gray.length>0&&peak<128&&upper>lower*1.5;
 if(inverted){histogram.reverse();for(let j=0;j<gray.length;j++)gray[j]=255-gray[j]}
 const quantile=q=>{let total=0;for(let i=0;i<256;i++){total+=histogram[i];if(total>=Math.max(1,gray.length*q))return i}return 255};
 const low=quantile(.005),high=quantile(.995),span=high-low;
 const gain=span>=16?Math.min(4,255/span):1,offset=span>=16?(255-span*gain)/2-low*gain:0;
 const output=new Uint8ClampedArray(pixels.length);
 for(let j=0;j<gray.length;j++){const i=j*4,value=gray[j]*gain+offset;output[i]=output[i+1]=output[i+2]=value;output[i+3]=255}
 return {pixels:output,inverted,gain};
}
export function ocrCanvasSize(width,height,enhanced=false){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid image dimensions');
 const scale=Math.min(enhanced?2:1,(enhanced?3000:2400)/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function drawForOcr(img,width,height,enhanced){
 const size=ocrCanvasSize(width,height,enhanced),w=size.width,h=size.height;
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(img,0,0,w,h);
 if(enhanced){
   const d=ctx.getImageData(0,0,w,h);d.data.set(normalizeOcrPixels(d.data).pixels);
   ctx.putImageData(d,0,0);
 }
 return c;
}
export function enhanceCanvas(src){
 if(!globalThis.document||!Number.isFinite(src?.width)||!Number.isFinite(src?.height))return src;
 return drawForOcr(src,src.width,src.height,true);
}
// A retake hint only. Passing this heuristic never verifies coverage or safety;
// repeated variants cannot pool their characters to appear more readable.
export function needsRetake(sources=[]){
 return !sources.some(source=>{
  const words=(source.items||[]).filter(w=>typeof w.score==='number'&&w.score>=.58&&w.score<=1&&/\p{L}/u.test(w.text||''));
  return words.length>=3&&words.reduce((n,w)=>n+(w.text.match(/\p{L}/gu)||[]).length,0)>=20;
 });
}
export function preprocess(file,enhanced=false,{preserveOriginal=false}={}){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{
 if(img.naturalWidth*img.naturalHeight>50000000)throw Error('Photo is too large. Photograph one menu column or label panel.');
 const c=drawForOcr(img,img.naturalWidth,img.naturalHeight,enhanced);
 if(preserveOriginal&&!enhanced)Object.defineProperty(c,'ocrOriginal',{value:img,writable:true,configurable:true});
 URL.revokeObjectURL(url);resolve(c)
}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url})}

export function rotateCanvas(src,deg){
 const rad=((deg%360)+360)%360;
 if(rad===0)return src;
 const c=document.createElement('canvas');
 if(rad===90||rad===270){c.width=src.height;c.height=src.width}else{c.width=src.width;c.height=src.height}
 const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
 ctx.translate(c.width/2,c.height/2);
 ctx.rotate(rad*Math.PI/180);
 ctx.drawImage(src,-src.width/2,-src.height/2);
 return c
}

export function releasePhotoSource(canvas){
 if(canvas?.ocrOriginal){canvas.ocrOriginal.src='';canvas.ocrOriginal=null;}
}

// Focused reads use a smaller canvas; retain the larger original reading too.
export function resizeForOcr(src,limit){
 if(!Number.isFinite(src?.width)||!Number.isFinite(src?.height)||Math.max(src.width,src.height)<=limit)return src;
 const scale=limit/Math.max(src.width,src.height),c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(src.width*scale));c.height=Math.max(1,Math.round(src.height*scale));
 const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,c.width,c.height);return c;
}


// Development-stage shopping-label regions. Overlapping geometry is not proof
// that any particular region contains a complete ingredient declaration.
export function labelRegionGeometry(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width*height>50000000)throw Error('Invalid label dimensions');
 const make=(x,y,w,h,id)=>({x,y,width:w,height:h,variant:'label-region-'+id});
 const split=length=>{const span=Math.max(1,Math.round(length*.68));return [[0,span],[Math.max(0,length-span),span]]};
 if(height>=width*1.1)return split(height).map(([y,h],i)=>make(0,y,width,h,i?'lower':'upper'));
 if(width>=height*1.1)return split(width).map(([x,w],i)=>make(x,0,w,height,i?'right':'left'));
 return split(height).flatMap(([y,h],r)=>split(width).map(([x,w],c)=>make(x,y,w,h,r+'-'+c)));
}

// Deterministic grayscale/contrast normalization and bounded light sharpening.
// This cannot reconstruct illegible letters or improve reported confidence.
export function sharpenLabelPixels(pixels,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>8000000||pixels.length!==width*height*4)throw Error('Invalid label pixel buffer');
 const normalized=normalizeOcrPixels(pixels).pixels,output=new Uint8ClampedArray(normalized.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,p=i*4,value=normalized[p];
  const neighbor=(normalized[(y*width+Math.max(0,x-1))*4]+normalized[(y*width+Math.min(width-1,x+1))*4]
    +normalized[(Math.max(0,y-1)*width+x)*4]+normalized[(Math.min(height-1,y+1)*width+x)*4])/4;
  const adjustment=Math.max(-25,Math.min(25,(value-neighbor)*.6));
  const result=Math.max(0,Math.min(255,value+adjustment));
  output[p]=output[p+1]=output[p+2]=result;output[p+3]=255;
 }
 return output;
}

// Lazy original-pixel crops. Frame coordinates map each OCR word back to the
// untouched source image; clipped wording remains uncertain downstream.
export function labelReadCanvases(source){
 if(!globalThis.document||!Number.isFinite(source?.width)||!Number.isFinite(source?.height))return [];
 const original=source.ocrOriginal,ow=original?.naturalWidth||source.width,oh=original?.naturalHeight||source.height;
 const bx=source.width/ow,by=source.height/oh;
 return labelRegionGeometry(ow,oh).map(region=>{
  let cached;
  const image=original||source;
  const x=original?region.x:region.x*bx,y=original?region.y:region.y*by;
  const w=original?region.width:region.width*bx,h=original?region.height:region.height*by;
  const zoom=Math.min(2,2400/Math.max(w,h));
  const cw=Math.max(1,Math.round(w*zoom)),ch=Math.max(1,Math.round(h*zoom));
  return {variant:region.variant,
   frame:{x:region.x,y:region.y,width:ow,height:oh,cropWidth:region.width,cropHeight:region.height,
     scale:cw/region.width,scaleY:ch/region.height,from_original:!!original},
   get canvas(){
    if(!cached){
     cached=document.createElement('canvas');cached.width=cw;cached.height=ch;
     const ctx=cached.getContext('2d',{willReadFrequently:true});
     ctx.fillStyle='white';ctx.fillRect(0,0,cw,ch);
     ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
     ctx.drawImage(image,x,y,w,h,0,0,cw,ch);
     const data=ctx.getImageData(0,0,cw,ch);
     data.data.set(sharpenLabelPixels(data.data,cw,ch));ctx.putImageData(data,0,0);
    }
    return cached;
   },
   release(){if(cached){cached.width=cached.height=1;cached=null}}
  };
 });
}


// OCR-anchored crops are proposals only. They are made from original photo
// pixels and do not replace the full read or certify label completeness.
export function labelFocusCanvases(source,zones){
 if(!globalThis.document||!source||!Array.isArray(zones))return [];
 const original=source.ocrOriginal,ow=original?.naturalWidth||source.width,oh=original?.naturalHeight||source.height;
 const sx=ow/source.width,sy=oh/source.height;
 return zones.slice(0,2).map(zone=>{
  let cached;
  const x=Math.max(0,zone.x*sx),y=Math.max(0,zone.y*sy);
  const w=Math.min(ow-x,zone.width*sx),h=Math.min(oh-y,zone.height*sy);
  const originalSource=original||source,scale=Math.min(2,2400/Math.max(w,h));
  const cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
  return {variant:zone.variant,frame:{x,y,width:ow,height:oh,cropWidth:w,cropHeight:h,
   scale:cw/w,scaleY:ch/h,from_original:!!original},
   get canvas(){
    if(!cached){
     cached=document.createElement('canvas');cached.width=cw;cached.height=ch;
     const ctx=cached.getContext('2d',{willReadFrequently:true});
     ctx.fillStyle='white';ctx.fillRect(0,0,cw,ch);
     ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
     ctx.drawImage(originalSource,x,y,w,h,0,0,cw,ch);
     const d=ctx.getImageData(0,0,cw,ch);
     d.data.set(sharpenLabelPixels(d.data,cw,ch));ctx.putImageData(d,0,0);
    }
    return cached;
   },release(){if(cached){cached.width=cached.height=1;cached=null}}
  };
 });
}
