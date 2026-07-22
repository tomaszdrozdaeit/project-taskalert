// ============================================================
// KATEGORIE MODULE — Zarządzanie kategoriami (CRUD globalny)
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onCategoriesChange, addCategory, updateCategory, deleteCategory, getUserCategoryVisibility, setCategoryVisibility } from '../db.js';

let unsubscribe = null;
let categories = [];
let visibility = {};

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">🏷️ Zarządzanie kategoriami</h1>
            <p class="page-subtitle">Twórz i edytuj kategorie alertów. Nowe kategorie są widoczne dla wszystkich użytkowników.</p>
        </div>

        <div class="section-actions animate-in" style="margin-bottom: 20px;">
            <button class="btn btn-primary" id="add-category-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Nowa kategoria</span>
            </button>
        </div>

        <div id="categories-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
            <div class="page-loader"><div class="spinner"></div></div>
        </div>`;
}

export async function init() {
    visibility = await getUserCategoryVisibility();

    unsubscribe = onCategoriesChange((cats) => {
        categories = cats;
        renderGrid();
    });

    document.getElementById('add-category-btn')?.addEventListener('click', showAddCategoryModal);

    return () => { if (unsubscribe) unsubscribe(); };
}

export function refresh() {}

function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function renderGrid() {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    if (categories.length === 0) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏷️</div><div class="empty-state-title">Brak kategorii</div></div>`;
        return;
    }

    grid.innerHTML = categories.map(cat => {
        const isVisible = visibility[cat.id] !== false; // domyślnie widoczne
        const subTypesHtml = (cat.subTypes || []).map(st =>
            `<span class="alert-chip" style="font-size:0.75rem;padding:3px 8px;">${escHtml(st.label)}</span>`
        ).join('');

        return `
        <div class="card" style="border-left: 4px solid ${cat.color || '#64748b'};">
            <div class="flex items-center justify-between" style="margin-bottom:12px;">
                <div class="flex items-center gap-3">
                    <span style="font-size:1.5rem;">${cat.icon || '📋'}</span>
                    <div>
                        <h3 style="font-size:1rem;font-weight:700;">${escHtml(cat.name)}</h3>
                        <span style="font-size:0.75rem;color:var(--text-muted);">Kolejność: ${cat.order || 0}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="toggle-wrapper">
                        <input type="checkbox" class="toggle" id="vis-${cat.id}" ${isVisible ? 'checked' : ''} onchange="handleVisibilityToggle('${cat.id}', this.checked)">
                        <label class="toggle-label" for="vis-${cat.id}" style="font-size:0.75rem;">Widoczna</label>
                    </div>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;">Tagi:</span>
                <div class="alert-chips" style="margin-top:6px;">${subTypesHtml || '<span class="text-muted" style="font-size:0.8rem;">Brak</span>'}</div>
            </div>
            <div class="flex items-center gap-2" style="justify-content:flex-end;">
                <button class="btn btn-sm btn-ghost" onclick="handleEditCategory('${cat.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edytuj
                </button>
                ${!cat.isDefault ? `
                <button class="btn btn-sm btn-ghost text-danger" onclick="handleDeleteCategory('${cat.id}', '${escHtml(cat.name)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    Usuń
                </button>` : '<span class="text-muted" style="font-size:0.72rem;">Kategoria domyślna</span>'}
            </div>
        </div>`;
    }).join('');
}

const PRESET_ICONS = [
    { icon: '🚗', label: '🚗 Samochody / Pojazdy' },
    { icon: '👷', label: '👷 Kadry / Pracownicy' },
    { icon: '📋', label: '📋 Inne / Ogólne' },
    { icon: '🏠', label: '🏠 Nieruchomości / Budynki' },
    { icon: '💻', label: '💻 Sprzęt IT' },
    { icon: '🩺', label: '🩺 Badania / Zdrowie' },
    { icon: '✈️', label: '✈️ Podróże / Delegacje' },
    { icon: '🔑', label: '🔑 Licencje / Uprawnienia' },
    { icon: '🎓', label: '🎓 Szkolenia / Certyfikaty' },
    { icon: '⚡', label: '⚡ Media / Usługi' },
    { icon: '📦', label: '📦 Magazyn / Dostawy' },
    { icon: '🛠️', label: '🛠️ Warsztat / Serwis' }
];

