// A numeric answer requires an explicit package mass and a compatible energy
// basis, or an unambiguous per-package energy declaration. Never infer package
// mass from a nearby nutrient/serving weight or merge unrelated OCR readings.
const NUMBER = '[0-9]+(?:[.,][0-9]+)*';
const ENERGY = '(?:kcal|킬로칼로리|千卡(?:路里)?|キロカロリー)';
const TOTAL_WEIGHT = '(?:[총종]\\s*내\\s*용\\s*[량양랑]|net\\s*(?:wt\\.?|weight)|total\\s*(?:content|weight)|poids\\s*net|peso\\s*neto|nettogewicht|peso\\s*liquido|peso\\s*líquido|وزن\\s*خالص|内容量|正味量|净含量|淨含量)';
const SERVING = /per\s*serving|per\s*portion|par\s*portion|1\s*회|serving\s*size/iu;

export function normalizeCalorieOCR(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/×/gu, 'x')
    .replace(/\bk\s*c\s*a\s*[l1i|!]\b/giu, 'kcal').replace(/\s+/gu, ' ').trim();
}

function numberOf(raw) {
  if (/^\d+,\d{1,2}$/u.test(raw)) return Number(raw.replace(',', '.'));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(raw)) return Number(raw.replaceAll(',', ''));
  if (/^\d+(?:\.\d+)?$/u.test(raw)) return Number(raw);
  return NaN; // Mixed/ambiguous locale formatting requires review.
}

function matches(text, pattern) {
  return [...text.matchAll(new RegExp(pattern, 'giu'))];
}

function unique(values) {
  return [...new Set(values.filter(Number.isFinite))];
}

function unknown(method = null) {
  return {package_kcal: null, basis: null, total_weight_g: null,
    reference_kcal: null, reference_g: null, method};
}

function packageWeight(text) {
  const multipacks = unique(matches(text, `(${NUMBER})\\s*g\\s*x\\s*(\\d+)\\s*(?:봉지|개|팩|packs?|pcs?|pieces?|sachets?|bars?|sticks?)`)
    .map(m => {
      const unit = numberOf(m[1]), count = Number(m[2]);
      return unit > 0 && count >= 2 && count <= 1000 ? Number((unit*count).toFixed(4)) : NaN;
    }));
  if (multipacks.length > 1) return {conflict: true};
  const multi = multipacks[0];
  const weights = matches(text, `${TOTAL_WEIGHT}\\s*[:：]?\\s*(${NUMBER})\\s*g(?![a-z])`).map(m => numberOf(m[1]));
  if (weights.some(v => !Number.isFinite(v) || v < .5 || v > 50000)) return {conflict: true};
  const resolved = [];
  for (const weight of weights) {
    if (multi == null || Math.abs(weight-multi) <= Math.max(3, multi*.02)) resolved.push(weight);
    else {
      // Preserve the known 8253 -> 253 recovery only with independent multipack
      // evidence. Reject other contradictions instead of silently choosing one.
      const candidates = unique([1,2,3].map(cut => String(weight).length-cut >= 2 ? Number(String(weight).slice(cut)) : NaN))
        .filter(v => v >= .5 && Math.abs(v-multi) <= Math.max(3, multi*.02));
      if (candidates.length !== 1) return {conflict: true};
      resolved.push(candidates[0]);
    }
  }
  const totals = unique(resolved);
  if (totals.length > 1) return {conflict: true};
  const value = totals[0] ?? multi;
  if (value != null && (value < .5 || value > 5000 && multi == null || value > 50000)) return {conflict: true};
  return {value, method: totals.length ? 'explicit_total_weight' : 'multipack_weight'};
}

export function extractCaloriesFromText(text) {
  const n = normalizeCalorieOCR(text);
  const weight = packageWeight(n);
  if (weight.conflict) return unknown('conflicting_or_implausible_weight');
  const refs = [];
  for (const [pattern, reverse] of [
    [`(?:per|pour|por|pro)\\s*(${NUMBER})\\s*g\\s*[:：]?\\s*(${NUMBER})\\s*${ENERGY}`, false],
    [`(${NUMBER})\\s*g\\s*(?:당|per|pour|por|pro)\\s*[:：]?\\s*(${NUMBER})\\s*${ENERGY}`, false],
    [`(${NUMBER})\\s*${ENERGY}\\s*(?:/|per|pour|por|pro)\\s*(${NUMBER})\\s*g`, true],
  ]) {
    for (const m of matches(n, pattern)) refs.push(reverse ? [numberOf(m[2]), numberOf(m[1])] : [numberOf(m[1]), numberOf(m[2])]);
  }
  const distinct = [...new Map(refs.map(pair => [JSON.stringify(pair), pair])).values()];
  if (distinct.some(([g,kcal]) => !Number.isFinite(g) || !Number.isFinite(kcal) || g < .5 || kcal <= 0 || kcal/g > 10)) return unknown('invalid_energy_basis');
  if (distinct.length > 1 && distinct.some(([g,k]) => Math.abs(k/g - distinct[0][1]/distinct[0][0]) > .01)) return unknown('conflicting_energy_basis');
  const [refG, refKcal] = distinct[0] || [];
  // "Total calories" by itself may describe one serving, not the whole pack.
  const explicit = unique(matches(n, `(?:energy\\s*per\\s*pack(?:age)?|(?:total\\s*)?package\\s*(?:energy|calories)|total\\s*package\\s*(?:energy|calories)|총\\s*(?:열량|칼로리)|总热量|總熱量)\\s*[:：]?\\s*(${NUMBER})\\s*${ENERGY}`)
    .map(m => SERVING.test(n.slice(Math.max(0,m.index-35),m.index+m[0].length+35)) ? NaN : numberOf(m[1])));
  if (explicit.length > 1) return unknown('conflicting_total_energy');
  const computed = weight.value != null && refG != null ? refKcal*weight.value/refG : null;
  if (explicit.length && computed != null && Math.abs(explicit[0]-computed) > Math.max(2, computed*.02)) return unknown('conflicting_total_energy');
  const value = explicit[0] ?? computed;
  if (value == null) return unknown();
  if (!(value > 0 && value <= 25000)) return unknown('rejected_implausible_energy');
  return {package_kcal: Math.round(value), total_weight_g: weight.value ?? null,
    reference_g: refG ?? null, reference_kcal: refKcal ?? null,
    basis: explicit.length ? `Label states package energy: ${value} kcal` : `Calculated from ${refKcal} kcal / ${refG} g × ${weight.value} g`,
    method: explicit.length ? 'explicit_total_energy' : `${weight.method}+direct_reference_pair`};
}

export function extractProductCalories(sources) {
  const results = (sources || []).filter(s => !s.error).map(s => extractCaloriesFromText((s.items || []).map(x => x.text || '').join('\n')));
  const values = results.filter(c => c.package_kcal != null);
  if (results.some(c => c.method?.startsWith('conflicting')) || unique(values.map(c => c.package_kcal)).length > 1) return unknown('conflicting_ocr_readings');
  return values[0] || unknown();
}
