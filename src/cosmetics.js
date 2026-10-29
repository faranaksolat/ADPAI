import {COSMETIC_GLOSSARY,COSMETIC_CATALOG_META} from './cosmetic-glossary.js?v=1.11.0';
import {sourceTranscript} from './ingredients.js?v=1.11.0';
import {labelPattern} from './label-pattern.js?v=1.11.0';

// Exact normalized identities. No edit-distance correction, family inference,
// substring matches (e.g. SLS vs SLES), or source/safety inference from an acid.
export const normalizeCosmetic=value=>String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu,'').replace(/[‐‑–]/gu,'-');
const byName=new Map();
for(const entry of COSMETIC_GLOSSARY)for(const alias of entry.aliases){
 const key=normalizeCosmetic(alias);if(byName.has(key)&&byName.get(key).id!==entry.id)throw Error('Conflicting cosmetic alias: '+alias);byName.set(key,entry);
}
export const lookupCosmetic=name=>byName.get(normalizeCosmetic(name))||null;
const headings=['full ingredient list','all ingredients','ingredients','inactive ingredients','active ingredients','전성분','전체성분','유효성분','기타첨가제'].map(x=>labelPattern(x)).join('|');
const headingPattern=new RegExp(`(?:^|\\n)[ \\t]*(?:${headings})[ \\t]*(?:[:：]|(?=\\r?\\n|$))`,'gimu');
const stop=new RegExp(`(?:^|\\n)[ \\t]*(?:directions|how to use|warnings?|cautions?|${['사용방법','사용할 때의 주의사항','사용시 주의사항','주의사항','제조업자','제조번호','화장품책임판매업자'].map(x=>labelPattern(x)).join('|')})(?:[ \\t]*[:：]|[ \\t]*(?=\\r?\\n|$))`,'imu');
const optional=/(?:may\s+contain\s*(?:\(\s*\+\s*\/\s*-\s*\))?\s*[:：]?|\+\s*\/\s*-\s*[:：]?|±\s*[:：]?|포함될\s*수\s*있음\s*[:：]?)/iu;
function confidenceAt(spans,start,end){const scores=spans.filter(s=>s.end>start&&s.start<end&&s.end>s.start).map(s=>s.score);return scores.length?Math.min(...scores):0}
function pieces(text){
 const out=[];let depth=0,start=0;
 for(let i=0;i<text.length;i++){
  if('([{（［'.includes(text[i]))depth++;if(')]}）］'.includes(text[i]))depth=Math.max(0,depth-1);
  // A locant such as 1,2-Hexanediol is one ingredient, not two items.
  const locant=text[i]===','&&/\d/u.test(text[i-1]||'')&&/^\d+(?:,\d+)*-/u.test(text.slice(i+1));
  if(!depth&&!locant&&/[,;，；、]/u.test(text[i])){out.push({start,end:i});start=i+1}
 }
 out.push({start,end:text.length});return out;
}
export function evaluateCosmetics(sources,{avoid=[],coconut=false}={}){
 const rows=[],seen=new Set(),issues=[];let truncated=false;
 for(const [sourceIndex,source] of sources.entries()){
  const typed=source.input_origin==='typed',{text,spans}=sourceTranscript(source),bodyLimit=30000;
  if(text.length>bodyLimit)truncated=true;
  const limited=text.slice(0,bodyLimit),heads=[...limited.matchAll(headingPattern)];
  const sections=heads.length?heads.map((head,i)=>({start:head.index+head[0].length,end:heads[i+1]?.index??limited.length,
   context:typed||confidenceAt(spans,head.index,head.index+head[0].length)>=.65})):[{start:0,end:limited.length,context:false}];
  for(const section of sections){
   let body=limited.slice(section.start,section.end);const end=stop.exec(body);if(end)body=body.slice(0,end.index);
   const possible=optional.exec(body),parts=pieces(body);if(parts.length>180)truncated=true;
   for(const part of parts.slice(0,180)){
    const raw=body.slice(part.start,part.end),original=raw.trim().replace(/[.。]+$/u,'').trim();if(!original)continue;
    const lookup=original.replace(optional,'').replace(/\s+\d+(?:\.\d+)?\s*%$/u,'').trim(),entry=lookupCosmetic(lookup);
    const start=section.start+part.start+raw.indexOf(raw.trim()),score=typed?null:confidenceAt(spans,start,section.start+part.end);
    const uncertain=(!typed&&score<.65)||!section.context||!!(possible&&part.end>possible.index);
    const key=[source.photoIndex??sourceIndex,normalizeCosmetic(original),uncertain,section.context].join(':');if(seen.has(key))continue;seen.add(key);
    rows.push({original,entry,confidence:score,uncertain,reading_uncertain:!typed&&score<.65,ingredient_context:section.context,input_origin:typed?'typed':'ocr',
     photoIndex:source.photoIndex??sourceIndex,familyId:source.familyId,source_index:sourceIndex});
   }
  }
 }
 const selected=avoid.map(term=>({term,entry:lookupCosmetic(term)})),listed=[],review=[];
 for(const row of rows){
  const named=selected.filter(s=>s.entry&&row.entry?s.entry.id===row.entry.id:normalizeCosmetic(s.term)===normalizeCosmetic(row.original));
  if(coconut&&row.entry?.named_sources.includes('coconut'))named.push({term:'coconut'});
  for(const match of named)(row.uncertain?review:listed).push({original:row.original,term:match.term,kind:row.uncertain?'uncertain_read':'listed_name',photoIndex:row.photoIndex});
  if(coconut&&row.entry?.source_questions.includes('coconut'))review.push({original:row.original,term:'coconut',kind:row.uncertain?'uncertain_read':'source_needs_confirmation',photoIndex:row.photoIndex});
  if(row.entry?.inci==='Fragrance'&&(selected.length||coconut))review.push({original:row.original,term:'mixture',kind:'mixture_not_fully_named',photoIndex:row.photoIndex});
 }
 if(truncated)issues.push('input_truncated');if(!rows.length)issues.push('no_ingredient_text');if(rows.some(row=>!row.ingredient_context))issues.push('heading_not_verified');
 return {schema:'adpai-cosmetic-review-v1',status:listed.length?'listed_avoid':review.length?'review_needed':'unverified',rows,listed,review,issues,
  unknown:rows.filter(row=>!row.entry).map(row=>row.original),catalog:{...COSMETIC_CATALOG_META,entry_count:COSMETIC_GLOSSARY.length},
  complete_label_verified:false,clinical_allergy_assessment:false,safety_certified:false};
}
