
import { ONTOLOGY, NON_DAIRY_PHRASES } from "./ontology.js?v=1.5.0";

export const ALLERGENS = ONTOLOGY.allergens;
export const MARKERS = ONTOLOGY.label_markers;

export const FAMILY_GROUP = {
  latin: "latin",
  korean: "hangul",
  arabic: "arabic",
  cyrillic: "cyrillic",
  devanagari: "devanagari",
  cjk: "cjk",
  thai: "thai",
  greek: "greek",
  tamil: "tamil",
  telugu: "telugu",
};

export const REQUIRED_BASE_FAMILIES = [
  "latin", "korean", "arabic", "cyrillic",
  "devanagari", "cjk", "thai"
];

const SCRIPT_REGEX = {
  latin: /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/g,
  hangul: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g,
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,
  cyrillic: /[\u0400-\u052F]/g,
  devanagari: /[\u0900-\u097F]/g,
  cjk: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/g,
  thai: /[\u0E00-\u0E7F]/g,
  greek: /[\u0370-\u03FF]/g,
  tamil: /[\u0B80-\u0BFF]/g,
  telugu: /[\u0C00-\u0C7F]/g,
};

export function normalizeArabicPersian(s) {
  return String(s || "")
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ؤ/g, "و")
    .replace(/[ةۀ]/g, "ه")
    .replace(/[أإٱ]/g, "ا")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
}

