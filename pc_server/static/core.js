import {evaluateProduct} from '../../src/engine.js';
import {evaluateMenu} from '../../src/menu.js';

export function reviewRead(data,profile,mode){
  if(data?.status!=='unverified'||data.automatic_negative_results!==false||!Array.isArray(data.sources)||!Array.isArray(data.errors))throw Error('Unsupported PC response');
  for(const source of data.sources){
    if(!Array.isArray(source.items)||source.items.some(w=>typeof w.text!=='string'||w.score!==0))throw Error('PC line scores cannot become verified word scores');
  }
  if(mode==='menu')return evaluateMenu({sources:data.sources,profile,errors:data.errors});
  const value=evaluateProduct({sources:data.sources,profile});
  return {mode:'shopping',status:'unverified',matches:[...value.direct_matches,...value.caution_matches,...value.mention_matches],
    sources:data.sources,errors:data.errors,warning:'Incomplete text cannot confirm absence of allergens.'};
}
