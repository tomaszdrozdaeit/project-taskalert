// ============================================================
// INNE MODULE — Alerty ogólne (elastyczny koszyk)
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, getCategories } from '../db.js';

const EXCLUDED_CATEGORIES = ['Samochody', 'Kadry'];
let unsubscribe = null;
let allReminders = [];
let currentCategory = null;

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title" id="inne-title">📋 Inne i pozostałe</h1>
            <p class="page-subtitle" id="inne-subtitle">Wszystkie pozostałe przypomnienia spoza kategorii Samochody i Kadry</p>
        </div>

        <div class="filter-bar animate-in">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="search-inne" placeholder="Szukaj...">
            </div>
            <select class="filter-select" id="filter-status-inne">
                <option value="all">Wszystkie statusy</option>
                <option value="overdue">🔴 Przeterminowane</option>
                <option value="danger">🟠 Do 14 dni</option>
                <option value="warning">🟡 Do 30 dni</option>
                <option value="ok">🟢 Powyżej 30 dni</option>
            </select>
            <button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal(${currentCategory ? `'${currentCategory.id}'` : ''})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Dodaj</span>
            </button>
        </div>

        <div class="reminder-list" id="reminders-list-inne">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export function init(customCatId = null) {
    currentCategory = null;
    let rawReminders = [];

    // Funkcja filtrująca i renderująca listę
    const applyFilterAndRender = (categoriesList = []) => {
        if (customCatId) {
            if (!currentCategory && categoriesList.length > 0) {
                currentCategory = categoriesList.find(c =>
                    c.id === customCatId ||
                    c.id.toString() === customCatId.toString() ||
                    c.name.toLowerCase() === customCatId.toLowerCase()
                );
            }

            const titleEl = document.getElementById('inne-title');
            const subtitleEl = document.getElementById('inne-subtitle');
            if (currentCategory && titleEl) {
                titleEl.textContent = `${currentCategory.icon || '📋'} ${currentCategory.name}`;
                if (subtitleEl) subtitleEl.textContent = `Przypomnienia z kategorii ${currentCategory.name}`;
            }

            if (currentCategory) {
                allReminders = rawReminders.filter(r =>
                    r.categoryId === currentCategory.id ||
                    (r.categoryName && r.categoryName.toLowerCase() === currentCategory.name.toLowerCase())
                );
            } else {
                allReminders = rawReminders.filter(r =>
                    r.categoryId === customCatId ||
                    (r.categoryName && r.categoryName.toLowerCase() === customCatId.toLowerCase())
                );
            }
        } else {
            // Widok "Inne" — wyklucz przypomnienia przypisane do pozostałych zarejestrowanych kategorii (np. Samochody, Kadry, Nieruchomości itp.)
            const otherCatNames = categoriesList
                .map(c => c.name)
                .filter(name => name && name.toLowerCase() !== 'inne');

            if (otherCatNames.length > 0) {
                allReminders = rawReminders.filter(r =>
                    !r.categoryName ||
                    r.categoryName.toLowerCase() === 'inne' ||
                    !otherCatNames.some(name => name.toLowerCase() === (r.categoryName || '').toLowerCase())
                );
            } else {
                allReminders = rawReminders.filter(r => !EXCLUDED_CATEGORIES.includes(r.categoryName));
            }
        }

        renderList();
    };

    let categoriesCache = [];

    // Pobierz kategorie w tle i po uzyskaniu zaktualizuj nagłówek oraz filtry
    getCategories().then(cats => {
        categoriesCache = cats || [];
        applyFilterAndRender(categoriesCache);
    }).catch(err => {
        console.warn('[Inne] Błąd pobierania kategorii:', err);
        applyFilterAndRender([]);
    });

    // Subskrypcja przypomnień
    unsubscribe = onRemindersChange((reminders) => {
        rawReminders = reminders || [];
        applyFilterAndRender(categoriesCache);
    }, 'active');

    const searchInput = document.getElementById('search-inne');
    const filterStatus = document.getElementById('filter-status-inne');

    if (searchInput) searchInput.addEventListener('input', renderList);
    if (filterStatus) filterStatus.addEventListener('change', renderList);

    const listEl = document.getElementById('reminders-list-inne');
    if (listEl) {
        listEl.addEventListener('click', (e) => {
            const card = e.target.closest('.reminder-card');
            if (card && card.dataset.id) {
                window.TaskAlert.showReminderDetailsModal(card.dataset.id);
            }
        });
    }

    return () => { if (unsubscribe) unsubscribe(); };
}

