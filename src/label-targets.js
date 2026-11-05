// Conservative, evidence-guided local OCR regions. OCR anchors only propose
// a candidate location; they never establish that the panel is complete.
const ingredient=/(?:원재료|원료명|알레르기|함유|혼입|우유|대두|밀가루|계란|새우|전성분|성분|ingredients?|allergens?|contains?|may\s*contain|inci|fragrance|parfum)/iu;
const nutrition=/(?:영양정보|영양성분|나트륨|탄수화물|단백질|포화지방|당류|kcal|nutrition|calories|sodium|carbohydrates?|protein)/iu;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function labelEvidenceZones(items,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('Invalid OCR image dimensions');
  const groups=new Map();
  for(const [i,item] of (items||[]).entries()){
    const b=item.box,id=item.lineId??'single-'+i;
    if(!b||![b.x0,b.x1,b.y0,b.y1].every(Number.isFinite)||b.x1<=b.x0||b.y1<=b.y0||!String(item.text||'').trim())continue;
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(item);
  }
  const anchors={ingredients:[],nutrition:[]};
  for(const line of groups.values()){
    const ordered=[...line].sort((a,b)=>a.box.x0-b.box.x0);
    const text=ordered.map(x=>x.text).join(' ');
    const box={y0:Math.min(...ordered.map(x=>x.box.y0)),y1:Math.max(...ordered.map(x=>x.box.y1))};
    if(ingredient.test(text))anchors.ingredients.push(box);
    if(nutrition.test(text))anchors.nutrition.push(box);
  }
  const targets=[];
  for(const [type,boxes] of Object.entries(anchors)){
    if(!boxes.length)continue;
    const first=Math.min(...boxes.map(b=>b.y0)),last=Math.max(...boxes.map(b=>b.y1));
    const coverage=Math.max(height*(type==='ingredients'?.22:.25),(last-first)+height*(type==='ingredients'?.17:.13));
    const y=clamp(Math.round((first+last-coverage)/2),0,Math.max(0,height-coverage));
    const x=Math.round(width*.025),w=Math.max(1,width-2*x);
    targets.push({x,y,width:w,height:Math.min(height-y,Math.ceil(coverage)),
      variant:'label-focus-'+type,kind:type,reference:'ocr_anchor_not_verified'});
  }
  return targets;
}
