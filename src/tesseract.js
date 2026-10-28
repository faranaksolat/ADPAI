import { evaluateProduct, containsAny, MARKERS, customRequiredFamilies } from './engine.js?v=1.10.0';
import { preprocess, rotateCanvas, resizeForOcr, needsRetake, releasePhotoSource } from './image.js?v=1.10.0';
import {menuReadCanvases,mapMenuItems} from './menu-image.js?v=1.10.0';
import { extractIngredients, sourceTranscript } from './ingredients.js?v=1.10.0';
import {createManagedWorker} from './ocr-worker.js?v=1.10.0';
import {readMenuPhoto} from './menu-ocr.js?v=1.10.0';
import {analyzeNativeProducts} from './native-ocr.js?v=1.10.0';

const PRIMARY = {id: 'korean', langs: ['kor','eng','fra'], label: 'Korean / English / French'};
const FALLBACKS = [
  {id: 'arabic', langs: ['fas','ara'], hint: /\b(?:PER|ARB|Persian|Farsi|Arabic)\b/iu},
  {id: 'cyrillic', langs: ['rus'], hint: /\b(?:RUS|Russian)\b|\bRU\s*[:：]|\[\s*RU\s*\]/iu},
  {id: 'cjk', langs: ['chi_sim','jpn'], hint: /\b(?:CHN|JPN|Chinese|Japanese)\b|\b(?:CN|JP)\s*[:：]|\[\s*(?:CN|JP)\s*\]/iu},
  {id: 'devanagari', langs: ['hin'], hint: /\b(?:HIN|Hindi)\b|\bHI\s*[:：]|\[\s*HI\s*\]/iu},
  {id: 'thai', langs: ['tha'], hint: /\b(?:THA|Thai)\b|\bTH\s*[:：]|\[\s*TH\s*\]/iu},
];
const EXTRA = {greek: ['ell'], tamil: ['tam'], telugu: ['tel']};

export function itemsFrom(result) {
  const data = result?.data || {};
  // Word confidence must stay attached to the actual word. A high-confidence
  // heading must not lend its score to a damaged allergen on another line.
  if (data.words?.length) {
    // Sparse OCR can emit each Korean syllable as a separate "line". Rebuild
    // physical rows from boxes so a suffix such as 대두 함유 keeps its context.
    // Large horizontal gaps remain separate, rather than joining menu columns.
    const visible=data.words.filter(w=>String(w.text||'').trim());
    const geometric=visible.length&&visible.every(w=>w.bbox&&Number.isFinite(w.bbox.x0)&&w.bbox.x1>w.bbox.x0&&w.bbox.y1>w.bbox.y0);
    if(geometric){
      const rows=[];
      for(const word of [...visible].sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1))){
        const b=word.bbox,h=b.y1-b.y0,cy=(b.y0+b.y1)/2;
        let row=rows.filter(r=>Math.min(r.y1,b.y1)-Math.max(r.y0,b.y0)>=Math.min(h,r.height)*.5&&Math.abs(cy-r.cy)<=Math.max(h,r.height)*.55)
          .sort((a,b)=>Math.abs(a.cy-cy)-Math.abs(b.cy-cy))[0];
        if(!row){row={words:[],y0:b.y0,y1:b.y1,height:h,cy};rows.push(row)}
        row.words.push(word);
      }
      const items=[];let lineId=0;
      for(const row of rows.sort((a,b)=>a.y0-b.y0)){
        let previous;
        const heights=row.words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b),height=heights[Math.floor(heights.length/2)];
        for(const word of row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)){
          if(previous&&word.bbox.x0-previous.bbox.x1>Math.max(60,height*3))lineId++;
          const confidence=Number(word.confidence);
          items.push({text:String(word.text||''),score:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence/100)):0,lineId,box:word.bbox});
          previous=word;
        }
        lineId++;
      }
      return items;
    }
    let lineId = 0, previous;
    return data.words.map(word => {
      const box = word.bbox;
      // Tesseract exposes word.line in some output formats. Prefer explicit
      // line bounds/IDs and horizontal wrap over approximate y alone.
      const key=w=>w.line?.bbox ? JSON.stringify(w.line.bbox)
        : w.line_num!=null ? `${w.block_num}:${w.par_num}:${w.line_num}` : null;
      if (previous && (key(word)!=null && key(previous)!=null ? key(word)!==key(previous)
        : !box || !previous.bbox || box.x0<previous.bbox.x0 || Math.abs(box.y0-previous.bbox.y0)>Math.max(3,(box.y1-box.y0)*.5))) lineId++;
      previous = word;
      const confidence=Number(word.confidence);
      return {text: String(word.text || ''), score: Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence/100)):0, lineId, box: box || null};
    });
  }
  // Text without word-level confidence remains unresolved, never high confidence.
  return [{text: String(data.text || ''), score: 0}];
}

