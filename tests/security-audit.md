# TaskAlert — Raport Audytu Bezpieczeństwa (Security Audit)

**Data przeprowadzenia:** 2026-07-29  
**Wersja systemu:** TaskAlert v4  
**Audytowane obszary:** Autentykacja, autoryzacja, reguły Firestore, Firebase Cloud Messaging, ochrona XSS/CSRF, bezpieczeństwo kluczy API.

---

## 1. Streszczenie (Executive Summary)

Aplikacja TaskAlert została poddana kompleksowemu audytowi bezpieczeństwa. Wprowadzone w wersji v4 mechanizmy (whitelist użytkowników `allowedUsers`, role `super-admin`/`admin`/`user`, izolacja danych per-user w Firestore oraz kontrolowany dostęp do `sharedAlerts`) znacząco podniosły poziom bezpieczeństwa.

---

## 2. Wyniki Analizy Obszarowej

### 2.1 Autentykacja i Whitelist Użytkowników (`auth.js` + `allowedUsers`)
- **Mechanizm:** Każde logowanie (Email/Password oraz Google OAuth) jest weryfikowane z kolekcją Firestore `allowedUsers`.
- **Status:** ✅ Pozytywny. Osoby spoza bazy otrzymują błąd `auth/user-not-allowed` i zostają natychmiastowo wylogowane.
- **Ochrona Super-Admina:** Konto `tomasz.drozda.eit@gmail.com` posiada oznaczenie `super-admin` i reguły Firestore uniemożliwiają jego usunięcie lub zmianę roli przez API.

### 2.2 Reguły Bezpieczeństwa Firestore (`firestore.rules`)
- **Kolekcja `/users/{userId}/**`:**
  - Strict owner access: `request.auth.uid == userId`.
  - Żaden inny zalogowany użytkownik nie ma dostępu do prywatnych przypomnień drugiego użytkownika.
- **Kolekcja `/allowedUsers/{docId}`:**
  - Odczyt: dostępny dla zalogowanych (wymagane do dropdownów i weryfikacji).
  - Zapis/Edycja: restricted do użytkowników z rolą `admin` lub `super-admin`.
  - Usuwanie: usuwanie konta `super-admin` jest zablokowane na poziomie reguł.
- **Kolekcja `/sharedAlerts/{alertId}`:**
  - Dostęp tylko dla autoryzowanych uczestników (`participants`).

### 2.3 Powiadomienia PUSH i FCM (`push-notifications.js` + Cloud Functions)
- **Tokeny FCM:** Przechowywane w `/users/{uid}/settings/pushConfig` (dostępne do odczytu/zapisu tylko dla właściciela).
- **Cloud Functions:** Funkcje wykonywane w zaufanym środowisku Firebase Admin SDK.
- **Wyznaczony czas:** Cron 9:00 czasem polskim (`Europe/Warsaw` z obsługą DST).

### 2.4 Ochrona przed XSS i Injection
- **HTML Escaping:** Wszystkie zmienne tekstowe wstawiane do DOM lub szablonów HTML e-mail (`mail-utils.mjs`, `app.js`, `team-alerts.js`, `admin-users.js`) przechodzą przez funkcje sanityzujące `escHtml()` / `escapeHtml()`.

### 2.5 Bezpieczeństwo Kluczy API
- Firebase Web API Key jest identyfikatorem publicznym i bezpiecznym do użycia w kodzie klienckim (zgodnie z zaleceniami Google Firebase). Dostęp do zasobów jest w 100% chroniony przez Firebase Auth + Firestore Rules.

---

## 3. Podsumowanie i Zalecenia
1. Utworzono automatyczny skrypt testujący reguły Firestore: `tests/firestore-rules.test.js`.
2. Wszystkie reguły dostępu zostały zweryfikowane i wdrożone.
