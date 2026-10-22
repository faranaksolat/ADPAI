import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMenu} from '../src/menu.js';
const profile={allergens:['milk','egg','peanut','soy','wheat']};
function source(lines,photoIndex=0){return {photoIndex,items:lines.map((text,i)=>({text,lineId:i,score:.95,box:{x0:10,y0:i*32,x1:400,y1:i*32+20}}))}}
test('menu matches only printed text and never infers a recipe or a safe dish',()=>{
 const result=evaluateMenu({sources:[source(['Noodles: wheat, egg','Salad: lettuce, tomato','Banana shake: banana'])],profile});
 assert.equal(result.items.length,3);assert.equal(result.items[0].name,'Noodles');
 assert.deepEqual(result.items[0].matches.map(x=>x.allergen_id).sort(),['egg','wheat']);
 assert.equal(result.items[1].status,'unverified');assert.equal(result.items[2].status,'unverified');
 assert.deepEqual(result.safe_items,[]);assert.equal(result.complete_menu_verified,false);
});
test('priced dish descriptions associate only within the same column and nearby rows',()=>{
 const s=source(['Pasta $12.00','Ingredients: wheat, cream','Salad $9.00','Ingredients: lettuce, tomato']);
 const result=evaluateMenu({sources:[s],profile});
 assert.equal(result.items.length,2);assert.equal(result.items[0].matches.length,2);assert.equal(result.items[1].matches.length,0);
 const distant=source(['Burger $10.00','Ingredients: milk']);distant.items[1].box.x0=700;distant.items[1].box.x1=1000;
 const separated=evaluateMenu({sources:[distant],profile});
 assert.equal(separated.items[0].matches.length,0);assert.equal(separated.unassigned.length,1);
});
test('ambiguous names and ingredients stay unassigned without geometry',()=>{
 const s=source(['Salad','Ingredients: milk']);s.items.forEach(i=>delete i.box);
 const result=evaluateMenu({sources:[s],profile});
 assert.equal(result.items.length,0);assert.equal(result.unassigned.length,1);assert.equal(result.unassigned[0].association_verified,false);
});
test('restaurant-wide cautions do not get attributed to the nearest dish',()=>{
 const result=evaluateMenu({sources:[source(['Salad $9.00','May contain peanuts','Soup: tomato'])],profile});
 assert.equal(result.unassigned.length,1);assert.equal(result.items[0].matches.length,0);assert.equal(result.items[1].matches.length,0);
});
test('Korean printed ingredients and custom avoid terms are supported',()=>{
 const result=evaluateMenu({sources:[source(['국수: 밀, 계란','샐러드: 고수, 토마토'])],profile:{allergens:['wheat','egg'],custom_avoid:['고수']}});
 assert.deepEqual(result.items[0].matches.map(x=>x.allergen_id).sort(),['egg','wheat']);
 assert.equal(result.items[1].matches[0].allergen_id,'custom');
});
test('different menu photos and weak OCR cannot create a safe result',()=>{
 const a=source(['Pasta: milk'],0),b=source(['Salad: lettuce'],1);a.items[0].score=.2;
 const result=evaluateMenu({sources:[a,b],profile});
 assert.equal(result.items.length,2);assert.equal(result.items[0].matches[0].uncertain,true);
 assert.equal(result.items[1].status,'unverified');assert.deepEqual(evaluateMenu({profile}).safe_items,[]);
});
test('merged menu columns cannot attach another dish ingredient to the first dish',()=>{
 const result=evaluateMenu({sources:[source(['Salad: tomato Soup: milk'])],profile});
 assert.equal(result.items.length,0);assert.equal(result.unassigned.length,1);
 assert.equal(result.unassigned[0].association_verified,false);
});
test('larger Korean card titles need no price or ingredients prefix and keep adjacent columns apart',()=>{
 const s={photoIndex:0,items:[
  {text:'굴 라멘',score:.95,lineId:0,box:{x0:20,y0:100,x1:110,y1:120}},
  {text:'채소 라멘',score:.95,lineId:1,box:{x0:320,y0:100,x1:420,y1:120}},
  {text:'통영에서 받은 굴을',score:.95,lineId:2,box:{x0:5,y0:127,x1:130,y1:139}},
  {text:'신선한 채소를 사용한',score:.95,lineId:3,box:{x0:305,y0:127,x1:435,y1:139}},
  {text:'사용한 계절 메뉴',score:.95,lineId:4,box:{x0:10,y0:142,x1:125,y1:154}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{allergens:['shellfish','milk','egg','wheat']}});
 assert.equal(r.items.length,2);assert.deepEqual(r.items.find(i=>i.name==='굴 라멘').matches.map(m=>m.allergen_id),['shellfish']);
 assert.equal(r.items.find(i=>i.name==='채소 라멘').status,'unverified');assert.deepEqual(r.safe_items,[]);
});
test('a Korean alias row does not cut a priced English dish off from its printed ingredients',()=>{
 const s={photoIndex:0,items:[
  {text:'Black Pasta 12,000원',score:.95,lineId:0,box:{x0:10,y0:0,x1:230,y1:20}},
  {text:'오징어 먹물 파스타',score:.95,lineId:1,box:{x0:10,y0:25,x1:170,y1:42}},
  {text:'오징어와 크림 소스',score:.95,lineId:2,box:{x0:10,y0:48,x1:180,y1:59}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{allergens:['shellfish','milk']}});
 assert.equal(r.items[0].name,'Black Pasta');assert.deepEqual(r.items[0].matches.map(m=>m.allergen_id).sort(),['milk','shellfish']);
});
test('a different layout reading cannot erase useful text or invent independent confidence',()=>{
 const a=source(['Soup: milk']);a.items[0].score=.4;
 const b=source(['Soup: milk']);b.items[0].score=.4;
 const noise=source(['An unrelated restaurant notice with many confident words']);noise.items[0].score=.99;
 const r=evaluateMenu({sources:[a,b,noise],profile});
 assert.equal(r.items.length,1);assert.equal(r.items[0].matches[0].score,.4);assert.equal(r.items[0].matches[0].uncertain,true);
});
test('equal dish names in distant columns do not borrow each other ingredients',()=>{
 const a=source(['Soup: milk','Soup: soy']);a.items[1].box={x0:700,y0:0,x1:1000,y1:20};
 const r=evaluateMenu({sources:[a],profile});assert.equal(r.items.length,2);
 assert.deepEqual(r.items.map(i=>i.matches.map(m=>m.allergen_id)),[['milk'],['soy']]);
});
test('one tall Korean glyph cannot hide the larger heading typography',()=>{
 const s={photoIndex:0,items:[
  {text:'굴',score:.93,lineId:0,box:{x0:46,y0:327,x1:70,y1:352}},
  {text:'라멘',score:.97,lineId:0,box:{x0:80,y0:326,x1:128,y1:353}},
  {text:'통영에서',score:.95,lineId:1,box:{x0:46,y0:365,x1:106,y1:382}},
  {text:'받은',score:.93,lineId:1,box:{x0:113,y0:365,x1:143,y1:382}},
  {text:'굴',score:.93,lineId:1,box:{x0:149,y0:366,x1:179,y1:382}},
  {text:'을',score:.97,lineId:1,box:{x0:166,y0:363,x1:177,y1:389}},
  {text:'사용한',score:.97,lineId:1,box:{x0:185,y0:365,x1:230,y1:382}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{allergens:['shellfish']}});
 assert.equal(r.items[0].name,'굴 라멘');assert.equal(r.items[0].matches[0].allergen_id,'shellfish');
});
test('a clipped crop-edge title stays unassigned instead of inventing a dish',()=>{
 const s=source(['Soup: milk']);s.frame={x:10,cropWidth:390,width:1000};
 const r=evaluateMenu({sources:[s],profile});assert.equal(r.items.length,0);assert.equal(r.unassigned[0].matches[0].allergen_id,'milk');
});
test('separately detected prices associate only with their closest title on the same row',()=>{
 const s={photoIndex:0,items:[
  {text:'Soup',score:.95,lineId:0,box:{x0:10,y0:0,x1:70,y1:20}},
  {text:'12,000원',score:.95,lineId:1,box:{x0:150,y0:0,x1:230,y1:20}},
  {text:'Ingredients: milk',score:.95,lineId:2,box:{x0:10,y0:26,x1:200,y1:42}},
  {text:'Salad',score:.95,lineId:3,box:{x0:400,y0:0,x1:460,y1:20}},
  {text:'9,000원',score:.95,lineId:4,box:{x0:530,y0:0,x1:610,y1:20}},
  {text:'Ingredients: lettuce',score:.95,lineId:5,box:{x0:400,y0:26,x1:600,y1:42}},
 ]};
 const r=evaluateMenu({sources:[s],profile});assert.equal(r.items.length,2);
 assert.equal(r.items.find(i=>i.name==='Soup').matches[0].allergen_id,'milk');assert.equal(r.items.find(i=>i.name==='Salad').status,'unverified');
});
test('two readings of one physical title do not invent duplicate dishes or raise confidence',()=>{
 const a=source(['굴 라멘: 굴']),b=source(['= 라멘: 굴']);
 a.items[0].score=.4;b.items[0].score=.4;
 const r=evaluateMenu({sources:[a,b],profile:{allergens:['shellfish']}});
 assert.equal(r.items.length,1);assert.equal(r.items[0].name,'굴 라멘');assert.equal(r.items[0].matches[0].score,.4);
});
test('conflicting complete names cannot merge their ingredient evidence merely from overlapping boxes',()=>{
 const r=evaluateMenu({sources:[source(['Soup: milk']),source(['Salad: soy'])],profile});
 assert.equal(r.items.length,2);assert.deepEqual(r.items.map(i=>i.matches.map(m=>m.allergen_id)),[['milk'],['soy']]);
});
test('a detached thousands-formatted price keeps the printed English title and taller Korean alias together',()=>{
 const s={photoIndex:0,items:[
  {text:'Black Pasta',score:.95,lineId:0,box:{x0:10,y0:10,x1:130,y1:23}},
  {text:'12,0008',score:.7,lineId:1,box:{x0:155,y0:10,x1:220,y1:23}},
  {text:'오징어 먹물 파스타',score:.95,lineId:2,box:{x0:10,y0:28,x1:180,y1:49}},
  {text:'오징어와 크림 소스',score:.95,lineId:3,box:{x0:10,y0:54,x1:180,y1:65}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{allergens:['shellfish','milk']}});
 const dish=r.items.find(i=>i.name==='Black Pasta');assert.ok(dish);
 assert.deepEqual(dish.matches.map(m=>m.allergen_id).sort(),['milk','shellfish']);assert.deepEqual(r.safe_items,[]);
});
test('a printed ingredient in a larger final title may warn without an inferred recipe',()=>{
 const s={photoIndex:0,items:[
  {text:'Please ask staff for further information',score:.95,lineId:0,box:{x0:10,y0:0,x1:220,y1:10}},
  {text:'Menu prices may change',score:.95,lineId:1,box:{x0:10,y0:30,x1:160,y1:40}},
  {text:'Cream Cheese Pizza',score:.95,lineId:2,box:{x0:10,y0:100,x1:200,y1:120}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{allergens:['milk','wheat','egg']}});
 assert.deepEqual(r.items.find(i=>i.name==='Cream Cheese Pizza').matches.map(m=>m.allergen_id),['milk']);assert.deepEqual(r.safe_items,[]);
});

test('individually boxed prices separate same-height menu columns without moving ingredients',()=>{
 const word=(text,x0,x1,y0,lineId)=>({text,score:.9,lineId,box:{x0,x1,y0,y1:y0+20}});
 const s={items:[word('Milkshake',10,100,0,0),word('5,000',125,180,0,0),word('Tea',205,250,0,0),word('4,000',280,335,0,0),
  word('Ingredients: milk',10,180,26,1),word('Ingredients: mint',205,335,26,1)]};
 const r=evaluateMenu({sources:[s],profile});assert.equal(r.items.length,2);
 assert.deepEqual(r.items.find(i=>i.name==='Milkshake').matches.map(h=>h.allergen_id),['milk']);
 assert.equal(r.items.find(i=>i.name==='Tea').matches.length,0);assert.deepEqual(r.safe_items,[]);
 const aggregate=source(['Shake 5,000 Tea 4,000 milk']);
 assert.equal(evaluateMenu({sources:[aggregate],profile}).items.length,0);
});
test('dot leaders, bilingual aliases and a distant price do not become separate dishes',()=>{
 const s={items:[
  {text:'김 치 찌 개 Kimchi Jjigae',lineId:0,score:.9,box:{x0:10,x1:260,y0:0,y1:30}},
  {text:'6,500',lineId:1,score:.9,box:{x0:650,x1:740,y0:0,y1:30}},
  {text:'원산지 - 김치 : 국내산, 돼지고기 : 국내산',lineId:2,score:.9,box:{x0:10,x1:420,y0:45,y1:60}},
  {text:'된 장 찌 개 6,500',lineId:3,score:.9,box:{x0:10,x1:260,y0:100,y1:130}},
  {text:'원산지 - 콩 : 국내산',lineId:4,score:.9,box:{x0:10,x1:220,y0:145,y1:160}},
 ]};
 const r=evaluateMenu({sources:[s],profile:{dietary_preferences:['avoid_pork']}});
 assert.equal(r.items.length,2);assert.equal(r.items[0].name,'김치찌개');assert.equal(r.items[0].dietary_matches[0].kind,'conflict');
 assert.ok(r.items[0].printed_text.includes('돼지고기 : 국내산'));
 const dotted=evaluateMenu({sources:[source(['티 라 미수 … ㅡ ~ 5,500'])],profile});
 assert.equal(dotted.items[0].name,'티라미수');assert.equal(dotted.items[0].matches.length,0);
});
test('a global origin panel with multiple colons is never a dish or a verified association',()=>{
 const s=source(['Salad 9,000원','원산지 - 돼지고기 : 국내산, 소고기 : 국내산']);s.items[1].box.y0=300;s.items[1].box.y1=320;
 const r=evaluateMenu({sources:[s],profile:{dietary_preferences:['avoid_pork','avoid_beef']}});
 assert.equal(r.items.length,1);assert.equal(r.items[0].dietary_matches.length,0);assert.equal(r.unassigned[0].association_verified,false);
 s.items[1].box={x0:10,x1:400,y0:28,y1:38};
 const footer=evaluateMenu({sources:[s],profile:{dietary_preferences:['avoid_pork','avoid_beef']}});
 assert.equal(footer.items[0].dietary_matches.length,0);assert.equal(footer.unassigned[0].association_verified,false);
});
test('currency misread as W is not a dish, and price-free names cannot imply a recipe',()=>{
 const r=evaluateMenu({sources:[source(['W 6,000','Ramen 4.5','Bulgogi 14.0','950mm'])],profile});
 assert.deepEqual(r.items.map(i=>i.name),['Ramen','Bulgogi']);assert.ok(r.items.every(i=>i.matches.length===0&&i.status==='unverified'));
});
test('horizontal tile edges cannot assign a cropped name to its ingredients',()=>{
 const s=source(['Soup: milk']);s.items[0].box={x0:100,x1:300,y0:101,y1:121};s.frame={x:0,y:100,cropWidth:500,cropHeight:300,width:500,height:1000};
 const r=evaluateMenu({sources:[s],profile});assert.equal(r.items.length,0);assert.equal(r.unassigned[0].association_verified,false);
});
test('wrong-script duplicate suppression preserves warnings as unassigned without transferring them',()=>{
 const a=source(['김 치 찌 개 6,500']);a.model_languages=['kor'];
 const b=source(['ZXAB: milk']);b.model_languages=['eng'];
 const r=evaluateMenu({sources:[a,b],profile});assert.equal(r.items.length,1);assert.equal(r.items[0].matches.length,0);
 assert.equal(r.unassigned[0].matches[0].allergen_id,'milk');assert.equal(r.unassigned[0].association_verified,false);
});
test('a price or punctuation before a colon cannot become an empty or numeric dish',()=>{
 const r=evaluateMenu({sources:[source(['4,500: milk','38,000: soy','...: cream'])],profile});
 assert.equal(r.items.length,0);assert.ok(r.unassigned.some(u=>u.matches.some(h=>h.allergen_id==='milk')));assert.deepEqual(r.safe_items,[]);
});
