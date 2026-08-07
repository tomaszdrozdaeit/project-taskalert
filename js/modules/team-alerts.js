// ============================================================
// TEAM ALERTS MODULE — Alerty współdzielone (multi-user)
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import {
    onSharedAlertsChange, addSharedAlert, updateSharedAlert, deleteSharedAlert,
    getSharedAlert, getCategories, getAllowedUsers
} from '../db.js';
import { currentUser } from '../auth.js';

let unsubscribe = null;
let currentTab = 'all'; // 'all' | 'owner' | 'executor' | 'observer'

function escHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function daysUntil(date) {
    if (!date) return Infinity;
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    const now = new Date(); now.setHours(0,0,0,0);
    const target = new Date(date); target.setHours(0,0,0,0);
    return Math.ceil((target - now) / (1000*60*60*24));
}

function formatDate(date) {
    if (!date) return '—';
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getStatusClass(days) {
    if (days < 0) return 'status-overdue';
    if (days <= 14) return 'status-danger';
    if (days <= 30) return 'status-warning';
    return 'status-ok';
}

function getCountdownText(days) {
    if (days < 0) return `${Math.abs(days)} dni temu!`;
    if (days === 0) return 'Dziś!';
    if (days === 1) return 'Jutro!';
    return `za ${days} dni`;
}

function getCountdownClass(days) {
    if (days < 0) return 'countdown-danger';
    if (days <= 14) return 'countdown-danger';
    if (days <= 30) return 'countdown-warning';
    return 'countdown-ok';
}

const ROLE_BADGES = {
    'owner':    { label: 'Właściciel', icon: '👑', color: '#f59e0b' },
    'executor': { label: 'Wykonawca', icon: '🔧', color: '#4f8cff' },
    'observer': { label: 'Obserwator', icon: '👁️', color: '#7c3aed' }
};

function getStatusKey(days) {
    if (days < 0) return 'overdue';
    if (days <= 14) return 'danger';
    if (days <= 30) return 'warning';
    return 'ok';
}

export function render() {
    return `
        <div class="page-header page-header-flex animate-in">
            <div>
                <h1 class="page-title">👥 Alerty zespołowe</h1>
                <p class="page-subtitle">Współdzielone alerty i zadania — zarządzaj alertami swojego zespołu</p>
            </div>
            <div class="page-header-actions">
                <button class="icon-btn-action" id="filter-toggle-team" title="Szukaj i filtruj" aria-label="Szukaj i filtruj" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button class="btn btn-primary" id="add-team-alert-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>Nowy alert zespołowy</span>
                </button>
            </div>
        </div>

        <div class="filter-bar animate-in" id="filter-bar-team">
            <div class="search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="team-search" placeholder="Szukaj po nazwie, kategorii, osobie...">
            </div>
            <select id="team-status-filter" class="filter-select">
                <option value="all">Wszystkie statusy</option>
                <option value="overdue">🔴 Przeterminowane</option>
                <option value="danger">🟠 Do 14 dni</option>
                <option value="warning">🟡 Do 30 dni</option>
                <option value="ok">🟢 Powyżej 30 dni</option>
            </select>
        </div>

        <div class="card animate-in" style="margin-bottom:20px;">
            <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
                <div class="tab-bar" id="team-tabs">
                    <button class="tab-btn active" data-tab="all">Wszystkie</button>
                    <button class="tab-btn" data-tab="owner">👑 Moje zlecone</button>
                    <button class="tab-btn" data-tab="executor">🔧 Zlecone mi</button>
                    <button class="tab-btn" data-tab="observer">👁️ Obserwowane</button>
                </div>
            </div>

            <div id="team-alerts-list">
                <div class="page-loader"><div class="spinner"></div></div>
            </div>

            <div id="team-stats" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color);font-size:0.82rem;color:var(--text-muted);"></div>
        </div>`;
}

export function init() {
    const tabBar = document.getElementById('team-tabs');
    const searchInput = document.getElementById('team-search');
    const statusFilter = document.getElementById('team-status-filter');
    const addBtn = document.getElementById('add-team-alert-btn');

    let allAlerts = [];

    if (tabBar) {
        tabBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            currentTab = btn.dataset.tab;
            tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFiltered();
        });
    }

    if (addBtn) addBtn.addEventListener('click', () => showAddTeamAlertModal());

    // Mobile filter toggle
    const filterToggle = document.getElementById('filter-toggle-team');
    const filterBar = document.getElementById('filter-bar-team');
    if (filterToggle && filterBar) {
        filterToggle.addEventListener('click', () => {
            filterBar.classList.toggle('filter-bar-expanded');
            filterToggle.classList.toggle('active');
        });
    }

    const renderFiltered = () => {
        const query = (searchInput?.value || '').trim().toLowerCase();
        const statusVal = statusFilter?.value || 'all';
        const uid = currentUser?.uid;

        let filtered = allAlerts;

        if (currentTab !== 'all') {
            const userEmail = currentUser?.email?.toLowerCase() || '';
            filtered = filtered.filter(a => {
                const p = (a.participants || []).find(p => p.uid === uid || (p.email || '').toLowerCase() === userEmail);
                return p && p.role === currentTab;
            });
        }

        if (statusVal !== 'all') {
            filtered = filtered.filter(a => getStatusKey(daysUntil(a.expiryDate)) === statusVal);
        }

        if (query) {
            filtered = filtered.filter(a =>
                (a.title || '').toLowerCase().includes(query) ||
                (a.categoryName || '').toLowerCase().includes(query) ||
                (a.participants || []).some(p =>
                    (p.name || '').toLowerCase().includes(query) ||
                    (p.email || '').toLowerCase().includes(query)
                )
            );
        }

        renderAlertsList(filtered, allAlerts.length);
    };

    if (searchInput) searchInput.addEventListener('input', renderFiltered);
    if (statusFilter) statusFilter.addEventListener('change', renderFiltered);

    unsubscribe = onSharedAlertsChange((alerts) => {
        allAlerts = alerts;
        renderFiltered();
    });

    document.getElementById('team-alerts-list').addEventListener('click', (e) => {
        const card = e.target.closest('.reminder-card');
        if (card && card.dataset.id) {
            showTeamAlertDetails(card.dataset.id);
        }
    });

    return () => {
        if (unsubscribe) unsubscribe();
    };
}

