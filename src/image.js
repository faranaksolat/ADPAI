export function preprocess(file,enhanced=false){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{
 const target=enhanced?3000:2400;
 const scale=Math.min(enhanced?2.0:1,target/Math.max(img.naturalWidth,img.naturalHeight));
 const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(img,0,0,w,h);
 if(enhanced){
   const d=ctx.getImageData(0,0,w,h),a=d.data;
   let min=255,max=0;
   for(let i=0;i<a.length;i+=4){
     const y=.299*a[i]+.587*a[i+1]+.114*a[i+2];
     if(y<min)min=y;if(y>max)max=y;
   }
   const span=Math.max(32,max-min);
   for(let i=0;i<a.length;i+=4){
     const y=.299*a[i]+.587*a[i+1]+.114*a[i+2];
     let v=(y-min)*255/span;
     v=(v-128)*1.55+128;
     if(v<0)v=0;if(v>255)v=255;
     a[i]=a[i+1]=a[i+2]=v;
   }
   ctx.putImageData(d,0,0);
 }
 URL.revokeObjectURL(url);resolve(c)
}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url})}

export function rotateCanvas(src,deg){
 const rad=((deg%360)+360)%360;
 if(rad===0)return src;
 const c=document.createElement('canvas');
 if(rad===90||rad===270){c.width=src.height;c.height=src.width}else{c.width=src.width;c.height=src.height}
 const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.translate(c.width/2,c.height/2);
 ctx.rotate(rad*Math.PI/180);
 ctx.drawImage(src,-src.width/2,-src.height/2);
 return c
}

// Focused reads use a smaller canvas; retain the larger original reading too.
export function resizeForOcr(src,limit){
 if(!Number.isFinite(src?.width)||!Number.isFinite(src?.height)||Math.max(src.width,src.height)<=limit)return src;
 const scale=limit/Math.max(src.width,src.height),c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(src.width*scale));c.height=Math.max(1,Math.round(src.height*scale));
 const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,c.width,c.height);return c;
}
