import {capturePhoto,supportsLivePhoto} from './camera.js?v=1.10.1';
import {inspectPhoto} from './photo-quality.js?v=1.10.1';
import {analyzeProducts} from './tesseract.js?v=1.10.1';
import {CARD_REFERENCES,DEVICE_CHECK_VERSION,buildDeviceReport} from './device-report.js?v=1.10.1';
const $=selector=>document.querySelector(selector),cameraInput=$('#systemCamera');
let pending=null,running=false,lastReport=null,lastPhoto=null,photoUrl=null;
const labels={milk:'شیر',wheat:'گندم',egg:'تخم‌مرغ'},names=ids=>ids.map(id=>labels[id]||id).join('، ')||'هیچ موردی';
const states={completed:'پردازش پایان یافت',partial_read:'خواندن ناقص است',no_text_read:'هیچ متنی خوانده نشد',invalid_image:'تصویر معتبر نیست',failed:'تست با خطا متوقف شد'};
function lock(value){
 for(const id of ['reference','target','condition','physicalConfirmed','printCard','fullCard'])$('#'+id).disabled=value;
 $('#takeTestPhoto').disabled=value||!$('#physicalConfirmed').checked;$('#cancelAttempt').hidden=!value||running;
}
function clearResult(){lastReport=null;lastPhoto=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('#photoPreview').removeAttribute('src');$('#photoPreview').hidden=true;$('#testResult').hidden=true;$('#reportPreview').textContent='';$('#downloadReport').disabled=$('#downloadPhoto').disabled=true;}
function showCard(){
 const ref=CARD_REFERENCES[$('#reference').value];$('#cardText').replaceChildren();
 for(const line of ref.lines){const p=document.createElement('p');p.textContent=line;$('#cardText').appendChild(p)}
 clearResult();
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
async function run(file,camera,attempt){
 if(running||pending!==attempt)return;running=true;lock(true);clearResult();const started=performance.now();
 let dimensions={},quality={},product={},failed=false,digest=null;
 try{
  photoUrl=URL.createObjectURL(file);const image=$('#photoPreview');image.src=photoUrl;await image.decode();if(pending!==attempt)return;dimensions={width:image.naturalWidth,height:image.naturalHeight};
  if(dimensions.width*dimensions.height>50000000)throw Error('Photo too large');image.hidden=false;lastPhoto=file;
  quality=await inspectPhoto(file);if(pending!==attempt)return;
  try{const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());digest=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')}catch{}
  if(pending!==attempt)return;
  $('#testStatus').textContent='متن عکس روی همین دستگاه خوانده می‌شود؛ بارگذاری اولیهٔ مدل‌ها ممکن است زمان ببرد…';
  const data=await analyzeProducts([{id:'device-check',photos:[{file}]}],{allergens:['milk','wheat','egg'],custom_avoid:[]},{purpose:'shopping',nativeReader:null});product=data.products[0]||{};
 }catch{failed=true;$('#testStatus').textContent='تست کامل نشد. گزارش خطا قابل دانلود است؛ عکس نزدیک‌تر یا اتصال اینترنت اولیه را بررسی کن.'}
 finally{
  if(pending!==attempt)return;
  lastReport=buildDeviceReport({referenceId:attempt.reference,physicalConfirmed:attempt.confirmed,target:attempt.target,condition:attempt.condition,camera,dimensions,imageSha256:digest,imageBytes:file.size,quality,product,durationMs:performance.now()-started,userAgent:navigator.userAgent,automationHint:navigator.webdriver,error:failed});
  $('#reportPreview').textContent=JSON.stringify(lastReport,null,2);$('#testSummary').textContent=`وضعیت: ${states[lastReport.analysis.state]}. اندازهٔ عکس: ${dimensions.width||'?'} × ${dimensions.height||'?'}. هشدار مستقیم: ${names(lastReport.analysis.direct_allergens)}. مورد معلومِ جاافتاده: ${names(lastReport.analysis.missing_known_allergens)}. هشدار اضافی نسبت به کارت: ${names(lastReport.analysis.additional_warnings_in_card_reference)}.`;
  $('#testResult').hidden=false;$('#downloadReport').disabled=false;$('#downloadPhoto').disabled=!lastPhoto;
  if(!failed)$('#testStatus').textContent='تست ثبت شد؛ گزارش نیازمند بازبینی است و هنوز اعتبارسنجی دوربین یا دقت عمومی محسوب نمی‌شود.';
  pending=null;running=false;lock(false);
 }
}
$('#checkVersion').textContent=DEVICE_CHECK_VERSION;showCard();
$('#routeTip').textContent=supportsLivePhoto()?'این مرورگر مسیر دوربین زنده و عکس مستقل را ارائه می‌دهد؛ پشتیبانی عملی دستگاه در تست مشخص می‌شود.':'در این مرورگر مسیر دوربین سیستم استفاده می‌شود.';
$('#reference').onchange=showCard;$('#target').onchange=clearResult;$('#condition').onchange=clearResult;
$('#physicalConfirmed').onchange=()=>{clearResult();lock(false)};
$('#printCard').onclick=()=>window.print();$('#fullCard').onclick=()=>$('#testCard').requestFullscreen?.().catch(()=>{});
$('#cancelAttempt').onclick=()=>{pending=null;lock(false);$('#testStatus').textContent='تلاش لغو شد؛ عکس یا نتیجهٔ جدیدی ثبت نشد.'};
cameraInput.addEventListener('cancel',()=>{if(!running){pending=null;lock(false);$('#testStatus').textContent='عکس‌گرفتن لغو شد.'}});
cameraInput.onchange=()=>{const file=cameraInput.files[0],attempt=pending;cameraInput.value='';if(file&&attempt)void run(file,{route:'system_camera'},attempt);else if(!running){pending=null;lock(false)}};
$('#takeTestPhoto').onclick=async()=>{
 if(running||pending||!$('#physicalConfirmed').checked)return;
 const attempt={reference:$('#reference').value,confirmed:$('#physicalConfirmed').checked,target:$('#target').value,condition:$('#condition').value};pending=attempt;clearResult();lock(true);
 const system=()=>{if(pending===attempt)cameraInput.click()};
 if(!supportsLivePhoto()){system();return}
 let fallback=false,info={route:'image_capture'};
 try{const file=await capturePhoto({language:CARD_REFERENCES[attempt.reference].language,onSystemCamera:()=>{fallback=true;system()},onCaptureInfo:value=>info=value});
  if(file)await run(file,info,attempt);else if(!fallback&&pending===attempt){pending=null;lock(false);$('#testStatus').textContent='عکس‌گرفتن لغو شد.'}
 }catch{pending=null;lock(false);$('#testStatus').textContent='دوربین باز نشد؛ مجوز دوربین مرورگر را بررسی کن.'}
};
$('#downloadReport').onclick=()=>{if(lastReport)download(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}),'adpai-device-report.json')};
$('#downloadPhoto').onclick=()=>{if(lastPhoto)download(lastPhoto,'adpai-camera-original.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/heic':'heic','image/heif':'heif'}[lastPhoto.type]||'bin'))};
window.addEventListener('pagehide',()=>{pending=null;running=false;clearResult();lock(false)});
