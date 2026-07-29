// ============================================================
// ADMIN USERS MODULE — Panel zarządzania użytkownikami
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onAllowedUsersChange, addAllowedUser, updateAllowedUser, deleteAllowedUser } from '../db.js';
import { SUPER_ADMIN_EMAIL } from '../auth.js';

let unsubscribe = null;

function escHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

const ROLE_LABELS = {
    'super-admin': { label: 'Super Admin', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    'admin':       { label: 'Administrator', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
    'user':        { label: 'Użytkownik', color: '#4f8cff', bg: 'rgba(79,140,255,0.12)' }
};

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">👥 Użytkownicy</h1>
            <p class="page-subtitle">Zarządzanie dostępem do aplikacji — dodawaj, edytuj i dezaktywuj konta</p>
        </div>

        <div class="card animate-in" style="margin-bottom:20px;">
            <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <h2 class="section-title">
                    <span class="section-icon">🔐</span>
                    Lista autoryzowanych użytkowników
                </h2>
                <button class="btn btn-primary" id="add-user-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>Dodaj użytkownika</span>
                </button>
            </div>

            <div class="filter-bar" style="margin-bottom:16px;">
                <input type="text" id="user-search" placeholder="🔍 Szukaj po nazwie lub e-mail..." class="search-input" style="flex:1;">
                <select id="user-role-filter" class="filter-select">
                    <option value="all">Wszystkie role</option>
                    <option value="super-admin">Super Admin</option>
                    <option value="admin">Administrator</option>
                    <option value="user">Użytkownik</option>
                </select>
            </div>

            <div id="users-list">
                <div class="page-loader"><div class="spinner"></div></div>
            </div>

            <div id="users-stats" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color);font-size:0.82rem;color:var(--text-muted);"></div>
        </div>`;
}

export function init() {
    const addBtn = document.getElementById('add-user-btn');
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');

    // Sprawdź czy użytkownik ma uprawnienia admin
    const userRole = window._taskAlertUserRole;
    if (userRole !== 'admin' && userRole !== 'super-admin') {
        document.getElementById('users-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔒</div>
                <div class="empty-state-title">Brak uprawnień</div>
                <p class="empty-state-text">Tylko administratorzy mogą zarządzać listą użytkowników.</p>
            </div>`;
        if (addBtn) addBtn.style.display = 'none';
        return;
    }

    addBtn.addEventListener('click', () => showAddUserModal());

    let allUsers = [];

    const renderFiltered = () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        const roleVal = roleFilter.value;

        let filtered = allUsers;
        if (query) {
            filtered = filtered.filter(u =>
                (u.name || '').toLowerCase().includes(query) ||
                (u.email || '').toLowerCase().includes(query)
            );
        }
        if (roleVal !== 'all') {
            filtered = filtered.filter(u => u.role === roleVal);
        }

        renderUsersList(filtered, allUsers.length);
    };

    searchInput.addEventListener('input', renderFiltered);
    roleFilter.addEventListener('change', renderFiltered);

    unsubscribe = onAllowedUsersChange((users) => {
        allUsers = users;
        renderFiltered();
    });

    // Delegated click handler
    document.getElementById('users-list').addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-action="edit"]');
        const toggleBtn = e.target.closest('[data-action="toggle"]');
        const deleteBtn = e.target.closest('[data-action="delete"]');

        if (editBtn) {
            const email = editBtn.dataset.email;
            const user = allUsers.find(u => u.email === email);
            if (user) showEditUserModal(user);
        }
        if (toggleBtn) {
            const email = toggleBtn.dataset.email;
            const user = allUsers.find(u => u.email === email);
            if (user) toggleUserActive(user);
        }
        if (deleteBtn) {
            const email = deleteBtn.dataset.email;
            const user = allUsers.find(u => u.email === email);
            if (user) confirmDeleteUser(user);
        }
    });

    return () => {
        if (unsubscribe) unsubscribe();
    };
}

export function refresh() {}

