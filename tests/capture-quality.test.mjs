import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPixels,qualityMessage} from '../src/photo-quality.js';
import {createCameraSession,supportsLivePhoto} from '../src/camera.js';
import {validateQuad,quadMap,rectifiedSize} from '../src/geometry.js';
const image=(w,h,value=255)=>new Uint8ClampedArray(Array.from({length:w*h},()=>[value,value,value,255]).flat());
test('quality hints distinguish small text from a uniform image, without certifying a good image',()=>{
 const w=180,h=100,pixels=image(w,h);
 for(let i=0;i<20;i++)for(let y=15;y<23;y++)for(let x=5+i*8;x<8+i*8;x++)for(let c=0;c<3;c++)pixels[(y*w+x)*4+c]=20;
 const q=inspectPixels(pixels,w,h);assert.ok(q.issues.includes('text_too_small'));assert.ok(!q.issues.includes('possible_glare'));
 assert.equal(q.scope,'uncalibrated_capture_guidance');assert.ok(!('safe' in q));
 assert.ok(inspectPixels(image(w,h,40),w,h).issues.includes('low_light'));
 assert.ok(inspectPixels(image(w,h),w,h).issues.includes('text_not_found'));
 assert.ok(qualityMessage({issues:[]}).includes('Check'));assert.ok(qualityMessage(q,'ko').includes('가까이'));
 assert.throws(()=>inspectPixels(pixels,1,h));
});
function device(){
 let stopped=0,requested;
 const track={stop(){stopped++},getCapabilities:()=>({}),getSettings:()=>({width:4032,height:3024})},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 class Capture{async takePhoto(){return new Blob(['full-resolution-photo'],{type:'image/jpeg'})}}
 return {track,stream,Capture,get stopped(){return stopped},get requested(){return requested},mediaDevices:{async getUserMedia(options){requested=options;return stream}}};
}
test('camera requests rear video but returns a still photo and releases every track',async()=>{
 const d=device(),s=createCameraSession(d);await s.start();const photo=await s.photo();assert.equal(photo.type,'image/jpeg');
 assert.equal(d.requested.audio,false);assert.equal(d.requested.video.facingMode.ideal,'environment');
 s.close();assert.ok(d.stopped>=1);await assert.rejects(s.photo(),/cancelled/);
 assert.equal(supportsLivePhoto(d.mediaDevices,d.Capture),true);assert.equal(supportsLivePhoto(d.mediaDevices,class{}),false);
});
test('cancel before permission resolves stops the late stream and cannot revive capture',async()=>{
 const d=device();let permit;
 const s=createCameraSession({...d,mediaDevices:{getUserMedia:()=>new Promise(resolve=>permit=resolve)}}),start=s.start();s.close();permit(d.stream);
 await assert.rejects(start,/cancelled/);assert.ok(d.stopped>=1);await assert.rejects(s.photo());
});
test('a cancelled pending still photo cannot be added and a denied permission stays an error',async()=>{
 const d=device();let complete;
 class Capture{takePhoto(){return new Promise(resolve=>complete=resolve)}}
 const s=createCameraSession({...d,Capture});await s.start();const p=s.photo();s.close();complete(new Blob(['late']));await assert.rejects(p,/cancelled/);
 const denied=createCameraSession({mediaDevices:{getUserMedia:async()=>{throw Error('Permission denied')}},Capture});await assert.rejects(denied.start(),/denied/);
});
test('perspective projection maps all four corners exactly and rejects crossed or tiny quads',()=>{
 const q=[{x:20,y:30},{x:170,y:10},{x:180,y:150},{x:10,y:180}];assert.ok(validateQuad(q,200,200));
 const project=quadMap(q);[[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=project(u,v);assert.ok(Math.hypot(p.x-q[i].x,p.y-q[i].y)<1e-8)});
 assert.equal(validateQuad([q[0],q[2],q[1],q[3]],200,200),false);
 assert.equal(validateQuad([{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}],200,200),false);
 const size=rectifiedSize([{x:0,y:0},{x:7999,y:0},{x:7999,y:5999},{x:0,y:5999}]);assert.ok(size.width*size.height<=6005000);assert.ok(Math.max(size.width,size.height)<=3600);
});
