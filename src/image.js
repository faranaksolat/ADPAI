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
