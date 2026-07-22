// ============================================================
// APP.JS — SPA Router, Toasty, Modale, Helpery
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onAuthChange, loginUser, registerUser, resetPassword, logoutUser, currentUser, loginWithGoogle } from './auth.js';
import { initDefaultCategories } from './db.js';

// ============================================================
// THEME MANAGEMENT
// ============================================================
const THEME_KEY = 'taskalert-theme';

function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0f1219' : '#4f8cff';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// Inicjalizuj motyw
setTheme(getPreferredTheme());

// Podłącz przyciski zmiany motywu
document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
});

// ============================================================
// DOM REFERENCES
// ============================================================
const loginScreen    = document.getElementById('login-screen');
const appWrapper     = document.getElementById('app-wrapper');
const appContent     = document.getElementById('app-content');
const pageLoader     = document.getElementById('page-loader');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebarToggle  = document.getElementById('sidebar-toggle');
const sidebarNav     = document.getElementById('sidebar-nav');
const logoutBtn      = document.getElementById('logout-btn');
const fabAdd         = document.getElementById('fab-add');

// Auth forms
const loginForm    = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const resetForm    = document.getElementById('reset-form');
const authSwitch   = document.getElementById('auth-switch-btn');
const authSwitchTx = document.getElementById('auth-switch-text');
const forgotLink   = document.getElementById('forgot-password-link');

// ============================================================
// AUTH UI
// ============================================================
let authMode = 'login'; // 'login' | 'register' | 'reset'

function switchAuthMode(mode) {
    authMode = mode;
    loginForm.style.display    = mode === 'login'    ? '' : 'none';
    registerForm.style.display = mode === 'register' ? '' : 'none';
    resetForm.style.display    = mode === 'reset'    ? '' : 'none';
    forgotLink.style.display   = mode === 'login'    ? '' : 'none';

    if (mode === 'login') {
        authSwitchTx.textContent = 'Nie masz konta?';
        authSwitch.textContent   = 'Zarejestruj się';
    } else if (mode === 'register') {
        authSwitchTx.textContent = 'Masz już konto?';
        authSwitch.textContent   = 'Zaloguj się';
    } else {
        authSwitchTx.textContent = '';
        authSwitch.textContent   = '← Powrót do logowania';
    }
}

authSwitch.addEventListener('click', () => {
    if (authMode === 'login') switchAuthMode('register');
    else switchAuthMode('login');
});

forgotLink.addEventListener('click', () => switchAuthMode('reset'));

// Password visibility toggles
document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
});

// ── Login Form Submit ───────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    btn.classList.add('loading');
    try {
        await loginUser(email, password);
        showToast('Zalogowano pomyślnie!', 'success');
    } catch (err) {
        console.error('[Auth] Login error:', err);
        const msg = getAuthErrorMessage(err.code);
        showToast(msg, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

// ── Google Login Click ──────────────────────────────────
const googleBtn = document.getElementById('google-login-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
        googleBtn.classList.add('loading');
        try {
            await loginWithGoogle();
            showToast('Zalogowano przez Google!', 'success');
        } catch (err) {
            console.error('[Auth] Google Login error:', err);
            const msg = getAuthErrorMessage(err.code);
            showToast(msg, 'error');
        } finally {
            googleBtn.classList.remove('loading');
        }
    });
}