function renderUsersList(users, totalCount) {
    const container = document.getElementById('users-list');
    const statsEl = document.getElementById('users-stats');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👤</div>
                <div class="empty-state-title">Brak użytkowników</div>
                <p class="empty-state-text">Dodaj pierwszego użytkownika klikając przycisk "Dodaj użytkownika".</p>
            </div>`;
        if (statsEl) statsEl.textContent = '';
        return;
    }

    container.innerHTML = users.map(user => {
        const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.user;
        const isSuperAdmin = user.role === 'super-admin';
        const isActive = user.isActive !== false;
        const statusDot = isActive
            ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>'
            : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;"></span>';
        const statusText = isActive ? 'Aktywny' : 'Zablokowany';

        return `
            <div class="reminder-card" style="cursor:default;">
                <div class="reminder-status ${isActive ? 'status-ok' : 'status-overdue'}"></div>
                <div class="reminder-info" style="flex:1;">
                    <div class="reminder-title">${escHtml(user.name || user.email)}</div>
                    <div class="reminder-meta" style="gap:8px;">
                        <span style="font-size:0.82rem;color:var(--text-muted);">📧 ${escHtml(user.email)}</span>
                        <span class="category-badge" style="background:${roleInfo.bg};color:${roleInfo.color};font-size:0.75rem;padding:2px 8px;">
                            ${roleInfo.label}
                        </span>
                        <span style="display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);">
                            ${statusDot} ${statusText}
                        </span>
                        ${isSuperAdmin ? '<span style="font-size:0.75rem;color:#ef4444;font-weight:700;">🛡️ Chroniony</span>' : ''}
                    </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    ${!isSuperAdmin ? `
                        <button class="btn-icon" data-action="toggle" data-email="${escHtml(user.email)}" title="${isActive ? 'Zablokuj' : 'Odblokuj'}" style="font-size:1.1rem;">
                            ${isActive ? '🔒' : '🔓'}
                        </button>
                    ` : ''}
                    <button class="btn-icon" data-action="edit" data-email="${escHtml(user.email)}" title="Edytuj" style="font-size:1.1rem;">✏️</button>
                    ${!isSuperAdmin ? `
                        <button class="btn-icon" data-action="delete" data-email="${escHtml(user.email)}" title="Usuń" style="font-size:1.1rem;color:var(--status-danger);">🗑️</button>
                    ` : ''}
                </div>
            </div>`;
    }).join('');

    if (statsEl) {
        const active = users.filter(u => u.isActive !== false).length;
        const blocked = users.length - active;
        statsEl.textContent = `Wyświetlono ${users.length} z ${totalCount} użytkowników • ${active} aktywnych • ${blocked} zablokowanych`;
    }
}

function showAddUserModal() {
    window.TaskAlert.showModal({
        title: '➕ Dodaj użytkownika',
        body: `
            <div class="form-group">
                <label for="new-user-email">Adres e-mail *</label>
                <input type="email" id="new-user-email" placeholder="email@example.com" required>
            </div>
            <div class="form-group">
                <label for="new-user-name">Imię i nazwisko</label>
                <input type="text" id="new-user-name" placeholder="Jan Kowalski">
            </div>
            <div class="form-group">
                <label for="new-user-role">Rola</label>
                <select id="new-user-role" class="filter-select w-full">
                    <option value="user" selected>Użytkownik</option>
                    <option value="admin">Administrator</option>
                </select>
            </div>`,
        footer: `
            <button class="btn btn-secondary" id="modal-cancel-btn">Anuluj</button>
            <button class="btn btn-primary" id="modal-save-btn">Dodaj</button>`,
        onOpen: (body, footer) => {
            footer.querySelector('#modal-cancel-btn').addEventListener('click', window.TaskAlert.closeModal);
            footer.querySelector('#modal-save-btn').addEventListener('click', async () => {
                const email = body.querySelector('#new-user-email').value.trim();
                const name = body.querySelector('#new-user-name').value.trim();
                const role = body.querySelector('#new-user-role').value;

                if (!email) { window.TaskAlert.showToast('Podaj adres e-mail.', 'warning'); return; }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    window.TaskAlert.showToast('Nieprawidłowy format e-mail.', 'warning');
                    return;
                }

                const btn = footer.querySelector('#modal-save-btn');
                btn.classList.add('loading');
                try {
                    await addAllowedUser({ email, name, role, isActive: true });
                    window.TaskAlert.showToast(`Użytkownik ${email} dodany.`, 'success');
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

function showEditUserModal(user) {
    const isSuperAdmin = user.role === 'super-admin';

    window.TaskAlert.showModal({
        title: `✏️ Edycja: ${user.name || user.email}`,
        body: `
            <div class="form-group">
                <label>Adres e-mail</label>
                <input type="email" value="${escHtml(user.email)}" disabled style="opacity:0.6;">
            </div>
            <div class="form-group">
                <label for="edit-user-name">Imię i nazwisko</label>
                <input type="text" id="edit-user-name" value="${escHtml(user.name || '')}">
            </div>
            <div class="form-group">
                <label for="edit-user-role">Rola</label>
                <select id="edit-user-role" class="filter-select w-full" ${isSuperAdmin ? 'disabled style="opacity:0.6;"' : ''}>
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>Użytkownik</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
                    ${isSuperAdmin ? `<option value="super-admin" selected>Super Admin</option>` : ''}
                </select>
                ${isSuperAdmin ? '<small style="color:var(--text-muted);font-size:0.78rem;">🛡️ Rola super-admina nie może być zmieniona.</small>' : ''}
            </div>`,
        footer: `
            <button class="btn btn-secondary" id="modal-cancel-btn">Anuluj</button>
            <button class="btn btn-primary" id="modal-save-btn">Zapisz</button>`,
        onOpen: (body, footer) => {
            footer.querySelector('#modal-cancel-btn').addEventListener('click', window.TaskAlert.closeModal);
            footer.querySelector('#modal-save-btn').addEventListener('click', async () => {
                const name = body.querySelector('#edit-user-name').value.trim();
                const role = isSuperAdmin ? 'super-admin' : body.querySelector('#edit-user-role').value;

                const btn = footer.querySelector('#modal-save-btn');
                btn.classList.add('loading');
                try {
                    await updateAllowedUser(user.email, { name, role });
                    window.TaskAlert.showToast('Dane użytkownika zaktualizowane.', 'success');
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

async function toggleUserActive(user) {
    const newState = user.isActive === false;
    const action = newState ? 'odblokować' : 'zablokować';

    const confirmed = await window.TaskAlert.showConfirm(
        `Czy na pewno chcesz ${action} użytkownika "${user.name || user.email}"?`,
        newState ? 'Odblokuj użytkownika' : 'Zablokuj użytkownika',
        { type: newState ? 'info' : 'warning', confirmText: newState ? 'Odblokuj' : 'Zablokuj' }
    );

    if (confirmed) {
        try {
            await updateAllowedUser(user.email, { isActive: newState });
            window.TaskAlert.showToast(
                `Użytkownik ${user.email} został ${newState ? 'odblokowany' : 'zablokowany'}.`,
                newState ? 'success' : 'warning'
            );
        } catch (err) {
            window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
        }
    }
}

async function confirmDeleteUser(user) {
    if (user.role === 'super-admin') {
        window.TaskAlert.showToast('Nie można usunąć konta super-administratora.', 'error');
        return;
    }

    const confirmed = await window.TaskAlert.showConfirm(
        `Czy na pewno chcesz usunąć użytkownika "${user.name || user.email}" z listy autoryzowanych?`,
        'Usuń użytkownika',
        { type: 'danger', confirmText: 'Usuń' }
    );

    if (confirmed) {
        try {
            await deleteAllowedUser(user.email);
            window.TaskAlert.showToast(`Użytkownik ${user.email} usunięty.`, 'success');
        } catch (err) {
            window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
        }
    }
}
