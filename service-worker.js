// ============================================================
// SERVICE WORKER — TaskAlert PWA (cache v9) + Push Notifications
// ============================================================

// Import Firebase Messaging SW
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inicjalizacja Firebase w Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyCE8U6I6gs51OtzoAdEXHCOucXyQOzaBE8",
    authDomain: "taskalert-app-8d45d.firebaseapp.com",
    projectId: "taskalert-app-8d45d",
    storageBucket: "taskalert-app-8d45d.firebasestorage.app",
    messagingSenderId: "981946997404",
    appId: "1:981946997404:web:dcf93a4a14b24898cfeb59"
});

const messaging = firebase.messaging();

const CACHE_NAME = 'taskalert-v36';
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
    './js/modules/admin-users.js',
    './js/modules/team-alerts.js',
    './js/modules/pwa-install-banner.js',
    './js/modules/push-notifications.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/badge-72.png',
    './icons/badge.png'
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

    // Local assets — Network First z Cache Fallback (gwarantuje najnowsze pliki po odświeżeniu)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============================================================
// PUSH NOTIFICATIONS — Obsługa w tle
// ============================================================

// Obsługa wiadomości push w tle (background)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background push message:', payload);

    const notificationTitle = payload.notification?.title || '🔔 TaskAlert';
    const alertId = payload.data?.alertId || payload.notification?.tag || 'taskalert-notification';
    const targetUrl = payload.data?.url || (payload.data?.alertId ? `./?alertId=${encodeURIComponent(payload.data.alertId)}` : './');
    const notificationOptions = {
        body: payload.notification?.body || 'Masz nowe powiadomienie',
        icon: './icons/icon-192.png',
        badge: './icons/badge-72.png',
        tag: alertId,
        data: {
            alertId: payload.data?.alertId,
            url: targetUrl
        },
        actions: [
            { action: 'snooze5', title: '⏰ 5 min' },
            { action: 'snooze10', title: '⏰ 10 min' },
            { action: 'dismiss', title: '🔕 Wyłącz' }
        ],
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Obsługa kliknięcia w powiadomienie
self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const action = event.action;
    const data = notification.data || {};
    const alertId = data.alertId;
    const targetUrl = data.url || (alertId ? `./?alertId=${encodeURIComponent(alertId)}` : './');

    notification.close();

    if (action === 'snooze5') {
        // Drzemka 5 minut — pokaż ponownie po 5 min
        event.waitUntil(
            new Promise(resolve => {
                setTimeout(() => {
                    self.registration.showNotification(notification.title + ' (drzemka)', {
                        body: notification.body,
                        icon: './icons/icon-192.png',
                        badge: './icons/badge-72.png',
                        tag: (data.alertId || 'taskalert') + '-snooze',
                        data: data,
                        requireInteraction: true,
                        vibrate: [200, 100, 200]
                    });
                    resolve();
                }, 5 * 60 * 1000);
            })
        );
        return;
    }

    if (action === 'snooze10') {
        // Drzemka 10 minut
        event.waitUntil(
            new Promise(resolve => {
                setTimeout(() => {
                    self.registration.showNotification(notification.title + ' (drzemka)', {
                        body: notification.body,
                        icon: './icons/icon-192.png',
                        badge: './icons/badge-72.png',
                        tag: (data.alertId || 'taskalert') + '-snooze',
                        data: data,
                        requireInteraction: true,
                        vibrate: [200, 100, 200]
                    });
                    resolve();
                }, 10 * 60 * 1000);
            })
        );
        return;
    }

    if (action === 'dismiss') {
        // Wyłącz — po prostu zamknij
        return;
    }

    // Domyślne kliknięcie — otwórz aplikację na alercie
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Jeśli okno jest otwarte — sfokusuj je i wyślij komunikat o otwarciu alertu
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if (alertId) {
                        client.postMessage({
                            type: 'PUSH_NOTIFICATION_CLICK',
                            alertId: alertId
                        });
                    }
                    return;
                }
            }
            // Brak otwartego okna — otwórz nowe okno z parametrem alertId
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// Obsługa zamknięcia powiadomienia
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification closed:', event.notification.tag);
});