// ── Register Form Submit ────────────────────────────────
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const name     = document.getElementById('register-name').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const password2= document.getElementById('register-password2').value;

    if (password !== password2) {
        showToast('Hasła nie są identyczne.', 'error');
        return;
    }

    btn.classList.add('loading');
    try {
        await registerUser(email, password, name);
        showToast('Konto utworzone! Witamy w TaskAlert.', 'success');
    } catch (err) {
        console.error('[Auth] Register error:', err);
        const msg = getAuthErrorMessage(err.code);
        showToast(msg, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

// ── Reset Form Submit ───────────────────────────────────
resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('reset-btn');
    const email = document.getElementById('reset-email').value.trim();

    btn.classList.add('loading');
    try {
        await resetPassword(email);
        showToast('Link do resetowania hasła został wysłany na podany e-mail.', 'success');
        switchAuthMode('login');
    } catch (err) {
        console.error('[Auth] Reset error:', err);
        const msg = getAuthErrorMessage(err.code);
        showToast(msg, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

// ── Auth error messages (PL) ────────────────────────────
function getAuthErrorMessage(code) {
    const messages = {
        'auth/email-already-in-use':  'Ten adres e-mail jest już zarejestrowany.',
        'auth/invalid-email':         'Nieprawidłowy format adresu e-mail.',
        'auth/user-not-found':        'Nie znaleziono konta z tym adresem e-mail.',
        'auth/wrong-password':        'Nieprawidłowe hasło. Spróbuj ponownie.',
        'auth/invalid-credential':    'Nieprawidłowe dane logowania. Sprawdź e-mail i hasło.',
        'auth/weak-password':         'Hasło jest za słabe. Użyj minimum 6 znaków.',
        'auth/too-many-requests':     'Zbyt wiele prób logowania. Spróbuj za chwilę.',
        'auth/network-request-failed':'Błąd sieci. Sprawdź połączenie z internetem.'
    };
    return messages[code] || `Wystąpił błąd autoryzacji: ${code}`;
}

// ── Logout ──────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
    const confirmed = await showConfirm('Czy na pewno chcesz się wylogować?', 'Wylogowanie');
    if (confirmed) {
        await logoutUser();
        showToast('Wylogowano.', 'info');
    }
});

// ============================================================
// AUTH STATE OBSERVER
// ============================================================
onAuthChange(async (user) => {
    if (user) {
        // Zalogowany
        loginScreen.style.display = 'none';
        appWrapper.style.display  = 'flex';

        // Update UI z danymi użytkownika
        const name = user.displayName || user.email.split('@')[0];
        const letter = name.charAt(0).toUpperCase();

        document.getElementById('sidebar-user-name').textContent  = name;
        document.getElementById('sidebar-user-email').textContent  = user.email;
        document.getElementById('sidebar-avatar-letter').textContent = letter;
        document.getElementById('topbar-avatar-letter').textContent  = letter;

        // Inicjalizuj domyślne kategorie (jeśli brak)
        await initDefaultCategories();

        // Subskrybuj kategorie w czasie rzeczywistym
        const { onCategoriesChange } = await import('./db.js');
        onCategoriesChange(() => {
            renderSidebarCategories();
        });

        // Renderuj dynamiczne menu kategorii
        await renderSidebarCategories();

        // Nawiguj do strony z hash lub dashboard
        navigateFromHash();
    } else {
        // Wylogowany
        loginScreen.style.display = '';
        appWrapper.style.display  = 'none';
        switchAuthMode('login');
    }
});

// ============================================================
// DYNAMIC SIDEBAR CATEGORIES
// ============================================================
async function renderSidebarCategories() {
    const container = document.getElementById('sidebar-categories-list');
    if (!container) return;

    try {
        const { getCategories, getUserCategoryVisibility } = await import('./db.js');
        const categories = await getCategories();
        const visibility = await getUserCategoryVisibility();

        const visibleCats = categories.filter(c => visibility[c.id] !== false);

        if (visibleCats.length === 0) {
            container.innerHTML = `<div style="padding:8px 12px;font-size:0.8rem;color:var(--text-muted);">Brak kategorii</div>`;
            return;
        }

        container.innerHTML = visibleCats.map(cat => {
            let pageKey = 'inne';
            if (cat.name === 'Samochody') pageKey = 'samochody';
            else if (cat.name === 'Kadry') pageKey = 'kadry';
            else if (cat.name === 'Inne') pageKey = 'inne';
            else pageKey = `cat-${cat.id}`;

            return `
            <a href="#${pageKey}" class="nav-item" data-page="${pageKey}" data-cat-id="${cat.id}">
                <span class="nav-icon" style="font-size:1.2rem;line-height:1;">${cat.icon || '📋'}</span>
                <span>${escHtml(cat.name)}</span>
            </a>`;
        }).join('');

        if (currentPage) {
            sidebarNav.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.page === currentPage);
            });
        }
    } catch (err) {
        console.error('[Sidebar] Błąd renderowania kategorii:', err);
    }
}

window.addEventListener('taskalert-categories-changed', renderSidebarCategories);

// ============================================================
// SPA ROUTER (Hash-based z lazy-loadingiem)
// ============================================================
const moduleCache = {};
const ROUTES = {
    'dashboard':  { file: './modules/dashboard.js',  title: 'Pulpit' },
    'samochody':  { file: './modules/samochody.js',  title: 'Samochody' },
    'kadry':      { file: './modules/kadry.js',      title: 'Kadry' },
    'inne':       { file: './modules/inne.js',        title: 'Inne' },
    'kategorie':  { file: './modules/kategorie.js',  title: 'Kategorie' },
    'historia':   { file: './modules/historia.js',   title: 'Historia' },
    'ustawienia': { file: './modules/ustawienia.js', title: 'Ustawienia' }
};

