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
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
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

    // SUPER ADMIN ZAWSZE DOZWOLONY
    if (normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

    try {
        const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
        const snap = await getDoc(allowedRef);
        if (snap.exists()) {
            return snap.data().isActive !== false;
        }
    } catch (err) {
        console.warn('[Auth] Błąd odczytu allowedUsers:', err);
    }

    return false;
}

// ── Pobierz rolę użytkownika z allowedUsers ─────────────
export async function getUserRole(email) {
    if (!email) return 'user';
    const normalizedEmail = email.trim().toLowerCase();

    // SUPER ADMIN ZAWSZE MA ROLĘ 'super-admin'
    if (normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase()) return 'super-admin';

    try {
        const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
        const snap = await getDoc(allowedRef);
        if (snap.exists()) {
            return snap.data().role || 'user';
        }
    } catch (err) {
        console.warn('[Auth] Błąd pobierania roli:', err);
    }
    return 'user';
}

// ── Inicjalizacja profilu w Firestore przy pierwszym logowaniu ──
async function ensureUserProfile(user) {
    if (!user || !user.email) return false;
    const currentEmail = user.email.trim().toLowerCase();

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
    } else {
        await setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    }

    // Zsynchronizuj wpis użytkownika z kolekcją allowedUsers
    try {
        const allowedRef = doc(db, 'allowedUsers', currentEmail);
        const allowedSnap = await getDoc(allowedRef);

        if (!allowedSnap.exists()) {
            await setDoc(allowedRef, {
                email: currentEmail,
                name: user.displayName || currentEmail.split('@')[0],
                role: currentEmail === SUPER_ADMIN_EMAIL.toLowerCase() ? 'super-admin' : 'user',
                isActive: true,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
            });
        } else {
            await setDoc(allowedRef, {
                name: user.displayName || allowedSnap.data().name || currentEmail.split('@')[0],
                lastLoginAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (err) {
        console.warn('[Auth] Błąd synchronizacji z allowedUsers:', err);
    }

    return true;
}

// ── Inicjalizacja allowedUsers (gwarantowane dodanie super-admina) ──
export async function initAllowedUsers() {
    try {
        const superAdminRef = doc(db, 'allowedUsers', SUPER_ADMIN_EMAIL.toLowerCase());
        const snap = await getDoc(superAdminRef);

        if (!snap.exists()) {
            console.log('[Auth] Dodaję super-admina do allowedUsers...');
            await setDoc(superAdminRef, {
                email: SUPER_ADMIN_EMAIL.toLowerCase(),
                name: 'Tomasz Drozda',
                role: 'super-admin',
                isActive: true,
                createdAt: serverTimestamp()
            });
        }

        if (currentUser) {
            const currentEmail = currentUser.email.trim().toLowerCase();
            const currentRef = doc(db, 'allowedUsers', currentEmail);
            const currentSnap = await getDoc(currentRef);
            if (!currentSnap.exists()) {
                await setDoc(currentRef, {
                    email: currentEmail,
                    name: currentUser.displayName || currentEmail.split('@')[0],
                    role: currentEmail === SUPER_ADMIN_EMAIL.toLowerCase() ? 'super-admin' : 'user',
                    isActive: true,
                    createdAt: serverTimestamp()
                });
            }
        }
    } catch (err) {
        console.warn('[Auth] Nie można zaktualizować allowedUsers:', err);
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
    let cred = null;
    try {
        cred = await signInWithPopup(auth, provider);
    } catch (err) {
        console.warn('[Auth] signInWithPopup error, retrying with signInWithRedirect:', err);
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
            await signInWithRedirect(auth, provider);
            return null;
        }
        throw err;
    }

    if (cred && cred.user) {
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
    return null;
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
