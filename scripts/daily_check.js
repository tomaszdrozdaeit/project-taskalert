// ============================================================
// DAILY CHECK SCRIPT — GitHub Actions / Node.js
// TaskAlert — Sprawdzanie terminów i generowanie powiadomień e-mail
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

async function runDailyCheck() {
    const { buildMailPayload } = await loadMailUtils();
    console.log('[DailyCheck] Rozpoczynam dobową weryfikację terminów...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Pobierz aktywne przypomnienia bez konieczności tworzenia indeksu zbiorczego w Firestore
    let reminderDocs = [];
    try {
        const snapshot = await db.collectionGroup('reminders').get();
        reminderDocs = snapshot.docs.filter(doc => doc.data().status === 'active');
        console.log(`[DailyCheck] Znaleziono ${reminderDocs.length} aktywnych przypomnień (collectionGroup).`);
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

    let sentCount = 0;

    for (const docSnap of reminderDocs) {
        const reminder = docSnap.data();
        const expiryDate = reminder.expiryDate ? reminder.expiryDate.toDate() : null;
        if (!expiryDate) continue;

        expiryDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        const alertDays = reminder.alertDays || [30, 14];
        const alertFlags = reminder.alertFlags || {};
        let flagsUpdated = false;

        for (const daysThreshold of alertDays) {
            const flagKey = String(daysThreshold);

            // Jeśli pozostało <= threshold dni i powiadomienie nie zostało jeszcze wysłane
            if (daysLeft <= daysThreshold && daysLeft >= 0 && !alertFlags[flagKey]) {
                console.log(`[DailyCheck] Alert dla "${reminder.title}": pozostało ${daysLeft} dni (proóg ${daysThreshold} dni).`);

                // Utwórz powiadomienie e-mail w kolekcji /mail (Trigger Email Extension)
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
                        message: payload.message
                    });
                    sentCount++;
                }

                alertFlags[flagKey] = true;
                flagsUpdated = true;
            }
        }

        if (flagsUpdated) {
            await docSnap.ref.update({ alertFlags });
        }
    }

    console.log(`[DailyCheck] Zakończono weryfikację. Wysłano ${sentCount} powiadomień e-mail.`);
}

runDailyCheck().catch(err => {
    console.error('[DailyCheck] Błąd wykonania:', err);
    process.exit(1);
});