export function refresh() {}

function renderAlertsList(alerts, totalCount) {
    const container = document.getElementById('team-alerts-list');
    const statsEl = document.getElementById('team-stats');
    if (!container) return;

    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <div class="empty-state-title">Brak alertów zespołowych</div>
                <p class="empty-state-text">Utwórz nowy alert zespołowy i przypisz go do członków zespołu.</p>
            </div>`;
        if (statsEl) statsEl.textContent = '';
        return;
    }

    const uid = currentUser?.uid;
    const userEmail = currentUser?.email?.toLowerCase() || '';

    container.innerHTML = alerts.map(alert => {
        const days = daysUntil(alert.expiryDate);
        const status = getStatusClass(days);
        const countdown = getCountdownText(days);
        const countdownCls = getCountdownClass(days);
        const myRole = (alert.participants || []).find(p => p.uid === uid || (p.email || '').toLowerCase() === userEmail)?.role || 'executor';
        const roleInfo = ROLE_BADGES[myRole] || ROLE_BADGES.executor;

        const participantsChips = (alert.participants || []).slice(0, 4).map(p => {
            const pRole = ROLE_BADGES[p.role] || ROLE_BADGES.executor;
            return `<span class="participant-chip" title="${escHtml(p.email)} (${pRole.label})">${pRole.icon} ${escHtml(p.name || p.email.split('@')[0])}</span>`;
        }).join('');

        const moreCount = (alert.participants || []).length - 4;
        const moreChip = moreCount > 0 ? `<span class="participant-chip" style="opacity:0.7;">+${moreCount}</span>` : '';

        return `
            <div class="reminder-card" data-id="${alert.id}" style="cursor:pointer;">
                <div class="reminder-status ${status}"></div>
                <div class="reminder-info" style="flex:1;">
                    <div class="reminder-title">${escHtml(alert.title)}</div>
                    <div class="reminder-meta" style="gap:8px;flex-wrap:wrap;">
                        <span class="category-badge">${escHtml(alert.categoryName || 'Inne')}</span>
                        <span style="font-size:0.82rem;color:var(--text-muted);">📅 ${formatDate(alert.expiryDate)}</span>
                        <span class="category-badge" style="background:${roleInfo.color}22;color:${roleInfo.color};font-size:0.75rem;">
                            ${roleInfo.icon} ${roleInfo.label}
                        </span>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
                        ${participantsChips}${moreChip}
                    </div>
                </div>
                <div class="reminder-countdown ${countdownCls}">${countdown}</div>
            </div>`;
    }).join('');

    if (statsEl) {
        statsEl.textContent = `Wyświetlono ${alerts.length} z ${totalCount} alertów zespołowych`;
    }
}

async function showAddTeamAlertModal() {
    const categories = await getCategories();
    const allowedUsers = await getAllowedUsers();
    const uid = currentUser?.uid;
    const currentName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '';

    let selectedParticipants = [{
        uid: uid,
        email: currentUser.email,
        name: currentName,
        role: 'owner'
    }];

    const categoryOptions = categories.map(c =>
        `<option value="${c.id}">${escHtml(c.icon || '📋')} ${escHtml(c.name)}</option>`
    ).join('');

    window.TaskAlert.showModal({
        title: '👥 Nowy alert zespołowy',
        wide: true,
        body: `
            <div class="form-group">
                <label for="team-title">Tytuł *</label>
                <input type="text" id="team-title" placeholder="np. Przegląd wózka widłowego" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="team-category">Kategoria *</label>
                    <select id="team-category" class="filter-select w-full">${categoryOptions}</select>
                </div>
                <div class="form-group">
                    <label for="team-expiry">Data wygaśnięcia *</label>
                    <input type="date" id="team-expiry" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="team-recurrence">Interwał powtarzania (mies.)</label>
                    <input type="number" id="team-recurrence" value="0" min="0" max="120">
                </div>
                <div class="form-group">
                    <label for="team-notes">Notatki</label>
                    <textarea id="team-notes" placeholder="Dodatkowe informacje..."></textarea>
                </div>
            </div>

            <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:12px;">👥 Uczestnicy</h4>
                <div id="team-participants-list" style="margin-bottom:12px;"></div>
                <div class="form-row" style="align-items:flex-end;">
                    <div class="form-group" style="flex:2;">
                        <label for="team-add-user">Dodaj osobę</label>
                        <select id="team-add-user" class="filter-select w-full">
                            <option value="">— Wybierz użytkownika —</option>
                            ${allowedUsers.filter(u => u.isActive !== false && u.email !== currentUser.email).map(u =>
                                `<option value="${escHtml(u.email)}" data-uid="${escHtml(u.uid || '')}" data-name="${escHtml(u.name || '')}">${escHtml(u.name || u.email)} (${escHtml(u.email)})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label for="team-add-role">Rola</label>
                        <select id="team-add-role" class="filter-select w-full">
                            <option value="executor">🔧 Wykonawca</option>
                            <option value="observer">👁️ Obserwator</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" id="team-add-participant-btn" type="button" style="height:42px;">Dodaj</button>
                </div>
            </div>`,
        footer: `
            <button class="btn btn-secondary" id="modal-cancel-btn">Anuluj</button>
            <button class="btn btn-primary" id="modal-save-btn">Utwórz alert</button>`,
        onOpen: (body, footer) => {
            const participantsContainer = body.querySelector('#team-participants-list');

            const renderParticipants = () => {
                participantsContainer.innerHTML = selectedParticipants.map(p => {
                    const roleInfo = ROLE_BADGES[p.role] || ROLE_BADGES.executor;
                    const isMe = p.uid === uid;
                    return `
                        <div class="participant-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-card-hover);border-radius:8px;margin-bottom:6px;">
                            <span style="flex:1;font-size:0.88rem;">${escHtml(p.name || p.email)} <span style="color:var(--text-muted);font-size:0.78rem;">(${escHtml(p.email)})</span></span>
                            <span class="category-badge" style="background:${roleInfo.color}22;color:${roleInfo.color};font-size:0.72rem;padding:2px 6px;">${roleInfo.icon} ${roleInfo.label}</span>
                            ${!isMe ? `<button class="chip-remove" type="button" data-uid="${p.uid}" style="cursor:pointer;border:none;background:none;font-size:1.1rem;color:var(--text-muted);">×</button>` : ''}
                        </div>`;
                }).join('');

                // Remove handlers
                participantsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        selectedParticipants = selectedParticipants.filter(p => p.uid !== btn.dataset.uid);
                        renderParticipants();
                    });
                });
            };
            renderParticipants();

            // Add participant
            body.querySelector('#team-add-participant-btn').addEventListener('click', () => {
                const select = body.querySelector('#team-add-user');
                const roleSelect = body.querySelector('#team-add-role');
                const email = select.value;
                if (!email) { window.TaskAlert.showToast('Wybierz użytkownika.', 'warning'); return; }

                const option = select.options[select.selectedIndex];
                const name = option.dataset.name || email.split('@')[0];
                // UID might not be available from allowedUsers — use email as fallback
                const pUid = option.dataset.uid || email;

                if (selectedParticipants.some(p => p.email === email)) {
                    window.TaskAlert.showToast('Użytkownik jest już dodany.', 'warning');
                    return;
                }

                selectedParticipants.push({
                    uid: pUid,
                    email: email,
                    name: name,
                    role: roleSelect.value
                });
                select.value = '';
                renderParticipants();
            });

            footer.querySelector('#modal-cancel-btn').addEventListener('click', window.TaskAlert.closeModal);
            footer.querySelector('#modal-save-btn').addEventListener('click', async () => {
                const title = body.querySelector('#team-title').value.trim();
                const categoryId = body.querySelector('#team-category').value;
                const expiryStr = body.querySelector('#team-expiry').value;
                const recurrence = parseInt(body.querySelector('#team-recurrence').value) || 0;
                const notes = body.querySelector('#team-notes').value.trim();

                if (!title) { window.TaskAlert.showToast('Podaj tytuł.', 'warning'); return; }
                if (!expiryStr) { window.TaskAlert.showToast('Podaj datę wygaśnięcia.', 'warning'); return; }

                const cat = categories.find(c => c.id === categoryId);
                const btn = footer.querySelector('#modal-save-btn');
                btn.classList.add('loading');

                const executorObj = selectedParticipants.find(p => p.role === 'executor') || selectedParticipants[0];
                const ownerObj = selectedParticipants.find(p => p.role === 'owner') || selectedParticipants[1];

                try {
                    await addSharedAlert({
                        title,
                        categoryId,
                        categoryName: cat?.name || '',
                        expiryDate: new Date(expiryStr),
                        recurrenceMonths: recurrence,
                        notes,
                        description: notes,
                        primaryEmail: executorObj?.email || '',
                        secondaryEmail: ownerObj?.email || '',
                        createdByName: currentName,
                        participants: selectedParticipants
                    });
                    window.TaskAlert.showToast('Alert zespołowy utworzony!', 'success');
                    window.TaskAlert.closeModal();
                } catch (err) {
                    window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                } finally {
                    btn.classList.remove('loading');
                }
            });
        }
    });
}

