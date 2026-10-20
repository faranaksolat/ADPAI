import {menuReadCanvases,mapMenuItems} from './menu-image.js?v=1.7.0';
import {resizeForOcr} from './image.js?v=1.7.0';

// Keep menu layout separate from shopping. Read the upright full image and
// overlapping columns first so a slow whole-page pass cannot erase all useful
// evidence. Wide overlap keeps long names intact across an artificial crop.
export async function readMenuPhoto({worker,canvas,photoIndex,familyId,rotate,itemsFrom,maxPhotoMs=65000}){
  const sources=[],errors=[],started=Date.now();let complete=true;
  const views=menuReadCanvases(canvas),full=views[0];
  const preview=resizeForOcr(full.canvas,1280);
  const overview=preview===full.canvas?[]:[{view:{canvas:preview,variant:'menu-overview',frame:{...full.frame,scale:full.frame.scale*preview.width/full.canvas.width}},langs:['eng'],psm:'11'}];
  const passes=[...overview,...views.slice(1).map(view=>({view,langs:['kor','eng'],psm:'11'})),
    {view:full,langs:['eng'],psm:'11'},{view:full,langs:['kor'],psm:'11'}];
  const read=async(pass,rotation)=>{
    if(worker.closed||Date.now()-started>=maxPhotoMs){complete=false;return false}
    try{
      await worker.reinitialize(pass.langs,1);await worker.setParameters({tessedit_pageseg_mode:pass.psm});
      const result=await worker.recognize(rotate(pass.view.canvas,rotation),{timeoutMs:Math.max(1,maxPhotoMs-(Date.now()-started))});
      sources.push({familyId,photoIndex,rotation,variant:pass.view.variant,model_languages:pass.langs,segmentation:pass.psm,
        frame:pass.view.frame,items:mapMenuItems(itemsFrom(result),pass.view.frame,rotation)});
      return true;
    }catch(error){complete=false;errors.push({family:familyId,photoIndex,rotation,phase:pass.view.variant,message:String(error?.message||error)});return !worker.closed}
  };
  for(const pass of passes)if(!await read(pass,0))break;
  const upright=sources.some(s=>{
    const words=s.items.filter(w=>/[\p{L}]/u.test(w.text)),chars=words.reduce((n,w)=>n+w.text.length,0);
    return words.length>=6&&chars>=35&&words.reduce((n,w)=>n+w.text.length*w.score,0)/Math.max(1,chars)>=.65;
  });
  if(!upright)for(const rotation of [90,270,180])if(!await read({view:full,langs:['kor','eng'],psm:'11'},rotation))break;
  if(!complete&&!errors.length)errors.push({family:familyId,photoIndex,message:'OCR menu photo time budget reached'});
  return {sources,errors,complete};
}