function renderIconSelect(id, selectedIcon) {
    const options = PRESET_ICONS.map(i =>
        `<option value="${i.icon}" ${i.icon === selectedIcon ? 'selected' : ''}>${escHtml(i.label)}</option>`
    ).join('');
    return `<select id="${id}" class="filter-select w-full">${options}</select>`;
}

function showAddCategoryModal() {
    window.TaskAlert.showModal({
        title: 'Nowa kategoria',
        body: `
            <div class="form-group">
                <label for="cat-name">Nazwa kategorii *</label>
                <input type="text" id="cat-name" placeholder="np. Nieruchomości" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="cat-icon">Ikona (emoji)</label>
                    ${renderIconSelect('cat-icon', '📋')}
                </div>
                <div class="form-group">
                    <label for="cat-color">Kolor</label>
                    <input type="color" id="cat-color" value="#64748b" style="height:42px;padding:4px;">
                </div>
            </div>
            <div class="form-group">
                <label>Tagi (opcjonalne)</label>
                <div id="cat-subtypes">
                    <div class="flex items-center gap-2 mb-4">
                        <input type="text" class="subtype-input" placeholder="Nazwa tagu" style="flex:1;">
                        <button class="btn btn-sm btn-ghost" type="button" onclick="addSubtypeRow()">+</button>
                    </div>
                </div>
            </div>`,
        footer: `
            <button class="btn btn-secondary" onclick="window.TaskAlert.closeModal()">Anuluj</button>
            <button class="btn btn-primary" id="cat-save-btn">Utwórz</button>`,
        onOpen: (body, footer) => {
            window.addSubtypeRow = () => {
                const container = body.querySelector('#cat-subtypes');
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 mb-4';
                row.innerHTML = `
                    <input type="text" class="subtype-input" placeholder="Nazwa tagu" style="flex:1;">
                    <button class="btn btn-sm btn-ghost text-danger" type="button" onclick="this.parentElement.remove()">×</button>`;
                container.appendChild(row);
            };

            footer.querySelector('#cat-save-btn').addEventListener('click', async () => {
                const name = body.querySelector('#cat-name').value.trim();
                if (!name) { window.TaskAlert.showToast('Podaj nazwę kategorii.', 'warning'); return; }

                const icon = body.querySelector('#cat-icon').value || '📋';
                const color = body.querySelector('#cat-color').value;
                const subtypeInputs = body.querySelectorAll('.subtype-input');
                const subTypes = Array.from(subtypeInputs)
                    .map(i => i.value.trim())
                    .filter(v => v)
                    .map(v => ({ key: v.toLowerCase().replace(/\s+/g, '_'), label: v }));

                // Zawsze dodaj "Niestandardowy"
                if (!subTypes.find(st => st.key === 'custom')) {
                    subTypes.push({ key: 'custom', label: 'Niestandardowy' });
                }

                try {
                    await addCategory({ name, icon, color, subTypes });
                    window.TaskAlert.showToast(`Kategoria "${name}" utworzona!`, 'success');
                    window.TaskAlert.closeModal();
                    window.dispatchEvent(new Event('taskalert-categories-changed'));
                } catch (err) {
                    window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                }
            });
        }
    });
}