function sourceQuality(source) {
  const items = source.items.filter(x => x.text.trim());
  const chars = items.reduce((sum,x) => sum+x.text.length,0);
  return items.reduce((sum,x) => sum+x.score*x.text.length,0) / Math.max(1,chars) * Math.min(1,chars/40);
}

function hasPanel(source) {
  const text=sourceTranscript(source).text;
  const chars=source.items.reduce((sum,x)=>sum+x.text.trim().length,0);
  const mean=source.items.reduce((sum,x)=>sum+x.score*x.text.trim().length,0)/Math.max(1,chars);
  return chars>=6 && mean>=.55 && (containsAny(text,MARKERS.ingredient_headings) || containsAny(text,MARKERS.direct_markers) || containsAny(text,MARKERS.caution_markers));
}
function selectCandidates(candidates) {
  const sorted=[...candidates].sort((a,b)=>sourceQuality(b)-sourceQuality(a));
  // Several directions can contain different panels. Preserve their context
  // without pretending rotations are independent OCR model families.
  const panels=sorted.filter(hasPanel).slice(0,2);
  // Preserve a nutrition reading for correct abstention/routing even when a
  // nonsensical rotation has a higher average confidence. It is not an
  // ingredient panel and cannot establish allergen absence.
  const nutrition=panels.length?[]:sorted.filter(s=>containsAny(sourceTranscript(s).text,MARKERS.nutrition_headings)).slice(0,1);
  return [...new Set([...panels,...nutrition,sorted[0]])].filter(Boolean);
}

