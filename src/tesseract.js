import { evaluateProduct, containsAny, MARKERS, customRequiredFamilies } from './engine.js?v=1.6.2';
import { preprocess, rotateCanvas } from './image.js?v=1.6.2';
import { extractIngredients, sourceTranscript } from './ingredients.js?v=1.6.2';

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
  const {onProgress = () => {}, createWorker = (...args) => globalThis.Tesseract.createWorker(...args), prepare = preprocess, rotate = rotateCanvas} = options;
  const states = products.map(product => ({product:{...product,photos:[...product.photos]}, sources: [], familyStatus: {}, errors: []}));
  async function run(def, jobs) {
    let worker;
    onProgress(`Reading ${def.label || def.id}…`);
    try {
      worker = await createWorker(def.langs, 1, {...globalThis.ADPAI_OCR_OPTIONS?.(def),logger: () => {}});
      for (const state of jobs) {
        let complete = true;
        for (let photoIndex=0; photoIndex<state.product.photos.length; photoIndex++) {
          const photo = state.product.photos[photoIndex];
          try {
            const canvas = await prepare(photo.file,false);
            const candidates = [];
            // Orientations belong to a photo, never to the entire product.
            for (const rotation of [0,90,270,180]) {
              try {
                const result = await worker.recognize(rotate(canvas,rotation));
                candidates.push({familyId: def.id, photoIndex, rotation, variant:'original', items: itemsFrom(result)});
              } catch(error) {
                complete=false;
                state.errors.push({family:def.id,photoIndex,rotation,message:String(error?.message||error)});
              }
            }
            const selected=selectCandidates(candidates);
            state.sources.push(...selected);
            if(def.id===PRIMARY.id && selected.length && !['conflict','caution'].includes(evaluateProduct({sources:state.sources,profile}).status)) {
              // One bounded contrast/upscale retry before downloading unrelated
              // language models. Never discard the original evidence.
              const best=selected.find(hasPanel)||selected[0];
              onProgress('Improving small label text…');
              try {
                const enhanced=await prepare(photo.file,true);
                const result=await worker.recognize(rotate(enhanced,best.rotation));
                state.sources.push({familyId:def.id,photoIndex,rotation:best.rotation,variant:'enhanced',items:itemsFrom(result)});
              } catch(error) {
                state.errors.push({family:def.id,photoIndex,phase:'enhanced',message:String(error?.message||error)});
              }
            }
          } catch (error) {
            complete = false;
            state.errors.push({family: def.id, photoIndex, message: String(error?.message || error)});
          }
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
  for (const def of [...FALLBACKS, ...extras]) {
    const jobs = states.filter(state => {
      const text=textOf(state),noIngredients=!containsAny(text,MARKERS.ingredient_headings);
      const nutritionOnly=noIngredients&&containsAny(text,MARKERS.nutrition_headings);
      return evaluate(state).status!=='conflict' && (extras.includes(def)||def.hint?.test(text)||noIngredients&&!nutritionOnly);
    });
    if (jobs.length) await run(def,jobs);
  }
  const out = states.map((state,index) => {
    const result = evaluate(state);
    return {...result, product_id: state.product.id ?? index+1, label: `Product ${index+1}`,
      message: result.reason,
      ocr_families_used: [...new Set(state.sources.map(s => s.familyId === PRIMARY.id ? PRIMARY.label : (FALLBACKS.find(def => def.id === s.familyId)?.label || s.familyId)))],
      errors: state.errors, sources: state.sources, ingredients:extractIngredients(state.sources)};
  });
  return {status: 'ok', products: out, summary: {product_count: out.length}};
}
