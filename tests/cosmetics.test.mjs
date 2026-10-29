import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCosmetics,lookupCosmetic,normalizeCosmetic} from '../src/cosmetics.js';
import {COSMETIC_GLOSSARY,COSMETIC_CATALOG_META} from '../src/cosmetic-glossary.js';
import {readCosmeticPhotos} from '../src/cosmetic-ocr.js';
const typed=text=>[{input_origin:'typed',items:[{text,score:0}]}];
const ocr=(text,score=.95)=>[{photoIndex:0,familyId:'korean',items:[{text,score}]}];
test('bilingual catalogue has unique identities and no conflicting normalized aliases',()=>{
 const names=new Map(),ids=new Set();
 for(const entry of COSMETIC_GLOSSARY){
  assert.ok(entry.inci&&entry.ko&&entry.explanation.en&&entry.explanation.ko);assert.match(entry.ko,/[가-힣]/u);
  assert.ok(!ids.has(entry.id));ids.add(entry.id);
  for(const alias of entry.aliases){const key=normalizeCosmetic(alias);assert.ok(!names.has(key)||names.get(key)===entry.id,alias);names.set(key,entry.id)}
 }
 assert.equal(COSMETIC_CATALOG_META.complete,false);assert.match(COSMETIC_CATALOG_META.review_status,/not_independently_reviewed/u);
});
test('EN/KO label fixtures preserve locants, nested botanical names and unknown text',()=>{
 const en=evaluateCosmetics(typed('INGREDIENTS: Aqua, 1,2-Hexanediol, Cocos Nucifera (Coconut) Oil, Niacinamide, Unknown Patent Complex 7'),{coconut:true});
 assert.equal(en.rows.length,5);assert.equal(en.rows[1].entry.inci,'1,2-Hexanediol');assert.equal(en.rows[2].original,'Cocos Nucifera (Coconut) Oil');assert.deepEqual(en.unknown,['Unknown Patent Complex 7']);assert.equal(en.listed.length,1);
 const ko=evaluateCosmetics(typed('전 성 분: 정제수, 글리세린, 코코넛야자오일, 페녹시에탄올, 나이아신아마이드'),{coconut:true});
 assert.equal(ko.listed.length,1);assert.equal(ko.rows.every(r=>r.entry),true);assert.equal(ko.rows[4].entry.inci,'Niacinamide');assert.equal(ko.rows[0].input_origin,'typed');
});
test('coconut names, possible feedstocks and unrelated chemicals stay separate',()=>{
 const r=evaluateCosmetics(ocr('Ingredients: Cocamidopropyl Betaine, Coco-Glucoside, Caprylic/Capric Triglyceride, Glycerin, Lactic Acid, Theobroma Cacao (Cocoa) Seed Butter'),{coconut:true});
 assert.equal(r.listed.length,0);assert.equal(r.review.length,3);assert.ok(r.review.every(h=>h.kind==='source_needs_confirmation'));assert.equal(r.status,'review_needed');
 assert.ok(!r.review.some(h=>/Glycerin|Lactic|Cacao/u.test(h.original)));
 assert.notEqual(lookupCosmetic('Sodium Lauryl Sulfate').id,lookupCosmetic('Sodium Laureth Sulfate').id);
 const sls=evaluateCosmetics(typed('Ingredients: Sodium Laureth Sulfate'),{avoid:['Sodium Lauryl Sulfate']});assert.equal(sls.listed.length,0);
});
test('unknown, low-confidence and unheaded reads never become clear or safe',()=>{
 for(const sources of [[],ocr('Ingredients: Mystery compound'),ocr('Ingredients: Cocos Nucifera Oil',.2),ocr('Cocos Nucifera Oil'),typed('Instructions: avoid Niacinamide')]){
  const r=evaluateCosmetics(sources,{coconut:true,avoid:['Niacinamide']});assert.ok(!['safe','clear','no_listed_conflict'].includes(r.status));assert.equal(r.complete_label_verified,false);assert.equal(r.safety_certified,false);assert.equal(r.clinical_allergy_assessment,false);assert.equal(r.listed.length,0);
 }
 assert.equal(lookupCosmetic('Niacinamlde'),null);assert.equal(lookupCosmetic('Hydrolyzed Sodium Hyaluronate Crosspolymer'),null,'do not silently fall back to a substring identity');
});
test('cosmetic aliases cross languages but concentration, CI codes and active/inactive sections retain identity',()=>{
 const r=evaluateCosmetics(typed('Active ingredients: Titanium Dioxide 5%\nInactive ingredients: 정제수, 글리세린, 페녹시에탄올'),{avoid:['CI 77891','Phenoxyethanol']});
 assert.equal(r.listed.length,2);assert.equal(r.rows[0].original,'Titanium Dioxide 5%');assert.equal(lookupCosmetic('CI77891').id,lookupCosmetic('티타늄디옥사이드').id);
 const ko=evaluateCosmetics(typed('전성분: 정제수, 메틸아이소티아졸리논'),{avoid:['Methylisothiazolinone']});assert.equal(ko.listed.length,1);
});
test('warnings, optional colours, fragrance mixtures and weak heading words cannot certify a match',()=>{
 const warning=evaluateCosmetics(typed('Ingredients: Water, Glycerin\nWarnings: Do not use with Niacinamide'),{avoid:['Niacinamide']});assert.equal(warning.listed.length,0);assert.ok(!warning.rows.some(r=>r.original.includes('Niacinamide')));
 const optional=evaluateCosmetics(typed('Ingredients: Water\nMay contain (+/-): CI 77491, CI 77492'),{avoid:['CI 77492']});assert.equal(optional.listed.length,0);assert.equal(optional.review.length,1);
 const mixture=evaluateCosmetics(typed('Ingredients: Water, Parfum'),{avoid:['Linalool']});assert.equal(mixture.listed.length,0);assert.ok(mixture.review.some(h=>h.kind==='mixture_not_fully_named'));
 const weak=evaluateCosmetics([{items:[{text:'Ingredients:',score:.1,lineId:0},{text:'Cocos Nucifera Oil',score:.99,lineId:1}]}],{coconut:true});assert.equal(weak.listed.length,0);assert.ok(weak.review.length);
 const cap=evaluateCosmetics(typed('Ingredients: '+Array.from({length:185},(_,i)=>'Unknown'+i).join(', ')));assert.ok(cap.issues.includes('input_truncated'));assert.equal(cap.safety_certified,false);
});
test('cosmetic OCR uses the local Korean/English reader, releases its worker and preserves failures',async()=>{
 let terminated=0;
 const languages=[];
 const read=await readCosmeticPhotos([{}],{prepare:async()=>({width:10,height:10}),createWorker:async langs=>{languages.push(langs);return {recognize:async()=>({data:{words:[{text:'전성분:',confidence:97,line_num:0},{text:'코코넛야자오일',confidence:30,line_num:0}]}}),terminate:async()=>terminated++}}});
 assert.equal(terminated,2);assert.deepEqual(languages,[['kor'],['eng']]);assert.equal(read.sources[0].items[1].score,.3);assert.equal(evaluateCosmetics(read.sources,{coconut:true}).listed.length,0);
 const bad=await readCosmeticPhotos([{}],{createWorker:async()=>{throw Error('offline')}});assert.ok(bad.errors.length);assert.deepEqual(bad.sources,[]);
});
test('a stalled reinitialization has one photo deadline and cannot start a late recognition',async()=>{
 let resume,recognitions=0,terminated=0;const held=new Promise(resolve=>resume=resolve);
 const r=await readCosmeticPhotos([{}],{maxPhotoMs:15,prepare:async()=>({width:10,height:10}),createWorker:async()=>({reinitialize:()=>held,setParameters:async()=>{},recognize:async()=>{recognitions++;return {data:{words:[]}}},terminate:async()=>terminated++})});
 assert.equal(recognitions,0);assert.ok(terminated>=1);assert.ok(r.errors.some(e=>/budget/u.test(e.message)));resume();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(recognitions,0);
});
test('a later model failure preserves earlier evidence and leaves the error explicit',async()=>{
 const r=await readCosmeticPhotos([{}],{prepare:async()=>({width:10,height:10}),createWorker:async langs=>{
  if(langs.includes('eng'))throw Error('English model offline');return {recognize:async()=>({data:{words:[{text:'Ingredients:',confidence:95,line_num:0},{text:'Cocos Nucifera Oil',confidence:92,line_num:0}]}}),terminate:async()=>{}};
 }});
 assert.ok(r.errors.some(e=>e.profile==='cosmetic-english'));assert.ok(r.sources.length);assert.equal(evaluateCosmetics(r.sources,{coconut:true}).status,'listed_avoid');assert.equal(evaluateCosmetics(r.sources,{coconut:true}).safety_certified,false);
});
