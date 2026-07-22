Ekran dodawania nowej Kategorii: pozycja Ikona (emoji) powinna być w formie listy rozwijanej z ikonami. Dodaj przykładowe 10 ikon
Dodanie nowej Kategorii, lub włączenie/wyłączenie widoczności istniejącej nie zmienia widoku modułów w aplikacji - są nadal widzoczne tylko 3 podstawowe: Samochody, Kadry i Inne. Lista powinna dynamicznie się zmieniać po modyfikacji na karcie Kategorie.
Zmieńsłowo: Podtypy na Tagi w ekranie Kategorii, we wszystkich miejscach wystęowania.
Na kartach poszczególnych modułów alertów, gdy widzimy listę poszczególnych alertów nie ma możliwosći kliknięcia na nie - dodaj funkcje, która po kliknięciu na cały element karty alertu, otwiera okno dialogowe edycji tego alertu - ze szczegółami przypomnienia i możliwością ręcznego wysłania dodatkowego maila oraz ukończenia zadania z dodatkowym komentarzem
Na karcie Kadry nie działa edycja isniejących alertów, oznaczenie jako ukończone oraz wysyłanie maila
Daily Email Check failed with following error:4s
Run node scripts/daily_check.js
  node scripts/daily_check.js
  shell: /usr/bin/bash -e {0}
  env:
    FIREBASE_SERVICE_ACCOUNT: 
[DailyCheck] Rozpoczynam dobową weryfikację terminów...
[DailyCheck] Błąd wykonania: Error: Unable to detect a Project Id in the current environment. 
To learn more about authentication and Google APIs, visit: 
https://cloud.google.com/docs/authentication/getting-started
    at GoogleAuth.findAndCacheProjectId (/home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/node_modules/google-auth-library/build/src/auth/googleauth.js:170:19)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Firestore.initializeIfNeeded (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/index.js:1201:35)
Caused by: Error
    at QueryUtil._getResponse (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/reference/query-util.js:44:23)
    at Query._getResponse (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/reference/query.js:784:32)
    at Query._get (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/reference/query.js:777:35)
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/reference/query.js:745:43
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/telemetry/enabled-trace-util.js:110:30
    at NoopContextManager.with (/home/runner/work/project-taskalert/project-taskalert/node_modules/@opentelemetry/api/build/src/context/NoopContextManager.js:14:19)
    at ContextAPI.with (/home/runner/work/project-taskalert/project-taskalert/node_modules/@opentelemetry/api/build/src/api/context.js:51:46)
    at NoopTracer.startActiveSpan (/home/runner/work/project-taskalert/project-taskalert/node_modules/@opentelemetry/api/build/src/trace/NoopTracer.js:54:31)
    at ProxyTracer.startActiveSpan (/home/runner/work/project-taskalert/project-taskalert/node_modules/@opentelemetry/api/build/src/trace/ProxyTracer.js:27:24)
    at EnabledTraceUtil.startActiveSpan (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/telemetry/enabled-trace-util.js:102:28)
Error: Process completed with exit code 1.

Ręczne wysyłanie maili z powiadomieniami nie działa - nie przychodzą żadne maile. 


