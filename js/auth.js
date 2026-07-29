// ============================================================
// AUTH MODULE — Email/Password Authentication + Whitelist
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
    doc, getDoc, setDoc, getDocs, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Publiczny stan użytkownika ──────────────────────────
export let currentUser = null;

// ── Super-admin e-mail (chroniony przed usunięciem) ─────
export const SUPER_ADMIN_EMAIL = 'tomasz.drozda.eit@gmail.com';

// ── Sprawdzenie czy e-mail jest na liście dozwolonych ───
async function isUserAllowed(email) {
    if (!email) return false;
    const normalizedEmail = email.trim().toLowerCase();

    // Sprawdź w kolekcji allowedUsers (docId = email)
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
    const snap = await getDoc(allowedRef);

    if (snap.exists()) {
        const data = snap.data();
        return data.isActive !== false; // domyślnie true jeśli brak pola
    }

    return false;
}

// ── Pobierz rolę użytkownika z allowedUsers ─────────────
export async function getUserRole(email) {
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
    const snap = await getDoc(allowedRef);
    if (snap.exists()) {
        return snap.data().role || 'user';
    }
    return null;
}

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
            defaultAlertDays: [30, 14, 7, 3, 1],
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

// ── Inicjalizacja allowedUsers (jeśli pusta) ────────────
export async function initAllowedUsers() {
    const allowedCol = collection(db, 'allowedUsers');
    const snap = await getDocs(allowedCol);

    if (snap.empty && currentUser) {
        // Jeśli kolekcja nie istnieje, utwórz super-admina
        console.log('[Auth] Inicjalizacja allowedUsers — dodaję super-admina...');
        const superAdminRef = doc(db, 'allowedUsers', SUPER_ADMIN_EMAIL);
        await setDoc(superAdminRef, {
            email: SUPER_ADMIN_EMAIL,
            name: 'Tomasz Drozda',
            role: 'super-admin',
            isActive: true,
            createdAt: serverTimestamp()
        });

        // Dodaj również bieżącego użytkownika jeśli to nie super-admin
        const currentEmail = currentUser.email.trim().toLowerCase();
        if (currentEmail !== SUPER_ADMIN_EMAIL) {
            const currentRef = doc(db, 'allowedUsers', currentEmail);
            await setDoc(currentRef, {
                email: currentEmail,
                name: currentUser.displayName || currentEmail.split('@')[0],
                role: 'admin',
                isActive: true,
                createdAt: serverTimestamp()
            });
        }
    }
}

// ── Rejestracja (Email + Hasło) ─────────────────────────
export async function registerUser(email, password, displayName) {
    // Sprawdź whitelist przed rejestracją
    const allowed = await isUserAllowed(email);
    if (!allowed) {
        throw {
            code: 'auth/user-not-allowed',
            message: 'Twoje konto nie jest autoryzowane. Skontaktuj się z administratorem systemu.'
        };
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie (Email + Hasło) ───────────────────────────
export async function loginUser(email, password) {
    // Sprawdź whitelist przed logowaniem
    const allowed = await isUserAllowed(email);
    if (!allowed) {
        throw {
            code: 'auth/user-not-allowed',
            message: 'Twoje konto nie jest autoryzowane. Skontaktuj się z administratorem systemu.'
        };
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie z Google ──────────────────────────────────
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);

    // Sprawdź whitelist po logowaniu Google (e-mail znany dopiero po)
    const allowed = await isUserAllowed(cred.user.email);
    if (!allowed) {
        await signOut(auth);
        throw {
            code: 'auth/user-not-allowed',
            message: 'Twoje konto nie jest autoryzowane. Skontaktuj się z administratorem systemu.'
        };
    }

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
