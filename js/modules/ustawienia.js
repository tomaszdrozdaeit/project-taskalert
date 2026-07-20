// ============================================================
// USTAWIENIA MODULE — Panel ustawień użytkownika
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { getUserProfile, updateUserProfile } from '../db.js';
import { currentUser } from '../auth.js';

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">⚙️ Ustawienia</h1>
            <p class="page-subtitle">Konfiguracja konta, domyślnych alertów i preferencji</p>
        </div>

        <div id="settings-content">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export async function init() {
    const profile = await getUserProfile();
    renderSettings(profile);
}

export function refresh() {}

function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function renderSettings(profile) {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const defaultAlertDays = profile?.defaultAlertDays || [30, 14];
    const alertChipsHtml = defaultAlertDays.map(d =>
        `<span class="alert-chip" data-days="${d}">${d} dni <button class="chip-remove" type="button">×</button></span>`
    ).join('');

    container.innerHTML = `
        <!-- Profil -->
        <div class="card animate-in" style="margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">👤 Profil użytkownika</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>Nazwa użytkownika</label>
                    <input type="text" id="set-name" value="${escHtml(profile?.displayName || currentUser?.displayName || '')}" placeholder="Jan Kowalski">
                </div>
                <div class="form-group">
                    <label>E-mail konta</label>
                    <input type="email" value="${escHtml(currentUser?.email || '')}" disabled style="opacity:0.6;">
                </div>
            </div>
        </div>

        <!-- Domyślne e-maile -->
        <div class="card animate-in" style="margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">📧 Domyślne adresy e-mail</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Te adresy będą automatycznie wpisywane przy dodawaniu nowych przypomnień.</p>
            <div class="form-row">
                <div class="form-group">
                    <label for="set-email1">E-mail główny</label>
                    <input type="email" id="set-email1" value="${escHtml(profile?.defaultPrimaryEmail || currentUser?.email || '')}" placeholder="email@example.com">
                </div>
                <div class="form-group">
                    <label for="set-email2">E-mail dodatkowy (kopia)</label>
                    <input type="email" id="set-email2" value="${escHtml(profile?.defaultSecondaryEmail || '')}" placeholder="kopia@example.com">
                </div>
            </div>
        </div>

        <!-- Domyślne alerty -->
        <div class="card animate-in" style="margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">🔔 Domyślne alerty</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Domyślne dni przed terminem, w których wysyłany jest alert e-mail. Możesz zmienić dla każdego przypomnienia osobno.</p>
            <div class="form-group">
                <label>Dni przed terminem</label>
                <div class="alert-chips" id="set-alert-chips">
                    ${alertChipsHtml}
                    <button class="alert-chip-add" type="button" id="set-add-alert-btn">+ Dodaj alert</button>
                </div>
            </div>
        </div>

        <!-- Motyw -->
        <div class="card animate-in" style="margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">🎨 Motyw aplikacji</h3>
            <div class="flex items-center gap-3">
                <div class="toggle-wrapper">
                    <input type="checkbox" class="toggle" id="set-dark-mode" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''}>
                    <label class="toggle-label" for="set-dark-mode">Tryb ciemny</label>
                </div>
            </div>
        </div>

        <!-- Eksport / Import -->
        <div class="card animate-in" style="margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">💾 Dane</h3>
            <div class="flex items-center gap-3 flex-wrap">
                <button class="btn btn-secondary" id="export-json-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Eksport danych (JSON)
                </button>
                <span style="font-size:0.82rem;color:var(--text-muted);">UID: ${escHtml(currentUser?.uid || '')}</span>
            </div>
        </div>

        <!-- Zapisz -->
        <div class="animate-in" style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn btn-primary btn-full" id="save-settings-btn" style="max-width:300px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Zapisz ustawienia</span>
            </button>
        </div>`;

    // Event listeners
    const chipsContainer = document.getElementById('set-alert-chips');
    document.getElementById('set-add-alert-btn')?.addEventListener('click', () => {
        const days = prompt('Ile dni przed terminem wysłać alert?');
        if (days && !isNaN(days) && parseInt(days) > 0) {
            const chip = document.createElement('span');
            chip.className = 'alert-chip';
            chip.dataset.days = parseInt(days);
            chip.innerHTML = `${parseInt(days)} dni <button class="chip-remove" type="button">×</button>`;
            chipsContainer.insertBefore(chip, document.getElementById('set-add-alert-btn'));
        }
    });

    chipsContainer?.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip-remove')) e.target.closest('.alert-chip').remove();
    });

    // Dark mode toggle
    document.getElementById('set-dark-mode')?.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('taskalert-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === 'dark' ? '#0f1219' : '#4f8cff';
    });

    // Export JSON
    document.getElementById('export-json-btn')?.addEventListener('click', async () => {
        const { getActiveReminders, getCompletedReminders, getCategories } = await import('../db.js');
        try {
            const [active, completed, categories] = await Promise.all([
                getActiveReminders(),
                getCompletedReminders(),
                getCategories()
            ]);

            const data = {
                exportDate: new Date().toISOString(),
                profile,
                categories,
                reminders: { active, completed }
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `taskalert_export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            window.TaskAlert.showToast('Eksport JSON pobrany.', 'success');
        } catch (err) {
            window.TaskAlert.showToast('Błąd eksportu: ' + err.message, 'error');
        }
    });

    // Save settings
    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('set-name').value.trim();
        const email1 = document.getElementById('set-email1').value.trim();
        const email2 = document.getElementById('set-email2').value.trim();

        const chips = chipsContainer.querySelectorAll('.alert-chip');
        const alertDays = Array.from(chips).map(c => parseInt(c.dataset.days)).filter(d => d > 0);
        alertDays.sort((a, b) => b - a);

        const btn = document.getElementById('save-settings-btn');
        btn.classList.add('loading');

        try {
            await updateUserProfile({
                displayName: name,
                defaultPrimaryEmail: email1,
                defaultSecondaryEmail: email2,
                defaultAlertDays: alertDays
            });

            // Update sidebar name
            if (name) {
                document.getElementById('sidebar-user-name').textContent = name;
                const letter = name.charAt(0).toUpperCase();
                document.getElementById('sidebar-avatar-letter').textContent = letter;
                document.getElementById('topbar-avatar-letter').textContent = letter;
            }

            window.TaskAlert.showToast('Ustawienia zapisane!', 'success');
        } catch (err) {
            window.TaskAlert.showToast('Błąd zapisu: ' + err.message, 'error');
        } finally {
            btn.classList.remove('loading');
        }
    });
}
