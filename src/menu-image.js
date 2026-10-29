import {enhanceCanvas} from './image.js?v=1.10.2';
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
// Views are lazy: six original-resolution regions never allocate six canvases
// at once. All boxes, including overview reads, map into original-photo space.
export function menuReadCanvases(src){
 if(!Number.isFinite(src?.width)||!Number.isFinite(src?.height)||!globalThis.document)
  return [{canvas:src,variant:'original',frame:{x:0,y:0,scale:1}}];
 const original=src.ocrOriginal,ow=original?.naturalWidth||src.width,oh=original?.naturalHeight||src.height;
 const bx=src.width/ow,by=src.height/oh,scale=Math.min(2,2400/Math.max(src.width,src.height));
 const view=(image,x,y,w,h,zoom,variant,contrast,frame)=>{
  let cached;
  return {variant,frame,get canvas(){
   if(!cached){
    cached=document.createElement('canvas');cached.width=Math.max(1,Math.round(w*zoom));cached.height=Math.max(1,Math.round(h*zoom));
    const ctx=cached.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,cached.width,cached.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,x,y,w,h,0,0,cached.width,cached.height);
    if(contrast){const d=ctx.getImageData(0,0,cached.width,cached.height);d.data.set(menuContrastPixels(d.data).pixels);ctx.putImageData(d,0,0)}
   }
   return cached;
  },release(){if(cached){cached.width=cached.height=1;cached=null}}};
 };
 const overview=(x,w,contrast,variant)=>view(src,x,0,w,src.height,scale,variant,contrast,
  {x:x/bx,y:0,scale:Math.max(1,Math.round(w*scale))/(w/bx),scaleY:Math.max(1,Math.round(src.height*scale))/oh,width:ow,height:oh,cropWidth:w/bx,cropHeight:oh});
 let enhanced;
 const enhancedView={variant:'menu-enhanced',frame:{x:0,y:0,scale:Math.max(1,Math.round(src.width*Math.min(2,3000/Math.max(src.width,src.height))))/ow,
  scaleY:Math.max(1,Math.round(src.height*Math.min(2,3000/Math.max(src.width,src.height))))/oh,width:ow,height:oh,cropWidth:ow,cropHeight:oh},
  get canvas(){return enhanced??=enhanceCanvas(src)},release(){if(enhanced&&enhanced!==src)enhanced.width=enhanced.height=1;enhanced=null}};
 const details=menuDetailRegions(ow,oh).map(r=>view(original||src,r.x,r.y,r.width,r.height,r.scale,r.variant,true,
  {x:r.x,y:r.y,scale:Math.max(1,Math.round(r.width*r.scale))/r.width,scaleY:Math.max(1,Math.round(r.height*r.scale))/r.height,
   width:ow,height:oh,cropWidth:r.width,cropHeight:r.height,from_original:!!original}));
 return [overview(0,src.width,false,'menu-original'),...[0,.4].map((f,i)=>{const x=Math.round(src.width*f);return overview(x,Math.min(src.width-x,Math.round(src.width*.6)),true,'menu-column-'+i)}),enhancedView,...details];
}
export function menuDetailRegions(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid menu dimensions');
 if(Math.max(width,height)<=900)return [{x:0,y:0,width,height,scale:Math.min(4,2800/Math.max(width,height)),variant:'menu-detail-full'}];
 const large=Math.max(width,height)>2400,cols=large&&width>=height?3:2,rows=large&&height>width?3:2;
 const w=Math.min(width,Math.round(width/(cols-(cols-1)*.25))),h=Math.min(height,Math.round(height/(rows-(rows-1)*.25))),regions=[];
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=Math.round(col*(width-w)/(cols-1)),y=Math.round(row*(height-h)/(rows-1));
  regions.push({x,y,width:w,height:h,scale:Math.min(3,2000/Math.max(w,h)),variant:`menu-detail-${row}-${col}`});
 }
 // Preserve the previously tested .62 overlap on smaller supplied menus.
 if(!large){const rw=Math.round(width*.62),rh=Math.round(height*.62);return [0,height-rh].flatMap((y,row)=>[0,width-rw].map((x,col)=>({x,y,width:rw,height:rh,scale:Math.min(3,2000/Math.max(rw,rh)),variant:`menu-detail-${row}-${col}`})))}
 return regions;
}
export function mapMenuItems(items,frame,rotation=0){
  const mapped=items.map(item=>({...item,box:item.box?{
    x0:(rotation?0:frame.x)+item.box.x0/frame.scale,x1:(rotation?0:frame.x)+item.box.x1/frame.scale,
    y0:(frame.y||0)+item.box.y0/(frame.scaleY||frame.scale),y1:(frame.y||0)+item.box.y1/(frame.scaleY||frame.scale)}:null}));
  return rotation?mapped:markClippedRows(mapped,frame);
}
export function markClippedRows(items,frame){
 if(!frame?.cropWidth)return items;
 const groups=new Map();items.forEach((item,index)=>{const id=item.lineId??'word-'+index;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item)});
 const clipped=new Set();
 for(const group of groups.values()){
  const boxes=group.map(w=>w.box).filter(Boolean);if(!boxes.length)continue;
  const hs=boxes.map(b=>b.y1-b.y0).sort((a,b)=>a-b),margin=Math.max(3,hs[Math.floor(hs.length/2)]*1.2);
  const left=Math.min(...boxes.map(b=>b.x0)),right=Math.max(...boxes.map(b=>b.x1)),top=Math.min(...boxes.map(b=>b.y0)),bottom=Math.max(...boxes.map(b=>b.y1));
  if((frame.x>0&&left-frame.x<margin)||(frame.x+frame.cropWidth<frame.width&&frame.x+frame.cropWidth-right<margin)
   ||(frame.y>0&&top-frame.y<margin)||(frame.cropHeight&&frame.y+frame.cropHeight<frame.height&&frame.y+frame.cropHeight-bottom<margin))for(const w of group)clipped.add(w);
 }
 return items.map(item=>clipped.has(item)?{...item,context_clipped:true}:item);
}
