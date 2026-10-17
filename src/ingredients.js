import { GLOSSARY } from './ingredient-glossary.js?v=1.6.0';
import { NON_DAIRY_PHRASES } from './ontology.js?v=1.6.0';

// Keep offsets in original OCR text. Folding before slicing would corrupt
// accented names and provenance. This module is display-only.
export function sourceTranscript(source) {
  let text='';
  const spans=[];
  for(const [index,item] of (source.items||[]).entries()) {
    if(index) text+=item.lineId!=null && item.lineId===source.items[index-1].lineId?' ':'\n';
    const start=text.length;
    text+=String(item.text||'');
    spans.push({start,end:text.length,score:Number(item.score)||0});
  }
  return {text,spans};
}
const HEADING=/(?:^|\n)[ \t]*(?:ingredients|ingrédients|원재료(?:명)?(?:\s*및\s*함량)?|원료명)[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?|(?<![\p{L}\p{N}])(?:ingredients?|ingrédients?|원재료(?:명)?(?:\s*및\s*함량)?|원료명)[ \t]*[:：][ \t]*/giu;
const STOP=/(?:\b(?:allergen(?:\s+statement)?|contains?|may\s+contain|nutrition(?:al)?|storage|store\s+in|best\s+before|manufactured|distributed|contient|peut\s+contenir|conservation)\b|알레르기|영양정보|보관방법|소비기한|유통기한|제조원)/iu;
function scoreIn(spans,start,end) {
  const scores=spans.filter(s=>s.end>start && s.start<end).map(s=>s.score);
  return scores.length?Math.min(...scores):0;
}
function splitIngredients(text) {
  const parts=[];
  let depth=0,start=0;
  for(let i=0;i<text.length;i++) {
    if('([{（［'.includes(text[i])) depth++;
    if(')]}）］'.includes(text[i])) depth=Math.max(0,depth-1);
    if(depth===0 && /[,;，；、]/u.test(text[i])) {parts.push({start,end:i});start=i+1;}
  }
  parts.push({start,end:text.length});
  return parts;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const nonDairyPattern=new RegExp(`(?<![\\p{L}\\p{N}])(?:${NON_DAIRY_PHRASES.map(escape).join('|')})(?![\\p{L}\\p{N}])`,'giu');
const aliases=GLOSSARY.flatMap(entry=>entry.aliases.map(alias=>({entry,alias,
  pattern:new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias).replace(/ /g,'\\s+')}(?![\\p{L}\\p{N}])`,'giu')})))
  .sort((a,b)=>b.alias.length-a.alias.length);

export function explainIngredient(original,language='en') {
  const occupied=[],notes=[],seen=new Set();
  const nonDairy=[...original.matchAll(nonDairyPattern)].map(m=>({start:m.index,end:m.index+m[0].length}));
  for(const {entry,pattern} of aliases) {
    for(const match of original.matchAll(pattern)) {
      const start=match.index,end=start+match[0].length;
      // A code's subtype may not be guessed from its group, nor vice versa.
      if(/^E\d+$/iu.test(match[0]) && /^\s*\([a-z0-9]+\)/iu.test(original.slice(end))) continue;
      if(occupied.some(s=>start<s.end && end>s.start)) continue;
      if(['milk','milk-powder'].includes(entry.id) && nonDairy.some(s=>start<s.end && end>s.start)) continue;
      if(/(?:\b(?:no|without|sans|free\s+from)\s+|무)$/iu.test(original.slice(0,start)) || /^[- ]free\b/iu.test(original.slice(end))) continue;
      occupied.push({start,end});
      if(!seen.has(entry.id)) {notes.push({id:entry.id,term:match[0],text:entry[language]||entry.en});seen.add(entry.id);}
    }
  }
  return notes;
}

export function extractIngredients(sources) {
  const rows=new Map();
  for(const source of sources) {
    const {text,spans}=sourceTranscript(source);
    for(const heading of text.matchAll(HEADING)) {
      if(scoreIn(spans,heading.index,heading.index+heading[0].length)<.65) continue;
      const start=heading.index+heading[0].length;
      let body=text.slice(start,start+2200);
      const stop=STOP.exec(body);
      if(stop) body=body.slice(0,stop.index);
      // Korean precautions put the marker at the end of the line. Exclude
      // that entire warning line from the ingredient list.
      const warning=/(?:^|\n)[^\n]*(?:혼입\s*가능|같은\s*(?:제조\s*)?시설|공용\s*설비)[^\n]*/u.exec(body);
      if(warning) body=body.slice(0,warning.index);
      for(const part of splitIngredients(body).slice(0,80)) {
        const raw=body.slice(part.start,part.end);
        const original=raw.trim().replace(/[.。]+$/u,'').trim();
        if(!original || !/\p{L}/u.test(original)) continue;
        const offset=part.start+raw.indexOf(raw.trim());
        const confidence=scoreIn(spans,start+offset,start+part.end);
        const key=original.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ');
        const row={original,confidence,uncertain:confidence<.65,
          photoIndex:source.photoIndex,familyId:source.familyId,rotation:source.rotation,variant:source.variant||'original'};
        if(!rows.has(key) || rows.get(key).confidence<confidence) rows.set(key,row);
      }
    }
  }
  return [...rows.values()];
}
