// A local, explicit crop. Never infer that a cropped panel covers a package.
export async function cropPhoto(file,language='en') {
  const ko=language==='ko';
  const url=URL.createObjectURL(file),image=new Image();
  try {image.src=url;await image.decode();}
  catch(error) {URL.revokeObjectURL(url);throw error;}
  const dialog=document.createElement('dialog');
  dialog.className='cropDialog';
  const title=document.createElement('h2');title.textContent=ko?'라벨 영역 선택':'Focus on the label';
  const hint=document.createElement('p');hint.textContent=ko?'손가락이나 마우스로 원재료 영역을 선택하세요. 알레르기·혼입 가능 경고가 잘리지 않도록 하고, 다른 면은 사진을 추가하세요.':'Drag over the ingredients panel. Keep allergen and may-contain warnings in view; add another photo for other sides.';
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',ko?'잘라낼 영역 선택':'Drag to select the crop area');
  const scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  const full=()=>({x:0,y:0,w:canvas.width,h:canvas.height});
  let selection=full(),anchor=null;
  const draw=()=>{
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0b122088';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.beginPath();ctx.rect(selection.x,selection.y,selection.w,selection.h);ctx.clip();ctx.drawImage(image,0,0,canvas.width,canvas.height);ctx.restore();
    ctx.strokeStyle='#4169e1';ctx.lineWidth=Math.max(2,canvas.width/150);ctx.strokeRect(selection.x,selection.y,selection.w,selection.h);
  };
  const point=event=>{const rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))}};
  canvas.onpointerdown=event=>{anchor=point(event);canvas.setPointerCapture(event.pointerId);};
  canvas.onpointermove=event=>{if(!anchor)return;const p=point(event);selection={x:Math.min(anchor.x,p.x),y:Math.min(anchor.y,p.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw();};
  const end=()=>{anchor=null;if(selection.w<8 || selection.h<8)selection=full();draw();};
  canvas.onpointerup=end;canvas.onpointercancel=end;
  const actions=document.createElement('div');actions.className='cropActions';
  const button=(text,id)=>{const b=document.createElement('button');b.className='btn outline';b.textContent=text;b.dataset.cropAction=id;actions.appendChild(b);return b};
  const reset=button(ko?'전체 선택':'Select all','reset');
  const cancel=button(ko?'취소':'Cancel','cancel');
  const apply=button(ko?'선택 영역 사용':'Use selected area','apply');apply.className='btn primary';
  dialog.append(title,hint,canvas,actions);document.body.appendChild(dialog);draw();dialog.showModal();
  try {
    return await new Promise((resolve,reject)=>{
      reset.onclick=()=>{selection=full();draw()};
      cancel.onclick=()=>resolve(null);
      dialog.oncancel=event=>{event.preventDefault();resolve(null)};
      apply.onclick=async()=>{
        apply.disabled=reset.disabled=cancel.disabled=true;
        try {
          const x=selection.x*image.naturalWidth/canvas.width,y=selection.y*image.naturalHeight/canvas.height;
          const w=selection.w*image.naturalWidth/canvas.width,h=selection.h*image.naturalHeight/canvas.height;
          const output=document.createElement('canvas'),ratio=Math.min(1,3600/Math.max(w,h));
          output.width=Math.max(1,Math.round(w*ratio));output.height=Math.max(1,Math.round(h*ratio));
          output.getContext('2d').drawImage(image,x,y,w,h,0,0,output.width,output.height);
          const blob=await new Promise(r=>output.toBlob(r,'image/png'));
          if(!blob)throw new Error('Crop could not be encoded');
          resolve(new File([blob],'label-crop.png',{type:'image/png'}));
        } catch(error) {reject(error)}
      };
    });
  } finally {dialog.close();dialog.remove();URL.revokeObjectURL(url);}
}
