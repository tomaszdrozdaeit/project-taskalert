// ============================================================
// SAMOCHODY MODULE — Alerty pojazdowe
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, deleteReminder, markAsExecuted, updateReminder, sendManualNotification } from '../db.js';

const CATEGORY_NAME = 'Samochody';
const ICON = '🚗';
let unsubscribe = null;
let allReminders = [];

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">${ICON} ${CATEGORY_NAME}</h1>
            <p class="page-subtitle">Polisy ubezpieczeniowe, przeglądy techniczne i inne terminy pojazdów</p>
        </div>

        <div class="filter-bar animate-in">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="search-samochody" placeholder="Szukaj po nazwie, rejestracji...">
            </div>
            <select class="filter-select" id="filter-status">
                <option value="all">Wszystkie statusy</option>
                <option value="overdue">🔴 Przeterminowane</option>
                <option value="danger">🟠 Do 14 dni</option>
                <option value="warning">🟡 Do 30 dni</option>
                <option value="ok">🟢 Powyżej 30 dni</option>
            </select>
            <select class="filter-select" id="filter-subtype">
                <option value="all">Wszystkie typy</option>
                <option value="polisa_oc">Polisa OC</option>
                <option value="polisa_ac">Polisa AC</option>
                <option value="przeglad">Przegląd techniczny</option>
                <option value="custom">Inne</option>
            </select>
            <button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Dodaj</span>
            </button>
        </div>

        <div class="reminder-list" id="reminders-list">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export function init() {
    unsubscribe = onRemindersChange((reminders) => {
        allReminders = reminders.filter(r => r.categoryName === CATEGORY_NAME);
        renderList();
    }, 'active');

    // Search & filter
    const searchInput = document.getElementById('search-samochody');
    const filterStatus = document.getElementById('filter-status');
    const filterSubtype = document.getElementById('filter-subtype');

    if (searchInput) searchInput.addEventListener('input', renderList);
    if (filterStatus) filterStatus.addEventListener('change', renderList);
    if (filterSubtype) filterSubtype.addEventListener('change', renderList);

    return () => {
        if (unsubscribe) unsubscribe();
    };
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

function escHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function getStatusClass(dl) {
    if (dl < 0) return 'status-overdue';
    if (dl <= 14) return 'status-danger';
    if (dl <= 30) return 'status-warning';
    return 'status-ok';
}

function getCountdownClass(dl) {
    if (dl <= 14) return 'countdown-danger';
    if (dl <= 30) return 'countdown-warning';
    return 'countdown-ok';
}

function getCountdownText(dl) {
    if (dl < 0) return `${Math.abs(dl)} dni temu!`;
    if (dl === 0) return 'Dziś!';
    if (dl === 1) return 'Jutro!';
    return `za ${dl} dni`;
}

function getStatusKey(dl) {
    if (dl < 0) return 'overdue';
    if (dl <= 14) return 'danger';
    if (dl <= 30) return 'warning';
    return 'ok';
}

function renderList() {
    const listEl = document.getElementById('reminders-list');
    if (!listEl) return;

    const searchVal = (document.getElementById('search-samochody')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filter-status')?.value || 'all';
    const subtypeFilter = document.getElementById('filter-subtype')?.value || 'all';

    let filtered = allReminders.map(r => ({ ...r, daysLeft: daysUntil(r.expiryDate) }));

    if (searchVal) {
        filtered = filtered.filter(r => r.title.toLowerCase().includes(searchVal) || (r.notes || '').toLowerCase().includes(searchVal));
    }
    if (statusFilter !== 'all') {
        filtered = filtered.filter(r => getStatusKey(r.daysLeft) === statusFilter);
    }
    if (subtypeFilter !== 'all') {
        filtered = filtered.filter(r => r.subType === subtypeFilter);
    }

    filtered.sort((a, b) => a.daysLeft - b.daysLeft);

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${ICON}</div>
                <div class="empty-state-title">${searchVal || statusFilter !== 'all' || subtypeFilter !== 'all' ? 'Brak wyników' : 'Brak przypomnień'}</div>
                <p class="empty-state-text">${searchVal || statusFilter !== 'all' || subtypeFilter !== 'all'
                    ? 'Zmień kryteria wyszukiwania lub filtrowania.'
                    : 'Dodaj swoje pierwsze przypomnienie dotyczące pojazdu.'}</p>
                ${!searchVal && statusFilter === 'all' && subtypeFilter === 'all'
                    ? '<button class="btn btn-primary" onclick="window.TaskAlert.showAddReminderModal()">Dodaj przypomnienie</button>'
                    : ''}
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
                    <span class="category-badge" style="background:rgba(79,140,255,0.1);color:#4f8cff">${escHtml(r.subTypeLabel || r.subType)}</span>
                    <span>📅 ${formatDate(r.expiryDate)}</span>
                    ${alertChips}
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill ${fillCls}" style="width:${pct}%"></div>
                </div>
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

// ── Action Handlers (global scope for onclick) ──────────
window.handleDelete = async (id, title) => {
    const confirmed = await window.TaskAlert.showConfirm(
        `Czy na pewno chcesz usunąć przypomnienie "${title}"?`,
        'Usunięcie przypomnienia',
        { type: 'danger', confirmText: 'Usuń' }
    );
    if (confirmed) {
        try {
            await deleteReminder(id);
            window.TaskAlert.showToast('Przypomnienie usunięte.', 'success');
        } catch (err) {
            window.TaskAlert.showToast('Błąd usuwania: ' + err.message, 'error');
        }
    }
};

window.handleExecute = async (id) => {
    const reminder = allReminders.find(r => r.id === id);
    if (!reminder) return;

    const today = new Date().toISOString().split('T')[0];
    let nextDateDefault = '';
    if (reminder.recurrenceMonths > 0) {
        const exp = reminder.expiryDate?.toDate ? reminder.expiryDate.toDate() : new Date(reminder.expiryDate);
        const next = new Date(exp);
        next.setMonth(next.getMonth() + reminder.recurrenceMonths);
        nextDateDefault = next.toISOString().split('T')[0];
    }

    window.TaskAlert.showModal({
        title: 'Oznacz jako wykonane',
        body: `
            <p style="color:var(--text-secondary);margin-bottom:16px;">Zapisz datę wykonania i ewentualnie ustaw następny termin.</p>
            <div class="form-group">
                <label for="exec-date">Data wykonania *</label>
                <input type="date" id="exec-date" value="${today}" required>
            </div>
            ${reminder.recurrenceMonths > 0 ? `
            <div class="form-group">
                <label for="exec-next">Następna data wygaśnięcia</label>
                <input type="date" id="exec-next" value="${nextDateDefault}">
                <small style="color:var(--text-muted);font-size:0.78rem;">Auto-kalkulacja: +${reminder.recurrenceMonths} mies. od poprzedniej daty</small>
            </div>` : `
            <div class="form-group">
                <label for="exec-next">Następna data (opcj. — zostaw puste aby zamknąć)</label>
                <input type="date" id="exec-next" value="">
            </div>`}
            <div class="form-group">
                <label for="exec-note">Notatka (opcjonalna)</label>
                <textarea id="exec-note" placeholder="np. Odnowiono w PZU, nr polisy..."></textarea>
            </div>`,
        footer: `
            <button class="btn btn-secondary" onclick="window.TaskAlert.closeModal()">Anuluj</button>
            <button class="btn btn-success" id="exec-save-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>Zapisz</span>
            </button>`,
        onOpen: (body, footer) => {
            footer.querySelector('#exec-save-btn').addEventListener('click', async () => {
                const execDate = body.querySelector('#exec-date').value;
                const nextDate = body.querySelector('#exec-next').value;
                const note = body.querySelector('#exec-note').value.trim();

                if (!execDate) {
                    window.TaskAlert.showToast('Podaj datę wykonania.', 'warning');
                    return;
                }

                const saveBtn = footer.querySelector('#exec-save-btn');
                saveBtn.classList.add('loading');

                try {
                    await markAsExecuted(
                        id,
                        new Date(execDate),
                        nextDate ? new Date(nextDate) : null,
                        note
                    );
                    window.TaskAlert.showToast(nextDate ? 'Wykonano! Następny termin ustawiony.' : 'Wykonano i zamknięto.', 'success');
                    window.TaskAlert.closeModal();
                } catch (err) {
                    window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                } finally {
                    saveBtn.classList.remove('loading');
                }
            });
        }
    });
};

window.handleEdit = async (id) => {
    const { getCategories } = await import('../db.js');
    const reminder = allReminders.find(r => r.id === id);
    if (!reminder) return;

    const categories = await getCategories();
    const expDate = reminder.expiryDate?.toDate ? reminder.expiryDate.toDate() : new Date(reminder.expiryDate);
    const expStr = expDate.toISOString().split('T')[0];

    const catOptions = categories.map(c =>
        `<option value="${c.id}" ${reminder.categoryId === c.id ? 'selected' : ''}>${escHtml(c.icon || '📋')} ${escHtml(c.name)}</option>`
    ).join('');

    const alertChipsHtml = (reminder.alertDays || []).map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button">×</button></span>`
    ).join('');

    window.TaskAlert.showModal({
        title: 'Edytuj przypomnienie',
        body: `
            <div class="form-group">
                <label for="edit-title">Tytuł *</label>
                <input type="text" id="edit-title" value="${escHtml(reminder.title)}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="edit-category">Kategoria</label>
                    <select id="edit-category" class="filter-select w-full">${catOptions}</select>
                </div>
                <div class="form-group">
                    <label for="edit-subtype">Podtyp</label>
                    <input type="text" id="edit-subtype" value="${escHtml(reminder.subTypeLabel || reminder.subType)}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="edit-expiry">Data wygaśnięcia *</label>
                    <input type="date" id="edit-expiry" value="${expStr}" required>
                </div>
                <div class="form-group">
                    <label for="edit-recurrence">Interwał (miesiące)</label>
                    <input type="number" id="edit-recurrence" value="${reminder.recurrenceMonths || 0}" min="0">
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
                    <input type="email" id="edit-email1" value="${escHtml(reminder.primaryEmail)}">
                </div>
                <div class="form-group">
                    <label for="edit-email2">E-mail dodatkowy</label>
                    <input type="email" id="edit-email2" value="${escHtml(reminder.secondaryEmail)}">
                </div>
            </div>
            <div class="form-group">
                <label for="edit-notes">Notatki</label>
                <textarea id="edit-notes">${escHtml(reminder.notes)}</textarea>
            </div>`,
        footer: `
            <button class="btn btn-secondary" onclick="window.TaskAlert.closeModal()">Anuluj</button>
            <button class="btn btn-primary" id="edit-save-btn">Zapisz zmiany</button>`,
        onOpen: (body, footer) => {
            // Alert chip management
            const chipsContainer = body.querySelector('#edit-alert-chips');
            body.querySelector('#edit-alert-chip-btn').addEventListener('click', () => {
                const days = prompt('Ile dni przed terminem wysłać alert?');
                if (days && !isNaN(days) && parseInt(days) > 0) {
                    const chip = document.createElement('span');
                    chip.className = 'alert-chip';
                    chip.dataset.days = parseInt(days);
                    chip.innerHTML = `${parseInt(days)} dni <button class="chip-remove" type="button">×</button>`;
                    chipsContainer.insertBefore(chip, body.querySelector('#edit-alert-chip-btn'));
                }
            });
            chipsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-remove')) e.target.closest('.alert-chip').remove();
            });

            // Save
            footer.querySelector('#edit-save-btn').addEventListener('click', async () => {
                const title = body.querySelector('#edit-title').value.trim();
                const expiry = body.querySelector('#edit-expiry').value;
                if (!title || !expiry) { window.TaskAlert.showToast('Uzupełnij wymagane pola.', 'warning'); return; }

                const chips = chipsContainer.querySelectorAll('.alert-chip');
                const alertDays = Array.from(chips).map(c => parseInt(c.dataset.days)).filter(d => d > 0);
                alertDays.sort((a, b) => b - a);

                const cat = categories.find(c => c.id === body.querySelector('#edit-category').value);

                const saveBtn = footer.querySelector('#edit-save-btn');
                saveBtn.classList.add('loading');

                try {
                    await updateReminder(id, {
                        title,
                        categoryId: body.querySelector('#edit-category').value,
                        categoryName: cat?.name || '',
                        subTypeLabel: body.querySelector('#edit-subtype').value.trim(),
                        expiryDate: new Date(expiry),
                        recurrenceMonths: parseInt(body.querySelector('#edit-recurrence').value) || 0,
                        alertDays,
                        primaryEmail: body.querySelector('#edit-email1').value.trim(),
                        secondaryEmail: body.querySelector('#edit-email2').value.trim(),
                        notes: body.querySelector('#edit-notes').value.trim()
                    });
                    window.TaskAlert.showToast('Zmiany zapisane.', 'success');
                    window.TaskAlert.closeModal();
                } catch (err) {
                    window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                } finally {
                    saveBtn.classList.remove('loading');
                }
            });
        }
    });
};

window.handleSendNotification = async (id) => {
    const reminder = allReminders.find(r => r.id === id);
    if (!reminder) return;

    if (!reminder.primaryEmail) {
        window.TaskAlert.showToast('Brak adresu e-mail w tym przypomnieniu.', 'warning');
        return;
    }

    const confirmed = await window.TaskAlert.showConfirm(
        `Wysłać powiadomienie e-mail do: ${reminder.primaryEmail}${reminder.secondaryEmail ? ' i ' + reminder.secondaryEmail : ''}?`,
        'Wyślij powiadomienie'
    );

    if (confirmed) {
        try {
            await sendManualNotification(reminder);
            window.TaskAlert.showToast('Powiadomienie e-mail wysłane!', 'success');
        } catch (err) {
            window.TaskAlert.showToast('Błąd wysyłki: ' + err.message, 'error');
        }
    }
};
