import test from 'node:test';
import assert from 'node:assert/strict';
import {labelTopBandView} from '../src/image.js';
import {mapMenuItems} from '../src/menu-image.js';

test('top band is bounded, lazy, original pixel backed and mapped',()=>{
 const previous=globalThis.document,draws=[];
 globalThis.document={createElement(){
  const canvas={width:0,height:0,getContext(){return{
   fillRect(){},
   drawImage(...args){draws.push(args)},
   getImageData(){return{data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(245)}},
   putImageData(){}
  }}};
  return canvas;
 }};
 try{
  const original={naturalWidth:1024,naturalHeight:1365};
  const view=labelTopBandView({width:1024,height:1365,ocrOriginal:original});
  assert.equal(draws.length,0);
  assert.ok(view.frame.cropHeight>=230&&view.frame.cropHeight<=233);
  assert.ok(view.frame.scale<=2);
  assert.equal(view.frame.from_original,true);
  assert.ok(view.canvas.width<=2400);
  assert.equal(draws[0][0],original);
  const words=mapMenuItems([{text:'밀',score:.54,lineId:0,box:{x0:10,y0:10,x1:30,y1:30}}],view.frame);
  assert.equal(words[0].score,.54);
  assert.ok(words[0].box.x0>=0&&words[0].box.y0>=0);
  view.release();
 }finally{globalThis.document=previous}
});
test('small invalid frames do not allocate a banner',()=>{
 assert.equal(labelTopBandView({width:80,height:100}),null);
});
