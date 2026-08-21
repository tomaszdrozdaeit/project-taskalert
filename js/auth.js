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

// ── Sprawdzenie czy e-mail jest na liście dozwolonych (Strict Whitelist) ───
export async function isUserAllowed(email) {
    if (!email) return false;
    const normalizedEmail = email.trim().toLowerCase();

    // SUPER ADMIN ZAWSZE DOZWOLONY
    if (normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

    try {
        const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
        const snap = await getDoc(allowedRef);
        if (snap.exists()) {
            const data = snap.data();
            // Dozwolony wyłącznie gdy konto istnieje na whitelist i isActive nie jest false
            return data.isActive !== false;
        }
        // Brak wpisu w allowedUsers -> użytkownik NIE ma dostępu!
        console.warn(`[Auth] Odmowa dostępu: adres ${normalizedEmail} nie znajduje się na liście dozwolonych.`);
        return false;
    } catch (err) {
        console.error('[Auth] Błąd weryfikacji whitelist w allowedUsers:', err);
        return false;
    }
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
        // Cichy fallback na podstawową rolę użytkownika
    }
    return 'user';
}

// ── Inicjalizacja profilu w Firestore przy pierwszym logowaniu ──
export async function ensureUserProfile(user) {
    if (!user || !user.email) return false;
    const currentEmail = user.email.trim().toLowerCase();

    // Sprawdź czy użytkownik jest dozwolony
    const allowed = await isUserAllowed(currentEmail);
    if (!allowed) {
        console.warn('[Auth] ensureUserProfile przerwane: użytkownik nieautoryzowany:', currentEmail);
        return false;
    }

    const profileRef = doc(db, 'users', user.uid, 'profile', 'main');
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
        await setDoc(profileRef, {
            displayName: user.displayName || currentEmail.split('@')[0],
            email: currentEmail,
            defaultPrimaryEmail: currentEmail,
            defaultSecondaryEmail: '',
            defaultAlertDays: [30, 14, 7, 3, 1],
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
        });
        console.log('[Auth] Profil użytkownika utworzony w Firestore');
    } else {
        await setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    }

    // Zsynchronizuj wpis użytkownika z kolekcją allowedUsers (wyłącznie dla istniejących kont na whitelist)
    try {
        const allowedRef = doc(db, 'allowedUsers', currentEmail);
        const allowedSnap = await getDoc(allowedRef);

        if (allowedSnap.exists()) {
            const updatePayload = {
                uid: user.uid,
                name: user.displayName || allowedSnap.data()?.name || currentEmail.split('@')[0],
                lastLoginAt: serverTimestamp()
            };
            if (currentEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
                updatePayload.role = 'super-admin';
                updatePayload.isActive = true;
            }
            await setDoc(allowedRef, updatePayload, { merge: true });
        } else if (currentEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
            // Tylko super-admin może zainicjalizować swój dokument jeśli baza jest pusta
            await setDoc(allowedRef, {
                uid: user.uid,
                email: currentEmail,
                name: user.displayName || 'Tomasz Drozda',
                role: 'super-admin',
                isActive: true,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
            });
        }
    } catch (err) {
        console.warn('[Auth] Błąd synchronizacji profilu w allowedUsers:', err);
    }

    return true;
}

// ── Inicjalizacja allowedUsers (gwarantowane dodanie super-admina) ──
export async function initAllowedUsers() {
    try {
        const superAdminRef = doc(db, 'allowedUsers', SUPER_ADMIN_EMAIL.toLowerCase());
        const snap = await getDoc(superAdminRef);

        if (!snap.exists()) {
            console.log('[Auth] Inicjalizuję super-admina w allowedUsers...');
            await setDoc(superAdminRef, {
                email: SUPER_ADMIN_EMAIL.toLowerCase(),
                name: 'Tomasz Drozda',
                role: 'super-admin',
                isActive: true,
                createdAt: serverTimestamp()
            });
        }
    } catch (err) {
        console.warn('[Auth] Błąd initAllowedUsers:', err);
    }
}

