import { analyzeProducts } from "./tesseract.js?v=1.10.2";
import { cropPhoto } from "./crop.js?v=1.10.2";
import { explainIngredient, sourceTranscript } from "./ingredients.js?v=1.10.2";
import { initPwa, updateInstallUI } from "./pwa.js?v=1.10.2";
import { evaluateMenu } from './menu.js?v=1.10.2';
import {normalizeDietary, dietaryConflict} from './dietary.js?v=1.10.2';
import {inspectPhoto,qualityMessage} from './photo-quality.js?v=1.10.2';
import {capturePhoto,supportsLivePhoto} from './camera.js?v=1.10.2';
const APP_VERSION="1.10.2";
const MAX_PRODUCTS=6,MAX_PHOTOS=3;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const lang=$("#lang"),productsEl=$("#products"),analyze=$("#analyze"),result=$("#result"),loading=$("#loading"),productResults=$("#productResults");
let analyzing=false,selectingPhoto=false,inputRevision=0,lastResult=null;
let custom=[],products=[{id:1,photos:[]}],nextId=2;
let currentMode=null;
const modeProducts={shopping:products,menu:[{id:'menu',photos:[]}]};

const I={
 en:{photoHint:"Take clear photos of the ingredients and all allergy warnings.",tag:"Check the label before you buy.",hero:"Check one product or a whole basket.",sub:"Add several photos of the same product, or create separate product groups. Package language is detected automatically; analysis runs on this device.",profile:"What should we watch for?",profileSub:"Choose one or more allergens or ingredients you avoid.",milk:"Milk",egg:"Egg",peanut:"Peanut",treeNuts:"Tree nuts",soy:"Soy",wheat:"Wheat",sesame:"Sesame",fish:"Fish",shellfish:"Shellfish",add:"Add",products:"Add product photos",productsSub:"Up to 3 photos belong to one product. Use “Add another product” for a different item.",product:"Product",photosForSame:"Photos in this box are treated as the same product.",choose:"Choose photos",remove:"Remove",addProduct:"+ Add another product",analyze:"Analyze on this device",note:"Photos are processed in your browser and are not uploaded to an ADPAI analysis server.",checking:"Checking products…",checkingSub:"Starting on-device OCR…",privacy:"Photos and your selected profile stay on this device during analysis.",footer:"ADPAI may make mistakes. Please verify ingredients and allergens against the original package label. For severe allergies, check with the manufacturer; these results do not guarantee safety.",noProfile:"Select at least one item to check.",addPhoto:"Add at least one product photo.",conflict:"Conflict detected",caution:"Caution",clear:"No listed conflict detected",mixed:"Products checked",reason:"Reason",photoAdded:"Photo added",crop:"Focus / crop",restore:"Restore original",ingredientsTitle:"Ingredients in plain language",ingredientsNote:"Partial OCR list, not a verified full label. Explanations cover recognised terms only; they do not establish allergy safety.",noIngredients:"An ingredient list could not be extracted. Take a close, sharp photo including the ingredients heading and all warnings.",uncertainIngredient:"Uncertain read — check the original label before interpreting it.",unknownIngredient:"No plain-language explanation is available for this text yet.",rawOcr:"Show text read from photos",photo:"Photo",serverTitle:"On-device OCR could not start",serverBody:"The OCR engine or language data could not be loaded. Check your internet connection once, then try again.",directMatches:"Direct matches",cautionMatches:"Precautionary matches",ocrCoverage:"OCR families used",progressPrimary:"Reading Korean/Latin label text on this device…",progressRotate:"Checking rotated label text on this device…",progressFallback:"Trying another writing system on this device…",langProbe:"Checking language tags…",unableVerify:"Unable to verify",langCoverage:"Language coverage",testedScope:"Prototype languages: Korean · English · French; accuracy is not yet benchmarked.",experimentalScope:"Under validation: Persian · Arabic · Russian · Chinese/Japanese · Hindi · Thai",negativeScope:"Incomplete or uncertain reads remain unverified; no result certifies absence of allergens."},
 ko:{photoHint:"원재료와 모든 알레르기 주의 문구가 선명하게 보이도록 촬영하세요.",tag:"구매 전에 라벨을 확인하세요.",hero:"한 제품부터 여러 제품까지 한 번에 확인하세요.",sub:"같은 제품은 여러 장의 사진을 추가하고, 다른 제품은 별도 제품으로 추가하세요. 분석은 이 기기에서 직접 실행됩니다.",profile:"무엇을 확인할까요?",profileSub:"피하고 싶은 알레르기 유발물질 또는 성분을 선택하세요.",milk:"우유",egg:"달걀",peanut:"땅콩",treeNuts:"견과류",soy:"대두",wheat:"밀",sesame:"참깨",fish:"생선",shellfish:"갑각류·연체류",add:"추가",products:"제품 사진 추가",productsSub:"한 제품당 최대 3장까지 추가할 수 있습니다. 다른 제품은 ‘다른 제품 추가’를 사용하세요.",product:"제품",photosForSame:"이 박스의 사진은 같은 제품으로 분석됩니다.",choose:"사진 선택",remove:"삭제",addProduct:"+ 다른 제품 추가",analyze:"기기에서 제품 분석",note:"사진은 브라우저 안에서 처리되며 ADPAI 분석 서버로 업로드되지 않습니다.",checking:"제품 확인 중…",checkingSub:"기기 내 OCR을 시작하는 중…",privacy:"분석 중 사진과 선택한 프로필은 이 기기에서 처리됩니다.",footer:"ADPAI는 오류가 발생할 수 있습니다. 원재료와 알레르기 유발물질을 제품의 원본 라벨과 직접 대조해 주세요. 중증 알레르기가 있는 경우 제조사에도 확인하세요. 이 결과는 안전을 보장하지 않습니다.",noProfile:"확인할 항목을 하나 이상 선택하세요.",addPhoto:"제품 사진을 하나 이상 추가하세요.",conflict:"주의 성분이 확인되었습니다",caution:"주의가 필요합니다",clear:"표시된 충돌 성분 없음",mixed:"제품 분석 결과",reason:"판단 근거",photoAdded:"사진 추가됨",crop:"라벨 영역 선택",restore:"원본 복원",ingredientsTitle:"쉬운 말로 보는 원재료",ingredientsNote:"OCR로 읽은 일부 목록이며 전체 라벨 확인을 의미하지 않습니다. 설명은 인식된 용어에만 해당하며 알레르기 안전을 보장하지 않습니다.",noIngredients:"원재료 목록을 추출하지 못했습니다. 원재료 제목과 모든 주의 문구가 선명하게 보이도록 가까이서 촬영하세요.",uncertainIngredient:"판독이 불확실합니다. 해석하기 전에 원본 라벨을 확인하세요.",unknownIngredient:"이 문구에 대한 쉬운 설명이 아직 없습니다.",rawOcr:"사진에서 읽은 원문 보기",photo:"사진",serverTitle:"기기 내 OCR을 시작할 수 없습니다",serverBody:"OCR 엔진 또는 언어 데이터를 불러오지 못했습니다. 처음 한 번 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",directMatches:"직접 확인된 항목",cautionMatches:"주의 표시 항목",ocrCoverage:"사용된 OCR 계열",progressPrimary:"이 기기에서 한국어·라틴계 라벨을 읽는 중…",progressRotate:"회전된 라벨 텍스트를 확인하는 중…",progressFallback:"이 기기에서 다른 문자 체계를 확인하는 중…",langProbe:"언어 표시를 확인하는 중…",unableVerify:"확인 불가",langCoverage:"언어 커버리지",testedScope:"프로토타입 언어: 한국어 · 영어 · 프랑스어; 정확도 평가 전",experimentalScope:"검증 중: 페르시아어 · 아랍어 · 러시아어 · 중국어/일본어 · 힌디어 · 태국어",negativeScope:"불완전하거나 불확실한 판독은 확인 불가이며 알레르기 유발물질 부재를 보장하지 않습니다."}
};

