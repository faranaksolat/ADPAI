import { ingredientEvidence, containsAny, MARKERS, fold, ALLERGENS, matchSpans } from './engine.js?v=1.11.0';
import {dietaryEvidence, mergeDietary, dietaryConflict} from './dietary.js?v=1.11.0';

// A menu's printed description is not a complete recipe or a safety certificate.
// Associate text only on one explicit line, or adjacent lines in one column.
const PRICE=/(?:[$€£₩]\s*\d[\d,.]*|\d[\d,.]*\s*원|\b\d{1,3}(?:,\d{3})+(?:원|8)?\b|\b\d{1,3}[.,]\d{1,2}\b)/u;
const DESCRIPTION=/^(?:ingredients?|contains?|with|served with|재료|원재료|포함 성분)\s*[:：]?/iu;
const CAUTION=/may\s+contain|shared\s+(?:equipment|kitchen|facility)|allerg(?:y|ies|ens?)|같은\s*(?:시설|주방)|교차\s*접촉|알레르기/iu;
const SECTION=/^(?:(?:menu|메뉴|ramen|라멘|bowls?|덮밥|side|사이드|drinks|주류|notice|안내|starters|mains|desserts|음료|디저트|ingredients?|contains?|재료|원재료|allergens?|알레르기)\s*[:：]?\s*)+$/iu;
const ORIGIN=/^원\s*산\s*지\s*[-:：]?/u;
const section=text=>SECTION.test(text)||/^(?:coffee|tea|dessert|coffeemenu|식사류|식사메뉴|음료메뉴)$/iu.test(text.replace(/\s/gu,''));
const onlyPrice=text=>new RegExp('^(?:'+PRICE.source+')[\\p{Sc}.·\\s]*$','u').test(text.trim())
  ||/^(?:[wW]\s*)?\d{2,6}$/u.test(text.trim());
const hasPrice=line=>line.printedPrice||PRICE.test(line.text);
function makeLine(words,id){
 const boxes=words.map(w=>w.box).filter(Boolean),heights=boxes.map(b=>b.y1-b.y0).sort((a,b)=>a-b);
 return {id,words,text:words.map(w=>w.text).join(' '),fontHeight:heights[Math.floor(heights.length/2)]||0,
  box:boxes.length===words.length?{x0:Math.min(...boxes.map(b=>b.x0)),x1:Math.max(...boxes.map(b=>b.x1)),y0:Math.min(...boxes.map(b=>b.y0)),y1:Math.max(...boxes.map(b=>b.y1))}:null};
}

