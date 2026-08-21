// ============================================================
// CLOUD FUNCTIONS — TaskAlert Push Notifications
// Scheduler: codziennie o 9:00 czasu polskiego (Europe/Warsaw)
// uwzględnia automatycznie zmianę czasu letni/zimowy (DST)
// ============================================================

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();

// ============================================================
// SCHEDULED PUSH NOTIFICATIONS — codziennie o 9:00 Europe/Warsaw
// ============================================================
exports.scheduledAlertCheck = onSchedule({
    schedule: '0 9 * * *',          // codziennie o 9:00
    timeZone: 'Europe/Warsaw',       // czas polski (DST auto)
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 120
}, async (event) => {
    console.log('[Functions] Rozpoczynam dobowe sprawdzanie alertów push...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let sentCount = 0;

    // ── 1. Sprawdź prywatne alerty (per-user) ───────
    const usersSnap = await db.collection('users').get();
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        // Sprawdź czy user ma włączone push
        const pushConfigSnap = await db.doc(`users/${uid}/settings/pushConfig`).get();
        if (!pushConfigSnap.exists || !pushConfigSnap.data().pushEnabled) continue;

        const pushConfig = pushConfigSnap.data();
        const fcmTokens = pushConfig.fcmTokens || [];
        const mutedAlerts = pushConfig.mutedAlerts || [];

        if (fcmTokens.length === 0) continue;

        // Pobierz aktywne przypomnienia
        const remindersSnap = await db.collection(`users/${uid}/reminders`).get();
        for (const reminderDoc of remindersSnap.docs) {
            const reminder = reminderDoc.data();
            if (reminder.status !== 'active') continue;
            if (mutedAlerts.includes(reminderDoc.id)) continue;

            const expiryDate = reminder.expiryDate ? reminder.expiryDate.toDate() : null;
            if (!expiryDate) continue;

            expiryDate.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

            const rawAlertDays = reminder.alertDays || [30, 14, 7, 3, 1];
            const alertDays = [...rawAlertDays].sort((a, b) => b - a);
            const alertFlags = { ...(reminder.alertFlags || {}) };
            let flagsUpdated = false;

            // Sprawdź czy dzisiejszy dzień pasuje do progu alertu
            for (const threshold of alertDays) {
                const flagKey = String(threshold);
                if (daysLeft <= threshold && daysLeft >= 0 && !alertFlags[flagKey]) {
                    // Wyślij push
                    await sendPushToTokens(fcmTokens, {
                        title: `⏰ ${reminder.title}`,
                        body: daysLeft <= 0
                            ? `🔴 Termin minął dzisiaj (${formatDatePL(expiryDate)})!`
                            : `Pozostało ${daysLeft} dni do terminu (${formatDatePL(expiryDate)})`,
                        data: { alertId: reminderDoc.id, url: `./?alertId=${reminderDoc.id}` }
                    }, uid);
                    sentCount++;

                    // Oznacz bieżący próg oraz wyższe jako obsłużone
                    alertFlags[flagKey] = true;
                    for (const higherThreshold of alertDays) {
                        if (higherThreshold >= threshold) {
                            alertFlags[String(higherThreshold)] = true;
                        }
                    }
                    flagsUpdated = true;
                    break; // Jeden push na alert na dzień
                }
            }

            if (flagsUpdated) {
                await reminderDoc.ref.update({ alertFlags });
            }
        }
    }

    // ── 2. Sprawdź alerty współdzielone ─────────────
    const sharedSnap = await db.collection('sharedAlerts').get();
    for (const alertDoc of sharedSnap.docs) {
        const alert = alertDoc.data();
        if (alert.status !== 'active') continue;

        const expiryDate = alert.expiryDate ? alert.expiryDate.toDate() : null;
        if (!expiryDate) continue;

        expiryDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        const rawAlertDays = alert.alertDays || [30, 14, 7, 3, 1];
        const alertDays = [...rawAlertDays].sort((a, b) => b - a);
        const alertFlags = { ...(alert.alertFlags || {}) };
        let flagsUpdated = false;

        for (const threshold of alertDays) {
            const flagKey = String(threshold);
            if (daysLeft <= threshold && daysLeft >= 0 && !alertFlags[flagKey]) {
                // Wyślij push do wszystkich uczestników
                const participantUids = alert.participantUids || (alert.participants || []).map(p => p.uid);
                for (const pUid of participantUids) {
                    const pushConfigSnap = await db.doc(`users/${pUid}/settings/pushConfig`).get();
                    if (!pushConfigSnap.exists || !pushConfigSnap.data().pushEnabled) continue;

                    const pushConfig = pushConfigSnap.data();
                    const fcmTokens = pushConfig.fcmTokens || [];
                    const mutedAlerts = pushConfig.mutedAlerts || [];

                    if (fcmTokens.length === 0 || mutedAlerts.includes(alertDoc.id)) continue;

                    await sendPushToTokens(fcmTokens, {
                        title: `👥 ${alert.title}`,
                        body: daysLeft <= 0
                            ? `🔴 Termin minął dzisiaj! (alert zespołowy)`
                            : `Pozostało ${daysLeft} dni do terminu (${formatDatePL(expiryDate)})`,
                        data: { alertId: alertDoc.id, url: `./?alertId=${alertDoc.id}#team-alerts` }
                    }, pUid);
                    sentCount++;
                }

                alertFlags[flagKey] = true;
                for (const higherThreshold of alertDays) {
                    if (higherThreshold >= threshold) {
                        alertFlags[String(higherThreshold)] = true;
                    }
                }
                flagsUpdated = true;
                break;
            }
        }

        if (flagsUpdated) {
            await alertDoc.ref.update({ alertFlags });
        }
    }

    console.log(`[Functions] Wysłano ${sentCount} powiadomień push.`);
});

