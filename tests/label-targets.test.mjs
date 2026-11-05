import test from 'node:test';
import assert from 'node:assert/strict';
import {labelEvidenceZones} from '../src/label-targets.js';

const line=(text,y,lineId)=>({text,score:.8,lineId,box:{x0:30,x1:220,y0:y,y1:y+28}});

test('locates separate ingredient evidence and nutrition sections from existing OCR',()=>{
 const zones=labelEvidenceZones([
  line('밀, 대두 함유',20,0),
  line('우유, 돼지고기, 계란, 새우, 게 혼입가능',70,1),
  line('영양정보',600,2),
  line('나트륨 600 mg',700,3),
 ],500,1000);
 assert.equal(zones.length,2);
 const ingredients=zones.find(z=>z.kind==='ingredients'),nutrition=zones.find(z=>z.kind==='nutrition');
 assert.ok(ingredients&&nutrition);
 assert.ok(ingredients.y<=20&&ingredients.y+ingredients.height>=98);
 assert.ok(nutrition.y<=600&&nutrition.y+nutrition.height>=728);
 assert.ok(ingredients.y<nutrition.y);
});
test('does not invent a focused crop when no relevant words are legible',()=>{
 assert.deepEqual(labelEvidenceZones([{text:'???',lineId:1,box:{x0:0,x1:20,y0:0,y1:20}}],500,800),[]);
 assert.throws(()=>labelEvidenceZones([],0,800));
});
test('rejects invalid word boxes rather than inferring ingredient evidence',()=>{
 assert.deepEqual(labelEvidenceZones([{text:'milk',lineId:0,box:null}],500,800),[]);
});
