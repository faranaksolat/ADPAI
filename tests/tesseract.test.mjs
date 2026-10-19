import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProducts,itemsFrom} from '../src/tesseract.js';

const photo = name => ({file:{name}});
function harness({text='INGREDIENTS: milk, sugar', failPhoto, noWords=false}={}) {
  const rotations=[],workers=[];
  let terminated=0;
  const options = {
    prepare: async file => {
      if(file.name === failPhoto) throw new Error('image decode failed');
      return file;
    },
    rotate: (file,rotation) => {rotations.push([file.name,rotation]);return file;},
    createWorker: async langs => {
      workers.push(langs);
      return {
        recognize: async () => ({data:{text,words:noWords ? [] : text.split(' ').map((text,i) => ({text,confidence:95,bbox:{x0:i*20,y0:0,x1:i*20+18,y1:20}}))}}),
        terminate: async () => {terminated++;},
      };
    },
  };
  return {options,rotations,workers,get terminated(){return terminated;}};
}

test('real adapter retains word evidence and attempts 180 degrees per photo', async () => {
  const h=harness();
  const result=await analyzeProducts([{id:1,photos:[photo('front'),photo('back')]}],{allergens:['milk','egg']},h.options);
  assert.equal(result.products[0].status,'conflict');
  for(const name of ['front','back']) assert.ok(h.rotations.some(([n,r]) => n===name && r===180));
  assert.ok(h.terminated);
});
test('a photo failure stays visible and cannot clear a product', async () => {
  const h=harness({text:'INGREDIENTS: sugar and cocoa',failPhoto:'back'});
  const result=await analyzeProducts([{id:1,photos:[photo('front'),photo('back')]}],{allergens:['milk']},h.options);
  assert.equal(result.products[0].status,'unverified');
  assert.ok(result.products[0].errors.some(e=>e.photoIndex===1));
  assert.ok(result.products[0].coverage.failures.includes('korean'));
});
test('missing word confidence cannot become a high-confidence conflict', async () => {
  const h=harness({noWords:true});
  const result=await analyzeProducts([{id:1,photos:[photo('front')]}],{allergens:['milk']},h.options);
  assert.equal(result.products[0].status,'unverified');
  assert.ok(result.products[0].mention_matches.length);
});
test('allergen analysis does not request numeric recovery or return calorie fields', async () => {
  const h=harness();
  const result=await analyzeProducts([{id:1,photos:[photo('front')]}],{allergens:['milk']},h.options);
  assert.equal(result.products[0].status,'conflict');
  assert.deepEqual(h.workers,[['kor','eng','fra']]);
  assert.ok(!('calories' in result.products[0]));
  assert.deepEqual(result.summary,{product_count:1});
  assert.deepEqual(result.products[0].ocr_families_used,['Korean / English / French']);
});
test('failed model download returns unverified and a failure record', async () => {
  const result=await analyzeProducts([{id:1,photos:[photo('front')]}],{allergens:['milk']},{createWorker:async()=>{throw new Error('offline');}});
  assert.equal(result.products[0].status,'unverified');
  assert.ok(result.products[0].errors.length);
});

test('readable marketing does not discard a rotated ingredient panel',async()=>{
  const h=harness();let rotation;
  h.options.rotate=(_,r)=>{rotation=r;return r};
  h.options.createWorker=async()=>({terminate:async()=>{},recognize:async()=>{
    const text=rotation===90?'INGREDIENTS: milk powder, sugar':rotation===0?'Enjoy our delicious chocolate snacks every single day. Made for sharing with your friends and family.':'unreadable';
    return {data:{words:text.split(' ').map(text=>({text,confidence:rotation===0?99:85}))}};
  }});
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
  assert.equal(p.status,'conflict');assert.equal(p.sources[0].rotation,90);
  assert.ok(p.ingredients.some(i=>/^milk\s+powder$/u.test(i.original)));
});

test('sparse language passes retain original confidence and stay one OCR family',async()=>{
  const h=harness();let active;
  h.options.createWorker=async()=>({
    reinitialize:async langs=>{active=langs[0]},setParameters:async p=>assert.ok(['3','6','11'].includes(p.tessedit_pageseg_mode)),terminate:async()=>{},
    recognize:async()=>({data:{words:(active==='kor'?'INGREDIENTS: milk powder, sugar':'Store in a cool place').split(' ').map(text=>({text,confidence:95}))}})
  });
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
  assert.equal(p.status,'conflict');assert.ok(p.sources.some(s=>s.model_languages[0]==='kor'));
  assert.deepEqual([...new Set(p.sources.map(s=>s.familyId))],['korean']);
  h.options.createWorker=async()=>({reinitialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{words:[{text:'INGREDIENTS:',confidence:99},{text:'milk',confidence:50}]}})});
  assert.equal((await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0].status,'unverified');
});

