import { ingredientEvidence } from './engine.js?v=1.11.1';
import { validGTIN, normalizeBarcode, normalizeOFFResponse, statusFor, historyItem, recentItems, safeStoredList, HISTORY_KEY, SAVED_KEY } from './barcode-core.js?v=1.11.1';

// Browser-side pilot: third-party catalog data is never proof of allergen absence.
// Neither photos nor user allergy preferences are uploaded for barcode lookup.
const COPY={
 en:{title:'Scan a packaged food barcode',intro:'Look up the barcode first. If ingredients are missing, check the physical label with OCR below.',scan:'Scan with camera',stop:'Stop camera',lookup:'Find product',entry:'EAN/UPC/GTIN barcode',invalid:'Invalid barcode (check digit).',search:'Looking up product…',missing:'No matching product or ingredient data. Use a label photo instead.',fail:'Lookup unavailable; use a label photo.',photo:'Use ingredient-label photo (OCR)',ingredients:'Database ingredients — compare with package',allergens:'Database allergen declaration',traces:'Database precautionary information',conflict:'Selected ingredient mentioned in catalog data; check package.',caution:'Possible cross-contact reported; check package.',unknown:'Not verified: missing matches do not mean allergen-free.',source:'Source: Open Food Facts (ODbL); community-maintained and potentially out of date.',korea:'Listed for Korean market (not proof of Korean manufacture).',market:'Korean market not confirmed; verify product and label.',recent:'Recent scans',saved:'Saved products',save:'Save',remove:'Remove',clear:'Clear history',empty:'No scans saved',privacy:'Only the barcode is sent to Open Food Facts. Your profile and photos remain on this device.',cameraFail:'Camera unavailable. Type barcode or use OCR.',rate:'Too many lookups. Try later or photograph the label.'},
 ko:{title:'포장식품 바코드 스캔',intro:'바코드를 먼저 조회합니다. 원재료가 없으면 아래 원재료 라벨 사진 판독을 이용하세요.',scan:'카메라로 스캔',stop:'카메라 중지',lookup:'제품 조회',entry:'EAN/UPC/GTIN 바코드',invalid:'올바른 바코드가 아닙니다 (체크디지트).',search:'제품을 조회하고 있습니다…',missing:'제품이나 원재료 정보가 없습니다. 라벨 사진으로 확인하세요.',fail:'조회에 실패했습니다. 라벨 사진을 이용하세요.',photo:'원재료 라벨 사진으로 확인 (OCR)',ingredients:'데이터베이스 원재료 — 실제 포장지와 대조',allergens:'데이터베이스 알레르기 표시',traces:'데이터베이스 교차접촉 주의 문구',conflict:'주의 성분이 데이터에서 확인되었습니다. 실제 포장을 확인하세요.',caution:'교차접촉 가능성이 표시되었습니다. 실제 포장을 확인하세요.',unknown:'미확인: 검출되지 않았다고 알레르겐이 없는 것은 아닙니다.',source:'출처: Open Food Facts (ODbL), 사용자 제공 데이터. 최신성·정확성 미보장.',korea:'한국 유통 정보가 있습니다 (한국 제조 여부는 확인되지 않음).',market:'한국 유통 여부를 확인할 수 없습니다. 포장을 확인하세요.',recent:'최근 스캔',saved:'저장 제품',save:'저장',remove:'삭제',clear:'기록 삭제',empty:'최근 기록 없음',privacy:'조회 시 바코드 번호만 전송합니다. 프로필과 사진은 기기에 남습니다.',cameraFail:'카메라를 사용할 수 없습니다. 바코드 번호 또는 라벨 사진을 이용하세요.',rate:'조회 요청이 많습니다. 나중에 다시 시도하거나 라벨 사진을 촬영하세요.'}
};
const $=s=>document.querySelector(s);
const text=k=>COPY[$('#lang')?.value==='ko'?'ko':'en'][k]||k;
const make=(tag,body,cls)=>{const el=document.createElement(tag);if(body!==undefined)el.textContent=body;if(cls)el.className=cls;return el};
const read=key=>{try{return safeStoredList(localStorage.getItem(key))}catch{return []}};
const write=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
let panel,controller,session,requestTimes=[];
function status(key){panel.querySelector('.abStatus').textContent=key?text(key):''}
function stop(){
 if(!session)return;
 session.closed=true;try{session.controls?.stop?.()}catch{}
 session.stream?.getTracks?.().forEach(track=>track.stop());
 panel.querySelector('video').srcObject=null;
 panel.querySelector('.abScanStage').hidden=true;
 panel.querySelector('.abStart').hidden=false;
 panel.querySelector('.abStop').hidden=true;
 session=null;
}
function fallback(){
 stop();$('#scanHeading')?.scrollIntoView({behavior:'smooth',block:'center'});
 $('#scanHeading')?.focus({preventScroll:true});
}
function photoButton(){
 const b=make('button',text('photo'));b.type='button';b.onclick=fallback;return b;
}
function renderHistory(){
 const holder=panel.querySelector('.abHistory');holder.replaceChildren();
 for(const [key,title] of [[HISTORY_KEY,'recent'],[SAVED_KEY,'saved']]){
  holder.append(make('h4',text(title)));
  const items=read(key);
  if(!items.length)holder.append(make('p',text('empty'),'abNote'));
  const ul=make('ul',undefined,'abHistoryList');
  for(const item of items){
   const li=make('li'),open=make('button',item.name),code=make('small',item.barcode);
   open.type='button';open.onclick=()=>lookup(item.barcode);li.append(open,code);
   if(key===SAVED_KEY){
    const del=make('button',text('remove'));del.type='button';
    del.onclick=()=>{write(key,read(key).filter(x=>x.barcode!==item.barcode));renderHistory()};
    li.append(del);
   }
   ul.append(li);
  }
  holder.append(ul);
 }
 const clear=make('button',text('clear'));clear.type='button';
 clear.onclick=()=>{write(HISTORY_KEY,[]);renderHistory()};
 holder.append(clear);
}
function profile(){
 let custom=[];
 try{const v=JSON.parse(localStorage.getItem('aller_profile')||'{}');if(Array.isArray(v.custom_avoid))custom=v.custom_avoid.filter(x=>typeof x==='string').slice(0,30)}catch{}
 return {allergens:[...document.querySelectorAll('#chips input:checked')].map(x=>x.value),custom_avoid:custom};
}
function analyze(result){
 const sources=[];
 if(result.ingredients)sources.push({familyId:'korean',items:[{text:'원재료명: '+result.ingredients,score:1}]});
 if(result.allergens)sources.push({familyId:'korean',items:[{text:'알레르기 유발물질: '+result.allergens,score:1}]});
 if(result.traces)sources.push({familyId:'korean',items:[{text:'이 제품은 '+result.traces+' 혼입 가능',score:1}]});
 const e=ingredientEvidence({sources,profile:profile()});
 return {direct:e.direct_matches||[],caution:e.caution_matches||[],mentions:e.mention_matches||[]};
}
function renderProduct(p){
 const out=panel.querySelector('.abResult');out.replaceChildren();
 out.append(make('h4',p.name),make('p',[p.brand,p.barcode].filter(Boolean).join(' · '),'abNote'));
 out.append(make('p',text(p.marketConfirmed?'korea':'market'),'abNote'));
 function labeled(key,value){if(value){out.append(make('strong',text(key)),make('pre',value))}}
 labeled('ingredients',p.ingredients);labeled('allergens',p.allergens);labeled('traces',p.traces);
 let evidence={direct:[],caution:[],mentions:[]};
 try{evidence=analyze(p)}catch(err){console.warn('Catalog evidence unavailable',err)}
 const code=statusFor(p,evidence.direct.length,evidence.caution.length);
 const cls=code==='CONFLICT'?'abFlag':code==='CAUTION'?'abCaution':'abUnknown';
 out.append(make('p',text(code==='CONFLICT'?'conflict':code==='CAUTION'?'caution':'unknown'),cls));
 const hits=[...evidence.direct,...evidence.caution,...evidence.mentions].map(x=>x.term).filter(Boolean);
 if(hits.length)out.append(make('p',[...new Set(hits)].join(' · '),'abNote'));
 const link=make('a',text('source'));link.href=p.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';out.append(link);
 const row=make('div',undefined,'abTools'),save=make('button',text('save'));save.type='button';
 save.onclick=()=>{write(SAVED_KEY,recentItems(read(SAVED_KEY),historyItem(p)));renderHistory()};
 row.append(save,photoButton());out.append(row);
 if(!p.ingredients)status('missing');
}
async function lookup(raw){
 stop();controller?.abort();
 const barcode=normalizeBarcode(raw);panel.querySelector('.abBarcode').value=barcode;
 if(!validGTIN(barcode)){status('invalid');return}
 const now=Date.now();requestTimes=requestTimes.filter(t=>t>now-60000);
 if(requestTimes.length>=12){status('rate');return}
 requestTimes.push(now);
 const c=new AbortController();controller=c;
 const btn=panel.querySelector('.abLookup');btn.disabled=true;
 const out=panel.querySelector('.abResult');out.replaceChildren();status('search');
 try{
  const fields='code,product_name,product_name_ko,product_name_en,brands,ingredients_text,ingredients_text_ko,allergens,traces,countries_tags,last_modified_t';
  const url='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(barcode)+'.json?fields='+encodeURIComponent(fields);
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',referrerPolicy:'no-referrer',signal:c.signal});
  if(!response.ok)throw Error('LOOKUP_HTTP_'+response.status);
  const product=normalizeOFFResponse(barcode,await response.json());
  if(c!==controller)return;
  if(!product){status('missing');out.append(photoButton());return}
  status('');renderProduct(product);
  write(HISTORY_KEY,recentItems(read(HISTORY_KEY),historyItem(product)));renderHistory();
 }catch(err){
  if(c===controller&&err.name!=='AbortError'){console.warn('Barcode lookup failed',err);status('fail');out.append(photoButton())}
 }finally{if(c===controller){controller=null;btn.disabled=false}}
}
function scan(){
 if(session)return;
 const video=panel.querySelector('video'),stage=panel.querySelector('.abScanStage');
 stage.hidden=false;panel.querySelector('.abStart').hidden=true;panel.querySelector('.abStop').hidden=false;
 const s={closed:false,stream:null,controls:null};session=s;
 (async()=>{
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
  if(s.closed){stream.getTracks().forEach(x=>x.stop());return}
  s.stream=stream;video.srcObject=stream;await video.play();if(s.closed)return;
  let formats=[];
  try{formats=await globalThis.BarcodeDetector?.getSupportedFormats?.()||[]}catch{}
  formats=['ean_13','ean_8','upc_a','upc_e'].filter(x=>formats.includes(x));
  if(formats.length){
   const detector=new globalThis.BarcodeDetector({formats});
   const step=async()=>{
    if(s.closed)return;
    try{for(const x of await detector.detect(video)){const b=normalizeBarcode(x.rawValue);if(validGTIN(b)){stop();lookup(b);return}}}catch{}
    if(!s.closed)setTimeout(step,180);
   };step();return;
  }
  // Safari fallback: load decoder only after user taps Scan.
  const src='https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
  if(!globalThis.ZXingBrowser?.BrowserMultiFormatReader){
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.append(script);
   });
  }
  if(s.closed)return;
  const Decoder=globalThis.ZXingBrowser?.BrowserMultiFormatReader;
  if(!Decoder)throw Error('ZXing unavailable');
  stream.getTracks().forEach(x=>x.stop());s.stream=null;video.srcObject=null;
  const controls=await new Decoder().decodeFromVideoDevice(undefined,video,result=>{
   if(s.closed||!result)return;
   const b=normalizeBarcode(result.getText());
   if(validGTIN(b)){stop();lookup(b)}
  });
  if(s.closed)controls.stop();else s.controls=controls;
 })().catch(err=>{if(!s.closed){console.warn('Barcode camera unavailable',err);stop();status('cameraFail')}});
}
export function initBarcodeUi(){
 if(panel||!$('.scanCard')||!$('#chips'))return;
 panel=make('section',undefined,'adpaiBarcode');panel.id='adpaiBarcode';
 panel.innerHTML='<h3 class="abTitle"></h3><p class="abSub abNote"></p><div class="abTools"><input class="abBarcode" inputmode="numeric" autocomplete="off" maxlength="20" aria-label="Barcode"><button class="abLookup primary" type="button"></button><button class="abStart" type="button"></button><button class="abStop" type="button" hidden></button></div><div class="abScanStage" hidden><video autoplay playsinline muted aria-label="Barcode camera preview"></video><div class="abAim" aria-hidden="true"></div></div><p class="abStatus" role="status" aria-live="polite"></p><div class="abResult" role="region" aria-live="polite"></div><p class="abNote abPrivacy"></p><details><summary class="abHistoryTitle"></summary><div class="abHistory"></div></details>';
 $('.scanCard .head')?.after(panel);
 const labels=()=>{panel.querySelector('.abTitle').textContent=text('title');panel.querySelector('.abSub').textContent=text('intro');panel.querySelector('.abBarcode').placeholder=text('entry');panel.querySelector('.abLookup').textContent=text('lookup');panel.querySelector('.abStart').textContent=text('scan');panel.querySelector('.abStop').textContent=text('stop');panel.querySelector('.abPrivacy').textContent=text('privacy');panel.querySelector('.abHistoryTitle').textContent=text('recent');renderHistory()};
 labels();$('#lang')?.addEventListener('change',labels);
 panel.querySelector('.abLookup').onclick=()=>lookup(panel.querySelector('.abBarcode').value);
 panel.querySelector('.abBarcode').onkeydown=e=>{if(e.key==='Enter')lookup(e.currentTarget.value)};
 panel.querySelector('.abStart').onclick=scan;
 panel.querySelector('.abStop').onclick=stop;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 window.addEventListener('pagehide',()=>{stop();controller?.abort()});
 new MutationObserver(()=>{if(document.body.dataset.mode!=='shopping')stop()}).observe(document.body,{attributes:true,attributeFilter:['data-mode']});
}
