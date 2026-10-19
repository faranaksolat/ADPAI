import { evaluateProduct, containsAny, MARKERS, fold } from './engine.js?v=1.6.3';

// A menu's printed description is not a complete recipe or a safety certificate.
// Associate text only on one explicit line, or adjacent lines in one column.
const PRICE=/(?:[$€£₩]\s*\d[\d,.]*|\d[\d,.]*\s*원|\b\d{1,3}[.,]\d{2}\b)/u;
const DESCRIPTION=/^(?:ingredients?|contains?|with|served with|재료|원재료|포함 성분)\s*[:：]?/iu;
const CAUTION=/may\s+contain|shared\s+(?:equipment|kitchen|facility)|allerg(?:y|ies|ens?)|같은\s*(?:시설|주방)|교차\s*접촉|알레르기/iu;
const SECTION=/^(?:menu|메뉴|starters|mains|desserts|drinks|음료|디저트|ingredients?|contains?|재료|원재료|allergens?|알레르기)\s*[:：]?$/iu;

function linesFrom(source){
  const lines=[];
  for(const item of source.items||[]){
    const text=String(item.text||'').trim();if(!text)continue;
    let line=lines.at(-1),previous=line?.words.at(-1);
    const gap=item.box&&previous?.box?item.box.x0-previous.box.x1:0;
    const height=item.box?Math.max(1,item.box.y1-item.box.y0):0;
    if(!line||item.lineId==null||line.id!==item.lineId||gap>Math.max(60,height*4)){
      line={id:item.lineId,words:[]};lines.push(line);
    }
    line.words.push(item);
  }
  return lines.map(line=>{
    const boxes=line.words.map(w=>w.box).filter(Boolean);
    return {...line,text:line.words.map(w=>w.text).join(' '),
      box:boxes.length===line.words.length?{x0:Math.min(...boxes.map(b=>b.x0)),x1:Math.max(...boxes.map(b=>b.x1)),y0:Math.min(...boxes.map(b=>b.y0)),y1:Math.max(...boxes.map(b=>b.y1))}:null};
  });
}
function adjacent(a,b){
  if(!a?.box||!b?.box)return false;
  const h=Math.max(1,a.box.y1-a.box.y0,b.box.y1-b.box.y0);
  const gap=b.box.y0-a.box.y1;
  return gap>=-h*.3&&gap<=h*1.5&&Math.abs(a.box.x0-b.box.x0)<=h*2;
}
function matches(lines,profile){
  const result=evaluateProduct({sources:[{familyId:'korean',items:lines.flatMap((line,lineId)=>line.words.map(w=>({...w,lineId})))}],profile,requiredFamilies:[]});
  const found=new Map();
  for(const hit of [...result.direct_matches,...result.caution_matches,...result.mention_matches]){
    const key=hit.allergen_id==='custom'?'custom:'+fold(hit.term):hit.allergen_id;
    if(!found.has(key)||found.get(key).score<hit.score)found.set(key,{...hit,uncertain:hit.score<.58});
  }
  return [...found.values()];
}
export function evaluateMenu({sources=[],profile={},errors=[]}={}){
  const entries=[],unassigned=[];
  const byPhoto=new Map();
  for(const source of sources){
    const chars=(source.items||[]).reduce((n,w)=>n+String(w.text||'').length,0);
    const structure=linesFrom(source).filter(l=>PRICE.test(l.text)||/^.{2,80}[:：—–].{2,}$/u.test(l.text)).length;
    const quality=(source.items||[]).reduce((n,w)=>n+(Number(w.score)||0)*String(w.text||'').length,0)/Math.max(1,chars)*Math.min(1,chars/40)+Math.min(3,structure)*.1;
    const key=source.photoIndex??0;
    if(!byPhoto.has(key)||quality>byPhoto.get(key).quality)byPhoto.set(key,{source,quality});
  }
  for(const {source} of byPhoto.values()){
    let current=null,previous=null;
    const lines=linesFrom(source);
    for(let i=0;i<lines.length;i++){
      const line=lines[i],text=line.text;
      // Merged columns can look like "Salad: tomato Soup: milk". Without
      // reliable separation, report the quote without naming a risky dish.
      const separators=(text.match(/[:：—–]/gu)||[]).length;
      const prices=[...text.matchAll(new RegExp(PRICE.source,'gu'))].length;
      if(separators>1||prices>1){
        const hits=matches([line],profile);
        if(hits.length)unassigned.push({text,matches:hits,photoIndex:source.photoIndex??0,association_verified:false});
        current=null;previous=line;continue;
      }
      if(CAUTION.test(text)||containsAny(text,MARKERS.caution_markers)){
        const hits=matches([line],profile);
        if(hits.length)unassigned.push({text,matches:hits,photoIndex:source.photoIndex??0,association_verified:false});
        current=null;previous=line;continue;
      }
      const inline=/^(.{2,80}?)\s*(?:[:：]|[—–]|\s-\s)\s*(.{2,})$/u.exec(text);
      if(inline&&!DESCRIPTION.test(text)&&!SECTION.test(inline[1])){
        current={name:inline[1].replace(PRICE,'').trim(),lines:[line],photoIndex:source.photoIndex??0,association:'same_printed_line'};
        entries.push(current);previous=line;continue;
      }
      const title=text.replace(PRICE,'').replace(/[.·\s]+$/u,'').trim();
      const paired=!DESCRIPTION.test(text)&&!SECTION.test(text)&&text.length<=80&&DESCRIPTION.test(lines[i+1]?.text||'')&&adjacent(line,lines[i+1]);
      if((PRICE.test(text)||paired)&&title.length>=2&&!DESCRIPTION.test(text)){
        current={name:title,lines:[line],photoIndex:source.photoIndex??0,association:'printed_title_and_adjacent_description'};
        entries.push(current);previous=line;continue;
      }
      if(current&&adjacent(previous,line)&&(DESCRIPTION.test(text)||/[,，、]/u.test(text))){
        current.lines.push(line);previous=line;continue;
      }
      const hits=matches([line],profile);
      if(hits.length)unassigned.push({text,matches:hits,photoIndex:source.photoIndex??0,association_verified:false});
      current=null;previous=line;
    }
  }
  const seen=new Set(),items=[];
  for(const entry of entries){
    const text=entry.lines.map(l=>l.text).join('\n'),key=entry.photoIndex+':'+fold(text);
    if(seen.has(key))continue;seen.add(key);
    const hits=matches(entry.lines,profile);
    items.push({name:entry.name,printed_text:text,photoIndex:entry.photoIndex,association:entry.association,
      status:hits.length?'potential_risk':'unverified',matches:hits,complete_ingredients_verified:false});
  }
  return {mode:'menu',status:items.some(i=>i.matches.length)||unassigned.length?'potential_risk':'unverified',
    items,unassigned,errors,complete_menu_verified:false,safe_items:[],
    warning:'Menus may omit ingredients and cross-contact risks. ADPAI may make mistakes. Confirm with restaurant staff; no dish is verified safe.'};
}
