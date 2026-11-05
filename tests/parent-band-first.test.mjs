import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProducts} from '../src/tesseract.js';

test('a real-size label reads its warning strip first, before expensive whole-photo passes',async()=>{
 const prior=globalThis.document;
 const reads=[];
 globalThis.document={createElement:()=>{
  const canvas={width:0,height:0,getContext:()=>({
   drawImage(){},fillRect(){},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(245)}),putImageData(){},
  })};
  return canvas;
 }};
 try{
  const raw={width:1024,height:1365,ocrOriginal:{naturalWidth:1024,naturalHeight:1365}};
  const result=await analyzeProducts([{id:1,photos:[{file:{name:'photo.png'}}]}],{allergens:['milk','egg']},{
   nativeReader:null,prepare:async()=>raw,rotate:(c)=>c,
   createWorker:async()=>({
    reinitialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},
    recognize:async canvas=>{
     reads.push({width:canvas.width,height:canvas.height});
     return {data:{words:[{text:'우유,계란',confidence:95,bbox:{x0:20,y0:15,x1:160,y1:45}},{text:'혼입가능',confidence:95,bbox:{x0:170,y0:15,x1:275,y1:45}}]}};
    }
   })
  });
  assert.ok(reads.length>0);
  assert.equal(reads[0].width,2048);
  assert.ok(reads[0].height<1000,'the first read must be the upper warning band');
  assert.ok(result.products[0].sources.some(s=>s.variant==='label-top-band'),'retain source provenance');
  assert.equal(result.products[0].direct_matches.length,0);
 }finally{globalThis.document=prior}
});