let currentPage = null;
let currentModuleCleanup = null;

async function navigateTo(page) {
    if (!currentUser) return;
    if (page === currentPage) return;

    let route = ROUTES[page];
    let isCustomCategory = false;
    let customCatId = null;

    if (!route && page.startsWith('cat-')) {
        customCatId = page.replace('cat-', '');
        isCustomCategory = true;
        route = { file: './modules/inne.js', title: 'Kategoria' };
    }

    if (!route) {
        page = 'dashboard';
        return navigateTo(page);
    }

    // Cleanup poprzedni moduł
    if (currentModuleCleanup && typeof currentModuleCleanup === 'function') {
        currentModuleCleanup();
        currentModuleCleanup = null;
    }

    // Pokaż loader
    appContent.innerHTML = '';
    appContent.appendChild(pageLoader.cloneNode(true));

    // Update sidebar active
    sidebarNav.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    document.title = `${route.title} — TaskAlert`;

    try {
        if (!moduleCache[route.file]) {
            moduleCache[route.file] = await import(route.file);
        }
        const mod = moduleCache[route.file];

        appContent.innerHTML = '';
        if (mod.render) {
            const html = mod.render();
            if (typeof html === 'string') {
                appContent.innerHTML = html;
            }
        }

        if (mod.init) {
            currentModuleCleanup = await mod.init(customCatId) || null;
        }

        currentPage = page;
    } catch (err) {
        console.error(`[Router] Błąd ładowania modułu ${page}:`, err);
        appContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Wystąpił błąd</div>
                <p class="empty-state-text">Nie udało się załadować modułu: ${escHtml(route.title)}</p>
                <button class="btn btn-primary" onclick="location.hash='#dashboard'">Wróć do Pulpitu</button>
            </div>`;
    }

    closeSidebar();
}

function navigateFromHash() {
    const hash = location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
}

window.addEventListener('hashchange', navigateFromHash);

// ── Sidebar navigation clicks ───────────────────────────
sidebarNav.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item) {
        e.preventDefault();
        const page = item.dataset.page;
        location.hash = '#' + page;
    }
});

// ============================================================
// SIDEBAR TOGGLE (mobile)
// ============================================================
function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
}

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener('click', closeSidebar);

// ============================================================
// FAB — Szybkie dodawanie przypomnienia
// ============================================================
fabAdd.addEventListener('click', () => {
    showAddReminderModal();
});

// ============================================================
// TOAST SYSTEM
// ============================================================
const toastContainer = document.getElementById('toast-container');
const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

export function showToast(message, type = 'info', options = {}) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let html = `<div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>`;
    html += `<span class="toast-message">${escHtml(message)}</span>`;

    if (options.undoCallback) {
        html += `<button class="toast-undo">Cofnij</button>`;
    }

    html += `<button class="toast-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;

    toast.innerHTML = html;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', dismiss);

    if (options.undoCallback) {
        toast.querySelector('.toast-undo').addEventListener('click', () => {
            options.undoCallback();
            dismiss();
        });
    }

    toastContainer.appendChild(toast);

    const duration = options.duration || 5000;
    if (duration > 0) {
        setTimeout(dismiss, duration);
    }

    return toast;
}

// ============================================================
// MODAL SYSTEM
// ============================================================
const modalOverlay = document.getElementById('modal-overlay');
const modalEl      = document.getElementById('modal');
const modalTitle   = document.getElementById('modal-title');
const modalBody    = document.getElementById('modal-body');
const modalFooter  = document.getElementById('modal-footer');
const modalClose   = document.getElementById('modal-close');

let modalResolve = null;

export function showModal({ title, body, footer, onOpen, wide }) {
    modalTitle.textContent = title || '';
    modalBody.innerHTML    = body || '';
    modalFooter.innerHTML  = footer || '';

    if (wide) {
        modalEl.style.maxWidth = '720px';
    } else {
        modalEl.style.maxWidth = '560px';
    }

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (onOpen) {
        requestAnimationFrame(() => onOpen(modalBody, modalFooter));
    }
}

export function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    if (modalResolve) {
        modalResolve(null);
        modalResolve = null;
    }
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        const confirm = document.querySelector('.confirm-overlay');
        if (confirm) confirm.remove();
    }
});

