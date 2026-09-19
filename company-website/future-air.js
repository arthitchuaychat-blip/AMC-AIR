/* UI-only public site enhancements. No order submission or database writes. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  // Branch previews use the public catalog, but must not create real customer requests.
  // Production custom domains and existing production aliases keep their original behavior.
  if (location.hostname.endsWith('.vercel.app') && location.hostname.includes('-git-')) {
    document.addEventListener('submit', event => {
      if (!['leadForm','orderForm'].includes(event.target.id)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof window.toast === 'function') window.toast('หน้าทดลอง: ยังไม่ได้ส่งคำขอหรือสร้างรายการจริง');
    }, true);
  }
  // Reuse the site's existing attribution key so a landing-page visit keeps its source.
  if (document.body.classList.contains('fa-landing')) {
    try {
      if (!localStorage.getItem('amc_attr')) {
        const data = { source:params.get('utm_source') || '', medium:params.get('utm_medium') || '',
          campaign:params.get('utm_campaign') || '', content:params.get('utm_content') || '',
          gclid:params.get('gclid') || '', fbclid:params.get('fbclid') || '', ref:document.referrer || '', at:new Date().toISOString() };
        if (!data.source && data.ref) {
          const ref = data.ref.toLowerCase();
          data.source = ['facebook','google','line','instagram','tiktok'].find(name => ref.includes(name)) || '';
        }
        localStorage.setItem('amc_attr', JSON.stringify(data));
      }
    } catch (_) { /* Storage is optional; links still carry the campaign parameters. */ }
  }
  // Carry the campaign into the existing first-touch attribution / order flow.
  const attributionKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'];
  document.querySelectorAll('a[data-campaign-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.origin);
    attributionKeys.forEach(key => { const value = params.get(key); if (value) url.searchParams.set(key, value.slice(0,500)); });
    link.href = url.pathname + url.search + url.hash;
  });
  const note = document.querySelector('#leadForm textarea[name="note"]');
  const interest = params.get('interest');
  if (note && interest && !note.value) note.value = 'สนใจ: ' + interest.slice(0,200);

  document.querySelectorAll('[data-fa-banners]').forEach(gallery => {
    const slides = Array.from(gallery.querySelectorAll('figure'));
    const controls = gallery.querySelector('.fa-banner-controls');
    if (slides.length < 2 || !controls) return;
    let index = 0;
    // Every original image is visible without JS; JS adds manual paging.
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.hidden = i !== index; });
      gallery.querySelector('[data-fa-count]').textContent = (index + 1) + ' / ' + slides.length;
    }
    controls.hidden = false;
    gallery.querySelector('[data-fa-prev]').addEventListener('click', () => show(index - 1));
    gallery.querySelector('[data-fa-next]').addEventListener('click', () => show(index + 1));
    show(0);
  });

  // Preserve the original covers on the homepage and let users pause rotation.
  const pause = document.getElementById('hsPause');
  if (pause) pause.addEventListener('click', () => {
    const paused = pause.getAttribute('aria-pressed') !== 'true';
    pause.setAttribute('aria-pressed', String(paused));
    // The existing language observer translates new Thai text and can restore it on toggle.
    pause.textContent = paused ? 'เล่นภาพต่อ' : 'พักภาพ';
  });
})();
