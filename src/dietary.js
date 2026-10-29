import {fold, matchSpans} from './engine.js?v=1.10.1';

// Restaurant preferences only. These are lexical observations, not recipes,
// halal certification, a calibrated probability, or a completeness policy.
export const DIETARY_IDS = ['avoid_pork', 'avoid_beef', 'vegetarian'];
export function normalizeDietary(value) {
  return Array.isArray(value) ? DIETARY_IDS.filter(id => value.includes(id)) : [];
}

const TERMS = {
  pork: ['pork','porcine','lard','돼지고기','돈육','돈지','돼지기름','돼지뼈','삼겹살'],
  beef: ['beef','veal','bovine','소고기','쇠고기','우육','우지','소뼈','소기름'],
  poultry: ['chicken','turkey','duck','poultry','닭고기','계육','닭육수','칠면조','오리고기','오리육수'],
  other_meat: ['lamb','mutton','goat','venison','rabbit','양고기','염소고기','사슴고기','토끼고기'],
  fish: ['fish','seafood','anchovy','anchovies','tuna','salmon','shrimp','prawn','prawns','crab','oyster','oysters','clam','clams','mussel','mussels','squid','octopus','bonito','생선','멸치','참치','연어','새우','굴','조개','홍합','오징어','문어','가다랑어','가쓰오','액젓','어육','해산물'],
  animal: ['gelatin','gelatine','animal fat','tallow','젤라틴','동물성 지방','동물성지방'],
  meat: ['meat','bacon','ham','sausage','sausages','고기','베이컨','햄','소시지','소세지','육류'],
  unknown_source: ['broth','stock','bouillon','육수','스톡','rennet','레닛','렌넷','shortening','쇼트닝'],
};
const specific = new Set(['pork','beef','poultry','other_meat','fish']);
const sourcePrefix = /(?:pork|porcine|beef|veal|bovine|chicken|turkey|duck|fish|anchovy|bonito|lamb|mutton|vegetable|mushroom|kelp|seaweed|soy|돼지고기|돈육|소고기|쇠고기|닭고기|닭|멸치|가쓰오|야채|채소|버섯|다시마)(?:[-\s]*(?:based|bone|derived))?\s*$/iu;
const alternativePrefix = /(?:plant[-\s]*based|vegan|vegetarian|mock|imitation|meat[-\s]*free|meatless|soy[-\s]*based|vegetable|mushroom|kelp|seaweed|식물성|비건|채식|대체육|콩으로\s*만든|버섯|야채|채소|다시마)\s*(?:style\s+)?$/iu;
const deniedAlternative = /(?:(?:non[-\s]*|not\s+)(?:plant[-\s]*based|vegan|vegetarian|meat[-\s]*free|meatless)|비(?:채식|식물성))\s*$/iu;
const negativePrefix = /(?:\b(?:no|without|free\s+(?:from|of)|does\s+not\s+contain|not\s+contain)\s+(?:any\s+)?|미사용\s*)$/iu;
const negativeSuffix = /^(?:\s*[-–]?\s*free\b|\s*(?:가|이|은|는|을|를)?\s*(?:무첨가|미사용|불포함|없(?:음|는|습니다|이)))/iu;
const uncertainPrefix = /(?:\b(?:may\s+contain|might\s+contain|traces?\s+of|shared\s+(?:equipment|kitchen|facility))\b)[^;:.!?]*$/iu;
const uncertainSuffix = /^(?:\s*(?:[- ]flavou?red?|[- ]style)\b|\s*(?:맛|향|혼입\s*가능|함유\s*가능))/iu;

function scoreOf(word) {
  const value=word.score;
  return Number.isFinite(value)&&value>=0&&value<=1 ? value : 0;
}
function rowEvidence(words, preferences) {
  const clipped=words.some(word=>word.context_clipped===true);
  let offset=0;
  const parts=words.map(word=>{
    const text=fold(word.text),part={start:offset,end:offset+text.length,score:scoreOf(word)};
    offset+=text.length+1;return {...part,text};
  });
  const text=parts.map(part=>part.text).join(' '),observations=[];
  const rowMinimum=Math.min(1,...parts.map(part=>part.score));
  const candidates=[];
  for(const [category,aliases] of Object.entries(TERMS)) for(const term of aliases) {
    for(const span of matchSpans(text,term)) candidates.push({category,term,...span});
  }
  for(const hit of candidates) {
    // Generic 고기/stock must not turn an explicit species into a second,
    // unexplained pork/beef warning. Alternatives need their own local scope.
    if(!specific.has(hit.category)&&candidates.some(other=>specific.has(other.category)&&other.start<=hit.start&&other.end>=hit.end))continue;
    const prefix=text.slice(0,hit.start).normalize('NFC').split(/[,;:.!?]|\bbut\b|하지만|그러나/iu).at(-1);
    const fullPrefix=text.slice(0,hit.start).normalize('NFC');
    const suffix=text.slice(hit.end).normalize('NFC');
    const negative=negativePrefix.test(prefix)||negativeSuffix.test(suffix);
    const alternative=alternativePrefix.test(prefix)&&!deniedAlternative.test(prefix);
    const qualifiedSource=!specific.has(hit.category)&&sourcePrefix.test(prefix);
    if((negative||alternative||qualifiedSource)&&rowMinimum>=.58)continue;
    const touched=parts.filter(part=>part.end>hit.start&&part.start<hit.end);
    const score=touched.length?Math.min(...touched.map(part=>part.score)):0;
    const wordingUncertain=negative||alternative||qualifiedSource||uncertainPrefix.test(fullPrefix)||uncertainSuffix.test(suffix);
    for(const preference of preferences) {
      const target=preference==='avoid_pork'?'pork':preference==='avoid_beef'?'beef':null;
      if(target&&specific.has(hit.category)&&hit.category!==target)continue;
      const unknown=(target!==null&&!specific.has(hit.category))||hit.category==='unknown_source';
      const kind=clipped||score<.58||wordingUncertain||unknown?'uncertain':'conflict';
      observations.push({preference_id:preference,category:hit.category,term:hit.term,kind,score,
        uncertain:kind==='uncertain',reason:clipped?'clipped_context':score<.58?'weak_reading':wordingUncertain?'qualified_wording':unknown?'origin_unknown':'explicit_term'});
    }
  }
  return observations;
}

export function mergeDietary(...groups) {
  const merged=new Map();
  for(const hit of groups.flat()) {
    const key=[hit.preference_id,hit.category,fold(hit.term),hit.kind].join(':');
    if(!merged.has(key)||merged.get(key).score<hit.score)merged.set(key,{...hit});
  }
  return [...merged.values()];
}
export function dietaryEvidence(lines, value) {
  const preferences=normalizeDietary(value);
  if(!preferences.length)return [];
  return mergeDietary(...lines.map(line=>rowEvidence(line.words||[],preferences)));
}
export const dietaryConflict = hits => (hits||[]).some(hit=>hit.kind==='conflict');
