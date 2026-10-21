import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
function worker({failInstall=false,offline=false}={}) {
  const handlers={},stores=new Map(),requests=[];
  const scope='https://example.test/ADPAI/';
  const self={registration:{scope},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn};
  const caches={
    keys:async()=>[...stores.keys()],
    delete:async key=>stores.delete(key),
    open:async key=>{
      if(!stores.has(key))stores.set(key,new Map());
      const data=stores.get(key);
      return {
        addAll:async urls=>{for(const request of urls){requests.push(request);if(failInstall)throw new Error('download failed');data.set(request.url,'cached shell')}},
        match:async request=>data.get(request.url),
      };
    }
  };
  vm.runInNewContext(script,{self,caches,URL,Request,fetch:async()=>{if(offline)throw new Error('offline');return {ok:true,fresh:true}}});
  const dispatch=async name=>{let work;handlers[name]({waitUntil:promise=>work=promise});await work};
  const fetch=async (url,method='GET',mode='cors')=>{let work;handlers.fetch({request:{url,method,mode},respondWith:promise=>work=promise});return work};
  return {dispatch,fetch,requests,stores,scope};
}
test('PWA atomically caches the shipped module graph and works offline under a project path',async()=>{
  const w=worker({offline:true});await w.dispatch('install');
  for(const request of w.requests) {
    assert.ok(request.url.startsWith(w.scope));
    const url=new URL(request.url);
    const file=url.pathname.slice('/ADPAI/'.length)||'index.html';
    await fs.access(new URL('../'+file,import.meta.url));
    if(file.startsWith('src/')) {
      const source=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');
      for(const match of source.matchAll(/from ["'](\.\/.+?\.js\?v=[^"']+)["']/gu)) {
        const dependency=new URL(match[1],url).href;
        assert.ok(w.requests.some(r=>r.url===dependency),`missing offline import: ${dependency}`);
      }
    }
  }
  assert.equal(await w.fetch(w.scope,'GET','navigate'),'cached shell');
  assert.equal(await w.fetch(w.scope+'src/engine.js?v=1.8.0'),'cached shell');
  assert.equal(await w.fetch(w.scope+'assets/app.css?v=1.8.0'),'cached shell');
  assert.equal(await w.fetch(w.scope+'assets/app.css?v=1.7.0'),undefined,'a fresh page must not receive styles from the previous release');
  for(const url of [w.scope+'api/analyze',w.scope+'label.png','https://cdn.jsdelivr.net/model.gz',w.scope+'src/engine.js?v=next']) assert.equal(await w.fetch(url),undefined);
  assert.equal(await w.fetch(w.scope,'POST'),undefined);
});
test('a partial shell install is discarded; activation only removes this app old caches',async()=>{
  const failed=worker({failInstall:true});
  await assert.rejects(failed.dispatch('install'),/download failed/u);
  assert.equal(failed.stores.size,0);
  const w=worker();await w.dispatch('install');
  w.stores.set(`adpai-shell:${w.scope}:old`,new Map());
  w.stores.set('adpai-shell:https://example.test/another-app/:old',new Map());
  await w.dispatch('activate');
  assert.ok(!w.stores.has(`adpai-shell:${w.scope}:old`));
  assert.ok(w.stores.has('adpai-shell:https://example.test/another-app/:old'));
  assert.equal(w.stores.size,2);
});
