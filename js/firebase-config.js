// ============================================================
// FIREBASE CONFIGURATION
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// WAŻNE: Po utworzeniu nowego projektu Firebase "taskalert-app"
// uzupełnij poniższe dane konfiguracyjne z konsoli Firebase:
// https://console.firebase.google.com → Project Settings → Your apps → Web app
const firebaseConfig = {
    apiKey: "AIzaSyCE8U6I6gs51OtzoAdEXHCOucXyQOzaBE8",
    authDomain: "taskalert-app-8d45d.firebaseapp.com",
    projectId: "taskalert-app-8d45d",
    storageBucket: "taskalert-app-8d45d.firebasestorage.app",
    messagingSenderId: "981946997404",
    appId: "1:981946997404:web:dcf93a4a14b24898cfeb59",
    measurementId: "G-Z5B8H3TCRM"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