export async function analyzeProducts(products, profile, options = {}) {
  const nativeReader=options.nativeReader===undefined?globalThis.ADPAI_NATIVE_OCR:options.nativeReader;
  if(nativeReader){
    const native=await analyzeNativeProducts(products,profile,{...options,nativeReader});
    const unread=native.products.map((product,index)=>({product,index})).filter(({product})=>!product.sources.some(source=>source.items.some(item=>item.score>0)));
    if(!unread.length)return native;
    // A missing/broken native model, including unsupported word confidence,
    // must not disable the existing local reader. Zero scores stay zero.
    // Preserve its failures; the fallback is still on-device and fail-closed.
    const fallback=await analyzeProducts(unread.map(({index})=>products[index]),profile,{...options,nativeReader:null});
    for(const [position,{product,index}] of unread.entries()){
      const value=fallback.products[position];
      native.products[index]={...value,label:`Product ${index+1}`,sources:[...product.sources,...value.sources],errors:[...product.errors,...value.errors]};
    }
    return native;
  }
  const menuMode=options.purpose==='menu';
  const maxPhotoMs=options.maxPhotoMs??65000;
  const {onProgress = () => {}, createWorker = globalThis.ADPAI_CREATE_OCR_WORKER||createManagedWorker, prepare = preprocess, rotate = rotateCanvas} = options;
  const states = products.map(product => ({product:{...product,photos:[...product.photos]}, sources: [], familyStatus: {}, errors: []}));
  async function run(def, jobs) {
    let worker;
    const openWorker=()=>createWorker(def.langs,1,{...globalThis.ADPAI_OCR_OPTIONS?.(def),logger:()=>{}});
    onProgress(`Reading ${def.label || def.id}…`);
    try {
      worker = await openWorker();
      for (const state of jobs) {
        let complete = true;
        for (let photoIndex=0; photoIndex<state.product.photos.length; photoIndex++) {
          // The timed-out worker has already been terminated. A bad front
          // photo must not disable the back label or every later product.
          // A failed reinitialization escapes to the outer failure handler;
          // access/model-load failures are not retried indefinitely.
          if(worker.closed)worker=await openWorker();
          const photo = state.product.photos[photoIndex];
          let photoCanvas;
          try {
            const photoStarted=Date.now();
            const canvas=photoCanvas=await prepare(photo.file,false,{preserveOriginal:true});
            let enhancedCanvas;const enhancedLanguages=new Set();
            if(menuMode&&def.id===PRIMARY.id&&worker.reinitialize){
              const menu=await readMenuPhoto({worker,canvas,photoIndex,familyId:def.id,rotate,itemsFrom,maxPhotoMs});
              state.sources.push(...menu.sources);state.errors.push(...menu.errors);complete=complete&&menu.complete;
              continue;
            }
            const passes=def.id===PRIMARY.id&&worker.reinitialize
              ? [{langs:['kor'],psm:'6',canvas:resizeForOcr(canvas,1000),variant:'reduced'},
                 {langs:['eng'],psm:'11',canvas:resizeForOcr(canvas,1600),variant:'reduced'},
                 ...(!menuMode&&canvas.ocrOriginal&&Math.max(canvas.ocrOriginal.naturalWidth,canvas.ocrOriginal.naturalHeight)>2400
                  ?menuReadCanvases(canvas).filter(v=>v.variant.startsWith('menu-detail-')).map(view=>({langs:['kor','eng'],psm:'11',view,variant:'original-region'})):[]),
                 {langs:PRIMARY.langs,psm:'3',canvas,variant:'original'}]
              : [{langs:def.langs,psm:menuMode?'11':'3',canvas,variant:'original'}];
            const satisfied=()=>{
              const p=evaluateProduct({sources:state.sources,profile});
              const hits=[...p.direct_matches,...p.caution_matches];
              return !menuMode&&((profile.allergens||[]).length||(profile.custom_avoid||[]).length)
                &&(profile.allergens||[]).every(id=>hits.some(h=>h.allergen_id===id))
                &&(profile.custom_avoid||[]).every(term=>hits.some(h=>h.allergen_id==='custom'&&h.term.toLowerCase()===term.toLowerCase()));
            };
            for(const pass of passes){
              if(satisfied())break;
              if(worker.closed||Date.now()-photoStarted>=maxPhotoMs){complete=false;break}
              if(worker.reinitialize)await worker.reinitialize(pass.langs,1);
              if(worker.setParameters)await worker.setParameters({tessedit_pageseg_mode:pass.psm});
              const candidates=[];
              for(const rotation of pass.view?[0]:[0,90,270,180]){
                if(Date.now()-photoStarted>=maxPhotoMs){complete=false;state.errors.push({family:def.id,photoIndex,message:'OCR photo time budget reached'});break}
                try{
                  const r=await worker.recognize(rotate(pass.view?.canvas||pass.canvas,rotation),{timeoutMs:Math.max(1,maxPhotoMs-(Date.now()-photoStarted))});
                  const candidate={familyId:def.id,photoIndex,rotation,variant:pass.variant,model_languages:pass.langs,segmentation:pass.psm,frame:pass.view?.frame,items:pass.view?mapMenuItems(itemsFrom(r),pass.view.frame,rotation):itemsFrom(r)};
                  candidates.push(candidate);
                  // A real positive must not be discarded because unrelated
                  // words/rotations have a better average confidence.
                  const evidence=evaluateProduct({sources:[candidate],profile});
                  if(evidence.direct_matches.length||evidence.caution_matches.length)state.sources.push(candidate);
                  // Try actual normalized pixels early on a weak upright read.
                  // Waiting for all rotations used to exhaust the budget before
                  // a damaged label with no recognised heading could be helped.
                  const languageKey=pass.langs.join('+');
                  if(!menuMode&&!pass.view&&rotation===0&&def.id===PRIMARY.id&&pass.langs.length===1&&worker.reinitialize
                    &&!satisfied()&&sourceQuality(candidate)<.7&&!enhancedLanguages.has(languageKey)&&Date.now()-photoStarted<maxPhotoMs-1000){
                    enhancedLanguages.add(languageKey);
                    try{
                      enhancedCanvas??=await prepare(photo.file,true);
                      if(enhancedCanvas!==canvas){
                        const extra=await worker.recognize(enhancedCanvas,{timeoutMs:Math.max(1,maxPhotoMs-(Date.now()-photoStarted))});
                        const enhanced={...candidate,variant:'enhanced',items:itemsFrom(extra)};candidates.push(enhanced);
                        const e=evaluateProduct({sources:[enhanced],profile});
                        if(e.direct_matches.length||e.caution_matches.length)state.sources.push(enhanced);
                      }
                    }catch(error){complete=false;state.errors.push({family:def.id,photoIndex,phase:'enhanced',message:String(error?.message||error)})}
                  }
                  if(satisfied())break;
                  if(pass.view)break; // Region crops use upright coordinates.
                }catch(error){
                  complete=false;state.errors.push({family:def.id,photoIndex,rotation,phase:pass.variant,message:String(error?.message||error)});
                  if(worker.closed||/OCR timeout|OCR worker is closed/u.test(String(error?.message||error)))break;
                }
              }
              const selected=menuMode?[...candidates].sort((a,b)=>sourceQuality(b)-sourceQuality(a)).slice(0,1):selectCandidates(candidates);
              pass.view?.release?.();
              for(const source of selected)if(!state.sources.includes(source))state.sources.push(source);
              if(satisfied())break;
            }
            const relevant=state.sources.filter(source=>source.photoIndex===photoIndex&&source.familyId===def.id);
            const best=relevant.find(hasPanel);
            const unresolved=evaluateProduct({sources:relevant,profile}).mention_matches.some(hit=>hit.score>=.45);
            if(!menuMode&&!satisfied()&&def.id===PRIMARY.id&&!worker.closed&&worker.reinitialize&&best&&unresolved&&Date.now()-photoStarted<maxPhotoMs-8000){
              try{
                await worker.reinitialize(PRIMARY.langs,1);await worker.setParameters({tessedit_pageseg_mode:'3'});
                const enhanced=await prepare(photo.file,true);
                const r=await worker.recognize(rotate(enhanced,best.rotation),{timeoutMs:Math.max(1,maxPhotoMs-(Date.now()-photoStarted))});
                state.sources.push({familyId:def.id,photoIndex,rotation:best.rotation,variant:'enhanced',model_languages:PRIMARY.langs,segmentation:'3',items:itemsFrom(r)});
              }catch(error){complete=false;state.errors.push({family:def.id,photoIndex,phase:'enhanced',message:String(error?.message||error)})}
            }

          } catch (error) {
            complete = false;
            state.errors.push({family: def.id, photoIndex, message: String(error?.message || error)});
          } finally {releasePhotoSource(photoCanvas)}
        }
        state.familyStatus[def.id] = {ok: complete, attempted: true};
      }
    } catch (error) {
      for (const state of jobs) {
        state.familyStatus[def.id] = {ok: false, attempted: true};
        state.errors.push({family: def.id, message: String(error?.message || error)});
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch {} }
    }
  }
  await run(PRIMARY,states);
  const textOf = state => state.sources.flatMap(s => s.items.map(x => x.text)).join(' ');
  const evaluate = state => evaluateProduct({sources: state.sources, profile, familyStatus: state.familyStatus, requiredFamilies: Object.keys(state.familyStatus)});
  const extras = customRequiredFamilies(profile.custom_avoid || []).map(id => ({id, langs: EXTRA[id]}));
  for (const def of menuMode?[]:[...FALLBACKS, ...extras]) {
    const jobs = states.filter(state => {
      const text=textOf(state);
      // An unreadable English/Korean label is not evidence of Arabic, Hindi,
      // Thai, etc. Avoid unrelated downloads; retain unverified + retake advice.
      return evaluate(state).status!=='conflict' && (extras.includes(def)||def.hint?.test(text));
    });
    if (jobs.length) await run(def,jobs);
  }
  const out = states.map((state,index) => {
    const result = evaluate(state);
    return {...result, product_id: state.product.id ?? index+1, label: `Product ${index+1}`,
      message: result.reason,
      ocr_families_used: [...new Set(state.sources.map(s => s.familyId === PRIMARY.id ? PRIMARY.label : (FALLBACKS.find(def => def.id === s.familyId)?.label || s.familyId)))],
      errors: state.errors, sources: state.sources,retake_recommended:needsRetake(state.sources), ingredients:extractIngredients(state.sources)};
  });
  return {status: 'ok', products: out, summary: {product_count: out.length}};
}
