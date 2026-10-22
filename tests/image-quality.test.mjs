import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOcrPixels,ocrCanvasSize,needsRetake} from '../src/image.js';
const rgba=values=>new Uint8ClampedArray(values.flatMap(value=>[value,value,value,255]));
test('low-contrast normalization expands existing contrast without mutating source pixels',()=>{
 const input=rgba([160,170,180,190,200]),saved=[...input];
 const out=normalizeOcrPixels(input);
 assert.deepEqual([...input],saved);assert.equal(out.inverted,false);
 assert.ok(out.pixels[16]-out.pixels[0]>100);assert.ok(out.gain<=4);
 for(let i=4;i<out.pixels.length;i+=4)assert.ok(out.pixels[i]>=out.pixels[i-4]);
});
test('solid and transparent images cannot acquire made-up letter edges',()=>{
 for(const value of [0,80,180,255]){
  const out=normalizeOcrPixels(rgba(Array(100).fill(value)));
  assert.equal(new Set([...out.pixels].filter((_,i)=>i%4===0)).size,1);
 }
 const out=normalizeOcrPixels(new Uint8ClampedArray([0,0,0,0]));
 assert.deepEqual([...out.pixels],[255,255,255,255]);
});
test('dim white paper is not mistaken for a dark menu and inverted',()=>{
 const out=normalizeOcrPixels(rgba([...Array(1000).fill(90),...Array(100).fill(45)]));
 assert.equal(out.inverted,false);assert.ok(out.pixels[0]>out.pixels[1000*4]);
});
test('rare glare cannot define a whole low-contrast image stretch',()=>{
 const values=[...Array(1000).fill(180),...Array(100).fill(160),0,255];
 const out=normalizeOcrPixels(rgba(values));assert.equal(out.inverted,false);
 assert.ok(out.pixels[0]-out.pixels[1000*4]>=70);
});
test('upscaling is capped at two times and 3000px while original reads stay bounded',()=>{
 assert.deepEqual(ocrCanvasSize(500,200,true),{width:1000,height:400});
 assert.deepEqual(ocrCanvasSize(5000,4000,true),{width:3000,height:2400});
 assert.deepEqual(ocrCanvasSize(5000,4000),{width:2400,height:1920});
 assert.deepEqual(ocrCanvasSize(500,200),{width:500,height:200});
 assert.throws(()=>ocrCanvasSize(0,100),/Invalid/);
});
test('weak or repeated tiny readings still request a retake without any safety certification',()=>{
 assert.equal(needsRetake([]),true);
 assert.equal(needsRetake(Array(8).fill({items:[{text:'milk',score:.95}]})),true);
 assert.equal(needsRetake([{items:[{text:'ingredients',score:0},{text:'milk',score:.3},{text:'sugar',score:.3}]}]),true);
 assert.equal(needsRetake([{items:[{text:'INGREDIENTS:',score:.95},{text:'milk',score:.95},{text:'sugar and cocoa',score:.95}]}]),false);
});
