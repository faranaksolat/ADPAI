import {capturePhoto,supportsLivePhoto} from './camera.js?v=1.11.0';
import {inspectPhoto} from './photo-quality.js?v=1.11.0';
import {analyzeProducts} from './tesseract.js?v=1.11.0';
import {CARD_REFERENCES,DEVICE_CHECK_VERSION,buildDeviceReport} from './device-report.js?v=1.11.0';
import {chooseShareFile,originalPhotoName,shareLocalFile} from './device-export.js?v=1.11.0';
const $=selector=>document.querySelector(selector),cameraInput=$('#systemCamera');
let pending=null,running=false,lastReport=null,lastPhoto=null,photoUrl=null,reportUrl=null,reportShare=null,photoShare=null,sharing=false;
const labels={milk:'شیر',wheat:'گندم',egg:'تخم‌مرغ'},names=ids=>ids.map(id=>labels[id]||id).join('، ')||'هیچ موردی';
const states={completed:'پردازش پایان یافت',partial_read:'خواندن ناقص است',no_text_read:'هیچ متنی خوانده نشد',invalid_image:'تصویر معتبر نیست',failed:'تست با خطا متوقف شد'};
function lock(value){
 for(const id of ['reference','target','condition','physicalConfirmed','printCard','fullCard'])$('#'+id).disabled=value;
 $('#takeTestPhoto').disabled=value||!$('#physicalConfirmed').checked||$('#target').value==='unknown';$('#cancelAttempt').hidden=!value||running;
}
function link(id,url){const a=$('#'+id);if(url)a.href=url;else a.removeAttribute('href');a.setAttribute('aria-disabled',String(!url));a.tabIndex=url?0:-1;}
function clearResult(){
 lastReport=null;lastPhoto=null;reportShare=null;photoShare=null;
 for(const url of [photoUrl,reportUrl])if(url)URL.revokeObjectURL(url);photoUrl=reportUrl=null;
 $('#photoPreview').removeAttribute('src');$('#photoPreview').hidden=true;$('#photoExport').hidden=true;$('#testResult').hidden=true;
 $('#reportPreview').value='';$('#reportDetails').open=false;$('#copyReport').disabled=true;$('#shareReport').hidden=$('#sharePhoto').hidden=true;
 for(const id of ['downloadReport','downloadPhoto','openPhoto'])link(id,null);$('#exportStatus').textContent='';
}
function showPhoto(file){
 lastPhoto=file;$('#photoExport').hidden=false;
 const original=new File([file],originalPhotoName(file),{type:file.type});
 photoShare=chooseShareFile([original]);$('#sharePhoto').hidden=!photoShare;
 $('#downloadPhoto').download=original.name;link('downloadPhoto',photoUrl);link('openPhoto',photoUrl);
}
function showReport(){
 const text=JSON.stringify(lastReport,null,2),json=new File([text],'adpai-device-report.json',{type:'application/json'});
 $('#reportPreview').value=text;reportUrl=URL.createObjectURL(json);link('downloadReport',reportUrl);
 reportShare=chooseShareFile([json,new File([text],'adpai-device-report.txt',{type:'text/plain'})]);
 $('#shareReport').hidden=!reportShare;$('#copyReport').disabled=false;$('#testResult').hidden=false;
}
function showCard(){
 const ref=CARD_REFERENCES[$('#reference').value];$('#cardText').replaceChildren();
 for(const line of ref.lines){const p=document.createElement('p');p.textContent=line;$('#cardText').appendChild(p)}
 clearResult();
}
async function run(file,camera,attempt){
 if(running||pending!==attempt)return;running=true;lock(true);clearResult();const started=performance.now();
 let dimensions={},quality={},product={},failed=false,digest=null;
 try{
  photoUrl=URL.createObjectURL(file);showPhoto(file);const image=$('#photoPreview');image.src=photoUrl;await image.decode();if(pending!==attempt)return;dimensions={width:image.naturalWidth,height:image.naturalHeight};
  if(dimensions.width*dimensions.height>50000000)throw Error('Photo too large');image.hidden=false;
  quality=await inspectPhoto(file);if(pending!==attempt)return;
  try{const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());digest=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')}catch{}
  if(pending!==attempt)return;
  $('#testStatus').textContent='متن عکس روی همین دستگاه خوانده می‌شود؛ بارگذاری اولیهٔ مدل‌ها ممکن است زمان ببرد…';
  const data=await analyzeProducts([{id:'device-check',photos:[{file}]}],{allergens:['milk','wheat','egg'],custom_avoid:[]},{purpose:'shopping',nativeReader:null});product=data.products[0]||{};
 }catch{failed=true;$('#testStatus').textContent='تست کامل نشد. گزارش خطا قابل دریافت یا کپی است؛ عکس نزدیک‌تر یا اتصال اینترنت اولیه را بررسی کن.'}
 finally{
  if(pending!==attempt)return;
  lastReport=buildDeviceReport({referenceId:attempt.reference,physicalConfirmed:attempt.confirmed,target:attempt.target,condition:attempt.condition,camera,dimensions,imageSha256:digest,imageBytes:file.size,quality,product,durationMs:performance.now()-started,userAgent:navigator.userAgent,automationHint:navigator.webdriver,error:failed});
  $('#testSummary').textContent=`وضعیت: ${states[lastReport.analysis.state]}. اندازهٔ عکس: ${dimensions.width||'?'} × ${dimensions.height||'?'}. هشدار مستقیم: ${names(lastReport.analysis.direct_allergens)}. مورد معلومِ جاافتاده: ${names(lastReport.analysis.missing_known_allergens)}. هشدار اضافی نسبت به کارت: ${names(lastReport.analysis.additional_warnings_in_card_reference)}.`;
  showReport();
  if(!failed)$('#testStatus').textContent='تست ثبت شد؛ گزارش نیازمند بازبینی است و هنوز اعتبارسنجی دوربین یا دقت عمومی محسوب نمی‌شود.';
  pending=null;running=false;lock(false);
 }
}
$('#checkVersion').textContent=DEVICE_CHECK_VERSION;showCard();
$('#routeTip').textContent=supportsLivePhoto()?'این مرورگر مسیر دوربین زنده و عکس مستقل را ارائه می‌دهد؛ پشتیبانی عملی دستگاه در تست مشخص می‌شود.':'در این مرورگر مسیر دوربین سیستم استفاده می‌شود.';
$('#reference').onchange=showCard;$('#target').onchange=()=>{clearResult();lock(false)};$('#condition').onchange=clearResult;
$('#physicalConfirmed').onchange=()=>{clearResult();lock(false)};
$('#printCard').onclick=()=>window.print();$('#fullCard').onclick=()=>$('#testCard').requestFullscreen?.().catch(()=>{});
$('#cancelAttempt').onclick=()=>{pending=null;lock(false);$('#testStatus').textContent='تلاش لغو شد؛ عکس یا نتیجهٔ جدیدی ثبت نشد.'};
cameraInput.addEventListener('cancel',()=>{if(!running){pending=null;lock(false);$('#testStatus').textContent='عکس‌گرفتن لغو شد.'}});
cameraInput.onchange=()=>{const file=cameraInput.files[0],attempt=pending;cameraInput.value='';if(file&&attempt)void run(file,{route:'system_camera'},attempt);else if(!running){pending=null;lock(false)}};
$('#takeTestPhoto').onclick=async()=>{
 if(running||pending||!$('#physicalConfirmed').checked||$('#target').value==='unknown')return;
 const attempt={reference:$('#reference').value,confirmed:$('#physicalConfirmed').checked,target:$('#target').value,condition:$('#condition').value};pending=attempt;clearResult();lock(true);
 const system=()=>{if(pending===attempt)cameraInput.click()};
 if(!supportsLivePhoto()){system();return}
 let fallback=false,info={route:'image_capture'};
 try{const file=await capturePhoto({language:CARD_REFERENCES[attempt.reference].language,onSystemCamera:()=>{fallback=true;system()},onCaptureInfo:value=>info=value});
  if(file)await run(file,info,attempt);else if(!fallback&&pending===attempt){pending=null;lock(false);$('#testStatus').textContent='عکس‌گرفتن لغو شد.'}
 }catch{pending=null;lock(false);$('#testStatus').textContent='دوربین باز نشد؛ مجوز دوربین مرورگر را بررسی کن.'}
};
for(const id of ['downloadReport','downloadPhoto','openPhoto'])$('#'+id).onclick=event=>{
 if(!$('#'+id).hasAttribute('href')){event.preventDefault();return}
 $('#exportStatus').textContent='فایل در اختیار مرورگر قرار گرفت؛ ذخیره یا ارسال آن هنوز تأیید نشده است. اگر «پشتیبانی نمی‌شود» دیدی، از اشتراک‌گذاری، کپی گزارش یا لمس طولانی روی عکس استفاده کن.';
};
async function share(file){
 if(sharing)return;sharing=true;$('#sharePhoto').disabled=$('#shareReport').disabled=true;
 // Call share synchronously from this user gesture; no prior clipboard work or
 // file decoding may consume the browser's transient activation.
 const result=await shareLocalFile(file);sharing=false;$('#sharePhoto').disabled=$('#shareReport').disabled=false;
 $('#exportStatus').textContent={completed:'پنجرهٔ اشتراک‌گذاری بسته شد؛ دریافت فایل در این گفتگو هنوز تأیید نشده است.',cancelled:'اشتراک‌گذاری لغو شد؛ عکس و گزارش همچنان در همین صفحه موجودند.',unsupported:'اشتراک فایل در این مرورگر پشتیبانی نمی‌شود؛ گزارش را کپی کن و عکس را با لمس طولانی ذخیره کن. می‌توانی صفحه را در Chrome یا Safari باز کنی.',failed:'اشتراک‌گذاری انجام نشد؛ گزارش را کپی کن و عکس را با لمس طولانی ذخیره کن. در مرورگر داخل اپ، صفحه را در Chrome یا Safari باز کن.'}[result];
}
$('#shareReport').onclick=()=>void share(reportShare);$('#sharePhoto').onclick=()=>void share(photoShare);
$('#copyReport').onclick=async()=>{
 if(!lastReport)return;const text=$('#reportPreview').value;$('#reportDetails').open=true;
 const select=()=>{const box=$('#reportPreview');box.focus();box.select();box.setSelectionRange(0,box.value.length)};
 select();
 try{await navigator.clipboard.writeText(text);$('#exportStatus').textContent='گزارش کپی شد؛ می‌توانی آن را در پیام همین گفتگو بچسبانی.'}
 catch{select();$('#exportStatus').textContent='کپی خودکار در این مرورگر در دسترس نیست. متن گزارش انتخاب شده؛ روی آن لمس طولانی کن و «کپی» را بزن، سپس اینجا بچسبان.'}
};
// Keep completed evidence when a viewer/share sheet backgrounds the page or
// when Back restores it from bfcache. URLs are freed on explicit reset or when
// the document is destroyed, rather than expiring while Android still uses it.
window.addEventListener('pagehide',()=>{
 if(pending){pending=null;running=false;lock(false);$('#testStatus').textContent='تلاش ناتمام متوقف شد؛ برای گزارش کامل دوباره تست بگیر.'}
});
