// Web Share support depends on both the browser and the exact file type.
// JSON is often rejected even where image/text file sharing is supported.
export function chooseShareFile(files,navigator=globalThis.navigator){
 if(typeof navigator?.share!=='function'||typeof navigator?.canShare!=='function')return null;
 for(const file of files)try{if(navigator.canShare({files:[file]}))return file}catch{}
 return null;
}
export function originalPhotoName(photo){
 return 'adpai-camera-original.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/heic':'heic','image/heif':'heif'}[photo.type]||'bin');
}
export async function shareLocalFile(file,navigator=globalThis.navigator){
 if(!file||!chooseShareFile([file],navigator))return 'unsupported';
 try{await navigator.share({files:[file]});return 'completed'}
 catch(error){return error?.name==='AbortError'?'cancelled':'failed'}
}
