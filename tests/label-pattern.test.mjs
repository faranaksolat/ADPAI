import test from 'node:test';
import assert from 'node:assert/strict';
import {labelPattern} from '../src/label-pattern.js';
test('Korean patterns tolerate inserted/omitted spaces without changing letters',()=>{
  const re=new RegExp('^'+labelPattern('원재료명 및 함량')+'$','u');
  assert.ok(re.test('원 재 료 명 및 함 량'));
  assert.ok(re.test('원재료명및함량'));
  assert.ok(!re.test('원지료명및함량'));
  assert.ok(new RegExp('^'+labelPattern('혼입 가능')+'$','u').test('혼 입 가능'));
  assert.ok(!new RegExp('^'+labelPattern('milk powder')+'$','u').test('milkpowder'));
});
