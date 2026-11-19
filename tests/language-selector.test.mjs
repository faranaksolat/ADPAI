import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('all available language selectors display KR rather than 한국어',async()=>{
 for(const filename of ['index.html','cosmetics.html','pc_server/static/index.html']){
  const html=await readFile(filename,'utf8');
  assert.match(html,/<option value="ko">KR<\/option>/,filename);
  assert.doesNotMatch(html,/<option value="ko">한국어<\/option>/,filename);
 }
});
test('home hero visual also uses EN / KR, not EN / 한국어',async()=>{
 const html=await readFile('index.html','utf8');
 assert.match(html,/EN \/ KR<\/text>/);
 assert.doesNotMatch(html,/EN \/ 한국어/);
});
