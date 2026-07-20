// ============================================================
// KADRY MODULE — Alerty kadrowe (Badania, BHP)
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, deleteReminder, markAsExecuted, updateReminder, sendManualNotification } from '../db.js';

const CATEGORY_NAME = 'Kadry';
const ICON = '👷';
let unsubscribe = null;
let allReminders = [];

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">${ICON} ${CATEGORY_NAME}</h1>
            <p class="page-subtitle">Badania lekarskie, szkolenia BHP i inne terminy pracownicze</p>
        </div>

        <div class="filter-bar animate-in">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="search-kadry" placeholder="Szukaj po nazwisku, stanowisku...">
            </div>
            <select class="filter-select" id="filter-status-kadry">
                <option value="all">Wszystkie statusy</option>
                <option value="overdue">🔴 Przeterminowane</option>
                <option value="danger">🟠 Do 14 dni</option>
                <option value="warning">🟡 Do 30 dni</option>
                <option value="ok">🟢 Powyżej 30 dni</option>
            </select>
            <select class="filter-select" id="filter-subtype-kadry">
                <option value="all">Wszystkie typy</option>
                <option value="badania_lekarskie">Badania lekarskie</option>
                <option value="bhp">Szkolenie BHP</option>
                <option value="custom">Inne</option>
            </select>
            <button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Dodaj</span>
            </button>
        </div>

        <div class="reminder-list" id="reminders-list-kadry">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export function init() {
    unsubscribe = onRemindersChange((reminders) => {
        allReminders = reminders.filter(r => r.categoryName === CATEGORY_NAME);
        renderList();
    }, 'active');

    const searchInput = document.getElementById('search-kadry');
    const filterStatus = document.getElementById('filter-status-kadry');
    const filterSubtype = document.getElementById('filter-subtype-kadry');

    if (searchInput) searchInput.addEventListener('input', renderList);
    if (filterStatus) filterStatus.addEventListener('change', renderList);
    if (filterSubtype) filterSubtype.addEventListener('change', renderList);

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
    const listEl = document.getElementById('reminders-list-kadry');
    if (!listEl) return;

    const searchVal = (document.getElementById('search-kadry')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filter-status-kadry')?.value || 'all';
    const subtypeFilter = document.getElementById('filter-subtype-kadry')?.value || 'all';

    let filtered = allReminders.map(r => ({ ...r, daysLeft: daysUntil(r.expiryDate) }));

    if (searchVal) filtered = filtered.filter(r => r.title.toLowerCase().includes(searchVal) || (r.notes || '').toLowerCase().includes(searchVal));
    if (statusFilter !== 'all') filtered = filtered.filter(r => getStatusKey(r.daysLeft) === statusFilter);
    if (subtypeFilter !== 'all') filtered = filtered.filter(r => r.subType === subtypeFilter);

    filtered.sort((a, b) => a.daysLeft - b.daysLeft);

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${ICON}</div>
                <div class="empty-state-title">${searchVal || statusFilter !== 'all' || subtypeFilter !== 'all' ? 'Brak wyników' : 'Brak przypomnień'}</div>
                <p class="empty-state-text">${searchVal || statusFilter !== 'all' || subtypeFilter !== 'all'
                    ? 'Zmień kryteria wyszukiwania lub filtrowania.'
                    : 'Dodaj swoje pierwsze przypomnienie kadrowe.'}</p>
                ${!searchVal && statusFilter === 'all' && subtypeFilter === 'all'
                    ? '<button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal()">Dodaj przypomnienie</button>' : ''}
            </div>`;
        return;
    }

    listEl.innerHTML = filtered.map(r => {
        const statusCls = getStatusClass(r.daysLeft);
        const cdCls = getCountdownClass(r.daysLeft);
        const cdText = getCountdownText(r.daysLeft);
        const pct = r.daysLeft < 0 ? 100 : Math.max(5, 100 - (r.daysLeft / 90) * 100);
        const fillCls = r.daysLeft < 0 || r.daysLeft <= 14 ? 'fill-danger' : r.daysLeft <= 30 ? 'fill-warning' : 'fill-ok';
        const alertChips = (r.alertDays || []).map(d => `<span class="alert-chip" style="font-size:0.7rem;padding:2px 8px;">${d}d</span>`).join('');

        return `
        <div class="reminder-card" data-id="${r.id}">
            <div class="reminder-status ${statusCls}"></div>
            <div class="reminder-info">
                <div class="reminder-title">${escHtml(r.title)}</div>
                <div class="reminder-meta">
                    <span class="category-badge" style="background:rgba(124,58,237,0.1);color:#7c3aed">${escHtml(r.subTypeLabel || r.subType)}</span>
                    <span>📅 ${formatDate(r.expiryDate)}</span>
                    ${alertChips}
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
