import {menuReadCanvases,mapMenuItems} from './menu-image.js?v=1.9.2';

// Keep menu layout separate from shopping. Read the upright full image and
// overlapping columns first so a slow whole-page pass cannot erase all useful
// evidence. Wide overlap keeps long names intact across an artificial crop.
export async function readMenuPhoto({worker,canvas,photoIndex,familyId,rotate,itemsFrom,maxPhotoMs=65000}){
  const sources=[],errors=[],started=Date.now();let complete=true;
  const views=menuReadCanvases(canvas),full=views[0];
  const columns=views.filter(view=>view.variant.startsWith('menu-column-'));
  const details=views.filter(view=>view.variant.startsWith('menu-detail-'));
  const passes=[...columns.map(view=>({view,langs:['kor','eng'],psm:'11'})),
    {view:full,langs:['eng'],psm:'11'},
    ...views.filter(view=>view.variant==='menu-enhanced').map(view=>({view,langs:['kor','eng'],psm:'11'})),
    ...details.map(view=>({view,langs:['kor','eng'],psm:'11'})),{view:full,langs:['kor'],psm:'11'}];
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
    const words=s.items.filter(w=>w.score>=.58&&/[\p{L}]/u.test(w.text));
    return words.length>=4&&words.reduce((n,w)=>n+(w.text.match(/\p{L}/gu)||[]).length,0)>=20;
  });
  if(!upright)for(const rotation of [90,270,180])if(!await read({view:full,langs:['kor','eng'],psm:'11'},rotation))break;
  if(!complete&&!errors.length)errors.push({family:familyId,photoIndex,message:'OCR menu photo time budget reached'});
  return {sources,errors,complete};
}
