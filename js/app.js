// ============================================================
// APP.JS — SPA Router, Toasty, Modale, Helpery
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onAuthChange, loginUser, registerUser, resetPassword, logoutUser, currentUser, loginWithGoogle, initAllowedUsers, getUserRole, ensureUserProfile, isUserAllowed, SUPER_ADMIN_EMAIL } from './auth.js';
import { initDefaultCategories, getCategories, getAllowedUsers } from './db.js';

// ── Global PWA Install Prompt Capture ───────────────────
// Przechwytujemy beforeinstallprompt natychmiast na starcie,
// zanim lazy-loaded moduł pwa-install-banner.js zostanie zaimportowany.
// Bez tego event przepada, bo odpala się przed zalogowaniem użytkownika.
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwa_deferred_prompt = e;
    console.log('[PWA] beforeinstallprompt przechwycony globalnie');
});

window.addEventListener('appinstalled', () => {
    window.__pwa_deferred_prompt = null;
    localStorage.setItem('taskalert-pwa-installed', 'true');
    console.log('[PWA] Aplikacja zainstalowana');
});

// ── Global Push Notification Deep Link Capture ──────────
let pendingAlertId = null;
let isUserAuthenticated = false;

function getAlertIdFromUrl() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const qAlertId = urlParams.get('alertId');
        if (qAlertId) return qAlertId;

        if (window.location.hash.startsWith('#alert-')) {
            return window.location.hash.replace('#alert-', '');
        }
    } catch (e) {}
    return null;
}

const initialAlertId = getAlertIdFromUrl();
if (initialAlertId) {
    pendingAlertId = initialAlertId;
    console.log('[Push DeepLink] Wykryto parametr alertId w URL:', pendingAlertId);
}

// Globalny handler otwierania szczegółów alertu z powiadomienia
async function openAlertFromNotification(alertId) {
    if (!alertId) return;

    if (!isUserAuthenticated) {
        pendingAlertId = alertId;
        return;
    }

    try {
        // Wyczyść parametr alertId z URL (bez przeładowywania strony), aby nie otwierać ponownie przy F5
        const url = new URL(window.location.href);
        if (url.searchParams.has('alertId')) {
            url.searchParams.delete('alertId');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + (url.hash || ''));
        }
        if (window.location.hash.startsWith('#alert-')) {
            window.location.hash = '#dashboard';
        }

        await showReminderDetailsModal(alertId);
    } catch (err) {
        console.error('[App] Błąd otwierania szczegółów alertu z powiadomienia:', err);
    }
}