async function showTeamAlertDetails(alertId) {
    const alert = await getSharedAlert(alertId);
    if (!alert) {
        window.TaskAlert.showToast('Alert nie znaleziony.', 'error');
        return;
    }

    const days = daysUntil(alert.expiryDate);
    const countdownCls = getCountdownClass(days);
    const countdownText = getCountdownText(days);
    const uid = currentUser?.uid;
    const userEmail = currentUser?.email?.toLowerCase() || '';
    const myRole = (alert.participants || []).find(p => p.uid === uid || (p.email || '').toLowerCase() === userEmail)?.role || 'executor';
    const canEdit = myRole === 'owner' || myRole === 'observer';
    const canDelete = myRole === 'owner';

    const participantsHtml = (alert.participants || []).map(p => {
        const roleInfo = ROLE_BADGES[p.role] || ROLE_BADGES.executor;
        return `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-card-hover);border-radius:8px;margin-bottom:4px;">
                <span style="flex:1;font-size:0.85rem;">${escHtml(p.name || p.email)}</span>
                <span style="font-size:0.78rem;color:var(--text-muted);">${escHtml(p.email)}</span>
                <span class="category-badge" style="background:${roleInfo.color}22;color:${roleInfo.color};font-size:0.72rem;padding:2px 6px;">${roleInfo.icon} ${roleInfo.label}</span>
            </div>`;
    }).join('');

    const expiryIso = alert.expiryDate?.toDate
        ? alert.expiryDate.toDate().toISOString().split('T')[0]
        : (typeof alert.expiryDate === 'string' ? alert.expiryDate.split('T')[0] : '');

    window.TaskAlert.showModal({
        title: `👥 ${alert.title}`,
        wide: true,
        body: `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding:12px 16px;border-radius:10px;background:var(--bg-card-hover);">
                <div>
                    <span class="category-badge">${escHtml(alert.categoryName || 'Inne')}</span>
                    <span style="font-size:0.82rem;color:var(--text-muted);margin-left:8px;">Utworzył: ${escHtml(alert.createdByName || '—')}</span>
                </div>
                <div class="reminder-countdown ${countdownCls}">${countdownText}</div>
            </div>

            ${canEdit ? `
            <div class="form-group">
                <label for="team-edit-title">Tytuł</label>
                <input type="text" id="team-edit-title" value="${escHtml(alert.title)}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="team-edit-expiry">Data wygaśnięcia</label>
                    <input type="date" id="team-edit-expiry" value="${expiryIso}">
                </div>
                <div class="form-group">
                    <label for="team-edit-notes">Notatki</label>
                    <textarea id="team-edit-notes">${escHtml(alert.notes || '')}</textarea>
                </div>
            </div>` : `
            <p style="color:var(--text-secondary);margin-bottom:8px;"><strong>Notatki:</strong> ${escHtml(alert.notes || 'Brak')}</p>
            `}

            <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">👥 Uczestnicy (${(alert.participants || []).length})</h4>
                ${participantsHtml}
            </div>`,
        footer: `
            <div style="display:flex;align-items:center;gap:8px;width:100%;justify-content:space-between;">
                ${canDelete ? '<button class="btn btn-ghost text-danger" id="team-delete-btn">🗑️ Usuń</button>' : '<div></div>'}
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" id="team-close-btn">Zamknij</button>
                    ${canEdit ? '<button class="btn btn-primary" id="team-save-btn">💾 Zapisz</button>' : ''}
                </div>
            </div>`,
        onOpen: (body, footer) => {
            footer.querySelector('#team-close-btn').addEventListener('click', window.TaskAlert.closeModal);

            if (canEdit) {
                footer.querySelector('#team-save-btn')?.addEventListener('click', async () => {
                    const title = body.querySelector('#team-edit-title').value.trim();
                    const expiryStr = body.querySelector('#team-edit-expiry').value;
                    const notes = body.querySelector('#team-edit-notes').value.trim();

                    const btn = footer.querySelector('#team-save-btn');
                    btn.classList.add('loading');
                    try {
                        const updateData = { title, notes };
                        if (expiryStr) updateData.expiryDate = new Date(expiryStr);
                        await updateSharedAlert(alert.id, updateData);
                        window.TaskAlert.showToast('Alert zespołowy zaktualizowany.', 'success');
                        window.TaskAlert.closeModal();
                    } catch (err) {
                        window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                    } finally {
                        btn.classList.remove('loading');
                    }
                });
            }

            if (canDelete) {
                footer.querySelector('#team-delete-btn')?.addEventListener('click', async () => {
                    const confirmed = await window.TaskAlert.showConfirm(
                        `Usunąć alert zespołowy "${alert.title}"?`,
                        'Usuń alert',
                        { type: 'danger', confirmText: 'Usuń' }
                    );
                    if (confirmed) {
                        try {
                            await deleteSharedAlert(alert.id);
                            window.TaskAlert.showToast('Alert zespołowy usunięty.', 'success');
                            window.TaskAlert.closeModal();
                        } catch (err) {
                            window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                        }
                    }
                });
            }
        }
    });
}
