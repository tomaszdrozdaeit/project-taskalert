// ============================================================
// DAILY CHECK SCRIPT — GitHub Actions / Node.js
// TaskAlert — Sprawdzanie terminów, generowanie powiadomień E-MAIL oraz PUSH
// ============================================================

const admin = require('firebase-admin');

async function loadMailUtils() {
    const mod = await import('../js/mail-utils.mjs');
    return mod;
}

// Inicjalizacja Firebase Admin SDK z Service Account
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT ? process.env.FIREBASE_SERVICE_ACCOUNT.trim() : '';

if (serviceAccountRaw) {
    try {
        const serviceAccount = JSON.parse(serviceAccountRaw);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || 'taskalert-app-8d45d'
        });
        console.log('[DailyCheck] Połączono z Firebase używając podanego FIREBASE_SERVICE_ACCOUNT.');
    } catch (err) {
        console.error('[DailyCheck] Błąd parsowania FIREBASE_SERVICE_ACCOUNT:', err.message);
        process.exit(1);
    }
} else {
    console.error('================================================================');
    console.error('[DailyCheck] BŁĄD KONFIGURACJI: Brak zmiennej FIREBASE_SERVICE_ACCOUNT!');
    console.error('Aby automatyczne sprawdzanie alertów w GitHub Actions działało:');
    console.error('1. Przejdź do konsoli Firebase -> Project Settings -> Service Accounts.');
    console.error('2. Wygeneruj nowy klucz prywatny (JSON).');
    console.error('3. Przejdź do GitHub -> Settings -> Secrets and variables -> Actions.');
    console.error('4. Utwórz sekret "FIREBASE_SERVICE_ACCOUNT" i wklej zawartość pliku JSON.');
    console.error('================================================================');
    process.exit(1);
}

const db = admin.firestore();

// Helper do wysyłania FCM Web Push
async function sendPushToTokens(tokens, { title, body, data = {} }, uid = null) {
    if (!tokens || tokens.length === 0) return 0;

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
    let successful = 0;

    for (const token of uniqueTokens) {
        try {
            await admin.messaging().send({ ...message, token });
            successful++;
        } catch (err) {
            console.warn(`[DailyCheck] Błąd wysyłania push do tokenu ${token.substring(0, 15)}...:`, err.message);
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
                console.log(`[DailyCheck] Usunięto ${invalidTokens.length} nieaktywnych tokenów dla uid: ${uid}`);
            }
        } catch (cleanupErr) {
            console.warn('[DailyCheck] Błąd czyszczenia nieaktywnych tokenów:', cleanupErr.message);
        }
    }

    return successful;
}

