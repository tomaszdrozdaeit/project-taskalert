// ============================================================
// HISTORIA MODULE — Archiwum wykonanych alertów
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange } from '../db.js';

let unsubscribe = null;
let allCompleted = [];

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">📜 Historia</h1>
            <p class="page-subtitle">Archiwum wykonanych i zamkniętych przypomnień</p>
        </div>

        <div class="filter-bar animate-in">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="search-historia" placeholder="Szukaj w historii...">
            </div>
            <button class="btn btn-secondary" id="export-csv-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Eksport CSV</span>
            </button>
        </div>

        <div class="reminder-list" id="historia-list">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export function init() {
    unsubscribe = onRemindersChange((reminders) => {
        allCompleted = reminders;
        renderList();
    }, 'completed');

    document.getElementById('search-historia')?.addEventListener('input', renderList);
    document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);

    return () => { if (unsubscribe) unsubscribe(); };
}

export function refresh() {}

function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function formatDate(date) {
    if (!date) return '—';
    if (date.toDate) date = date.toDate();
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderList() {
    const listEl = document.getElementById('historia-list');
    if (!listEl) return;

    const searchVal = (document.getElementById('search-historia')?.value || '').toLowerCase();

    let filtered = [...allCompleted];
    if (searchVal) {
        filtered = filtered.filter(r =>
            r.title?.toLowerCase().includes(searchVal) ||
            r.categoryName?.toLowerCase().includes(searchVal) ||
            (r.notes || '').toLowerCase().includes(searchVal)
        );
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📜</div>
                <div class="empty-state-title">${searchVal ? 'Brak wyników' : 'Brak wpisów w historii'}</div>
                <p class="empty-state-text">Wykonane przypomnienia pojawią się tutaj po oznaczeniu ich jako zakończone.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = filtered.map(r => {
        const historyEntries = (r.history || []).slice(-3).reverse();
        const historyHtml = historyEntries.map(h => `
            <div style="font-size:0.78rem;color:var(--text-muted);padding:4px 0;border-top:1px solid var(--border-light);">
                ✅ Wykonano: ${formatDate(h.executedAt)}
                ${h.newExpiry ? ` → Następny: ${formatDate(h.newExpiry)}` : ' (zamknięte)'}
                ${h.note ? ` — ${escHtml(h.note)}` : ''}
            </div>
        `).join('');

        return `
        <div class="card" style="margin-bottom:8px;">
            <div class="flex items-center gap-3" style="margin-bottom:8px;">
                <div style="width:10px;height:10px;border-radius:50%;background:var(--status-ok);flex-shrink:0;"></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.95rem;">${escHtml(r.title)}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">
                        <span class="category-badge">${escHtml(r.categoryName || 'Inne')}</span>
                        <span style="margin-left:8px;">Ostatnia data: ${formatDate(r.lastExecutedAt)}</span>
                    </div>
                </div>
            </div>
            ${historyHtml ? `<div style="padding-left:22px;">${historyHtml}</div>` : ''}
        </div>`;
    }).join('');
}

function exportCSV() {
    if (allCompleted.length === 0) {
        window.TaskAlert.showToast('Brak danych do eksportu.', 'warning');
        return;
    }

    const headers = ['Tytuł', 'Kategoria', 'Podtyp', 'Data wykonania', 'Notatki'];
    const rows = allCompleted.map(r => [
        r.title || '',
        r.categoryName || '',
        r.subTypeLabel || r.subType || '',
        formatDate(r.lastExecutedAt),
        (r.notes || '').replace(/"/g, '""')
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskalert_historia_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.TaskAlert.showToast('Eksport CSV pobrany.', 'success');
}
