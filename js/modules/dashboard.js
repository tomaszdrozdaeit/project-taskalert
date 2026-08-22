// ============================================================
// DASHBOARD MODULE — Pulpit główny z widgetami
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, getCategories, parseDate } from '../db.js';

let unsubscribeActive = null;
let unsubscribeCompleted = null;

let allActiveReminders = [];
let allCompletedReminders = [];
let currentFilter = 'all'; // 'all' | 'soon30' | 'critical14' | 'overdue' | 'completed'

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">📊 Pulpit</h1>
            <p class="page-subtitle">Przegląd wszystkich przypomnień i zbliżających się terminów</p>
        </div>

        <!-- Stat Cards -->
        <div class="stat-grid" id="dash-stats">
            <div class="stat-card stat-total animate-in stagger-1 active" data-filter="all" title="Kliknij, aby wyświetlić wszystkie aktywne alerty">
                <div class="stat-icon icon-total">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-total">0</div>
                    <div class="stat-label">Aktywne alerty</div>
                </div>
            </div>
            <div class="stat-card stat-warning animate-in stagger-2" data-filter="soon30" title="Kliknij, aby wyświetlić alerty z terminem do 30 dni">
                <div class="stat-icon icon-warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-soon">0</div>
                    <div class="stat-label">W ciągu 30 dni</div>
                </div>
            </div>
            <div class="stat-card stat-danger animate-in stagger-3" data-filter="critical14" title="Kliknij, aby wyświetlić alerty z terminem do 14 dni">
                <div class="stat-icon icon-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-critical">0</div>
                    <div class="stat-label">W ciągu 14 dni</div>
                </div>
            </div>
            <div class="stat-card stat-ok animate-in stagger-4" data-filter="overdue" title="Kliknij, aby wyświetlić alerty przeterminowane">
                <div class="stat-icon icon-danger" style="background: var(--status-danger-bg); color: var(--status-danger);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-overdue">0</div>
                    <div class="stat-label">Przeterminowane</div>
                </div>
            </div>
            <div class="stat-card stat-completed animate-in stagger-5" data-filter="completed" title="Kliknij, aby wyświetlić zakończone i wykonane alerty">
                <div class="stat-icon" style="background: rgba(16,185,129,0.12); color: #10b981;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-completed">0</div>
                    <div class="stat-label">Wykonane / Historia</div>
                </div>
            </div>
        </div>

        <!-- Timeline Section -->
        <div class="card animate-in" style="margin-bottom: 24px;">
            <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <h2 class="section-title" id="dash-timeline-title" style="margin:0;">
                    <span class="section-icon">⏰</span>
                    <span>Najbliższe terminy</span>
                </h2>
                <div id="dash-filter-indicator" style="display:none;">
                    <button class="btn btn-secondary btn-sm" id="dash-reset-filter" style="font-size:0.78rem;padding:4px 10px;">
                        ✕ Pokaż wszystkie
                    </button>
                </div>
            </div>
            <div class="reminder-list" id="dash-timeline">
                <div class="empty-state">
                    <div class="spinner"></div>
                </div>
            </div>
        </div>

        <!-- Dwa panele: rozkład + ostatnio wykonane -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;" class="dash-two-col">
            <div class="card animate-in">
                <div class="section-header">
                    <h2 class="section-title">
                        <span class="section-icon">📊</span>
                        Rozkład po kategoriach
                    </h2>
                </div>
                <div id="dash-chart" style="display: flex; align-items: center; justify-content: center; min-height: 180px;">
                    <div class="text-muted" style="font-size: 0.88rem;">Ładowanie...</div>
                </div>
            </div>
            <div class="card animate-in">
                <div class="section-header">
                    <h2 class="section-title">
                        <span class="section-icon">✅</span>
                        Ostatnie działania (7 dni)
                    </h2>
                </div>
                <div id="dash-recent">
                    <div class="text-muted" style="font-size: 0.88rem; text-align: center; padding: 40px 0;">Ładowanie działań...</div>
                </div>
            </div>
        </div>`;
}

export function init() {
    currentFilter = 'all';

    unsubscribeActive = onRemindersChange((reminders) => {
        allActiveReminders = reminders;
        updateDashboard();
    }, 'active');

    unsubscribeCompleted = onRemindersChange((reminders) => {
        allCompletedReminders = reminders;
        updateDashboard();
    }, 'completed');

    // Stat card click filter handlers
    const statsGrid = document.getElementById('dash-stats');
    if (statsGrid) {
        statsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.stat-card');
            if (card && card.dataset.filter) {
                const filter = card.dataset.filter;
                setDashboardFilter(filter);
            }
        });
    }

    // Reset filter button
    document.getElementById('dash-reset-filter')?.addEventListener('click', () => {
        setDashboardFilter('all');
    });

    // Timeline item click
    const timeline = document.getElementById('dash-timeline');
    if (timeline) {
        timeline.addEventListener('click', (e) => {
            const card = e.target.closest('.reminder-card');
            if (card && card.dataset.id) {
                const id = card.dataset.id;
                const reminder = allActiveReminders.find(r => r.id === id) || allCompletedReminders.find(r => r.id === id);
                window.showReminderDetailsModal(id, reminder);
            }
        });
    }

    // Recent actions click
    const recent = document.getElementById('dash-recent');
    if (recent) {
        recent.addEventListener('click', (e) => {
            const item = e.target.closest('[data-alert-id]');
            if (item && item.dataset.alertId) {
                const id = item.dataset.alertId;
                const reminder = allActiveReminders.find(r => r.id === id) || allCompletedReminders.find(r => r.id === id);
                window.showReminderDetailsModal(id, reminder);
            }
        });
    }

    return () => {
        if (unsubscribeActive) unsubscribeActive();
        if (unsubscribeCompleted) unsubscribeCompleted();
    };
}

export async function refresh() {}

function setDashboardFilter(filter) {
    currentFilter = filter;

    // Update active class on stat cards
    const cards = document.querySelectorAll('#dash-stats .stat-card');
    cards.forEach(c => {
        c.classList.toggle('active', c.dataset.filter === filter);
    });

    renderFilteredTimeline();
}

function daysUntil(date) {
    if (!date) return Infinity;
    const parsed = parseDate(date);
    if (!parsed || isNaN(parsed.getTime())) return Infinity;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(parsed);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
    if (!date) return '—';
    const parsed = parseDate(date);
    if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() === 0) return '—';
    return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(date) {
    if (!date) return '—';
    const parsed = parseDate(date);
    if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() === 0) return '—';
    return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
           parsed.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function updateDashboard() {
    const reminders = allActiveReminders;
    const completed = allCompletedReminders;

    // Statystyki aktywne
    let total = reminders.length;
    let soon30 = 0, critical14 = 0, overdue = 0;

    reminders.forEach(r => {
        const days = daysUntil(r.expiryDate);
        if (days < 0) overdue++;
        if (days <= 14) critical14++;
        if (days <= 30) soon30++;
    });

    // Aktualizuj stat cards
    animateCounter('stat-total', total);
    animateCounter('stat-soon', soon30);
    animateCounter('stat-critical', critical14);
    animateCounter('stat-overdue', overdue);
    animateCounter('stat-completed', completed.length);

    // Aktualizuj badge w sidebarze
    const badge = document.getElementById('badge-urgent');
    if (badge) {
        const urgentCount = critical14 + overdue;
        if (urgentCount > 0) {
            badge.textContent = urgentCount;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    // Timeline z aktywnym filtrem
    renderFilteredTimeline();

    // Chart — rozkład po kategoriach
    renderCategoryChart(reminders);

    // Ostatnie działania z ostatnich 7 dni
    renderRecentActions();
}

function renderFilteredTimeline() {
    const timeline = document.getElementById('dash-timeline');
    const titleEl = document.getElementById('dash-timeline-title');
    const resetBtn = document.getElementById('dash-filter-indicator');
    if (!timeline) return;

    const enrichedActive = allActiveReminders.map(r => ({
        ...r,
        daysLeft: daysUntil(r.expiryDate)
    }));

    let itemsToDisplay = [];
    let titleText = 'Najbliższe terminy';
    let icon = '⏰';

    switch (currentFilter) {
        case 'soon30':
            itemsToDisplay = enrichedActive.filter(r => r.daysLeft >= 0 && r.daysLeft <= 30).sort((a, b) => a.daysLeft - b.daysLeft);
            titleText = `Terminy w ciągu 30 dni (${itemsToDisplay.length})`;
            icon = '🟡';
            break;
        case 'critical14':
            itemsToDisplay = enrichedActive.filter(r => r.daysLeft >= 0 && r.daysLeft <= 14).sort((a, b) => a.daysLeft - b.daysLeft);
            titleText = `Terminy pilne w ciągu 14 dni (${itemsToDisplay.length})`;
            icon = '🟠';
            break;
        case 'overdue':
            itemsToDisplay = enrichedActive.filter(r => r.daysLeft < 0).sort((a, b) => a.daysLeft - b.daysLeft);
            titleText = `Alerty przeterminowane (${itemsToDisplay.length})`;
            icon = '🔴';
            break;
        case 'completed':
            itemsToDisplay = allCompletedReminders.map(r => ({
                ...r,
                isCompletedItem: true
            }));
            titleText = `Zakończone alerty (${itemsToDisplay.length})`;
            icon = '✅';
            break;
        case 'all':
        default:
            itemsToDisplay = enrichedActive.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 15);
            titleText = `Najbliższe terminy (${enrichedActive.length})`;
            icon = '⏰';
            break;
    }

    if (titleEl) {
        titleEl.innerHTML = `<span class="section-icon">${icon}</span><span>${titleText}</span>`;
    }

    if (resetBtn) {
        resetBtn.style.display = currentFilter !== 'all' ? 'block' : 'none';
    }

    if (itemsToDisplay.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state animate-in">
                <div class="empty-state-icon">🎉</div>
                <div class="empty-state-title">Brak alertów dla wybranego filtra</div>
                <p class="empty-state-text">Nie znaleziono alertów pasujących do tego kryterium.</p>
            </div>`;
        return;
    }

    timeline.innerHTML = itemsToDisplay.map(r => {
        if (r.isCompletedItem) {
            const historyList = r.history || [];
            const lastExec = historyList.slice().reverse().find(h => h.type === 'executed' || h.executedAt);
            const actor = lastExec?.byName || lastExec?.performedBy || (lastExec?.byEmail ? lastExec.byEmail.split('@')[0] : '');

            return `
                <div class="reminder-card animate-in" data-id="${r.id}" style="cursor:pointer;" title="Kliknij, aby otworzyć szczegóły">
                    <div class="reminder-status status-ok" style="background:#10b981;"></div>
                    <div class="reminder-info" style="flex:1;">
                        <div class="reminder-title">${escHtml(r.title)}</div>
                        <div class="reminder-meta" style="gap:8px;flex-wrap:wrap;">
                            <span class="category-badge" style="background: ${getCategoryColor(r.categoryName)}22; color: ${getCategoryColor(r.categoryName)}">${escHtml(r.categoryName || 'Inne')}</span>
                            ${r.subTypeLabel || r.subType ? `<span class="category-badge" style="background:rgba(79,140,255,0.1);color:#4f8cff;">${escHtml(r.subTypeLabel || r.subType)}</span>` : ''}
                            ${r.isShared ? `<span class="category-badge" style="background:#7c3aed22;color:#7c3aed">👥 Zespołowy</span>` : ''}
                            <span>📅 Wykonano: ${formatDate(r.lastExecutedAt || r.updatedAt)}</span>
                            ${actor ? `<span>👤 ${escHtml(actor)}</span>` : ''}
                        </div>
                    </div>
                    <div class="reminder-countdown countdown-ok" style="background:rgba(16,185,129,0.12);color:#10b981;">✅ Zakończone</div>
                </div>`;
        }

        const status = getStatusClass(r.daysLeft);
        const countdownClass = getCountdownClass(r.daysLeft);
        const countdownText = getCountdownText(r.daysLeft);
        const progressPct = getProgressPercent(r.daysLeft);
        const fillClass = r.daysLeft < 0 ? 'fill-danger' : r.daysLeft <= 14 ? 'fill-danger' : r.daysLeft <= 30 ? 'fill-warning' : 'fill-ok';

        return `
            <div class="reminder-card animate-in" data-id="${r.id}" style="cursor:pointer;" title="Kliknij, aby otworzyć szczegóły">
                <div class="reminder-status ${status}"></div>
                <div class="reminder-info">
                    <div class="reminder-title">${escHtml(r.title)}</div>
                    <div class="reminder-meta" style="gap:8px;flex-wrap:wrap;">
                        <span class="category-badge" style="background: ${getCategoryColor(r.categoryName)}22; color: ${getCategoryColor(r.categoryName)}">${escHtml(r.categoryName || 'Inne')}</span>
                        ${r.subTypeLabel || r.subType ? `<span class="category-badge" style="background:rgba(79,140,255,0.1);color:#4f8cff;">${escHtml(r.subTypeLabel || r.subType)}</span>` : ''}
                        ${r.isShared ? `<span class="category-badge" style="background:#7c3aed22;color:#7c3aed">👥 Zespołowy</span>` : ''}
                        <span>📅 ${formatDate(r.expiryDate)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill ${fillClass}" style="width: ${progressPct}%"></div>
                    </div>
                </div>
                <div class="reminder-countdown ${countdownClass}">${countdownText}</div>
            </div>`;
    }).join('');
}

