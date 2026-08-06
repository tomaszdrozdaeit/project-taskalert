// ============================================================
// PWA INSTALL BANNER — Baner instalacji na urządzeniach mobilnych
// TaskAlert — System przypomnień i alertów terminowych
// ============================================================

const PWA_BANNER_DISMISSED_KEY = 'taskalert-pwa-banner-dismissed';
const PWA_BANNER_INSTALLED_KEY = 'taskalert-pwa-installed';

// Wykryj platformę
function getPlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    return { isIOS, isAndroid, isMobile: isIOS || isAndroid, isStandalone };
}

export function showInstallBanner() {
    const { isIOS, isAndroid, isMobile, isStandalone } = getPlatform();

    // Nie pokazuj banera jeśli:
    // - Już zainstalowano
    // - Już działa w trybie standalone
    // - Baner był zamknięty (w ciągu 7 dni)
    if (isStandalone) return;
    if (localStorage.getItem(PWA_BANNER_INSTALLED_KEY)) return;

    const dismissedAt = localStorage.getItem(PWA_BANNER_DISMISSED_KEY);
    if (dismissedAt) {
        const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceDismissed < 7) return;
    }

    // Globalna zmienna przechwycona w app.js
    const deferredPrompt = window.__pwa_deferred_prompt || null;

    // Na desktop bez Android prompt — nie pokazuj
    if (!isMobile && !deferredPrompt) return;

    setTimeout(() => {
        createBanner(isIOS, isAndroid);
    }, 2000); // Pokaż po 2s od zalogowania
}

function createBanner(isIOS, isAndroid) {
    // Usuń stary baner jeśli istnieje
    removeBanner();

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner';

    // Odczytaj globalny prompt (może się pojawić w międzyczasie)
    const deferredPrompt = window.__pwa_deferred_prompt || null;

    let instructionHtml = '';
    let actionHtml = '';

    if (isIOS) {
        instructionHtml = `
            <div class="pwa-banner-steps">
                <p><strong>Zainstaluj TaskAlert na ekranie głównym:</strong></p>
                <ol>
                    <li>Kliknij ikonę <span class="pwa-share-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </span> <strong>Udostępnij</strong> na dole ekranu</li>
                    <li>Przewiń w dół i wybierz <strong>"Dodaj do ekranu głównego"</strong></li>
                    <li>Kliknij <strong>"Dodaj"</strong></li>
                </ol>
            </div>`;
        actionHtml = `<button class="btn btn-secondary pwa-banner-close" id="pwa-dismiss-btn">Rozumiem</button>`;
    } else if (isAndroid || deferredPrompt) {
        instructionHtml = `
            <p class="pwa-banner-text">Zainstaluj TaskAlert na swoim urządzeniu, aby mieć szybki dostęp i otrzymywać powiadomienia push.</p>`;
        actionHtml = `
            <button class="btn btn-primary" id="pwa-install-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Zainstaluj
            </button>
            <button class="btn btn-ghost pwa-banner-close" id="pwa-dismiss-btn">Nie teraz</button>`;
    } else {
        return; // Brak warunków do wyświetlenia
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
                    <p class="pwa-banner-subtitle">Korzystaj jak z natywnej aplikacji</p>
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
            // Odczytaj ponownie — mógł nadejść w międzyczasie
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
                // Fallback: jeśli prompt nie jest dostępny, pokaż instrukcję
                console.warn('[PWA] deferredPrompt niedostępny — brak wsparcia przeglądarki lub instalacja już aktywna');
                const bannerContent = banner.querySelector('.pwa-banner-text');
                if (bannerContent) {
                    bannerContent.innerHTML = '<strong>Aby zainstalować:</strong> otwórz menu przeglądarki (⋮) i wybierz „Dodaj do ekranu głównego" lub „Zainstaluj aplikację".';
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
