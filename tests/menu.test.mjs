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
