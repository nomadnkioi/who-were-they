const CACHE_NAME = 'relation-map-cache-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Inter:wght@400;500;600;700&display=swap'
];

// Install Event: 캐시 등록
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: 구버전 캐시 정리
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: 캐시 우선 / 네트워크 폴백 정책 (API 요청은 캐시 제외)
self.addEventListener('fetch', (e) => {
  // 클라우드 동기화 API 및 Firebase 통신 요청은 항상 네트워크에서 실시간으로 가져옴
  if (
    e.request.url.includes('api.npoint.io') || 
    e.request.url.includes('firebaseio.com') || 
    e.request.url.includes('googleapis.com')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // 유효한 응답인 경우에만 추가 캐싱 시도 (선택 사항)
        if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
