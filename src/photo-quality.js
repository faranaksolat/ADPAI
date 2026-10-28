// Capture guidance only. These uncalibrated image heuristics never certify
// text coverage, ingredients, allergen absence or food safety.
export function inspectPixels(pixels,width,height,{originalWidth=width,originalHeight=height}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width*height>1500000||pixels.length!==width*height*4)throw Error('Invalid quality sample');
 const gray=new Uint8Array(width*height),hist=new Uint32Array(256);
 for(let i=0;i<gray.length;i++){const p=i*4,a=pixels[p+3]/255,v=Math.round((pixels[p]*.299+pixels[p+1]*.587+pixels[p+2]*.114)*a+255*(1-a));gray[i]=v;hist[v]++}
 const q=f=>{let n=0;for(let v=0;v<256;v++){n+=hist[v];if(n>=gray.length*f)return v}return 255};
 const low=q(.01),mid=q(.5),high=q(.99),contrast=high-low,invert=mid<128&&high-mid>mid-low;
 const mask=new Uint8Array(gray.length);
 for(let i=0;i<gray.length;i++)mask[i]=invert?gray[i]>mid+Math.max(16,contrast*.2):gray[i]<mid-Math.max(16,contrast*.2);
 const queue=new Int32Array(gray.length),heights=[];let count=0;
 for(let i=0;i<mask.length;i++)if(mask[i]){
  let read=0,end=1,minX=i%width,maxX=minX,minY=Math.floor(i/width),maxY=minY;queue[0]=i;mask[i]=0;
  while(read<end){const p=queue[read++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [x?p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1])if(n>=0&&mask[n]){mask[n]=0;queue[end++]=n}
  }
  const w=maxX-minX+1,h=maxY-minY+1;
  if(end>=4&&h>=2&&h<=Math.min(70,height*.2)&&w>=1&&w<Math.min(100,width*.15)&&w/h<7&&w/h>.08){count++;heights.push(h)}
 }
 let sum=0,squared=0,n=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,l=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*gray[i];sum+=l;squared+=l*l;n++;
 }
 const sharpness=(squared/Math.max(1,n)-(sum/Math.max(1,n))**2)/Math.max(400,contrast**2),issues=[];
 heights.sort((a,b)=>a-b);
 const textHeight=count>=8?heights[Math.floor(heights.length*.75)]*originalHeight/height:null;
 if(mid<65&&high<145)issues.push('low_light');
 if(contrast<40)issues.push('low_contrast');
 if(count<8)issues.push('text_not_found');
 else {if(textHeight<16)issues.push('text_too_small');if(sharpness<.002)issues.push('possible_blur')}
 // Bright paper alone is not glare. Look for a large saturated patch against
 // a darker surrounding image; food photos can still trigger this advisory.
 if(mid<195){
  const cells=12,cw=Math.max(1,Math.floor(width/cells)),ch=Math.max(1,Math.floor(height/cells));let brightPatch=false;
  for(let cy=1;cy<cells-1;cy++)for(let cx=1;cx<cells-1;cx++){
   let bright=0,total=0;for(let y=cy*ch;y<(cy+1)*ch;y++)for(let x=cx*cw;x<(cx+1)*cw;x++){total++;if(gray[y*width+x]>=252)bright++}
   if(bright/total>.94)brightPatch=true;
  }
  if(brightPatch)issues.push('possible_glare');
 }
 return {issues,scope:'uncalibrated_capture_guidance',text_height_estimate:textHeight,sharpness,contrast,originalWidth,originalHeight};
}
export function inspectCanvas(source,{originalWidth=source.width,originalHeight=source.height}={}){
 const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height,scale=Math.min(1,1100/Math.max(w,h)),canvas=document.createElement('canvas');
 canvas.width=Math.max(3,Math.round(w*scale));canvas.height=Math.max(3,Math.round(h*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
 try{return inspectPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,{originalWidth,originalHeight})}
 finally{canvas.width=canvas.height=1}
}
let pendingInspection=Promise.resolve();
export function inspectPhoto(file){
 const task=pendingInspection.then(()=>inspectPhotoNow(file));pendingInspection=task.catch(()=>{});return task;
}
async function inspectPhotoNow(file){
 const url=URL.createObjectURL(file),image=new Image();
 try{image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>50000000)throw Error('Photo too large');return inspectCanvas(image,{originalWidth:image.naturalWidth,originalHeight:image.naturalHeight});}
 finally{image.src='';URL.revokeObjectURL(url)}
}
const messages={
 en:{low_light:'Use brighter, even light.',low_contrast:'Keep the text clear against its background.',text_not_found:'Focus on the written text or one menu column.',text_too_small:'Move closer to the text.',possible_blur:'The text may be blurred. Hold the phone steady and refocus.',possible_glare:'There may be glare. Change the angle of the phone or light.'},
 ko:{low_light:'고르게 밝은 곳에서 촬영해 주세요.',low_contrast:'글자와 배경이 선명하게 구분되도록 촬영해 주세요.',text_not_found:'글자 부분이나 메뉴 한 열에 초점을 맞춰 주세요.',text_too_small:'글자에 더 가까이 다가가 주세요.',possible_blur:'글자가 흐릴 수 있어요. 휴대전화를 고정하고 초점을 다시 맞춰 주세요.',possible_glare:'빛이 반사될 수 있어요. 휴대전화나 조명의 각도를 바꿔 주세요.'}
};
export function qualityMessage(assessment,language='en'){
 const ko=language==='ko',text=messages[ko?'ko':'en'];
 if(!assessment)return ko?'사진 속 글자를 확인하고 있어요…':'Checking the text in your photo…';
 const found=(assessment.issues||[]).slice(0,2).map(id=>text[id]).filter(Boolean);
 return found.join(' ')||(ko?'글자와 모든 주의 문구가 사진 안에 있는지 직접 확인해 주세요.':'Check that the text and all warnings are in the photo.');
}
