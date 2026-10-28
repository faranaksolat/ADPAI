import {inspectCanvas,qualityMessage} from './photo-quality.js?v=1.10.0';

// No video-frame JPEG fallback: a 720p preview must not silently replace a
// full-resolution system-camera photo. Unsupported browsers keep file capture.
export function supportsLivePhoto(mediaDevices=globalThis.navigator?.mediaDevices,Capture=globalThis.ImageCapture){
 return typeof mediaDevices?.getUserMedia==='function'&&typeof Capture?.prototype?.takePhoto==='function';
}
export function createCameraSession({mediaDevices=globalThis.navigator?.mediaDevices,Capture=globalThis.ImageCapture}={}){
 let closed=false,stream,reader;
 const close=()=>{closed=true;for(const track of stream?.getTracks()||[])track.stop()};
 return {close,get closed(){return closed},get stream(){return stream},async start(){
  if(closed)throw Error('Camera cancelled');
  const value=await mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
  if(closed){for(const track of value.getTracks())track.stop();throw Error('Camera cancelled')}
  stream=value;const track=stream.getVideoTracks()[0];
  try{
   reader=new Capture(track);const caps=track.getCapabilities?.()||{};
   if(caps.focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
   return {stream,track,capabilities:caps,settings:track.getSettings?.()||{}};
  }catch(error){close();throw error}
 },async photo(){
  if(closed||!reader)throw Error('Camera cancelled');
  const blob=await reader.takePhoto();if(closed)throw Error('Camera cancelled');
  if(!(blob instanceof Blob)||!blob.size)throw Error('Camera returned no photo');
  return blob;
 }};
}
export async function capturePhoto({language='en',onSystemCamera=()=>{}}={}){
 const ko=language==='ko',dialog=document.createElement('dialog');dialog.className='cameraDialog';
 const title=document.createElement('h2');title.textContent=ko?'글자가 선명하게 보이도록 촬영하세요':'Bring the text into focus';
 const stage=document.createElement('div');stage.className='cameraStage';
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute('aria-label',ko?'카메라 미리보기':'Camera preview');
 const frame=document.createElement('div');frame.className='cameraFrame';frame.setAttribute('aria-hidden','true');stage.append(video,frame);
 const hint=document.createElement('p');hint.className='cameraHint';hint.setAttribute('aria-live','polite');hint.textContent=ko?'카메라를 여는 중…':'Opening the camera…';
 const note=document.createElement('p');note.textContent=ko?'한 열의 이름과 재료 설명을 함께 담아 주세요. 촬영 후 사진을 확인할 수 있어요.':'Include one column with its dish names and descriptions. Review the photo after taking it.';
 const actions=document.createElement('div');actions.className='cropActions';
 const button=(label,id)=>{const b=document.createElement('button');b.className='btn outline';b.textContent=label;b.dataset.cameraAction=id;actions.appendChild(b);return b};
 const cancel=button(ko?'취소':'Cancel','cancel'),system=button(ko?'휴대전화 카메라 사용':'Use phone camera','system'),torch=button(ko?'조명':'Light','torch'),take=button(ko?'사진 촬영':'Take photo','take');
 torch.hidden=true;torch.setAttribute('aria-pressed','false');take.className='btn primary';take.disabled=true;
 dialog.append(title,stage,hint,note,actions);document.body.appendChild(dialog);dialog.showModal();
 const session=createCameraSession();let timer,finished=false,busy=false,lastSample;
 let resolveResult;const result=new Promise(resolve=>resolveResult=resolve);
 const done=value=>{if(finished)return;finished=true;clearTimeout(timer);session.close();video.srcObject=null;lastSample=null;sample.width=sample.height=1;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);dialog.close();dialog.remove();resolveResult(value)};
 const leave=()=>done(null),visibility=()=>{if(document.hidden)done(null)};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);
 cancel.onclick=leave;dialog.oncancel=e=>{e.preventDefault();leave()};
 system.onclick=()=>{done(null);onSystemCamera()};
 const sample=document.createElement('canvas');sample.width=440;sample.height=260;
 const poll=()=>{
  if(finished)return;
  if(video.videoWidth&&video.videoHeight&&!busy){
   try{
    const w=video.videoWidth*.84,h=video.videoHeight*.62;sample.height=Math.max(20,Math.round(sample.width*h/w));
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,video.videoWidth*.08,video.videoHeight*.19,w,h,0,0,sample.width,sample.height);
    const current=ctx.getImageData(0,0,sample.width,sample.height).data;let motion=0,n=0;
    if(lastSample?.length===current.length)for(let i=0;i<current.length;i+=160){motion+=Math.abs(current[i]-lastSample[i]);n++}
    const quality=inspectCanvas(sample,{originalWidth:w,originalHeight:h});
    hint.textContent=n&&motion/n>18?(ko?'휴대전화를 잠시 고정해 주세요.':'Hold the phone steady for a moment.'):qualityMessage(quality,language);
    lastSample=current;
   }catch{hint.textContent=ko?'글자에 초점을 맞추고 빛 반사를 피해 주세요.':'Focus on the text and avoid reflections.'}
  }
  timer=setTimeout(poll,650);
 };
 // A late permission response cannot revive a closed camera or leak its stream.
 session.start().then(async({stream,track,capabilities})=>{
  if(finished)return;video.srcObject=stream;await video.play();if(finished)return;
  if(video.videoWidth&&video.videoHeight){stage.style.aspectRatio=video.videoWidth+'/'+video.videoHeight;stage.style.width=`min(100%, ${55*video.videoWidth/video.videoHeight}dvh)`;stage.style.minHeight='0';stage.style.marginInline='auto';video.style.height='100%';video.style.maxHeight='none'}
  track.addEventListener?.('ended',leave,{once:true});
  take.disabled=false;torch.hidden=!capabilities.torch;let lit=false;
  torch.onclick=async()=>{torch.disabled=true;try{await track.applyConstraints({advanced:[{torch:!lit}]});lit=!lit;torch.setAttribute('aria-pressed',String(lit))}catch{torch.hidden=true}finally{torch.disabled=false}};
  poll();
 }).catch(()=>{if(!finished){session.close();hint.textContent=ko?'카메라를 열 수 없습니다. 휴대전화 카메라를 사용하거나 권한을 확인해 주세요.':'Could not open this camera. Use phone camera or check camera permission.';take.disabled=true}});
 take.onclick=async()=>{
  if(busy||finished)return;busy=true;take.disabled=true;torch.disabled=true;
  try{
   const blob=await session.photo();if(finished)return;
   const file=new File([blob],'camera-photo',{type:blob.type||'image/jpeg'});done(file);
  }catch{if(!finished){hint.textContent=ko?'사진을 촬영하지 못했습니다. 휴대전화 카메라를 사용해 주세요.':'Could not take a full-resolution photo. Use phone camera.';take.disabled=false;torch.disabled=false}}
  finally{busy=false}
 };
 return result;
}
