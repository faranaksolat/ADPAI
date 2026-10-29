import {validateQuad,rectifyPhoto} from './geometry.js?v=1.11.0';
// A local, explicit crop. Never infer that a cropped panel covers a package.
export async function cropPhoto(file,language='en',{purpose='shopping'}={}) {
  const ko=language==='ko';
  const url=URL.createObjectURL(file),image=new Image();
  try {image.src=url;await image.decode();}
  catch(error) {URL.revokeObjectURL(url);throw error;}
  const dialog=document.createElement('dialog');
  dialog.className='cropDialog';
  const title=document.createElement('h2');title.textContent=purpose==='menu'?(ko?'메뉴 영역 선택':'Focus on the menu'):ko?'라벨 영역 선택':'Focus on the label';
  const hint=document.createElement('p');hint.textContent=purpose==='menu'?(ko?'음식 이름과 재료 설명이 함께 보이도록 메뉴 한 열을 선택하세요.':'Select one menu column, keeping dish names and ingredient descriptions together.'):ko?'손가락이나 마우스로 원재료 영역을 선택하세요. 알레르기·혼입 가능 경고가 잘리지 않도록 하고, 다른 면은 사진을 추가하세요.':'Drag over the ingredients panel. Keep allergen and may-contain warnings in view; add another photo for other sides.';
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',ko?'잘라낼 영역 선택':'Drag to select the crop area');
  const scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  const full=()=>({x:0,y:0,w:canvas.width,h:canvas.height});
  let selection=full(),anchor=null,perspective=false,activeCorner=0,processing=false;
  const corners=()=>[{x:0,y:0},{x:canvas.width-1,y:0},{x:canvas.width-1,y:canvas.height-1},{x:0,y:canvas.height-1}];
  let quad=corners();canvas.tabIndex=0;const controller=new AbortController();
  const draw=()=>{
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0b122088';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.beginPath();if(perspective){quad.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}else ctx.rect(selection.x,selection.y,selection.w,selection.h);ctx.clip();ctx.drawImage(image,0,0,canvas.width,canvas.height);ctx.restore();
    ctx.strokeStyle=perspective&&!validateQuad(quad,canvas.width,canvas.height)?'#a33b2d':'#4169e1';ctx.lineWidth=Math.max(2,canvas.width/150);
    if(perspective){ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();quad.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(7,canvas.width/65),0,Math.PI*2);ctx.fillStyle=i===activeCorner?'#264a3b':'white';ctx.fill();ctx.stroke()});if(!processing)apply.disabled=!validateQuad(quad,canvas.width,canvas.height)}else ctx.strokeRect(selection.x,selection.y,selection.w,selection.h);
  };
  const point=event=>{const rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(perspective?canvas.width-1:canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(perspective?canvas.height-1:canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))}};
  canvas.onpointerdown=event=>{if(processing)return;anchor=point(event);if(perspective){activeCorner=quad.map((p,i)=>({i,d:Math.hypot(p.x-anchor.x,p.y-anchor.y)})).sort((a,b)=>a.d-b.d)[0].i;quad[activeCorner]=anchor;draw()}canvas.setPointerCapture(event.pointerId);};
  canvas.onpointermove=event=>{if(!anchor||processing)return;const p=point(event);if(perspective){quad[activeCorner]=p;draw();return}selection={x:Math.min(anchor.x,p.x),y:Math.min(anchor.y,p.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw();};
  const end=()=>{anchor=null;if(selection.w<8 || selection.h<8)selection=full();draw();};
  canvas.onpointerup=end;canvas.onpointercancel=end;
  const actions=document.createElement('div');actions.className='cropActions';
  const button=(text,id)=>{const b=document.createElement('button');b.className='btn outline';b.textContent=text;b.dataset.cropAction=id;actions.appendChild(b);return b};
  const transform=button(ko?'페이지 네 모서리 맞추기':'Straighten a flat page','perspective');transform.setAttribute('aria-pressed','false');
  const cornerControl=document.createElement('div');cornerControl.className='cornerControls';cornerControl.hidden=true;
  ['Top left','Top right','Bottom right','Bottom left'].forEach((name,i)=>{const b=document.createElement('button');b.className='btn outline';b.textContent=ko?['왼쪽 위','오른쪽 위','오른쪽 아래','왼쪽 아래'][i]:name;b.onclick=()=>{activeCorner=i;canvas.focus();draw()};cornerControl.appendChild(b)});
  canvas.onkeydown=e=>{if(!perspective||processing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?10:1,p=quad[activeCorner];p.x=Math.max(0,Math.min(canvas.width-1,p.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)));p.y=Math.max(0,Math.min(canvas.height-1,p.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)));draw()};
  const reset=button(ko?'전체 선택':'Select all','reset');
  const cancel=button(ko?'취소':'Cancel','cancel');
  const apply=button(ko?'선택 영역 사용':'Use selected area','apply');apply.className='btn primary';
  dialog.append(title,hint,canvas,cornerControl,actions);document.body.appendChild(dialog);draw();dialog.showModal();
  try {
    return await new Promise((resolve,reject)=>{
      reset.onclick=()=>{selection=full();quad=corners();draw()};
      transform.onclick=()=>{perspective=!perspective;transform.setAttribute('aria-pressed',String(perspective));cornerControl.hidden=!perspective;apply.disabled=false;hint.textContent=perspective?(ko?'평평한 페이지의 네 모서리를 옮겨 주세요. 휘어진 포장에는 적용하지 마세요.':'Move the four corners onto a flat page. This does not flatten curved packaging.'):purpose==='menu'?(ko?'음식 이름과 재료 설명을 함께 선택해 주세요.':'Keep dish names and descriptions together.'):(ko?'원재료와 모든 주의 문구를 함께 선택해 주세요.':'Keep ingredients and all warnings in view.');draw()};
      cancel.onclick=()=>{controller.abort();resolve(null)};
      dialog.oncancel=event=>{event.preventDefault();controller.abort();resolve(null)};
      apply.onclick=async()=>{
        processing=true;apply.disabled=reset.disabled=transform.disabled=true;
        try {
          const x=selection.x*image.naturalWidth/canvas.width,y=selection.y*image.naturalHeight/canvas.height;
          const w=selection.w*image.naturalWidth/canvas.width,h=selection.h*image.naturalHeight/canvas.height;
          let output;
          if(perspective){output=await rectifyPhoto(image,quad.map(p=>({x:p.x*(image.naturalWidth-1)/(canvas.width-1),y:p.y*(image.naturalHeight-1)/(canvas.height-1)})),{signal:controller.signal})}
          else {output=document.createElement('canvas');const ratio=Math.min(1,3600/Math.max(w,h));
          output.width=Math.max(1,Math.round(w*ratio));output.height=Math.max(1,Math.round(h*ratio));
          output.getContext('2d').drawImage(image,x,y,w,h,0,0,output.width,output.height);}
          if(controller.signal.aborted)return;
          const blob=await new Promise(r=>output.toBlob(r,'image/png'));
          if(!blob)throw new Error('Crop could not be encoded');
          resolve(new File([blob],perspective?'page-straightened.png':'label-crop.png',{type:'image/png'}));
        } catch(error) {if(!controller.signal.aborted)reject(error)}
      };
    });
  } finally {dialog.close();dialog.remove();URL.revokeObjectURL(url);}
}
