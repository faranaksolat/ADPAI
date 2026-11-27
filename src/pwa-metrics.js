const firstOpenKey = 'adpai.pwa-first-open';

export function initPwaMetrics() {
  const id = document.querySelector('meta[name="adpai-analytics-id"]')?.content.trim();
  if (!/^G-[A-Z0-9]+$/.test(id ?? '')) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;

  const events = window.dataLayer ??= [];
  function tag() {
    events.push(arguments);
  }

  tag('js', new Date());
  tag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
    page_title: 'ADPAI',
    page_location: location.origin + location.pathname,
    page_referrer: '',
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.addEventListener('load', () => {
    tag('event', 'page_view');
    if (!window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone) return;

    try {
      const key = `${firstOpenKey}:${id}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      // If persistent storage is unavailable, repeated openings cannot be deduplicated.
      return;
    }
    tag('event', 'pwa_first_open');
  }, { once: true });
  document.head.append(script);
}
