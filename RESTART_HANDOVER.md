# 🚀 TaskAlert v4 — Instrukcja Wdrożeniowa i Testowa Po Restarcie Komputera

Niniejszy plik służy jako kompletny przewodnik dla Agenta AI (oraz dewelopera) po restarcie komputera, opisujący stan projektu, strukturę gałęzi Git oraz krok po kroku procedurę weryfikacji i wdrożenia.

---

## 📌 1. Stan Gałęzi Git (Branching Strategy)

- **`main` (Produkcja):** 
  - Gałąź produkcyjna została cofnięta do stabilnej wersji sprzed dzisiejszych prac (`commit 008862c`).
  - **ZASADA:** NIE wgrywamy żadnych zmian na `main` (`git push origin main`) dopóki pełne testy lokalne na `v4-dev` nie zostaną ukończone i zaakceptowane przez użytkownika.
- **`v4-dev` (Środowisko Deweloperskie / Lokalne):**
  - Aktywny branch ze wszystkimi nowościami, poprawkami i refaktoryzacją TaskAlert v4.
  - Zmiany są zapisane lokalnie i zsynchronizowane z `origin/v4-dev`.

---

## 🛠️ 2. Pierwsze Kroki Po Restarcie Komputera

1. **Przejdź do katalogu projektu:**
   ```bash
   cd c:\03_Antigravity\06_TaskAlert
   ```
2. **Upewnij się, że jesteś na gałęzi `v4-dev`:**
   ```bash
   git branch
   # Wynik powinien wskazywać: * v4-dev
   ```
   *Jeśli jesteś na `main`, przełącz się:* `git checkout v4-dev`

3. **Uruchom lokalny serwer HTTP:**
   ```bash
   python server.py
   ```
   *Plik `server.py` uruchamia wielowątkowy serwer na porcie 3001 z nagłówkami wykluczającymi pamięć podręczną (`no-store, no-cache`).*

4. **Otwórz aplikację w przeglądarce:**
   👉 **http://127.0.0.1:3001** (lub http://localhost:3001)

---

## 📑 3. Lista Zrealizowanych Ulepszeń i Poprawek (w `v4-dev`)

1. **PWA Install Banner (K1):**
   - Moduł `js/modules/pwa-install-banner.js` wykrywa system Android (`beforeinstallprompt`) oraz iOS (instrukcja dodania do ekranu głównego Safari).
2. **Powiadomienia PUSH & Cloud Functions (K2):**
   - Obsługa FCM w `js/modules/push-notifications.js` oraz Cloud Functions o 9:00 czasu polskiego (`Europe/Warsaw` z obsługą czasów letniego/zimowego DST).
   - Akcje drzemki (5 min / 10 min) w `service-worker.js`.
3. **Alerty Zespołowe / Współdzielone (K3):**
   - Dedykowany moduł `js/modules/team-alerts.js`.
   - Przełącznik `👥 Utwórz jako alert zespołowy` z wyborem wykonawców/obserwatorów w głównym formularzu tworzenia przypomnienia w `app.js`.
   - Zjednoczona warstwa danych w `db.js` — alerty zespołowe automatycznie pojawiają się w swoich kategoriach (Samochody, Kadry, Inne), na Pulpicie i w Historii.
4. **Notatki w E-mailu (K4):**
   - Notatka/opis dodawana w wyróżnionej sekcji HTML w e-mailach (`mail-utils.mjs` i `daily_check.js`).
5. **Domyślne Dni Alertów (K5):**
   - Zestaw `[30, 14, 7, 3, 1]` w `auth.js`, `db.js`, `app.js` i `ustawienia.js`.
6. **Rozwijana Lista E-mail z Bazy (`allowedUsers`) (K6):**
   - Wybór adresów z listy zautoryzowanych użytkowników.
7. **Whitelisty Użytkowników & Super-Admin (K7):**
   - Panel `js/modules/admin-users.js`.
   - Bezwarunkowa ranga `super-admin` dla konta `tomasz.drozda.eit@gmail.com`.
   - Automatyczna synchronizacja logujących się użytkowników do kolekcji `allowedUsers` w `ensureUserProfile(user)` w `auth.js`.
8. **Poprawki Szczegółów Alerta & Izolacji Kategorii:**
   - Wyeksportowanie `window.TaskAlert` w `app.js` z metodami `showReminderDetailsModal`, `showModal`, `showToast`, `showConfirm`. Kliknięcie karty z dowolnego miejsca otwiera modal szczegółów.
   - Ścisła izolacja w `inne.js`: alerty z kategorii niestandardowych (np. Nieruchomości, Polisy, Sprzęt) wyświetlają się **wyłącznie** na dedykowanej stronie podkategorii (`#cat-<id>`) i są wykluczone z głównej listy "Inne".
9. **Logowanie z Google:**
   - Dodano automatyczną obsługę `signInWithRedirect` w `auth.js` na wypadek zablokowania okna popup przez przeglądarkę.

---

## 🧪 4. Plan Testów Lokalnych Po Restarcie

Przetestuj w przeglądarce pod adresem **http://127.0.0.1:3001**:

1. **Logowanie:** Logowanie przez e-mail (`tomasz.drozda.eit@gmail.com`) lub logowanie z Google.
2. **Pulpit & Klikanie w karty:** Kliknij w dowolną kartę alertu na Pulpicie — upewnij się, że okno szczegółów z historią zdarzeń otwiera się poprawnie.
3. **Tworzenie Alerta:** 
   - Kliknij `+` / `Dodaj`.
   - Wypróbuj utworzenie alertu zwykłego oraz przełącz opcję `👥 Utwórz jako alert zespołowy`.
   - Sprawdź, czy alert dodaje się bez błędów.
4. **Izolacja Kategorii:** Stwórz alert w nowej customowej kategorii (np. "Sprzęt") i upewnij się, że jest widoczny TYLKO pod tą kategorią, a NIE w "Inne".
5. **Panel Użytkownicy:** Przejdź do zakładki *Użytkownicy* — upewnij się, że lista zalogowanych kont ładuje się z rolami.

---

## 🚀 5. Finałowa Publikacja na GitHub (Po Akceptacji)

Gdy testy lokalne zakończą się pomyślnie i użytkownik wyrazi zgodę:

```bash
# 1. Scalenie v4-dev do main
git checkout main
git merge v4-dev

# 2. Wysłanie na produkcyjny GitHub Pages
git push origin main

# 3. Powrót na v4-dev
git checkout v4-dev
```

---
*Dokument wygenerowany automatycznie dla kontynuacji pracy w nowej sesji.*
