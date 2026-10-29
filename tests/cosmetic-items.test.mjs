import test from 'node:test';
import assert from 'node:assert/strict';
import {cosmeticItemsFrom} from '../src/cosmetic-items.js';
import {evaluateCosmetics} from '../src/cosmetics.js';
const word=(text,confidence,x0,y0,y1)=>({text,confidence,bbox:{x0,y0,x1:x0+20,y1}});
test('a low-lying comma remains between two names in the actual OCR line order',()=>{
 const output={data:{blocks:[{paragraphs:[{lines:[{words:[word('Ingredients:',99,0,0,30),word('Phenoxyethanol',94,120,0,30),word(',',91,145,27,32),word('Cocamidopropyl Betaine',93,180,0,30)]}]}]}]}};
 const items=cosmeticItemsFrom(output);assert.deepEqual(items.map(w=>w.text),['Ingredients:','Phenoxyethanol',',','Cocamidopropyl Betaine']);
 const result=evaluateCosmetics([{items}],{coconut:true,avoid:['Phenoxyethanol']});assert.equal(result.rows.length,2);assert.equal(result.listed.length,1);assert.equal(result.review[0].kind,'source_needs_confirmation');
});
test('structured lines preserve a weak ingredient and cannot inherit the heading confidence',()=>{
 const items=cosmeticItemsFrom({data:{blocks:[{paragraphs:[{lines:[{confidence:99,words:[word('Ingredients:',99,0,0,30),word('Cocos Nucifera Oil',28,120,0,30)]}]}]}]}});
 assert.equal(items[1].score,.28);const result=evaluateCosmetics([{items}],{coconut:true});assert.equal(result.listed.length,0);assert.equal(result.review[0].kind,'uncertain_read');assert.equal(result.safety_certified,false);
});
test('a legacy token spanning several ingredients cannot lend its aggregate score to each ingredient',()=>{
 const items=cosmeticItemsFrom({data:{words:[word('Ingredients: Water, Cocos Nucifera Oil,',98,0,0,30)]}},{legacy:true});
 assert.equal(items[0].score,.98);assert.equal(items[0].aggregate_confidence,true);
 const result=evaluateCosmetics([{items}],{coconut:true});assert.equal(result.listed.length,0);assert.equal(result.review[0].kind,'uncertain_read');assert.ok(result.rows.every(r=>r.reading_uncertain));
 const locant=cosmeticItemsFrom({data:{words:[word('1,2-Hexanediol,',91,0,0,30)]}},{legacy:true});assert.equal(locant[0].aggregate_confidence,false);
});
test('crop-edge context remains uncertain without changing the actual word score',()=>{
 const result=evaluateCosmetics([{items:[{text:'Ingredients:',score:.98,lineId:0},{text:'Cocos Nucifera Oil',score:.96,lineId:1,context_clipped:true}]}],{coconut:true});
 assert.equal(result.rows[0].confidence,.96);assert.equal(result.rows[0].context_clipped,true);assert.equal(result.listed.length,0);assert.equal(result.review.length,1);
});
