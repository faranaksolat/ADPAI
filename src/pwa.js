// PWA installation links deliberately remain visible on both Android and iOS.
// Native Android/iOS store packages are not presented as the current web release.
const COPY = {
  en: {
    download:'Download ADPAI', menuTitle:'Choose your device',
    androidTitle:'Android', androidHint:'Install the latest web app',
    iosTitle:'iOS / iPhone', iosHint:'Safari · Add to Home Screen',
    menuNote:'Installs the current website as an app. Native store apps are not released yet.',
    dialogTitle:'Install ADPAI',
    androidBody:'Android: open ADPAI in Chrome, tap the browser menu (⋮), then select Install app or Add to Home screen. If a browser install prompt appears, follow it. This installs the current website as a web app, not a separate APK. An internet connection may be needed for OCR.',
    iosBody:'iPhone / iPad: open this website in Safari, tap Share, then Add to Home Screen → Add. This installs the current website as a web app, not an App Store app. An internet connection may be needed for OCR.',
    close:'Close',offline:'You are offline. OCR may be unavailable. An incomplete read cannot confirm absence of allergens.'
  },
  ko: {
    download:'ADPAI 다운로드',menuTitle:'기기를 선택하세요',
    androidTitle:'Android',androidHint:'최신 웹앱 설치',
    iosTitle:'iOS / iPhone',iosHint:'Safari · 홈 화면에 추가',
    menuNote:'현재 웹사이트를 앱처럼 설치합니다. 스토어용 네이티브 앱은 아직 출시되지 않았습니다.',
    dialogTitle:'ADPAI 설치',
    androidBody:'Android: Chrome에서 ADPAI를 연 뒤 브라우저 메뉴(⋮)에서 앱 설치 또는 홈 화면에 추가를 선택하세요. 설치 안내가 표시되면 따라 주세요. 별도 APK가 아닌 현재 웹사이트를 웹앱으로 설치합니다. OCR에는 인터넷 연결이 필요할 수 있습니다.',
    iosBody:'iPhone / iPad: Safari에서 이 사이트를 열고 공유 → 홈 화면에 추가 → 추가를 선택하세요. App Store 앱이 아닌 현재 웹사이트를 웹앱으로 설치합니다. OCR에는 인터넷 연결이 필요할 수 있습니다.',
    close:'닫기',offline:'오프라인 상태입니다. OCR을 사용하지 못할 수 있습니다. 불완전한 판독은 알레르기 유발물질 부재를 확인할 수 없습니다.'
  }
};
let promptEvent;
let dialogPlatform='ios';
const native=()=>Boolean(globalThis.ADPAI_NATIVE);
const byId=id=>document.getElementById(id);
function setMenuOpen(open) {
  byId('downloadMenu').hidden=!open;
  byId('downloadToggle').setAttribute('aria-expanded',String(open));
}
function openInstallGuide(platform) {
  dialogPlatform=platform;
  updateInstallUI();
  byId('installDialog').showModal();
}
export function updateInstallUI() {
  const copy=COPY[document.documentElement.lang]||COPY.en;
  for(const [id,key] of [
    ['downloadMenuTitle','menuTitle'],['androidOptionTitle','androidTitle'],
    ['androidOptionHint','androidHint'],['iosOptionTitle','iosTitle'],
    ['iosOptionHint','iosHint'],['downloadMenuNote','menuNote'],
    ['installTitle','dialogTitle'],['closeInstall','close'],
    ['offlineNotice','offline']
  ]) {
    const el=byId(id);if(el)el.textContent=copy[key];
  }
  byId('downloadToggle').firstChild.textContent=copy.download+' ';
  byId('installBody').textContent=copy[dialogPlatform+'Body'];
  byId('installPanel').hidden=native();
  byId('offlineNotice').hidden=native()||navigator.onLine;
}
export function initPwa() {
  if(native()){updateInstallUI();return;}
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();promptEvent=event;updateInstallUI();
  });
  window.addEventListener('appinstalled',()=>{
    promptEvent=undefined;updateInstallUI();
  });
  window.addEventListener('online',updateInstallUI);
  window.addEventListener('offline',updateInstallUI);
  matchMedia('(display-mode: standalone)').addEventListener('change',updateInstallUI);
  byId('downloadToggle').onclick=()=>setMenuOpen(byId('downloadMenu').hidden);
  byId('installHelp').onclick=()=>{
    setMenuOpen(false);
    openInstallGuide('ios');
  };
  byId('installApp').onclick=async()=>{
    setMenuOpen(false);
    const event=/Android/i.test(navigator.userAgent)&&promptEvent;
    if(!event){openInstallGuide('android');return;}
    promptEvent=undefined;
    updateInstallUI();
    try{await event.prompt();await event.userChoice;}
    catch{openInstallGuide('android');}
  };
  byId('closeInstall').onclick=()=>byId('installDialog').close();
  document.addEventListener('pointerdown',event=>{
    if(!byId('installPanel').contains(event.target))setMenuOpen(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!byId('downloadMenu').hidden){
      setMenuOpen(false);
      byId('downloadToggle').focus();
    }
  });
  updateInstallUI();
  if('serviceWorker' in navigator&&window.isSecureContext){
    navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{updateViaCache:'none'})
      .catch(error=>console.warn('ADPAI offline shell unavailable:',error));
  }
}
