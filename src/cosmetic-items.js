// Use the recognizer's line/word order for ingredient prose. Geometry sorting
// used for menus can move a small, low-lying comma below the entire text row,
// joining two correctly recognized ingredient names. Do not rewrite the text
// or borrow a line's confidence for its words.
export function cosmeticItemsFrom(result,{legacy=false}={}){
 const lines=(result?.data?.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[]));
 const convert=(word,lineId)=>{
  const score=Number(word.confidence),box=word.bbox;
  const text=String(word.text||''),interior=text.replace(/[,;，；、\s]+$/gu,'');
  return {text,lineId,score:Number.isFinite(score)?Math.max(0,Math.min(1,score/100)):0,
   aggregate_confidence:legacy&&(/(?<!\d)[,;，；、]|[,;，；、](?!\d)/u.test(interior)||/^(?:전\s*성\s*분|ingredients?)\s*[:：ː﹕].*\p{L}/iu.test(text)),
   box:box&&['x0','y0','x1','y1'].every(key=>Number.isFinite(box[key]))&&box.x1>box.x0&&box.y1>box.y0?{...box}:null};
 };
 if(lines.some(line=>line.words?.length))return lines.flatMap((line,lineId)=>(line.words||[]).filter(word=>String(word.text||'').trim()).map(word=>convert(word,lineId)));
 if(result?.data?.words?.length)return result.data.words.map((word,index)=>convert(word,word.line_num??index));
 return [{text:String(result?.data?.text||''),score:0,lineId:0,aggregate_confidence:false,box:null}];
}
