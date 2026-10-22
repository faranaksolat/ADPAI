import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeItems,analyzeNativeProducts} from '../src/native-ocr.js';
const canvas={toDataURL:()=> 'data:image/png;base64,AA=='};
const prepare=async()=>canvas,rotate=x=>x,products=[{id:1,photos:[{file:{}}]}];
const words=(score=.95)=>['INGREDIENTS:','milk,','sugar,','cocoa,','salt,','water'].map((text,i)=>({text,score,lineId:0,box:{x0:i*80,x1:i*80+75,y0:0,y1:20}}));
test('missing or invalid native confidence is never promoted to high confidence',()=>{
 const items=nativeItems({items:[{text:'milk',score:null},{text:'egg',score:1.1},{text:'soy',score:.2},{text:'fish',score:true},{text:'wheat',score:'0.95'}]});
 assert.deepEqual(items.map(i=>i.score),[0,0,.2,0,0]);
 assert.ok(items.every(i=>i.confidence_scope==='native_word_uncalibrated'));
});
test('weak native reads try enhanced pixels and retain actual scores and original evidence',async()=>{
 const original={width:400,height:200,toDataURL:()=> 'data:image/png;base64,ORIGINAL'},enhanced={width:800,height:400,toDataURL:()=> 'data:image/png;base64,ENHANCED'};
 const calls=[];
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{prepare:async(_,extra)=>extra?enhanced:original,rotate,
  nativeReader:async({base64})=>{calls.push(base64);return {items:words(base64==='ENHANCED'?.9:.2)}}});
 const p=result.products[0];assert.equal(p.status,'conflict');assert.ok(calls.includes('ENHANCED'));
 assert.ok(p.sources.find(s=>s.variant==='native-original').items.every(w=>w.score===.2));
 const e=p.sources.find(s=>s.variant==='native-enhanced');assert.equal(e.items[1].box.x0,40);assert.equal(e.items[1].score,.9);
 assert.equal(new Set(p.sources.map(s=>s.familyId)).size,1);
});
test('native menus read both languages on normalized full image and columns even after an earlier match',async()=>{
 const calls=[],view=variant=>({canvas:{toDataURL:()=> 'data:image/png;base64,'+variant},variant,frame:{x:200,y:0,scale:2,width:400,height:200,cropWidth:200}});
 const p=(await analyzeNativeProducts(products,{allergens:['milk']},{prepare,rotate,purpose:'menu',makeMenuViews:()=>[view('original'),view('menu-column-0'),view('menu-column-1'),view('menu-enhanced')],nativeReader:async options=>{calls.push(options);return {items:words()}}})).products[0];
 assert.equal(calls.length,8);
 for(const variant of ['menu-column-0','menu-column-1','menu-enhanced'])assert.deepEqual(calls.filter(c=>c.base64===variant).map(c=>c.script),['ko','en']);
 assert.equal(p.sources.find(s=>s.variant==='menu-column-0').items[1].box.x0,240);
});
test('a clear shopping positive avoids an unnecessary enhancement pass',async()=>{
 let enhanced=0;
 const p=(await analyzeNativeProducts(products,{allergens:['milk']},{prepare:async(_,extra)=>{if(extra)enhanced++;return canvas},rotate,nativeReader:async()=>({items:words()})})).products[0];
 assert.equal(p.status,'conflict');assert.equal(enhanced,0);
});
test('an enhancement failure cannot erase an earlier native positive',async()=>{
 const p=(await analyzeNativeProducts(products,{allergens:['milk','egg']},{prepare:async(_,extra)=>{if(extra)throw Error('Pixel processing failed');return canvas},rotate,nativeReader:async()=>({items:words()})})).products[0];
 assert.equal(p.status,'conflict');assert.ok(p.errors.some(e=>e.phase==='enhancement'));assert.ok(p.sources.length>=2);
});
test('one per-photo deadline prevents additional native reads after a hung call',async()=>{
 let calls=0;
 const p=(await analyzeNativeProducts(products,{allergens:['milk']},{prepare,rotate,maxPhotoMs:10,nativeReader:async()=>{calls++;return new Promise(()=>{})}})).products[0];
 assert.equal(calls,1);assert.equal(p.status,'unverified');assert.equal(p.retake_recommended,true);assert.ok(p.errors.some(e=>/deadline/.test(e.message)));
});
test('native script readings cannot corroborate a weak word into a verified match',async()=>{
 const nativeReader=async()=>({items:words(.4),engine:'native-test'});
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{nativeReader,prepare,rotate});
 assert.equal(result.products[0].status,'unverified');assert.equal(result.products[0].direct_matches.length,0);
 assert.ok(result.products[0].mention_matches.some(m=>m.allergen_id==='milk'&&m.score===.4));
 assert.equal(new Set(result.products[0].sources.map(s=>s.familyId)).size,1);
});
test('native per-word uncertainty cannot borrow confidence from a heading',async()=>{
 const items=words();items[1].score=.1;
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{nativeReader:async()=>({items}),prepare,rotate});
 assert.equal(result.products[0].status,'unverified');assert.equal(result.products[0].direct_matches.length,0);
});
test('native failure retains an earlier positive and remains explicit',async()=>{
 let calls=0;
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{nativeReader:async()=>{if(calls++)throw Error('model failed');return {items:words()};},prepare,rotate});
 assert.equal(result.products[0].status,'conflict');assert.equal(result.products[0].sources.length,1);
 assert.equal(result.products[0].errors.length,1);assert.ok(result.products[0].direct_matches.some(m=>m.allergen_id==='milk'));
});
test('unreadable native images never become reassuring negative results',async()=>{
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{nativeReader:async()=>{throw Error('reader unavailable')},prepare,rotate});
 assert.equal(result.products[0].status,'unverified');assert.equal(result.products[0].errors.length,2);
});
test('a failed Korean model does not prevent the Latin read from running',async()=>{
 const result=await analyzeNativeProducts(products,{allergens:['milk']},{nativeReader:async({script})=>{if(script==='ko')throw Error('Korean model unavailable');return {items:words()};},prepare,rotate});
 assert.equal(result.products[0].status,'conflict');assert.equal(result.products[0].errors.length,1);
 assert.deepEqual(result.products[0].sources[0].model_languages,['en']);
});
test('unavailable native models retain errors and fall back to the existing local reader',async()=>{
 const {analyzeProducts}=await import('../src/tesseract.js');
 const result=await analyzeProducts(products,{allergens:['milk']},{nativeReader:async()=>{throw Error('Native model unavailable')},prepare,rotate,
  createWorker:async()=>({recognize:async()=>({data:{words:words().map(w=>({text:w.text,confidence:w.score*100,line_num:0}))}}),terminate:async()=>{}})});
 assert.equal(result.products[0].status,'conflict');assert.equal(result.products[0].errors.length,2);
 assert.ok(result.products[0].sources.some(s=>s.items.some(i=>i.text==='milk,')));
});
test('native text without usable word confidence falls back without inventing native scores',async()=>{
 const {analyzeProducts}=await import('../src/tesseract.js');let workers=0;
 const result=await analyzeProducts(products,{allergens:['milk']},{nativeReader:async()=>({items:words(0)}),prepare,rotate,
  createWorker:async()=>{workers++;return {recognize:async()=>({data:{words:words().map(w=>({text:w.text,confidence:w.score*100,line_num:0}))}}),terminate:async()=>{}}}});
 assert.equal(workers,1);assert.equal(result.products[0].status,'conflict');
 assert.ok(result.products[0].sources.filter(s=>s.confidence_scope==='native_word_uncalibrated').every(s=>s.items.every(w=>w.score===0)));
});
test('only an unread native product falls back; a preceding native positive keeps its identity and evidence',async()=>{
 const {analyzeProducts}=await import('../src/tesseract.js');let nativeCalls=0,workers=0;
 const result=await analyzeProducts([{id:'first',photos:[{file:{}}]},{id:'second',photos:[{file:{}}]}],{allergens:['milk','soy']},{prepare,rotate,
  nativeReader:async()=>{if(nativeCalls++>=2)throw Error('native image failed');return {items:words()};},
  createWorker:async()=>{workers++;return {recognize:async()=>({data:{words:[{text:'INGREDIENTS: soy, salt',confidence:95}]}}),terminate:async()=>{}}}});
 assert.deepEqual(result.products.map(p=>p.product_id),['first','second']);assert.equal(workers,1);
 assert.deepEqual([...new Set(result.products[0].direct_matches.map(m=>m.allergen_id))],['milk']);
 assert.deepEqual([...new Set(result.products[1].direct_matches.map(m=>m.allergen_id))],['soy']);
 assert.equal(result.products[0].errors.length,0);assert.equal(result.products[1].errors.length,2);
});
