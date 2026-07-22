// ============================================================
// DAILY CHECK SCRIPT — GitHub Actions / Node.js
// TaskAlert — Sprawdzanie terminów i generowanie powiadomień e-mail
// ============================================================

const admin = require('firebase-admin');

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
    console.log('[DailyCheck] Rozpoczynam dobową weryfikację terminów...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Pobierz wszystkie aktywne przypomnienia ze wszystkich użytkowników (collectionGroup)
    const snapshot = await db.collectionGroup('reminders')
        .where('status', '==', 'active')
        .get();

    console.log(`[DailyCheck] Znaleziono ${snapshot.docs.length} aktywnych przypomnień.`);

    let sentCount = 0;

    for (const docSnap of snapshot.docs) {
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
                const recipients = [reminder.primaryEmail];
                if (reminder.secondaryEmail) recipients.push(reminder.secondaryEmail);

                const validRecipients = recipients.filter(e => e && e.includes('@'));

                if (validRecipients.length > 0) {
                    const formattedDate = expiryDate.toLocaleDateString('pl-PL');
                    await db.collection('mail').add({
                        to: validRecipients,
                        message: {
                            subject: `⏰ TaskAlert: Przypomnienie — ${reminder.title} (za ${daysLeft} dni)`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <div style="background: linear-gradient(135deg, #4f8cff, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
                                        <h1 style="color: #fff; margin: 0; font-size: 22px;">🔔 TaskAlert — Automatyczny Alert</h1>
                                    </div>
                                    <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                                        <h2 style="margin: 0 0 8px; color: #1a1f2e;">${reminder.title}</h2>
                                        <p style="color: #64748b; margin: 0 0 16px;">Kategoria: ${reminder.categoryName || 'Inne'}</p>
                                        <div style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                            <p style="margin: 0 0 8px; color: #1a1f2e;"><strong>📅 Data wygaśnięcia:</strong> ${formattedDate} (za ${daysLeft} dni)</p>
                                            ${reminder.subTypeLabel ? `<p style="margin: 0 0 8px; color: #64748b;"><strong>Typ:</strong> ${reminder.subTypeLabel}</p>` : ''}
                                            ${reminder.notes ? `<p style="margin: 12px 0 0; color: #64748b;">📝 ${reminder.notes}</p>` : ''}
                                        </div>
                                        <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Wysłano automatycznie przez serwer TaskAlert</p>
                                    </div>
                                </div>`
                        }
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
