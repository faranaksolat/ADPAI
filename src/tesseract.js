import { evaluateProduct, containsAny, MARKERS, customRequiredFamilies } from './engine.js?v=1.4.0';
import { preprocess, rotateCanvas } from './image.js?v=1.4.0';

const PRIMARY = {id: 'korean', langs: ['kor','eng','fra'], label: 'Korean / English / French'};
const FALLBACKS = [
  {id: 'arabic', langs: ['fas','ara'], hint: /\b(?:PER|ARB|Persian|Farsi|Arabic)\b/iu},
  {id: 'cyrillic', langs: ['rus'], hint: /\b(?:RU|Russian)\b/iu},
  {id: 'cjk', langs: ['chi_sim','jpn'], hint: /\b(?:CHN|CN|JPN|JP|Chinese|Japanese)\b/iu},
  {id: 'devanagari', langs: ['hin'], hint: /\b(?:HI|Hindi)\b/iu},
  {id: 'thai', langs: ['tha'], hint: /\b(?:TH|Thai)\b/iu},
];
const EXTRA = {greek: ['ell'], tamil: ['tam'], telugu: ['tel']};

function itemsFrom(result) {
  const data = result?.data || {};
  // Word confidence must stay attached to the actual word. A high-confidence
  // heading must not lend its score to a damaged allergen on another line.
  if (data.words?.length) {
    let lineId = 0, previous;
    return data.words.map(word => {
      const box = word.bbox;
      if (previous && (!box || !previous.bbox || Math.abs(box.y0-previous.bbox.y0) > Math.max(3,(box.y1-box.y0)*.5))) lineId++;
      previous = word;
      return {text: String(word.text || ''), score: Math.max(0, Math.min(1, Number(word.confidence || 0)/100)), lineId, box: box || null};
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

export async function analyzeProducts(products, profile, options = {}) {
  const {onProgress = () => {}, createWorker = (...args) => globalThis.Tesseract.createWorker(...args), prepare = preprocess, rotate = rotateCanvas} = options;
  const states = products.map(product => ({product:{...product,photos:[...product.photos]}, sources: [], familyStatus: {}, errors: []}));
  async function run(def, jobs) {
    let worker;
    onProgress(`Reading ${def.label || def.id}…`);
    try {
      worker = await createWorker(def.langs, 1, {logger: () => {}});
      for (const state of jobs) {
        let complete = true;
        for (let photoIndex=0; photoIndex<state.product.photos.length; photoIndex++) {
          const photo = state.product.photos[photoIndex];
          try {
            const canvas = await prepare(photo.file);
            const candidates = [];
            // Orientations belong to a photo, never to the entire product.
            for (const rotation of [0,90,270,180]) {
              const result = await worker.recognize(rotate(canvas,rotation));
              candidates.push({familyId: def.id, photoIndex, rotation, items: itemsFrom(result)});
            }
            candidates.sort((a,b) => sourceQuality(b)-sourceQuality(a));
            state.sources.push(candidates[0]);
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
    const jobs = states.filter(state => evaluate(state).status !== 'conflict' &&
      (extras.includes(def) || def.hint?.test(textOf(state)) || !containsAny(textOf(state),MARKERS.ingredient_headings)));
    if (jobs.length) await run(def,jobs);
  }
  const out = states.map((state,index) => {
    const result = evaluate(state);
    return {...result, product_id: state.product.id ?? index+1, label: `Product ${index+1}`,
      message: result.reason,
      ocr_families_used: [...new Set(state.sources.map(s => s.familyId === PRIMARY.id ? PRIMARY.label : (FALLBACKS.find(def => def.id === s.familyId)?.label || s.familyId)))],
      errors: state.errors, sources: state.sources};
  });
  return {status: 'ok', products: out, summary: {product_count: out.length}};
}