// Globalny nasłuch wiadomości z Service Workera
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PUSH_NOTIFICATION_CLICK' && event.data?.alertId) {
            console.log('[App] Otrzymano zdarzenie PUSH_NOTIFICATION_CLICK dla alertId:', event.data.alertId);
            openAlertFromNotification(event.data.alertId);
        }
    });
}

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
        const msg = getAuthErrorMessage(err);
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
            const msg = getAuthErrorMessage(err);
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
        const msg = getAuthErrorMessage(err);
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
        const msg = getAuthErrorMessage(err);
        showToast(msg, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

// ── Auth error messages (PL) ────────────────────────────
function getAuthErrorMessage(err) {
    const code = (typeof err === 'string') ? err : (err?.code || '');
    if (typeof err === 'object' && err?.message && code === 'auth/user-not-allowed') {
        return err.message;
    }
    const messages = {
        'auth/email-already-in-use':  'Ten adres e-mail jest już zarejestrowany.',
        'auth/invalid-email':         'Nieprawidłowy format adresu e-mail.',
        'auth/user-not-found':        'Nie znaleziono konta z tym adresem e-mail.',
        'auth/wrong-password':        'Nieprawidłowe hasło. Spróbuj ponownie.',
        'auth/invalid-credential':    'Nieprawidłowe dane logowania. Sprawdź e-mail i hasło.',
        'auth/weak-password':         'Hasło jest za słabe. Użyj minimum 6 znaków.',
        'auth/too-many-requests':     'Zbyt wiele prób logowania. Spróbuj za chwilę.',
        'auth/network-request-failed':'Błąd sieci. Sprawdź połączenie z internetem.',
        'auth/user-not-allowed':      'Twoje konto nie jest autoryzowane. Skontaktuj się z administratorem systemu.',
        'auth/unauthorized-domain':   'Adres/domena nie jest autoryzowana w Firebase Auth. Użyj adresu http://localhost:3001',
        'auth/popup-blocked':         'Okno logowania Google zostało zablokowane przez przeglądarkę. Zezwól na wyskakujące okienka (popup).'
    };
    return messages[code] || (typeof err === 'object' && err?.message) || `Wystąpił błąd autoryzacji: ${code}`;
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
        // Weryfikacja czy użytkownik znajduje się na liście dozwolonych (Strict Whitelist)
        const allowed = await isUserAllowed(user.email);
        if (!allowed) {
            console.warn('[App] Zalogowany użytkownik nie znajduje się na liście dozwolonych:', user.email);
            await logoutUser();
            loginScreen.style.display = 'flex';
            appWrapper.style.display  = 'none';
            showToast(`Odmowa dostępu: Twój adres e-mail (${user.email}) nie znajduje się na liście uprawnionych użytkowników.`, 'error', { duration: 8000 });
            return;
        }

        // Zalogowany i uprawniony
        isUserAuthenticated = true;
        loginScreen.style.display = 'none';
        appWrapper.style.display  = 'flex';

        // Update UI z danymi użytkownika
        const name = user.displayName || user.email.split('@')[0];
        const letter = name.charAt(0).toUpperCase();

        document.getElementById('sidebar-user-name').textContent  = name;
        document.getElementById('sidebar-user-email').textContent  = user.email;
        document.getElementById('sidebar-avatar-letter').textContent = letter;
        document.getElementById('topbar-avatar-letter').textContent  = letter;

        // Inicjalizacje wstępne (bezpieczne)
        try { await ensureUserProfile(user); } catch (e) { console.warn('[App] ensureUserProfile error:', e); }
        try { await initDefaultCategories(); } catch (e) { console.warn('[App] initCategories error:', e); }
        try { await initAllowedUsers(); } catch (e) { console.warn('[App] initAllowedUsers error:', e); }

        let userRole = 'user';
        const userEmailNorm = (user.email || '').trim().toLowerCase();
        if (userEmailNorm === SUPER_ADMIN_EMAIL.toLowerCase()) {
            userRole = 'super-admin';
        } else {
            try {
                userRole = await getUserRole(user.email);
            } catch (e) {
                console.warn('[App] getUserRole error:', e);
            }
        }
        window._taskAlertUserRole = userRole;

        // Subskrybuj kategorie w czasie rzeczywistym
        try {
            const { onCategoriesChange } = await import('./db.js');
            onCategoriesChange(() => {
                renderSidebarCategories();
            });
            await renderSidebarCategories();
        } catch (e) {
            console.warn('[App] renderSidebarCategories error:', e);
        }

        // Pokaż/ukryj link do panelu admin
        const adminNav = document.getElementById('nav-admin-users');
        if (adminNav) {
            adminNav.style.display = (userRole === 'admin' || userRole === 'super-admin') ? '' : 'none';
        }

        // Nawiguj do strony z hash lub dashboard (ZAWSZE EXECUTE)
        navigateFromHash();

        // Jeśli był oczekujący alert do otwarcia (np. z kliknięcia powiadomienia PUSH)
        if (pendingAlertId) {
            const alertToOpen = pendingAlertId;
            pendingAlertId = null;
            setTimeout(() => {
                openAlertFromNotification(alertToOpen);
            }, 450);
        }

        // Pokaż baner instalacji PWA (jeśli na mobile)
        try {
            const { showInstallBanner } = await import('./modules/pwa-install-banner.js');
            showInstallBanner();
        } catch (err) {
            console.warn('[PWA Banner] Błąd:', err);
        }

        // Inicjalizuj push notifications (foreground handler)
        try {
            const { setupForegroundHandler, isPushEnabled } = await import('./modules/push-notifications.js');
            const pushEnabled = await isPushEnabled();
            if (pushEnabled) {
                await setupForegroundHandler();
            }
        } catch (err) {
            console.warn('[Push] Błąd inicjalizacji:', err);
        }
    } else {
        // Wylogowany
        isUserAuthenticated = false;
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
    'dashboard':    { file: './modules/dashboard.js',    title: 'Pulpit' },
    'samochody':    { file: './modules/samochody.js',    title: 'Samochody' },
    'kadry':        { file: './modules/kadry.js',        title: 'Kadry' },
    'inne':         { file: './modules/inne.js',         title: 'Inne' },
    'kategorie':    { file: './modules/kategorie.js',    title: 'Kategorie' },
    'team-alerts':  { file: './modules/team-alerts.js',  title: 'Alerty zespołowe' },
    'historia':     { file: './modules/historia.js',     title: 'Historia' },
    'admin-users':  { file: './modules/admin-users.js',  title: 'Użytkownicy' },
    'ustawienia':   { file: './modules/ustawienia.js',   title: 'Ustawienia' }
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

const CUSTOM_EMAILS_KEY = 'taskalert_custom_emails';

export function getCustomEmails() {
    try {
        const saved = localStorage.getItem(CUSTOM_EMAILS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

export function saveCustomEmail(email) {
    if (!email) return;
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    const list = getCustomEmails();
    if (!list.includes(clean)) {
        list.push(clean);
        localStorage.setItem(CUSTOM_EMAILS_KEY, JSON.stringify(list));
    }
}

// Helper for email dropdown options from allowedUsers + user's cloud customEmails
function buildEmailOptions(allowedUsers = [], currentEmail = '', defaultEmail = '', customEmails = []) {
    const selected = (currentEmail || defaultEmail || '').trim().toLowerCase();
    let options = `<option value="">— Wybierz adres e-mail —</option>`;
    let found = false;

    // 1. Użytkownicy z organizacji / bazy
    (allowedUsers || []).forEach(u => {
        const uEmail = (u.email || '').trim();
        if (!uEmail) return;
        const isSel = (uEmail.toLowerCase() === selected);
        if (isSel) found = true;
        const inactiveSuffix = u.isActive === false ? ' (nieaktywny)' : '';
        const displayName = u.name ? `${u.name} (${uEmail})${inactiveSuffix}` : `${uEmail}${inactiveSuffix}`;
        options += `<option value="${uEmail.replace(/"/g, '&quot;')}" ${isSel ? 'selected' : ''}>${displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`;
    });

    // 2. Prywatne adresy e-mail użytkownika (zsynchronizowane z Firestore w chmurze)
    const customList = Array.isArray(customEmails) && customEmails.length > 0
        ? customEmails
        : getCustomEmails();

    const customOnly = customList.filter(ce => !(allowedUsers || []).some(u => (u.email || '').toLowerCase() === (ce || '').toLowerCase()));
    if (customOnly.length > 0) {
        options += `<optgroup label="📋 Moje prywatne adresy e-mail">`;
        customOnly.forEach(ce => {
            const isSel = (ce.toLowerCase() === selected);
            if (isSel) found = true;
            options += `<option value="${ce.replace(/"/g, '&quot;')}" ${isSel ? 'selected' : ''}>${ce}</option>`;
        });
        options += `</optgroup>`;
    }

    if (selected && !found) {
        const val = (currentEmail || defaultEmail).trim();
        options += `<option value="${val.replace(/"/g, '&quot;')}" selected>${val.replace(/</g, '&lt;').replace(/>/g, '&gt;')} (spoza bazy)</option>`;
    }

    return options;
}

// Helpers for date countdowns & statuses
export function getStatusClass(days) {
    if (days < 0) return 'status-overdue';
    if (days <= 14) return 'status-danger';
    if (days <= 30) return 'status-warning';
    return 'status-ok';
}

export function getCountdownClass(days) {
    if (days < 0) return 'countdown-danger';
    if (days <= 14) return 'countdown-danger';
    if (days <= 30) return 'countdown-warning';
    return 'countdown-ok';
}

// ============================================================
// REMINDER DETAILS & EDIT MODAL (Central Dialog)
// ============================================================
export async function showReminderDetailsModal(reminderId, reminderData) {
    const { getReminder, getCategories, getAllowedUsers, parseDate, updateReminder, deleteReminder, sendManualNotification, convertReminderToTeamAlert, getUserCustomEmails, addUserCustomEmail } = await import('./db.js');

    let reminder = reminderData || await getReminder(reminderId);
    if (!reminder) {
        showToast('Nie znaleziono przypomnienia.', 'error');
        return;
    }

    const categories = await getCategories();
    const allowedUsers = await getAllowedUsers();
    let customEmails = await getUserCustomEmails();
    const days = daysUntil(reminder.expiryDate);
    const statusCls = getAlertStatus(days);
    const countdownText = getCountdownText(days);

    const historyHtml = renderEventHistory(reminder.history || []);

    const defaultAlertDays = reminder.alertDays || [30, 14, 7, 3, 1];
    const alertChipsHtml = defaultAlertDays.map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button">×</button></span>`
    ).join('');

    const parsedExpiryDate = parseDate(reminder.expiryDate);
    const expiryDateIso = (parsedExpiryDate && !isNaN(parsedExpiryDate.getTime()) && parsedExpiryDate.getTime() > 0)
        ? parsedExpiryDate.toISOString().split('T')[0]
        : '';

    const sharedBadge = reminder.isShared ? `<span class="category-badge" style="background:#7c3aed22;color:#7c3aed;font-size:0.85rem;margin-left:8px;">👥 Alert Zespołowy</span>` : '';
    const convertHeaderBtn = !reminder.isShared ? `
        <button class="btn btn-sm btn-secondary" id="convert-to-team-header-btn" type="button" style="border-color:#7c3aed;color:#7c3aed;font-weight:600;display:inline-flex;align-items:center;gap:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span>Zamień na zespołowy</span>
        </button>` : '';

    const participantsHtml = reminder.isShared && reminder.participants ? `
        <div style="margin-top:12px;padding:10px 12px;background:var(--bg-card-hover);border-radius:8px;">
            <div style="font-size:0.82rem;font-weight:700;margin-bottom:6px;">👥 Uczestnicy alertu zespołowego (${reminder.participants.length}):</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${reminder.participants.map(p => `<span class="participant-chip">${escHtml(p.name || p.email)} (${escHtml(p.role || 'executor')})</span>`).join('')}
            </div>
        </div>` : '';

    const participantPrimary = (reminder.participants && reminder.participants.length > 0) ? reminder.participants[0].email : '';
    const participantSecondary = (reminder.participants && reminder.participants.length > 1) ? reminder.participants[1].email : '';
    const initialPrimary = reminder.primaryEmail || participantPrimary;
    const initialSecondary = reminder.secondaryEmail || participantSecondary;

    const isCompleted = reminder.status === 'completed';
    const countdownHtml = isCompleted
        ? `<div class="reminder-countdown countdown-ok" style="background:rgba(16,185,129,0.15);color:#10b981;">✅ Zakończone</div>`
        : `<div class="reminder-countdown countdown-${statusCls}">${countdownText}</div>`;

    showModal({
        title: `📌 Szczegóły: ${reminder.title}`,
        wide: true,
        body: `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding:12px 16px;border-radius:10px;background:var(--bg-card-hover);flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="category-badge" style="font-size:0.85rem;">${escHtml(reminder.categoryName || 'Inne')}</span>
                    <span style="font-size:0.85rem;color:var(--text-muted);margin-left:4px;">${escHtml(reminder.subTypeLabel || reminder.subType || '')}</span>
                    ${sharedBadge}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${convertHeaderBtn}
                    ${countdownHtml}
                </div>
            </div>
            ${participantsHtml}

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
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <label for="edit-email1">E-mail główny</label>
                        <button type="button" id="edit-custom-email1-btn" style="font-size:0.75rem;color:var(--accent-primary);cursor:pointer;background:none;border:none;padding:0;font-weight:600;">+ Wpisz inny</button>
                    </div>
                    <select id="edit-email1" class="filter-select w-full">
                        ${buildEmailOptions(allowedUsers, initialPrimary, '', customEmails)}
                    </select>
                </div>
                <div class="form-group">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <label for="edit-email2">E-mail dodatkowy</label>
                        <button type="button" id="edit-custom-email2-btn" style="font-size:0.75rem;color:var(--accent-primary);cursor:pointer;background:none;border:none;padding:0;font-weight:600;">+ Wpisz inny</button>
                    </div>
                    <select id="edit-email2" class="filter-select w-full">
                        ${buildEmailOptions(allowedUsers, initialSecondary, '', customEmails)}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="edit-notes">Notatki / Opis</label>
                <textarea id="edit-notes" placeholder="Dodatkowe informacje...">${escHtml(reminder.notes || reminder.description || '')}</textarea>
            </div>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color);">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">📜 Historia zdarzeń alertu</h4>
                <div style="max-height:220px;overflow-y:auto;padding-right:4px;">${historyHtml}</div>
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
            const convertHeaderBtnEl = body.querySelector('#convert-to-team-header-btn');
            if (convertHeaderBtnEl) {
                convertHeaderBtnEl.addEventListener('click', () => {
                    closeModal();
                    showConvertToTeamModal(reminder);
                });
            }
            const catSelect = body.querySelector('#edit-category');
            const subSelect = body.querySelector('#edit-subtype');

            const populateSubtypes = () => {
                const selectedCat = categories.find(c => c.id === catSelect.value || c.name === catSelect.value);
                updateSubtypeOptions(subSelect, selectedCat);
                if (reminder.subType) subSelect.value = reminder.subType;
            };
            catSelect.addEventListener('change', populateSubtypes);
            populateSubtypes();

            const email1Select = body.querySelector('#edit-email1');
            const email2Select = body.querySelector('#edit-email2');

            body.querySelector('#edit-custom-email1-btn')?.addEventListener('click', async () => {
                const manual = prompt('Wpisz nowy prywatny adres e-mail:');
                if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.trim())) {
                    const clean = manual.trim().toLowerCase();
                    try {
                        customEmails = await addUserCustomEmail(clean);
                        email1Select.innerHTML = buildEmailOptions(allowedUsers, clean, '', customEmails);
                        email1Select.value = clean;
                        email2Select.innerHTML = buildEmailOptions(allowedUsers, email2Select.value, '', customEmails);
                        showToast(`Dodano i zapisano w chmurze adres: ${clean}`, 'success');
                    } catch (e) {
                        showToast('Błąd zapisu adresu: ' + e.message, 'error');
                    }
                } else if (manual) {
                    showToast('Nieprawidłowy format adresu e-mail.', 'warning');
                }
            });

            body.querySelector('#edit-custom-email2-btn')?.addEventListener('click', async () => {
                const manual = prompt('Wpisz dodatkowy prywatny adres e-mail:');
                if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.trim())) {
                    const clean = manual.trim().toLowerCase();
                    try {
                        customEmails = await addUserCustomEmail(clean);
                        email2Select.innerHTML = buildEmailOptions(allowedUsers, clean, '', customEmails);
                        email2Select.value = clean;
                        email1Select.innerHTML = buildEmailOptions(allowedUsers, email1Select.value, '', customEmails);
                        showToast(`Dodano i zapisano w chmurze adres: ${clean}`, 'success');
                    } catch (e) {
                        showToast('Błąd zapisu adresu: ' + e.message, 'error');
                    }
                } else if (manual) {
                    showToast('Nieprawidłowy format adresu e-mail.', 'warning');
                }
            });

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
                const currentPrimary = body.querySelector('#edit-email1')?.value?.trim();
                const currentSecondary = body.querySelector('#edit-email2')?.value?.trim();

                const mailReminder = {
                    ...reminder,
                    primaryEmail: currentPrimary || initialPrimary,
                    secondaryEmail: currentSecondary || initialSecondary
                };

                const mailBtn = footer.querySelector('#modal-mail-btn');
                mailBtn.classList.add('loading');
                try {
                    const result = await sendManualNotification(mailReminder);
                    showToast(`Wysłano powiadomienie e-mail do: ${result.recipients.join(', ')}.`, 'success');
                } catch (err) {
                    showToast('Błąd wysyłania e-maila: ' + err.message, 'error');
                } finally {
                    mailBtn.classList.remove('loading');
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

                if (email1) addUserCustomEmail(email1).catch(() => {});
                if (email2) addUserCustomEmail(email2).catch(() => {});

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

async function showConvertToTeamModal(reminder) {
    const { getAllowedUsers, convertReminderToTeamAlert } = await import('./db.js');
    const allowedUsers = await getAllowedUsers();
    const uid = currentUser?.uid;
    const currentEmail = currentUser?.email || '';
    const currentName = currentUser?.displayName || currentEmail.split('@')[0] || '';

    let selectedParticipants = [{
        uid: uid || currentEmail,
        email: currentEmail,
        name: currentName,
        role: 'owner'
    }];

    if (reminder.primaryEmail && reminder.primaryEmail.toLowerCase() !== currentEmail.toLowerCase()) {
        const found = allowedUsers.find(u => u.email && u.email.toLowerCase() === reminder.primaryEmail.toLowerCase());
        selectedParticipants.push({
            uid: found?.id || reminder.primaryEmail,
            email: reminder.primaryEmail,
            name: found?.name || reminder.primaryEmail.split('@')[0],
            role: 'executor'
        });
    }

    if (reminder.secondaryEmail && reminder.secondaryEmail.toLowerCase() !== currentEmail.toLowerCase() && reminder.secondaryEmail.toLowerCase() !== reminder.primaryEmail?.toLowerCase()) {
        const found = allowedUsers.find(u => u.email && u.email.toLowerCase() === reminder.secondaryEmail.toLowerCase());
        selectedParticipants.push({
            uid: found?.id || reminder.secondaryEmail,
            email: reminder.secondaryEmail,
            name: found?.name || reminder.secondaryEmail.split('@')[0],
            role: 'observer'
        });
    }

    const ROLE_BADGES = {
        'owner':    { label: 'Właściciel', icon: '👑', color: '#f59e0b' },
        'executor': { label: 'Wykonawca', icon: '🔧', color: '#4f8cff' },
        'observer': { label: 'Obserwator', icon: '👁️', color: '#7c3aed' }
    };

    showModal({
        title: `👥 Konwersja na Alert Zespołowy`,
        wide: true,
        body: `
            <div style="padding:14px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:10px;margin-bottom:16px;">
                <div style="font-weight:700;color:#7c3aed;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                    <span>📌 Zamiana alertu: "${escHtml(reminder.title)}"</span>
                </div>
                <p style="font-size:0.85rem;color:var(--text-secondary);margin:0;">
                    Przekształcenie tego alertu w alert zespołowy umożliwi jego współdzielenie z innymi osobami. 
                    <strong>Wszystkie dotychczasowe szczegóły oraz pełna historia zdarzeń zostaną zachowane.</strong>
                </p>
            </div>

            <div style="margin-top:16px;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:10px;">👥 Wybierz uczestników alertu zespołowego</h4>
                <div id="convert-participants-list" style="margin-bottom:12px;"></div>

                <div class="form-row" style="align-items:flex-end;">
                    <div class="form-group" style="flex:2;">
                        <label for="convert-add-user">Dodaj osobę z bazy</label>
                        <select id="convert-add-user" class="filter-select w-full">
                            <option value="">— Wybierz użytkownika —</option>
                            ${allowedUsers.filter(u => (u.email || '').toLowerCase() !== currentEmail.toLowerCase()).map(u => {
                                const inactiveSuffix = u.isActive === false ? ' (nieaktywny)' : '';
                                return `<option value="${escHtml(u.email)}" data-uid="${escHtml(u.id || u.email)}" data-name="${escHtml(u.name || '')}">${escHtml(u.name || u.email)}${inactiveSuffix} (${escHtml(u.email)})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label for="convert-add-role">Rola</label>
                        <select id="convert-add-role" class="filter-select w-full">
                            <option value="executor">🔧 Wykonawca</option>
                            <option value="observer">👁️ Obserwator</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" id="convert-add-participant-btn" type="button" style="height:42px;">Dodaj</button>
                </div>
            </div>`,
        footer: `
            <button class="btn btn-secondary" id="convert-cancel-btn" type="button">Anuluj</button>
            <button class="btn btn-primary" id="convert-submit-btn" type="button" style="background:#7c3aed;border-color:#7c3aed;">👥 Konwertuj na alert zespołowy</button>`,
        onOpen: (body, footer) => {
            const listEl = body.querySelector('#convert-participants-list');

            const renderList = () => {
                listEl.innerHTML = selectedParticipants.map(p => {
                    const roleInfo = ROLE_BADGES[p.role] || ROLE_BADGES.executor;
                    const isMe = (p.email || '').toLowerCase() === currentEmail.toLowerCase();
                    return `
                        <div class="participant-row" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card-hover);border-radius:8px;margin-bottom:6px;">
                            <span style="flex:1;font-size:0.88rem;font-weight:500;">${escHtml(p.name || p.email)} <span style="color:var(--text-muted);font-size:0.78rem;">(${escHtml(p.email)})</span></span>
                            <span class="category-badge" style="background:${roleInfo.color}22;color:${roleInfo.color};font-size:0.75rem;padding:3px 8px;">${roleInfo.icon} ${roleInfo.label}</span>
                            ${!isMe ? `<button class="chip-remove" type="button" data-email="${escHtml(p.email)}" style="cursor:pointer;border:none;background:none;font-size:1.1rem;color:var(--text-muted);">×</button>` : ''}
                        </div>`;
                }).join('');

                listEl.querySelectorAll('.chip-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const emailToRemove = btn.dataset.email.toLowerCase();
                        selectedParticipants = selectedParticipants.filter(p => (p.email || '').toLowerCase() !== emailToRemove);
                        renderList();
                    });
                });
            };
            renderList();

            body.querySelector('#convert-add-participant-btn').addEventListener('click', () => {
                const select = body.querySelector('#convert-add-user');
                const roleSelect = body.querySelector('#convert-add-role');
                const email = select.value.trim();
                if (!email) { showToast('Wybierz użytkownika.', 'warning'); return; }

                const option = select.options[select.selectedIndex];
                const name = option.dataset.name || email.split('@')[0];
                const pUid = option.dataset.uid || email;

                if (selectedParticipants.some(p => (p.email || '').toLowerCase() === email.toLowerCase())) {
                    showToast('Użytkownik jest już na liście.', 'warning');
                    return;
                }

                selectedParticipants.push({
                    uid: pUid,
                    email: email,
                    name: name,
                    role: roleSelect.value
                });
                select.value = '';
                renderList();
            });

            footer.querySelector('#convert-cancel-btn').addEventListener('click', () => {
                closeModal();
                showReminderDetailsModal(reminder.id, reminder);
            });

            footer.querySelector('#convert-submit-btn').addEventListener('click', async () => {
                const submitBtn = footer.querySelector('#convert-submit-btn');
                submitBtn.classList.add('loading');
                try {
                    await convertReminderToTeamAlert(reminder.id, selectedParticipants);
                    showToast('Alert został pomyślnie zamieniony na alert zespołowy!', 'success');
                    closeModal();
                    refreshCurrentPage();
                } catch (err) {
                    showToast('Błąd konwersji: ' + err.message, 'error');
                } finally {
                    submitBtn.classList.remove('loading');
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
        const result = await sendManualNotification(r);
        showToast(`Wysłano żądanie e-mail do rozszerzenia Trigger Email. ID dokumentu: ${result.id}.`, 'success');
    }
};

// ============================================================
// ADD REMINDER MODAL (Quick Add from FAB)
// ============================================================
async function showAddReminderModal(prefillCategory) {
    // Dynamicznie importuj db do pobrania kategorii
    const { getCategories, getAllowedUsers, addReminder, getUserCustomEmails, addUserCustomEmail } = await import('./db.js');
    const { getUserProfile } = await import('./auth.js');

    const categories = await getCategories();
    const allowedUsers = await getAllowedUsers();
    let customEmails = await getUserCustomEmails();
    const profile = await getUserProfile();

    const defaultEmail = profile?.defaultPrimaryEmail || currentUser?.email || '';
    const defaultAlertDays = profile?.defaultAlertDays || [30, 14, 7, 3, 1];

    let categoryOptions = categories.map(c =>
        `<option value="${c.id}" ${prefillCategory === c.id || (prefillCategory && c.name && c.name.toLowerCase() === prefillCategory.toLowerCase()) ? 'selected' : ''}>${escHtml(c.icon || '📋')} ${escHtml(c.name)}</option>`
    ).join('');

    const alertChipsHtml = defaultAlertDays.map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button" title="Usuń">×</button></span>`
    ).join('');

    let selectedParticipants = [{
        uid: currentUser?.uid || currentUser?.email,
        email: currentUser?.email || '',
        name: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
        role: 'owner'
    }];

    showModal({
        title: 'Nowe przypomnienie',
        wide: true,
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

            <!-- Opcja alertu zespołowego -->
            <div style="margin-top:16px;padding:12px;background:var(--bg-card-hover);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="add-is-shared" class="toggle">
                    <label for="add-is-shared" style="font-weight:700;cursor:pointer;font-size:0.9rem;">👥 Utwórz jako alert zespołowy (współdzielony z zespołem)</label>
                </div>
                <div id="add-shared-section" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
                    <h4 style="font-size:0.85rem;font-weight:700;margin-bottom:8px;">👥 Uczestnicy alertu zespołowego</h4>
                    <div id="add-participants-list" style="margin-bottom:8px;"></div>
                    <div class="form-row" style="align-items:flex-end;">
                        <div class="form-group" style="flex:2;">
                            <label for="add-user-select">Dodaj osobę z bazy</label>
                            <select id="add-user-select" class="filter-select w-full">
                                <option value="">— Wybierz użytkownika —</option>
                                ${allowedUsers.filter(u => (u.email || '').toLowerCase() !== (currentUser?.email || '').toLowerCase()).map(u => {
                                    const inactiveSuffix = u.isActive === false ? ' (nieaktywny)' : '';
                                    return `<option value="${escHtml(u.email)}" data-uid="${escHtml(u.id || u.email)}" data-name="${escHtml(u.name || '')}">${escHtml(u.name || u.email)}${inactiveSuffix} (${escHtml(u.email)})</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label for="add-user-role">Rola</label>
                            <select id="add-user-role" class="filter-select w-full">
                                <option value="executor">🔧 Wykonawca</option>
                                <option value="observer">👁️ Obserwator</option>
                            </select>
                        </div>
                        <button class="btn btn-secondary" id="add-participant-btn" type="button" style="height:42px;">Dodaj</button>
                    </div>
                </div>
            </div>

            <button class="collapsible-header" type="button" id="add-advanced-toggle" style="margin-top:12px;">
                Ustawienia zaawansowane
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="collapsible-content" id="add-advanced-content">
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <label for="add-email1">E-mail główny</label>
                            <button type="button" id="add-custom-email1-btn" style="font-size:0.75rem;color:var(--accent-primary);cursor:pointer;background:none;border:none;padding:0;font-weight:600;">+ Wpisz inny</button>
                        </div>
                        <select id="add-email1" class="filter-select w-full">
                            ${buildEmailOptions(allowedUsers, defaultEmail, '', customEmails)}
                        </select>
                    </div>
                    <div class="form-group">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <label for="add-email2">E-mail dodatkowy</label>
                            <button type="button" id="add-custom-email2-btn" style="font-size:0.75rem;color:var(--accent-primary);cursor:pointer;background:none;border:none;padding:0;font-weight:600;">+ Wpisz inny</button>
                        </div>
                        <select id="add-email2" class="filter-select w-full">
                            ${buildEmailOptions(allowedUsers, profile?.defaultSecondaryEmail || '', '', customEmails)}
                        </select>
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

            // Shared alert toggle & participants
            const isSharedCheckbox = body.querySelector('#add-is-shared');
            const sharedSection = body.querySelector('#add-shared-section');
            const participantsContainer = body.querySelector('#add-participants-list');

            const ROLE_BADGES = {
                'owner':    { label: 'Właściciel', icon: '👑', color: '#f59e0b' },
                'executor': { label: 'Wykonawca', icon: '🔧', color: '#4f8cff' },
                'observer': { label: 'Obserwator', icon: '👁️', color: '#7c3aed' }
            };

            const renderParticipants = () => {
                participantsContainer.innerHTML = selectedParticipants.map(p => {
                    const rInfo = ROLE_BADGES[p.role] || ROLE_BADGES.executor;
                    const isMe = p.email === currentUser?.email;
                    return `
                        <div class="participant-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-card-hover);border-radius:8px;margin-bottom:4px;">
                            <span style="flex:1;font-size:0.85rem;">${escHtml(p.name || p.email)}</span>
                            <span class="category-badge" style="background:${rInfo.color}22;color:${rInfo.color};font-size:0.72rem;padding:2px 6px;">${rInfo.icon} ${rInfo.label}</span>
                            ${!isMe ? `<button class="chip-remove" type="button" data-email="${escHtml(p.email)}" style="cursor:pointer;border:none;background:none;font-size:1.1rem;color:var(--text-muted);">×</button>` : ''}
                        </div>`;
                }).join('');

                participantsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        selectedParticipants = selectedParticipants.filter(p => p.email !== btn.dataset.email);
                        renderParticipants();
                    });
                });
            };
            renderParticipants();

            isSharedCheckbox.addEventListener('change', () => {
                sharedSection.style.display = isSharedCheckbox.checked ? 'block' : 'none';
            });

            body.querySelector('#add-participant-btn')?.addEventListener('click', () => {
                const userSelect = body.querySelector('#add-user-select');
                const roleSelect = body.querySelector('#add-user-role');
                const email = userSelect.value;
                if (!email) { showToast('Wybierz użytkownika.', 'warning'); return; }

                const option = userSelect.options[userSelect.selectedIndex];
                const name = option.dataset.name || email.split('@')[0];
                const pUid = option.dataset.uid || email;

                if (selectedParticipants.some(p => p.email === email)) {
                    showToast('Użytkownik jest już dodany.', 'warning');
                    return;
                }

                selectedParticipants.push({
                    uid: pUid,
                    email: email,
                    name: name,
                    role: roleSelect.value
                });

                if (addEmail1Select && (!addEmail1Select.value || addEmail1Select.value === defaultEmail)) {
                    addEmail1Select.value = email;
                }

                userSelect.value = '';
                renderParticipants();
            });

            const addEmail1Select = body.querySelector('#add-email1');
            const addEmail2Select = body.querySelector('#add-email2');

            body.querySelector('#add-custom-email1-btn')?.addEventListener('click', async () => {
                const manual = prompt('Wpisz nowy prywatny adres e-mail:');
                if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.trim())) {
                    const clean = manual.trim().toLowerCase();
                    try {
                        customEmails = await addUserCustomEmail(clean);
                        addEmail1Select.innerHTML = buildEmailOptions(allowedUsers, clean, '', customEmails);
                        addEmail1Select.value = clean;
                        addEmail2Select.innerHTML = buildEmailOptions(allowedUsers, addEmail2Select.value, '', customEmails);
                        showToast(`Dodano i zapisano w chmurze adres: ${clean}`, 'success');
                    } catch (e) {
                        showToast('Błąd zapisu adresu: ' + e.message, 'error');
                    }
                } else if (manual) {
                    showToast('Nieprawidłowy format adresu e-mail.', 'warning');
                }
            });

            body.querySelector('#add-custom-email2-btn')?.addEventListener('click', async () => {
                const manual = prompt('Wpisz dodatkowy prywatny adres e-mail:');
                if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.trim())) {
                    const clean = manual.trim().toLowerCase();
                    try {
                        customEmails = await addUserCustomEmail(clean);
                        addEmail2Select.innerHTML = buildEmailOptions(allowedUsers, clean, '', customEmails);
                        addEmail2Select.value = clean;
                        addEmail1Select.innerHTML = buildEmailOptions(allowedUsers, addEmail1Select.value, '', customEmails);
                        showToast(`Dodano i zapisano w chmurze adres: ${clean}`, 'success');
                    } catch (e) {
                        showToast('Błąd zapisu adresu: ' + e.message, 'error');
                    }
                } else if (manual) {
                    showToast('Nieprawidłowy format adresu e-mail.', 'warning');
                }
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
                const isShared = isSharedCheckbox.checked;

                if (!title) { showToast('Podaj tytuł przypomnienia.', 'warning'); return; }
                if (!expiryStr) { showToast('Podaj datę wygaśnięcia.', 'warning'); return; }

                // Zbierz alert days z chipów
                const chips = chipsContainer.querySelectorAll('.alert-chip');
                const alertDays = Array.from(chips).map(c => parseInt(c.dataset.days)).filter(d => d > 0);
                alertDays.sort((a, b) => b - a); // malejąco

                if (email1) addUserCustomEmail(email1).catch(() => {});
                if (email2) addUserCustomEmail(email2).catch(() => {});

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
                        notes: description,
                        isShared: isShared,
                        createdByName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
                        participants: isShared ? selectedParticipants : []
                    });

                    showToast(isShared ? 'Alert zespołowy dodany!' : 'Przypomnienie dodane!', 'success');
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



// ============================================================
// GLOBAL TASKALERT EXPORTS (Attached directly to window)
// ============================================================
window.showAddReminderModal = showAddReminderModal;
window.showReminderDetailsModal = showReminderDetailsModal;
window.showExecuteModal = showExecuteModal;
window.showModal = showModal;
window.closeModal = closeModal;
window.showConfirm = showConfirm;
window.showToast = showToast;

window.TaskAlert = {
    showToast,
    showModal,
    closeModal,
    showConfirm,
    showAddReminderModal,
    showReminderDetailsModal,
    showExecuteModal,
    escHtml,
    navigateTo,
    formatDate,
    formatDateTime,
    daysUntil,
    getAlertStatus,
    getCountdownText,
    debounce
};

// ============================================================
// HELPERS
// ============================================================
export function daysUntil(date) {
    if (!date) return Infinity;
    if (date.toDate && typeof date.toDate === 'function') date = date.toDate();
    if (typeof date === 'object' && typeof date.seconds === 'number') {
        date = new Date(date.seconds * 1000);
    } else if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }
    if (!(date instanceof Date) || isNaN(date.getTime())) return Infinity;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function getAlertStatus(daysLeft) {
    if (daysLeft < 0) return 'overdue';
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

export function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

export function formatDate(date) {
    if (!date) return '—';
    if (date.toDate && typeof date.toDate === 'function') date = date.toDate(); // Firestore Timestamp
    if (typeof date === 'string' || typeof date === 'number') date = new Date(date);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date) {
    if (!date) return '—';
    if (date.toDate && typeof date.toDate === 'function') date = date.toDate();
    if (typeof date === 'string' || typeof date === 'number') date = new Date(date);
    if (isNaN(date.getTime())) return '—';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function renderEventHistory(historyList) {
    if (!historyList || historyList.length === 0) {
        return '<div style="font-size:0.82rem;color:var(--text-muted);padding:12px 0;text-align:center;">Brak zarejestrowanych zdarzeń w historii.</div>';
    }

    const sorted = [...historyList].reverse();

    return sorted.map(item => {
        const timeStr = formatDateTime(item.timestamp || item.executedAt || item.createdAt);
        let icon = '📌';
        let titleStr = '';
        let badgeColor = 'var(--accent-color)';
        let badgeBg = 'rgba(79, 140, 255, 0.12)';
        let detailsHtml = '';

        const actorName = item.byName || item.performedBy || item.createdByName || (item.byEmail ? item.byEmail.split('@')[0] : '');
        const actorEmail = item.byEmail || item.performedByEmail || '';
        const actorHtml = actorName ? `
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:3px;display:flex;align-items:center;gap:4px;">
                <span>👤</span>
                <span><strong>${escHtml(actorName)}</strong>${actorEmail && actorEmail.toLowerCase() !== actorName.toLowerCase() ? ` (${escHtml(actorEmail)})` : ''}</span>
            </div>` : '';

        if (item.type === 'created') {
            icon = '🆕';
            titleStr = 'Utworzenie alertu';
            badgeColor = '#10b981';
            badgeBg = 'rgba(16, 185, 129, 0.15)';
            if (item.expiryDate) {
                detailsHtml = `Pierwotny termin: <strong style="color:#10b981;">${formatDate(item.expiryDate)}</strong>`;
            } else {
                detailsHtml = escHtml(item.note || 'Utworzono alert w systemie');
            }
        } else if (item.type === 'edited') {
            icon = '✏️';
            titleStr = 'Edycja szczegółów';
            badgeColor = '#f59e0b';
            badgeBg = 'rgba(245, 158, 11, 0.15)';
            detailsHtml = item.note ? escHtml(item.note) : 'Zaktualizowano dane przypomnienia';
        } else if (item.type === 'email_sent') {
            icon = '✉️';
            titleStr = 'Wysłano e-mail';
            badgeColor = '#7c3aed';
            badgeBg = 'rgba(124, 58, 237, 0.15)';
            const recs = (item.recipients || []).map(r => `<span style="color:#7c3aed;font-weight:600;">${escHtml(r)}</span>`).join(', ');
            detailsHtml = recs ? `Odbiorcy: ${recs}` : (item.note ? escHtml(item.note) : '');
        } else if (item.type === 'converted_to_team') {
            icon = '👥';
            titleStr = 'Konwersja na zespołowy';
            badgeColor = '#8b5cf6';
            badgeBg = 'rgba(139, 92, 246, 0.15)';
            detailsHtml = item.note ? escHtml(item.note) : 'Przekształcono alert prywatny na współdzielony alert zespołowy';
        } else if (item.type === 'executed' || item.executedAt) {
            icon = '✅';
            titleStr = 'Oznaczono jako wykonane';
            badgeColor = '#10b981';
            badgeBg = 'rgba(16, 185, 129, 0.15)';
            const execTime = item.executedAt ? formatDate(item.executedAt) : '—';
            const nextTime = item.newExpiry ? formatDate(item.newExpiry) : null;
            detailsHtml = `Data wykonania: <strong style="color:#10b981;">${execTime}</strong>`;
            if (nextTime) {
                detailsHtml += ` → Następny termin: <strong style="color:#4f8cff;">${nextTime}</strong>`;
            } else {
                detailsHtml += ` <span style="color:#ef4444;font-weight:600;">(Zamknięto cykl / Archiwum)</span>`;
            }
            if (item.note) {
                detailsHtml += `<div style="margin-top:3px;color:var(--text-secondary);">📝 <em>${escHtml(item.note)}</em></div>`;
            }
        } else {
            titleStr = 'Zdarzenie';
            detailsHtml = item.note ? escHtml(item.note) : '';
        }

        return `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-light);">
                <div style="font-size:1.25rem;line-height:1;padding-top:2px;">${icon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
                        <span style="font-weight:700;font-size:0.8rem;color:${badgeColor};background:${badgeBg};padding:2px 8px;border-radius:6px;">${titleStr}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">🕒 ${timeStr}</span>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-primary);margin-top:2px;">${detailsHtml}</div>
                    ${actorHtml}
                </div>
            </div>`;
    }).join('');
}



// ============================================================
// SERVICE WORKER REGISTRATION (Auto-unregister on localhost)
// ============================================================
if ('serviceWorker' in navigator) {
    const isLocalhost = Boolean(
        window.location.hostname === 'localhost' ||
        window.location.hostname === '[::1]' ||
        window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
    );

    if (isLocalhost) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
                console.log('[SW] Odrejestrowano Service Worker na localhost dla zachowania świeżości kodu.');
            }
        });
        if (window.caches) {
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
            });
        }
    } else {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('[SW] Registered:', reg.scope))
                .catch(err => console.warn('[SW] Registration failed:', err));
        });
    }
}