// ============================================================
// CONFIRM DIALOG
// ============================================================
export function showConfirm(message, title = 'Potwierdzenie', { type = 'warning', confirmText = 'Tak', cancelText = 'Anuluj' } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const icons = { warning: '⚠️', danger: '🗑️', info: 'ℹ️' };

        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-icon confirm-${type}">${icons[type] || icons.warning}</div>
                <div class="confirm-title">${escHtml(title)}</div>
                <p class="confirm-text">${escHtml(message)}</p>
                <div class="confirm-actions">
                    <button class="btn btn-secondary confirm-cancel">${escHtml(cancelText)}</button>
                    <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'} confirm-ok">${escHtml(confirmText)}</button>
                </div>
            </div>`;

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        overlay.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(false));
        overlay.querySelector('.confirm-ok').addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });

        document.body.appendChild(overlay);
        overlay.querySelector('.confirm-ok').focus();
    });
}

// ============================================================
// REMINDER DETAILS & EDIT MODAL (Central Dialog)
// ============================================================
export async function showReminderDetailsModal(reminderId, reminderData) {
    const { getReminder, getCategories, updateReminder, deleteReminder, sendManualNotification } = await import('./db.js');

    let reminder = reminderData || await getReminder(reminderId);
    if (!reminder) {
        showToast('Nie znaleziono przypomnienia.', 'error');
        return;
    }

    const categories = await getCategories();
    const days = daysUntil(reminder.expiryDate);
    const statusCls = getAlertStatus(days);
    const countdownText = getCountdownText(days);

    const historyHtml = (reminder.history || []).slice(-5).reverse().map(h => `
        <div style="font-size:0.8rem;color:var(--text-secondary);padding:6px 0;border-top:1px solid var(--border-light);">
            ✅ Wykonano: <strong>${formatDate(h.executedAt)}</strong>
            ${h.newExpiry ? ` → Następny termin: <strong>${formatDate(h.newExpiry)}</strong>` : ' (zamknięte)'}
            ${h.note ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">📝 ${escHtml(h.note)}</div>` : ''}
        </div>
    `).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 0;">Brak historii wykonania</div>';

    const defaultAlertDays = reminder.alertDays || [30, 14];
    const alertChipsHtml = defaultAlertDays.map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button">×</button></span>`
    ).join('');

    const expiryDateIso = reminder.expiryDate?.toDate
        ? reminder.expiryDate.toDate().toISOString().split('T')[0]
        : (typeof reminder.expiryDate === 'string' ? reminder.expiryDate.split('T')[0] : '');

    showModal({
        title: `📌 Szczegóły: ${reminder.title}`,
        wide: true,
        body: `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding:12px 16px;border-radius:10px;background:var(--bg-card-hover);">
                <div>
                    <span class="category-badge" style="font-size:0.85rem;">${escHtml(reminder.categoryName || 'Inne')}</span>
                    <span style="font-size:0.85rem;color:var(--text-muted);margin-left:8px;">${escHtml(reminder.subTypeLabel || reminder.subType || '')}</span>
                </div>
                <div class="reminder-countdown countdown-${statusCls}">${countdownText}</div>
            </div>

            <div class="form-group">
                <label for="edit-title">Tytuł *</label>
                <input type="text" id="edit-title" value="${escHtml(reminder.title)}" required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="edit-category">Kategoria *</label>
                    <select id="edit-category" class="filter-select w-full">
                        ${categories.map(c => `<option value="${c.id}" ${c.id === reminder.categoryId || c.name === reminder.categoryName ? 'selected' : ''}>${escHtml(c.icon || '📋')} ${escHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="edit-subtype">Tag / Podtyp</label>
                    <select id="edit-subtype" class="filter-select w-full"></select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="edit-expiry">Data wygaśnięcia *</label>
                    <input type="date" id="edit-expiry" value="${expiryDateIso}" required>
                </div>
                <div class="form-group">
                    <label for="edit-recurrence">Interwał powtarzania (mies.)</label>
                    <input type="number" id="edit-recurrence" value="${reminder.recurrenceMonths || 0}" min="0" max="120">
                </div>
            </div>

            <div class="form-group">
                <label>Alerty (dni przed terminem)</label>
                <div class="alert-chips" id="edit-alert-chips">
                    ${alertChipsHtml}
                    <button class="alert-chip-add" type="button" id="edit-alert-chip-btn">+ Dodaj alert</button>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="edit-email1">E-mail główny</label>
                    <input type="email" id="edit-email1" value="${escHtml(reminder.primaryEmail || '')}">
                </div>
                <div class="form-group">
                    <label for="edit-email2">E-mail dodatkowy</label>
                    <input type="email" id="edit-email2" value="${escHtml(reminder.secondaryEmail || '')}">
                </div>
            </div>

            <div class="form-group">
                <label for="edit-notes">Notatki / Opis</label>
                <textarea id="edit-notes" placeholder="Dodatkowe informacje...">${escHtml(reminder.notes || reminder.description || '')}</textarea>
            </div>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color);">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">📜 Historia wykonania</h4>
                <div>${historyHtml}</div>
            </div>`,
        footer: `
            <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;justify-content:space-between;">
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost text-danger" id="modal-delete-btn" type="button">🗑️ Usuń</button>
                    <button class="btn btn-secondary" id="modal-mail-btn" type="button">✉️ Wyślij e-mail</button>
                    <button class="btn btn-secondary" id="modal-execute-btn" type="button">✅ Wykonaj</button>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" id="modal-close-btn" type="button">Anuluj</button>
                    <button class="btn btn-primary" id="modal-save-btn" type="button">💾 Zapisz</button>
                </div>
            </div>`,
        onOpen: (body, footer) => {
            const catSelect = body.querySelector('#edit-category');
            const subSelect = body.querySelector('#edit-subtype');

            const populateSubtypes = () => {
                const selectedCat = categories.find(c => c.id === catSelect.value || c.name === catSelect.value);
                updateSubtypeOptions(subSelect, selectedCat);
                if (reminder.subType) subSelect.value = reminder.subType;
            };
            catSelect.addEventListener('change', populateSubtypes);
            populateSubtypes();

            const chipsContainer = body.querySelector('#edit-alert-chips');
            body.querySelector('#edit-alert-chip-btn').addEventListener('click', () => {
                const val = prompt('Ile dni przed terminem wysłać alert?');
                if (val && !isNaN(val) && parseInt(val) > 0) {
                    const chip = document.createElement('span');
                    chip.className = 'alert-chip';
                    chip.dataset.days = parseInt(val);
                    chip.innerHTML = `${parseInt(val)} dni <button class="chip-remove" type="button">×</button>`;
                    chipsContainer.insertBefore(chip, body.querySelector('#edit-alert-chip-btn'));
                }
            });
            chipsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-remove')) {
                    e.target.closest('.alert-chip').remove();
                }
            });

            footer.querySelector('#modal-close-btn').addEventListener('click', closeModal);

            footer.querySelector('#modal-mail-btn').addEventListener('click', async () => {
                try {
                    await sendManualNotification(reminder);
                    showToast(`Powiadomienie e-mail zostało wysłane do: ${reminder.primaryEmail}${reminder.secondaryEmail ? ', ' + reminder.secondaryEmail : ''}`, 'success');
                } catch (err) {
                    showToast('Błąd wysyłania e-maila: ' + err.message, 'error');
                }
            });

            footer.querySelector('#modal-execute-btn').addEventListener('click', () => {
                closeModal();
                showExecuteModal(reminder);
            });

            footer.querySelector('#modal-delete-btn').addEventListener('click', async () => {
                const confirmed = await showConfirm(`Czy na pewno chcesz usunąć przypomnienie "${reminder.title}"?`, 'Usuń przypomnienie', { type: 'danger', confirmText: 'Usuń' });
                if (confirmed) {
                    try {
                        await deleteReminder(reminder.id);
                        showToast('Przypomnienie usunięte.', 'success');
                        closeModal();
                        refreshCurrentPage();
                    } catch (err) {
                        showToast('Błąd: ' + err.message, 'error');
                    }
                }
            });

            footer.querySelector('#modal-save-btn').addEventListener('click', async () => {
                const title = body.querySelector('#edit-title').value.trim();
                const categoryId = catSelect.value;
                const subType = subSelect.value;
                const expiryStr = body.querySelector('#edit-expiry').value;
                const recurrence = parseInt(body.querySelector('#edit-recurrence').value) || 0;
                const email1 = body.querySelector('#edit-email1').value.trim();
                const email2 = body.querySelector('#edit-email2').value.trim();
                const notes = body.querySelector('#edit-notes').value.trim();

                if (!title) { showToast('Podaj tytuł.', 'warning'); return; }
                if (!expiryStr) { showToast('Podaj datę wygaśnięcia.', 'warning'); return; }

                const chips = chipsContainer.querySelectorAll('.alert-chip');
                const alertDays = Array.from(chips).map(c => parseInt(c.dataset.days)).filter(d => d > 0);
                alertDays.sort((a, b) => b - a);

                const catObj = categories.find(c => c.id === categoryId);
                const subTypeLabel = subSelect.options[subSelect.selectedIndex]?.text || subType;

                const saveBtn = footer.querySelector('#modal-save-btn');
                saveBtn.classList.add('loading');

                try {
                    await updateReminder(reminder.id, {
                        title,
                        categoryId,
                        categoryName: catObj?.name || reminder.categoryName || '',
                        subType,
                        subTypeLabel,
                        expiryDate: new Date(expiryStr),
                        recurrenceMonths: recurrence,
                        alertDays,
                        primaryEmail: email1,
                        secondaryEmail: email2,
                        notes,
                        description: notes
                    });

                    showToast('Przypomnienie zaktualizowane!', 'success');
                    closeModal();
                    refreshCurrentPage();
                } catch (err) {
                    showToast('Błąd zapisu: ' + err.message, 'error');
                } finally {
                    saveBtn.classList.remove('loading');
                }
            });
        }
    });
}

function showExecuteModal(reminder) {
    const today = new Date().toISOString().split('T')[0];
    let nextDateDefault = '';
    if (reminder.recurrenceMonths > 0) {
        const exp = reminder.expiryDate?.toDate ? reminder.expiryDate.toDate() : new Date(reminder.expiryDate);
        const next = new Date(exp);
        next.setMonth(next.getMonth() + reminder.recurrenceMonths);
        nextDateDefault = next.toISOString().split('T')[0];
    }

    showModal({
        title: `✅ Oznacz jako wykonane: ${reminder.title}`,
        body: `
            <p style="color:var(--text-secondary);margin-bottom:16px;">Zapisz datę wykonania i opcjonalnie notatkę oraz nowy termin.</p>
            <div class="form-group">
                <label for="exec-date">Data wykonania *</label>
                <input type="date" id="exec-date" value="${today}" required>
            </div>
            ${reminder.recurrenceMonths > 0 ? `
            <div class="form-group">
                <label for="exec-next">Następna data wygaśnięcia</label>
                <input type="date" id="exec-next" value="${nextDateDefault}">
                <small style="color:var(--text-muted);font-size:0.78rem;">Auto-kalkulacja: +${reminder.recurrenceMonths} mies.</small>
            </div>` : `
            <div class="form-group">
                <label for="exec-next">Następna data (opcj. — puste = zamknij)</label>
                <input type="date" id="exec-next" value="">
            </div>`}
            <div class="form-group">
                <label for="exec-note">Komentarz / Notatka (opcjonalnie)</label>
                <textarea id="exec-note" placeholder="np. Polisa odnowiona w PZU..."></textarea>
            </div>`,
        footer: `
            <button class="btn btn-secondary" onclick="window.TaskAlert.closeModal()">Anuluj</button>
            <button class="btn btn-primary" id="exec-save-btn">Zapisz wykonanie</button>`,
        onOpen: (body, footer) => {
            footer.querySelector('#exec-save-btn').addEventListener('click', async () => {
                const execDateStr = body.querySelector('#exec-date').value;
                const nextDateStr = body.querySelector('#exec-next').value;
                const note = body.querySelector('#exec-note').value.trim();

                if (!execDateStr) { showToast('Podaj datę wykonania.', 'warning'); return; }

                const execDate = new Date(execDateStr);
                const nextDate = nextDateStr ? new Date(nextDateStr) : null;

                const saveBtn = footer.querySelector('#exec-save-btn');
                saveBtn.classList.add('loading');

                try {
                    const { markAsExecuted } = await import('./db.js');
                    await markAsExecuted(reminder.id, execDate, nextDate, note);
                    showToast('Przypomnienie oznaczone jako wykonane!', 'success');
                    closeModal();
                    refreshCurrentPage();
                } catch (err) {
                    showToast('Błąd: ' + err.message, 'error');
                } finally {
                    saveBtn.classList.remove('loading');
                }
            });
        }
    });
}

function refreshCurrentPage() {
    if (currentPage && moduleCache[currentPage]?.refresh) {
        moduleCache[currentPage].refresh();
    }
}

// Global action handlers attached to window
window.handleEdit = (id) => showReminderDetailsModal(id);
window.handleDelete = async (id, title) => {
    const { deleteReminder } = await import('./db.js');
    const confirmed = await showConfirm(`Czy na pewno chcesz usunąć "${title || 'przypomnienie'}"?`, 'Usuń', { type: 'danger', confirmText: 'Usuń' });
    if (confirmed) {
        await deleteReminder(id);
        showToast('Przypomnienie usunięte.', 'success');
        refreshCurrentPage();
    }
};
window.handleExecute = async (id) => {
    const { getReminder } = await import('./db.js');
    const r = await getReminder(id);
    if (r) showExecuteModal(r);
};
window.handleSendNotification = async (id) => {
    const { getReminder, sendManualNotification } = await import('./db.js');
    const r = await getReminder(id);
    if (r) {
        await sendManualNotification(r);
        showToast(`Powiadomienie e-mail zostało wysłane do: ${r.primaryEmail}${r.secondaryEmail ? ', ' + r.secondaryEmail : ''}`, 'success');
    }
};

// ============================================================
// ADD REMINDER MODAL (Quick Add from FAB)
// ============================================================
async function showAddReminderModal(prefillCategory) {
    // Dynamicznie importuj db do pobrania kategorii
    const { getCategories, addReminder } = await import('./db.js');
    const { getUserProfile } = await import('./auth.js');

    const categories = await getCategories();
    const profile = await getUserProfile();

    const defaultEmail = profile?.defaultPrimaryEmail || currentUser?.email || '';
    const defaultAlertDays = profile?.defaultAlertDays || [30, 14];

    let categoryOptions = categories.map(c =>
        `<option value="${c.id}" ${prefillCategory === c.id ? 'selected' : ''}>${escHtml(c.icon || '📋')} ${escHtml(c.name)}</option>`
    ).join('');

    const alertChipsHtml = defaultAlertDays.map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button" title="Usuń">×</button></span>`
    ).join('');

    showModal({
        title: 'Nowe przypomnienie',
        body: `
            <div class="form-group">
                <label for="add-title">Tytuł *</label>
                <input type="text" id="add-title" placeholder="np. OC - Opel Astra GJ 12345" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="add-category">Kategoria *</label>
                    <select id="add-category" class="filter-select w-full">${categoryOptions}</select>
                </div>
                <div class="form-group">
                    <label for="add-subtype">Podtyp</label>
                    <select id="add-subtype" class="filter-select w-full">
                        <option value="custom">Niestandardowy</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="add-expiry">Data wygaśnięcia *</label>
                    <input type="date" id="add-expiry" required>
                </div>
                <div class="form-group">
                    <label for="add-recurrence">Interwał powtarzania (mies.)</label>
                    <input type="number" id="add-recurrence" value="12" min="0" max="120" placeholder="0 = jednorazowe">
                </div>
            </div>
            <div class="form-group">
                <label>Alerty (dni przed terminem)</label>
                <div class="alert-chips" id="add-alert-chips">
                    ${alertChipsHtml}
                    <button class="alert-chip-add" type="button" id="add-alert-chip-btn">+ Dodaj alert</button>
                </div>
            </div>
            <button class="collapsible-header" type="button" id="add-advanced-toggle">
                Ustawienia zaawansowane
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="collapsible-content" id="add-advanced-content">
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label for="add-email1">E-mail główny</label>
                        <input type="email" id="add-email1" value="${escHtml(defaultEmail)}" placeholder="email@example.com">
                    </div>
                    <div class="form-group">
                        <label for="add-email2">E-mail dodatkowy</label>
                        <input type="email" id="add-email2" placeholder="kopia@example.com">
                    </div>
                </div>
                <div class="form-group">
                    <label for="add-description">Opis / notatki</label>
                    <textarea id="add-description" placeholder="Dodatkowe informacje..."></textarea>
                </div>
            </div>`,
        footer: `
            <button class="btn btn-secondary" id="modal-cancel-btn">Anuluj</button>
            <button class="btn btn-primary" id="modal-save-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Zapisz</span>
            </button>`,
        onOpen: (body, footer) => {
            // Collapsible toggle
            const toggleBtn = body.querySelector('#add-advanced-toggle');
            const content = body.querySelector('#add-advanced-content');
            toggleBtn.addEventListener('click', () => {
                toggleBtn.classList.toggle('open');
                content.classList.toggle('open');
            });

            // Alert chip add
            const chipsContainer = body.querySelector('#add-alert-chips');
            body.querySelector('#add-alert-chip-btn').addEventListener('click', () => {
                const days = prompt('Ile dni przed terminem wysłać alert?');
                if (days && !isNaN(days) && parseInt(days) > 0) {
                    const chip = document.createElement('span');
                    chip.className = 'alert-chip';
                    chip.dataset.days = parseInt(days);
                    chip.innerHTML = `${parseInt(days)} dni <button class="chip-remove" type="button" title="Usuń">×</button>`;
                    chipsContainer.insertBefore(chip, body.querySelector('#add-alert-chip-btn'));
                }
            });

            // Chip remove (delegated)
            chipsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-remove')) {
                    e.target.closest('.alert-chip').remove();
                }
            });

            // Update subtypes based on category selection
            const catSelect = body.querySelector('#add-category');
            const subSelect = body.querySelector('#add-subtype');
            catSelect.addEventListener('change', () => {
                const cat = categories.find(c => c.id === catSelect.value);
                updateSubtypeOptions(subSelect, cat);
            });
            // Initial subtype fill
            const initialCat = categories.find(c => c.id === catSelect.value);
            if (initialCat) updateSubtypeOptions(subSelect, initialCat);

            // Cancel
            footer.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);

            // Save
            footer.querySelector('#modal-save-btn').addEventListener('click', async () => {
                const title = body.querySelector('#add-title').value.trim();
                const categoryId = body.querySelector('#add-category').value;
                const subType = body.querySelector('#add-subtype').value;
                const expiryStr = body.querySelector('#add-expiry').value;
                const recurrence = parseInt(body.querySelector('#add-recurrence').value) || 0;
                const email1 = body.querySelector('#add-email1').value.trim();
                const email2 = body.querySelector('#add-email2').value.trim();
                const description = body.querySelector('#add-description').value.trim();

                if (!title) { showToast('Podaj tytuł przypomnienia.', 'warning'); return; }
                if (!expiryStr) { showToast('Podaj datę wygaśnięcia.', 'warning'); return; }

                // Zbierz alert days z chipów
                const chips = chipsContainer.querySelectorAll('.alert-chip');
                const alertDays = Array.from(chips).map(c => parseInt(c.dataset.days)).filter(d => d > 0);
                alertDays.sort((a, b) => b - a); // malejąco

                const cat = categories.find(c => c.id === categoryId);
                const subTypeLabel = subSelect.options[subSelect.selectedIndex]?.text || subType;

                const saveBtn = footer.querySelector('#modal-save-btn');
                saveBtn.classList.add('loading');

                try {
                    await addReminder({
                        title,
                        description,
                        categoryId,
                        categoryName: cat?.name || '',
                        subType,
                        subTypeLabel,
                        primaryEmail: email1,
                        secondaryEmail: email2,
                        expiryDate: new Date(expiryStr),
                        alertDays,
                        recurrenceMonths: recurrence,
                        notes: description
                    });

                    showToast('Przypomnienie dodane!', 'success');
                    closeModal();

                    // Odśwież aktualny widok
                    if (currentPage) {
                        const mod = moduleCache[currentPage];
                        if (mod && mod.refresh) mod.refresh();
                    }
                } catch (err) {
                    console.error('[Add Reminder] Error:', err);
                    showToast('Błąd zapisu: ' + err.message, 'error');
                } finally {
                    saveBtn.classList.remove('loading');
                }
            });
        }
    });
}

