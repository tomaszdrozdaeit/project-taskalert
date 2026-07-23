# Przewodnik Konfiguracji Serwisu Poczty E-mail — TaskAlert

Dokument opisuje krok po kroku konfigurację wysyłania powiadomień e-mail z adresu **no-reply@consulting-ad.com** przy użyciu serwera pocztowego **home.pl** oraz rozszerzenia Firebase **Trigger Email from Firestore**.

---

## 🏗️ 1. Architektura Powiadomień E-mail

Aplikacja **TaskAlert** wykorzystuje bezserwerowy mechanizm wysyłania e-maili oparty na bazie Firestore:

1. **Ręczne wyzwolenie (z aplikacji PWA)**: Kliknięcie przycisku "✉️ Wyślij e-mail" w wybranym alert generuje dokument w kolekcji `/mail`.
2. **Automatyczne sprawdzanie (skrypt dobowy GitHub Actions)**: Codzienny proces Node.js sprawdza nadchodzące terminy i generuje dokumenty w kolekcji `/mail`.
3. **Rozszerzenie Firebase**: Automatycznie odbiera dokument z kolekcji `/mail`, formatuje wiadomość i wysyła ją przez protokół SMTP na serwerze **home.pl**.

---

## 📧 2. Parametry Poczty E-mail na home.pl

Dla konta pocztowego **no-reply@consulting-ad.com** na serwerze home.pl obowiązują następujące parametry dostępowe SMTP:

| Parametr | Wartość |
| :--- | :--- |
| **Adres e-mail nadawcy** | `no-reply@consulting-ad.com` |
| **Serwer wychodzący SMTP** | `smtp.home.pl` (lub `consulting-ad.com`) |
| **Port SMTP (SSL/TLS)** | `465` (Zalecany) |
| **Port SMTP (STARTTLS)** | `587` |
| **Login SMTP** | `no-reply@consulting-ad.com` (lub login konta w home.pl) |
| **Hasło SMTP** | Hasło do Twojej skrzynki e-mail |
| **Protokół szyfrowania** | SMTPS / SSL |

---

## 🚀 3. Krok po kroku: Instalacja i Konfiguracja Rozszerzenia w Firebase Console

Aby e-maile były automatycznie wysyłane z bazy Firestore przez serwer home.pl, wykonaj poniższe kroki w konsoli Firebase:

