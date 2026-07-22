Moduł alertów: Inne - wyświetla także alerty z nowo utworzonych Kategorii. Popraw filtrowanie aby przypomnienia przypisane do poszczególnych kategorii były wyświetlane tylko na ich kartach. 
Po dodaniu nowej Kategorii i przejściu na jej ekran, na środku ciągle kręci się kółko oczekiwania. Popraw to. 
Daily Alert Check failed again:
[DailyCheck] Połączono z Firebase używając podanego FIREBASE_SERVICE_ACCOUNT.
[DailyCheck] Rozpoczynam dobową weryfikację terminów...
[DailyCheck] Błąd wykonania: Error: 9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection reminders and field status. You can create it here: https://console.firebase.google.com/v1/r/project/taskalert-app-8d45d/firestore/indexes?create_exemption=Cllwcm9qZWN0cy90YXNrYWxlcnQtYXBwLThkNDVkL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9yZW1pbmRlcnMvZmllbGRzL3N0YXR1cxACGgoKBnN0YXR1cxAB
    at callErrorFromStatus (/home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/call.js:32:19)
    at Object.onReceiveStatus (/home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/client.js:359:73)
    at Object.onReceiveStatus (/home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/client-interceptors.js:327:181)
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/resolving-call.js:135:78
    at process.processTicksAndRejections (node:internal/process/task_queues:77:11)
for call at
    at ServiceClientImpl.makeServerStreamRequest (/home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/client.js:342:32)
    at ServiceClientImpl.<anonymous> (/home/runner/work/project-taskalert/project-taskalert/node_modules/@grpc/grpc-js/build/src/make-client.js:105:19)
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/v1/firestore_client.js:242:33
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/build/src/streamingCalls/streamingApiCaller.js:38:28
    at /home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/build/src/normalCalls/timeout.js:44:16
    at Object.request (/home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/build/src/streamingCalls/streaming.js:234:40)
    at makeRequest (/home/runner/work/project-taskalert/project-taskalert/node_modules/retry-request/index.js:159:28)
    at retryRequest (/home/runner/work/project-taskalert/project-taskalert/node_modules/retry-request/index.js:119:5)
    at StreamProxy.setStream (/home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/build/src/streamingCalls/streaming.js:225:37)
    at StreamingApiCaller.call (/home/runner/work/project-taskalert/project-taskalert/node_modules/google-gax/build/src/streamingCalls/streamingApiCaller.js:54:16)
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
    at EnabledTraceUtil.startActiveSpan (/home/runner/work/project-taskalert/project-taskalert/node_modules/@google-cloud/firestore/build/src/telemetry/enabled-trace-util.js:102:28) ***
  code: 9,
  details: 'The query requires a COLLECTION_GROUP_ASC index for collection reminders and field status. You can create it here: https://console.firebase.google.com/v1/r/project/taskalert-app-8d45d/firestore/indexes?create_exemption=Cllwcm9qZWN0cy90YXNrYWxlcnQtYXBwLThkNDVkL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9yZW1pbmRlcnMvZmllbGRzL3N0YXR1cxACGgoKBnN0YXR1cxAB',
  metadata: Metadata ***
    internalRepr: Map(1) *** 'x-debug-tracking-id' => [Array] ***,
    opaqueData: Map(0) ***,
    options: ***
  ***
***
Error: Process completed with exit code 1.
Przedstaw krok po kroku co należy poprawić w konfiguracji bazy danych aby zapobiec temu błędowi w przyszłości. 

Dodatkowo stwórz nowy dokument "konfiguracja_email.md" i umieść go w katalogu "scripts". W dokumencie umieść informacje o konfiguracji serwisu poczty e-mail. Szczegółowo i krok po kroku jak ustawić zarówno treść maila przypomnienia a także jak ustawić aby był wysyłany z mojego adresu biuro@consulting-ad.com. Server pocztowy na home.pl