function updateSubtypeOptions(selectEl, category) {
    if (!category || !category.subTypes || category.subTypes.length === 0) {
        selectEl.innerHTML = '<option value="custom">Niestandardowy</option>';
        return;
    }
    selectEl.innerHTML = category.subTypes.map(st =>
        `<option value="${escHtml(st.key)}">${escHtml(st.label)}</option>`
    ).join('');
}

// Eksportuj do użycia z modułów
window.TaskAlert = {
    showToast,
    showModal,
    closeModal,
    showConfirm,
    showAddReminderModal,
    showReminderDetailsModal,
    showExecuteModal,
    escHtml,
    navigateTo
};

// ============================================================
// HELPERS
// ============================================================
export function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

export function formatDate(date) {
    if (!date) return '—';
    if (date.toDate) date = date.toDate(); // Firestore Timestamp
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function daysUntil(date) {
    if (!date) return Infinity;
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function getAlertStatus(daysLeft) {
    if (daysLeft < 0)  return 'overdue';
    if (daysLeft <= 7) return 'danger';
    if (daysLeft <= 14) return 'danger';
    if (daysLeft <= 30) return 'warning';
    return 'ok';
}

export function getCountdownText(daysLeft) {
    if (daysLeft < 0) return `Przeterminowane (${Math.abs(daysLeft)} dni temu)`;
    if (daysLeft === 0) return 'Termin dzisiaj!';
    if (daysLeft === 1) return 'Jutro!';
    return `za ${daysLeft} dni`;
}

export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[SW] Registered:', reg.scope))
            .catch(err => console.warn('[SW] Registration failed:', err));
    });
}
