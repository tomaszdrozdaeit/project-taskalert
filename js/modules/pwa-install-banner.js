// ============================================================
// PWA INSTALL BANNER — Baner instalacji na urządzeniach mobilnych i Mac
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

const PWA_BANNER_DISMISSED_KEY = 'taskalert-pwa-banner-dismissed';
const PWA_BANNER_INSTALLED_KEY = 'taskalert-pwa-installed';

// Wykryj platformę
export function getPlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(ua) && navigator.maxTouchPoints <= 1;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    return { isIOS, isAndroid, isMac, isSafari, isMobile: isIOS || isAndroid, isStandalone };
}

export function showInstallBanner() {
    const platform = getPlatform();
    const { isIOS, isAndroid, isMac, isMobile, isStandalone } = platform;

    // Nie pokazuj banera jeśli:
    // - Już zainstalowano lub działa w trybie standalone
    // - Baner był zamknięty w ciągu ostatnich 7 dni
    if (isStandalone) return;
    if (localStorage.getItem(PWA_BANNER_INSTALLED_KEY)) return;

    const dismissedAt = localStorage.getItem(PWA_BANNER_DISMISSED_KEY);
    if (dismissedAt) {
        const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceDismissed < 7) return;
    }

    // Globalna zmienna przechwycona w app.js
    const deferredPrompt = window.__pwa_deferred_prompt || null;

    // Na desktopie bez Maca i bez prompta instalacji nie pokazuj
    if (!isMobile && !isMac && !deferredPrompt) return;

    setTimeout(() => {
        createBanner(platform);
    }, 1500); // Pokaż po 1.5s od załadowania
}

function createBanner(platform) {
    const { isIOS, isAndroid, isMac, isSafari } = platform;

    // Usuń stary baner jeśli istnieje
    removeBanner();

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner';

    // Odczytaj globalny prompt
    const deferredPrompt = window.__pwa_deferred_prompt || null;

    let instructionHtml = '';
    let actionHtml = '';

    if (isIOS) {
        instructionHtml = `
            <div class="pwa-banner-steps">
                <p><strong>Zainstaluj TaskAlert na ekranie głównym, aby włączyć powiadomienia PUSH:</strong></p>
                <ol>
                    <li>Stuknij ikonę <span class="pwa-share-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;vertical-align:middle;margin:0 2px;"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </span> <strong>Udostępnij</strong> na dolnym pasku Safari</li>
                    <li>Przewiń w dół i wybierz <strong>"Do ekranu początkowego"</strong> (lub "Dodaj do ekranu głównego")</li>
                    <li>Stuknij <strong>"Dodaj"</strong> w prawym górnym rogu</li>
                </ol>
                <div style="margin-top:8px;padding:8px 10px;background:rgba(239,68,68,0.08);border-left:3px solid #ef4444;border-radius:4px;font-size:0.78rem;color:var(--text-secondary);line-height:1.4;">
                    🔔 <strong>Ważne dla iOS:</strong> W systemie iOS (16.4+) powiadomienia PUSH działają wyłącznie po dodaniu aplikacji do Ekranu Głównego i uruchomieniu jej z utworzonej ikony.
                </div>
            </div>`;
        actionHtml = `<button class="btn btn-secondary pwa-banner-close" id="pwa-dismiss-btn">Rozumiem</button>`;
    } else if (isMac && isSafari && !deferredPrompt) {
        instructionHtml = `
            <div class="pwa-banner-steps">
                <p><strong>Zainstaluj TaskAlert w Docku na komputerze Mac (Safari):</strong></p>
                <ol>
                    <li>W menu górnym Safari kliknij <strong>Plik</strong></li>
                    <li>Wybierz opcję <strong>"Dodaj do Docka..."</strong> (Add to Dock)</li>
                    <li>Kliknij <strong>"Dodaj"</strong>, aby zainstalować aplikację z powiadomieniami</li>
                </ol>
            </div>`;
        actionHtml = `<button class="btn btn-secondary pwa-banner-close" id="pwa-dismiss-btn">Rozumiem</button>`;
    } else if (isAndroid || deferredPrompt || isMac) {
        instructionHtml = `
            <p class="pwa-banner-text">Zainstaluj TaskAlert na swoim urządzeniu, aby mieć szybki dostęp ze skrótu i bezproblemowo otrzymywać powiadomienia PUSH o zbliżających się terminach.</p>`;
        actionHtml = `
            <button class="btn btn-primary" id="pwa-install-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Zainstaluj aplikację
            </button>
            <button class="btn btn-ghost pwa-banner-close" id="pwa-dismiss-btn">Nie teraz</button>`;
    } else {
        return;
    }

    banner.innerHTML = `
        <div class="pwa-banner-content">
            <div class="pwa-banner-header">
                <div class="pwa-banner-icon">
                    <svg viewBox="0 0 48 48" fill="none" style="width:40px;height:40px;">
                        <rect width="48" height="48" rx="12" fill="url(#pwa-grad)"/>
                        <path d="M14 24l7 7 13-13" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="36" cy="14" r="6" fill="#ef4444" stroke="#fff" stroke-width="2"/>
                        <defs><linearGradient id="pwa-grad" x1="0" y1="0" x2="48" y2="48"><stop stop-color="#4f8cff"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
                    </svg>
                </div>
                <div>
                    <h3 class="pwa-banner-title">Zainstaluj TaskAlert</h3>
                    <p class="pwa-banner-subtitle">Szybki dostęp i powiadomienia PUSH</p>
                </div>
                <button class="pwa-banner-x" id="pwa-close-x" aria-label="Zamknij">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            ${instructionHtml}
            <div class="pwa-banner-actions">
                ${actionHtml}
            </div>
        </div>`;

    document.body.appendChild(banner);

    // Animacja wejścia
    requestAnimationFrame(() => {
        banner.classList.add('pwa-banner-show');
    });

    // Event listeners
    const dismissBtn = banner.querySelector('#pwa-dismiss-btn');
    const closeX = banner.querySelector('#pwa-close-x');
    const installBtn = banner.querySelector('#pwa-install-btn');

    const dismiss = () => {
        localStorage.setItem(PWA_BANNER_DISMISSED_KEY, String(Date.now()));
        removeBanner();
    };

    if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
    if (closeX) closeX.addEventListener('click', dismiss);

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            const prompt = window.__pwa_deferred_prompt;
            if (prompt) {
                prompt.prompt();
                const result = await prompt.userChoice;
                console.log('[PWA] Install prompt result:', result.outcome);
                if (result.outcome === 'accepted') {
                    localStorage.setItem(PWA_BANNER_INSTALLED_KEY, 'true');
                }
                window.__pwa_deferred_prompt = null;
                removeBanner();
            } else {
                console.warn('[PWA] deferredPrompt niedostępny — pokazuję manualną instrukcję');
                const bannerContent = banner.querySelector('.pwa-banner-text');
                if (bannerContent) {
                    bannerContent.innerHTML = '<strong>Aby zainstalować:</strong> otwórz menu przeglądarki (⋮ lub ikona instalacji w pasku adresu) i wybierz <em>„Dodaj do ekranu głównego"</em> lub <em>„Zainstaluj TaskAlert"</em>.';
                }
            }
        });
    }
}

function removeBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
        banner.classList.remove('pwa-banner-show');
        banner.classList.add('pwa-banner-hide');
        setTimeout(() => banner.remove(), 400);
    }
}
