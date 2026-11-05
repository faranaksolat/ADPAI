import test from 'node:test';
import assert from 'node:assert/strict';
import {labelRegionGeometry,labelReadCanvases,sharpenLabelPixels} from '../src/image.js';
import {mapMenuItems} from '../src/menu-image.js';

const rgba=values=>new Uint8ClampedArray(values.flatMap(x=>[x,x,x,255]));

test('label regions overlap and cover both ends of a tall or wide image',()=>{
  for(const [width,height] of [[1200,2400],[2400,1200]]){
    const regions=labelRegionGeometry(width,height);
    assert.equal(regions.length,2);
    for(const r of regions){
      assert.ok(r.x>=0&&r.y>=0);
      assert.ok(r.x+r.width<=width&&r.y+r.height<=height);
    }
    if(height>width)assert.ok(regions[0].y+regions[0].height>regions[1].y);
    else assert.ok(regions[0].x+regions[0].width>regions[1].x);
  }
});
test('square label uses four overlapping regions and rejects bad dimensions',()=>{
  assert.equal(labelRegionGeometry(1200,1200).length,4);
  assert.throws(()=>labelRegionGeometry(0,100));
  assert.throws(()=>labelRegionGeometry(50000,50000));
});
test('preprocessing is deterministic and cannot change uniform pixels or input',()=>{
  const original=rgba(Array(100).fill(180)),saved=[...original];
  const result=sharpenLabelPixels(original,10,10);
  assert.deepEqual([...original],saved);
  assert.equal(new Set([...result].filter((_,index)=>index%4===0)).size,1);
  assert.ok([...result].every(value=>value>=0&&value<=255));
});
test('lazy original-image region maps boxes into original coordinates without increasing scores',()=>{
  const prev=globalThis.document,draws=[];
  globalThis.document={createElement:()=>{
    const canvas={width:0,height:0,getContext:()=>({
      fillRect(){},drawImage(...args){draws.push(args)},
      getImageData:()=>({data:rgba(Array(canvas.width*canvas.height).fill(200))}),
      putImageData(){}
    })};
    return canvas;
  }};
  try{
    const original={naturalWidth:90,naturalHeight:140};
    const views=labelReadCanvases({width:90,height:140,ocrOriginal:original});
    assert.equal(views.length,2);
    assert.equal(draws.length,0);
    void views[1].canvas;
    assert.equal(draws[0][0],original);
    const frame=views[1].frame;
    assert.ok(frame.y>0);
    const mapped=mapMenuItems([{text:'우유',score:.3,lineId:2,box:{x0:10,x1:50,y0:10,y1:30}}],frame);
    assert.equal(mapped[0].score,.3);
    assert.ok(mapped[0].box.y0>=frame.y);
    views.forEach(v=>v.release());
  }finally{globalThis.document=prev}
});