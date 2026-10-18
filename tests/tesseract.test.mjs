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
  const result=await analyzeProducts([{id:1,photos:[photo('front'),photo('back')]}],{allergens:['milk']},h.options);
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

test('bounded enhanced retry can recover a panel without creating a new corroborating family',async()=>{
  const prepared=[];
  const h=harness();
  h.options.prepare=async(file,enhanced)=>{prepared.push(enhanced);return enhanced};
  h.options.rotate=file=>file;
  h.options.createWorker=async()=>({terminate:async()=>{},recognize:async enhanced=>({data:{words:(enhanced?'INGREDIENTS: milk powder, sugar':'Store in a cool place').split(' ').map(text=>({text,confidence:95}))}})});
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
  assert.equal(p.status,'conflict');assert.deepEqual(prepared,[false,true]);
  assert.deepEqual([...new Set(p.sources.map(s=>s.familyId))],['korean']);
  const weak=harness({text:'INGREDIENTS: milk'});
  weak.options.createWorker=async()=>({terminate:async()=>{},recognize:async()=>({data:{words:[{text:'INGREDIENTS:',confidence:99},{text:'milk',confidence:50}]}})});
  assert.equal((await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},weak.options)).products[0].status,'unverified');
});

test('a failed rotation preserves successful positive evidence and reports failure',async()=>{
  const h=harness();h.options.rotate=(_,r)=>r;
  h.options.createWorker=async()=>({terminate:async()=>{},recognize:async r=>{
    if(r===90)throw new Error('rotation failed');
    return {data:{words:[{text:'INGREDIENTS:',confidence:95},{text:'milk',confidence:95}]}};
  }});
  const p=(await analyzeProducts([{photos:[photo('back')]}],{allergens:['milk']},h.options)).products[0];
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
