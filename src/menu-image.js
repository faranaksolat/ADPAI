import {enhanceCanvas} from './image.js?v=1.9.1';
// Menu-only alternate readings. Original pixels stay available; preprocessing
// cannot supply ingredient evidence or raise any word's OCR confidence.
export function menuContrastPixels(pixels){
  // Retain the previously tested column transform as an independent reading.
  // Stronger percentile normalization is an extra full-image view; replacing
  // these columns regressed a small tilted Korean fixture.
  const histogram=new Uint32Array(16);
  for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;const gray=(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])*a+255*(1-a);histogram[Math.min(15,Math.floor(gray/16))]++}
  const inverted=histogram.indexOf(Math.max(...histogram))<8,output=new Uint8ClampedArray(pixels.length);
  for(let i=0;i<pixels.length;i+=4){
    const a=pixels[i+3]/255;let gray=(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])*a+255*(1-a);
    if(inverted)gray=255-gray;
    const value=Math.max(0,Math.min(255,(gray-128)*1.35+128));output[i]=output[i+1]=output[i+2]=value;output[i+3]=255;
  }
  return {pixels:output,inverted};
}
export function menuReadCanvases(src){
  if(!Number.isFinite(src?.width)||!Number.isFinite(src?.height)||!globalThis.document)
    return [{canvas:src,variant:'original',frame:{x:0,y:0,scale:1}}];
  const scale=Math.min(2,2400/Math.max(src.width,src.height));
  const make=(x,width,contrast,variant)=>{
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(src.height*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,x,0,width,src.height,0,0,canvas.width,canvas.height);
    if(contrast){const data=ctx.getImageData(0,0,canvas.width,canvas.height);data.data.set(menuContrastPixels(data.data).pixels);ctx.putImageData(data,0,0)}
    return {canvas,variant,frame:{x,y:0,scale:canvas.width/width,scaleY:canvas.height/src.height,width:src.width,height:src.height,cropWidth:width}};
  };
  const enhanced=enhanceCanvas(src);
  return [make(0,src.width,false,'menu-original'),
    ...[0,.4].map((fraction,i)=>{const x=Math.round(src.width*fraction);return make(x,Math.min(src.width-x,Math.round(src.width*.6)),true,'menu-column-'+i)}),
    {canvas:enhanced,variant:'menu-enhanced',frame:{x:0,y:0,scale:enhanced.width/src.width,scaleY:enhanced.height/src.height,width:src.width,height:src.height,cropWidth:src.width}}];
}
export function mapMenuItems(items,frame,rotation=0){
  return items.map(item=>({...item,box:item.box?{
    x0:(rotation?0:frame.x)+item.box.x0/frame.scale,x1:(rotation?0:frame.x)+item.box.x1/frame.scale,
    y0:(frame.y||0)+item.box.y0/(frame.scaleY||frame.scale),y1:(frame.y||0)+item.box.y1/(frame.scaleY||frame.scale)}:null}));
}
