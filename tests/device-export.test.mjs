import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseShareFile,shareLocalFile} from '../src/device-export.js';

test('a browser rejecting JSON can share the exact report as plain text',async()=>{
 const text=JSON.stringify({physical_hardware_verified:false,missing_known_allergens:['milk']}),json=new File([text],'report.json',{type:'application/json'}),txt=new File([text],'report.txt',{type:'text/plain'});
 const sent=[],navigator={canShare:({files})=>files[0].type==='text/plain',share:data=>{sent.push(data);return Promise.resolve()}};
 const chosen=chooseShareFile([json,txt],navigator);assert.equal(chosen,txt);assert.equal(sent.length,0,'capability detection cannot start a share');
 const pending=shareLocalFile(chosen,navigator);assert.equal(sent.length,1,'share must start within the click, before an await consumes user activation');
 assert.equal(await pending,'completed');assert.equal(await sent[0].files[0].text(),text);
});
test('unsupported, denied and cancelled shares do not retry, upload, or claim completion',async()=>{
 const photo=new File(['original bytes'],'photo.png',{type:'image/png'});
 for(const nav of [{},{share:async()=>{throw Error('must not call without canShare')}},{share:async()=>{},canShare:()=>{throw Error('not supported')}},{share:async()=>{throw Error('must not call')},canShare:()=>false}]){
  assert.equal(chooseShareFile([photo],nav),null);assert.equal(await shareLocalFile(photo,nav),'unsupported');
 }
 for(const [name,expected] of [['AbortError','cancelled'],['NotAllowedError','failed'],['NotSupportedError','failed']]){
  let calls=0;const nav={canShare:()=>true,share:()=>{calls++;return Promise.reject(Object.assign(Error('no share'),{name}))}};
  assert.equal(await shareLocalFile(photo,nav),expected);assert.equal(calls,1);
 }
});