// ============================================================
// RĘCZNE TESTOWE PUSH — wyzwalane przez zapis do Firestore
// Kolekcja: pushTest/{docId} z polami: uid, title, body
// ============================================================
exports.onPushTestRequest = onDocumentCreated({
    document: 'pushTest/{docId}',
    region: 'europe-west1'
}, async (event) => {
    const data = event.data.data();
    const uid = data.uid;
    const title = data.title || '🔔 TaskAlert — Test Push';
    const body = data.body || 'To jest testowe powiadomienie push z Cloud Functions.';

    if (!uid) {
        console.warn('[Functions] pushTest bez uid');
        return;
    }

    const pushConfigSnap = await db.doc(`users/${uid}/settings/pushConfig`).get();
    if (!pushConfigSnap.exists) {
        console.warn('[Functions] Brak pushConfig dla uid:', uid);
        return;
    }

    const fcmTokens = pushConfigSnap.data().fcmTokens || [];
    if (fcmTokens.length === 0) {
        console.warn('[Functions] Brak tokenów FCM dla uid:', uid);
        return;
    }

    await sendPushToTokens(fcmTokens, { title, body, data: { alertId: 'test-push', url: './' } }, uid);
    console.log(`[Functions] Wysłano testowe push do uid: ${uid}`);

    // Usuń dokument po wysłaniu
    await event.data.ref.delete();
});

// ============================================================
// HELPER: Wysyłanie push do listy tokenów FCM
// ============================================================
async function sendPushToTokens(tokens, { title, body, data = {} }, uid = null) {
    if (!tokens || tokens.length === 0) return;

    const messaging = getMessaging();
    const alertTag = data.alertId || 'taskalert-notification';
    const targetUrl = data.url || (data.alertId ? `./?alertId=${encodeURIComponent(data.alertId)}` : './');

    const message = {
        notification: {
            title,
            body
        },
        data: data || {},
        webpush: {
            notification: {
                icon: './icons/icon-192.png',
                badge: './icons/badge-72.png',
                tag: alertTag,
                requireInteraction: true,
                actions: [
                    { action: 'snooze5', title: '⏰ 5 min' },
                    { action: 'snooze10', title: '⏰ 10 min' },
                    { action: 'dismiss', title: '🔕 Wyłącz' }
                ]
            },
            fcmOptions: {
                link: targetUrl
            }
        }
    };

    const uniqueTokens = [...new Set(tokens)];
    const invalidTokens = [];

    for (const token of uniqueTokens) {
        try {
            await messaging.send({ ...message, token });
        } catch (err) {
            console.error(`[Functions] Błąd wysyłania push do tokenu ${token.substring(0, 15)}...:`, err.message);
            if (err.code === 'messaging/invalid-registration-token' ||
                err.code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(token);
            }
        }
    }

    // Usuń nieaktywne / wygasłe tokeny z Firestore
    if (invalidTokens.length > 0 && uid) {
        try {
            const pushConfigRef = db.doc(`users/${uid}/settings/pushConfig`);
            const snap = await pushConfigRef.get();
            if (snap.exists) {
                const currentTokens = snap.data().fcmTokens || [];
                const updatedTokens = currentTokens.filter(t => !invalidTokens.includes(t));
                await pushConfigRef.update({ fcmTokens: updatedTokens });
                console.log(`[Functions] Usunięto ${invalidTokens.length} nieaktywnych tokenów dla uid: ${uid}`);
            }
        } catch (cleanupErr) {
            console.warn('[Functions] Błąd czyszczenia nieaktywnych tokenów:', cleanupErr.message);
        }
    }
}

function formatDatePL(date) {
    if (!date) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}
