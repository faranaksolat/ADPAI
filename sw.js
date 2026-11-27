// Increment RELEASE with the complete module graph. Installation is atomic;
// updates wait for open tabs to close, and never interrupt ongoing analysis.
const RELEASE='1.11.1-official-site';
const ASSET_VERSION='1.11.1';
const STYLE_VERSION='1.11.1-official-site';
const PREFIX=`adpai-shell:${self.registration.scope}:`;
const CACHE=PREFIX+RELEASE;
const BROWSER_VERSION='1.11.1-official-site';
const PWA_VERSION='1.11.1-pwa-metrics';
const OCR_VERSION='1.11.1-korean-precautions';
const MANUAL_REFERENCE_VERSION='1.11.1-chik-chok-label';
const TABLE_LABEL_VERSION='1.11.1-table-label';
const FILES=['./','./index.html','./cosmetics.html','./manifest.webmanifest','./privacy.html','./data/catalog-korea-verified.json',
  `./assets/app.css?v=${STYLE_VERSION}`,`./assets/barcode.css?v=${ASSET_VERSION}`,`./assets/cosmetics.css?v=${ASSET_VERSION}`,'./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/apple-touch-icon.png',
  ...['browser','barcode-ui','barcode-core','barcode-dietary','catalog-core','tesseract','engine','ontology','image','crop','ingredients','ingredient-glossary','label-pattern','menu','dietary','ocr-worker','menu-image','menu-ocr','native-ocr','manual-photo-reference','photo-quality','camera','geometry','cosmetics-browser','cosmetics','cosmetic-glossary','cosmetic-ocr','cosmetic-items'].map(name=>`./src/${name}.js?v=${name==='browser'?BROWSER_VERSION:name==='manual-photo-reference'?MANUAL_REFERENCE_VERSION:ASSET_VERSION}`),
  `./src/ingredients.js?v=${TABLE_LABEL_VERSION}`,
  ...['pwa','pwa-metrics'].map(name=>`./src/${name}.js?v=${PWA_VERSION}`),
  ...['tesseract','engine'].map(name=>`./src/${name}.js?v=${OCR_VERSION}`)];
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
