// Deterministic geometry only; no generated/deblurred letters or score changes.
export function validateQuad(points,width,height){
 if(!Array.isArray(points)||points.length!==4||!(width>0&&height>0))return false;
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>width-1||p.y>height-1))return false;
 let sign=0,area=0;
 for(let i=0;i<4;i++){
  const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  if(Math.abs(cross)<1e-5||Math.hypot(b.x-a.x,b.y-a.y)<3)return false;
  if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);area+=a.x*b.y-b.x*a.y;
 }
 return sign>0&&area/2>=width*height*.025;
}
export function quadMap(points){
 const [a,b,c,d]=points,dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x,dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
 let g=0,h=0;
 if(Math.abs(dx3)+Math.abs(dy3)>1e-8){const den=dx1*dy2-dx2*dy1;if(Math.abs(den)<1e-8)throw Error('Invalid page corners');g=(dx3*dy2-dx2*dy3)/den;h=(dx1*dy3-dx3*dy1)/den}
 return (u,v)=>{const den=g*u+h*v+1;if(Math.abs(den)<1e-8)throw Error('Invalid page projection');return {
  x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/den,
  y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/den};};
}
export function rectifiedSize(points){
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),[a,b,c,d]=points;
 const w=Math.max(distance(a,b),distance(d,c)),h=Math.max(distance(a,d),distance(b,c));
 const scale=Math.min(1,3600/Math.max(w,h),Math.sqrt(6000000/(w*h)));
 return {width:Math.max(2,Math.round(w*scale)),height:Math.max(2,Math.round(h*scale))};
}
export async function rectifyPhoto(image,points,{signal,onProgress=()=>{}}={}){
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 if(!validateQuad(points,width,height))throw Error('Choose four page corners in order');
 const x=Math.floor(Math.min(...points.map(p=>p.x))),y=Math.floor(Math.min(...points.map(p=>p.y)));
 const w=Math.ceil(Math.max(...points.map(p=>p.x)))-x+1,h=Math.ceil(Math.max(...points.map(p=>p.y)))-y+1;
 const scale=Math.min(1,4000/Math.max(w,h),Math.sqrt(10000000/(w*h))),sample=document.createElement('canvas');
 sample.width=Math.max(2,Math.round(w*scale));sample.height=Math.max(2,Math.round(h*scale));
 const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,sample.width,sample.height);ctx.drawImage(image,x,y,w,h,0,0,sample.width,sample.height);
 const input=ctx.getImageData(0,0,sample.width,sample.height).data,project=quadMap(points.map(p=>({x:(p.x-x)*sample.width/w,y:(p.y-y)*sample.height/h})));
 const size=rectifiedSize(points),output=document.createElement('canvas');output.width=size.width;output.height=size.height;
 const target=output.getContext('2d'),data=target.createImageData(size.width,size.height);
 try{
  for(let row=0;row<size.height;row++){
   if(signal?.aborted)throw Error('Photo correction cancelled');
   for(let col=0;col<size.width;col++){
    const p=project(col/(size.width-1),row/(size.height-1)),sx=Math.max(0,Math.min(sample.width-1,p.x)),sy=Math.max(0,Math.min(sample.height-1,p.y));
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,sample.width-1),y1=Math.min(y0+1,sample.height-1),fx=sx-x0,fy=sy-y0,out=(row*size.width+col)*4;
    for(let channel=0;channel<3;channel++)data.data[out+channel]=(1-fy)*((1-fx)*input[(y0*sample.width+x0)*4+channel]+fx*input[(y0*sample.width+x1)*4+channel])+fy*((1-fx)*input[(y1*sample.width+x0)*4+channel]+fx*input[(y1*sample.width+x1)*4+channel]);
    data.data[out+3]=255;
   }
   if(row%32===0){onProgress(row/size.height);await new Promise(resolve=>setTimeout(resolve,0))}
  }
  target.putImageData(data,0,0);return output;
 }finally{sample.width=sample.height=1}
}
