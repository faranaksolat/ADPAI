import {evaluateProduct} from './engine.js?v=parent-pilot-20261105-b1';

// A locally edited transcript is user-entered evidence, never proof that the
// entire printed label has been captured or that a food is safe.
export function reviewEnteredLabel(text,profile){
  if(typeof text!=='string'||text.length>12000)throw Error('Text is too long');
  const lines=text.replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  if(!lines.length)return {status:'unverified',direct_matches:[],caution_matches:[],mention_matches:[],reason:'No checked text was provided'};
  const source={familyId:/[가-힣]/u.test(text)?'korean':'latin',photoIndex:0,variant:'user-entered',
    items:lines.map((line,lineId)=>({text:line,score:1,lineId}))};
  const result=evaluateProduct({sources:[source],profile,requiredFamilies:[]});
  // User corrections are evidence of what was typed, not independently
  // verified OCR or label completeness. Never return a negative/safe result.
  return {...result,status:result.status==='conflict'||result.status==='caution'?result.status:'unverified',
    provenance:'user_entered_unverified_completeness',panel_completeness_verified:false};
}
