import {COSMETIC_GLOSSARY} from './cosmetic-glossary.js?v=1.11.0';
import {evaluateCosmetics,normalizeCosmetic} from './cosmetics.js?v=1.11.0';
import {readCosmeticPhotos} from './cosmetic-ocr.js?v=1.11.0';
import {sourceTranscript} from './ingredients.js?v=1.11.0';
import {capturePhoto,supportsLivePhoto} from './camera.js?v=1.11.0';
const $=s=>document.querySelector(s);
const words={en:{back:'← Back to overview',eyebrow:'COSMETICS & CARE · PREVIEW',title:'Understand your care label.',intro:'Read English or Korean ingredient names and see what they do.',notice:'ADPAI may misread labels. Cosmetic and food allergies are different. This preview does not determine whether a product is safe for you. Check the original label and confirm uncertainties with the manufacturer.',avoidTitle:'Ingredients you want to check',avoidIntro:'Optional. Names are checked against the words on the label.',coconut:'Check coconut names and ingredients whose source needs confirmation',search:'Add an English or Korean ingredient name',add:'Add',exact:'Unknown names are checked literally; related compounds are not guessed.',scopeTitle:'Vocabulary and limits',scopeNote:'This is an authored starter vocabulary, pending independent English/Korean and ingredient-source review. It does not cover every ingredient. Unknown words stay visible.',inputTitle:'One product, one ingredient list',inputIntro:'Photograph the full ingredient list. Avoid glare and keep small text in focus.',inputMode:'Input',photos:'Photos',typed:'Paste label text',camera:'Take photo',choose:'Choose photos',sameProduct:'Up to 3 photos of the same product. Include the ingredients heading.',textLabel:'Original ingredient text',manualNote:'Pasted text is user supplied. It is not a camera or OCR accuracy test.',analyze:'Explain label',reset:'Clear product',private:'Photos and label text are processed on this device. No image API is called.',raw:'View original text read / entered',footer:'No match is not proof of absence or suitability. Fragrance mixtures, ingredient sources and unread text may remain unknown. Confirm with the manufacturer and your clinician when needed.',privacy:'Privacy notice',listed:'Selected name listed — verify the label',review:'Source or reading needs confirmation',unverified:'Unable to verify suitability',unknown:'Name not in this vocabulary — check the original label.',uncertain:'Uncertain text or ingredient context — confirm the original before interpreting.',mixture:'The fragrance mixture is not fully named here; confirm its composition with the manufacturer.',source:'Source needs manufacturer confirmation; this is not proof of coconut protein or an allergy reaction.',name:'Selected ingredient name found; this is not a clinical risk assessment.',reading:'Reading label text on this device…',incomplete:'Reading was incomplete; the result cannot confirm ingredient absence.',scope:'draft bilingual ingredient identities',counts:'recognized identities / uncertain rows / unknown fragments',notFull:'A partial list only. Full-label coverage and allergy safety have not been established.',typedResult:'Based on entered text, not OCR.',ocrResult:'Based on estimated OCR words, not a verified transcription.',tooMany:'Only 3 photos of one product can be included.',photoError:'The photo could not be opened. Use a supported image and try again.',remove:'Remove',empty:'No ingredient rows could be extracted. Include the ingredients heading and take a closer photo.',truncated:'The input or visible list was limited; review the full original label.'},
ko:{back:'← 홈으로',eyebrow:'화장품·생활용품 · 테스트',title:'화장품 성분을 쉽게 살펴보세요.',intro:'한국어·영어 성분명을 읽고 어떤 용도로 쓰이는지 확인하세요.',notice:'ADPAI는 라벨을 잘못 읽을 수 있습니다. 화장품 알레르기와 식품 알레르기는 다릅니다. 이 도구는 개인에게 안전한 제품인지 판단하지 않습니다. 원본 라벨과 대조하고 불확실한 내용은 제조사에 확인하세요.',avoidTitle:'확인하고 싶은 성분',avoidIntro:'선택 사항입니다. 라벨에 적힌 성분명을 확인합니다.',coconut:'코코넛 성분명과 원료 출처 확인이 필요한 성분 확인',search:'한국어 또는 영어 성분명 추가',add:'추가',exact:'사전에 없는 이름은 입력한 글자 그대로 확인합니다. 관련 화합물을 추측하지 않습니다.',scopeTitle:'성분 사전과 한계',scopeNote:'직접 작성한 초기 성분 사전으로 한국어·영어 명칭과 원료 정보에 대한 독립 검토가 필요합니다. 모든 성분을 포함하지 않으며 미등록 문구도 그대로 보여 드립니다.',inputTitle:'한 제품의 전성분표',inputIntro:'전성분표 전체를 촬영하세요. 빛 반사를 피하고 작은 글자에 초점을 맞추세요.',inputMode:'입력 방식',photos:'사진',typed:'라벨 원문 붙여넣기',camera:'사진 촬영',choose:'사진 선택',sameProduct:'같은 제품의 사진을 최대 3장 추가하세요. 전성분 제목도 포함해 주세요.',textLabel:'라벨에 적힌 성분 원문',manualNote:'붙여넣은 문구는 사용자가 입력한 자료이며 카메라·OCR 정확도 시험이 아닙니다.',analyze:'성분 설명 보기',reset:'제품 지우기',private:'사진과 라벨 문구는 이 기기에서 처리됩니다. 이미지 API를 호출하지 않습니다.',raw:'읽거나 입력한 원문 보기',footer:'일치하는 이름이 없더라도 성분 부재나 적합성을 확인할 수 없습니다. 향료 혼합물·원료 출처·읽지 못한 문구가 남을 수 있습니다. 필요하면 제조사와 의료진에게 확인하세요.',privacy:'개인정보 처리 안내',listed:'선택한 성분명이 표시됨 — 원본 확인',review:'원료 출처 또는 판독 확인 필요',unverified:'적합성 확인 불가',unknown:'성분 사전에 없는 이름입니다. 원본 라벨을 확인하세요.',uncertain:'문구나 전성분 문맥이 불확실합니다. 해석하기 전에 원본을 확인하세요.',mixture:'향료 혼합물의 개별 성분이 모두 표시되어 있지 않습니다. 제조사에 구성을 확인하세요.',source:'원료 출처는 제조사에 확인해야 합니다. 코코넛 단백질 함유나 알레르기 반응의 증거는 아닙니다.',name:'선택한 성분명이 발견되었습니다. 의학적 위험 평가가 아닙니다.',reading:'이 기기에서 라벨 문구를 읽고 있습니다…',incomplete:'판독이 완전하지 않습니다. 성분이 없다고 판단할 수 없습니다.',scope:'개 한국어·영어 성분명 (초기 사전)',counts:'인식된 성분명 / 불확실한 문구 / 미등록 문구',notFull:'일부 성분 목록입니다. 전성분표 전체 판독과 알레르기 안전은 확인되지 않았습니다.',typedResult:'OCR이 아닌 입력 문구를 기준으로 합니다.',ocrResult:'OCR 추정 문구이며 검증된 전사가 아닙니다.',tooMany:'한 제품의 사진을 최대 3장 추가할 수 있습니다.',photoError:'사진을 열 수 없습니다. 지원되는 이미지로 다시 시도해 주세요.',remove:'삭제',empty:'성분 목록을 추출하지 못했습니다. 전성분 제목을 포함해 가까이서 촬영하세요.',truncated:'입력 또는 표시 목록이 제한되었습니다. 전체 원본 라벨을 확인하세요.'}};
let language='en',files=[],urls=[],avoid=[],busy=false,selecting=false,revision=0,last=null,lastSources=[],lastErrors=[];
try{language=localStorage.getItem('adpai_cosmetic_language')==='ko'?'ko':'en'}catch{}
$('#careLang').value=language;const t=key=>words[language][key];
const node=(tag,text,className)=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n};
function update(){
 document.documentElement.lang=language;for(const element of document.querySelectorAll('[data-care]'))element.textContent=t(element.dataset.care);
 $('#catalogScope').textContent=`${COSMETIC_GLOSSARY.length} ${t('scope')}`;
 $('#carePhotoPanel').hidden=$('#careInputMode').value!=='photos';$('#careTextPanel').hidden=$('#careInputMode').value!=='typed';
 for(const id of ['careCamera','careChoose','careInputMode','avoidCoconut','careAvoid','careAdd','careText','careReset'])$('#'+id).disabled=busy||selecting;
 $('#careAnalyze').disabled=busy||selecting||($('#careInputMode').value==='photos'?!files.length:!$('#careText').value.trim());
 $('#careAvoidList').replaceChildren(...avoid.map(term=>{const b=node('button',term+' ×');b.type='button';b.disabled=busy||selecting;b.setAttribute('aria-label',t('remove')+' '+term);b.onclick=()=>{avoid=avoid.filter(value=>value!==term);invalidate()};return b}));
}
function invalidate(){revision++;last=null;lastSources=[];lastErrors=[];$('#careResult').hidden=true;$('#careRows').replaceChildren();$('#careRaw').textContent='';$('#careStatus').textContent='';update()}
function render(){
 if(!last)return;
 $('#careResultTitle').textContent=t(last.status==='listed_avoid'?'listed':last.status==='review_needed'?'review':'unverified');
 const identities=new Set(last.rows.filter(r=>r.entry&&!r.reading_uncertain).map(r=>r.entry.id));
 $('#careSummary').textContent=`${identities.size} / ${last.rows.filter(r=>r.uncertain).length} / ${new Set(last.unknown).size} ${t('counts')}. ${t('notFull')} ${t($('#careInputMode').value==='typed'?'typedResult':'ocrResult')}`;
 $('#careUncertainty').textContent=lastErrors.length?t('incomplete'):last.issues.includes('input_truncated')||last.rows.length>180?t('truncated'):'';
 $('#careMatches').replaceChildren(...[...last.listed,...last.review].map(match=>node('p',match.original+' — '+t(match.kind==='mixture_not_fully_named'?'mixture':match.kind==='source_needs_confirmation'?'source':match.kind==='listed_name'?'name':'uncertain'),'careRisk')));
 const seen=new Set();$('#careRows').replaceChildren();
 for(const row of last.rows){const key=normalizeCosmetic(row.original)+':'+row.uncertain;if(seen.has(key))continue;seen.add(key);if(seen.size>180)break;
  const card=node('article','','careRow');card.dataset.uncertain=row.uncertain;card.append(node('h3',row.original));
  if(row.uncertain)card.append(node('p',t('uncertain')));
  if(row.entry&&!row.reading_uncertain){card.append(node('p',row.entry.inci+' · '+row.entry.ko,'careIdentity'),node('p',row.entry.explanation[language]))}
  else if(!row.entry)card.append(node('p',t('unknown')));
  $('#careRows').append(card);
 }
 if(!last.rows.length)$('#careRows').append(node('p',t('empty')));
 $('#careRaw').textContent=lastSources.map(source=>sourceTranscript(source).text).join('\n\n');$('#careResult').hidden=false;
}
for(const entry of COSMETIC_GLOSSARY){const option=document.createElement('option');option.value=entry.inci;option.label=entry.ko;$('#careNames').append(option);const korean=option.cloneNode();korean.value=entry.ko;korean.label=entry.inci;$('#careNames').append(korean)}
$('#careLang').onchange=()=>{language=$('#careLang').value;try{localStorage.setItem('adpai_cosmetic_language',language)}catch{}update();render();$('#careStatus').textContent=busy?t('reading'):last?t(lastErrors.length?'incomplete':'notFull'):''};
$('#careAdd').onclick=()=>{const term=$('#careAvoid').value.trim();if(term&&!avoid.some(x=>normalizeCosmetic(x)===normalizeCosmetic(term))&&avoid.length<30)avoid.push(term);$('#careAvoid').value='';invalidate()};
$('#careAvoid').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('#careAdd').click()}};
$('#avoidCoconut').onchange=invalidate;$('#careInputMode').onchange=invalidate;$('#careText').oninput=invalidate;
function addFiles(values){
 if(files.length+values.length>3){$('#careStatus').textContent=t('tooMany');return}
 if(!values.every(file=>file.type.startsWith('image/')&&file.size>0&&file.size<=30*1024*1024)){$('#careStatus').textContent=t('photoError');return}
 files.push(...values);invalidate();for(const file of values){const url=URL.createObjectURL(file);urls.push(url);const img=node('img','');img.src=url;img.alt=language==='ko'?'선택한 라벨 사진':'Selected label photo';$('#carePhotos').append(img)}
}
for(const id of ['careFiles','careSystemCamera'])$('#'+id).onchange=()=>{const input=$('#'+id),values=[...input.files];input.value='';if(!busy)addFiles(values)};
async function selectPhotos(camera){
 if(busy||selecting)return;selecting=true;update();const current=revision;
 try{
  if(globalThis.ADPAI_NATIVE){const values=await(camera?globalThis.ADPAI_NATIVE.takePhoto():globalThis.ADPAI_NATIVE.pickPhotos(Math.max(1,3-files.length)));if(current===revision)addFiles(values);return}
  if(!camera){$('#careFiles').click();return}
  if(!supportsLivePhoto()){$('#careSystemCamera').click();return}
  const file=await capturePhoto({language,onSystemCamera:()=>{if(current===revision)$('#careSystemCamera').click()}});if(file&&current===revision)addFiles([file]);
 }catch{$('#careStatus').textContent=t('photoError')}
 finally{selecting=false;update()}
}
$('#careCamera').onclick=()=>void selectPhotos(true);$('#careChoose').onclick=()=>void selectPhotos(false);
$('#careReset').onclick=()=>{for(const url of urls)URL.revokeObjectURL(url);urls=[];files=[];$('#careText').value='';$('#carePhotos').replaceChildren();invalidate()};
$('#careAnalyze').onclick=async()=>{
 if(busy||selecting)return;invalidate();busy=true;update();const current=revision;$('#careStatus').textContent=t('reading');
 try{
  let output;
  if($('#careInputMode').value==='typed')output={sources:[{input_origin:'typed',items:[{text:$('#careText').value,score:0}]}],errors:[]};
  else output=await readCosmeticPhotos([...files],{onProgress:()=>$('#careStatus').textContent=t('reading')});
  if(current!==revision)return;lastSources=output.sources;lastErrors=output.errors;last=evaluateCosmetics(lastSources,{avoid:[...avoid],coconut:$('#avoidCoconut').checked});render();$('#careStatus').textContent=output.errors.length?t('incomplete'):t('notFull');$('#careResultTitle').focus();
 }catch{if(current===revision)$('#careStatus').textContent=t('incomplete')}
 finally{if(current===revision){busy=false;update()}}
};
window.addEventListener('pagehide',()=>{if(busy||selecting){revision++;busy=selecting=false;update();$('#careStatus').textContent=t('incomplete')}});
update();
