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
function parseDate(d) {
    if (!d) return new Date(0);
    if (d.toDate && typeof d.toDate === 'function') return d.toDate();
    if (d instanceof Date) return d;
    return new Date(d);
}

// Helper do bezpiecznej konwersji dowolnej daty na Firestore Timestamp
function toFirestoreTimestamp(d) {
    if (!d) return Timestamp.now();
    if (d instanceof Timestamp) return d;
    if (d.toDate && typeof d.toDate === 'function') return Timestamp.fromDate(d.toDate());
    const dateObj = parseDate(d);
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

// Dodaj nowe przypomnienie
export async function addReminder(data) {
    const remindersRef = userCol('reminders');
    if (!remindersRef) throw new Error('Użytkownik nie jest zalogowany.');

    const alertDays = data.alertDays || [30, 14];
    const expiryTimestamp = toFirestoreTimestamp(data.expiryDate);

    const initialHistory = [{
        type: 'created',
        timestamp: Timestamp.now(),
        note: 'Utworzenie alertu w systemie',
        expiryDate: expiryTimestamp
    }];

    const reminderData = {
        title: data.title || '',
        description: data.description || '',
        categoryId: data.categoryId || '',
        categoryName: data.categoryName || '',
        subType: data.subType || 'custom',
        subTypeLabel: data.subTypeLabel || 'Niestandardowy',
        primaryEmail: data.primaryEmail || '',
        secondaryEmail: data.secondaryEmail || '',
        expiryDate: expiryTimestamp,
        status: 'active',
        alertDays: alertDays,
        alertFlags: buildAlertFlags(alertDays),
        lastExecutedAt: null,
        nextExpiryDate: null,
        recurrenceMonths: data.recurrenceMonths || 0,
        notes: data.notes || '',
        history: initialHistory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(remindersRef, reminderData);
    return docRef.id;
}

// Aktualizuj przypomnienie
export async function updateReminder(id, data) {
    const reminderRef = userDoc('reminders', id);

    // Jeśli alertDays się zmieniły, przebuduj flagi
    if (data.alertDays) {
        data.alertFlags = buildAlertFlags(data.alertDays);
    }

    if (data.expiryDate !== undefined) {
        data.expiryDate = toFirestoreTimestamp(data.expiryDate);
    }

    try {
        const snap = await getDoc(reminderRef);
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

    await updateDoc(reminderRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// Usuń przypomnienie
export async function deleteReminder(id) {
    const reminderRef = userDoc('reminders', id);
    await deleteDoc(reminderRef);
}

// Oznacz jako wykonane — reset flag + historia + nowy cykl
export async function markAsExecuted(id, executedDate = new Date(), nextExpiryDate = null, note = '') {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error('Nie znaleziono przypomnienia.');

    const reminderRef = userDoc('reminders', id);
    const alertDays = reminder.alertDays || [30, 14];

    const historyEntry = {
        type: 'executed',
        timestamp: Timestamp.now(),
        executedAt: toFirestoreTimestamp(executedDate),
        newExpiry: nextExpiryDate ? toFirestoreTimestamp(nextExpiryDate) : null,
        note: note || 'Oznaczono przypomnienie jako wykonane'
    };

    const updatedHistory = [...(reminder.history || []), historyEntry];

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

// Pobierz aktywne przypomnienia
export async function getActiveReminders() {
    const remindersRef = userCol('reminders');
    if (!remindersRef) return [];
    const snap = await getDocs(remindersRef);
    const reminders = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status === 'active');
    return reminders.sort((a, b) => parseDate(a.expiryDate) - parseDate(b.expiryDate));
}

// Nasłuchuj zmian w przypomnieniach (real-time) bez wymogu indeksów złożonych
export function onRemindersChange(callback, statusFilter = 'active') {
    const remindersRef = userCol('reminders');
    if (!remindersRef) {
        callback([]);
        return () => {};
    }

    return onSnapshot(remindersRef, (snap) => {
        let reminders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (statusFilter !== 'all') {
            reminders = reminders.filter(r => r.status === statusFilter);
        }

        reminders.sort((a, b) => {
            if (statusFilter === 'completed') {
                const dateA = parseDate(a.updatedAt || a.lastExecutedAt);
                const dateB = parseDate(b.updatedAt || b.lastExecutedAt);
                return dateB - dateA;
            } else {
                return parseDate(a.expiryDate) - parseDate(b.expiryDate);
            }
        });

        callback(reminders);
    }, (err) => {
        console.error('[DB] Błąd podczas nasłuchiwania przypomnień:', err);
        callback([]);
    });
}

// Pobierz przypomnienia po kategorii
export async function getRemindersByCategory(categoryId) {
    const remindersRef = userCol('reminders');
    if (!remindersRef) return [];
    const snap = await getDocs(remindersRef);
    const reminders = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status === 'active' && r.categoryId === categoryId);
    return reminders.sort((a, b) => parseDate(a.expiryDate) - parseDate(b.expiryDate));
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

// Pobierz zakończone (historia)
export async function getCompletedReminders() {
    const remindersRef = userCol('reminders');
    if (!remindersRef) return [];
    const snap = await getDocs(remindersRef);
    const reminders = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status === 'completed');
    return reminders.sort((a, b) => parseDate(b.updatedAt || b.lastExecutedAt) - parseDate(a.updatedAt || a.lastExecutedAt));
}

// Pobierz jedno przypomnienie
export async function getReminder(id) {
    const reminderRef = userDoc('reminders', id);
    const snap = await getDoc(reminderRef);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
    const rawRecipients = [reminder.primaryEmail, reminder.secondaryEmail];
    const recipients = rawRecipients.filter(e => e && typeof e === 'string' && e.includes('@'));

    if (recipients.length === 0) {
        throw new Error('Brak prawidłowego adresu e-mail odbiorcy w tym przypomnieniu.');
    }

    const mailRef = collection(db, 'mail');
    const expiryDate = parseDate(reminder.expiryDate).toLocaleDateString('pl-PL');

    const docRef = await addDoc(mailRef, {
        to: recipients,
        createdAt: serverTimestamp(),
        message: {
            subject: `⏰ TaskAlert: ${reminder.title} — termin: ${expiryDate}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #4f8cff, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: #fff; margin: 0; font-size: 22px;">🔔 TaskAlert — Przypomnienie</h1>
                    </div>
                    <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                        <h2 style="margin: 0 0 8px; color: #1a1f2e;">${reminder.title}</h2>
                        <p style="color: #64748b; margin: 0 0 16px;">Kategoria: ${reminder.categoryName || 'Brak'}</p>
                        <div style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <p style="margin: 0; color: #1a1f2e;"><strong>📅 Data wygaśnięcia:</strong> ${expiryDate}</p>
                            ${reminder.notes ? `<p style="margin: 12px 0 0; color: #64748b;">📝 ${reminder.notes}</p>` : ''}
                        </div>
                        <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Wysłano z systemu TaskAlert</p>
                    </div>
                </div>`
        }
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