function linesFrom(source){
  const lines=[];
  for(const item of source.items||[]){
    const text=String(item.text||'').trim();if(!text)continue;
    let line=lines.at(-1),previous=line?.words.at(-1);
    const gap=item.box&&previous?.box?item.box.x0-previous.box.x1:0;
    const height=item.box?Math.max(1,item.box.y1-item.box.y0):0;
    const separateDescriptions=line&&DESCRIPTION.test(text)&&line.words.some(w=>DESCRIPTION.test(w.text))&&gap>height;
    if(!line||item.lineId==null||line.id!==item.lineId||gap>Math.max(60,height*4)||separateDescriptions){
      line={id:item.lineId,words:[]};lines.push(line);
    }
    line.words.push(item);
  }
  // Sparse OCR often joins several priced columns at the same height. Split
  // only at a separately boxed, explicitly formatted price. An aggregate word
  // containing two dishes has no trustworthy geometry and stays ambiguous.
  return lines.flatMap(line=>{
    const parts=[];let words=[];
    for(const word of line.words){
      words.push(word);
      if(word.box&&PRICE.test(word.text)&&onlyPrice(word.text)){
        parts.push(makeLine(words,line.id));words=[];
      }
    }
    if(words.length)parts.push(makeLine(words,line.id));
    return parts;
  });
}
function joinPrintedPrices(lines){
  const used=new Set(),result=[...lines];
  for(let i=0;i<result.length;i++){
    const price=result[i];if(!price.box||!onlyPrice(price.text))continue;
    const candidates=result.map((line,j)=>({line,j})).filter(({line,j})=>j!==i&&!used.has(j)&&line.box
      &&!hasPrice(line)&&!section(line.text)&&!DESCRIPTION.test(line.text)&&!ORIGIN.test(line.text)
      &&(cleanName(line.text).match(/\p{L}/gu)||[]).length>=2
      &&line.box.x1<=price.box.x0+height(line)*.3&&price.box.x0-line.box.x1<=Math.max(140,height(line)*18)
      &&Math.min(line.box.y1,price.box.y1)-Math.max(line.box.y0,price.box.y0)>=Math.min(height(line),height(price))*.6)
      .sort((a,b)=>b.line.box.x1-a.line.box.x1);
    if(!candidates.length)continue;
    const {line,j}=candidates[0];
    // Keep the name's box: extending it across the price gutter can associate
    // a description from the next column. Price text keeps its own word box.
    result[j]={...line,text:line.text+' '+price.text,words:[...line.words,...price.words],printedPrice:true};
    used.add(i);
  }
  return result.filter((_,i)=>!used.has(i));
}
const height=line=>line.fontHeight||(line.box?line.box.y1-line.box.y0:0);
const center=line=>line.box?(line.box.x0+line.box.x1)/2:0;
function sameColumn(a,b){
  if(!a?.box||!b?.box)return false;
  const overlap=Math.min(a.box.x1,b.box.x1)-Math.max(a.box.x0,b.box.x0);
  const width=Math.min(a.box.x1-a.box.x0,b.box.x1-b.box.x0);
  return overlap>=width*.55&&(Math.abs(a.box.x0-b.box.x0)<=Math.max(height(a),height(b))*2.5
    ||Math.abs(center(a)-center(b))<=Math.max(height(a),height(b))*2);
}
function adjacent(a,b){
  if(!sameColumn(a,b))return false;
  const h=Math.max(1,height(a),height(b)),gap=b.box.y0-a.box.y1;
  return gap>=-h*.3&&gap<=h*1.5;
}
const nameKey=text=>fold(text).replace(/[\p{P}\p{Sc}\s]/gu,'');
const cleanName=text=>text.replace(PRICE,'').replace(/\s+\d[\d,.]{1,}(?:원|8)?\s*$/u,'')
 .replace(/^\s*\d{1,3}[.),]\s*/u,'').split(/…|\.{2,}|[·_~ㅡㄴ\-]{2,}/u)[0]
 .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').trim();
