// Authored text fixtures only, never a real-menu or native-ML-Kit benchmark.
const definitions={
 en:[['Peanut noodles','peanut, wheat, egg',['peanut','wheat','egg']],['Tomato soup','cream, tomato',['milk']],['Pork bowl','pork, rice',[]],['Garden salad','lettuce, tomato',[]]],
 ko:[['땅콩 국수','땅콩, 밀, 계란',['peanut','wheat','egg']],['토마토 수프','우유, 토마토',['milk']],['돼지고기 덮밥','돼지고기, 쌀',[]],['채소 샐러드','상추, 토마토',[]]],
};
globalThis.makeQualityFixture=async(language,variant)=>{
 await document.fonts.ready;
 const rows=definitions[language],original=document.createElement('canvas');original.width=1000;original.height=380;
 const ctx=original.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,380);ctx.fillStyle='#141414';ctx.font='28px "Noto Sans CJK KR", sans-serif';
 rows.forEach(([name,body],i)=>ctx.fillText(name+': '+body,35,65+i*85));
 const canvas=document.createElement('canvas');canvas.width=variant==='small'||variant==='blur'?500:1000;canvas.height=variant==='small'||variant==='blur'?190:380;
 const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);
 if(variant==='blur')c.filter='blur(0.9px)';
 if(variant==='tilted'){c.translate(500,190);c.rotate(3*Math.PI/180);c.drawImage(original,-500,-190)}
 else c.drawImage(original,0,0,canvas.width,canvas.height);
 if(variant==='dim'){
  const image=c.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<image.data.length;i+=4)for(let k=0;k<3;k++)image.data[i+k]=30+image.data[i+k]*.23;
  c.putImageData(image,0,0);
 }
 // Compression is frozen into the PNG fixture after JPEG decoding.
 const compressed=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',variant==='small'?.4:.82));
 const image=await createImageBitmap(compressed);c.filter='none';c.setTransform(1,0,0,1,0,0);c.drawImage(image,0,0);image.close();
 return {language,variant,reference_text:rows.map(([name,body])=>name+': '+body).join('\n'),
  entries:rows.map(([name,,allergens],i)=>({name,allergens,dietary:i===2?['avoid_pork']:[]})),png:canvas.toDataURL('image/png').split(',')[1]};
};
const environments=new Map();
globalThis.readQualityFixture=async(root,version,id,budget)=>{
 if(!environments.has(root)){
  const [{createManagedWorker},{itemsFrom},{readMenuPhoto},image,menu]=await Promise.all([
   import(root+'/src/ocr-worker.js?v='+version),import(root+'/src/tesseract.js?v='+version),import(root+'/src/menu-ocr.js?v='+version),import(root+'/src/image.js?v='+version),import(root+'/src/menu.js?v='+version)]);
  const worker=await createManagedWorker(['kor','eng','fra'],1,{workerPath:new URL('/vendor/tesseract/worker.min.js',location.href).href,corePath:new URL('/vendor/tesseract-core/',location.href).href,langPath:new URL('/vendor/tessdata/',location.href).href,gzip:false});
  environments.set(root,{worker,itemsFrom,readMenuPhoto,image,menu});
 }
 const {worker,itemsFrom,readMenuPhoto,image,menu}=environments.get(root);
 const response=await fetch('/fixture/'+id+'.png'),blob=await response.blob();
 const start=performance.now(),canvas=await image.preprocess(new File([blob],'fixture.png',{type:'image/png'}),false);
 const output=await readMenuPhoto({worker,canvas,photoIndex:0,familyId:'korean',rotate:image.rotateCanvas,itemsFrom,maxPhotoMs:budget});
 const result=menu.evaluateMenu({...output,profile:{allergens:['milk','egg','peanut','wheat'],dietary_preferences:['avoid_pork']}});
 const full=output.sources.filter(s=>s.rotation===0&&(!s.frame.cropWidth||s.frame.cropWidth===s.frame.width));
 // Fixed reference-free selection, not the pass with the best reference score.
 const quality=s=>{const chars=s.items.reduce((n,w)=>n+w.text.length,0);return s.items.reduce((n,w)=>n+w.text.length*w.score,0)/Math.max(1,chars)*Math.min(1,chars/80)};
 full.sort((a,b)=>quality(b)-quality(a));
 return {latency_ms:performance.now()-start,selected_ocr_variant:full[0]?.variant||null,
  selected_ocr_text:(full[0]?.items||[]).map(w=>w.text).join(' '),sources:output.sources,errors:output.errors,complete:output.complete,...result};
};
globalThis.finishQualityBenchmark=async()=>{for(const env of environments.values())await env.worker.terminate()};
