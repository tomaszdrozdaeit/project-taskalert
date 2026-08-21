// ============================================================
// HISTORIA MODULE — Archiwum wykonanych alertów
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, deleteReminder, sendManualNotification, parseDate } from '../db.js';

let unsubscribe = null;
let allCompleted = [];

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">📜 Historia</h1>
            <p class="page-subtitle">Archiwum wykonanych i zamkniętych przypomnień — kliknij na alert, aby zobaczyć pełną historię i szczegóły</p>
        </div>

        <div class="filter-bar animate-in">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="search-historia" placeholder="Szukaj w historii (tytuł, kategoria, notatka)...">
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

    const listEl = document.getElementById('historia-list');
    if (listEl) {
        listEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            const card = e.target.closest('.reminder-card');
            const id = btn?.dataset?.id || card?.dataset?.id;
            if (!id) return;

            if (btn) {
                const action = btn.dataset.action;
                if (action === 'delete') {
                    e.stopPropagation();
                    const title = btn.dataset.title || 'alert';
                    const showConfirmFn = window.showConfirm || window.TaskAlert?.showConfirm;
                    const confirmed = showConfirmFn
                        ? await showConfirmFn(
                            `Czy na pewno chcesz usunąć wpis "${title}" z historii?`,
                            'Usunięcie z historii',
                            { type: 'danger', confirmText: 'Usuń' }
                        )
                        : confirm(`Czy na pewno chcesz usunąć wpis "${title}" z historii?`);

                    if (confirmed) {
                        try {
                            await deleteReminder(id);
                            (window.showToast || window.TaskAlert?.showToast)?.('Wpis usunięty z historii.', 'success');
                        } catch (err) {
                            (window.showToast || window.TaskAlert?.showToast)?.('Błąd usuwania: ' + err.message, 'error');
                        }
                    }
                    return;
                }
                if (action === 'mail') {
                    e.stopPropagation();
                    const reminder = allCompleted.find(r => r.id === id);
                    if (reminder) {
                        btn.classList.add('loading');
                        try {
                            const res = await sendManualNotification(reminder);
                            (window.showToast || window.TaskAlert?.showToast)?.(`Wysłano powiadomienie e-mail do: ${res.recipients.join(', ')}`, 'success');
                        } catch (err) {
                            (window.showToast || window.TaskAlert?.showToast)?.('Błąd wysyłania e-maila: ' + err.message, 'error');
                        } finally {
                            btn.classList.remove('loading');
                        }
                    }
                    return;
                }
            }

            // Kliknięcie w kartę lub przycisk szczegółów
            if (window.showReminderDetailsModal) {
                const reminder = allCompleted.find(r => r.id === id);
                window.showReminderDetailsModal(id, reminder);
            }
        });
    }

    return () => { if (unsubscribe) unsubscribe(); };
}

export function refresh() {}

function escHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function formatDate(date) {
    if (!date) return '—';
    const parsed = parseDate(date);
    if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() === 0) return '—';
    return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderList() {
    const listEl = document.getElementById('historia-list');
    if (!listEl) return;

    const searchVal = (document.getElementById('search-historia')?.value || '').toLowerCase().trim();

    let filtered = [...allCompleted];
    if (searchVal) {
        filtered = filtered.filter(r =>
            (r.title || '').toLowerCase().includes(searchVal) ||
            (r.categoryName || '').toLowerCase().includes(searchVal) ||
            (r.subTypeLabel || r.subType || '').toLowerCase().includes(searchVal) ||
            (r.notes || r.description || '').toLowerCase().includes(searchVal)
        );
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state animate-in">
                <div class="empty-state-icon">📜</div>
                <div class="empty-state-title">${searchVal ? 'Brak wyników wyszukiwania' : 'Brak wpisów w historii'}</div>
                <p class="empty-state-text">Wykonane i zarchiwizowane przypomnienia pojawią się w tym miejscu po oznaczeniu ich jako zakończone.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = filtered.map(r => {
        const historyList = r.history || [];
        const lastExecEvent = historyList.slice().reverse().find(h => h.type === 'executed' || h.executedAt);
        const execActorName = lastExecEvent?.byName || lastExecEvent?.performedBy || (lastExecEvent?.byEmail ? lastExecEvent.byEmail.split('@')[0] : '');

        const createdEvent = historyList.find(h => h.type === 'created');
        const creatorName = r.createdByName || createdEvent?.byName || (createdEvent?.byEmail ? createdEvent.byEmail.split('@')[0] : '');

        const displayEntries = historyList.slice(-3).reverse();
        const historyTimelineHtml = displayEntries.length > 0 ? `
            <div style="background:var(--bg-card-hover);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:0.8rem;border:1px solid var(--border-light);">
                <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Ostatnie zdarzenia (${historyList.length}):</div>
                ${displayEntries.map(h => {
                    const actor = h.byName || h.performedBy || (h.byEmail ? h.byEmail.split('@')[0] : '');
                    let label = 'Zdarzenie';
                    let icon = '📌';
                    if (h.type === 'created') { label = 'Utworzono'; icon = '🆕'; }
                    else if (h.type === 'edited') { label = 'Edycja'; icon = '✏️'; }
                    else if (h.type === 'executed') { label = 'Wykonano'; icon = '✅'; }
                    else if (h.type === 'converted_to_team') { label = 'Zmieniono na zespołowy'; icon = '👥'; }
                    else if (h.type === 'email_sent') { label = 'Wysłano e-mail'; icon = '✉️'; }
                    return `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-light);">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                ${icon} <strong>${label}</strong>${actor ? ` przez <em>${escHtml(actor)}</em>` : ''}${h.note && h.type !== 'created' ? ` (${escHtml(h.note)})` : ''}
                            </span>
                            <span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0;font-weight:600;">${formatDate(h.timestamp || h.executedAt || h.createdAt)}</span>
                        </div>`;
                }).join('')}
            </div>` : '';

        return `
        <div class="reminder-card historia-card animate-in" data-id="${r.id}" style="cursor:pointer;margin-bottom:12px;" title="Kliknij, aby otworzyć szczegóły i pełną historię alertu">
            <div class="reminder-status status-ok" style="background:#10b981;"></div>
            <div class="reminder-info" style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                    <div class="reminder-title" style="font-weight:700;font-size:1rem;color:var(--text-primary);">${escHtml(r.title)}</div>
                    <div class="reminder-countdown countdown-ok" style="font-size:0.75rem;padding:3px 10px;background:rgba(16,185,129,0.12);color:#10b981;">
                        ✅ Zakończone
                    </div>
                </div>
                <div class="reminder-meta" style="gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                    <span class="category-badge">${escHtml(r.categoryName || 'Inne')}</span>
                    ${r.subTypeLabel || r.subType ? `<span class="category-badge" style="background:rgba(79,140,255,0.1);color:#4f8cff;">${escHtml(r.subTypeLabel || r.subType)}</span>` : ''}
                    ${r.isShared ? `<span class="category-badge" style="background:#7c3aed22;color:#7c3aed;">👥 Zespołowy</span>` : ''}
                    <span>📅 Wykonano: <strong>${formatDate(r.lastExecutedAt || r.updatedAt)}</strong></span>
                    ${execActorName ? `<span>👤 Wykonał: <strong>${escHtml(execActorName)}</strong></span>` : (creatorName ? `<span>👤 Utworzył: <strong>${escHtml(creatorName)}</strong></span>` : '')}
                </div>
                ${historyTimelineHtml}
            </div>
            <div class="reminder-actions" style="margin-left:12px;">
                <button class="btn-icon" title="Pokaż szczegóły i pełną historię" data-action="details" data-id="${r.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button class="btn-icon" title="Wyślij e-mail z historią" data-action="mail" data-id="${r.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="btn-icon text-danger" title="Usuń z historii" data-action="delete" data-id="${r.id}" data-title="${escHtml(r.title)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

function exportCSV() {
    if (allCompleted.length === 0) {
        (window.showToast || window.TaskAlert?.showToast)?.('Brak danych do eksportu.', 'warning');
        return;
    }

    const headers = ['Tytuł', 'Kategoria', 'Podtyp', 'Data wykonania', 'Wykonane przez', 'Notatki'];
    const rows = allCompleted.map(r => {
        const historyList = r.history || [];
        const lastExec = historyList.slice().reverse().find(h => h.type === 'executed' || h.executedAt);
        const actor = lastExec?.byName || lastExec?.performedBy || (lastExec?.byEmail ? lastExec.byEmail.split('@')[0] : '');

        return [
            r.title || '',
            r.categoryName || '',
            r.subTypeLabel || r.subType || '',
            formatDate(r.lastExecutedAt || r.updatedAt),
            actor || '',
            (r.notes || r.description || '').replace(/"/g, '""')
        ];
    });

    const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskalert_historia_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    (window.showToast || window.TaskAlert?.showToast)?.('Eksport CSV pobrany.', 'success');
}