### Krok 1: Otwórz Konsolę Firebase
1. Wejdź na stronę: [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Wybierz swój projekt: **taskalert-app-8d45d**.

### Krok 2: Zainstaluj rozszerzenie "Trigger Email from Firestore"
1. W menu bocznym po lewej stronie kliknij **Build** -> **Extensions**.
2. Wpisz w wyszukiwarkę rozszerzeń: `Trigger Email` (autor: `firebase`).
3. Kliknij **Install in Console**.

### Krok 3: Skonfiguruj parametry rozszerzenia
W formularzu konfiguracyjnym ustaw następujące wartości:

1. **SMTP Connection URI**:
   Wpisz ciąg połączeniowy uwzględniający protokół SMTPS, port 465 oraz dane dostępowe home.pl:
   ```text
   smtps://no-reply%40consulting-ad.com:TWOJE_HASLO@smtp.home.pl:465
   ```
   > ⚠️ **Ważne**: Znak `@` w loginie e-mail zamień na kod URL `%40` (`no-reply%40consulting-ad.com`). Jeśli w haśle występują znaki specjalne (np. `#`, `?`, `&`), one również muszą być zakodowane URL-em.

2. **Email documents collection**:
   ```text
   mail
   ```

3. **Default FROM address**:
   ```text
   no-reply@consulting-ad.com
   ```

4. **Default REPLY-TO address** (opcjonalnie):
   ```text
   no-reply@consulting-ad.com
   ```

5. Kliknij **Save** / **Install Extension**. Firebase utworzy niezbędne funkcje chmurowe i połączy się z serwerem home.pl.

---

## 🎨 4. Konfiguracja i Personalizacja Treści Wiadomości E-mail

Treść i wygląd wysyłanych wiadomości e-mail są zdefiniowane w dwóch miejscach w kodzie aplikacji:

### A. Ręczne powiadomienia wysyłane z aplikacji PWA (`js/db.js`)

W pliku `js/db.js` w funkcji `sendManualNotification(reminder)` znajduje się szablon HTML wiadomości. Możesz w nim edytować nagłówek, kolory, treść oraz dane kontaktowe:

```javascript
// js/db.js
export async function sendManualNotification(reminder) {
    const rawRecipients = [reminder.primaryEmail, reminder.secondaryEmail];
    const recipients = rawRecipients.filter(e => e && typeof e === 'string' && e.includes('@'));

    if (recipients.length === 0) {
        throw new Error('Brak prawidłowego adresu e-mail odbiorcy w tym przypomnieniu.');
    }

    const mailRef = collection(db, 'mail');
    const expiryDate = parseDate(reminder.expiryDate).toLocaleDateString('pl-PL');

    await addDoc(mailRef, {
        to: recipients,
        createdAt: serverTimestamp(),
        message: {
            subject: `⏰ TaskAlert: ${reminder.title} — termin: ${expiryDate}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #4f8cff, #7c3aed); padding: 24px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🔔 TaskAlert — Przypomnienie</h1>
                        <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Consulting & AD — System Alertów</p>
                    </div>
                    <div style="background: #ffffff; padding: 24px;">
                        <h2 style="margin: 0 0 12px; color: #1a1f2e; font-size: 20px;">${reminder.title}</h2>
                        <p style="color: #64748b; margin: 0 0 16px;">Kategoria: <strong>${reminder.categoryName || 'Brak'}</strong></p>
                        
                        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #4f8cff; margin-bottom: 20px;">
                            <p style="margin: 0; color: #1a1f2e; font-size: 16px;"><strong>📅 Data wygaśnięcia:</strong> ${expiryDate}</p>
                            ${reminder.notes ? `<p style="margin: 12px 0 0; color: #475569; font-size: 14px;">📝 <em>${reminder.notes}</em></p>` : ''}
                        </div>
                        
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                        <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                            Wiadomość wygenerowana automatycznie przez system <strong>TaskAlert</strong>.<br/>
                            Nadawca: <a href="mailto:no-reply@consulting-ad.com" style="color: #4f8cff; text-decoration: none;">no-reply@consulting-ad.com</a>
                        </p>
                    </div>
                </div>`
        }
    });
}
```

---

### B. Automatyczne powiadomienia dobowe (`scripts/daily_check.js`)

W pliku `scripts/daily_check.js` skrypt sprawdza zbliżające się terminy alertów i generuje powiadomienie e-mail:

```javascript
// scripts/daily_check.js
await db.collection('mail').add({
    to: recipients,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    message: {
        subject: `⚠️ TaskAlert [${daysText}]: ${reminder.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: #ef4444; padding: 20px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">⚠️ Wymagana Akcja — Nadchodzący Termin</h2>
                </div>
                <div style="padding: 24px; background: #ffffff;">
                    <h3 style="margin-top: 0; color: #1e293b;">${reminder.title}</h3>
                    <p style="color: #475569;">Termin wygaśnięcia przypada na: <strong>${expiryStr}</strong> (${daysText}).</p>
                    <p style="color: #64748b;">Kategoria: ${reminder.categoryName || 'Brak'}</p>
                    ${reminder.notes ? `<div style="background:#f1f5f9;padding:12px;border-radius:6px;">📝 ${reminder.notes}</div>` : ''}
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
                        TaskAlert Notifications — no-reply@consulting-ad.com
                    </div>
                </div>
            </div>`
    }
});
```

---

## ⚙️ 5. Konfiguracja GitHub Actions dla Powiadomień Dobowych

Aby dobowe powiadomienia były automatycznie sprawdzane i wysyłane co 24 godziny z repozytorium GitHub:

1. Przejdź do repozytorium GitHub: `https://github.com/tomaszdrozdaeit/project-taskalert`.
2. Kliknij **Settings** -> **Secrets and variables** -> **Actions**.
3. Utwórz nowy sekret repozytorium o nazwie: `FIREBASE_SERVICE_ACCOUNT`.
4. Wklej pełną zawartość pliku JSON wygenerowanego z konsoli Firebase (**Project Settings** -> **Service Accounts** -> **Generate new private key**).
5. Przepływ pracy `.github/workflows/daily-check.yml` będzie uruchamiał się automatycznie o godzinie 06:00 UTC każdego dnia.

---

## 🛡️ 6. Diagnostyka i Rozwiązywanie Problemów

- **E-mail trafił do spamu**:
  Upewnij się, że w konfiguracji domeny `consulting-ad.com` w rekordzie **SPF** na home.pl znajduje się wpis zezwalający na wysyłkę z serwerów home.pl:
  `v=spf1 include:home.pl ~all`
- **Błąd autoryzacji SMTP**:
  Sprawdź w logach usługi Firebase Extension (w zakładce *Extensions* -> *Trigger Email* -> *View logs*), czy hasło nie zawiera niezakodowanych znaków specjalnych w URI (`%40` zamiast `@`).
