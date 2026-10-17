// The worker stores the application shell only: no photographs, profiles,
// inference output, API responses or third-party OCR downloads.
const COPY = {
  en: {install:'Install ADPAI', help:'How to install', title:'ADPAI on your home screen', body:'Android: use Install ADPAI or your browser menu → Install app / Add to Home screen. iPhone/iPad: open this page in Safari, tap Share → Add to Home Screen. OCR may need an internet connection to download its engine and language models. Installation does not improve recognition accuracy.', close:'Close', offline:'You are offline. OCR may be unavailable. An incomplete read cannot confirm absence of allergens.'},
  ko: {install:'ADPAI 설치', help:'설치 방법', title:'홈 화면에 ADPAI 추가', body:'Android: ADPAI 설치 또는 브라우저 메뉴 → 앱 설치 / 홈 화면에 추가. iPhone/iPad: Safari에서 공유 → 홈 화면에 추가를 선택하세요. OCR 엔진과 언어 모델을 내려받으려면 인터넷이 필요할 수 있습니다. 설치 자체로 인식 정확도가 높아지지는 않습니다.', close:'닫기', offline:'오프라인 상태입니다. OCR을 사용하지 못할 수 있습니다. 불완전한 판독은 알레르기 유발물질 부재를 확인할 수 없습니다.'}
};
let promptEvent;
const native = () => Boolean(globalThis.ADPAI_NATIVE);
export function updateInstallUI() {
  const copy = COPY[document.documentElement.lang] || COPY.en;
  for (const [id,key] of [['installApp','install'],['installHelp','help'],['installTitle','title'],['installBody','body'],['closeInstall','close'],['offlineNotice','offline']]) {
    const el=document.getElementById(id); if(el) el.textContent=copy[key];
  }
  const installed=matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  document.getElementById('installPanel').hidden=native() || Boolean(installed);
  document.getElementById('installApp').hidden=!promptEvent;
  document.getElementById('offlineNotice').hidden=native() || navigator.onLine;
}
export function initPwa() {
  if(native()) { updateInstallUI(); return; }
  window.addEventListener('beforeinstallprompt', event => {event.preventDefault();promptEvent=event;updateInstallUI();});
  window.addEventListener('appinstalled', () => {promptEvent=undefined;updateInstallUI();});
  window.addEventListener('online',updateInstallUI);
  window.addEventListener('offline',updateInstallUI);
  matchMedia('(display-mode: standalone)').addEventListener('change',updateInstallUI);
  document.getElementById('installHelp').onclick=()=>document.getElementById('installDialog').showModal();
  document.getElementById('closeInstall').onclick=()=>document.getElementById('installDialog').close();
  document.getElementById('installApp').onclick=async()=>{
    const event=promptEvent;
    if(!event) return;
    promptEvent=undefined;updateInstallUI();
    try {await event.prompt();await event.userChoice;} catch { /* Instructions remain available. */ }
  };
  updateInstallUI();
  if('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{updateViaCache:'none'})
      .catch(error=>console.warn('ADPAI offline shell unavailable:',error));
  }
}
