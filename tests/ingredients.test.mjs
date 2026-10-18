import test from 'node:test';
import assert from 'node:assert/strict';
import {extractIngredients,explainIngredient,sourceTranscript} from '../src/ingredients.js';
import {evaluateProduct} from '../src/engine.js';
const source=(text,score=.95)=>({familyId:'korean',photoIndex:0,items:[{text,score}]});

test('extracts nested ingredients without splitting a composite ingredient or including warnings',()=>{
  const rows=extractIngredients([source('INGREDIENTS: sugar, milk chocolate (sugar, cocoa butter, milk powder), citric acid. ALLERGEN STATEMENT: CONTAINS MILK AND SOY. MAY CONTAIN PEANUTS.')]);
  assert.deepEqual(rows.map(x=>x.original),['sugar','milk chocolate (sugar, cocoa butter, milk powder)','citric acid']);
  assert.ok(rows.every(x=>!x.uncertain));
  assert.ok(explainIngredient(rows[1].original).some(x=>x.id==='milk-powder'));
});
test('preserves accented original names, wrapped text and Korean suffix precautions',()=>{
  assert.deepEqual(extractIngredients([source('Ingrédients : sucre, lécithine de soja. Peut contenir du lait.')]).map(x=>x.original),['sucre','lécithine de soja']);
  assert.deepEqual(extractIngredients([source('원재료명: 설탕, 코코아버터\n우유, 계란 혼입가능')]).map(x=>x.original),['설탕','코코아버터']);
  assert.equal(explainIngredient('구연산','ko')[0].text,'신맛과 산도를 조절하는 성분입니다.');
});
test('does not invent a list without a reliable heading and keeps low word confidence',()=>{
  assert.deepEqual(extractIngredients([source('Nutrition facts: sugar 12g')]),[]);
  assert.deepEqual(extractIngredients([source('INGREDIENTS: milk',.3)]),[]);
  const input={familyId:'korean',photoIndex:1,items:[{text:'INGREDIENTS:',score:.99,lineId:0},{text:'milk,',score:.3,lineId:0},{text:'citric acid',score:.98,lineId:0}]};
  const rows=extractIngredients([input]);
  assert.equal(rows[0].uncertain,true);assert.equal(rows[0].photoIndex,1);assert.equal(rows[1].uncertain,false);
  assert.equal(sourceTranscript(input).text,'INGREDIENTS: milk, citric acid');
});
test('codes, sources and chemical names are not turned into invented allergens or ingredients',()=>{
  assert.equal(explainIngredient('E500(i)').length,0,'do not explain a different sodium-carbonate subtype as baking soda');
  assert.deepEqual(explainIngredient('E500(ii)').map(x=>x.id),['bicarbonate']);
  assert.deepEqual(explainIngredient('E322').map(x=>x.id),['lecithin']);
  assert.ok(explainIngredient('E322')[0].text.includes('cannot be determined'));
  assert.equal(explainIngredient('citric acidity').length,0);
  assert.equal(explainIngredient('unknown additive 999').length,0);
  assert.equal(explainIngredient('milk-free').length,0);
  for(const name of ['almond milk','oat milk powder','lait de coco'])assert.ok(!explainIngredient(name).some(x=>['milk','milk-powder'].includes(x.id)),name);
  assert.ok(explainIngredient('almond milk, milk powder').some(x=>x.id==='milk-powder'));
  for(const text of ['INGREDIENTS: lactic acid, cocoa butter, E322','INGREDIENTS: sugar, citric acid']) {
    const sources=[source(text)];
    const before=evaluateProduct({sources,profile:{allergens:['milk','soy']}});
    for(const row of extractIngredients(sources))explainIngredient(row.original,'ko');
    assert.deepEqual(evaluateProduct({sources,profile:{allergens:['milk','soy']}}),before);
    assert.equal(before.status,'unverified');
  }
});

test('a reference to an ingredient label in instructions is not a list heading',()=>{
  assert.deepEqual(extractIngredients([source('Please check the original ingredient label.')]),[]);
  assert.deepEqual(extractIngredients([source('Please check the original\ningredient\nlabel.')]),[]);
  assert.deepEqual(extractIngredients([source('INGREDIENTS\nsugar, milk powder. CONTAINS MILK')]).map(x=>x.original),['sugar','milk powder']);
});

test('Korean OCR spaces preserve original names, explanations and declaration boundaries',()=>{
  const rows=extractIngredients([source('원 재 료 명: 설탕, 코 코 아 버터, 전 지 분 유\n우유 함 유\n대두 혼 입 가능')]);
  assert.deepEqual(rows.map(x=>x.original),['설탕','코 코 아 버터','전 지 분 유']);
  assert.equal(explainIngredient(rows[1].original)[0].id,'cocoa-butter');
  assert.equal(explainIngredient(rows[2].original)[0].id,'milk-powder');
});