function printedName(line){
 let name=cleanName(line.text);
 // A printed bilingual row is one dish. Prefer a readable Korean name over
 // concatenating it with a damaged Latin alias. Quotes retain every OCR word.
 const ko=/[가-힣](?:[가-힣\s]*[가-힣])?/u.exec(name);
 if(ko&&ko[0].replace(/\s/gu,'').length>=3&&/[A-Za-z]/u.test(name))name=ko[0].trim();
 return name.replace(/(?:[가-힣]\s+){2,}[가-힣]+/gu,run=>run.replace(/\s/gu,''));
}
function lineScore(line){
  const chars=line.words.reduce((n,w)=>n+w.text.length,0);
  return line.words.reduce((n,w)=>n+w.text.length*(Number(w.score)||0),0)/Math.max(1,chars);
}
function mergeMatches(a,b){
  const found=new Map();
  for(const hit of [...a,...b]){
    const key=hit.allergen_id==='custom'?'custom:'+fold(hit.term):hit.allergen_id;
    const previous=found.get(key);
    if(!previous||(previous.context_uncertain&&!hit.context_uncertain)||!!previous.context_uncertain===!!hit.context_uncertain&&previous.score<hit.score)
      found.set(key,{...hit,uncertain:hit.score<.58||hit.context_uncertain===true});
  }
  return [...found.values()];
}
function samePrintedTitle(a,b){
  if(!a||!b)return false;
  return Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>=Math.min(a.y1-a.y0,b.y1-b.y0)*.6
    &&Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>=Math.min(a.x1-a.x0,b.x1-b.x0)*.7;
}
const titleQuality=name=>(name.match(/\p{L}/gu)||[]).length/Math.max(1,name.replace(/\s/gu,'').length);
function compatibleTitleNames(a,b){
  const key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const x=key(a),y=key(b),short=x.length<y.length?x:y,long=x.length<y.length?y:x;
  return short.length>=2&&long.includes(short)&&short.length/long.length>=.65&&long.length-short.length<=2;
}
export function evaluateMenu({sources=[],profile={},errors=[]}={}){
  const entries=[],unassigned=[];
  const terms=[...(profile.allergens||[]).flatMap(id=>Object.values(ALLERGENS[id]?.aliases||{}).flat()),...(profile.custom_avoid||[])];
  const possibleCache=new Map();
  const matches=lines=>{
    const text=fold(lines.map(l=>l.text).join(' '));
    if(!possibleCache.has(text))possibleCache.set(text,terms.some(term=>matchSpans(text,term).length));
    if(!possibleCache.get(text))return [];
    const p=ingredientEvidence({sources:[{familyId:'korean',items:lines.flatMap((l,lineId)=>l.words.map(w=>({...w,lineId})))}],profile,requiredFamilies:[]});
    return mergeMatches([],[...p.direct_matches,...p.caution_matches,...p.mention_matches]);
  };
  const addUnassigned=(lines,source)=>{
    const hits=matches(lines),dietary=dietaryEvidence(lines,profile.dietary_preferences);if(!hits.length&&!dietary.length)return;
    unassigned.push({text:lines.map(l=>l.text).join('\n'),matches:hits,dietary_matches:dietary,photoIndex:source.photoIndex??0,association_verified:false});
  };
  // Evaluate each actual reading separately. A high average confidence on
  // unrelated text must not erase a correct upright/column reading. Readings
  // remain one OCR family; scores and quotes are never manufactured/combined.
  for(const source of sources){
    const lines=joinPrintedPrices(linesFrom(source)),blocked=new Set(),titles=new Map();
    const sizes=lines.map(height).filter(h=>h>0).sort((a,b)=>a-b),bodyHeight=sizes[Math.floor(sizes.length/2)]||0;
    const below=line=>lines.map((l,i)=>({l,i})).filter(({l})=>l!==line&&l.box&&line.box
      &&l.box.y0>line.box.y0+height(line)*.3&&adjacent(line,l)).sort((a,b)=>a.l.box.y0-b.l.box.y0);
    for(let i=0;i<lines.length;i++){
      const line=lines[i],text=line.text;
      const frame=source.frame,margin=Math.max(3,height(line)*.4);
      const croppedEdge=line.box&&frame?.cropWidth&&((frame.x>0&&line.box.x0-frame.x<margin)
        ||(frame.x+frame.cropWidth<frame.width&&frame.x+frame.cropWidth-line.box.x1<margin)
        ||(frame.y>0&&line.box.y0-frame.y<margin)
        ||(frame.cropHeight&&frame.y+frame.cropHeight<frame.height&&frame.y+frame.cropHeight-line.box.y1<margin));
      if((!ORIGIN.test(text)&&(text.match(/[:：—–]/gu)||[]).length>1)||[...text.matchAll(new RegExp(PRICE.source,'gu'))].length>1
        ||croppedEdge||CAUTION.test(text)||containsAny(text,MARKERS.caution_markers)||section(text)){
        blocked.add(i);addUnassigned([line],source);continue;
      }
      const inline=/^(.{2,80}?)\s*(?:[:：]|[—–]|\s-\s)\s*(.{2,})$/u.exec(text);
      if(inline&&!DESCRIPTION.test(text)&&!ORIGIN.test(text)&&!section(inline[1])
        &&!(source.engine==null&&source.model_languages&&lineScore(line)<.45)){
        const name=cleanName(inline[1]);
        if(name.length>=2&&/\p{L}/u.test(name)&&!onlyPrice(inline[1]))titles.set(i,{name,association:'same_printed_line'});
        continue;
      }
      const title=printedName(line);if(title.length<2||title.length>80||!/[\p{L}]/u.test(title)||DESCRIPTION.test(text)||ORIGIN.test(text)||onlyPrice(text)
        ||/^[wW]{1,2}$/u.test(title)||(!/[가-힣]/u.test(title)&&(title.match(/\p{L}/gu)||[]).length<3))continue;
      const near=below(line),next=near[0]?.l;
      const marker=next&&DESCRIPTION.test(next.text);
      const typography=next&&height(line)>=height(next)*1.25&&lineScore(line)>=.6
        &&next.text.length>=3&&!section(next.text)&&!CAUTION.test(next.text)&&!hasPrice(next);
      // A larger printed name such as "Cream Cheese Pizza" can itself supply
      // a warning even if its description is absent. No recipe is inferred.
      const namedIngredient=bodyHeight>0&&height(line)>=bodyHeight*1.35&&lineScore(line)>=.75&&(matches([line]).length||dietaryEvidence([line],profile.dietary_preferences).length);
      const sentence=/\b(?:with|and|using|served)\b/iu.test(title)&&title.split(/\s/u).length>7;
      const weak=source.engine==null&&source.model_languages&&lineScore(line)<.45;
      if(!sentence&&!weak&&(hasPrice(line)||marker||typography||namedIngredient))titles.set(i,{name:title,association:hasPrice(line)||marker?'printed_title_and_adjacent_description':'larger_printed_title_and_adjacent_description'});
    }
    // Bilingual names often sit between an English priced title and its
    // smaller Korean description. Keep that printed alias in the same block.
    for(const [i] of titles){
      if(!hasPrice(lines[i]))continue;
      const next=below(lines[i])[0];if(!next||blocked.has(next.i)||hasPrice(next.l))continue;
      const differentScripts=/[A-Za-z]/u.test(lines[i].text)&&/[가-힣]/u.test(next.l.text);
      const description=below(next.l)[0]?.l;
      const aliasWithBody=description&&height(description)<=height(next.l)*.85&&adjacent(next.l,description);
      if(differentScripts&&next.l.text.length<=60&&height(next.l)>=height(lines[i])*.65
        &&height(next.l)<=height(lines[i])*(aliasWithBody?1.8:1.25))titles.delete(next.i);
    }
    // A single restaurant-wide origin footer can sit under the last dish.
    // Only a repeated, smaller per-dish origin-row pattern can join a title;
    // otherwise its ingredients remain visible as unassigned warnings.
    const originPairs=[...titles.keys()].flatMap(i=>{
      const next=below(lines[i])[0];return next&&ORIGIN.test(next.l.text)&&height(next.l)<=height(lines[i])*.8?[{title:i,origin:next.i}]:[];
    });
    const scopedOrigins=new Set(originPairs.filter(a=>originPairs.some(b=>b.title!==a.title&&sameColumn(lines[a.title],lines[b.title]))).map(a=>a.origin));
    const used=new Set();
    for(const [i,title] of titles){
      const line=lines[i],body=[line];used.add(i);
      if(line.box){
        let previous=line;
        const nearby=lines.map((l,j)=>({l,j})).filter(({l,j})=>j!==i&&l.box&&sameColumn(line,l)
          &&l.box.y0>line.box.y0+height(line)*.3&&l.box.y0-line.box.y1<=height(line)*6)
          .sort((a,b)=>a.l.box.y0-b.l.box.y0);
        for(const {l,j} of nearby){
          if(!adjacent(previous,l)||blocked.has(j)||titles.has(j))break;
          // A separately printed price or section is never another ingredient.
          if(hasPrice(l)||section(l.text)||onlyPrice(l.text))break;
          if(ORIGIN.test(l.text)&&!scopedOrigins.has(j))break;
          if(body.length===1||DESCRIPTION.test(l.text)||ORIGIN.test(l.text)||/[,，、]/u.test(l.text)||height(l)<=height(line)*.9){
            body.push(l);used.add(j);previous=l;
          }else break;
        }
      }
      entries.push({name:title.name,lines:body,box:line.box,photoIndex:source.photoIndex??0,association:title.association,
        source:{familyId:source.familyId,rotation:source.rotation,variant:source.variant,model_languages:source.model_languages}});
    }
    for(let i=0;i<lines.length;i++)if(!used.has(i)&&!blocked.has(i))addUnassigned([lines[i]],source);
  }
  // A Latin-only model sometimes reads Korean lettering as a priced English
  // dish. Hide that duplicate card only when a much stronger Korean title
  // occupies the same physical row. Do not transfer its ingredient evidence:
  // all warnings from the suppressed reading remain unassigned and raw text
  // stays available. Incompatible complete names in one script stay separate.
  const visible=entries.filter(entry=>{
    if(/[가-힣]/u.test(entry.name)||!entry.source.model_languages?.every(l=>['eng','en'].includes(l)))return true;
    const better=entries.some(other=>other!==entry&&other.photoIndex===entry.photoIndex&&other.source.rotation===entry.source.rotation
      &&(other.name.match(/[가-힣]/gu)||[]).length>=3&&lineScore(other.lines[0])>=.75
      &&samePrintedTitle(other.box,entry.box));
    if(better)addUnassigned(entry.lines,{photoIndex:entry.photoIndex});
    return !better;
  });
  const items=[];
  for(const entry of visible){
    const text=entry.lines.map(l=>l.text).join('\n'),hits=matches(entry.lines),dietary=dietaryEvidence(entry.lines,profile.dietary_preferences);
    const previous=items.find(item=>item.photoIndex===entry.photoIndex&&item.readings[0].source.rotation===entry.source.rotation
      &&((samePrintedTitle(item.box,entry.box)&&compatibleTitleNames(item.name,entry.name))||(nameKey(item.name)===nameKey(entry.name)
      &&(!entry.box||!item.box||(sameColumn({box:entry.box},{box:item.box})&&Math.abs(entry.box.y0-item.box.y0)<=Math.max(entry.box.y1-entry.box.y0,item.box.y1-item.box.y0)*1.5)))));
    if(previous){
      if(titleQuality(entry.name)>titleQuality(previous.name))previous.name=entry.name;
      previous.matches=mergeMatches(previous.matches,hits);previous.dietary_matches=mergeDietary(previous.dietary_matches,dietary);previous.status=previous.matches.length||dietaryConflict(previous.dietary_matches)?'potential_risk':'unverified';
      if(!previous.readings.some(r=>r.printed_text===text))previous.readings.push({printed_text:text,source:entry.source});
      previous.printed_text=previous.readings.map(r=>r.printed_text).join('\n—\n');
    }else items.push({name:entry.name,printed_text:text,photoIndex:entry.photoIndex,box:entry.box,association:entry.association,
      status:hits.length||dietaryConflict(dietary)?'potential_risk':'unverified',matches:hits,dietary_matches:dietary,complete_ingredients_verified:false,readings:[{printed_text:text,source:entry.source}]});
  }
  const unique=new Map();
  for(const u of unassigned){const key=u.photoIndex+':'+fold(u.text);if(!unique.has(key))unique.set(key,u);else {unique.get(key).matches=mergeMatches(unique.get(key).matches,u.matches);unique.get(key).dietary_matches=mergeDietary(unique.get(key).dietary_matches,u.dietary_matches)}}
  return {mode:'menu',status:items.some(i=>i.status==='potential_risk')||[...unique.values()].some(u=>u.matches.length||dietaryConflict(u.dietary_matches))?'potential_risk':'unverified',
    items,unassigned:[...unique.values()],errors,complete_menu_verified:false,safe_items:[],
    warning:'Menus may omit ingredients and cross-contact risks. ADPAI may make mistakes. Confirm with restaurant staff; no dish is verified safe.'};
}
