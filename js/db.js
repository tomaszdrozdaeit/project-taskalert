// ============================================================
// DB.JS — Warstwa dostępu do danych (Firestore CRUD)
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { db, auth } from './firebase-config.js';
import {
    collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
    query, where, orderBy, onSnapshot, serverTimestamp, Timestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { buildMailPayload } from './mail-utils.mjs';

// ── Helpers ─────────────────────────────────────────────
function uid() {
    return auth.currentUser?.uid;
}

function userCol(path) {
    const currentUid = uid();
    if (!currentUid) {
        console.warn(`[DB] Brak zalogowanego użytkownika przy dostępie do 'users/{uid}/${path}'`);
        return null;
    }
    return collection(db, 'users', currentUid, path);
}

function userDoc(path, id) {
    const currentUid = uid();
    if (!currentUid) {
        throw new Error('Użytkownik nie jest zalogowany.');
    }
    return doc(db, 'users', currentUid, path, id);
}

// Helper do bezpiecznej konwersji daty
export function parseDate(d) {
    if (!d) return new Date(0);
    if (d instanceof Timestamp) return d.toDate();
    if (typeof d.toDate === 'function') return d.toDate();
    if (typeof d === 'object' && typeof d.seconds === 'number') {
        let sec = d.seconds;
        if (sec > 253402300799) sec = Math.floor(sec / 1000);
        return new Date(sec * 1000);
    }
    if (typeof d === 'number') {
        if (d > 253402300799) return new Date(d);
        return new Date(d * 1000);
    }
    if (d instanceof Date) return d;
    return new Date(d);
}

// Helper do bezpiecznej konwersji dowolnej daty na Firestore Timestamp
export function toFirestoreTimestamp(d) {
    if (!d) return Timestamp.now();
    if (d instanceof Timestamp) return d;
    if (typeof d.toDate === 'function') return Timestamp.fromDate(d.toDate());
    if (typeof d === 'object' && typeof d.seconds === 'number') {
        let sec = d.seconds;
        if (sec > 253402300799) sec = Math.floor(sec / 1000);
        return new Timestamp(sec, d.nanoseconds || 0);
    }
    if (typeof d === 'number') {
        if (d > 253402300799) return Timestamp.fromMillis(d);
        return new Timestamp(d, 0);
    }
    if (d instanceof Date) {
        return isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
    }
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return Timestamp.now();
    return Timestamp.fromDate(dateObj);
}

// ============================================================
// CATEGORIES — Globalne + per-user visibility
// ============================================================

// Globalna kolekcja kategorii (widoczna dla wszystkich)
const GLOBAL_CATEGORIES_COL = 'categories';

// Domyślne kategorie (inicjalizacja)
const DEFAULT_CATEGORIES = [
    {
        name: 'Samochody',
        icon: '🚗',
        color: '#4f8cff',
        isDefault: true,
        order: 1,
        subTypes: [
            { key: 'polisa_oc', label: 'Polisa OC' },
            { key: 'polisa_ac', label: 'Polisa AC' },
            { key: 'przeglad', label: 'Przegląd techniczny' },
            { key: 'custom', label: 'Inne' }
        ]
    },
    {
        name: 'Kadry',
        icon: '👷',
        color: '#7c3aed',
        isDefault: true,
        order: 2,
        subTypes: [
            { key: 'badania_lekarskie', label: 'Badania lekarskie' },
            { key: 'bhp', label: 'Szkolenie BHP' },
            { key: 'custom', label: 'Inne' }
        ]
    },
    {
        name: 'Inne',
        icon: '📋',
        color: '#f59e0b',
        isDefault: true,
        order: 3,
        subTypes: [
            { key: 'custom', label: 'Niestandardowy' }
        ]
    }
];

// Inicjalizacja domyślnych kategorii (raz, przy pierwszym logowaniu)
export async function initDefaultCategories() {
    const categoriesRef = collection(db, GLOBAL_CATEGORIES_COL);
    const snap = await getDocs(categoriesRef);

    if (snap.empty) {
        console.log('[DB] Tworzenie domyślnych kategorii...');
        const batch = writeBatch(db);
        for (const cat of DEFAULT_CATEGORIES) {
            const docRef = doc(categoriesRef);
            batch.set(docRef, {
                ...cat,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        await batch.commit();
        console.log('[DB] Domyślne kategorie utworzone.');
    }
}

// Pobierz kategorie (globalne) — z uwzględnieniem user visibility
export async function getCategories() {
    const categoriesRef = collection(db, GLOBAL_CATEGORIES_COL);
    const snap = await getDocs(categoriesRef);
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return cats.sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Nasłuchuj zmian w kategoriach (real-time)
export function onCategoriesChange(callback) {
    const categoriesRef = collection(db, GLOBAL_CATEGORIES_COL);
    return onSnapshot(categoriesRef, (snap) => {
        const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cats.sort((a, b) => (a.order || 0) - (b.order || 0));
        callback(cats);
    }, (err) => {
        console.error('[DB] Błąd nasłuchiwania kategorii:', err);
        callback([]);
    });
}

// Pobierz widoczność kategorii dla użytkownika
export async function getUserCategoryVisibility() {
    if (!uid()) return {};
    const visRef = doc(db, 'users', uid(), 'settings', 'categoryVisibility');
    const snap = await getDoc(visRef);
    return snap.exists() ? snap.data() : {};
}

// Ustaw widoczność kategorii
export async function setCategoryVisibility(categoryId, visible) {
    if (!uid()) return;
    const visRef = doc(db, 'users', uid(), 'settings', 'categoryVisibility');
    await setDoc(visRef, { [categoryId]: visible }, { merge: true });
}

// Dodaj nową kategorię (globalną)
export async function addCategory(data) {
    const categoriesRef = collection(db, GLOBAL_CATEGORIES_COL);
    // Oblicz kolejność
    const snap = await getDocs(categoriesRef);
    const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order || 0), 0);

    const docRef = await addDoc(categoriesRef, {
        name: data.name,
        icon: data.icon || '📋',
        color: data.color || '#64748b',
        isDefault: false,
        order: maxOrder + 1,
        subTypes: data.subTypes || [{ key: 'custom', label: 'Niestandardowy' }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

// Aktualizuj kategorię
export async function updateCategory(id, data) {
    const catRef = doc(db, GLOBAL_CATEGORIES_COL, id);
    await updateDoc(catRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// Usuń kategorię
export async function deleteCategory(id) {
    const catRef = doc(db, GLOBAL_CATEGORIES_COL, id);
    await deleteDoc(catRef);
}

// ============================================================
// REMINDERS — CRUD z alertFlags i historią
// ============================================================

// Buduj alertFlags na podstawie tablicy alertDays
function buildAlertFlags(alertDays) {
    const flags = {};
    (alertDays || []).forEach(d => { flags[String(d)] = false; });
    return flags;
}

// Dodaj nowe przypomnienie (prywatne lub zespołowe)
export async function addReminder(data) {
    if (data.isShared || (data.participants && data.participants.length > 0)) {
        return await addSharedAlert(data);
    }

    const remindersRef = userCol('reminders');
    if (!remindersRef) throw new Error('Użytkownik nie jest zalogowany.');

    const alertDays = data.alertDays || [30, 14, 7, 3, 1];
    const expiryTimestamp = toFirestoreTimestamp(data.expiryDate);

    const initialHistory = [{
        type: 'created',
        timestamp: Timestamp.now(),
        note: 'Utworzenie alertu w systemie',
        expiryDate: expiryTimestamp
    }];

    const reminderData = {
        title: String(data.title || '').trim(),
        description: String(data.description || data.notes || '').trim(),
        categoryId: String(data.categoryId || '').trim(),
        categoryName: String(data.categoryName || '').trim(),
        subType: String(data.subType || 'custom').trim(),
        subTypeLabel: String(data.subTypeLabel || 'Niestandardowy').trim(),
        primaryEmail: String(data.primaryEmail || '').trim(),
        secondaryEmail: String(data.secondaryEmail || '').trim(),
        expiryDate: expiryTimestamp,
        status: 'active',
        alertDays: alertDays,
        alertFlags: buildAlertFlags(alertDays),
        lastExecutedAt: null,
        nextExpiryDate: null,
        recurrenceMonths: parseInt(data.recurrenceMonths) || 0,
        notes: String(data.notes || data.description || '').trim(),
        history: initialHistory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(remindersRef, reminderData);
    return docRef.id;
}

// Pobierz jedno przypomnienie po ID (prywatne lub zespołowe)
export async function getReminder(id) {
    const currentUid = uid();
    if (!currentUid) return null;

    // Próba odczytu z przypomnień prywatnych
    try {
        const privateRef = userDoc('reminders', id);
        const snap = await getDoc(privateRef);
        if (snap.exists()) {
            return { id: snap.id, isShared: false, ...snap.data() };
        }
    } catch (e) {}

    // Próba odczytu ze sharedAlerts
    try {
        const sharedRef = doc(db, 'sharedAlerts', id);
        const snap = await getDoc(sharedRef);
        if (snap.exists()) {
            return { id: snap.id, isShared: true, ...snap.data() };
        }
    } catch (e) {
        console.warn('[DB] Błąd odczytu alertu zespołowego:', e);
    }

    return null;
}

// Aktualizuj przypomnienie (prywatne lub zespołowe)
export async function updateReminder(id, data) {
    const currentUid = uid();
    if (!currentUid) throw new Error('Użytkownik nie jest zalogowany.');

    // Sprawdź najpierw w przypomnieniach prywatnych
    const privateRef = userDoc('reminders', id);
    let isPrivate = false;
    try {
        const snap = await getDoc(privateRef);
        if (snap.exists()) isPrivate = true;
    } catch (e) {}

    if (!isPrivate) {
        // Zaktualizuj alert zespołowy w sharedAlerts
        return await updateSharedAlert(id, data);
    }

    if (data.alertDays) {
        data.alertFlags = buildAlertFlags(data.alertDays);
    }
    if (data.expiryDate !== undefined) {
        data.expiryDate = toFirestoreTimestamp(data.expiryDate);
    }

    try {
        const snap = await getDoc(privateRef);
        if (snap.exists()) {
            const currentData = snap.data();
            const history = [...(currentData.history || [])];
            history.push({
                type: 'edited',
                timestamp: Timestamp.now(),
                note: 'Zaktualizowano dane przypomnienia'
            });
            data.history = history;
        }
    } catch (err) {
        console.warn('[DB] Błąd odczytu historii przed edycją:', err);
    }

    await updateDoc(privateRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// Usuń przypomnienie (prywatne lub zespołowe)
export async function deleteReminder(id) {
    const currentUid = uid();
    if (!currentUid) throw new Error('Użytkownik nie jest zalogowany.');

    const privateRef = userDoc('reminders', id);
    try {
        const snap = await getDoc(privateRef);
        if (snap.exists()) {
            await deleteDoc(privateRef);
            return;
        }
    } catch (e) {}

    // Próba usunięcia ze sharedAlerts
    await deleteSharedAlert(id);
}

// Oznacz jako wykonane — reset flag + historia + nowy cykl
export async function markAsExecuted(id, executedDate = new Date(), nextExpiryDate = null, note = '') {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error('Nie znaleziono przypomnienia.');

    const alertDays = reminder.alertDays || [30, 14, 7, 3, 1];

    const historyEntry = {
        type: 'executed',
        timestamp: Timestamp.now(),
        executedAt: toFirestoreTimestamp(executedDate),
        newExpiry: nextExpiryDate ? toFirestoreTimestamp(nextExpiryDate) : null,
        note: note || 'Oznaczono przypomnienie jako wykonane'
    };

    const updatedHistory = [...(reminder.history || []), historyEntry];

    if (reminder.isShared) {
        const sharedRef = doc(db, SHARED_ALERTS_COL, id);
        if (nextExpiryDate) {
            await updateDoc(sharedRef, {
                expiryDate: toFirestoreTimestamp(nextExpiryDate),
                lastExecutedAt: toFirestoreTimestamp(executedDate),
                alertFlags: buildAlertFlags(alertDays),
                history: updatedHistory,
                updatedAt: serverTimestamp()
            });
        } else {
            await updateDoc(sharedRef, {
                status: 'completed',
                lastExecutedAt: toFirestoreTimestamp(executedDate),
                history: updatedHistory,
                updatedAt: serverTimestamp()
            });
        }
        return;
    }

    const reminderRef = userDoc('reminders', id);
    if (nextExpiryDate) {
        await updateDoc(reminderRef, {
            expiryDate: toFirestoreTimestamp(nextExpiryDate),
            lastExecutedAt: toFirestoreTimestamp(executedDate),
            alertFlags: buildAlertFlags(alertDays),
            history: updatedHistory,
            updatedAt: serverTimestamp()
        });
    } else {
        await updateDoc(reminderRef, {
            status: 'completed',
            lastExecutedAt: toFirestoreTimestamp(executedDate),
            history: updatedHistory,
            updatedAt: serverTimestamp()
        });
    }
}

// Pobierz aktywne przypomnienia (prywatne + zespołowe)
export async function getActiveReminders() {
    const currentUid = uid();
    if (!currentUid) return [];

    let privateReminders = [];
    try {
        const remindersRef = userCol('reminders');
        if (remindersRef) {
            const snap = await getDocs(remindersRef);
            privateReminders = snap.docs.map(d => ({ id: d.id, isShared: false, ...d.data() })).filter(r => r.status === 'active');
        }
    } catch (e) {}

    let sharedReminders = [];
    try {
        const sharedRef = collection(db, SHARED_ALERTS_COL);
        const snap = await getDocs(sharedRef);
        sharedReminders = snap.docs.map(d => ({ id: d.id, isShared: true, ...d.data() })).filter(a => {
            const uids = a.participantUids || (a.participants || []).map(p => p.uid);
            return uids.includes(currentUid) && a.status === 'active';
        });
    } catch (e) {}

    const combined = [...privateReminders, ...sharedReminders];
    return combined.sort((a, b) => parseDate(a.expiryDate) - parseDate(b.expiryDate));
}

// Nasłuchuj zmian w przypomnieniach (prywatne + zespołowe w czasie rzeczywistym)
export function onRemindersChange(callback, statusFilter = 'active') {
    const currentUid = uid();
    if (!currentUid) {
        callback([]);
        return () => {};
    }

    let privateReminders = [];
    let sharedReminders = [];

    const notify = () => {
        let combined = [...privateReminders, ...sharedReminders];
        if (statusFilter !== 'all') {
            combined = combined.filter(r => r.status === statusFilter);
        }
        combined.sort((a, b) => {
            if (statusFilter === 'completed') {
                return parseDate(b.updatedAt || b.lastExecutedAt) - parseDate(a.updatedAt || a.lastExecutedAt);
            } else {
                return parseDate(a.expiryDate) - parseDate(b.expiryDate);
            }
        });
        callback(combined);
    };

    const remindersRef = collection(db, 'users', currentUid, 'reminders');
    const unsubPrivate = onSnapshot(remindersRef, (snap) => {
        privateReminders = snap.docs.map(d => ({ id: d.id, isShared: false, ...d.data() }));
        notify();
    }, (err) => {
        console.warn('[DB] Błąd nasłuchiwania prywatnych przypomnień:', err);
        privateReminders = [];
        notify();
    });

    const sharedRef = collection(db, SHARED_ALERTS_COL);
    const unsubShared = onSnapshot(sharedRef, (snap) => {
        sharedReminders = snap.docs
            .map(d => ({ id: d.id, isShared: true, ...d.data() }))
            .filter(a => {
                const uids = a.participantUids || (a.participants || []).map(p => p.uid);
                return uids.includes(currentUid);
            });
        notify();
    }, (err) => {
        // Cichy fallback przy braku dostępu do alertów zespołowych
        sharedReminders = [];
        notify();
    });

    return () => {
        unsubPrivate();
        unsubShared();
    };
}

// Pobierz przypomnienia po kategorii (prywatne + zespołowe)
export async function getRemindersByCategory(categoryId) {
    const allActive = await getActiveReminders();
    return allActive.filter(r => r.categoryId === categoryId || r.categoryName === categoryId);
}

// Pobierz nadchodzące alerty (w ciągu N dni)
export async function getUpcomingAlerts(daysAhead = 30) {
    const reminders = await getActiveReminders();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    return reminders.filter(r => {
        const expiry = parseDate(r.expiryDate);
        return expiry <= target;
    });
}

// Pobierz przeterminowane
export async function getOverdueReminders() {
    const reminders = await getActiveReminders();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return reminders.filter(r => {
        const expiry = parseDate(r.expiryDate);
        return expiry < now;
    });
}

// Pobierz zakończone (historia — prywatne + zespołowe)
export async function getCompletedReminders() {
    const currentUid = uid();
    if (!currentUid) return [];

    let privateRem = [];
    try {
        const remindersRef = userCol('reminders');
        if (remindersRef) {
            const snap = await getDocs(remindersRef);
            privateRem = snap.docs.map(d => ({ id: d.id, isShared: false, ...d.data() })).filter(r => r.status === 'completed');
        }
    } catch (e) {}

    let sharedRem = [];
    try {
        const sharedRef = collection(db, SHARED_ALERTS_COL);
        const snap = await getDocs(sharedRef);
        sharedRem = snap.docs.map(d => ({ id: d.id, isShared: true, ...d.data() })).filter(a => {
            const uids = a.participantUids || (a.participants || []).map(p => p.uid);
            return uids.includes(currentUid) && a.status === 'completed';
        });
    } catch (e) {}

    const combined = [...privateRem, ...sharedRem];
    return combined.sort((a, b) => parseDate(b.updatedAt || b.lastExecutedAt) - parseDate(a.updatedAt || a.lastExecutedAt));
}

// ============================================================
// USER PROFILE
// ============================================================
export async function updateUserProfile(data) {
    if (!uid()) throw new Error('Użytkownik nie jest zalogowany.');
    const profileRef = doc(db, 'users', uid(), 'profile', 'main');
    await setDoc(profileRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function getUserProfile() {
    if (!uid()) return null;
    const profileRef = doc(db, 'users', uid(), 'profile', 'main');
    const snap = await getDoc(profileRef);
    return snap.exists() ? snap.data() : null;
}

// ============================================================
// MAIL TRIGGER (for Firebase Extension "Trigger Email")
// ============================================================
export async function sendManualNotification(reminder) {
    const payload = buildMailPayload(reminder);
    const recipients = payload.to;

    const mailRef = collection(db, 'mail');
    const docRef = await addDoc(mailRef, {
        to: recipients,
        createdAt: serverTimestamp(),
        message: payload.message
    });

    if (reminder.id) {
        try {
            const reminderRef = userDoc('reminders', reminder.id);
            const snap = await getDoc(reminderRef);
            if (snap.exists()) {
                const currentData = snap.data();
                const history = [...(currentData.history || [])];
                history.push({
                    type: 'email_sent',
                    timestamp: Timestamp.now(),
                    recipients: recipients,
                    note: `Wysłano powiadomienie e-mail (${recipients.join(', ')})`
                });
                await updateDoc(reminderRef, { history, updatedAt: serverTimestamp() });
            }
        } catch (err) {
            console.warn('[DB] Błąd dodawania historii e-mail:', err);
        }
    }

    return { id: docRef.id, recipients };
}

// ============================================================
// ALLOWED USERS (Whitelist)
// ============================================================

// Pobierz wszystkich dozwolonych użytkowników
export async function getAllowedUsers() {
    try {
        const allowedRef = collection(db, 'allowedUsers');
        const snap = await getDocs(allowedRef);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
        // Cichy fallback przy braku dostępu do odczytu z listy whitelisty
        return [];
    }
}

// Nasłuchuj zmian na liście allowedUsers (w czasie rzeczywistym)
export function onAllowedUsersChange(callback) {
    try {
        const allowedRef = collection(db, 'allowedUsers');
        return onSnapshot(allowedRef, (snap) => {
            const users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
            callback(users);
        }, (err) => {
            console.warn('[DB] Błąd nasłuchiwania allowedUsers:', err);
            callback([]);
        });
    } catch (e) {
        callback([]);
        return () => {};
    }
}

// Pobierz jednego dozwolonego użytkownika po email
export async function getAllowedUser(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
    const snap = await getDoc(allowedRef);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Dodaj użytkownika do whitelist
export async function addAllowedUser(data) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);

    // Sprawdź czy już istnieje
    const existing = await getDoc(allowedRef);
    if (existing.exists()) {
        throw new Error(`Użytkownik ${normalizedEmail} już istnieje na liście.`);
    }

    await setDoc(allowedRef, {
        email: normalizedEmail,
        name: data.name || normalizedEmail.split('@')[0],
        role: data.role || 'user',
        isActive: data.isActive !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return normalizedEmail;
}

// Aktualizuj użytkownika na whitelist
export async function updateAllowedUser(email, data) {
    const normalizedEmail = email.trim().toLowerCase();
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);

    await updateDoc(allowedRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// Usuń użytkownika z whitelist
export async function deleteAllowedUser(email) {
    const normalizedEmail = email.trim().toLowerCase();

    // Ochrona super-admina
    const allowedRef = doc(db, 'allowedUsers', normalizedEmail);
    const snap = await getDoc(allowedRef);
    if (snap.exists() && snap.data().role === 'super-admin') {
        throw new Error('Nie można usunąć konta super-administratora.');
    }

    await deleteDoc(allowedRef);
}

// Nasłuchuj zmian w allowedUsers (real-time)
export function onAllowedUsersChange(callback) {
    const allowedRef = collection(db, 'allowedUsers');
    return onSnapshot(allowedRef, (snap) => {
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        callback(users);
    }, (err) => {
        console.error('[DB] Błąd nasłuchiwania allowedUsers:', err);
        callback([]);
    });
}

// ============================================================
// SHARED ALERTS (Alerty współdzielone)
// ============================================================

const SHARED_ALERTS_COL = 'sharedAlerts';

// Dodaj alert współdzielony
export async function addSharedAlert(data) {
    const alertsRef = collection(db, SHARED_ALERTS_COL);
    const alertDays = data.alertDays || [30, 14, 7, 3, 1];
    const expiryTimestamp = toFirestoreTimestamp(data.expiryDate);

    const cleanParticipants = (data.participants || []).map(p => ({
        uid: String(p.uid || p.email || '').trim(),
        email: String(p.email || '').trim(),
        name: String(p.name || p.email || '').trim(),
        role: String(p.role || 'executor').trim()
    })).filter(p => p.email.length > 0);

    const participantUids = cleanParticipants.map(p => p.uid).filter(Boolean);
    const currentUid = uid() || auth.currentUser?.uid || 'anon';

    const initialHistory = [{
        type: 'created',
        timestamp: Timestamp.now(),
        note: 'Utworzenie alertu zespołowego',
        expiryDate: expiryTimestamp,
        byUid: currentUid,
        byName: String(data.createdByName || auth.currentUser?.displayName || auth.currentUser?.email || '').trim()
    }];

    const alertData = {
        title: String(data.title || '').trim(),
        description: String(data.description || data.notes || '').trim(),
        categoryId: String(data.categoryId || '').trim(),
        categoryName: String(data.categoryName || '').trim(),
        subType: String(data.subType || 'custom').trim(),
        subTypeLabel: String(data.subTypeLabel || 'Niestandardowy').trim(),
        expiryDate: expiryTimestamp,
        status: 'active',
        alertDays: alertDays,
        alertFlags: buildAlertFlags(alertDays),
        recurrenceMonths: parseInt(data.recurrenceMonths) || 0,
        notes: String(data.notes || data.description || '').trim(),
        createdBy: currentUid,
        createdByName: String(data.createdByName || auth.currentUser?.displayName || auth.currentUser?.email || '').trim(),
        participants: cleanParticipants,
        participantUids: participantUids,
        history: initialHistory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(alertsRef, alertData);
    return docRef.id;
}

// Pobierz alerty współdzielone dla bieżącego użytkownika
export async function getSharedAlerts(filterRole = null) {
    const alertsRef = collection(db, SHARED_ALERTS_COL);
    const snap = await getDocs(alertsRef);
    const currentUid = uid();

    let alerts = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => {
            const uids = a.participantUids || (a.participants || []).map(p => p.uid);
            return uids.includes(currentUid) && a.status === 'active';
        });

    if (filterRole) {
        alerts = alerts.filter(a => {
            const participant = (a.participants || []).find(p => p.uid === currentUid);
            return participant && participant.role === filterRole;
        });
    }

    return alerts.sort((a, b) => parseDate(a.expiryDate) - parseDate(b.expiryDate));
}

// Pobierz jeden alert współdzielony
export async function getSharedAlert(id) {
    const alertRef = doc(db, SHARED_ALERTS_COL, id);
    const snap = await getDoc(alertRef);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Aktualizuj alert współdzielony
export async function updateSharedAlert(id, data) {
    const alertRef = doc(db, SHARED_ALERTS_COL, id);

    if (data.alertDays) {
        data.alertFlags = buildAlertFlags(data.alertDays);
    }
    if (data.expiryDate !== undefined) {
        data.expiryDate = toFirestoreTimestamp(data.expiryDate);
    }
    if (data.participants) {
        data.participantUids = data.participants.map(p => p.uid);
    }

    // Dodaj wpis historii
    try {
        const snap = await getDoc(alertRef);
        if (snap.exists()) {
            const currentData = snap.data();
            const history = [...(currentData.history || [])];
            history.push({
                type: 'edited',
                timestamp: Timestamp.now(),
                note: 'Zaktualizowano dane alertu zespołowego',
                byUid: uid()
            });
            data.history = history;
        }
    } catch (err) {
        console.warn('[DB] Błąd odczytu historii sharedAlert:', err);
    }

    await updateDoc(alertRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// Usuń alert współdzielony
export async function deleteSharedAlert(id) {
    const alertRef = doc(db, SHARED_ALERTS_COL, id);
    await deleteDoc(alertRef);
}

// Dodaj uczestnika do alertu współdzielonego
export async function addParticipantToSharedAlert(alertId, participant) {
    const alert = await getSharedAlert(alertId);
    if (!alert) throw new Error('Alert nie istnieje.');

    const participants = [...(alert.participants || [])];
    if (participants.some(p => p.uid === participant.uid)) {
        throw new Error('Użytkownik jest już dodany do tego alertu.');
    }

    participants.push(participant);
    await updateSharedAlert(alertId, { participants });
}

// Usuń uczestnika z alertu współdzielonego
export async function removeParticipantFromSharedAlert(alertId, participantUid) {
    const alert = await getSharedAlert(alertId);
    if (!alert) throw new Error('Alert nie istnieje.');

    const participants = (alert.participants || []).filter(p => p.uid !== participantUid);
    await updateSharedAlert(alertId, { participants });
}

// Nasłuchuj zmian w alertach współdzielonych (real-time)
export function onSharedAlertsChange(callback) {
    const alertsRef = collection(db, SHARED_ALERTS_COL);
    const currentUid = uid();

    return onSnapshot(alertsRef, (snap) => {
        const alerts = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
                const uids = a.participantUids || (a.participants || []).map(p => p.uid);
                return uids.includes(currentUid);
            });

        alerts.sort((a, b) => parseDate(a.expiryDate) - parseDate(b.expiryDate));
        callback(alerts);
    }, (err) => {
        console.error('[DB] Błąd nasłuchiwania sharedAlerts:', err);
        callback([]);
    });
}
