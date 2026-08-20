# 🚀 TaskAlert v4.1 — Instrukcja Wdrożeniowa i Testowa Po Restarcie Komputera

Niniejszy plik służy jako kompletny przewodnik dla Agenta AI (oraz dewelopera) po restarcie komputera, opisujący stan projektu, strukturę gałęzi Git oraz krok po kroku procedurę weryfikacji i wdrożenia.

---

## 📌 1. Stan Gałęzi Git (Branching Strategy)

- **`main` (Produkcja):** 
  - Główna gałąź produkcyjna gotowa do zaktualizowania z v4.1-dev.
- **`v4.1-dev` (Środowisko Deweloperskie):**
  - Aktywna gałąź zawierająca pełny pakiet poprawek z `uwagi_v3.md`:
    - Naprawa race condition przycisku instalacji PWA (`window.__pwa_deferred_prompt`).
    - Cache Busting v27: Wersjonowanie `css/style.css?v=27` oraz `js/app.js?v=27` w `index.html` zapobiegające serwowaniu starego pliku stylów przez przeglądarkę mobilną.
    - Nowoczesny UI/UX przycisku lupy 🔍 umieszczonego bezpośrednio w nagłówku podstron (`.page-header-flex`), pozwalającego wysuwać i zwijać panel filtrów.
    - Całkowicie elastyczne karty alertów (`.reminder-card` z `flex-wrap` i kompaktowym układem przycisków akcji na mobile).
    - Podbicie wersji Service Workera do `taskalert-v27`.

---

## 🛠️ 2. Pierwsze Kroki Po Restarcie Komputera

1. **Przejdź do katalogu projektu:**
   ```bash
   cd c:\03_Antigravity\06_TaskAlert
   ```
2. **Upewnij się, że jesteś na gałęzi `v4.1-dev`:**
   ```bash
   git branch
   # Wynik powinien wskazywać: * v4.1-dev
   ```
   *Jeśli jesteś na `main`, przełącz się:* `git checkout v4.1-dev`

3. **Uruchom lokalny serwer HTTP:**
   ```bash
   python server.py
   ```
   *Plik `server.py` uruchamia wielowątkowy serwer na porcie 3001 z nagłówkami wykluczającymi pamięć podręczną (`no-store, no-cache`).*

4. **Otwórz aplikację w przeglądarce:**
   👉 **http://localhost:3001** *(Użyj `localhost` zamiast `127.0.0.1`, aby powiązanie z Google Sign-In w Firebase działało bez błędu `auth/unauthorized-domain`)*

---

## 📑 3. Lista Zrealizowanych Ulepszeń i Poprawek (w `v4.1-dev`)

1. **PWA Install Banner Fix (Zgłoszenie 1 z `uwagi_v3.md`):**
   - Rozwiązano problem z race condition w `js/modules/pwa-install-banner.js` poprzez przechwytywanie zdarzenia `beforeinstallprompt` globalnie na samym początku ładowania aplikacji w `app.js` (`window.__pwa_deferred_prompt`).
   - Przycisk "Zainstaluj" działa płynnie, a w przypadku braku natywnego wywołania podaje czytelną instrukcję dla użytkownika.
2. **Kolapsowalne Filtry na Smartfonach (Zgłoszenie 2 z `uwagi_v3.md`):**
   - Na ekranach mobilnych (≤768px) pasek filtrów jest domyślnie zwinięty do czytelnego paska z przyciskiem "Szukaj i filtruj" oraz zwięzłym przyciskiem "Dodaj" / "Nowy".
   - Kliknięcie przycisku płynnie wysuwa/chowa filtry z animacją slide-down (`.filter-bar-expanded`), oszczędzając miejsce na ekranie telefonu.
3. **Elastyczne Karty Alertów i Audyt Mobilny (Zgłoszenia 3 i 4 z `uwagi_v3.md`):**
   - Przeprojektowano układy `.reminder-card` w `style.css` na mobile (breakpointy 768px, 480px, 360px).
   - Przycisk akcji (`.reminder-actions`) na małych ekranach przenosi się estetycznie do dolnej części karty z delikatnym separatorem.
   - Tytuły alertów (`.reminder-title`) zawijają się bez obcinania tekstu ani wychodzenia poza ekran.
   - Zabezpieczono `.main-content` przed poziomym suwakiem (`overflow-x: hidden`).
4. **Alerty Zespołowe i Filtrowanie po Email:**
   - Dodano automatyczną synchronizację `uid` użytkownika do `allowedUsers` oraz fallback po adresie e-mail w zapytaniach do alertów zespołowych.
 5. **Poprawka Powiadomień PUSH na Androidzie (Android Chrome / PWA Fix):**
   - Rozwiązano błąd `Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.`.
   - Zastąpiono wywołania konstruktora `new Notification(...)` bezpiecznym helperem `displayNotification()` wykorzystującym `ServiceWorkerRegistration.showNotification()`.
 6. **Wersjonowanie Cache Service Workera:**
   - Zaktualizowano nazwę pamięci podręcznej do `taskalert-v31` w `service-worker.js` oraz podbito wersje w `index.html` (`v=31`).
 7. **Konwersja Alertów Prywatnych na Zespołowe:**
   - Dodano funkcję `convertReminderToTeamAlert` w `db.js` oraz przycisk `👥 Zamień na zespołowy` z modalem wyboru uczestników w `app.js`.
 8. **Baner PWA i Instrukcja dla iOS oraz Mac:**
   - Zaktualizowano `pwa-install-banner.js` z instrukcją instalacji na iOS (iOS 16.4+ Web Push wymaga dodania do Ekranu Głównego) oraz Mac (Safari Add to Dock / Chrome).
   - Dodano pełną instrukcję krok po kroku w `README.md`.
 9. **Rygorystyczna Ochrona Whitelist (Logowanie i Dostęp):**
   - Zaktualizowano `auth.js` i `app.js`: Rejestracja, logowanie hasłem, Google Sign-in oraz stan sesji `onAuthChange` blokują każdego użytkownika spoza `allowedUsers`.
   - Zaktualizowano `firestore.rules`: Reguły Firestore blokują odczyt i zapis w `/users/{uid}`, `/sharedAlerts`, `/categories` oraz `/mail` dla kont nieznajdujących się na whitelist.

---

## 🧪 4. Plan Testów Mobilnych

Przetestuj w przeglądarce (np. z użyciem DevTools w trybie emulacji smartfona 375x667):

1. **Baner PWA:** Po zalogowaniu zweryfikuj pojawienie się banera instalacji i kliknij "Zainstaluj".
2. **Kategorie i Filtry:** Przejdź do zakładki *Samochody*, *Kadry*, *Inne* lub *Alerty Zespołowe*. Upewnij się, że filtr jest zwinięty, a kliknięcie "Szukaj i filtruj" go rozwija.
3. **Karty Alertów:** Sprawdź czy karciane widoki alertów nie wychodzą poza krawędź ekranu i czy przyciski akcji są łatwo dostępne.

---

## 🚀 5. Finałowa Publikacja na GitHub

Wykonaj scalenie oraz push na produkcję:

```bash
# 1. Scalenie v4.1-dev do main
git checkout main
git merge v4.1-dev

# 2. Wysłanie na produkcyjny GitHub Pages
git push origin main

# 3. Powrót na v4.1-dev
git checkout v4.1-dev
```

---
*Dokument zaktualizowany automatycznie po wdrożeniu poprawek z `uwagi_v3.md`.*
