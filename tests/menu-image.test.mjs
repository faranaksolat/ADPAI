import test from 'node:test';
import assert from 'node:assert/strict';
import {menuContrastPixels,mapMenuItems,menuDetailRegions} from '../src/menu-image.js';
import {readMenuPhoto} from '../src/menu-ocr.js';
test('white lettering on dark blue is inverted while paper menus retain dark ink',()=>{
 const dark=new Uint8ClampedArray([...Array(5).fill([30,60,120,255]).flat(),255,255,255,255]);
 const saved=[...dark],a=menuContrastPixels(dark);
 assert.equal(a.inverted,true);assert.ok(a.pixels[0]>a.pixels.at(-4));assert.deepEqual([...dark],saved);
 const paper=new Uint8ClampedArray([...Array(5).fill([245,245,245,255]).flat(),0,0,0,255]);
 const b=menuContrastPixels(paper);assert.equal(b.inverted,false);assert.ok(b.pixels[0]>b.pixels.at(-4));
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