test('a failed rotation preserves successful positive evidence and reports failure',async()=>{
  const h=harness();h.options.rotate=(_,r)=>r;
  h.options.createWorker=async()=>({terminate:async()=>{},recognize:async r=>{
    if(r===90)throw new Error('rotation failed');
    return {data:{words:[{text:'INGREDIENTS:',confidence:95},{text:'milk',confidence:95}]}};
  }});
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk','egg']},h.options)).products[0];
  assert.equal(p.status,'conflict');assert.ok(p.errors.some(e=>e.rotation===90));
});

test('line metadata preserves warnings independently of y-position and bad confidence is unresolved',()=>{
  const items=itemsFrom({data:{words:[{text:'INGREDIENTS:',confidence:99,line_num:1},{text:'sugar',confidence:95,line_num:1},{text:'may contain milk',confidence:'bad',line_num:2}]}});
  assert.equal(items[0].lineId,items[1].lineId);assert.notEqual(items[1].lineId,items[2].lineId);assert.equal(items[2].score,0);
});

test('stray two-letter language-like noise does not start unrelated models',async()=>{
  const h=harness({text:'INGREDIENTS: sugar. HI m RU TH CN JP'});
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
  assert.equal(p.status,'unverified');assert.deepEqual(h.workers,[['kor','eng','fra']]);
  const marked=harness({text:'HI: INGREDIENTS: sugar'});
  await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},marked.options);
  assert.ok(marked.workers.some(x=>x.includes('hin')));
});

test('nutrition-only pictures abstain without requesting unrelated script models',async()=>{
  const h=harness({text:'영양정보 나트륨 100 mg 탄수화물 20 g'});
  const p=(await analyzeProducts([{photos:[photo('nutrition')]}],{allergens:['milk']},h.options)).products[0];
  assert.equal(p.status,'unverified');assert.deepEqual(h.workers,[['kor','eng','fra']]);
});
test('one automatic-layout retry can recover context without raising old word confidence',async()=>{
 const h=harness();let mode;
 h.options.createWorker=async()=>({reinitialize:async()=>{},setParameters:async p=>{mode=p.tessedit_pageseg_mode},terminate:async()=>{},recognize:async()=>({data:{words:mode==='3'
  ?[{text:'INGREDIENTS:',confidence:95,line_num:1},{text:'milk',confidence:95,line_num:1}]
  :[{text:'WHEY',confidence:70,line_num:1},{text:'CONTAINS:',confidence:95,line_num:2},{text:'EGG',confidence:95,line_num:2},{text:'MILK',confidence:31,line_num:2}]}})});
 const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
 assert.equal(p.status,'conflict');assert.ok(p.sources.some(s=>s.segmentation==='3'));
 assert.ok(p.sources.some(s=>s.items.some(w=>w.text==='MILK'&&w.score===.31)));
 assert.deepEqual([...new Set(p.sources.map(s=>s.familyId))],['korean']);
});
test('an OCR deadline retains earlier positive evidence and marks coverage failed',async()=>{
 const h=harness();let calls=0,closed=false;
 h.options.createWorker=async()=>({get closed(){return closed},terminate:async()=>{},recognize:async()=>{
  if(calls++){closed=true;throw Error('OCR timeout: recognize')}
  return {data:{words:[{text:'INGREDIENTS:',confidence:95},{text:'milk',confidence:95}]}}}});
 const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk','egg']},h.options)).products[0];
 assert.equal(p.status,'conflict');assert.ok(p.coverage.failures.includes('korean'));assert.equal(p.coverage.complete,false);
 assert.ok(p.errors.some(e=>e.message.includes('timeout')));
});
test('shopping can stop after every selected risk is found while menus still scan other entries',async()=>{
 const shopping=harness(),menu=harness();
 const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},shopping.options)).products[0];
 await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},{...menu.options,purpose:'menu'});
 assert.equal(p.status,'conflict');assert.equal(p.coverage.complete,false);
 assert.deepEqual(shopping.rotations.map(([,r])=>r),[0]);
 assert.deepEqual(menu.rotations.map(([,r])=>r),[0,90,270,180]);
});
test('sparse Korean syllables regain a physical declaration row without borrowing confidence',()=>{
 const words=['대','두','함','유'].map((text,i)=>({text,confidence:i===1?40:95,line_num:i,bbox:{x0:i*24,y0:10,x1:i*24+20,y1:32}}));
 const items=itemsFrom({data:{words}});
 assert.equal(new Set(items.map(i=>i.lineId)).size,1);assert.equal(items[1].score,.4);
 const columns=itemsFrom({data:{words:[words[0],{...words[1],bbox:{x0:500,y0:10,x1:520,y1:32}}]}});
 assert.notEqual(columns[0].lineId,columns[1].lineId);
});
