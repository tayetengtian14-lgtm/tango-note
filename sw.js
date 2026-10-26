// アプリの画面とFirebaseのプログラムを端末に保存して、電波がなくても開けるようにする
// 新しい版をアップロードしたときは、ネットにつながっていれば新しい方が使われる（ネット優先）
const CACHE = 'tango-note-v3';
const SHELL = ['./', './index.html', './style.css', './app.js', './parse.js', './amino.js', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !sdk && !fonts) return; // データの通信（Firestore）はそのまま通す
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: ours }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
