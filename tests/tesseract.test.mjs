import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProducts} from '../src/tesseract.js';

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
