// ============================================================
// SERVICE WORKER — TaskAlert PWA (cache v8)
// ============================================================

const CACHE_NAME = 'taskalert-v8';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/firebase-config.js',
    './js/auth.js',
    './js/app.js',
    './js/db.js',
    './js/modules/dashboard.js',
    './js/modules/samochody.js',
    './js/modules/kadry.js',
    './js/modules/inne.js',
    './js/modules/kategorie.js',
    './js/modules/historia.js',
    './js/modules/ustawienia.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Instalacja — cache assetów
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Aktywacja — czyszczenie starych cache'y
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch — Cache First dla assetów, Network First dla API
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Firebase API — Network First
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Google Fonts — Cache First
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Local assets — Cache First z Network Fallback
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});