function renderRecentActions() {
    const recentEl = document.getElementById('dash-recent');
    if (!recentEl) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const allReminders = [...allActiveReminders, ...allCompletedReminders];
    const actions = [];

    allReminders.forEach(r => {
        (r.history || []).forEach(h => {
            if (h.type === 'executed' || h.executedAt) {
                const execDate = parseDate(h.executedAt || h.timestamp || h.createdAt);
                if (execDate && !isNaN(execDate.getTime())) {
                    actions.push({
                        alertId: r.id,
                        title: r.title,
                        categoryName: r.categoryName,
                        date: execDate,
                        actor: h.byName || h.performedBy || (h.byEmail ? h.byEmail.split('@')[0] : ''),
                        note: h.note || '',
                        newExpiry: h.newExpiry
                    });
                }
            }
        });
    });

    // Sortuj malejąco po dacie wykonania
    actions.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Filtruj akcje z ostatnich 7 dni (lub weź max 6 ostatnich wpisów, jeśli w 7 dni było mało)
    const recent7Days = actions.filter(a => a.date.getTime() >= sevenDaysAgo.getTime());
    const displayActions = recent7Days.length > 0 ? recent7Days.slice(0, 10) : actions.slice(0, 6);

    if (displayActions.length === 0) {
        recentEl.innerHTML = `
            <div style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:0.88rem;">
                <div style="font-size:1.8rem;margin-bottom:6px;">☕</div>
                Brak wykonanych alertów w ostatnich 7 dniach.
            </div>`;
        return;
    }

    recentEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${displayActions.map(a => `
                <div class="animate-in" data-alert-id="${escHtml(a.alertId)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-card-hover);border:1px solid var(--border-light);border-radius:8px;cursor:pointer;transition:all var(--transition-fast);" title="Kliknij, aby otworzyć szczegóły alertu">
                    <div style="width:28px;height:28px;border-radius:50%;background:rgba(16,185,129,0.12);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;">
                        ✅
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escHtml(a.title)}
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${a.actor ? `<span>👤 ${escHtml(a.actor)}</span>` : ''}
                            ${a.note ? `<span>💬 ${escHtml(a.note)}</span>` : ''}
                            ${a.newExpiry ? `<span>🔄 Następny: ${formatDate(a.newExpiry)}</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;flex-shrink:0;">
                        ${formatDate(a.date)}
                    </div>
                </div>
            `).join('')}
        </div>`;
}

function getStatusClass(daysLeft) {
    if (daysLeft < 0) return 'status-overdue';
    if (daysLeft <= 14) return 'status-danger';
    if (daysLeft <= 30) return 'status-warning';
    return 'status-ok';
}

function getCountdownClass(daysLeft) {
    if (daysLeft < 0) return 'countdown-danger';
    if (daysLeft <= 14) return 'countdown-danger';
    if (daysLeft <= 30) return 'countdown-warning';
    return 'countdown-ok';
}

function getCountdownText(daysLeft) {
    if (daysLeft < 0) return `${Math.abs(daysLeft)} dni temu!`;
    if (daysLeft === 0) return 'Dziś!';
    if (daysLeft === 1) return 'Jutro!';
    return `za ${daysLeft} dni`;
}

function getProgressPercent(daysLeft) {
    if (daysLeft < 0) return 100;
    if (daysLeft > 90) return 5;
    return Math.max(5, 100 - (daysLeft / 90) * 100);
}

function getCategoryColor(categoryName) {
    const map = { 'Samochody': '#4f8cff', 'Kadry': '#7c3aed', 'Inne': '#f59e0b' };
    return map[categoryName] || '#64748b';
}

function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const duration = 500;
    const start = performance.now();

    function step(timestamp) {
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = Math.round(current + (target - current) * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function renderCategoryChart(reminders) {
    const chartEl = document.getElementById('dash-chart');
    if (!chartEl) return;

    const counts = {};
    const colors = {};
    reminders.forEach(r => {
        const name = r.categoryName || 'Inne';
        counts[name] = (counts[name] || 0) + 1;
        colors[name] = getCategoryColor(name);
    });

    const entries = Object.entries(counts);
    const total = reminders.length;

    if (total === 0) {
        chartEl.innerHTML = '<div class="text-muted" style="font-size: 0.88rem; padding: 40px 0;">Brak danych do wyświetlenia</div>';
        return;
    }

    const size = 160;
    const strokeWidth = 28;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    let paths = '';
    let legend = '';

    entries.forEach(([name, count]) => {
        const pct = count / total;
        const dashLen = circumference * pct;
        const dashGap = circumference - dashLen;
        const color = colors[name] || '#64748b';

        paths += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
            stroke-dasharray="${dashLen} ${dashGap}" stroke-dashoffset="${-offset}" stroke-linecap="round"
            style="transition: all 0.5s ease;"/>`;
        offset += dashLen;

        legend += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;"></div>
            <span style="font-size:0.85rem;color:var(--text-secondary)">${escHtml(name)}</span>
            <span style="margin-left:auto;font-weight:700;font-size:0.88rem;color:var(--text-primary)">${count}</span>
            <span style="font-size:0.75rem;color:var(--text-muted)">${Math.round(pct * 100)}%</span>
        </div>`;
    });

    chartEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
                ${paths}
            </svg>
            <div style="min-width:120px;">${legend}</div>
        </div>`;
}
