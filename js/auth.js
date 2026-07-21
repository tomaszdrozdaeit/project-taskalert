// ============================================================
// AUTH MODULE — Email/Password Authentication
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
    doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Publiczny stan użytkownika ──────────────────────────
export let currentUser = null;

// ── Inicjalizacja profilu w Firestore przy pierwszym logowaniu ──
async function ensureUserProfile(user) {
    const profileRef = doc(db, 'users', user.uid, 'profile', 'main');
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
        await setDoc(profileRef, {
            displayName: user.displayName || user.email.split('@')[0],
            email: user.email,
            defaultPrimaryEmail: user.email,
            defaultSecondaryEmail: '',
            defaultAlertDays: [30, 14],
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
        });
        console.log('[Auth] Nowy profil użytkownika utworzony w Firestore');
        return true; // isNewUser
    } else {
        // Aktualizuj datę ostatniego logowania
        await setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
        return false;
    }
}

// ── Rejestracja (Email + Hasło) ─────────────────────────
export async function registerUser(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie (Email + Hasło) ───────────────────────────
export async function loginUser(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie z Google ──────────────────────────────────
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Reset hasła ─────────────────────────────────────────
export async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
}

// ── Wylogowanie ─────────────────────────────────────────
export async function logoutUser() {
    await signOut(auth);
}

// ── Nasłuch stanu autoryzacji ───────────────────────────
export function onAuthChange(callback) {
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        callback(user);
    });
}

// ── Pobierz profil Firestore ────────────────────────────
export async function getUserProfile() {
    if (!currentUser) return null;
    const profileRef = doc(db, 'users', currentUser.uid, 'profile', 'main');
    const snap = await getDoc(profileRef);
    return snap.exists() ? snap.data() : null;
}
