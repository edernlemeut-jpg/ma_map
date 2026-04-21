/**
 * cold-start.js — NAS wake-up overlay
 *
 * Auto-initializes on import. Intercepts the first fetch call:
 * - If the response takes > 1 s, injects and shows a loading overlay
 *   ("Le serveur se réveille…") with an indeterminate progress bar.
 * - Hides automatically when the first response arrives.
 *
 * Usage: add one script tag in every HTML page (before the main app script):
 *   <script type="module" src="/js/shared/cold-start.js"></script>
 */

const DELAY_MS = 1000; // Show overlay after 1 s of silence

// ---------------------------------------------------------------------------
// Overlay injection
// ---------------------------------------------------------------------------

function injectStyles() {
  if (document.getElementById('cold-start-style')) return;
  const style = document.createElement('style');
  style.id = 'cold-start-style';
  style.textContent = `
    #loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(17, 24, 39, 0.96);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    #loading-overlay.cs-visible {
      opacity: 1;
    }
    #loading-overlay.cs-hiding {
      opacity: 0;
    }
    @keyframes cs-slide {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(0%); }
      100% { transform: translateX(100%); }
    }
    #cs-progress-bar {
      width: 200px;
      height: 4px;
      background: #374151;
      border-radius: 2px;
      overflow: hidden;
    }
    #cs-progress-fill {
      height: 100%;
      width: 60%;
      background: #3b82f6;
      border-radius: 2px;
      animation: cs-slide 1.4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

function createOverlay() {
  if (document.getElementById('loading-overlay')) return;
  injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-label', 'Chargement en cours');
  overlay.innerHTML = `
    <div style="font-size:2.5rem" aria-hidden="true">⚙️</div>
    <h2 style="color:#f9fafb;font-size:1.125rem;font-weight:700;margin:0">
      Le serveur se réveille…
    </h2>
    <p style="color:#9ca3af;font-size:0.875rem;margin:0">
      Quelques secondes, merci de patienter.
    </p>
    <div id="cs-progress-bar" aria-hidden="true">
      <div id="cs-progress-fill"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  // Trigger CSS transition (force reflow first)
  // eslint-disable-next-line no-unused-expressions
  overlay.offsetWidth;
  overlay.classList.add('cs-visible');
}

function hideOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('cs-visible');
  overlay.classList.add('cs-hiding');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}

// ---------------------------------------------------------------------------
// Fetch intercept — tracks only the first call
// ---------------------------------------------------------------------------

const _origFetch = window.fetch.bind(window);
let _tracked = false;

window.fetch = function coldStartFetch(...args) {
  if (_tracked) {
    return _origFetch(...args);
  }
  _tracked = true;

  const timer = setTimeout(createOverlay, DELAY_MS);

  const promise = _origFetch(...args);
  promise.finally(() => {
    clearTimeout(timer);
    hideOverlay();
  });
  return promise;
};
