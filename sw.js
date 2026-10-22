// Increment RELEASE with the complete module graph. Installation is atomic;
// updates wait for open tabs to close, and never interrupt ongoing analysis.
const RELEASE='1.9.2';
const PREFIX=`adpai-shell:${self.registration.scope}:`;
const CACHE=PREFIX+RELEASE;
const FILES=['./','./index.html','./manifest.webmanifest','./privacy.html',
  `./assets/app.css?v=${RELEASE}`,'./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/apple-touch-icon.png',
  ...['browser','tesseract','engine','ontology','image','pwa','crop','ingredients','ingredient-glossary','label-pattern','menu','dietary','ocr-worker','menu-image','menu-ocr','native-ocr'].map(name=>`./src/${name}.js?v=${RELEASE}`)];
const urls=FILES.map(file=>new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try {await cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})));}
  catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith(PREFIX) && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET' || !urls.includes(request.url)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Navigation gets a fresh page online. Versioned imports prevent mixing
    // old cached rules with a new page; offline navigation uses this shell.
    if(request.mode==='navigate') {
      try {const response=await fetch(request);if(response.ok) return response;} catch {}
    }
    return (await cache.match(request)) || fetch(request);
  })());
});