export function refresh() {}

function daysUntil(date) {
    if (!date) return Infinity;
    if (date.toDate) date = date.toDate();
    const now = new Date(); now.setHours(0,0,0,0);
    const t = new Date(date); t.setHours(0,0,0,0);
    return Math.ceil((t - now) / 86400000);
}

function formatDate(date) {
    if (!date) return '—';
    if (date.toDate) date = date.toDate();
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function getStatusClass(dl) { if (dl < 0) return 'status-overdue'; if (dl <= 14) return 'status-danger'; if (dl <= 30) return 'status-warning'; return 'status-ok'; }
function getCountdownClass(dl) { if (dl <= 14) return 'countdown-danger'; if (dl <= 30) return 'countdown-warning'; return 'countdown-ok'; }
function getCountdownText(dl) { if (dl < 0) return `${Math.abs(dl)} dni temu!`; if (dl === 0) return 'Dziś!'; if (dl === 1) return 'Jutro!'; return `za ${dl} dni`; }
function getStatusKey(dl) { if (dl < 0) return 'overdue'; if (dl <= 14) return 'danger'; if (dl <= 30) return 'warning'; return 'ok'; }

function renderList() {
    const listEl = document.getElementById('reminders-list-inne');
    if (!listEl) return;

    const searchVal = (document.getElementById('search-inne')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filter-status-inne')?.value || 'all';

    let filtered = allReminders.map(r => ({ ...r, daysLeft: daysUntil(r.expiryDate) }));

    if (searchVal) filtered = filtered.filter(r => r.title.toLowerCase().includes(searchVal) || (r.notes || '').toLowerCase().includes(searchVal));
    if (statusFilter !== 'all') filtered = filtered.filter(r => getStatusKey(r.daysLeft) === statusFilter);

    filtered.sort((a, b) => a.daysLeft - b.daysLeft);

    if (filtered.length === 0) {
        const catIcon = currentCategory?.icon || '📋';
        const catName = currentCategory ? `w kategorii ${currentCategory.name}` : 'ogólne';
        const catIdParam = currentCategory ? `'${currentCategory.id}'` : '';
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${catIcon}</div>
                <div class="empty-state-title">${searchVal || statusFilter !== 'all' ? 'Brak wyników' : 'Brak przypomnień'}</div>
                <p class="empty-state-text">${searchVal || statusFilter !== 'all'
                    ? 'Zmień kryteria wyszukiwania.' : `Dodaj swoje pierwsze przypomnienie ${escHtml(catName)}.`}</p>
                ${!searchVal && statusFilter === 'all'
                    ? `<button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal(${catIdParam})">Dodaj przypomnienie</button>` : ''}
            </div>`;
        return;
    }

    listEl.innerHTML = filtered.map(r => {
        const statusCls = getStatusClass(r.daysLeft);
        const cdCls = getCountdownClass(r.daysLeft);
        const cdText = getCountdownText(r.daysLeft);
        const pct = r.daysLeft < 0 ? 100 : Math.max(5, 100 - (r.daysLeft / 90) * 100);
        const fillCls = r.daysLeft < 0 || r.daysLeft <= 14 ? 'fill-danger' : r.daysLeft <= 30 ? 'fill-warning' : 'fill-ok';

        return `
        <div class="reminder-card" data-id="${r.id}">
            <div class="reminder-status ${statusCls}"></div>
            <div class="reminder-info">
                <div class="reminder-title">${escHtml(r.title)}</div>
                <div class="reminder-meta">
                    <span class="category-badge">${escHtml(r.categoryName || 'Inne')}</span>
                    <span>📅 ${formatDate(r.expiryDate)}</span>
                </div>
                <div class="progress-bar"><div class="progress-bar-fill ${fillCls}" style="width:${pct}%"></div></div>
            </div>
            <div class="reminder-countdown ${cdCls}">${cdText}</div>
            <div class="reminder-actions">
                <button class="btn-icon" title="Wyślij powiadomienie" onclick="event.stopPropagation(); handleSendNotification('${r.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="btn-icon" title="Oznacz jako wykonane" onclick="event.stopPropagation(); handleExecute('${r.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </button>
                <button class="btn-icon" title="Edytuj" onclick="event.stopPropagation(); handleEdit('${r.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon" title="Usuń" onclick="event.stopPropagation(); handleDelete('${r.id}', '${escHtml(r.title)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}