// ── Rejestracja (Email + Hasło) ─────────────────────────
export async function registerUser(email, password, displayName) {
    if (!email) throw { code: 'auth/invalid-email', message: 'Podaj poprawny adres e-mail.' };
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Utwórz konto w Firebase Auth (uwierzytelnienie)
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

    // 2. Po utworzeniu i uwierzytelnieniu sprawdź czy adres znajduje się na whitelist
    const allowed = await isUserAllowed(cred.user.email);
    if (!allowed) {
        // Jeśli użytkownik nie jest na whitelist - usuń/wyloguj nieuprawnione konto
        try {
            await cred.user.delete();
        } catch (e) {
            await signOut(auth);
        }
        throw {
            code: 'auth/user-not-allowed',
            message: 'Rejestracja zablokowana: Twój adres e-mail nie znajduje się na liście autoryzowanych użytkowników (whitelist). Skontaktuj się z administratorem, aby dodał Twoje konto.'
        };
    }

    // 3. Uprawniony użytkownik — zaktualizuj nazwę i zainicjalizuj profil
    await updateProfile(cred.user, { displayName });
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie (Email + Hasło) ───────────────────────────
export async function loginUser(email, password) {
    if (!email) throw { code: 'auth/invalid-email', message: 'Podaj poprawny adres e-mail.' };
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Zaloguj w Firebase Auth (uwierzytelnienie użytkownika)
    const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);

    // 2. Po pomyślnym zalogowaniu (z ważnym tokenem auth) sprawdź czy konto jest aktywne na whitelist
    const allowed = await isUserAllowed(cred.user.email);
    if (!allowed) {
        // Wyloguj nieuprawnione lub zablokowane konto
        await signOut(auth);
        throw {
            code: 'auth/user-not-allowed',
            message: 'Odmowa dostępu: Twój adres e-mail nie znajduje się na liście autoryzowanych użytkowników lub został zablokowany przez administratora.'
        };
    }

    // 3. Zainicjalizuj i zsynchronizuj profil
    await ensureUserProfile(cred.user);
    return cred.user;
}

// ── Logowanie z Google ──────────────────────────────────
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    try {
        const cred = await signInWithPopup(auth, provider);
        if (cred && cred.user) {
            const allowed = await isUserAllowed(cred.user.email);
            if (!allowed) {
                await signOut(auth);
                throw {
                    code: 'auth/user-not-allowed',
                    message: 'Odmowa dostępu: Konto Google (' + cred.user.email + ') nie znajduje się na liście dozwolonych użytkowników systemu.'
                };
            }
            await ensureUserProfile(cred.user);
            return cred.user;
        }
    } catch (err) {
        if (err.code === 'auth/popup-blocked') {
            console.warn('[Auth] Okno popup zablokowane w przeglądarce — przełączam na signInWithRedirect:', err.code);
            await signInWithRedirect(auth, provider);
            return null;
        }
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
            console.log('[Auth] Logowanie Google anulowane przez użytkownika.');
            return null;
        }
        throw err;
    }

    return null;
}

// ── Obsługa powrotu z Google Redirect ──────────────────
(async () => {
    try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
            const allowed = await isUserAllowed(result.user.email);
            if (!allowed) {
                await signOut(auth);
                console.warn('[Auth] Konto po redirect nie jest autoryzowane:', result.user.email);
                if (window.TaskAlert?.showToast) {
                    window.TaskAlert.showToast('Odmowa dostępu: Konto Google (' + result.user.email + ') nie znajduje się na liście dozwolonych użytkowników.', 'error', { duration: 8000 });
                }
            } else {
                await ensureUserProfile(result.user);
                console.log('[Auth] Zalogowano przez Google (redirect):', result.user.email);
            }
        }
    } catch (err) {
        if (err.code !== 'auth/no-current-user') {
            console.warn('[Auth] getRedirectResult error:', err.code, err.message);
        }
    }
})();

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