Object.assign(I.en,{hero:'Check food before you choose.',sub:'Choose shopping or a restaurant menu, then select the ingredients you avoid.',shoppingMode:'Shopping',shoppingDescription:'Check ingredients and allergy warnings on food packages.',restaurantMode:'Restaurant menu',restaurantDescription:'Photograph a menu and check the ingredients it lists.',backHome:'Back to choices',menuWarning:'ADPAI may make mistakes. Menus may omit ingredients and cross-contact risks. Confirm with restaurant staff; no dish is verified safe.',menuPhotos:'Add menu photos',menuPhotosSub:'Up to 3 photos of the same menu. Keep dish names and ingredient descriptions visible.',menuPhotoHint:'Photograph the menu straight on. For several columns, crop or photograph each column separately.',menuGroup:'Menu photos',menuGroupSub:'Only ingredients written on the menu are checked. Recipes are not inferred.',analyzeMenu:'Check this menu',checkingMenu:'Reading the menu…',menuReview:'Menu review',potentialRisk:'Potential risk — confirm with staff',menuUnknown:'Ingredients incomplete — confirm with staff',menuMatches:'Selected ingredients mentioned',unassignedMenu:'Dish could not be identified',menuUnreadable:'No clear menu entries could be identified. Take a closer, sharper photo of one column and confirm ingredients with staff.',footer:'ADPAI may make mistakes. Verify package labels or confirm ingredients and cross-contact risks with restaurant staff. These results do not guarantee safety.'});
Object.assign(I.ko,{hero:'고르기 전에 음식을 확인하세요.',sub:'장보기 또는 식당 메뉴를 선택한 뒤 피해야 할 성분을 선택하세요.',shoppingMode:'장보기',shoppingDescription:'식품 포장의 원재료와 알레르기 주의 문구를 확인하세요.',restaurantMode:'식당 메뉴',restaurantDescription:'메뉴를 촬영해 적힌 성분을 확인하세요.',backHome:'처음으로',menuWarning:'ADPAI는 오류가 있을 수 있습니다. 메뉴에는 일부 성분과 교차접촉 위험이 표시되지 않을 수 있습니다. 반드시 식당 직원에게 확인하세요. 안전이 확인된 메뉴는 없습니다.',menuPhotos:'메뉴 사진 추가',menuPhotosSub:'같은 메뉴의 사진을 최대 3장 추가하세요. 음식 이름과 재료 설명이 보이도록 촬영하세요.',menuPhotoHint:'메뉴를 정면에서 선명하게 촬영하세요. 여러 열로 나뉜 메뉴는 한 열씩 촬영하거나 잘라 주세요.',menuGroup:'메뉴 사진',menuGroupSub:'메뉴에 적힌 성분만 확인하며 조리법은 추측하지 않습니다.',analyzeMenu:'이 메뉴 확인',checkingMenu:'메뉴를 읽는 중…',menuReview:'메뉴 확인 결과',potentialRisk:'주의 가능성 — 직원에게 확인',menuUnknown:'성분 정보 부족 — 직원에게 확인',menuMatches:'선택한 성분이 언급됨',unassignedMenu:'음식 이름을 확인하지 못함',menuUnreadable:'명확한 메뉴 항목을 찾지 못했습니다. 한 열을 가까이서 선명하게 다시 촬영하고 직원에게 재료를 확인하세요.',footer:'ADPAI는 오류가 있을 수 있습니다. 포장 라벨을 직접 확인하거나 식당 직원에게 재료와 교차접촉 위험을 확인하세요. 이 결과는 안전을 보장하지 않습니다.'});
Object.assign(I.en,{customPlaceholder:'Other ingredient, e.g. gelatin',brandCaption:'FOOD, WITH A LITTLE MORE CLARITY',beta:'Early access',eyebrow:'A SMALL CHECK. A MORE INFORMED CHOICE.',hero:'A clearer look at what you eat.',sub:'Read a food label or restaurant menu with your ingredients in mind.',privateDevice:'Photos stay on your device',labelLanguages:'English & Korean labels',artCaption:"Start with what's written.",chooseContext:'What are you checking?',contextHint:'Two ways to get started',guideProfile:'Choose what you avoid',guidePhoto:'Add a clear photo',guideReview:'Review the label evidence',shoppingDescription:'Read ingredients and allergy warnings on a food package.',restaurantDescription:'Check the ingredients written beside each dish.',labelTitle:'Check a food label',menuTitle:'Check a restaurant menu',labelSubtitle:'Choose your ingredients, then photograph the full label.',menuSubtitle:'Read what the menu says. Confirm the rest with staff.',profile:'Your ingredients to avoid',profileSub:'Select everything you want ADPAI to look for.',products:'Photograph the label',productsSub:'Include the ingredients and allergy warnings. Add up to 3 photos per product.',selectedCount:'ingredients selected',profileEmpty:'No ingredients selected yet',readyToRead:'Ready to read your photo',progressReading:'Reading the text in your photos…',menuEvidence:'View the text read',backHome:'Back to home',photoAdded:'photos added'});
Object.assign(I.ko,{customPlaceholder:'다른 성분 (예: 젤라틴)',brandCaption:'먹기 전에, 한 번 더 확인',beta:'테스트 버전',eyebrow:'작은 확인으로, 더 신중한 선택을.',hero:'먹기 전에, 한 번 더 확인하세요.',sub:'식품 라벨이나 식당 메뉴에서 피해야 할 성분을 확인해 보세요.',privateDevice:'사진은 내 기기에만',labelLanguages:'한국어 · 영어 라벨',artCaption:'적힌 내용부터 확인해요.',chooseContext:'무엇을 확인할까요?',contextHint:'두 가지 방법으로 시작하세요',guideProfile:'피할 성분 선택',guidePhoto:'선명한 사진 추가',guideReview:'인식된 문구 확인',shoppingDescription:'식품 포장의 원재료와 알레르기 주의 문구를 확인하세요.',restaurantDescription:'각 음식 옆에 적힌 재료를 확인하세요.',labelTitle:'식품 라벨 확인',menuTitle:'식당 메뉴 확인',labelSubtitle:'피해야 할 성분을 고른 뒤 라벨 전체를 촬영해 주세요.',menuSubtitle:'메뉴에 적힌 내용을 읽고, 나머지는 직원에게 확인하세요.',profile:'피해야 할 성분',profileSub:'확인하고 싶은 성분을 모두 선택하세요.',products:'라벨 사진 추가',productsSub:'원재료와 알레르기 주의 문구를 포함해 제품당 최대 3장을 추가하세요.',selectedCount:'개 성분 선택됨',profileEmpty:'아직 선택한 성분이 없습니다',readyToRead:'사진을 확인할 준비가 되었어요',progressReading:'사진 속 문구를 읽고 있어요…',menuEvidence:'인식된 원문 보기',backHome:'처음으로',photoAdded:'장 추가됨'});
Object.assign(I.en,{brandCaption:'Your food companion',beta:'Preview',workspace:'WORKSPACE',navHome:'Overview',navMenu:'Menu',localNote:'A personal check, with your privacy in mind.',privacyLink:'Privacy notice',skipContent:'Skip to content',eyebrow:'A LITTLE MORE CLARITY',hero:'Read the label.\nChoose with care.',sub:'Your ingredients in mind. The label in focus.',heroFootnote:'A helpful second look, never a safety guarantee.',chooseContext:'Start a new check',contextHint:'Made for your everyday',atShop:'AT THE SHOP',atTable:'AT THE TABLE',shoppingDescription:'Ingredients & allergy warnings.',restaurantDescription:'Ingredients written on the menu.',guideProfile:'Choose your ingredients',guidePhoto:'Add a clear photo',guideReview:'Review the evidence',backHome:'Back to overview',stepProfile:'Your ingredients',stepPhotos:'Photos',stepReview:'Review',profileSub:'Choose what you want us to look for.',otherIngredients:'Something else?',customPlaceholder:'Add an ingredient',continuePhotos:'Continue to photos →',products:'Add your label photos',productsSub:'Include ingredients and all allergy warnings. Up to 3 photos per product.',analyze:'Check ingredients',checking:'Reading your photos…',checkingSub:'This can take a moment. Keep this screen open.',privacy:'Your photos and selected ingredients stay on this device.'});
Object.assign(I.ko,{brandCaption:'먹기 전, 한 번 더',beta:'테스트 버전',workspace:'나의 공간',navHome:'홈',navMenu:'메뉴',localNote:'내 기기에서, 나에게 맞는 성분 확인.',privacyLink:'개인정보 처리 안내',skipContent:'본문으로 이동',eyebrow:'내 선택을 위한 작은 확인',hero:'먹기 전에,\n한 번 더 확인.',sub:'피해야 할 성분은 기억하고,\n라벨은 더 자세히 살펴보세요.',heroFootnote:'선택을 돕는 도구이며, 안전을 보장하지 않습니다.',chooseContext:'새로운 확인 시작',contextHint:'매일의 선택을 위해',atShop:'장볼 때',atTable:'외식할 때',shoppingDescription:'원재료와 알레르기 주의 문구.',restaurantDescription:'메뉴에 적힌 재료를 확인해요.',guideProfile:'피할 성분 선택',guidePhoto:'선명한 사진 추가',guideReview:'인식된 문구 확인',backHome:'처음으로',stepProfile:'피할 성분',stepPhotos:'사진',stepReview:'결과',profileSub:'확인하고 싶은 성분을 모두 선택해 주세요.',otherIngredients:'다른 성분도 있나요?',customPlaceholder:'성분 추가 (예: 젤라틴)',continuePhotos:'사진 추가로 이동 →',products:'라벨 사진 추가',productsSub:'원재료와 모든 주의 문구를 포함해 제품당 최대 3장을 추가하세요.',analyze:'성분 확인하기',checking:'사진을 읽고 있어요…',checkingSub:'잠시 시간이 걸릴 수 있어요. 화면을 열어 두세요.',privacy:'사진과 선택한 성분은 내 기기에서 처리됩니다.'});
Object.assign(I.en,{dietaryTitle:'Food preferences',dietaryIntro:'For restaurant menus only. Also checks listed stocks, fats and other derivatives.',avoid_pork:'Avoid pork',avoid_beef:'Avoid beef & veal',vegetarian:'Vegetarian',vegetarianDetail:'No meat, poultry, fish or seafood, including their stocks and derivatives. Milk and eggs allowed.',dietaryNotice:'Menus may omit ingredients. Unknown sources need staff confirmation.',menuSelectedCount:'checks selected',menuProfileEmpty:'No ingredients or preferences selected yet',menuNoProfile:'Select an ingredient or food preference to check.',dietaryConflict:'A listed ingredient conflicts with your preference — confirm with staff',dietaryMatches:'Food preference conflicts',dietaryUncertain:'Source or reading uncertain — ask staff'});
Object.assign(I.ko,{dietaryTitle:'식이 선호',dietaryIntro:'식당 메뉴에서만 적용됩니다. 적힌 육수·지방 등 파생 원료도 확인합니다.',avoid_pork:'돼지고기 피하기',avoid_beef:'소고기·송아지고기 피하기',vegetarian:'채식',vegetarianDetail:'육류·가금류·생선·해산물과 그 육수·파생 원료 제외. 우유와 달걀은 허용합니다.',dietaryNotice:'메뉴에는 재료가 빠질 수 있습니다. 원료의 출처가 불명확하면 직원에게 확인하세요.',menuSelectedCount:'개 확인 항목 선택됨',menuProfileEmpty:'아직 선택한 성분이나 식이 선호가 없습니다',menuNoProfile:'확인할 성분 또는 식이 선호를 선택하세요.',dietaryConflict:'적힌 재료가 식이 선호와 맞지 않습니다 — 직원에게 확인',dietaryMatches:'식이 선호와 맞지 않는 재료',dietaryUncertain:'출처 또는 판독 불확실 — 직원에게 문의'});
Object.assign(I.en,{retakeAdvice:'Some text could not be read clearly. Move closer, avoid glare and photograph one label or menu column at a time. Check the original text before choosing.'});
Object.assign(I.ko,{retakeAdvice:'일부 문구가 선명하게 읽히지 않았습니다. 가까이서 빛 반사를 피하고 라벨이나 메뉴의 한 열씩 촬영해 주세요. 선택하기 전에 원문을 확인하세요.'});
function t(k){return(I[lang.value]||I.en)[k]||I.en[k]||k}
function updateModeText(){
  const menu=currentMode==='menu';
  document.body.dataset.mode=currentMode||'home';
  $('#workflowTitle').textContent=t(menu?'menuTitle':'labelTitle');
  $('#workflowSubtitle').textContent=t(menu?'menuSubtitle':'labelSubtitle');
  for(const [key,value] of Object.entries({products:menu?'menuPhotos':'products',productsSub:menu?'menuPhotosSub':'productsSub',photoHint:menu?'menuPhotoHint':'photoHint',analyze:menu?'analyzeMenu':'analyze',checking:menu?'checkingMenu':'checking'}))$(`[data-i18n="${key}"]`).textContent=t(value);
  $('#workflow').hidden=!currentMode;$('#menuWarning').hidden=!menu;$('#menuDietary').hidden=!menu;$('#addProduct').hidden=menu;
  $('#shoppingMode').setAttribute('aria-pressed',String(currentMode==='shopping'));$('#restaurantMode').setAttribute('aria-pressed',String(menu));
  $('#pageContext').textContent=t(currentMode?(menu?'restaurantMode':'shoppingMode'):'navHome');
  $('#workflowContext').textContent=t(menu?'atTable':'atShop');
  $$('[data-nav-mode]').forEach(button=>{const mode=button.dataset.navMode;button.setAttribute('aria-label',t(mode==='home'?'navHome':mode==='menu'?'restaurantMode':'shoppingMode'));if(mode===(currentMode||'home'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
}
function setMode(mode){if(analyzing||selectingPhoto)return;if(mode&&!modeProducts[mode])return;if(mode===currentMode){window.scrollTo({top:0,behavior:'auto'});return}invalidateResults();currentMode=mode;if(mode)products=modeProducts[mode];updateModeText();renderProducts();update();window.scrollTo({top:0,behavior:'auto'});if(mode)$('#workflowTitle').focus({preventScroll:true})}
$$('.brand').forEach(brand=>brand.onclick=e=>{e.preventDefault();setMode(null)});
$$('[data-nav-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.navMode==='home'?null:button.dataset.navMode));
$('#shoppingMode').onclick=()=>setMode('shopping');$('#restaurantMode').onclick=()=>setMode('menu');$('#backHome').onclick=()=>setMode(null);
$('#continuePhotos').onclick=()=>{if(analyzing||selectingPhoto)return;$('#scanHeading').focus({preventScroll:true});$('.scanCard').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};
function setLang(v){$('#custom').placeholder=t('customPlaceholder');$('#custom').setAttribute('aria-label',t('customPlaceholder'));document.documentElement.lang=v;document.documentElement.dir="ltr";$$('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));localStorage.setItem('aller_lang',v);updateModeText();renderProducts();update();updateInstallUI();if(lastResult&&result.classList.contains('show'))showResults(lastResult)}
lang.value=localStorage.getItem('aller_lang')||'en';if(!['en','ko'].includes(lang.value))lang.value='en';lang.onchange=()=>setLang(lang.value);

function selectedDietary(){return normalizeDietary($$('#menuDietary input:checked').map(x=>x.value))}
function profile(mode=currentMode){return{allergens:$$('#chips input:checked').map(x=>x.value),custom_avoid:[...custom],...(mode==='menu'?{dietary_preferences:selectedDietary()}:{})}}
function invalidateResults(){inputRevision++;lastResult=null;result.classList.remove('show')}
function save(){invalidateResults();localStorage.setItem('aller_profile',JSON.stringify(profile('shopping')));update()}
try{const p=JSON.parse(localStorage.getItem('aller_profile')||'{}');(p.allergens||[]).forEach(v=>{const x=$(`#chips input[value="${v}"]`);if(x)x.checked=true});custom=Array.isArray(p.custom_avoid)?p.custom_avoid:[]}catch{}
$('#chips').onchange=save;
try{const saved=normalizeDietary(JSON.parse(localStorage.getItem('adpai_menu_dietary_v1')||'[]'));$$('#menuDietary input').forEach(input=>input.checked=saved.includes(input.value))}catch{}
$('#menuDietary').onchange=()=>{invalidateResults();localStorage.setItem('adpai_menu_dietary_v1',JSON.stringify(selectedDietary()));update()};
function renderCustom(){const e=$('#customList');e.innerHTML='';custom.forEach((v,i)=>{const l=document.createElement('label');l.className='chip';l.innerHTML="<input type='checkbox' checked><span></span>";l.querySelector('span').textContent=v+' ×';l.onclick=x=>{x.preventDefault();if(analyzing||selectingPhoto)return;custom.splice(i,1);renderCustom();save()};e.appendChild(l)})}
$('#add').onclick=()=>{if(analyzing||selectingPhoto)return;const v=$('#custom').value.trim();if(v&&!custom.some(x=>x.toLowerCase()===v.toLowerCase()))custom.push(v);$('#custom').value='';renderCustom();save()};
$('#custom').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#add').click()}};

function renderProducts(){
 productsEl.innerHTML='';
 products.forEach((p,idx)=>{
  const box=document.createElement('div');box.className='product';
  const top=document.createElement('div');top.className='ptop';
  const left=document.createElement('div');left.innerHTML=`<div class="ptitle">${currentMode==='menu'?t('menuGroup'):t('product')+' '+(idx+1)}</div><div class="psub">${t(currentMode==='menu'?'menuGroupSub':'photosForSame')}</div>`;top.appendChild(left);
  if(products.length>1){const rm=document.createElement('button');rm.className='removeProduct';rm.textContent=t('remove');rm.onclick=()=>{if(analyzing||selectingPhoto)return;invalidateResults();p.photos.forEach(x=>URL.revokeObjectURL(x.url));products.splice(idx,1);renderProducts();update()};top.appendChild(rm)}
  const cap=document.createElement('div');cap.className='capture';
  const capIcon=document.createElement('div');capIcon.className='captureIcon';capIcon.setAttribute('aria-hidden','true');capIcon.innerHTML='<svg class="icon"><use href="#i-camera"/></svg>';cap.appendChild(capIcon);
  const btn=document.createElement('button');btn.className='btn outline';btn.textContent=t('choose');btn.dataset.gallery='true';
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.hidden=true;
  const camera=document.createElement('button');camera.className='btn primary';camera.textContent=lang.value==='ko'?'사진 촬영':'Take a photo';camera.dataset.camera='true';
  const capture=document.createElement('input');capture.type='file';capture.accept='image/*';capture.setAttribute('capture','environment');capture.hidden=true;
  const assess=photo=>{const file=photo.file;photo.quality=null;photo.qualityTask=inspectPhoto(file).catch(()=>({issues:['text_not_found'],scope:'assessment_unavailable'})).then(value=>{if(p.photos.includes(photo)&&photo.file===file){photo.quality=value;if(!selectingPhoto&&!analyzing)renderProducts();update()}})};
  const addFiles=files=>{invalidateResults();for(const f of files){if(p.photos.length>=MAX_PHOTOS)break;if(f.type.startsWith('image/')){const photo={file:f,originalFile:f,url:URL.createObjectURL(f)};p.photos.push(photo);assess(photo)}}renderProducts();update()};
  const pickNative=async source=>{
    if(analyzing||selectingPhoto||p.photos.length>=MAX_PHOTOS)return;
    selectingPhoto=true;invalidateResults();update();
    try{addFiles(await (source==='camera'?globalThis.ADPAI_NATIVE.takePhoto():globalThis.ADPAI_NATIVE.pickPhotos(MAX_PHOTOS-p.photos.length)))}
    catch(error){
      // Cancellation and denied permission leave no result behind.
      if(!/cancel/iu.test(String(error?.message||error)))alert(lang.value==='ko'?'사진을 열 수 없습니다. 카메라 또는 사진 접근 권한을 확인하고 다시 시도하세요.':'Could not open the photo. Check camera or photo access and try again.');
    }finally{selectingPhoto=false;renderProducts();update()}
  };
  btn.onclick=()=>{if(globalThis.ADPAI_NATIVE)pickNative('gallery');else inp.click()};
  camera.onclick=async()=>{
   if(globalThis.ADPAI_NATIVE){pickNative('camera');return}
   if(!supportsLivePhoto()){capture.click();return}
   if(analyzing||selectingPhoto)return;
   selectingPhoto=true;invalidateResults();update();
   try{const file=await capturePhoto({language:lang.value,onSystemCamera:()=>capture.click()});if(file)addFiles([file])}
   finally{selectingPhoto=false;renderProducts();update()}
  };
  inp.onchange=e=>{if(!analyzing&&!selectingPhoto)addFiles([...e.target.files]);inp.value=''};
  capture.onchange=e=>{if(!analyzing&&!selectingPhoto)addFiles([...e.target.files]);capture.value=''};
  btn.disabled=camera.disabled=p.photos.length>=MAX_PHOTOS;
  const msg=document.createElement('p');msg.textContent=`${p.photos.length}/${MAX_PHOTOS} ${t('photoAdded')}`;cap.append(camera,btn,inp,capture,msg);
  const ph=document.createElement('div');ph.className='photos';
  p.photos.forEach((photo,j)=>{
    const wrap=document.createElement('div');wrap.className='photoWrap';
    const d=document.createElement('div');d.className='photo';
    const im=document.createElement('img');im.src=photo.url;im.alt=`${t('product')} ${idx+1} · ${t('photo')} ${j+1}`;
    const x=document.createElement('button');x.className='x';x.textContent='×';x.setAttribute('aria-label',t('remove'));
    x.onclick=()=>{if(analyzing||selectingPhoto)return;invalidateResults();URL.revokeObjectURL(photo.url);p.photos.splice(j,1);renderProducts();update()};
    const b=document.createElement('div');b.className='added';b.textContent=t('photoAdded');d.append(im,x,b);
    const crop=document.createElement('button');crop.className='btn outline cropPhoto';crop.textContent=t('crop');
    crop.onclick=async()=>{
      if(analyzing||selectingPhoto)return;
      selectingPhoto=true;update();
      try {
        const file=await cropPhoto(photo.originalFile,lang.value,{purpose:currentMode});
        if(file){invalidateResults();URL.revokeObjectURL(photo.url);photo.file=file;photo.url=URL.createObjectURL(file);assess(photo);renderProducts()}
      } catch {alert(lang.value==='ko'?'사진을 편집할 수 없습니다. 다른 사진을 선택하세요.':'Could not edit the photo. Please choose another photo.');}
      finally {selectingPhoto=false;renderProducts();update()}
    };
    const quality=document.createElement('p');quality.className='qualityHint';quality.setAttribute('aria-live','polite');quality.textContent=qualityMessage(photo.quality,lang.value);
    wrap.append(d,quality,crop);
    if(photo.file!==photo.originalFile){const restore=document.createElement('button');restore.className='btn outline restorePhoto';restore.textContent=t('restore');restore.onclick=()=>{if(analyzing||selectingPhoto)return;invalidateResults();URL.revokeObjectURL(photo.url);photo.file=photo.originalFile;photo.url=URL.createObjectURL(photo.file);assess(photo);renderProducts();update()};wrap.appendChild(restore)}
    ph.appendChild(wrap);
  });
  box.append(top,cap,ph);productsEl.appendChild(box)
 });
 $('#addProduct').disabled=products.length>=MAX_PRODUCTS
}
$('#addProduct').onclick=()=>{if(!analyzing&&!selectingPhoto&&products.length<MAX_PRODUCTS){invalidateResults();products.push({id:nextId++,photos:[]});renderProducts();update()}};
function update(){
 const p=profile(),hasPhoto=products.some(x=>x.photos.length),busy=analyzing||selectingPhoto;
 const menu=currentMode==='menu',selected=p.allergens.length+p.custom_avoid.length+(p.dietary_preferences?.length||0);
 $('#selectionCount').textContent=selected?(lang.value==='en'&&selected===1?(menu?'1 check selected':'1 ingredient selected'):`${selected} ${t(menu?'menuSelectedCount':'selectedCount')}`):t(menu?'menuProfileEmpty':'profileEmpty');
 $('#actionHint').textContent=t(!selected?(menu?'menuNoProfile':'noProfile'):!hasPhoto?'addPhoto':'readyToRead');
 analyze.disabled=busy||!currentMode||!(hasPhoto&&selected);
 $$('#products button,#products input,#chips input,#menuDietary input,#custom,#add,#lang,#customList input').forEach(el=>el.disabled=busy);
 products.forEach((product,index)=>{if(product.photos.length>=MAX_PHOTOS)$$('#products .product')[index].querySelectorAll('.capture button').forEach(el=>el.disabled=true)});
 $('#addProduct').disabled=busy||products.length>=MAX_PRODUCTS;
 $$('#modeSelection button,#backHome,[data-nav-mode]').forEach(el=>el.disabled=busy);
 $('#continuePhotos').disabled=busy||!selected;
 const stage=result.classList.contains('show')?3:selected?2:1;
 $$('.workflowSteps li').forEach(item=>{const number=Number(item.dataset.stage);item.classList.toggle('active',number===stage);item.classList.toggle('complete',number<stage);if(number===stage)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current')});
}

function setProgress(){const e=$('#loading span');if(e)e.textContent=t('progressReading')}
async function analyzeOnDevice(p,active){
 await Promise.all(active.flatMap(product=>product.photos.map(photo=>photo.qualityTask)).filter(Boolean));
 const menu=currentMode==='menu';
 const data=await analyzeProducts(active,p,{onProgress:setProgress,purpose:menu?'menu':'shopping'});
 return menu?{...evaluateMenu({sources:data.products[0]?.sources||[],profile:p,errors:data.products[0]?.errors||[]}),sources:data.products[0]?.sources||[],retake_recommended:data.products[0]?.retake_recommended!==false}:data;
}

function kindFor(status){return status==='conflict'?'danger':'warn'}
function addEv(parent,label,value){if(value===undefined||value===null||value==='')return;const r=document.createElement('div');r.className='ev';const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;r.append(a,b);parent.appendChild(r)}
function addRetakeAdvice(parent){const p=document.createElement('p');p.className='retakeAdvice';p.textContent=t('retakeAdvice');parent.appendChild(p)}
function allergenLabel(hit){const map={milk:'milk',egg:'egg',peanut:'peanut',tree_nuts:'treeNuts',soy:'soy',wheat:'wheat',sesame:'sesame',fish:'fish',shellfish:'shellfish'};if(hit&&map[hit.allergen_id])return t(map[hit.allergen_id]);if(hit&&hit.allergen_id==='custom')return lang.value==='ko'?'사용자 지정':(hit.allergen||'Custom avoid');return hit&&hit.allergen?hit.allergen:''}
function localizedStatus(status){if(lang.value!=='ko'){if(status==='unverified')return t('unableVerify');if(status==='conflict')return t('conflict');if(status==='caution')return t('caution');if(status==='unverified_language')return t('unableVerify');if(status==='no_listed_conflict')return t('unableVerify');if(status==='ingredient_not_confirmed')return'Ingredient list not confirmed';if(status==='nutrition_panel')return'Nutrition panel detected';if(status==='unreadable')return'Please retake the label photo';return String(status||'').replaceAll('_',' ')}const map={unverified:'확인 불가',conflict:'주의 성분 확인',caution:'교차접촉 주의',unverified_language:'확인 불가',no_listed_conflict:'확인 불가',ingredient_not_confirmed:'원재료 목록 확인 필요',nutrition_panel:'영양정보 확인됨',unreadable:'라벨 재촬영 필요'};return map[status]||String(status||'').replaceAll('_',' ')}
function localizedProductMessage(p){const dn=[...new Set((p.direct_matches||[]).map(allergenLabel))].filter(Boolean),cn=[...new Set((p.caution_matches||[]).map(allergenLabel))].filter(Boolean);if(lang.value!=='ko')return p.message||'';if(p.status==='conflict')return`선택한 주의 성분이 원재료 또는 직접 알레르기 표시에서 확인되었습니다: ${dn.join(', ')}.`;if(p.status==='caution')return`교차접촉 가능성에 대한 주의 표시가 확인되었습니다: ${cn.join(', ')}.`;if(p.status==='unverified')return'전체 원재료 라벨을 확인하지 못했습니다. 알레르기 유발물질이 없다는 뜻이 아닙니다.';if(p.status==='unverified_language')return'현재 검증 중인 언어의 라벨 패널을 감지했지만 충분히 확인하지 못했습니다. 이 결과를 음성 결과로 해석하지 마세요.';if(p.status==='no_listed_conflict')return'전체 라벨을 확인하지 못했습니다. 알레르기 유발물질 부재를 보장하지 않습니다.';if(p.status==='ingredient_not_confirmed'){
 if((p.required_panels||[]).some(x=>!(p.verified_panels||[]).includes(x)))return'다국어 제품 라벨이 감지되었지만 표시된 모든 언어의 원재료 정보를 확인하지 못했습니다. 모든 표시 언어를 확인하기 전에는 “충돌 성분 없음”으로 판단하지 않습니다.';
 return'알레르기 관련 표시는 확인했지만 전체 원재료 목록까지는 확인하지 못했습니다.'
};if(p.status==='nutrition_panel')return'영양정보는 확인했지만 전체 원재료 목록은 확인되지 않았습니다.';if(p.status==='unreadable')return'읽을 수 있는 라벨 텍스트가 충분하지 않습니다. 원재료 표시가 선명하게 보이도록 다시 촬영해 주세요.';return p.message||''}
function localizedReason(p){if(lang.value!=='ko')return p.reason||'';if(p.status==='conflict')return'원재료 또는 직접 알레르기 표시에서 확인되었습니다.';if(p.status==='caution')return'‘혼입 가능’, ‘may contain’과 같은 교차접촉 주의 문구에서 확인되었습니다.';if(p.status==='unverified')return'전체 원재료 라벨을 확인하지 못했습니다. 알레르기 유발물질이 없다는 뜻이 아닙니다.';if(p.status==='unverified_language')return'검증 중인 언어 패널을 확인하지 못했기 때문에 음성 결과를 차단했습니다.';
 if(p.status==='ingredient_not_confirmed'&&(p.required_panels||[]).some(x=>!(p.verified_panels||[]).includes(x)))return'표시된 모든 언어의 원재료 패널이 확인될 때까지 안전한 결과로 분류하지 않습니다.';
 return p.reason||''}
function showResults(data) {
  if(data.mode==='menu'){showMenuResults(data);return}
  lastResult=data;
  loading.classList.remove('show');
  result.classList.add('show');
  productResults.innerHTML = '';
  const ps = data.products || [];
  const conflicts = ps.filter(p => p.status === 'conflict').length;
  const cautions = ps.filter(p => p.status === 'caution').length;
  const unverified = ps.filter(p => !['conflict','caution'].includes(p.status)).length;
  $('#ricon').textContent = '!';
  $('#rtitle').textContent = conflicts ? localizedStatus('conflict') : cautions ? localizedStatus('caution') : t('unableVerify');
  $('#rbody').textContent = lang.value === 'ko'
    ? `제품 ${ps.length}개 · 주의 성분 ${conflicts}건 · 교차접촉 주의 ${cautions}건 · 확인 불가 ${unverified}건`
    : `${ps.length} ${ps.length === 1 ? 'Product' : 'Products'} · ${conflicts} ${t('conflict')} · ${cautions} ${t('caution')} · ${unverified} ${t('unableVerify')}`;
  ps.forEach((p,index) => {
    const box = document.createElement('div');
    box.className = `presult ${kindFor(p.status)}`;
    const top = document.createElement('div');
    top.className = 'prtop';
    const title = document.createElement('div');
    title.className = 'prtitle';
    title.textContent = `${t('product')} ${index+1}`;
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = localizedStatus(p.status);
    top.append(title,badge);
    const message = document.createElement('div');
    message.className = 'prmsg';
    message.textContent = localizedProductMessage(p);
    const evidence = document.createElement('div');
    evidence.className = 'evidence';
    addEv(evidence,t('directMatches'),(p.direct_matches || []).map(x => `${allergenLabel(x)} (${x.term})`).join(' · '));
    addEv(evidence,t('cautionMatches'),(p.caution_matches || []).map(x => `${allergenLabel(x)} (${x.term})`).join(' · '));
    const unresolved=(p.mention_matches||[]).filter(hit=>![...(p.direct_matches||[]),...(p.caution_matches||[])].some(known=>known.allergen_id===hit.allergen_id));
    addEv(evidence,lang.value==='ko'?'불확실한 판독 — 라벨 확인':'Uncertain mentions — check label',unresolved.map(hit=>`${allergenLabel(hit)} (${hit.term})`).join(' · '));
    box.append(top,message);
    if(p.retake_recommended)addRetakeAdvice(box);
    if (evidence.children.length) box.appendChild(evidence);
    const ingredients=document.createElement('section');ingredients.className='ingredientSection';
    const ih=document.createElement('h4');ih.textContent=t('ingredientsTitle');
    const note=document.createElement('p');note.textContent=t('ingredientsNote');ingredients.append(ih,note);
    if(!(p.ingredients||[]).length){const empty=document.createElement('p');empty.textContent=t('noIngredients');ingredients.appendChild(empty)}
    const list=document.createElement('ul');list.className='ingredientList';
    for(const item of p.ingredients||[]) {
      const li=document.createElement('li'),name=document.createElement('strong');name.textContent=item.original;
      const origin=document.createElement('small');origin.textContent=`${t('photo')} ${(item.photoIndex||0)+1}`;
      li.append(name,origin);
      const notes=item.uncertain?[]:explainIngredient(item.original,lang.value);
      if(!notes.length){const text=document.createElement('p');text.textContent=t(item.uncertain?'uncertainIngredient':'unknownIngredient');li.appendChild(text)}
      for(const explanation of notes){const text=document.createElement('p');text.textContent=explanation.text;li.appendChild(text)}
      list.appendChild(li);
    }
    ingredients.appendChild(list);box.appendChild(ingredients);
    const raw=document.createElement('details');raw.className='rawOcr';
    const summary=document.createElement('summary');summary.textContent=t('rawOcr');raw.appendChild(summary);
    for(const source of p.sources||[]) {
      const heading=document.createElement('p');heading.textContent=`${t('photo')} ${(source.photoIndex||0)+1} · ${source.familyId} · ${source.rotation||0}° · ${source.variant||'original'}`;
      const pre=document.createElement('pre');pre.textContent=sourceTranscript(source).text;raw.append(heading,pre);
    }
    box.appendChild(raw);
    productResults.appendChild(box);
  });
  result.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function showMenuResults(data){
 lastResult=data;loading.classList.remove('show');result.classList.add('show');productResults.replaceChildren();
 $('#ricon').textContent='!';$('#rtitle').textContent=t('menuReview');
 const count=data.items.filter(item=>item.matches.length||dietaryConflict(item.dietary_matches)).length;
 $('#rbody').textContent=lang.value==='ko'?`항목 ${data.items.length}개 · 주의 가능성 ${count}개. 판독된 항목만 표시하며 누락된 메뉴가 있을 수 있습니다. 안전이 확인된 메뉴는 없습니다.`:`${data.items.length} entries read · ${count} with potential risks. Only entries read are shown; other dishes may be missing. No dish is verified safe.`;
 if(data.retake_recommended&&(data.items.length||data.unassigned.length))addRetakeAdvice(productResults);
 const render=(item,unassigned=false)=>{
  const conflict=dietaryConflict(item.dietary_matches);
  const box=document.createElement('div');box.className='presult '+(item.matches.length||conflict?'danger':'warn');
  const heading=document.createElement('div');heading.className='prtitle';heading.textContent=unassigned?t('unassignedMenu'):item.name;
  const message=document.createElement('p');message.className='prmsg';message.textContent=t(item.matches.length?'potentialRisk':conflict?'dietaryConflict':'menuUnknown');
  const evidence=document.createElement('div');evidence.className='evidence';
  addEv(evidence,t('menuMatches'),item.matches.map(hit=>`${allergenLabel(hit)} (${hit.term})`).join(' · '));
  for(const kind of ['conflict','uncertain'])addEv(evidence,t(kind==='conflict'?'dietaryMatches':'dietaryUncertain'),(item.dietary_matches||[]).filter(hit=>hit.kind===kind).map(hit=>`${t(hit.preference_id)} (${hit.term})`).join(' · '));
  addEv(evidence,t('photo'),(item.photoIndex??0)+1);
  const quote=document.createElement('details');quote.className='menuQuote';
  const summary=document.createElement('summary');summary.textContent=t('menuEvidence');
  const original=document.createElement('p');original.className='menuEvidence';original.textContent=item.printed_text||item.text;quote.append(summary,original);
  box.append(heading,message,evidence,quote);productResults.appendChild(box);
 };
 for(const item of data.items)render(item);
 for(const item of data.unassigned)render(item,true);
 const readable=(data.sources||[]).filter(source=>source.items?.some(word=>/\p{L}/u.test(word.text)));
 if(!data.items.length&&!data.unassigned.length){const p=document.createElement('p');p.textContent=readable.length
  ?(lang.value==='ko'?'일부 문구를 읽었지만 음식별로 연결하지 못했습니다. 아래 원문을 확인하고 한 열씩 가까이서 다시 촬영하세요. 재료는 직원에게 확인하세요.':'Some text was read, but dishes could not be separated reliably. Review the text below and take a closer photo of one column. Confirm ingredients with staff.')
  :t('menuUnreadable');productResults.appendChild(p)}
 if(readable.length){
  const raw=document.createElement('details');raw.className='rawOcr';
  const summary=document.createElement('summary');summary.textContent=t('rawOcr');raw.appendChild(summary);
  const note=document.createElement('p');note.textContent=lang.value==='ko'?'불완전한 자동 판독입니다. 메뉴에 음식 이름만 있고 재료가 없으면 안전 여부를 판단할 수 없습니다.':'This automatic reading may be incomplete. Dish names alone cannot establish ingredients or safety.';raw.appendChild(note);
  for(const source of readable){const heading=document.createElement('h4');heading.textContent=`${t('photo')} ${(source.photoIndex??0)+1}`;const pre=document.createElement('pre');pre.textContent=sourceTranscript(source).text;raw.append(heading,pre)}
  productResults.appendChild(raw);
 }
 result.scrollIntoView({behavior:'smooth',block:'nearest'});
}

analyze.onclick=async()=>{if(analyzing||selectingPhoto)return;const p=profile();if(!(p.allergens.length||p.custom_avoid.length||p.dietary_preferences?.length)){alert(t(currentMode==='menu'?'menuNoProfile':'noProfile'));return}const active=products.filter(x=>x.photos.length);if(!active.length){alert(t('addPhoto'));return}result.classList.remove('show');loading.classList.add('show');analyzing=true;const revision=inputRevision;update();try{const d=await analyzeOnDevice(p,active);if(revision===inputRevision)showResults(d)}catch(e){console.error(e);loading.classList.remove('show');alert(t('serverTitle')+'\n'+t('serverBody'))}finally{loading.classList.remove('show');analyzing=false;update()}};

renderCustom();setLang(lang.value);renderProducts();update();

initPwa();
