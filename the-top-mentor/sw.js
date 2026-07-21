// The Top Mentoring — Service Worker (network-first เพื่อไม่ให้ค้าง bundle เก่า + fallback ออฟไลน์)
const CACHE = 'ttm-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ไม่ยุ่งกับ Supabase / Google Fonts / API ภายนอก
  e.respondWith(
    fetch(req).then((res) => {
      const cp = res.clone();
      caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
