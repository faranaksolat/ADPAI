import { Capacitor,registerPlugin } from '@capacitor/core';
import { Camera, CameraDirection, EncodingType, MediaTypeSelection } from '@capacitor/camera';

async function asFile(media,index=0) {
  if(!media?.uri && !media?.webPath) throw new Error('No photo returned');
  const response=await fetch(media.webPath || Capacitor.convertFileSrc(media.uri));
  if(!response.ok) throw new Error('Photo could not be opened');
  const blob=await response.blob();
  // Preserve the real media type; assigning JPEG to a PNG/HEIC does not
  // convert its bytes. Unsupported formats must fail decoding conservatively.
  const mime=blob.type.startsWith('image/')?blob.type:'image/jpeg';
  return new File([blob],`label-${Date.now()}-${index}`,{type:mime});
}
if(Capacitor.isNativePlatform()) {
  if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AdpaiText')){
    const reader=registerPlugin('AdpaiText');
    globalThis.ADPAI_NATIVE_OCR=options=>reader.recognize(options);
  }
  globalThis.ADPAI_NATIVE={
    takePhoto: async()=>[await asFile(await Camera.takePhoto({quality:100,correctOrientation:true,encodingType:EncodingType.JPEG,saveToGallery:false,cameraDirection:CameraDirection.Rear,includeMetadata:false}))],
    pickPhotos: async limit=>{
      const media=await Camera.chooseFromGallery({mediaType:MediaTypeSelection.Photo,allowMultipleSelection:true,limit,quality:100,correctOrientation:true,includeMetadata:false});
      return Promise.all(media.results.slice(0,limit).map(asFile));
    }
  };
}
// The JS runtime, worker, WASM and primary models ship with the app. Other
// languages use Tesseract's standard CDN path and may require a connection.
globalThis.ADPAI_OCR_OPTIONS=def=>({
  workerPath:new URL('./vendor/tesseract/worker.min.js',document.baseURI).href,
  corePath:new URL('./vendor/tesseract-core/',document.baseURI).href,
  ...(def.langs.every(lang=>['kor','eng','fra'].includes(lang))
    ? {langPath:new URL('./vendor/tessdata/',document.baseURI).href,gzip:false}:{}),
});
