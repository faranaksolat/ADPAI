import test from 'node:test';
import assert from 'node:assert/strict';
import {menuContrastPixels,mapMenuItems,menuDetailRegions,menuReadCanvases} from '../src/menu-image.js';
import {readMenuPhoto} from '../src/menu-ocr.js';
import {evaluateProduct} from '../src/engine.js';
import {dietaryEvidence} from '../src/dietary.js';
test('white lettering on dark blue is inverted while paper menus retain dark ink',()=>{
 const dark=new Uint8ClampedArray([...Array(5).fill([30,60,120,255]).flat(),255,255,255,255]);
 const saved=[...dark],a=menuContrastPixels(dark);
 assert.equal(a.inverted,true);assert.ok(a.pixels[0]>a.pixels.at(-4));assert.deepEqual([...dark],saved);
 const paper=new Uint8ClampedArray([...Array(5).fill([245,245,245,255]).flat(),0,0,0,255]);
 const b=menuContrastPixels(paper);assert.equal(b.inverted,false);assert.ok(b.pixels[0]>b.pixels.at(-4));
});
test('clipped crop context stays uncertain without manufacturing lower word confidence',()=>{
 const frame={x:100,y:0,width:500,height:500,cropWidth:200,cropHeight:200,scale:1};
 const words=mapMenuItems([
  {text:'INGREDIENTS:',score:.95,lineId:0,box:{x0:30,x1:170,y0:20,y1:35}},
  {text:'milk, pork',score:.95,lineId:1,box:{x0:2,x1:120,y0:50,y1:65}}
 ],frame);
 assert.equal(words[1].context_clipped,true);assert.equal(words[1].score,.95);
 const r=evaluateProduct({sources:[{familyId:'korean',items:words}],profile:{allergens:['milk']}});
 assert.equal(r.status,'unverified');assert.equal(r.direct_matches.length,0);assert.equal(r.mention_matches[0].score,.95);
 const d=dietaryEvidence([{words:[words[1]]}],['avoid_pork']);assert.equal(d[0].kind,'uncertain');assert.equal(d[0].reason,'clipped_context');
});
test('large-photo detail views sample original pixels lazily and share original coordinate space',()=>{
 const old=globalThis.document,calls=[];let allocated=0;
 globalThis.document={createElement:()=>{
  allocated++;
  return {width:0,height:0,getContext(){
   return {fillRect(){},drawImage(...args){calls.push(args)},getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){}};
  }};
 }};
 try{
  const original={naturalWidth:4032,naturalHeight:3024},overview={width:2400,height:1800,ocrOriginal:original};
  const views=menuReadCanvases(overview);assert.equal(allocated,0);
  const details=views.filter(v=>v.variant.startsWith('menu-detail-'));assert.equal(details.length,6);
  const d=details[0];assert.ok(d.canvas.width<=2000);assert.equal(allocated,1);assert.equal(calls[0][0],original);
  assert.equal(d.frame.width,4032);assert.equal(d.frame.from_original,true);
  const word=mapMenuItems([{text:'milk',score:.2,box:{x0:10,y0:10,x1:20,y1:20}}],d.frame)[0];assert.equal(word.score,.2);
  d.release();assert.equal(allocated,1);void views[0].canvas;assert.equal(calls.at(-1)[0],overview);
  assert.equal(views[0].frame.scale,2400/4032);views.forEach(v=>v.release?.());
 }finally{globalThis.document=old}
});
test('overlapping crop coordinates return to the photo without changing confidence',()=>{
 const out=mapMenuItems([{text:'굴',score:.31,box:{x0:20,y0:40,x1:60,y1:80}}],{x:300,y:0,scale:2});
 assert.equal(out[0].score,.31);assert.deepEqual(out[0].box,{x0:310,y0:20,x1:330,y1:40});
});
test('upright menu reads cover both languages and preserve earlier evidence on worker failure',async()=>{
 let active,calls=0,closed=false;
 const worker={get closed(){return closed},reinitialize:async langs=>{active=langs},setParameters:async()=>{},recognize:async()=>{
  if(calls++){closed=true;throw Error('OCR timeout: recognize')}
  return {data:{words:[{text:'cream',confidence:40}]}};
 }};
 const r=await readMenuPhoto({worker,canvas:{},photoIndex:0,familyId:'korean',rotate:x=>x,itemsFrom:r=>r.data.words.map(w=>({text:w.text,score:w.confidence/100})),maxPhotoMs:1000});
 assert.equal(r.sources[0].items[0].score,.4);assert.equal(r.complete,false);assert.equal(r.errors.length,1);assert.deepEqual(active,['kor']);
});
test('detail regions overlap in both directions, stay bounded and map back without score changes',()=>{
 const regions=menuDetailRegions(1200,1800);assert.equal(regions.length,4);
 assert.ok(regions[0].x+regions[0].width>regions[1].x);
 assert.ok(regions[0].y+regions[0].height>regions[2].y);
 for(const r of regions){assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1200&&r.y+r.height<=1800);assert.ok(Math.max(r.width,r.height)*r.scale<=2000)}
 const small=menuDetailRegions(283,400);assert.equal(small.length,1);assert.equal(small[0].scale,4);
 const mapped=mapMenuItems([{text:'돼지고기',score:.25,box:{x0:40,x1:80,y0:60,y1:100}}],{x:300,y:500,scale:4,scaleY:2});
 assert.deepEqual(mapped[0].box,{x0:310,x1:320,y0:530,y1:550});assert.equal(mapped[0].score,.25);
 assert.throws(()=>menuDetailRegions(0,200));
});