window.handleEditCategory = (id) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;

    const subtypesHtml = (cat.subTypes || []).map(st => `
        <div class="flex items-center gap-2 mb-4">
            <input type="text" class="subtype-input" value="${escHtml(st.label)}" style="flex:1;">
            <button class="btn btn-sm btn-ghost text-danger" type="button" onclick="this.parentElement.remove()">×</button>
        </div>`).join('');

    window.TaskAlert.showModal({
        title: `Edycja: ${cat.name}`,
        body: `
            <div class="form-group">
                <label for="ecat-name">Nazwa kategorii *</label>
                <input type="text" id="ecat-name" value="${escHtml(cat.name)}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="ecat-icon">Ikona (emoji)</label>
                    ${renderIconSelect('ecat-icon', cat.icon || '📋')}
                </div>
                <div class="form-group">
                    <label for="ecat-color">Kolor</label>
                    <input type="color" id="ecat-color" value="${cat.color || '#64748b'}" style="height:42px;padding:4px;">
                </div>
            </div>
            <div class="form-group">
                <label>Tagi</label>
                <div id="ecat-subtypes">${subtypesHtml}</div>
                <button class="btn btn-sm btn-ghost" type="button" onclick="addEditSubtypeRow()" style="margin-top:4px;">+ Dodaj tag</button>
            </div>`,
        footer: `
            <button class="btn btn-secondary" onclick="window.TaskAlert.closeModal()">Anuluj</button>
            <button class="btn btn-primary" id="ecat-save-btn">Zapisz</button>`,
        onOpen: (body, footer) => {
            window.addEditSubtypeRow = () => {
                const container = body.querySelector('#ecat-subtypes');
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 mb-4';
                row.innerHTML = `
                    <input type="text" class="subtype-input" placeholder="Nazwa tagu" style="flex:1;">
                    <button class="btn btn-sm btn-ghost text-danger" type="button" onclick="this.parentElement.remove()">×</button>`;
                container.appendChild(row);
            };

            footer.querySelector('#ecat-save-btn').addEventListener('click', async () => {
                const name = body.querySelector('#ecat-name').value.trim();
                if (!name) { window.TaskAlert.showToast('Podaj nazwę kategorii.', 'warning'); return; }

                const icon = body.querySelector('#ecat-icon').value || '📋';
                const color = body.querySelector('#ecat-color').value;
                const subtypeInputs = body.querySelectorAll('.subtype-input');
                const subTypes = Array.from(subtypeInputs)
                    .map(i => i.value.trim())
                    .filter(v => v)
                    .map(v => ({ key: v.toLowerCase().replace(/\s+/g, '_'), label: v }));

                if (!subTypes.find(st => st.key === 'custom')) {
                    subTypes.push({ key: 'custom', label: 'Niestandardowy' });
                }

                try {
                    await updateCategory(id, { name, icon, color, subTypes });
                    window.TaskAlert.showToast('Kategoria zaktualizowana.', 'success');
                    window.TaskAlert.closeModal();
                    window.dispatchEvent(new Event('taskalert-categories-changed'));
                } catch (err) {
                    window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
                }
            });
        }
    });
};

window.handleDeleteCategory = async (id, name) => {
    const confirmed = await window.TaskAlert.showConfirm(
        `Czy na pewno chcesz usunąć kategorię "${name}"? Przypomnienia przypisane do tej kategorii nie zostaną usunięte.`,
        'Usunięcie kategorii',
        { type: 'danger', confirmText: 'Usuń' }
    );
    if (confirmed) {
        try {
            await deleteCategory(id);
            window.TaskAlert.showToast(`Kategoria "${name}" usunięta.`, 'success');
            window.dispatchEvent(new Event('taskalert-categories-changed'));
        } catch (err) {
            window.TaskAlert.showToast('Błąd: ' + err.message, 'error');
        }
    }
};

window.handleVisibilityToggle = async (catId, visible) => {
    try {
        await setCategoryVisibility(catId, visible);
        visibility[catId] = visible;
        window.dispatchEvent(new Event('taskalert-categories-changed'));
    } catch (err) {
        window.TaskAlert.showToast('Błąd zapisu widoczności.', 'error');
    }
};
