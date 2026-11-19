// Barcode-first B2C pilot. Catalog data never certifies absence of allergens.
export const OFF_LICENSE = 'Open Food Facts · ODbL 1.0';
export const HISTORY_KEY = 'adpai_barcode_history_v1';
export const SAVED_KEY = 'adpai_barcode_saved_v1';
export function normalizeBarcode(raw){return String(raw??'').normalize('NFKC').replace(/[\s-]/g,'').trim()}
export function validGTIN(raw){
 const code=normalizeBarcode(raw);if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))return false;
 let sum=0,weight=3;for(let i=code.length-2;i>=0;i--){sum+=Number(code[i])*weight;weight=weight===3?1:3}
 return (10-sum%10)%10===Number(code.at(-1));
}
const clip=(v,n=4000)=>typeof v==='string'?v.trim().slice(0,n):'';
export function normalizeOFFResponse(barcode,response){
 barcode=normalizeBarcode(barcode);
 if(!validGTIN(barcode))throw Error('INVALID_BARCODE');
 if(!response||response.status!==1||!response.product)return null;
 const p=response.product,code=normalizeBarcode(p.code??barcode);
 if(code!==barcode)throw Error('BARCODE_MISMATCH');
 const tags=Array.isArray(p.countries_tags)?p.countries_tags:[];
 const marketConfirmed=tags.some(x=>/^(?:en:)?south-korea$|^ko:대한민국$|^ko:한국$/i.test(String(x)));
 const ko=clip(p.ingredients_text_ko),other=clip(p.ingredients_text);
 const ingredients=ko||other,t=Number(p.last_modified_t);
 // Some OFF responses return status=1 with only the barcode: no usable catalog evidence.
 if(!clip(p.product_name_ko||p.product_name||p.product_name_en,180)&&!ingredients&&!clip(p.allergens)&&!clip(p.traces))return null;
 return {barcode,name:clip(p.product_name_ko||p.product_name||p.product_name_en,180)||barcode,
 brand:clip(p.brands,180),ingredients,ingredientLanguage:ko?'ko':ingredients?'unspecified':null,
 allergens:clip(p.allergens),traces:clip(p.traces),
 marketConfirmed,manufactureVerified:false,
 sourceUrl:'https://world.openfoodfacts.org/product/'+encodeURIComponent(barcode),
 sourceLicense:OFF_LICENSE,source:'openfoodfacts',
 updated:Number.isFinite(t)&&t>0?new Date(t*1000).toISOString():'',
 regionalLabelUnverified:!(Boolean(ko)&&marketConfirmed),
 completeness:ingredients?'CROWDSOURCED_UNVERIFIED_LABEL':'INGREDIENTS_MISSING'};
}
export function statusFor(result,direct=0,caution=0){return result&&direct>0?'CONFLICT':result&&caution>0?'CAUTION':'UNVERIFIED'}
export function historyItem(p){return {barcode:p.barcode,name:String(p.name).slice(0,180),seenAt:new Date().toISOString()}}
export function recentItems(oldItems,item,max=20){return [item,...(Array.isArray(oldItems)?oldItems:[]).filter(x=>x?.barcode!==item.barcode)].filter(x=>x&&validGTIN(x.barcode)&&typeof x.name==='string').slice(0,max)}
export function safeStoredList(value){try{const a=JSON.parse(value||'[]');return Array.isArray(a)?a.filter(x=>x&&validGTIN(x.barcode)&&typeof x.name==='string').slice(0,20):[]}catch{return []}}
