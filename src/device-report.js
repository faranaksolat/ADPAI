// A report from a user-run capture is evidence pending review, never proof of
// physical hardware, calibrated OCR accuracy, or food safety.
export const DEVICE_CHECK_VERSION='1.10.1';
export const CARD_REFERENCES=Object.freeze({
 en_positive:Object.freeze({language:'en',expected:Object.freeze(['milk','wheat','egg']),lines:Object.freeze(['INGREDIENTS: MILK, WHEAT FLOUR, EGG.','CONTAINS: MILK, WHEAT AND EGG.'])}),
 ko_positive:Object.freeze({language:'ko',expected:Object.freeze(['milk','wheat','egg']),lines:Object.freeze(['원재료명: 우유, 밀가루, 계란.','우유, 밀, 계란 함유.'])}),
 en_negative:Object.freeze({language:'en',expected:Object.freeze([]),lines:Object.freeze(['INGREDIENTS: RICE, SALT, WATER.'])}),
 ko_negative:Object.freeze({language:'ko',expected:Object.freeze([]),lines:Object.freeze(['원재료명: 쌀, 소금, 정제수.'])}),
});
const CHECKED=['milk','wheat','egg'];
const number=value=>Number.isFinite(value)&&value>=0?value:null;
export function buildDeviceReport({referenceId,physicalConfirmed=false,target='unknown',condition='unknown',camera={},dimensions={},imageSha256=null,imageBytes=null,quality={},product={},durationMs=null,userAgent='',automationHint=null,error=false}={}){
 if(!Object.hasOwn(CARD_REFERENCES,referenceId))throw Error('Unknown printed reference');
 const reference=CARD_REFERENCES[referenceId],direct=[...new Set((product.direct_matches||[]).map(h=>h.allergen_id).filter(id=>CHECKED.includes(id)))];
 const possible=[...new Set([...(product.caution_matches||[]),...(product.mention_matches||[])].map(h=>h.allergen_id).filter(id=>CHECKED.includes(id)&&!direct.includes(id)))];
 const valid=Number.isInteger(dimensions.width)&&Number.isInteger(dimensions.height)&&dimensions.width>0&&dimensions.height>0;
 const wordCount=(product.sources||[]).reduce((n,s)=>n+(s.items||[]).filter(w=>String(w.text||'').trim()).length,0);
 return {schema:'adpai-user-device-check-v1',app_version:DEVICE_CHECK_VERSION,created_utc:new Date().toISOString(),
  physical_test_status:'user_run_capture_pending_human_review',physical_capture_confirmed_by_user:physicalConfirmed===true,
  physical_hardware_verified:false,accuracy_validated:false,food_safety_certified:false,
  reference:{id:referenceId,method:'authored_card_text_not_real_food',expected_allergens:[...reference.expected]},
  capture:{route:['image_capture','system_camera'].includes(camera.route)?camera.route:'unknown',
   target_declared:['paper','screen'].includes(target)?target:'unknown',condition_declared:['clear','far','dim','tilted'].includes(condition)?condition:'unknown',
   width:valid?dimensions.width:null,height:valid?dimensions.height:null,preview_width:number(camera.preview_width),preview_height:number(camera.preview_height),
   facing_mode:['environment','user','left','right'].includes(camera.facing_mode)?camera.facing_mode:null,
   focus_mode:['none','manual','single-shot','continuous'].includes(camera.focus_mode)?camera.focus_mode:null,
   image_bytes:number(imageBytes),image_sha256:/^[a-f0-9]{64}$/u.test(imageSha256||'')?imageSha256:null},
  browser:{user_agent:String(userAgent).slice(0,350),automation_hint:typeof automationHint==='boolean'?automationHint:null},
  analysis:{state:error?'failed':!valid?'invalid_image':!wordCount?'no_text_read':(product.errors||[]).length?'partial_read':'completed',
   duration_ms:number(durationMs),timing_scope:'Includes decode, quality checks, OCR initialization/model fetches if needed and analysis; excludes camera shutter time and initial page load. Cache state not measured.',
   direct_allergens:direct,possible_allergens:possible,missing_known_allergens:reference.expected.filter(id=>!direct.includes(id)&&!possible.includes(id)),
   additional_warnings_in_card_reference:[...direct,...possible].filter(id=>!reference.expected.includes(id)),
   ocr_words_across_all_views:wordCount,ocr_error_count:(product.errors||[]).length,
   unexpected_safe_output:['safe','clear','no_listed_conflict'].includes(product.status)},
  quality:{scope:'uncalibrated_capture_guidance',issues:(quality.issues||[]).filter(id=>['low_light','low_contrast','text_not_found','text_too_small','possible_blur','possible_glare'].includes(id))},
  privacy:{contains_photo:false,contains_ocr_transcript:false,contains_original_filename:false,contains_device_ids:false,automatic_upload:false}};
}