function formatDatePL(date) {
    if (!date) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

async function runDailyCheck() {
    const { buildMailPayload } = await loadMailUtils();
    console.log('[DailyCheck] Rozpoczynam dobową weryfikację terminów...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let emailSentCount = 0;
    let pushSentCount = 0;

    // ── 1. Sprawdź prywatne przypomnienia ──────────────────
    let reminderDocs = [];
    try {
        const snapshot = await db.collectionGroup('reminders').get();
        reminderDocs = snapshot.docs.filter(doc => doc.data().status === 'active');
        console.log(`[DailyCheck] Znaleziono ${reminderDocs.length} aktywnych przypomnień prywatnych.`);
    } catch (cgErr) {
        console.warn('[DailyCheck] collectionGroup niedostępny, przełączanie na pobieranie per-użytkownik:', cgErr.message);
        const usersSnap = await db.collection('users').get();
        for (const userDoc of usersSnap.docs) {
            const userRemindersSnap = await userDoc.ref.collection('reminders').get();
            const activeDocs = userRemindersSnap.docs.filter(doc => doc.data().status === 'active');
            reminderDocs.push(...activeDocs);
        }
        console.log(`[DailyCheck] Znaleziono ${reminderDocs.length} aktywnych przypomnień (fallback).`);
    }

    for (const docSnap of reminderDocs) {
        const reminder = docSnap.data();
        const expiryDate = reminder.expiryDate ? reminder.expiryDate.toDate() : null;
        if (!expiryDate) continue;

        expiryDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        // Sortuj progi malejąco [30, 14, 7, 3, 1]
        const rawAlertDays = reminder.alertDays || [30, 14, 7, 3, 1];
        const alertDays = [...rawAlertDays].sort((a, b) => b - a);
        const alertFlags = { ...(reminder.alertFlags || {}) };
        let flagsUpdated = false;

        for (const daysThreshold of alertDays) {
            const flagKey = String(daysThreshold);

            // Jeśli pozostało <= threshold dni i powiadomienie dla tego progu nie zostało jeszcze wysłane
            if (daysLeft <= daysThreshold && daysLeft >= 0 && !alertFlags[flagKey]) {
                console.log(`[DailyCheck] Alert dla "${reminder.title}": pozostało ${daysLeft} dni (próg ${daysThreshold} dni).`);

                // 1. Wyślij E-MAIL (jeden na dzień)
                const payload = buildMailPayload({
                    ...reminder,
                    expiryDate: expiryDate
                }, {
                    subject: `⏰ TaskAlert: Przypomnienie — ${reminder.title} (za ${daysLeft} dni)`,
                    recipients: [reminder.primaryEmail, reminder.secondaryEmail]
                });

                if (payload.to.length > 0) {
                    await db.collection('mail').add({
                        to: payload.to,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        message: payload.message
                    });
                    emailSentCount++;
                }

                // 2. Wyślij PUSH do właściciela przypomnienia
                try {
                    const uid = docSnap.ref.parent?.parent?.id;
                    if (uid) {
                        const pushConfigSnap = await db.doc(`users/${uid}/settings/pushConfig`).get();
                        if (pushConfigSnap.exists && pushConfigSnap.data().pushEnabled) {
                            const pushConfig = pushConfigSnap.data();
                            const fcmTokens = pushConfig.fcmTokens || [];
                            const mutedAlerts = pushConfig.mutedAlerts || [];

                            if (fcmTokens.length > 0 && !mutedAlerts.includes(docSnap.id)) {
                                const pushSuccess = await sendPushToTokens(fcmTokens, {
                                    title: `⏰ ${reminder.title}`,
                                    body: daysLeft <= 0
                                        ? `🔴 Termin minął dzisiaj (${formatDatePL(expiryDate)})!`
                                        : `Pozostało ${daysLeft} dni do terminu (${formatDatePL(expiryDate)})`,
                                    data: { alertId: docSnap.id, url: `./?alertId=${docSnap.id}` }
                                }, uid);
                                pushSentCount += pushSuccess;
                            }
                        }
                    }
                } catch (pushErr) {
                    console.warn(`[DailyCheck] Błąd push dla alertu ${docSnap.id}:`, pushErr.message);
                }

                // Oznacz bieżący próg oraz wszystkie wyższe progi jako obsłużone
                alertFlags[flagKey] = true;
                for (const higherThreshold of alertDays) {
                    if (higherThreshold >= daysThreshold) {
                        alertFlags[String(higherThreshold)] = true;
                    }
                }
                flagsUpdated = true;

                // ZATRZYMAJ PĘTLĘ — wysyłamy maksymalnie 1 powiadomienie per alert na dzień!
                break;
            }
        }

        if (flagsUpdated) {
            await docSnap.ref.update({ alertFlags });
        }
    }

    // ── 2. Sprawdź alerty zespołowe (sharedAlerts) ─────────
    try {
        const sharedSnap = await db.collection('sharedAlerts').get();
        const activeShared = sharedSnap.docs.filter(doc => doc.data().status === 'active');
        console.log(`[DailyCheck] Znaleziono ${activeShared.length} aktywnych alertów zespołowych.`);

        for (const alertDoc of activeShared) {
            const alert = alertDoc.data();
            const expiryDate = alert.expiryDate ? alert.expiryDate.toDate() : null;
            if (!expiryDate) continue;

            expiryDate.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

            const rawAlertDays = alert.alertDays || [30, 14, 7, 3, 1];
            const alertDays = [...rawAlertDays].sort((a, b) => b - a);
            const alertFlags = { ...(alert.alertFlags || {}) };
            let flagsUpdated = false;

            for (const daysThreshold of alertDays) {
                const flagKey = String(daysThreshold);

                if (daysLeft <= daysThreshold && daysLeft >= 0 && !alertFlags[flagKey]) {
                    console.log(`[DailyCheck] Alert zespołowy "${alert.title}": pozostało ${daysLeft} dni (próg ${daysThreshold} dni).`);

                    // 1. Wyślij E-MAIL do uczestników
                    const participantEmails = (alert.participants || []).map(p => p.email).filter(Boolean);
                    const emailRecipients = Array.from(new Set([
                        alert.primaryEmail,
                        alert.secondaryEmail,
                        ...participantEmails
                    ].filter(Boolean)));

                    const payload = buildMailPayload({
                        ...alert,
                        expiryDate: expiryDate
                    }, {
                        subject: `👥 TaskAlert Zespołowy: Przypomnienie — ${alert.title} (za ${daysLeft} dni)`,
                        recipients: emailRecipients
                    });

                    if (payload.to.length > 0) {
                        await db.collection('mail').add({
                            to: payload.to,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            message: payload.message
                        });
                        emailSentCount++;
                    }

                    // 2. Wyślij PUSH do wszystkich uczestników z włączonym push
                    const participantUids = alert.participantUids || (alert.participants || []).map(p => p.uid).filter(Boolean);
                    for (const pUid of participantUids) {
                        try {
                            const pushConfigSnap = await db.doc(`users/${pUid}/settings/pushConfig`).get();
                            if (pushConfigSnap.exists && pushConfigSnap.data().pushEnabled) {
                                const pushConfig = pushConfigSnap.data();
                                const fcmTokens = pushConfig.fcmTokens || [];
                                const mutedAlerts = pushConfig.mutedAlerts || [];

                                if (fcmTokens.length > 0 && !mutedAlerts.includes(alertDoc.id)) {
                                    const pushSuccess = await sendPushToTokens(fcmTokens, {
                                        title: `👥 ${alert.title}`,
                                        body: daysLeft <= 0
                                            ? `🔴 Termin minął dzisiaj! (alert zespołowy)`
                                            : `Pozostało ${daysLeft} dni do terminu (${formatDatePL(expiryDate)})`,
                                        data: { alertId: alertDoc.id, url: `./?alertId=${alertDoc.id}#team-alerts` }
                                    }, pUid);
                                    pushSentCount += pushSuccess;
                                }
                            }
                        } catch (pErr) {
                            console.warn(`[DailyCheck] Błąd push dla uczestnika ${pUid}:`, pErr.message);
                        }
                    }

                    alertFlags[flagKey] = true;
                    for (const higherThreshold of alertDays) {
                        if (higherThreshold >= daysThreshold) {
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
    } catch (sharedErr) {
        console.warn('[DailyCheck] Błąd weryfikacji alertów zespołowych:', sharedErr.message);
    }

    console.log(`[DailyCheck] Zakończono weryfikację. Wysłano ${emailSentCount} e-maili oraz ${pushSentCount} powiadomień PUSH.`);
}

runDailyCheck().catch(err => {
    console.error('[DailyCheck] Błąd wykonania:', err);
    process.exit(1);
});
