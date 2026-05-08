/**
 * nav-bar.js — Barre de navigation persistante Metal Adventures
 * Mobile : barre basse fixe | Desktop : rail gauche icon-only
 */

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Accueil',
    paths: ['/', '/index.html'],
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  },
  {
    href: '/itineraire.html',
    label: 'Carte',
    paths: ['/itineraire.html'],
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l6-2 6 4 6-2v14l-6 2-6-4-6 2V5z"/><path d="M9 3v14M15 7v14"/></svg>`,
  },
  {
    href: '/univers.html',
    label: 'Univers',
    paths: ['/univers.html', '/vaisseaux.html'],
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="11" ry="4.5" transform="rotate(-20 12 12)"/></svg>`,
  },
  {
    href: '/regles.html',
    label: 'Règles',
    paths: ['/regles.html'],
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  },
  {
    href: '/calendrier.html',
    label: 'Calendrier',
    paths: ['/calendrier.html'],
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  },
];

function isActive(item) {
  const p = window.location.pathname;
  return item.paths.some(path => p === path || p === path.replace(/^\//, ''));
}

function createNav() {
  const nav = document.createElement('nav');
  nav.id = 'ma-nav';
  nav.setAttribute('aria-label', 'Navigation principale');

  for (const item of NAV_ITEMS) {
    const a = document.createElement('a');
    a.href = item.href;
    a.className = 'ma-nav-item' + (isActive(item) ? ' active' : '');
    a.title = item.label;
    a.setAttribute('aria-label', item.label);
    a.innerHTML = item.icon + `<span>${item.label}</span>`;
    nav.appendChild(a);
  }

  return nav;
}

function injectStyles() {
  const style = document.createElement('style');
  style.id = 'ma-nav-styles';
  style.textContent = `
    /* ── MA Nav Bar ───────────────────────────────── */
    #ma-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: 56px;
      background: linear-gradient(180deg, #2d3140 0%, #21242d 100%);
      border-top: 1px solid #8a6225;
      display: flex;
      align-items: stretch;
      z-index: 199;
      box-shadow: 0 -2px 16px rgba(0,0,0,0.55);
    }
    .ma-nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: #7a7e92;
      text-decoration: none;
      transition: color 0.15s, background 0.15s;
      padding: 6px 4px;
      -webkit-tap-highlight-color: transparent;
    }
    .ma-nav-item svg {
      width: 20px; height: 20px;
      flex-shrink: 0;
    }
    .ma-nav-item span {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 0.58rem;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      line-height: 1;
    }
    .ma-nav-item:hover {
      color: #e8b454;
      background: rgba(200,148,58,0.08);
    }
    .ma-nav-item.active {
      color: #c8943a;
      background: rgba(200,148,58,0.12);
    }
    .ma-nav-item.active svg {
      filter: drop-shadow(0 0 4px rgba(200,148,58,0.45));
    }
    /* Mobile body padding so content isn't hidden under the bar */
    body { padding-bottom: 56px !important; }

    @media (min-width: 768px) {
      #ma-nav {
        bottom: auto; right: auto;
        top: 0; left: 0;
        width: 56px; height: 100vh;
        flex-direction: column;
        align-items: stretch;
        border-top: none;
        border-right: 1px solid #3a3e50;
        box-shadow: 2px 0 16px rgba(0,0,0,0.45);
        padding-top: 12px;
        overflow: hidden;
      }
      .ma-nav-item {
        flex: 0;
        padding: 13px 0;
        border-radius: 0;
      }
      .ma-nav-item span { display: none; }
      /* Shift page content right to clear the rail */
      body {
        padding-bottom: 0 !important;
        padding-left: 56px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * On mobile, shrink any main element that uses calc(100vh …)
 * so its bottom edge stays above the nav bar.
 */
function adjustCalcHeights() {
  if (window.innerWidth >= 768) return;
  document.querySelectorAll('main[style]').forEach(el => {
    const h = el.style.height;
    if (h && h.startsWith('calc(100vh')) {
      el.style.height = h.replace(')', ' - 56px)');
    }
  });
}

function init() {
  injectStyles();
  document.body.appendChild(createNav());
  adjustCalcHeights();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
