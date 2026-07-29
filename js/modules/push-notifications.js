// ============================================================
// PUSH NOTIFICATIONS MODULE — Firebase Cloud Messaging
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { app } from '../firebase-config.js';
import { db, auth } from '../firebase-config.js';
import {
    doc, setDoc, getDoc, updateDoc, serverTimestamp, deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// FCM VAPID Key
const VAPID_KEY = 'BJgKuXdohCprPMGTM1KUVC-gEBY-l21aOk7t2FZjBXDGaDPuPmjk0Ka3PZAxShKEaS5C4TcPfTPJD0XysOUrDIo';

let messaging = null;

// Lazy-load FCM (nie wszystkie przeglądarki obsługują)
async function getMessagingInstance() {
    if (messaging) return messaging;
    try {
        const { getMessaging, isSupported } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
        const supported = await isSupported();
        if (!supported) {
            console.warn('[Push] Firebase Messaging nie jest wspierane w tej przeglądarce.');
            return null;
        }
        messaging = getMessaging(app);
        return messaging;
    } catch (err) {
        console.warn('[Push] Błąd ładowania Firebase Messaging:', err);
        return null;
    }
}

// Sprawdź status uprawnień
export function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'granted' | 'denied' | 'default'
}

// Poproś o uprawnienia i zarejestruj token
export async function requestPushPermission() {
    if (!('Notification' in window)) {
        throw new Error('Powiadomienia nie są wspierane w tej przeglądarce.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Użytkownik nie wyraził zgody na powiadomienia.');
    }

    // Pobierz token FCM
    const msg = await getMessagingInstance();
    if (!msg) throw new Error('Firebase Messaging niedostępne.');

    const { getToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');

    const swRegistration = await navigator.serviceWorker.getRegistration();
    const token = await getToken(msg, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration
    });

    if (!token) throw new Error('Nie udało się uzyskać tokenu FCM.');

    // Zapisz token w Firestore
    await saveToken(token);
    console.log('[Push] Token FCM zarejestrowany:', token.substring(0, 20) + '...');

    return token;
}

// Zapisz token FCM w Firestore
async function saveToken(token) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const pushConfigRef = doc(db, 'users', uid, 'settings', 'pushConfig');
    const snap = await getDoc(pushConfigRef);
    const existing = snap.exists() ? snap.data() : {};

    const tokens = existing.fcmTokens || [];
    if (!tokens.includes(token)) {
        tokens.push(token);
    }

    await setDoc(pushConfigRef, {
        pushEnabled: true,
        fcmTokens: tokens,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

// Wyłącz powiadomienia push
export async function disablePushNotifications() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const pushConfigRef = doc(db, 'users', uid, 'settings', 'pushConfig');
    await setDoc(pushConfigRef, {
        pushEnabled: false,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

// Sprawdź czy push jest włączony
export async function isPushEnabled() {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const pushConfigRef = doc(db, 'users', uid, 'settings', 'pushConfig');
    const snap = await getDoc(pushConfigRef);
    if (!snap.exists()) return false;
    return snap.data().pushEnabled === true;
}

// Obsługa wiadomości w foreground
export async function setupForegroundHandler() {
    const msg = await getMessagingInstance();
    if (!msg) return;

    const { onMessage } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');

    onMessage(msg, (payload) => {
        console.log('[Push] Foreground message:', payload);

        const { title, body, data } = payload.notification || {};
        const alertId = payload.data?.alertId || data?.alertId;

        // Pokaż toast w aplikacji
        if (window.TaskAlert?.showToast) {
            window.TaskAlert.showToast(
                `🔔 ${title || 'Powiadomienie'}: ${body || ''}`,
                'info',
                { duration: 10000 }
            );
        }

        // Opcjonalnie pokaż natywne powiadomienie
        if (Notification.permission === 'granted') {
            const notification = new Notification(title || 'TaskAlert', {
                body: body || '',
                icon: './icons/icon-192.png',
                badge: './icons/icon-192.png',
                tag: alertId || 'taskalert-notification',
                data: { alertId, url: payload.data?.url },
                actions: [
                    { action: 'snooze5', title: '⏰ Drzemka 5 min' },
                    { action: 'snooze10', title: '⏰ Drzemka 10 min' },
                    { action: 'dismiss', title: '🔕 Wyłącz alert' }
                ]
            });

            notification.addEventListener('click', () => {
                window.focus();
                if (alertId) {
                    window.TaskAlert.showReminderDetailsModal(alertId);
                }
            });
        }
    });
}

// Wyślij testowe powiadomienie push (lokalne)
export async function sendTestPushNotification() {
    if (Notification.permission !== 'granted') {
        throw new Error('Brak uprawnień do powiadomień. Włącz je najpierw.');
    }

    const notification = new Notification('🔔 TaskAlert — Test', {
        body: 'To jest testowe powiadomienie push. Jeśli je widzisz — wszystko działa poprawnie!',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'taskalert-test',
        requireInteraction: true
    });

    notification.addEventListener('click', () => {
        window.focus();
        notification.close();
    });

    setTimeout(() => notification.close(), 8000);
}

// Wycisz powiadomienia push dla konkretnego alertu
export async function muteAlertPush(reminderId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const pushConfigRef = doc(db, 'users', uid, 'settings', 'pushConfig');
    const snap = await getDoc(pushConfigRef);
    const existing = snap.exists() ? snap.data() : {};
    const mutedAlerts = existing.mutedAlerts || [];

    if (!mutedAlerts.includes(reminderId)) {
        mutedAlerts.push(reminderId);
    }

    await setDoc(pushConfigRef, { mutedAlerts, updatedAt: serverTimestamp() }, { merge: true });
}

// Odcisz powiadomienia push dla alertu
export async function unmuteAlertPush(reminderId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const pushConfigRef = doc(db, 'users', uid, 'settings', 'pushConfig');
    const snap = await getDoc(pushConfigRef);
    const existing = snap.exists() ? snap.data() : {};
    const mutedAlerts = (existing.mutedAlerts || []).filter(id => id !== reminderId);

    await setDoc(pushConfigRef, { mutedAlerts, updatedAt: serverTimestamp() }, { merge: true });
}
