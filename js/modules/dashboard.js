// ============================================================
// DASHBOARD MODULE — Pulpit główny z widgetami
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

import { onRemindersChange, getCategories } from '../db.js';

let unsubscribe = null;

export function render() {
    return `
        <div class="page-header animate-in">
            <h1 class="page-title">📊 Pulpit</h1>
            <p class="page-subtitle">Przegląd wszystkich przypomnień i zbliżających się terminów</p>
        </div>

        <!-- Stat Cards -->
        <div class="stat-grid" id="dash-stats">
            <div class="stat-card stat-total animate-in stagger-1">
                <div class="stat-icon icon-total">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-total">0</div>
                    <div class="stat-label">Aktywne alerty</div>
                </div>
            </div>
            <div class="stat-card stat-warning animate-in stagger-2">
                <div class="stat-icon icon-warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-soon">0</div>
                    <div class="stat-label">W ciągu 30 dni</div>
                </div>
            </div>
            <div class="stat-card stat-danger animate-in stagger-3">
                <div class="stat-icon icon-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-critical">0</div>
                    <div class="stat-label">W ciągu 14 dni</div>
                </div>
            </div>
            <div class="stat-card stat-ok animate-in stagger-4">
                <div class="stat-icon icon-danger" style="background: var(--status-danger-bg); color: var(--status-danger);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="stat-overdue">0</div>
                    <div class="stat-label">Przeterminowane</div>
                </div>
            </div>
        </div>

        <!-- Timeline -->
        <div class="card animate-in" style="margin-bottom: 24px;">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="section-icon">⏰</span>
                    Najbliższe terminy
                </h2>
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
                        Ostatnie działania
                    </h2>
                </div>
                <div id="dash-recent">
                    <div class="text-muted" style="font-size: 0.88rem; text-align: center; padding: 40px 0;">Brak historii</div>
                </div>
            </div>
        </div>`;
}

export function init() {
    // Nasłuchuj zmian w przypomnieniach (real-time)
    unsubscribe = onRemindersChange(updateDashboard, 'active');

    return () => {
        if (unsubscribe) unsubscribe();
    };
}

export async function refresh() {
    // Real-time listener automatycznie odświeża
}

function daysUntil(date) {
    if (!date) return Infinity;
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
    if (!date) return '—';
    if (date.toDate) date = date.toDate();
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

async function updateDashboard(reminders) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Statystyki
    let total = reminders.length;
    let soon30 = 0, critical14 = 0, overdue = 0;

    const enriched = reminders.map(r => {
        const days = daysUntil(r.expiryDate);
        if (days < 0) overdue++;
        if (days <= 14) critical14++;
        if (days <= 30) soon30++;
        return { ...r, daysLeft: days };
    });

    // Aktualizuj stat cards
    animateCounter('stat-total', total);
    animateCounter('stat-soon', soon30);
    animateCounter('stat-critical', critical14);
    animateCounter('stat-overdue', overdue);

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

    // Timeline — sortuj po daysLeft (najbliższe i przeterminowane na górze)
    const timeline = document.getElementById('dash-timeline');
    const sorted = enriched.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10);

    if (sorted.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎉</div>
                <div class="empty-state-title">Brak aktywnych przypomnień</div>
                <p class="empty-state-text">Dodaj swoje pierwsze przypomnienie klikając przycisk "+" w prawym dolnym rogu.</p>
            </div>`;
    } else {
        timeline.innerHTML = sorted.map(r => {
            const status = getStatusClass(r.daysLeft);
            const countdownClass = getCountdownClass(r.daysLeft);
            const countdownText = getCountdownText(r.daysLeft);
            const progressPct = getProgressPercent(r.daysLeft);
            const fillClass = r.daysLeft < 0 ? 'fill-danger' : r.daysLeft <= 14 ? 'fill-danger' : r.daysLeft <= 30 ? 'fill-warning' : 'fill-ok';

            return `
                <div class="reminder-card" data-id="${r.id}" onclick="location.hash='#${getCategoryHash(r.categoryName)}'">
                    <div class="reminder-status ${status}"></div>
                    <div class="reminder-info">
                        <div class="reminder-title">${escHtml(r.title)}</div>
                        <div class="reminder-meta">
                            <span class="category-badge" style="background: ${getCategoryColor(r.categoryName)}22; color: ${getCategoryColor(r.categoryName)}">${escHtml(r.categoryName || 'Inne')}</span>
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

    // Chart — rozkład po kategoriach
    renderCategoryChart(enriched);
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

function getCategoryHash(categoryName) {
    const map = { 'Samochody': 'samochody', 'Kadry': 'kadry', 'Inne': 'inne' };
    return map[categoryName] || 'inne';
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

    // Policz per kategoria
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

    // SVG Donut Chart
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
