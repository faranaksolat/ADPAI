import {normalizeBarcode, validGTIN} from './barcode-core.js?v=1.11.1';

// Only independently reviewed physical Korean package labels enter the
// first-party catalog. Presence of a record never certifies allergen absence.
const HEX_SHA256=/^[a-f0-9]{64}$/i;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const present=x=>typeof x==='string'&&x.trim().length>0;
const day=x=>present(x)&&ISO_DAY.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'));

export function verifiedKoreanRecord(raw){
 if(!raw||typeof raw!=='object'||!validGTIN(raw.barcode)||raw.market!=='KR')return null;
 if(!present(raw.productName)||!present(raw.ingredientsText)||!present(raw.packageVariant))return null;
 const ev=raw.evidence, review=raw.review;
 if(!ev||ev.type!=='physical-package'||!HEX_SHA256.test(ev.photoSha256||'')||
    !present(ev.privatePhotoRef)||!day(ev.capturedAt))return null;
 if(!review||review.status!=='verified'||!day(review.verifiedAt)||
    !Array.isArray(review.reviewers)||review.reviewers.length<2)return null;
 const reviewers=review.reviewers.map(x=>typeof x==='string'?x.trim():'');
 if(reviewers.some(x=>!x)||new Set(reviewers).size!==reviewers.length)return null;
 if(review.verifiedAt<ev.capturedAt)return null;
 return {
  barcode:normalizeBarcode(raw.barcode),name:raw.productName.trim(),
  brand:present(raw.brand)?raw.brand.trim():'',
  ingredients:raw.ingredientsText.trim(),ingredientLanguage:'ko',
  allergens:present(raw.allergenDeclaration)?raw.allergenDeclaration.trim():'',
  traces:present(raw.crossContactDeclaration)?raw.crossContactDeclaration.trim():'',
  marketConfirmed:true,manufactureVerified:false,regionalLabelUnverified:false,
  completeness:'HUMAN_REVIEWED_PHYSICAL_LABEL',source:'adpai-reviewed-korean-label',
  sourceUrl:null,sourceLicense:null,sourceLabel:'ADPAI · independently reviewed package photo',
  packageVariant:raw.packageVariant.trim(),reviewedAt:review.verifiedAt,
  evidenceHash:ev.photoSha256.toLowerCase(),
  notice:'Compare the barcode and current physical package. Review does not guarantee allergen absence.'
 };
}
export function findVerifiedKoreanProduct(catalog,barcode){
 const code=normalizeBarcode(barcode);
 if(!validGTIN(code)||catalog?.schemaVersion!==1||!Array.isArray(catalog.records))return null;
 // Ambiguous or duplicate GTIN records must not silently choose a formula.
 const matches=catalog.records.filter(x=>normalizeBarcode(x?.barcode)===code);
 if(matches.length!==1)return null;
 return verifiedKoreanRecord(matches[0]);
}
export function auditKoreanCatalog(catalog){
 const errors=[],seen=new Set();
 if(catalog?.schemaVersion!==1||!Array.isArray(catalog.records))return {valid:false,total:0,verified:0,errors:['Invalid catalog schema']};
 for(const [index,record] of catalog.records.entries()){
  const code=normalizeBarcode(record?.barcode);
  if(seen.has(code))errors.push('Duplicate GTIN at row '+(index+1)+': '+code);
  seen.add(code);
  if(!verifiedKoreanRecord(record))errors.push('Unverified or malformed record at row '+(index+1)+': '+code);
 }
 return {valid:errors.length===0,total:catalog.records.length,verified:catalog.records.length-errors.filter(x=>x.startsWith('Unverified')).length,errors};
}