export function fold(s) {
  let x = String(s || "").normalize("NFKC").toLowerCase();
  x = normalizeArabicPersian(x);
  x = x.normalize("NFKD").replace(/\p{M}/gu, "");
  return x.replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

export function compact(s) {
  return fold(s).replace(/[\s\u200b\u200c\u200d]+/g, "");
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordScript(term) {
  return /[a-z\u0370-\u03ff\u0400-\u052f\u0900-\u097f]/i.test(fold(term));
}

export function containsTerm(text, term) {
  const q = fold(term);
  const txt = fold(text);
  if (!q) return false;
  if (isWordScript(q)) {
    const r = new RegExp(
      "(?:^|[^\\p{L}\\p{N}_])" + esc(q) + "(?:$|[^\\p{L}\\p{N}_])",
      "iu"
    );
    return r.test(txt);
  }
  return compact(txt).includes(compact(q));
}

export function containsAny(text, terms) {
  return (terms || []).some((x) => containsTerm(text, x));
}

export function scriptCount(text, group) {
  const re = SCRIPT_REGEX[group];
  if (!re) return 0;
  return (String(text || "").match(re) || []).length;
}

function lineScore(line) {
  const n = Number(line?.score);
  return Number.isFinite(n) ? n : 0;
}

function sourceText(source) {
  return (source?.items || []).map((x) => x.text || "").join("\n");
}

function sourceMeanScore(source) {
  const lines = (source?.items || []).filter((x) => String(x.text || "").trim());
  if (!lines.length) return 0;
  let num = 0, den = 0;
  for (const line of lines) {
    const w = Math.max(1, String(line.text || "").trim().length);
    num += lineScore(line) * w;
    den += w;
  }
  return den ? num / den : 0;
}

export function sourceEvidence(source) {
  const text = sourceText(source);
  const ingredient = containsAny(text, MARKERS.ingredient_headings);
  const declaration = containsAny(text, [
    ...(MARKERS.direct_markers || []),
    ...(MARKERS.caution_markers || []),
  ]);
  const nutrition = containsAny(text, MARKERS.nutrition_headings);
  const meanScore = sourceMeanScore(source);
  const group = FAMILY_GROUP[source.familyId] || source.group || "";
  const scriptChars = scriptCount(text, group);
  return {
    text,
    ingredient,
    declaration,
    nutrition,
    meanScore,
    scriptChars,
    chars: compact(text).length,
  };
}

function allAliases(id) {
  const out = [];
  const item = ALLERGENS[id];
  if (!item) return out;
  for (const [lng, arr] of Object.entries(item.aliases || {})) {
    for (const alias of arr || []) out.push([lng, alias]);
  }
  return out;
}

// Match each occurrence in its own declaration/ingredient scope. Keep offsets so
// confidence belongs to the line containing the term, never an adjacent line.
export function matchSpans(text, term) {
  const q = fold(term);
  if (!q) return [];
  const pattern = esc(q).replace(/ /g, "\\s+");
  const boundary = isWordScript(q) || ['밀','깨','게'].map(fold).includes(q);
  const re = new RegExp(boundary ? "(?<![\\p{L}\\p{N}_])" + pattern + "(?![\\p{L}\\p{N}_])" : pattern, "gu");
  return [...text.matchAll(re)].map(m => ({start: m.index, end: m.index + m[0].length}));
}

const STOP_HEADINGS = [...MARKERS.nutrition_headings, "storage", "best before", "customer service", "barcode", "보관방법", "고객상담실", "保存方法", "保管方法"];
const SUFFIX_CAUTION = new RegExp(["혼입가능", "혼입 가능", "함유가능", "함유 가능", "같은 제조시설", "동일 제조시설", "含む可能性", "同一工場", "可能含有"].map(fold).map(esc).join('|'), 'u');
const SUFFIX_DIRECT = new RegExp(["함유", "含有", "含む"].map(fold).map(esc).join('|'), 'u');

function contextEvents(text) {
  const groups = [["direct", MARKERS.ingredient_headings], ["direct", MARKERS.direct_markers], ["caution", MARKERS.caution_markers], ["mention", STOP_HEADINGS]];
  const events = groups.flatMap(([kind, terms]) => terms.flatMap(term => matchSpans(text, term).map(span => ({...span, kind}))));
  // "contains" inside "may contain" and overlapping multilingual markers must
  // not turn a precautionary declaration into a direct declaration.
  return events.filter(e => !events.some(other => other !== e && other.start <= e.start && other.end >= e.end && (other.end - other.start > e.end - e.start || other.kind === "caution" && e.kind !== "caution")))
    .sort((a,b) => a.start-b.start);
}

function occurrenceKind(text, span, events) {
  const lineStart = text.lastIndexOf("\n", span.start) + 1;
  const nextLine = text.indexOf("\n", span.end);
  const lineEnd = nextLine < 0 ? text.length : nextLine;
  const line = text.slice(lineStart, lineEnd);
  // A negative claim is unresolved evidence, never a positive ingredient or a
  // certificate of absence. Separate later positive occurrences still count.
  if (/\b(?:no|without|free from|sans|sin)\s+[^,;:.]*$/u.test(text.slice(lineStart, span.start)) || /^(?:[- ]free|[- ]frei|\s+free)\b/u.test(text.slice(span.end))) return "mention";
  const before = events.filter(e => e.start <= span.start);
  const current = before.at(-1);
  let kind = current && !/[.;!?。；]/u.test(text.slice(current.end, span.start)) ? current.kind : "mention";
  const lineHasDirect = events.some(e => e.kind === "direct" && e.start >= lineStart && e.start <= span.start);
  // Korean/Japanese declarations often put the marker after an allergen list.
  if (!lineHasDirect && SUFFIX_CAUTION.test(line)) kind = "caution";
  else if (kind === "mention" && SUFFIX_DIRECT.test(line) && !SUFFIX_CAUTION.test(line)) kind = "direct";
  return kind;
}

function maskNonDairy(text) {
  let out = text;
  for (const phrase of NON_DAIRY_PHRASES) {
    for (const span of matchSpans(out, phrase)) out = out.slice(0, span.start) + " ".repeat(span.end-span.start) + out.slice(span.end);
  }
  return out;
}

function aggregateEvidence(sources, profile, learnedTexts = []) {
  const hits = [];
  const inputs = [...sources, ...learnedTexts.map(text => ({familyId: "learned-correction", learned: true, items: [{text, score: 1}]}))];
  for (const source of inputs) {
    const lines = source.items || [];
    const normalized = lines.map(line => fold(line.text));
    const text = normalized.map((line,index) => (index ? lines[index].lineId != null && lines[index].lineId === lines[index-1].lineId ? ' ' : '\n' : '') + line).join('');
    const events = contextEvents(text);
    const milkText = maskNonDairy(text);
    const terms = (profile.allergens || []).flatMap(id => allAliases(id).map(([language, alias]) => ({id, language, alias, label: ALLERGENS[id].label})))
      .concat((profile.custom_avoid || []).filter(x => String(x).trim()).map(alias => ({id: "custom", language: "user", alias, label: "Custom avoid"})));
    for (const {id, language, alias, label} of terms) {
      const search = id === "milk" ? milkText : text;
      for (const span of matchSpans(search, alias)) {
        let offset = 0, index = 0;
        while (index < normalized.length-1 && offset + normalized[index].length < span.start) offset += normalized[index++].length + 1;
        let kind = occurrenceKind(text, span, events);
        if (source.learned && kind === "mention") kind = "direct";
        hits.push({kind, allergen_id: id, allergen: label, term: alias, language,
          score: lineScore(lines[index]), family: source.familyId, photoIndex: source.photoIndex,
          text: lines[index]?.text || "", learned: !!source.learned});
      }
    }
  }
  return hits;
}

function strongEvidence(hits, kind) {
  const relevant = hits.filter((x) => x.kind === kind);
  const byAllergen = new Map();

  for (const h of relevant) {
    const key = h.allergen_id === "custom" ? `custom:${fold(h.term)}` : h.allergen_id;
    if (!byAllergen.has(key)) byAllergen.set(key, []);
    byAllergen.get(key).push(h);
  }

  const out = [];
  for (const arr of byAllergen.values()) {
    const learned = arr.find((x) => x.learned);
    if (learned) {
      out.push(learned);
      continue;
    }
    const high = arr.find((x) => x.score >= 0.58);
    if (high) {
      out.push(high);
      continue;
    }
    const independent = new Set(arr.filter((x) => x.score >= 0.45).map((x) => x.family));
    if (independent.size >= 2) {
      out.push([...arr].sort((a, b) => b.score - a.score)[0]);
    }
  }
  return out;
}

function panelHints(text) {
  const hints = new Set();
  if (/\bPER\b/.test(text) || /\bPERSIAN\b/i.test(text) || /\bFARSI\b/i.test(text)) hints.add("arabic");
  if (/\bARB\b/.test(text) || /\bARABIC\b/i.test(text)) hints.add("arabic");
  if (/\bRU\b/.test(text) || /\bRUSSIAN\b/i.test(text)) hints.add("cyrillic");
  if (/\bKOR\b/.test(text) || /\bKOREAN\b/i.test(text)) hints.add("hangul");
  if (/\bJPN\b/.test(text) || /\bJAPANESE\b/i.test(text)) hints.add("cjk");
  if (/\bCHN\b/.test(text) || /\bCHINESE\b/i.test(text)) hints.add("cjk");
  return hints;
}

function coverageGate(sources, familyStatus, requiredFamilies) {
  const failures = [];
  for (const id of requiredFamilies) {
    const st = familyStatus[id];
    if (!st || !st.ok) failures.push(id);
  }

  const evs = (sources || []).map((s) => ({ source: s, ev: sourceEvidence(s) }));
  const fullText = evs.map((x) => x.ev.text).join("\n");
  const hints = panelHints(fullText);

  const groups = new Map();
  for (const { source, ev } of evs) {
    const g = FAMILY_GROUP[source.familyId] || "";
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(ev);
  }

  const significantGroups = new Set();
  const verifiedGroups = new Set();

  for (const [group, list] of groups.entries()) {
    const significant = list.some(
      (x) => x.scriptChars >= 10 && x.meanScore >= 0.50 && x.chars >= 20
    );
    const verified = list.some(
      (x) =>
        (x.ingredient || x.declaration) &&
        x.meanScore >= 0.60 &&
        x.chars >= 24
    );
    if (significant) significantGroups.add(group);
    if (verified) verifiedGroups.add(group);
  }

  // Explicit language-panel hints also force verification.
  for (const h of hints) significantGroups.add(h);

  const unverifiedGroups = [...significantGroups].filter((g) => !verifiedGroups.has(g));
  const anyVerifiedIngredient = evs.some(
    ({ ev }) => ev.ingredient && ev.meanScore >= 0.62 && ev.chars >= 28
  );
  const anyVerifiedDeclaration = evs.some(
    ({ ev }) => ev.declaration && ev.meanScore >= 0.62 && ev.chars >= 16
  );

  const complete = false; // No current OCR adapter can establish complete panel coverage.

  return {
    complete,
    failures,
    panel_completeness_verified: false,
    significantGroups: [...significantGroups],
    verifiedGroups: [...verifiedGroups],
    unverifiedGroups,
    anyVerifiedIngredient,
    anyVerifiedDeclaration,
  };
}

export function evaluateProduct({
  sources = [],
  profile = {},
  familyStatus = {},
  requiredFamilies = REQUIRED_BASE_FAMILIES,
  learnedTexts = [],
}) {
  const hits = aggregateEvidence(sources, profile, learnedTexts);

  const direct = strongEvidence(hits, "direct");
  const caution = strongEvidence(hits, "caution").filter(
    (x) => !direct.some((d) => d.allergen_id === x.allergen_id &&
      (x.allergen_id !== "custom" || fold(d.term) === fold(x.term)))
  );

  // Weak direct/caution hits must survive as unresolved evidence as well.
  const mentions = hits.filter(x => x.kind === "mention" ||
    ![...direct, ...caution].some(h => h.allergen_id === x.allergen_id &&
      (h.allergen_id !== "custom" || fold(h.term) === fold(x.term))));

  const coverage = coverageGate(sources, familyStatus, requiredFamilies);

  if (direct.length) {
    return {
      status: "conflict",
      direct_matches: direct,
      caution_matches: caution,
      mention_matches: mentions,
      coverage,
      reason: "A selected allergen was found in a verified ingredient/direct-declaration context.",
    };
  }

  if (caution.length) {
    return {
      status: "caution",
      direct_matches: [],
      caution_matches: caution,
      mention_matches: mentions,
      coverage,
      reason: "A selected allergen was found in a precautionary cross-contact statement.",
    };
  }

  if (mentions.length) {
    return {
      status: "unverified",
      direct_matches: [],
      caution_matches: [],
      mention_matches: mentions,
      coverage,
      reason: "A selected term was recognized outside a sufficiently verified ingredient/declaration context.",
    };
  }

  if (!coverage.complete) {
    return {
      status: "unverified",
      direct_matches: [],
      caution_matches: [],
      mention_matches: [],
      coverage,
      reason: "Complete ingredient-panel coverage is not verified. Do not interpret this as absence of allergens.",
    };
  }

  // Defensive default, even if coverage policy changes later.
  return {status: "unverified", direct_matches: [], caution_matches: [], mention_matches: mentions, coverage,
    reason: "Complete ingredient-panel coverage is not verified."};
}

export function customRequiredFamilies(customTerms = []) {
  const out = new Set();
  for (const term of customTerms) {
    const s = String(term || "");
    if (/[\u0370-\u03FF]/.test(s)) out.add("greek");
    if (/[\u0B80-\u0BFF]/.test(s)) out.add("tamil");
    if (/[\u0C00-\u0C7F]/.test(s)) out.add("telugu");
  }
  return [...out];
}
