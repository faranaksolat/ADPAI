// Copy an explicit public-file allowlist. Never copy the repository root:
// backend source, .git, .env, tests and credentials do not belong in an app.
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {gunzipSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','./vendor/tesseract/tesseract.min.js')
  .replace('./src/browser.js?v=1.10.0','./mobile.js');
if(html.includes('cdn.jsdelivr.net') || html.includes('./src/browser.js')) throw new Error('Mobile entry point replacement failed');
await fs.writeFile(path.join(out,'index.html'),html);
for(const file of ['privacy.html','manifest.webmanifest']) await fs.copyFile(path.join(root,file),path.join(out,file));
await fs.cp(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
for(const file of ['tesseract.min.js','worker.min.js']) {
  await fs.mkdir(path.join(out,'vendor/tesseract'),{recursive:true});
  await fs.copyFile(path.join(root,'node_modules/tesseract.js/dist',file),path.join(out,'vendor/tesseract',file));
}
await fs.mkdir(path.join(out,'vendor/tesseract-core'),{recursive:true});
for(const file of await fs.readdir(path.join(root,'node_modules/tesseract.js-core'))) {
  if(/^tesseract-core.*\.(js|wasm)$/.test(file)) await fs.copyFile(path.join(root,'node_modules/tesseract.js-core',file),path.join(out,'vendor/tesseract-core',file));
}
await fs.mkdir(path.join(out,'vendor/tessdata'),{recursive:true});
// AAPT transparently unpacks .gz assets and removes that suffix. Ship plain
// traineddata on both platforms so the worker fetches the packaged filename.
for(const lang of ['kor','eng','fra']) {
  const compressed=await fs.readFile(path.join(root,`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`));
  await fs.writeFile(path.join(out,`vendor/tessdata/${lang}.traineddata`),gunzipSync(compressed));
}
await fs.mkdir(path.join(out,'licenses'),{recursive:true});
await fs.copyFile(path.join(root,'mobile/THIRD_PARTY_NOTICES.md'),path.join(out,'licenses/NOTICE.md'));
await fs.copyFile(path.join(root,'mobile/TESSDATA-LICENSE.txt'),path.join(out,'licenses/TESSDATA-LICENSE.txt'));
for(const [pkg,file] of [['tesseract.js','LICENSE.md'],['tesseract.js-core','LICENSE'],['@capacitor/core','LICENSE'],['@capacitor/camera','LICENSE']]) {
  await fs.copyFile(path.join(root,'node_modules',pkg,file),path.join(out,'licenses',pkg.replaceAll('/','-')+'.txt'));
}
for(const lang of ['kor','eng','fra']) await fs.copyFile(path.join(root,`node_modules/@tesseract.js-data/${lang}/README.md`),path.join(out,`licenses/tessdata-${lang}.md`));
await build({absWorkingDir:root,entryPoints:['mobile/entry.js'],outfile:'dist/mobile.js',bundle:true,format:'esm',target:['es2022'],minify:true,legalComments:'eof'});
console.log('Built dist/: shared allergen rules, native camera bridge, local OCR engine and primary models.');
