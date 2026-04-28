import { initHeader } from '/js/shared/header.js';
import { getActiveTableId, fetchWithTable, isMJ, setActiveTable, renderTableSelector } from '/js/shared/table-selector.js';
import { createPoller } from '/js/shared/poller.js';

// --- State ---
let state = {
  systems: [],
  factions: [],
  ship_models: [],
  ships: [],
  planets: [],
  perils: [],
  peril_assignments: { systems: {}, quadrants: {} },
  activeTab: 'systems',
  isMJ: false,
  isAdmin: false,
  tableId: null,
  lastKnownCounts: { systems: 0, factions: 0, ship_models: 0 },
  badges: { systems: false, factions: false, ship_models: false },
  searchMode: false,
  searchResults: [],
  systemsSort: { col: 'nom', dir: 'asc' },
  factionsSort: { col: 'name', dir: 'asc' },
  modelsSort: { col: 'nom', dir: 'asc' },
  activeShipId: null,
  perilEditorOpen: null,
};

let poller = null;
const pendingToggles = new Set();
let searchTimeout = null;

// --- DOM refs ---
const $ = (id) => document.getElementById(id);

// --- Init ---
async function init() {
  const user = await initHeader();
  if (!user) { window.location.href = '/login.html'; return; }

  const tableId = getActiveTableId();
  state.tableId = tableId;
  state.isAdmin = !!user.is_admin;
  state.isMJ = isMJ ? isMJ() : false;

  // Admin can use compendium without a table (ship models only)
  if (!tableId && !state.isAdmin) { window.location.href = '/'; return; }

  try {
    await loadAllData();
    $('loading').classList.add('hidden');

    // Handle hash-based tab selection (e.g. #flotte)
    const hash = window.location.hash.replace('#', '');
  const validTabs = ['systems', 'factions', 'perils', 'quadrants', 'ship_models', 'ships'];
    if (hash && validTabs.includes(hash) && (hash !== 'ships' || state.tableId)) {
      state.activeTab = hash;
    }

    renderApp();
    if (tableId) startPoller();
  } catch {
    stopPoller();
    $('loading').classList.add('hidden');
    $('error-state').classList.remove('hidden');
  }

  $('retry-btn')?.addEventListener('click', () => {
    $('error-state').classList.add('hidden');
    $('loading').classList.remove('hidden');
    init();
  });

  // Search event handlers
  setupSearch();
}

// --- Data loading ---
async function loadAllData() {
  const fetcher = state.tableId ? fetchWithTable : (url) => fetch(url, { credentials: 'include' });

  // Systems and factions require an active table — skip for admin without table
  const promises = state.tableId
    ? [fetcher('/api/systems'), fetcher('/api/factions'), fetcher('/api/ship-models')]
    : [Promise.resolve({ ok: false, json: async () => ({}) }), Promise.resolve({ ok: false, json: async () => ({}) }), fetcher('/api/ship-models')];
  if (state.tableId) promises.push(fetcher('/api/ships'));
  // Also load active ship ID
  let activeShipIdRes = null;
  if (state.tableId) activeShipIdRes = fetcher('/api/ships/active');
  // Load peril tables and assignments for MJ
  let perilsRes = null, assignRes = null;
  if (state.tableId) {
    perilsRes = fetchWithTable('/api/perils/tables', { credentials: 'include' });
    assignRes = fetchWithTable('/api/perils/assignments', { credentials: 'include' });
  }
  // planets loaded separately (no visibility filter needed for listing)
  const planetsRes = await fetch('/api/planets', { credentials: 'include' });
  const planetsJson = planetsRes.ok ? await planetsRes.json() : { data: [] };

  const results = await Promise.all(promises);
  const [sysJson, facJson, smJson, shipJson] = await Promise.all(results.map(r => r.json()));

  state.systems = sysJson.data ?? [];
  state.factions = facJson.data ?? [];
  state.ship_models = smJson.data ?? [];
  state.ships = shipJson?.data ?? [];
  state.planets = planetsJson.data ?? [];

  if (perilsRes && assignRes) {
    try {
      const [pr, ar] = await Promise.all([perilsRes, assignRes]);
      if (pr.ok) { const pj = await pr.json(); state.perils = pj.data || []; }
      if (ar.ok) { const aj = await ar.json(); state.peril_assignments = aj.data || { systems: {}, quadrants: {} }; }
    } catch {}
  }

  if (activeShipIdRes) {
    try {
      const ar = await activeShipIdRes;
      if (ar.ok) { const aj = await ar.json(); state.activeShipId = aj.data?.activeShipId || null; }
    } catch {}
  }

  // Detect MJ from API response (only compendium entities have 'visible')
  if (!state.isAdmin) {
    const allEntities = [...state.systems, ...state.factions, ...state.ship_models];
    state.isMJ = allEntities.length > 0 && 'visible' in allEntities[0];
  } else {
    state.isMJ = state.tableId ? true : false;
  }

  state.lastKnownCounts = {
    systems: state.systems.length,
    factions: state.factions.length,
    ship_models: state.ship_models.length
  };
}

async function reloadTab(type) {
  const urlMap = { systems: '/api/systems', factions: '/api/factions', ship_models: '/api/ship-models' };
  const res = await fetchWithTable(urlMap[type]);
  if (!res.ok) return;
  const json = await res.json();
  const data = json.data ?? [];
  state[type] = data;
  state.lastKnownCounts[type] = data.length;
}

// --- Rendering ---
function renderApp() {
  const totalCount = state.systems.length + state.factions.length + state.ship_models.length;

  $('search-bar').classList.remove('hidden');

  // Hide Flotte tab if no table (admin without table)
  const fleetBtn = $('tab-btn-ships');
  if (fleetBtn) {
    if (!state.tableId) {
      fleetBtn.classList.add('hidden');
      // If currently on flotte tab, switch to ship_models
      if (state.activeTab === 'ships') state.activeTab = 'ship_models';
    } else {
      fleetBtn.classList.remove('hidden');
    }
  }

  // Hide Périls and Quadrants tabs for non-MJ players
  const perilsBtn = document.querySelector('[data-tab="perils"]');
  const quadrantsBtn = document.querySelector('[data-tab="quadrants"]');
  if (!state.isMJ && !state.isAdmin) {
    if (perilsBtn) perilsBtn.classList.add('hidden');
    if (quadrantsBtn) quadrantsBtn.classList.add('hidden');
    if (state.activeTab === 'perils' || state.activeTab === 'quadrants') state.activeTab = 'systems';
  } else {
    if (perilsBtn) perilsBtn.classList.remove('hidden');
    if (quadrantsBtn) quadrantsBtn.classList.remove('hidden');
  }

  if (totalCount === 0 && !state.isMJ && !state.isAdmin) {
    $('empty-global').classList.remove('hidden');
    $('tab-nav').classList.add('hidden');
    return;
  }

  $('empty-global').classList.add('hidden');
  $('tab-nav').classList.remove('hidden');

  // Tab buttons
  setupTabNav();
  renderActiveTab();

  // ── Bouton changer/créer campagne ──────────────────────────────────────────
  const switchBtn = document.getElementById('btn-switch-table');
  if (switchBtn) {
    switchBtn.classList.remove('hidden');
    switchBtn.onclick = () => openTableSwitcher();
  }
}

function openTableSwitcher() {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto';
  overlay.innerHTML = `
    <div class="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-700">
        <h3 class="text-base font-semibold">Changer de campagne</h3>
        <button id="tswitch-close" class="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
      </div>
      <div id="tswitch-body" class="p-4"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#tswitch-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  renderTableSelector('tswitch-body', () => { overlay.remove(); location.reload(); });
}

function setupTabNav() {
  const nav = $('tab-nav');
  if (!nav) return;
  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    const isActive = tab === state.activeTab;
    btn.className = `tab-btn px-4 py-3 text-sm font-medium rounded-t-lg min-h-[44px] min-w-[44px] relative transition-colors ${
      isActive
        ? 'bg-gray-800 text-gray-100 border border-gray-700 border-b-transparent -mb-px'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
    }`;

    // Badge
    const badge = btn.querySelector(`[data-badge="${tab}"]`);
    if (badge) {
      badge.classList.toggle('hidden', !state.badges[tab]);
    }

    btn.onclick = () => switchTab(tab);
  });
}

function switchTab(tab) {
  state.activeTab = tab;

  // Clear badge for this tab
  if (state.badges[tab]) {
    state.badges[tab] = false;
    // Reload data for this tab since it has new content
    setupTabNav();
    reloadTab(tab).then(() => renderActiveTab());
    return;
  }

  setupTabNav();
  renderActiveTab();
}

function renderActiveTab() {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));

  const panel = $(`tab-${state.activeTab}`);
  if (!panel) return;
  panel.classList.remove('hidden');

  const data = state[state.activeTab];
  const renderers = { systems: renderSystems, factions: renderFactions, perils: renderPerils, quadrants: renderQuadrants, ship_models: renderShipModels, ships: renderFleet };
  if (renderers[state.activeTab]) renderers[state.activeTab](panel, data);
}

// --- Empty states per tab ---
const EMPTY_MESSAGES = {
  systems: { icon: '🌌', text: 'Aucun système stellaire cartographié. Vos capteurs longue portée n\'ont encore rien détecté…' },
  factions: { icon: '📡', text: 'Aucune faction répertoriée. Les canaux diplomatiques sont silencieux…' },
  ship_models: { icon: '🚀', text: 'Aucun modèle de vaisseau dans la base de données. Les chantiers navals n\'ont rien publié…' },
  planets: { icon: '🌌', text: 'Aucun système stellaire disponible. L\'univers est silencieux…' }
};

function renderEmptyState(panel, type) {
  const msg = EMPTY_MESSAGES[type];
  panel.innerHTML = `
    <div class="text-center py-12 px-4">
      <p class="text-2xl mb-3">${msg.icon}</p>
      <p class="text-gray-400 italic max-w-md mx-auto">${msg.text}</p>
    </div>`;
}

// --- Detail sheet (fullscreen overlay) ---
function openDetailSheet(entityType, entity) {
  const existing = document.getElementById('detail-sheet-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'detail-sheet-overlay';
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const canEdit = state.isMJ || state.isAdmin;
  let title = '', content = '', editType = null, editId = null;

  if (entityType === 'systems') {
    const s = entity;
    let soleil = {}, corps = [], patrouilles = [];
    try { soleil = JSON.parse(s.soleil_json || 'null') || {}; } catch { soleil = {}; }
    try { corps = JSON.parse(s.corps_celestes_json || 'null') || []; } catch { corps = []; }
    try { patrouilles = JSON.parse(s.patrouilles_json || 'null') || []; } catch { patrouilles = []; }
    const hasSoleil = Object.keys(soleil).length > 0;

    const bodyRowHtml = (body, depth = 0) => {
      const icon = depth > 0 ? '🌙' : '🪐';
      const orbStr = body.orbite != null ? `<span class="text-blue-300 ml-1">${body.orbite} US</span>` : '';
      const stats = [
        body.atmosphere ? `Atm : ${body.atmosphere}${body.atmosphereDetail ? ` (${body.atmosphereDetail})` : ''}` : null,
        body.gravite ? `Grav : ${body.gravite}` : null,
        body.techno ? `Tech : ${body.techno}` : null,
        body.gouvernement ? `Gouv : ${body.gouvernement}` : null,
        body.population ? `Pop : ${body.population}` : null,
        body.securite != null ? `Sécu : ${body.securite}` : null,
        body.commerce ? `Commerce : ${body.commerce}` : null,
      ].filter(Boolean);
      const inner = `
        ${body.texte_ambiance ? `<p class="text-xs text-gray-400 italic mb-1 leading-relaxed">${esc(body.texte_ambiance)}</p>` : ''}
        ${body.description ? `<p class="text-xs text-gray-400 mb-2 leading-relaxed">${esc(body.description)}</p>` : ''}
        ${stats.length ? `<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300 mb-2">${stats.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : ''}
        ${Array.isArray(body.environnements) && body.environnements.length ? `<p class="text-xs text-gray-400 mb-1">🌍 ${body.environnements.map(e => esc(e)).join(', ')}</p>` : ''}
        ${Array.isArray(body.lunes) && body.lunes.length ? `<div class="mt-2 space-y-1.5 pl-2 border-l border-gray-700">${body.lunes.map(l => bodyRowHtml(l, depth + 1)).join('')}</div>` : ''}`;
      const uid = `ds-b-${depth}-${Math.random().toString(36).slice(2, 8)}`;
      return buildCollapsible(uid, `${icon} ${esc(body.nom || '?')}${orbStr}`, inner, true);
    };

    title = `🌌 ${esc(s.nom)}`;
    editType = 'systems'; editId = s.id;

    content = `
      <div class="flex flex-wrap gap-2 mb-4">
        ${s.quadrant ? `<span class="bg-gray-700 px-2 py-1 rounded text-gray-300 text-xs">📍 ${esc(s.quadrant)}</span>` : ''}
        ${s.faction ? `<span class="bg-gray-700 px-2 py-1 rounded text-gray-300 text-xs">${factionBadge(s.faction)}</span>` : ''}
        ${s.gouvernement ? `<span class="bg-gray-700 px-2 py-1 rounded text-gray-300 text-xs">🏛️ ${esc(s.gouvernement)}</span>` : ''}
        ${s.route ? `<span class="bg-gray-700 px-2 py-1 rounded text-gray-300 text-xs">🛣️ ${esc(s.route)}</span>` : ''}
        ${s.is_frontiere ? `<span class="bg-amber-900/60 text-amber-300 px-2 py-1 rounded text-xs">⚠️ Zone frontière</span>` : ''}
      </div>
      ${s.texte_ambiance ? `<p class="text-sm text-gray-400 italic mb-2 leading-relaxed">${esc(s.texte_ambiance)}</p>` : ''}
      ${s.description ? `<p class="text-sm text-gray-300 mb-4 leading-relaxed">${esc(s.description)}</p>` : ''}
      <div class="space-y-3">
        ${hasSoleil ? buildCollapsible('ds-soleil', `☀️ Étoile${soleil.nom ? ' : ' + esc(soleil.nom) : ''}`, `
          <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
            ${soleil.classe ? `<div><dt class="text-gray-500 text-xs">Classe</dt><dd class="text-yellow-300">${esc(soleil.classe)}</dd></div>` : ''}
            ${soleil.diametre ? `<div><dt class="text-gray-500 text-xs">Diamètre</dt><dd>${esc(String(soleil.diametre))} K</dd></div>` : ''}
            ${soleil.distanceSaut ? `<div><dt class="text-gray-500 text-xs">Limite de saut</dt><dd class="text-blue-300 font-semibold">${esc(String(soleil.distanceSaut))} US</dd></div>` : ''}
          </dl>
          ${soleil.texte_ambiance ? `<p class="text-xs text-gray-400 italic mb-2 leading-relaxed">${esc(soleil.texte_ambiance)}</p>` : ''}
          ${soleil.description ? `<p class="text-xs text-gray-400 leading-relaxed">${esc(soleil.description)}</p>` : ''}
          ${Array.isArray(soleil.activiteSolaire) && soleil.activiteSolaire.length ? `
            <p class="text-xs text-gray-400 font-semibold mt-3 mb-1">Activité solaire :</p>
            <table class="w-full text-xs border-collapse">
              <thead><tr class="border-b border-gray-700"><th class="text-left pb-1 pr-4 text-gray-500">Distance</th><th class="text-left pb-1 text-gray-500">Conséquence</th></tr></thead>
              <tbody>${soleil.activiteSolaire.map(a => `<tr class="border-b border-gray-800"><td class="py-1 pr-4 text-gray-400">${esc(String(a.distance ?? ''))}</td><td class="py-1 text-gray-400">${esc(String(a.consequence ?? ''))}</td></tr>`).join('')}</tbody>
            </table>` : ''}
        `, false) : ''}
        ${corps.length ? buildCollapsible('ds-corps', `🪐 Corps célestes (${corps.length})`,
          `<div class="space-y-2">${corps.map(b => bodyRowHtml(b)).join('')}</div>`, false) : ''}
        ${(corps.length || hasSoleil) ? buildCollapsible('ds-matrix', '📐 Matrice des distances', buildDistanceMatrix(soleil, corps), false) : ''}
      </div>`;

  } else if (entityType === 'factions') {
    const f = entity;
    title = esc(f.name);
    editType = 'factions'; editId = f.id;

    content = `
      <div class="flex gap-4 mb-5">
        <div class="flex-shrink-0">
          ${f.icon_url
            ? `<div style="width:100px;height:100px;background:#1f2937;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #374151"><img src="${esc(f.icon_url)}" style="max-width:100%;max-height:100%;object-fit:contain" alt=""></div>`
            : `<div style="width:100px;height:100px;background:#374151;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2.5rem">🏴</div>`}
        </div>
        <div class="flex-1 space-y-2 pt-1">
          ${f.short ? `<p class="text-gray-400 text-sm font-mono bg-gray-900 border border-gray-700 rounded px-3 py-1.5 inline-block">${esc(f.short)}</p>` : ''}
          ${f.color ? `<div class="flex items-center gap-2"><span class="inline-block w-5 h-5 rounded-full border border-gray-600 flex-shrink-0" style="background:${esc(f.color)}"></span><span class="text-xs text-gray-500">${esc(f.color)}</span></div>` : ''}
        </div>
      </div>
      ${f.description
        ? `<p class="text-sm text-gray-300 leading-relaxed">${esc(f.description)}</p>`
        : '<p class="text-sm text-gray-500 italic">Aucune description.</p>'}`;

  } else if (entityType === 'ship_models') {
    title = esc(entity.nom || 'Modèle');
    editType = 'ship_models'; editId = entity.id;
    content = renderShipModelCard(entity);
  }

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl mb-8">
      <div class="flex items-start justify-between mb-5">
        <h2 class="text-xl font-bold pr-4 leading-tight">${title}</h2>
        <button id="detail-close" class="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-200 text-xl rounded-lg hover:bg-gray-700 transition-colors">✕</button>
      </div>
      <div id="detail-content">${content}</div>
      ${canEdit && editType ? `
        <div class="border-t border-gray-700/50 pt-4 mt-5">
          <button data-edit-type="${esc(editType)}" data-edit-id="${esc(String(editId))}"
            class="edit-btn text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors">
            ✏️ Modifier
          </button>
        </div>` : ''}
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });

  // Wire collapsible section toggles
  overlay.querySelectorAll('.section-toggle-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const target = document.getElementById(btn.dataset.target);
      const arrow = btn.querySelector('.section-toggle-arrow');
      if (!target) return;
      target.classList.toggle('hidden');
      if (arrow) arrow.textContent = target.classList.contains('hidden') ? '▶' : '▼';
    });
  });
}

// --- Stellar systems helpers ---
function buildCollapsible(id, title, content, startCollapsed = false) {
  const hiddenCls = startCollapsed ? 'hidden' : '';
  const arrow = startCollapsed ? '▶' : '▼';
  return `
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/60 hover:bg-gray-900/80 transition-colors text-left section-toggle-btn" data-target="${id}">
        <span class="section-toggle-arrow text-gray-500 text-xs">${arrow}</span>
        <span class="text-sm font-medium text-gray-300 flex-1">${title}</span>
      </button>
      <div id="${id}" class="px-3 py-3 ${hiddenCls}">${content}</div>
    </div>`;
}

function buildDistanceMatrix(soleil, corps) {
  const pts = [];
  const hasStar = soleil && Object.keys(soleil).length > 0;
  if (hasStar) pts.push({ nom: soleil.nom || 'Étoile', orbite: 0, type: 'star' });
  if (Array.isArray(corps)) corps.forEach(c => pts.push({ nom: c.nom || '?', orbite: parseFloat(c.orbite) || 0, type: 'body' }));
  const distSaut = hasStar && soleil.distanceSaut ? parseFloat(soleil.distanceSaut) : null;
  if (distSaut) pts.push({ nom: 'Limite de Saut', orbite: distSaut, type: 'limit' });

  if (pts.length < 2) return '<p class="text-xs text-gray-500 italic">Données insuffisantes pour la matrice des distances.</p>';

  let t = `<p class="text-xs text-gray-500 mb-3 italic">Distances en US. Les trajets planète→planète incluent un modificateur de position variable (dés, non affiché ici).</p>
    <div class="overflow-x-auto"><table class="text-xs border-collapse min-w-max">
    <thead><tr>
      <th class="px-2 py-1 text-gray-500 bg-gray-900 sticky left-0 z-10"></th>
      ${pts.map(p => `<th class="px-2 py-1 border border-gray-700 text-gray-400 whitespace-nowrap bg-gray-900/80">${esc(p.nom)}</th>`).join('')}
    </tr></thead><tbody>`;

  pts.forEach(p1 => {
    t += `<tr><th class="px-2 py-1 border border-gray-700 text-gray-400 text-left whitespace-nowrap sticky left-0 bg-gray-800/90 z-10">${esc(p1.nom)}</th>`;
    pts.forEach(p2 => {
      let cell;
      if (p1 === p2) {
        cell = '<span class="text-gray-600">0</span>';
      } else {
        const diff = Math.abs(p1.orbite - p2.orbite);
        const val = Number.isInteger(diff) ? diff : diff.toFixed(1);
        const mod = (p1.type === 'body' && p2.type === 'body') ? '<br><span class="text-gray-600 text-[10px]">+mod.pos.</span>' : '';
        cell = `${val}<span class="text-gray-500"> US</span>${mod}`;
      }
      t += `<td class="px-2 py-1 border border-gray-700 text-center text-gray-300 whitespace-nowrap">${cell}</td>`;
    });
    t += '</tr>';
  });

  t += '</tbody></table></div>';
  return t;
}

// --- Systèmes Solaires renderer ---
function renderPlanets(panel, _ignore) {
  const rawSystems = state.systems;
  const canEdit = state.isMJ || state.isAdmin;

  if (!rawSystems.length) { renderEmptyState(panel, 'planets'); return; }

  // Sort by faction then by name
  const systems = [...rawSystems].sort((a, b) => {
    const fa = (a.faction || '').toLowerCase(), fb = (b.faction || '').toLowerCase();
    if (fa < fb) return -1; if (fa > fb) return 1;
    const na = (a.nom || '').toLowerCase(), nb = (b.nom || '').toLowerCase();
    if (na < nb) return -1; if (na > nb) return 1;
    return 0;
  });

  const cards = systems.map(sys => {
    let soleil = {}, corps = [], patrouilles = [];
    try { soleil = JSON.parse(sys.soleil_json || 'null') || {}; } catch { soleil = {}; }
    try { corps = JSON.parse(sys.corps_celestes_json || 'null') || []; } catch { corps = []; }
    try { patrouilles = JSON.parse(sys.patrouilles_json || 'null') || []; } catch { patrouilles = []; }

    const sid = `sys${sys.id}`;
    const hasSoleil = Object.keys(soleil).length > 0;
    const isHidden = canEdit && sys.visible === 0;

    // Informations générales
    const infoContent = `
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        ${sys.gouvernement ? `<div><dt class="text-gray-500 text-xs">Gouvernement</dt><dd class="text-gray-200">${esc(sys.gouvernement)}</dd></div>` : ''}
        ${sys.route ? `<div><dt class="text-gray-500 text-xs">Route</dt><dd class="text-gray-200">${esc(sys.route)}</dd></div>` : ''}
        ${sys.is_frontiere ? `<div class="col-span-2"><dd class="text-amber-400 text-xs mt-1">⚠️ Zone de Frontière</dd></div>` : ''}
        ${sys.texte_ambiance ? `<div class="col-span-2 mt-1"><dt class="text-gray-500 text-xs mb-1">Texte d'ambiance</dt><dd class="text-gray-400 italic leading-relaxed">${esc(sys.texte_ambiance)}</dd></div>` : ''}
        ${sys.description ? `<div class="col-span-2 mt-1"><dt class="text-gray-500 text-xs mb-1">Description</dt><dd class="text-gray-300 leading-relaxed">${esc(sys.description)}</dd></div>` : (!sys.gouvernement && !sys.route ? '<div class="col-span-2"><dd class="text-gray-600 italic text-xs">Aucune donnée.</dd></div>' : '')}
      </dl>`;

    // Soleil / Étoile
    const soleilContent = hasSoleil ? `
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
        ${soleil.nom ? `<div><dt class="text-gray-500 text-xs">Nom</dt><dd class="text-gray-200">${esc(soleil.nom)}</dd></div>` : ''}
        ${soleil.classe ? `<div><dt class="text-gray-500 text-xs">Classe</dt><dd class="text-yellow-300">${esc(soleil.classe)}</dd></div>` : ''}
        ${soleil.diametre ? `<div><dt class="text-gray-500 text-xs">Diamètre</dt><dd class="text-gray-200">${esc(String(soleil.diametre))} K</dd></div>` : ''}
        ${soleil.distanceSaut ? `<div><dt class="text-gray-500 text-xs">Limite de saut</dt><dd class="text-blue-300 font-semibold">${esc(String(soleil.distanceSaut))} US</dd></div>` : ''}
      </dl>
      ${soleil.texte_ambiance ? `<p class="text-sm text-gray-400 italic mb-2 leading-relaxed">${esc(soleil.texte_ambiance)}</p>` : ''}
      ${soleil.description ? `<p class="text-sm text-gray-400 mb-3 leading-relaxed">${esc(soleil.description)}</p>` : ''}
      ${Array.isArray(soleil.activiteSolaire) && soleil.activiteSolaire.length ? `
        <p class="text-xs text-gray-400 font-semibold mb-2">Activité solaire :</p>
        <table class="w-full text-xs border-collapse">
          <thead><tr class="border-b border-gray-700"><th class="text-left pb-1 pr-6 text-gray-500">Distance</th><th class="text-left pb-1 text-gray-500">Conséquence</th></tr></thead>
          <tbody>${soleil.activiteSolaire.map(a => `<tr class="border-b border-gray-800"><td class="py-1 pr-6 text-gray-400">${esc(String(a.distance ?? ''))}</td><td class="py-1 text-gray-400">${esc(String(a.consequence ?? ''))}</td></tr>`).join('')}</tbody>
        </table>` : ''}
    ` : '<p class="text-xs text-gray-500 italic">Aucune donnée stellaire enregistrée.</p>';

    // Corps célestes renderer (recursive for moons)
    const bodyHtml = (body, depth = 0) => {
      const safeNom = (body.nom || '?').replace(/\W+/g, '');
      const bodyId = `${sid}-b${depth}-${safeNom}-${Math.round((body.orbite || 0) * 10)}`;
      const orbStr = body.orbite != null ? ` — <span class="text-blue-300 text-xs">${body.orbite} US</span>` : '';
      const icon = depth > 0 ? '🌙' : '🪐';

      const stats = [
        ['Atmosphère', body.atmosphere ? `${body.atmosphere}${body.atmosphereDetail ? ` (${body.atmosphereDetail})` : ''}` : null],
        ['Gravité', body.gravite],
        ['Niveau technologique', body.techno],
        ['Gouvernement', body.gouvernement],
        ['Commerce', body.commerce],
        ['Population', body.population],
        ['Sécurité', body.securite != null ? `${body.securite}` : null],
        ['Diamètre', body.diametre ? `${body.diametre} K` : null],
      ].filter(([, v]) => v != null && v !== '');

      const marches = [
        body.marchandiseA ? `A : ${body.marchandiseA}` : '',
        body.marchandiseB ? `B : ${body.marchandiseB}` : '',
        body.marchandiseC ? `C : ${body.marchandiseC}` : '',
        body.illegal ? `Illégal : ${body.illegal}` : '',
      ].filter(Boolean).join(' · ');

      const inner = `
        ${body.texte_ambiance ? `<p class="text-xs text-gray-400 italic mb-2 leading-relaxed">${esc(body.texte_ambiance)}</p>` : ''}
        ${body.description ? `<p class="text-xs text-gray-400 mb-3 leading-relaxed">${esc(body.description)}</p>` : ''}
        ${stats.length ? `<dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-3">${stats.map(([k, v]) => `<div><dt class="text-gray-500">${esc(k)}</dt><dd class="text-gray-300">${esc(String(v))}</dd></div>`).join('')}</dl>` : ''}
        ${Array.isArray(body.environnements) && body.environnements.length ? `<p class="text-xs text-gray-400 mb-2">🌍 Environnements : ${body.environnements.map(e => esc(e)).join(', ')}</p>` : ''}
        ${marches ? `<p class="text-xs text-gray-500 mb-2">Marchés : ${esc(marches)}</p>` : ''}
        ${Array.isArray(body.astroports) && body.astroports.length ? `<p class="text-xs text-gray-400 mb-2">🛸 Astroports : ${body.astroports.map(a => esc((a.nom || '?') + (a.type ? ` (${a.type})` : ''))).join(', ')}</p>` : ''}
        ${Array.isArray(body.lieux) && body.lieux.length ? `<p class="text-xs text-gray-400 mb-2">📍 Lieux : ${body.lieux.map(l => esc(l.nom || '?')).join(', ')}</p>` : ''}
        ${Array.isArray(body.patrouilles) && body.patrouilles.length ? `<p class="text-xs text-gray-400 mb-2">👮 Patrouilles : ${body.patrouilles.map(p => esc(`${p.vaisseaux || ''} (${p.cout || ''})`)).join(', ')}</p>` : ''}
        ${Array.isArray(body.lunes) && body.lunes.length ? `<div class="mt-2 pl-2 space-y-2 border-l-2 border-gray-700">${body.lunes.map(l => bodyHtml(l, depth + 1)).join('')}</div>` : ''}`;
      return buildCollapsible(bodyId, `${icon} ${esc(body.nom || '?')}${orbStr}`, inner, true);
    };

    const corpsCount = Array.isArray(corps) ? corps.length : 0;
    const corpsContent = corpsCount
      ? `<div class="space-y-2">${corps.map(b => bodyHtml(b)).join('')}</div>`
      : '<p class="text-xs text-gray-500 italic">Aucun corps céleste enregistré pour ce système.</p>';

    const patrContent = Array.isArray(patrouilles) && patrouilles.length
      ? `<table class="w-full text-xs border-collapse"><thead><tr class="border-b border-gray-700"><th class="text-left pb-1 pr-6 text-gray-500">Coût</th><th class="text-left pb-1 text-gray-500">Vaisseaux</th></tr></thead><tbody>${patrouilles.map(p => `<tr class="border-b border-gray-800"><td class="py-1 pr-6 text-gray-400">${esc(p.cout || '—')}</td><td class="py-1 text-gray-400">${esc(p.vaisseaux || '—')}</td></tr>`).join('')}</tbody></table>`
      : null;

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-xl mb-4 overflow-hidden${isHidden ? ' opacity-50' : ''}">
        <div class="flex items-center bg-gray-900/80 border-b border-gray-700 px-4 py-3 gap-3 cursor-pointer sys-card-header" data-sys-content="${sid}-content">
          <span class="text-gray-500 text-xs sys-arrow">▶</span>
          <span class="font-bold text-white flex-1 flex items-center flex-wrap gap-x-2 gap-y-1">
            🌌 ${esc(sys.nom)}
            <span class="text-xs text-gray-400 font-normal">${esc(sys.quadrant || '')}</span>
            ${sys.faction ? `<span class="text-xs text-gray-500" style="display:inline-flex;align-items:center;gap:2px">· ${factionBadge(sys.faction)}</span>` : ''}
            ${sys.is_frontiere ? `<span class="text-amber-400 text-xs bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded">⚠️ Frontière</span>` : ''}
            ${isHidden ? '<span class="text-gray-600 text-xs">(masqué)</span>' : ''}
          </span>
          <div class="flex gap-1 flex-shrink-0 sys-action-btns">
            ${canEdit ? renderEditButton('systems', sys) : ''}
            ${canEdit ? renderVisibilityToggle('systems', sys) : ''}
            ${canEdit ? `<button class="del-sys-btn min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/30 transition-colors" data-sys-id="${esc(String(sys.id))}" data-sys-nom="${esc(sys.nom)}" title="Supprimer">🗑️</button>` : ''}
          </div>
        </div>
        <div id="${sid}-content" class="p-4 space-y-3 hidden">
          ${buildCollapsible(`${sid}-info`, 'Informations générales', infoContent, true)}
          ${buildCollapsible(`${sid}-soleil`, '☀️ Étoile / Soleil', soleilContent, true)}
          ${buildCollapsible(`${sid}-corps`, `🪐 Corps célestes (${corpsCount})`, corpsContent, true)}
          ${buildCollapsible(`${sid}-matrix`, '📐 Matrice des distances', buildDistanceMatrix(soleil, corps), true)}
        </div>
      </div>`;
  });

  panel.innerHTML = cards.join('');

  // Section collapsible toggle buttons
  panel.querySelectorAll('.section-toggle-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const target = document.getElementById(btn.dataset.target);
      const arrow = btn.querySelector('.section-toggle-arrow');
      if (!target) return;
      const nowHidden = target.classList.toggle('hidden');
      if (arrow) arrow.textContent = nowHidden ? '▶' : '▼';
    });
  });

  // System card header → collapse/expand the entire card
  panel.querySelectorAll('.sys-card-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.edit-btn, .vis-toggle, .del-sys-btn')) return;
      const target = document.getElementById(header.dataset.sysContent);
      const arrow = header.querySelector('.sys-arrow');
      if (!target) return;
      const nowHidden = target.classList.toggle('hidden');
      if (arrow) arrow.textContent = nowHidden ? '▶' : '▼';
    });
  });

  // System delete button
  panel.querySelectorAll('.del-sys-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Supprimer le système « ${btn.dataset.sysNom} » ? Cette action est irréversible.`)) return;
      fetch(`/api/systems/${btn.dataset.sysId}`, { method: 'DELETE', credentials: 'include' })
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) throw new Error(j.error?.message || `Erreur ${j.status || ''}`);
          state.systems = state.systems.filter(s => String(s.id) !== btn.dataset.sysId);
          renderActiveTab();
        })
        .catch(ex => alert(`Erreur : ${ex.message}`));
    });
  });
}

function openPlanetDetailSheet(p) {
  const existing = document.getElementById('detail-sheet-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'detail-sheet-overlay';
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';
  const sysName = state.systems.find(s => String(s.id) === String(p.system_id))?.nom || `#${p.system_id}`;
  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-xl p-6 shadow-2xl mb-8">
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-xl font-bold">${esc(p.nom)}</h2>
          <p class="text-gray-400 text-sm mt-0.5">Système : ${esc(sysName)} · Orbite ${p.ordre_orbital ?? '—'}</p>
        </div>
        <button id="detail-close" class="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-200 text-xl rounded-lg hover:bg-gray-700 transition-colors">✕</button>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        ${p.type ? `<div><dt class="text-gray-500 text-xs">Type</dt><dd>${esc(p.type)}</dd></div>` : ''}
        ${p.taille ? `<div><dt class="text-gray-500 text-xs">Taille</dt><dd>${esc(p.taille)}</dd></div>` : ''}
        ${p.atmosphere ? `<div><dt class="text-gray-500 text-xs">Atmosphère</dt><dd>${esc(p.atmosphere)}</dd></div>` : ''}
        ${p.gouvernement ? `<div><dt class="text-gray-500 text-xs">Gouvernement</dt><dd>${esc(p.gouvernement)}</dd></div>` : ''}
        ${p.population ? `<div><dt class="text-gray-500 text-xs">Population</dt><dd>${esc(p.population)}</dd></div>` : ''}
        ${p.ressources ? `<div class="col-span-2"><dt class="text-gray-500 text-xs">Ressources</dt><dd>${esc(p.ressources)}</dd></div>` : ''}
      </dl>
      ${p.description ? `<p class="text-sm text-gray-300 mb-3 leading-relaxed">${esc(p.description)}</p>` : ''}
      ${(state.isMJ || state.isAdmin) && p.notes_mj ? `<div class="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-400 mb-3"><strong>Notes MJ :</strong> ${esc(p.notes_mj)}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function openPlanetModal(planet) {
  const isNew = !planet;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';
  const v = (k) => planet ? planet[k] ?? '' : '';

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isNew ? '+ Nouvel astre' : `Modifier : ${esc(planet.nom)}`}</h2>
        <button id="pm-close" class="text-gray-400 hover:text-gray-200 text-xl">✕</button>
      </div>
      <p id="pm-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Nom *</label>
          <input id="pm-nom" type="text" value="${esc(v('nom'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Système stellaire</label>
          <select id="pm-system" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Choisir —</option>
            ${state.systems.map(s => `<option value="${esc(String(s.id))}" ${String(s.id) === String(v('system_id')) ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Type</label>
          <input id="pm-type" type="text" value="${esc(v('type'))}" placeholder="Tellurique, Géante gazeuse…" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Ordre orbital</label>
          <input id="pm-orbite" type="number" value="${esc(v('ordre_orbital'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Taille</label>
          <input id="pm-taille" type="text" value="${esc(v('taille'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Atmosphère</label>
          <input id="pm-atmo" type="text" value="${esc(v('atmosphere'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Gouvernement</label>
          <input id="pm-gouv" type="text" value="${esc(v('gouvernement'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Population</label>
          <input id="pm-pop" type="text" value="${esc(v('population'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Ressources</label>
          <input id="pm-ressources" type="text" value="${esc(v('ressources'))}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Description</label>
          <textarea id="pm-description" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(v('description'))}</textarea>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Notes MJ (privé)</label>
          <textarea id="pm-notes-mj" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(v('notes_mj'))}</textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="pm-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="pm-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#pm-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#pm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pm-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#pm-error');
    errEl.classList.add('hidden');
    const nom = overlay.querySelector('#pm-nom').value.trim();
    if (!nom) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }
    const systemId = overlay.querySelector('#pm-system').value;
    const body = {
      nom,
      system_id: systemId ? Number(systemId) : null,
      type: overlay.querySelector('#pm-type').value.trim(),
      ordre_orbital: overlay.querySelector('#pm-orbite').value.trim() !== '' ? Number(overlay.querySelector('#pm-orbite').value) : null,
      taille: overlay.querySelector('#pm-taille').value.trim(),
      atmosphere: overlay.querySelector('#pm-atmo').value.trim(),
      gouvernement: overlay.querySelector('#pm-gouv').value.trim(),
      population: overlay.querySelector('#pm-pop').value.trim(),
      ressources: overlay.querySelector('#pm-ressources').value.trim(),
      description: overlay.querySelector('#pm-description').value.trim(),
      notes_mj: overlay.querySelector('#pm-notes-mj').value.trim(),
    };
    try {
      const url = isNew ? '/api/planets' : `/api/planets/${planet.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
      overlay.remove();
      // Reload planets
      const pr = await fetch('/api/planets', { credentials: 'include' });
      const pj = await pr.json();
      state.planets = pj.data ?? [];
      renderActiveTab();
    } catch (ex) {
      errEl.textContent = ex.message; errEl.classList.remove('hidden');
    }
  });
}
function sortedData(data, col, dir) {
  return [...data].sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (typeof va === 'number' || col === 'is_frontiere') {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortHeaderHtml(col, label, sortState) {
  const active = sortState.col === col;
  const icon = active ? (sortState.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return `<th class="pb-2 pr-3 text-left cursor-pointer select-none whitespace-nowrap hover:text-gray-200 ${active ? 'text-blue-400' : 'text-gray-400'}" data-sort="${col}">${label}${icon}</th>`;
}

function bindTableSort(panel, sortState, renderFn) {
  panel.querySelectorAll('[data-sort]').forEach(th => {
    const fresh = th.cloneNode(true);
    th.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const col = fresh.dataset.sort;
      if (sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else { sortState.col = col; sortState.dir = 'asc'; }
      renderFn();
    });
  });
}

function renderSystems(panel, systems) {
  if (systems.length === 0) { renderEmptyState(panel, 'systems'); return; }
  const canEdit = state.isMJ || state.isAdmin;
  const ss = state.systemsSort;

  panel.innerHTML = `
    ${canEdit ? `<div class="mb-4 flex justify-end gap-2">
      <input type="file" id="import-systems-file" accept=".json" class="hidden">
      <button id="btn-export-systems" class="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">⬇ Exporter JSON</button>
      <button id="btn-import-systems" class="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">⬆ Importer JSON</button>
      <button id="btn-new-system" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">+ Nouveau système</button>
    </div>` : ''}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-xs">
            ${sortHeaderHtml('nom', 'Système solaire', ss)}
            ${sortHeaderHtml('quadrant', 'Quadrant', ss)}
            ${sortHeaderHtml('faction', 'Nation Stellaire', ss)}
            ${sortHeaderHtml('is_frontiere', 'Frontière ?', ss)}
            ${sortHeaderHtml('gouvernement', 'Type de gouvernement', ss)}
            ${sortHeaderHtml('route', 'Type de Route', ss)}
            ${canEdit ? `<th class="pb-2 pr-3 text-left text-gray-400 text-xs">Visibilité</th>` : ''}
            ${canEdit ? `<th class="pb-2 text-left text-gray-400 text-xs">Modifier</th>` : ''}
          </tr>
        </thead>
        <tbody id="systems-tbody"></tbody>
      </table>
    </div>`;

  const tbody = panel.querySelector('#systems-tbody');
  const render = () => {
    tbody.innerHTML = '';
    sortedData(systems, ss.col, ss.dir).forEach(s => {
      const hidden = state.isMJ && !s.visible;
      const row = document.createElement('tr');
      row.className = `border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${hidden ? 'opacity-50' : ''}`;
      row.innerHTML = `
        <td class="py-2 pr-3 font-medium whitespace-nowrap">${esc(s.nom)}</td>
        <td class="py-2 pr-3 text-gray-400 text-xs">${esc(s.quadrant)}</td>
        <td class="py-2 pr-3 text-gray-400 text-xs">${s.faction ? factionBadge(s.faction) : '—'}</td>
        <td class="py-2 pr-3 text-center text-xs">${s.is_frontiere ? '<span class="text-amber-400">⚠️</span>' : '—'}</td>
        <td class="py-2 pr-3 text-gray-400 text-xs">${esc(s.gouvernement || '—')}</td>
        <td class="py-2 pr-3 text-gray-400 text-xs">${esc(s.route || '—')}</td>
        ${canEdit ? `<td class="py-2 pr-3">${renderVisibilityToggle('systems', s)}</td>` : ''}
        ${canEdit ? `<td class="py-2">${renderEditButton('systems', s)}</td>` : ''}`;
      // Click row to open detail (NOT on action buttons)
      row.addEventListener('click', e => {
        if (e.target.closest('.vis-toggle,.edit-btn')) return;
        openDetailSheet('systems', s);
      });
      tbody.appendChild(row);
    });
    bindTableSort(panel, ss, render);
  };
  render();
  if (canEdit) {
    panel.querySelector('#btn-new-system')?.addEventListener('click', () => openSystemModal(null));
    panel.querySelector('#btn-export-systems')?.addEventListener('click', () => {
      const exportData = state.systems.map(({ id, visible, ...rest }) => rest);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `systemes-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    panel.querySelector('#btn-import-systems')?.addEventListener('click', () => {
      panel.querySelector('#import-systems-file').click();
    });
    panel.querySelector('#import-systems-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Le fichier doit contenir un tableau JSON.');
        const r = await fetchWithTable('/api/systems/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
        state.systems.push(...json.data);
        renderActiveTab();
      } catch (ex) {
        alert(`Erreur d'import : ${ex.message}`);
      } finally {
        e.target.value = '';
      }
    });
  }
}

function renderFactions(panel, factions) {
  if (factions.length === 0) { renderEmptyState(panel, 'factions'); return; }
  const canEdit = state.isMJ || state.isAdmin;
  const fs = state.factionsSort;

  panel.innerHTML = `
    ${canEdit ? `<div class="mb-4 flex justify-end"><button id="btn-new-faction" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">+ Nouvelle faction</button></div>` : ''}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-xs">
            <th class="pb-2 pr-3 text-left text-gray-400">Icône</th>
            ${sortHeaderHtml('name', 'Nom', fs)}
            ${sortHeaderHtml('short', 'Abréviation', fs)}
            <th class="pb-2 pr-3 text-left text-gray-400">Couleur</th>
            ${canEdit ? `<th class="pb-2 pr-3 text-left text-gray-400">Visibilité</th>` : ''}
            ${canEdit ? `<th class="pb-2 text-left text-gray-400">Modifier</th>` : ''}
          </tr>
        </thead>
        <tbody id="factions-tbody"></tbody>
      </table>
    </div>`;

  const tbody = panel.querySelector('#factions-tbody');
  const render = () => {
    tbody.innerHTML = '';
    sortedData(factions, fs.col, fs.dir).forEach(f => {
      const hidden = state.isMJ && !f.visible;
      const row = document.createElement('tr');
      row.className = `border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${hidden ? 'opacity-50' : ''}`;
      row.innerHTML = `
        <td class="py-2 pr-3">
          ${f.icon_url
            ? `<span style="display:inline-flex;width:100px;height:100px;align-items:center;justify-content:center;overflow:hidden;background:#111827;border-radius:8px;flex-shrink:0"><img src="${esc(f.icon_url)}" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain"></span>`
            : `<span style="display:inline-flex;width:100px;height:100px;align-items:center;justify-content:center;background:#374151;border-radius:8px;font-size:2rem">🏴</span>`}
        </td>
        <td class="py-2 pr-3 font-medium">${esc(f.name)}</td>
        <td class="py-2 pr-3 text-gray-400 text-xs font-mono">${esc(f.short || '—')}</td>
        <td class="py-2 pr-3">
          <span class="inline-block w-5 h-5 rounded border border-gray-600" style="background:${esc(f.color || '#888')}"></span>
        </td>
        ${canEdit ? `<td class="py-2 pr-3">${renderVisibilityToggle('factions', f)}</td>` : ''}
        ${canEdit ? `<td class="py-2">${renderEditButton('factions', f)}</td>` : ''}`;
      row.addEventListener('click', e => {
        if (e.target.closest('.vis-toggle,.edit-btn')) return;
        openDetailSheet('factions', f);
      });
      tbody.appendChild(row);
    });
    bindTableSort(panel, fs, render);
  };
  render();
  if (canEdit) {
    panel.querySelector('#btn-new-faction')?.addEventListener('click', () => openFactionModal(null));
  }
}

function renderShipModels(panel, models) {
  const canEdit = state.isMJ || state.isAdmin;

  let headerHtml = '';
  if (canEdit) {
    headerHtml = `<div class="mb-4 flex justify-end">
      <button id="btn-new-model" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">+ Nouveau modèle</button>
    </div>`;
  }

  if (models.length === 0) {
    panel.innerHTML = headerHtml;
    if (canEdit) panel.querySelector('#btn-new-model')?.addEventListener('click', () => openNewModelModal());
    const emptyDiv = document.createElement('div');
    renderEmptyState(emptyDiv, 'ship_models');
    panel.appendChild(emptyDiv.firstElementChild);
    return;
  }

  panel.innerHTML = headerHtml + `<div id="models-cards"></div>`;
  if (canEdit) panel.querySelector('#btn-new-model')?.addEventListener('click', () => openNewModelModal());

  const container = panel.querySelector('#models-cards');
  models.forEach(m => {
    let armement = [];
    try { armement = JSON.parse(m.armement_json || '[]'); } catch {}

    const statRow = (label, val) => val != null && val !== '' && val !== 0
      ? `<tr><td class="text-right text-gray-400 pr-3 py-0.5 text-xs">${label} :</td><td class="text-gray-100 text-xs font-medium">${esc(String(val))}</td></tr>`
      : '';

    const coqueTotal = Number(m.coque) || 10;
    const boxesPerSystem = Math.max(2, Math.ceil(coqueTotal / 4));
    const systemLabels = ['I', 'L', 'G', 'D ?'];
    const hullBoxes = systemLabels.map(lbl =>
      `<tr><td class="text-gray-400 pr-2 text-xs font-mono">${lbl} :</td><td class="text-xs">${Array(boxesPerSystem).fill('<span class="inline-block w-3 h-3 border border-gray-500 rounded-sm mr-0.5"></span>').join('')}</td></tr>`
    ).join('');

    const cardBodyId = `model-camp-body-${esc(String(m.id))}`;
    const isHidden = state.isMJ && !m.visible;

    const card = document.createElement('div');
    card.className = `bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-3 hover:border-gray-500 transition-colors${isHidden ? ' opacity-50' : ''}`;
    card.innerHTML = `
      <div class="flex items-center bg-gray-900 border-b border-gray-700 px-4 py-2 gap-3 cursor-pointer model-camp-header" data-body="${cardBodyId}">
        <span class="text-gray-500 text-xs model-camp-arrow">▶</span>
        <span class="text-white font-bold tracking-widest uppercase text-sm flex-1">${esc(m.nom)}</span>
        ${m.classe ? `<span class="text-gray-500 text-xs hidden sm:inline">${esc(m.classe)}</span>` : ''}
        ${m.origine ? `<span class="text-gray-600 text-xs hidden sm:inline">· ${esc(m.origine)}</span>` : ''}
        ${canEdit ? `<div class="flex gap-1.5 items-center">
          ${renderVisibilityToggle('ship_models', m)}
          ${renderEditButton('ship_models', m)}
          <button class="btn-del-model text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30" title="Supprimer">🗑️</button>
        </div>` : ''}
      </div>
      <div id="${cardBodyId}" class="flex hidden">
        <div class="flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden" style="width:100px;height:100px">
          ${m.image
            ? `<img src="${esc(m.image)}" alt="${esc(m.nom)}" class="max-w-full max-h-full w-auto h-auto object-contain" loading="lazy">`
            : `<span class="text-5xl select-none">🚀</span>`}
        </div>
        <div class="flex-1 p-4 overflow-auto">
          <table class="w-full border-collapse text-sm mb-3">
            <tbody>
              ${statRow('Classe', m.classe ? `${m.classe}${m.tonnage ? ` (${m.tonnage} t` : ''}${m.longueur ? `/${m.longueur} m` : ''}${m.tonnage || m.longueur ? ')' : ''}` : '')}
              ${statRow('Manœuvrabilité', m.manoeuvrabilite || '—')}
              ${statRow('Vitesse tactique', m.vitesse_tactique ? `${m.vitesse_tactique} K/t` : null)}
              ${statRow('Vitesse de croisière', m.vitesse_croisiere ? `${m.vitesse_croisiere} US/h (${m.vitesse_croisiere * 24} US/j)` : null)}
              ${statRow('Vitesse hyperspatiale', m.vitesse_hyperspatiale ? `${m.vitesse_hyperspatiale} PC/j` : null)}
              ${statRow('Autonomie', m.autonomie ? `${m.autonomie} PC` : null)}
              ${statRow('Blindage', m.blindage)}
              ${statRow('Coque', m.coque)}
            </tbody>
          </table>
          <table class="w-full border-collapse text-sm mb-3 border-t border-gray-700 pt-2">
            <tbody>${hullBoxes}</tbody>
          </table>
          ${m.senseurs_k || m.senseurs ? `
          <table class="w-full border-collapse text-sm mb-3 border-t border-gray-700">
            <tbody>${statRow('Senseurs', m.senseurs_k ? `${m.senseurs_k}${m.senseurs_us ? ` (${m.senseurs_us})` : ''}` : m.senseurs)}</tbody>
          </table>` : ''}
          ${armement.length ? `
          <div class="border-t border-gray-700 pt-2 mb-3">
            <p class="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Armement :</p>
            ${armement.map(a => `<p class="text-xs text-gray-200 ml-2">» ${esc(a.position || '')} : ${esc(a.nom || '')}${a.tourelle ? ' (tourelle)' : ''} ${a.degats ? `(${a.degats}/${a.mode_tir || ''}/${a.portee || ''}/${a.canonnier || ''})` : ''}</p>`).join('')}
          </div>` : ''}
          <table class="w-full border-collapse text-sm border-t border-gray-700">
            <tbody>
              ${statRow('Équipage', m.equipage)}
              ${statRow('Passagers', m.passagers)}
              ${statRow('Soute', m.soute ? `${m.soute} t` : null)}
              ${statRow('Prix', m.prix ? `${m.prix} ¢` : null)}
              ${statRow('Origine', m.origine)}
            </tbody>
          </table>
          ${m.description ? `<p class="mt-3 text-xs text-gray-400 border-t border-gray-700 pt-2">${esc(m.description)}</p>` : ''}
        </div>
      </div>`;

    // Collapse toggle
    card.querySelector('.model-camp-header').addEventListener('click', e => {
      if (e.target.closest('.vis-toggle,.edit-btn,.btn-del-model')) return;
      const bodyEl = document.getElementById(cardBodyId);
      const arrow = card.querySelector('.model-camp-arrow');
      if (!bodyEl) return;
      const nowHidden = bodyEl.classList.toggle('hidden');
      if (arrow) arrow.textContent = nowHidden ? '▶' : '▼';
    });

    // Delete button
    if (canEdit) {
      card.querySelector('.btn-del-model')?.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Supprimer le modèle « ${m.nom} » ? Cette action est irréversible.`)) return;
        try {
          const fetcher = state.tableId ? fetchWithTable : (u, o) => fetch(u, { ...o, credentials: 'include' });
          const r = await fetcher(`/api/ship-models/${m.id}`, { method: 'DELETE' });
          const json = await r.json();
          if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
          const idx = state.ship_models.findIndex(x => String(x.id) === String(m.id));
          if (idx !== -1) state.ship_models.splice(idx, 1);
          renderActiveTab();
        } catch (ex) { alert(ex.message); }
      });
    }

    container.appendChild(card);
  });
}

// --- Visibility toggle (MJ only) ---
function renderVisibilityToggle(entityType, entity) {
  if (!state.isMJ) return '';

  const isVis = entity.visible;
  return `
    <button class="vis-toggle flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors
      ${isVis ? 'text-green-400 hover:bg-green-900/30' : 'text-gray-600 hover:bg-gray-700/50'}"
      data-type="${entityType}" data-id="${esc(String(entity.id))}" data-visible="${isVis}" title="${isVis ? 'Visible aux joueurs' : 'Caché aux joueurs'}">
      ${isVis ? '👁️' : '👁️‍🗨️'}
    </button>`;
}

// Toggle handler (delegated on body)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.vis-toggle');
  if (!btn) return;

  const entityType = btn.dataset.type;
  const entityId = btn.dataset.id;
  const currentlyVisible = btn.dataset.visible === 'true';

  executeToggle(entityType, entityId, !currentlyVisible);
});

function showHideConfirmation(btn, entityType, entityId) {
  // Avoid duplicate confirmation
  if (btn.querySelector('.confirm-hide')) return;

  const confirm = document.createElement('div');
  confirm.className = 'confirm-hide absolute right-0 top-full mt-1 bg-gray-700 border border-gray-600 rounded-lg p-2 z-10 shadow-lg whitespace-nowrap';
  confirm.innerHTML = `
    <span class="text-xs text-gray-300 mr-2">Cacher ?</span>
    <button class="confirm-yes text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded min-h-[44px] min-w-[44px]">Confirmer</button>`;

  btn.style.position = 'relative';
  btn.appendChild(confirm);

  const timeoutId = setTimeout(() => confirm.remove(), 3000);

  confirm.querySelector('.confirm-yes').addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timeoutId);
    confirm.remove();
    executeToggle(entityType, entityId, false);
  });
}

async function executeToggle(entityType, entityId, newVisible) {
  const toggleKey = `${entityType}:${entityId}`;
  if (pendingToggles.has(toggleKey)) return;

  const list = state[entityType];
  const entity = list.find(e => String(e.id) === String(entityId));
  if (!entity) return;

  pendingToggles.add(toggleKey);

  // Optimistic UI update
  const oldVisible = entity.visible;
  entity.visible = newVisible;
  renderActiveTab();

  try {
    const res = await fetchWithTable(`/api/visibility/${entityType}/${entityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: newVisible })
    });
    if (!res.ok) throw new Error('Toggle failed');
  } catch {
    // Rollback
    entity.visible = oldVisible;
    renderActiveTab();
    showNotification('Erreur de synchronisation', 'error');
  } finally {
    pendingToggles.delete(toggleKey);
  }
}

// --- Poller ---
function stopPoller() {
  if (poller) { poller.stop(); poller = null; }
}

function startPoller() {
  if (state.isMJ) return; // MJ doesn't need polling badges

  stopPoller();
  poller = createPoller({
    onData: handleSyncData,
    onError: () => {},
    onReconnect: () => {}
  });
  poller.start();
}

function handleSyncData(data) {
  if (!data || !data.entities) return;

  for (const type of ['systems', 'factions', 'ship_models']) {
    const newCount = data.entities[type]?.count;
    if (newCount == null) continue;

    if (newCount !== state.lastKnownCounts[type]) {
      state.badges[type] = true;
      state.lastKnownCounts[type] = newCount;
    }
  }

  // Re-render tab nav to show badges
  setupTabNav();
}

// --- Notification ---
function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm z-50 shadow-lg ${
    type === 'error' ? 'bg-red-800 text-red-200' : 'bg-gray-700 text-gray-200'
  }`;
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// --- Search ---
function setupSearch() {
  const input = $('search-input');
  const clearBtn = $('search-clear');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    clearBtn.classList.toggle('hidden', q.length === 0);

    if (q.length < 2) {
      exitSearchMode();
      return;
    }

    searchTimeout = setTimeout(() => {
      performSearch(q);
    }, 300);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    exitSearchMode();
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      clearBtn.classList.add('hidden');
      exitSearchMode();
    }
  });
}

async function performSearch(query) {
  state.searchMode = true;
  updateSearchUI();

  try {
    const res = await fetchWithTable(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    const json = await res.json();
    state.searchResults = json.data ?? [];
  } catch {
    state.searchResults = [];
  }

  renderSearchResults(query);
}

function exitSearchMode() {
  if (!state.searchMode) return;
  state.searchMode = false;
  state.searchResults = [];
  $('search-results').classList.add('hidden');
  $('tab-nav').classList.remove('hidden');
  renderActiveTab();
}

function updateSearchUI() {
  $('tab-nav').classList.add('hidden');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  $('search-results').classList.remove('hidden');
  $('empty-global').classList.add('hidden');
}

function renderSearchResults(query) {
  const panel = $('search-results');
  const results = state.searchResults;

  if (results.length === 0) {
    panel.innerHTML = `
      <div class="text-center py-12 px-4">
        <p class="text-2xl mb-3">🔭</p>
        <p class="text-gray-400 italic max-w-md mx-auto">Aucun résultat pour « ${esc(query)} »… Les capteurs n'ont rien détecté dans ce secteur.</p>
      </div>`;
    return;
  }

  // Group by type
  const grouped = { systems: [], factions: [], ship_models: [] };
  for (const r of results) {
    if (grouped[r.type]) grouped[r.type].push(r);
  }

  const TYPE_LABELS = { systems: '🌌 Systèmes', factions: '📡 Factions', ship_models: '🚀 Vaisseaux' };
  let html = '';

  for (const type of ['systems', 'factions', 'ship_models']) {
    const items = grouped[type];
    if (items.length === 0) continue;

    html += `<h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-6 first:mt-0">${TYPE_LABELS[type]}</h2>`;

    const renderers = { systems: renderSystemCard, factions: renderFactionCard, ship_models: renderShipModelCard };
    html += items.map(item => renderers[type](item)).join('');
  }

  panel.innerHTML = html;
}

function renderSystemCard(s) {
  const hidden = state.isMJ && !s.visible;
  return `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors${hidden ? ' opacity-50' : ''}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">${esc(s.nom)}${hidden ? ' <span class="text-gray-500 ml-1" title="Caché aux joueurs">👁️‍🗨️</span>' : ''}</h3>
          <div class="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>📍 ${esc(s.quadrant)}</span>
            ${s.faction ? `<span>${factionBadge(s.faction)}</span>` : ''}
            ${s.gouvernement ? `<span>🏛️ ${esc(s.gouvernement)}</span>` : ''}
            ${s.is_frontiere ? '<span class="text-amber-400">⚠️ Frontière</span>' : ''}
          </div>
          ${s.description ? `<p class="text-sm text-gray-400 mt-2 line-clamp-2">${esc(s.description)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          ${renderEditButton('systems', s)}
          ${renderVisibilityToggle('systems', s)}
        </div>
      </div>
    </div>`;
}

function renderFactionCard(f) {
  const hidden = state.isMJ && !f.visible;
  return `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors${hidden ? ' opacity-50' : ''}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">
            ${f.icon ? `<span class="mr-1">${esc(f.icon)}</span>` : ''}${esc(f.name)}${hidden ? ' <span class="text-gray-500 ml-1" title="Caché aux joueurs">👁️‍🗨️</span>' : ''}
            ${f.short ? `<span class="text-xs text-gray-500 ml-2">(${esc(f.short)})</span>` : ''}
          </h3>
          ${f.description ? `<p class="text-sm text-gray-400 mt-2 line-clamp-2">${esc(f.description)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          ${renderEditButton('factions', f)}
          ${renderVisibilityToggle('factions', f)}
        </div>
      </div>
    </div>`;
}

function renderShipModelCard(m) {
  const hidden = state.isMJ && !m.visible;
  const statRow = (icon, label, val) =>
    `<div class="flex items-center gap-1.5"><span class="text-gray-500 text-xs">${icon}</span><span class="text-gray-400 text-xs">${label}</span><span class="text-gray-200 text-xs font-medium ml-auto">${val}</span></div>`;
  let armement = [];
  try { armement = JSON.parse(m.armement_json || '[]'); } catch {}
  const coqueTotal = Number(m.coque) || 10;
  const boxesPerSystem = Math.max(2, Math.ceil(coqueTotal / 4));
  const box = '<span class="inline-block w-3 h-3 border border-gray-500 rounded-sm mr-0.5 mb-0.5"></span>';
  const systemLabels = ['I', 'L', 'G', 'D ?'];
  const hullRows = systemLabels.map(lbl =>
    `<div class="flex items-center gap-1 text-xs"><span class="text-gray-400 w-7 font-mono shrink-0">${lbl} :</span><span>${Array(boxesPerSystem).fill(box).join('')}</span></div>`
  ).join('');

  return `
    <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-3${hidden ? ' opacity-50' : ''}">
      <div class="flex items-center bg-gray-900 border-b border-gray-700 px-4 py-2 gap-3">
        <span class="text-white font-bold tracking-widest uppercase text-sm flex-1">${esc(m.nom)}${hidden ? ' <span class="text-gray-500 text-xs ml-1" title="Caché">👁️‍🗨️</span>' : ''}</span>
        <div class="flex gap-1">
          ${renderEditButton('ship_models', m)}
          ${state.isMJ ? renderVisibilityToggle('ship_models', m) : ''}
        </div>
      </div>
      <div class="flex">
        <div class="flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden" style="width:100px;height:100px">
          ${m.image ? `<img src="${esc(m.image)}" alt="${esc(m.nom)}" class="max-w-full max-h-full w-auto h-auto object-contain" loading="lazy">` : `<span class="text-5xl select-none">🚀</span>`}
        </div>
        <div class="flex-1 p-3 min-w-0">
          <div class="grid grid-cols-1 gap-y-0.5 mb-2">
            ${m.classe ? statRow('⚙️', 'Classe', `${esc(m.classe)}${m.tonnage ? ` — ${esc(m.tonnage)} t` : ''}${m.longueur ? `/${esc(m.longueur)} m` : ''}`) : ''}
            ${statRow('🎮', 'Manœuvrabilité', esc(m.manoeuvrabilite || '—'))}
            ${m.vitesse_tactique ? statRow('⚡', 'V. tactique', `${esc(m.vitesse_tactique)} K/t`) : ''}
            ${m.vitesse_croisiere ? statRow('✈️', 'V. croisière', `${esc(String(m.vitesse_croisiere))} US/h`) : ''}
            ${m.vitesse_hyperspatiale ? statRow('🌀', 'V. hyperspatiale', `${esc(String(m.vitesse_hyperspatiale))} PC/j`) : ''}
            ${m.autonomie ? statRow('🔋', 'Autonomie', `${esc(String(m.autonomie))} PC`) : ''}
            ${m.blindage != null && m.blindage !== '' ? statRow('🛡', 'Blindage', esc(String(m.blindage))) : ''}
            ${m.coque != null && m.coque !== '' ? statRow('❤️', 'Coque', esc(String(m.coque))) : ''}
          </div>
          <div class="border-t border-gray-700/50 pt-2 mb-2">${hullRows}</div>
          ${m.senseurs_k || m.senseurs ? `<div class="border-t border-gray-700/50 pt-2 mb-2">${statRow('📡', 'Senseurs', m.senseurs_k ? `${esc(m.senseurs_k)}${m.senseurs_us ? ` (${esc(m.senseurs_us)})` : ''}` : esc(m.senseurs))}</div>` : ''}
          ${armement.length ? `<div class="border-t border-gray-700/50 pt-2 mb-2">
            <p class="text-xs text-gray-400 font-semibold mb-1">Armement :</p>
            ${armement.map(a => `<p class="text-xs text-gray-300 ml-2">» ${esc(a.position||'')} : ${esc(a.nom||'')}${a.tourelle ? ' (tourelle)' : ''}</p>`).join('')}
          </div>` : ''}
          <div class="border-t border-gray-700/50 pt-2 grid grid-cols-1 gap-y-0.5">
            ${m.equipage ? statRow('👥', 'Équipage', esc(m.equipage)) : ''}
            ${m.passagers ? statRow('🧑', 'Passagers', esc(m.passagers)) : ''}
            ${m.soute != null && m.soute !== '' ? statRow('📦', 'Soute', `${esc(String(m.soute))} t`) : ''}
            ${m.prix ? statRow('💰', 'Prix', `${esc(String(m.prix))} ¢`) : ''}
            ${m.origine ? statRow('🌐', 'Origine', esc(m.origine)) : ''}
          </div>
        </div>
      </div>
    </div>`;
}
// --- Util ---
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/** Render a faction as [25px icon] + [abbreviation], falling back to name */
function factionBadge(name) {
  if (!name) return '—';
  const f = state.factions.find(x => x.name === name);
  const icon = f?.icon_url
    ? '<img src="' + esc(f.icon_url) + '" alt="' + esc(f.short || f.name) + '" style="width:25px;height:25px;border-radius:3px;object-fit:contain;vertical-align:middle;flex-shrink:0">'
    : '';
  const label = f?.short ? esc(f.short) : esc(name);
  return '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">' + icon + '<span>' + label + '</span></span>';
}

// --- Edit modal (MJ only) ---

const EDIT_FIELDS = {
  systems: [
    { key: 'nom', label: 'Nom', type: 'text', required: true },
    { key: 'quadrant', label: 'Quadrant', type: 'text' },
    { key: 'faction', label: 'Faction', type: 'select', options: () => state.factions.map(f => ({ value: f.name, label: f.name })) },
    { key: 'gouvernement', label: 'Gouvernement', type: 'text' },
    { key: 'route', label: 'Route', type: 'text' },
    { key: 'is_frontiere', label: 'Frontière', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'textarea' }
  ],
  factions: [
    { key: 'name', label: 'Nom', type: 'text', required: true },
    { key: 'short', label: 'Abréviation', type: 'text' },
    { key: 'icon_url', label: "Icône (image — URL ou upload)", type: 'image_upload' },
    { key: 'color', label: 'Couleur', type: 'color' },
    { key: 'description', label: 'Description', type: 'textarea' }
  ],
  ship_models: [
    { key: 'nom', label: 'Nom', type: 'text', required: true },
    { key: 'classe', label: 'Classe', type: 'text' },
    { key: 'origine', label: 'Origine / Faction', type: 'text' },
    { key: 'tonnage', label: 'Tonnage', type: 'text' },
    { key: 'longueur', label: 'Longueur (m)', type: 'text' },
    { key: 'prix', label: 'Prix (cr.)', type: 'number' },
    { key: 'equipage', label: 'Équipage', type: 'text' },
    { key: 'passagers', label: 'Passagers', type: 'text' },
    { key: 'soute', label: 'Soute', type: 'text' },
    { key: 'blindage', label: 'Blindage', type: 'number' },
    { key: 'coque', label: 'Coque', type: 'number' },
    { key: 'vitesse_croisiere', label: 'Vitesse croisière (US/j)', type: 'number' },
    { key: 'vitesse_hyperspatiale', label: 'Vitesse hyperspatiale (pc/j)', type: 'number' },
    { key: 'vitesse_tactique', label: 'Vitesse tactique', type: 'text' },
    { key: 'autonomie', label: 'Autonomie (pc)', type: 'number' },
    { key: 'manoeuvrabilite', label: 'Manœuvrabilité', type: 'text' },
    { key: 'senseurs_k', label: 'Senseurs (K)', type: 'text' },
    { key: 'senseurs_us', label: 'Senseurs (US)', type: 'text' },
    { key: 'image', label: 'Image (URL ou upload)', type: 'image_upload' },
    { key: 'description', label: 'Description générale', type: 'textarea' },
    { key: 'history', label: 'Historique', type: 'textarea' },
    { key: 'mj_notes', label: 'Notes MJ (privé)', type: 'textarea' },
    { key: 'special_features', label: 'Particularités', type: 'textarea' }
  ]
};

const API_PATHS = {
  systems: '/api/systems',
  factions: '/api/factions',
  ship_models: '/api/ship-models'
};

function renderEditButton(entityType, entity) {
  if (!state.isMJ) return '';
  const idStr = esc(String(entity.id));
  return `<button class="edit-btn flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/30 transition-colors"
    data-edit-type="${entityType}" data-edit-id="${idStr}" title="Modifier">✏️</button>`;
}

function openEditModal(entityType, entityId) {
  // entityId === null means "create new"
  const isNew = entityId === null;
  const list = state[entityType];
  const entity = isNew ? {} : list?.find(e => String(e.id) === String(entityId));
  if (!isNew && !entity) return;

  const fields = EDIT_FIELDS[entityType];
  if (!fields) return;

  const overlay = document.createElement('div');
  overlay.id = 'edit-modal-overlay';
  overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4';

  const nameField = fields.find(f => f.required);
  const title = isNew ? 'Nouveau' : (entity[nameField?.key] || 'Entité');

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl" id="edit-modal-panel">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-100">${isNew ? 'Créer' : 'Modifier'} : ${esc(String(title))}</h2>
        <button id="edit-modal-close" class="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-200 rounded-lg">✕</button>
      </div>
      <div id="edit-modal-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3"></div>
      <form id="edit-modal-form" class="space-y-4">
        ${fields.map(f => renderEditField(f, entity)).join('')}
        <div class="flex gap-3 pt-2">
          <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg min-h-[44px] transition-colors">Sauvegarder</button>
          <button type="button" id="edit-modal-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-3 rounded-lg min-h-[44px] transition-colors">Annuler</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(overlay);

  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('#edit-modal-close').addEventListener('click', close);
  overlay.querySelector('#edit-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Image upload handlers (for fields of type image_upload)
  overlay.querySelectorAll('input[type="file"][data-upload-target]').forEach(fileInput => {
    const targetId = fileInput.dataset.uploadTarget;
    const previewId = fileInput.dataset.preview;
    const urlInput = overlay.querySelector(`#${targetId}`);
    const preview = overlay.querySelector(`#${previewId}`);
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
        if (urlInput) urlInput.value = json.data.url;
        if (preview) { preview.src = json.data.url; preview.classList.remove('hidden'); }
      } catch (ex) {
        const errEl = overlay.querySelector('#edit-modal-error');
        errEl.textContent = `Upload : ${ex.message}`; errEl.classList.remove('hidden');
      }
    });
    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (preview) { if (url) { preview.src = url; preview.classList.remove('hidden'); } else { preview.classList.add('hidden'); } }
      });
    }
  });

  // Focus first input
  const firstInput = overlay.querySelector('input, textarea');
  if (firstInput) firstInput.focus();

  // Submit handler
  overlay.querySelector('#edit-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitEdit(entityType, entityId, fields, overlay);
  });
}

function renderEditField(field, entity) {
  const value = entity[field.key];
  const id = `edit-field-${field.key}`;

  if (field.type === 'textarea') {
    return `<div>
      <label for="${id}" class="block text-sm text-gray-400 mb-1">${esc(field.label)}</label>
      <textarea id="${id}" name="${esc(field.key)}" rows="3" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 transition-colors">${esc(String(value ?? ''))}</textarea>
    </div>`;
  }

  if (field.type === 'checkbox') {
    return `<div class="flex items-center gap-3">
      <input type="checkbox" id="${id}" name="${esc(field.key)}" ${value ? 'checked' : ''} class="w-5 h-5 rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-500">
      <label for="${id}" class="text-sm text-gray-400">${esc(field.label)}</label>
    </div>`;
  }

  if (field.type === 'color') {
    return `<div>
      <label for="${id}" class="block text-sm text-gray-400 mb-1">${esc(field.label)}</label>
      <input type="color" id="${id}" name="${esc(field.key)}" value="${esc(String(value ?? '#888888'))}" class="w-12 h-10 bg-gray-900 border border-gray-600 rounded cursor-pointer">
    </div>`;
  }

  if (field.type === 'select') {
    const options = typeof field.options === 'function' ? field.options() : (field.options || []);
    return `<div>
      <label for="${id}" class="block text-sm text-gray-400 mb-1">${esc(field.label)}</label>
      <select id="${id}" name="${esc(field.key)}" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 min-h-[44px] text-gray-100 focus:outline-none focus:border-blue-500 transition-colors">
        <option value="">— Aucune —</option>
        ${options.map(opt => `<option value="${esc(opt.value)}" ${String(value ?? '') === opt.value ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
      </select>
    </div>`;
  }

  if (field.type === 'image_upload') {
    const imgId = `${id}-img`;
    return `<div>
      <label class="block text-sm text-gray-400 mb-1">${esc(field.label)}</label>
      <div class="flex gap-2">
        <input type="text" id="${id}" name="${esc(field.key)}" value="${esc(String(value ?? ''))}" placeholder="https://... ou laisser vide"
          class="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors">
        <label class="cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors flex items-center gap-1 whitespace-nowrap">
          📁 <span class="hidden sm:inline">Fichier</span>
          <input type="file" accept="image/*" class="hidden" data-upload-target="${id}" data-preview="${imgId}">
        </label>
      </div>
      ${value ? `<img id="${imgId}" src="${esc(String(value))}" class="mt-2 w-full max-h-32 object-cover rounded" alt="">` : `<div id="${imgId}" class="hidden mt-2 w-full max-h-32 flex items-center justify-center bg-gray-900 rounded"></div>`}
    </div>`;
  }

  return `<div>
    <label for="${id}" class="block text-sm text-gray-400 mb-1">${esc(field.label)}${field.required ? ' *' : ''}</label>
    <input type="${field.type}" id="${id}" name="${esc(field.key)}" value="${esc(String(value ?? ''))}" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 min-h-[44px] text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"${field.required ? ' required' : ''}>
  </div>`;
}

async function submitEdit(entityType, entityId, fields, overlay) {
  const form = overlay.querySelector('#edit-modal-form');
  const errorEl = overlay.querySelector('#edit-modal-error');
  errorEl.classList.add('hidden');

  const body = {};
  for (const field of fields) {
    const el = form.querySelector(`[name="${field.key}"]`);
    if (!el) continue;

    if (field.type === 'checkbox') {
      body[field.key] = el.checked ? 1 : 0;
    } else if (field.type === 'number') {
      const v = el.value.trim();
      if (v !== '') body[field.key] = Number(v);
    } else {
      body[field.key] = el.value;
    }
  }

  // Client validation
  const nameField = fields.find(f => f.required);
  if (nameField && (!body[nameField.key] || !String(body[nameField.key]).trim())) {
    errorEl.textContent = `Le champ "${nameField.label}" ne peut pas être vide`;
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const apiPath = API_PATHS[entityType];
    const isNew = entityId === null;
    const url = isNew ? apiPath : `${apiPath}/${entityId}`;
    const fetcher = state.tableId ? fetchWithTable : (u, o) => fetch(u, { ...o, credentials: 'include' });
    const res = await fetcher(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const msg = json?.error?.message || 'Erreur lors de la sauvegarde';
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
      return;
    }

    const json = await res.json();
    const updated = json.data;

    // Update local state
    const list = state[entityType];
    if (isNew) {
      if (updated) list.push(updated);
    } else {
      const idx = list.findIndex(e => String(e.id) === String(entityId));
        if (idx !== -1) {
        // Preserve visibility info from local state
        const vis = list[idx].visible;
        list[idx] = { ...updated, visible: vis };
      }
    }

    overlay.remove();
    renderActiveTab();
  } catch {
    errorEl.textContent = 'Erreur réseau';
    errorEl.classList.remove('hidden');
  }
}

// Click handler for edit buttons (delegated)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.edit-btn');
  if (!btn) return;
  const type = btn.dataset.editType;
  const id = btn.dataset.editId || null;
  if (type === 'ship_models') {
    const entity = id ? state.ship_models.find(m => String(m.id) === String(id)) : null;
    openShipModelModal(entity || null);
  } else if (type === 'factions') {
    const entity = id ? state.factions.find(f => String(f.id) === String(id)) : null;
    openFactionModal(entity || null);
  } else if (type === 'systems') {
    const entity = id ? state.systems.find(s => String(s.id) === String(id)) : null;
    openSystemModal(entity || null);
  } else {
    openEditModal(type, id);
  }
});

// --- Render Fleet (ships) ---
function renderFleet(panel, ships) {
  const canEdit = state.isMJ || state.isAdmin;

  let html = '';
  if (canEdit) {
    html += `<div class="mb-4 flex justify-between items-center">
      <h3 class="text-base font-semibold text-gray-200">Flotte de la table</h3>
      <button id="btn-add-fleet-ship" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">+ Nouveau vaisseau</button>
    </div>`;
  }

  if (!ships || ships.length === 0) {
    html += `<div class="text-center py-12 px-4"><p class="text-2xl mb-3">🚀</p>
      <p class="text-gray-400 italic">Aucun vaisseau dans la flotte. ${canEdit ? 'Ajoutez-en un pour commencer.' : ''}</p></div>`;
    panel.innerHTML = html;
    if (canEdit) panel.querySelector('#btn-add-fleet-ship')?.addEventListener('click', () => openFleetModal(null));
    return;
  }

  const statCell = (icon, label, val) =>
    `<div class="flex items-center gap-1.5"><span class="text-gray-500">${icon}</span><span class="text-gray-400">${label}</span><span class="text-gray-200 font-medium ml-auto">${val}</span></div>`;

  html += ships.map(s => {
    const hidden = state.isMJ && !s.visible;
    const img = s.image || s.model?.image || null;
    const mdl = s.model;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-3 hover:border-gray-500 transition-colors${hidden ? ' opacity-60' : ''}">
      <div class="flex">
        ${img
          ? `<div class="flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden rounded" style="width:100px;height:100px"><img src="${esc(img)}" alt="${esc(s.name)}" class="max-w-full max-h-full w-auto h-auto object-contain" loading="lazy"></div>`
          : `<div class="w-14 flex items-center justify-center flex-shrink-0 bg-gray-900/50 text-3xl select-none">🚀</div>`}
        <div class="flex-1 min-w-0 p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-lg text-gray-100 leading-tight">${esc(s.name)}</span>
                ${String(s.id) === String(state.activeShipId) ? '<span class="text-xs text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">🎯 Actif</span>' : ''}
                ${hidden ? '<span class="text-xs text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">Masqué</span>' : ''}
              </div>
              ${mdl ? `<div class="flex flex-wrap gap-1.5 mt-1">
                <span class="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800/50">${esc(mdl.nom)}</span>
                ${mdl.classe ? `<span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">${esc(mdl.classe)}</span>` : ''}
              </div>` : ''}
            </div>
            <div class="flex gap-1 flex-shrink-0">
              ${canEdit ? `
              <button class="fleet-edit-btn min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/30 transition-colors" data-ship-id="${esc(String(s.id))}" title="Modifier">✏️</button>
              <button class="fleet-vis-btn min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${s.visible !== false ? 'text-green-400 hover:bg-green-900/30' : 'text-gray-600 hover:bg-gray-700/50'}" data-ship-id="${esc(String(s.id))}" data-vis="${s.visible !== false}" title="${s.visible !== false ? 'Visible' : 'Masqué'}">
                ${s.visible !== false ? '👁️' : '👁️‍🗨️'}
              </button>
              <button class="fleet-del-btn min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/30 transition-colors" data-ship-id="${esc(String(s.id))}" data-ship-name="${esc(s.name)}" title="Supprimer">🗑️</button>
              ` : ''}
            </div>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            ${s.hull != null ? statCell('🛡', 'Coque', esc(String(s.hull))) : ''}
            ${mdl?.blindage != null && mdl?.blindage !== '' ? statCell('⚔️', 'Blindage', esc(String(mdl.blindage))) : ''}
            ${mdl?.vitesse_croisiere ? statCell('✈️', 'Croisière', `${esc(String(mdl.vitesse_croisiere))} US/j`) : ''}
            ${mdl?.vitesse_hyperspatiale ? statCell('⚡', 'Hyper', `${esc(String(mdl.vitesse_hyperspatiale))} pc/j`) : ''}
            ${s.crew != null ? statCell('👥', 'Équipage', esc(String(s.crew))) : ''}
            ${s.cargo_capacity != null ? statCell('📦', 'Soute', `${esc(String(s.cargo_capacity))} t`) : ''}
            ${s.position?.quadrant ? statCell('📍', 'Position', esc(s.position.quadrant + (s.position.system ? ' · ' + s.position.system : ''))) : ''}
          </div>
          ${s.notes ? `<p class="mt-2 text-xs text-gray-500 italic">${esc(s.notes)}</p>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  panel.innerHTML = html;

  if (canEdit) {
    panel.querySelector('#btn-add-fleet-ship')?.addEventListener('click', () => openFleetModal(null));
    panel.querySelectorAll('.fleet-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = state.ships.find(s => String(s.id) === btn.dataset.shipId);
        if (ship) openFleetModal(ship);
      });
    });
    panel.querySelectorAll('.fleet-vis-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleFleetShipVis(btn.dataset.shipId, btn.dataset.vis === 'true'));
    });
    panel.querySelectorAll('.fleet-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteFleetShip(btn.dataset.shipId, btn.dataset.shipName));
    });
  }
}

async function toggleFleetShipVis(shipId, currentlyVisible) {
  const newVis = !currentlyVisible;
  try {
    const r = await fetchWithTable(`/api/visibility/ships/${shipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: newVis })
    });
    if (!r.ok) return;
    const ship = state.ships.find(s => String(s.id) === String(shipId));
    if (ship) ship.visible = newVis;
    renderActiveTab();
  } catch {}
}

async function deleteFleetShip(shipId, shipName) {
  if (!confirm(`Supprimer "${shipName}" ? Irréversible.`)) return;
  try {
    const r = await fetchWithTable(`/api/ships/${shipId}`, { method: 'DELETE' });
    if (r.ok) {
      state.ships = state.ships.filter(s => String(s.id) !== String(shipId));
      renderActiveTab();
    }
  } catch {}
}

function openFleetModal(ship) {
  const isEdit = !!ship;
  const ov = ship?.statsOverride || {};
  const mdl = ship?.model || {};
  const pos = ship?.position || {};
  const isActiveShip = isEdit && String(ship.id) === String(state.activeShipId);
  const vv = (key) => {
    if (ov[key] != null && ov[key] !== '') return ov[key];
    if (mdl[key] != null && mdl[key] !== '') return mdl[key];
    return '';
  };

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const field = (id, label, type = 'text', val = '', suffix = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <div class="flex gap-1 items-center">
        <input type="${type}" id="${id}" value="${esc(String(val ?? ''))}"
          class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        ${suffix ? `<span class="text-xs text-gray-500 whitespace-nowrap">${esc(suffix)}</span>` : ''}
      </div></div>`;
  const ta = (id, label, val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <textarea id="${id}" rows="3"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(val ?? ''))}</textarea></div>`;

  const hasImg = !!(ship?.image || mdl.image);

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isEdit ? `✏️ ${esc(ship.name)}` : '+ Nouveau vaisseau'}</h2>
        <button id="fm-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <p id="fm-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">${field('fm-nom', 'Nom du vaisseau *', 'text', ship?.name)}</div>

        <div class="md:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Modèle de base</label>
          <select id="fm-model" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 cursor-pointer">
            <option value="">— Aucun modèle —</option>
            ${state.ship_models.map(m => `<option value="${esc(String(m.id))}" ${ship?.model_id === m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}
          </select>
          <p class="text-xs text-gray-500 mt-1">La sélection d'un modèle pré-remplit tous les champs vides ci-dessous.</p>
        </div>

        <div class="md:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Image</label>
          <div class="flex gap-2">
            <input type="text" id="fm-image" value="${esc(ship?.image || '')}" placeholder="URL ou laisser vide"
              class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <label class="cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 transition-colors whitespace-nowrap">
              📁 Choisir
              <input type="file" id="fm-file" accept="image/*" class="hidden">
            </label>
          </div>
          ${hasImg
            ? `<img id="fm-img-preview" src="${esc(ship?.image || mdl.image || '')}" class="mt-2 w-full max-h-40 object-contain rounded" alt="">`
            : `<div id="fm-img-preview" class="hidden mt-2 w-full max-h-40 flex items-center justify-center bg-gray-900 rounded text-4xl">🚀</div>`
          }
        </div>

        ${field('fm-classe', 'Classe', 'text', vv('classe'))}
        ${field('fm-tonnage', 'Tonnage', 'text', vv('tonnage'), 't')}
        ${field('fm-longueur', 'Longueur', 'text', vv('longueur'), 'm')}
        ${field('fm-v-cro', 'Vitesse croisière', 'number', vv('vitesse_croisiere'), 'US/j')}
        ${field('fm-v-hyp', 'Vitesse hyperspatiale', 'number', vv('vitesse_hyperspatiale'), 'PC/j')}
        ${field('fm-v-tac', 'Vitesse tactique', 'text', vv('vitesse_tactique'), 'K/t')}
        ${field('fm-autonomie', 'Autonomie', 'number', vv('autonomie'), 'PC')}
        ${field('fm-manoeuvre', 'Manœuvrabilité', 'text', vv('manoeuvrabilite'))}
        ${field('fm-blindage', 'Blindage', 'number', vv('blindage'))}
        ${field('fm-coque', 'Coque (max)', 'number', vv('coque'))}
        ${field('fm-hull', 'Coque actuelle', 'number', ship?.hull ?? '')}
        ${field('fm-senseurs', 'Senseurs', 'text', vv('senseurs_k'))}
        ${field('fm-crew', 'Équipage', 'text', ship?.crew ?? '')}
        ${field('fm-pass', 'Passagers', 'text', vv('passagers'))}
        ${field('fm-cargo', 'Soute', 'number', ship?.cargo_capacity ?? '', 't')}
      </div>

      <div class="mt-4 space-y-3 border-t border-gray-700 pt-4">
        <h3 class="text-sm font-semibold text-gray-300">Description & Notes</h3>
        ${ta('fm-desc', 'Description', ov.description)}
        ${ta('fm-notes', 'Notes MJ (privé)', ship?.notes)}
      </div>

      <div class="mt-4 border-t border-gray-700 pt-4">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">📍 Position galactique</h3>
        <div class="grid grid-cols-3 gap-3">
          ${field('fm-pos-quadrant', 'Quadrant', 'text', pos.quadrant || '')}
          ${field('fm-pos-system', 'Système', 'text', pos.system || '')}
          ${field('fm-pos-planet', 'Planète / Astre', 'text', pos.planet || '')}
        </div>
        ${isEdit ? `<div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700/50">
          <button id="fm-set-active" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActiveShip ? 'bg-amber-700 text-amber-100 cursor-default' : 'bg-gray-700 hover:bg-amber-800/60 text-gray-300 hover:text-amber-200 cursor-pointer'}">
            🎯 ${isActiveShip ? 'Vaisseau actif ✓' : 'Définir comme vaisseau actif'}
          </button>
          ${isActiveShip ? '<span class="text-xs text-amber-400">Ce vaisseau est le vaisseau actif de la table</span>' : '<span class="text-xs text-gray-500">Ce vaisseau sera utilisé pour les calculs d\'itinéraire</span>'}
        </div>` : ''}
      </div>

      <div class="flex gap-3 mt-6">
        <button id="fm-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="fm-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#fm-nom').focus();

  const close = () => overlay.remove();
  overlay.querySelector('#fm-close').addEventListener('click', close);
  overlay.querySelector('#fm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Image preview
  const imgInput = overlay.querySelector('#fm-image');
  const imgPreview = overlay.querySelector('#fm-img-preview');
  imgInput.addEventListener('input', () => {
    const url = imgInput.value.trim();
    if (url) { imgPreview.src = url; imgPreview.classList.remove('hidden'); }
    else { imgPreview.classList.add('hidden'); }
  });

  // File upload
  overlay.querySelector('#fm-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
      imgInput.value = json.data.url;
      imgPreview.src = json.data.url;
      imgPreview.classList.remove('hidden');
    } catch (ex) {
      overlay.querySelector('#fm-error').textContent = `Upload : ${ex.message}`;
      overlay.querySelector('#fm-error').classList.remove('hidden');
    }
  });

  // Fill empty fields from model
  const fillFromModel = (model) => {
    if (!model) return;
    const fill = (id, val) => { const el = overlay.querySelector(id); if (el && !el.value && val != null) el.value = val; };
    fill('#fm-classe', model.classe);
    fill('#fm-tonnage', model.tonnage);
    fill('#fm-longueur', model.longueur);
    fill('#fm-coque', model.coque);
    fill('#fm-hull', model.coque);
    fill('#fm-blindage', model.blindage);
    fill('#fm-manoeuvre', model.manoeuvrabilite);
    fill('#fm-v-tac', model.vitesse_tactique);
    fill('#fm-v-cro', model.vitesse_croisiere);
    fill('#fm-v-hyp', model.vitesse_hyperspatiale);
    fill('#fm-autonomie', model.autonomie);
    fill('#fm-senseurs', model.senseurs_k);
    fill('#fm-crew', model.equipage);
    fill('#fm-pass', model.passagers);
    fill('#fm-cargo', model.soute);
    if (!imgInput.value && model.image) {
      imgInput.value = model.image;
      imgPreview.src = model.image;
      imgPreview.classList.remove('hidden');
    }
  };

  overlay.querySelector('#fm-model').addEventListener('change', () => {
    const model = state.ship_models.find(m => String(m.id) === overlay.querySelector('#fm-model').value) || null;
    if (model) fillFromModel(model);
  });

  // Save
  overlay.querySelector('#fm-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#fm-error');
    errEl.classList.add('hidden');
    const name = overlay.querySelector('#fm-nom').value.trim();
    if (!name) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }

    const num = id => { const v = overlay.querySelector(id)?.value?.trim(); return v !== '' && v != null ? Number(v) : undefined; };
    const str = id => overlay.querySelector(id)?.value?.trim() || undefined;

    const body = {
      name,
      model_id: overlay.querySelector('#fm-model').value || null,
      image: imgInput.value.trim() || null,
      hull: num('#fm-hull'),
      crew: str('#fm-crew'),
      cargo_capacity: num('#fm-cargo'),
      notes: overlay.querySelector('#fm-notes')?.value.trim() || '',
      classe: str('#fm-classe'), tonnage: str('#fm-tonnage'), longueur: str('#fm-longueur'),
      coque: num('#fm-coque'), blindage: num('#fm-blindage'),
      manoeuvrabilite: str('#fm-manoeuvre'), vitesse_tactique: str('#fm-v-tac'),
      vitesse_croisiere: num('#fm-v-cro'), vitesse_hyperspatiale: num('#fm-v-hyp'),
      autonomie: num('#fm-autonomie'), senseurs_k: str('#fm-senseurs'),
      passagers: str('#fm-pass'),
      description: overlay.querySelector('#fm-desc')?.value.trim() || undefined,
    };

    // Position
    const posQ = (overlay.querySelector('#fm-pos-quadrant')?.value || '').trim();
    const posS = (overlay.querySelector('#fm-pos-system')?.value || '').trim();
    const posP = (overlay.querySelector('#fm-pos-planet')?.value || '').trim();
    if (posQ || posS || posP) {
      body.position_json = JSON.stringify({ quadrant: posQ || null, system: posS || null, planet: posP || null });
    } else {
      body.position_json = null;
    }

    try {
      const url = isEdit ? `/api/ships/${ship.id}` : '/api/ships';
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetchWithTable(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) { errEl.textContent = json.error?.message || `Erreur ${r.status}`; errEl.classList.remove('hidden'); return; }
      overlay.remove();
      const sr = await fetchWithTable('/api/ships');
      const sj = await sr.json();
      state.ships = sj.data ?? [];
      renderActiveTab();
    } catch (ex) { errEl.textContent = ex.message; errEl.classList.remove('hidden'); }
  });

  // Set active ship button
  if (isEdit) {
    overlay.querySelector('#fm-set-active')?.addEventListener('click', async () => {
      if (isActiveShip) return;
      try {
        const r = await fetchWithTable('/api/ships/active', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shipId: ship.id }),
        });
        if (r.ok) {
          state.activeShipId = String(ship.id);
          const btn = overlay.querySelector('#fm-set-active');
          if (btn) {
            btn.textContent = '🎯 Vaisseau actif ✓';
            btn.className = 'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-700 text-amber-100 cursor-default transition-colors';
            btn.nextElementSibling && (btn.nextElementSibling.textContent = 'Ce vaisseau est le vaisseau actif de la table');
          }
        }
      } catch {}
    });
  }
}

function renderModelPreview() { /* no longer used */ }


// --- Faction edit modal ---
function openFactionModal(faction) {
  const isNew = !faction;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const val = (k) => esc(String(faction?.[k] ?? ''));
  const hasImg = !!faction?.icon_url;

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isNew ? '+ Nouvelle faction' : `✏️ ${esc(faction.name)}`}</h2>
        <button id="fmf-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <p id="fmf-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>

      <!-- Image + Nom/Abréviation/URL -->
      <div class="flex gap-4 mb-5">
        <div class="flex-shrink-0">
          <p class="text-xs text-gray-400 mb-2">Icône</p>
          <div style="width:100px;height:100px;background:#1f2937;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #374151">
            ${hasImg
              ? `<img id="fmf-img-preview" src="${val('icon_url')}" style="max-width:100%;max-height:100%;object-fit:contain" alt="">`
              : `<span id="fmf-img-preview" style="font-size:2.5rem">🏴</span>`}
          </div>
        </div>
        <div class="flex-1 space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Nom *</label>
            <input type="text" id="fmf-name" value="${val('name')}" placeholder="ex: Empire Galactique"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Abréviation</label>
            <input type="text" id="fmf-short" value="${val('short')}" placeholder="ex: EMP"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Couleur</label>
            <input type="color" id="fmf-color" value="${faction?.color || '#888888'}"
              class="h-10 w-20 bg-gray-700 border border-gray-600 rounded cursor-pointer">
          </div>
        </div>
      </div>

      <!-- URL / upload image -->
      <div class="mb-4">
        <label class="block text-xs text-gray-400 mb-1">Illustration (URL ou upload)</label>
        <div class="flex gap-2">
          <input type="text" id="fmf-icon-url" value="${val('icon_url')}" placeholder="https://..."
            class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
          <label class="cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 transition-colors whitespace-nowrap">
            📁 Choisir
            <input type="file" id="fmf-file" accept="image/*" class="hidden">
          </label>
        </div>
      </div>

      <!-- Description -->
      <div class="mb-4">
        <label class="block text-xs text-gray-400 mb-1">Description</label>
        <textarea id="fmf-desc" rows="4"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(faction?.description ?? ''))}</textarea>
      </div>

      <!-- Lien Origine (outil création de personnage) -->
      <div class="mb-5">
        <label class="block text-xs text-gray-400 mb-1">Nation liée (outil création de personnage)</label>
        <select id="fmf-origin-nation"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
          <option value="">— Aucune (origines cachées aux joueurs) —</option>
          <option value="Barrens"                   ${faction?.origin_nation_id === 'Barrens'                   ? 'selected' : ''}>Barrens</option>
          <option value="Daemon"                    ${faction?.origin_nation_id === 'Daemon'                    ? 'selected' : ''}>Daemon</option>
          <option value="Empire de Sol"             ${faction?.origin_nation_id === 'Empire de Sol'             ? 'selected' : ''}>Empire de Sol</option>
          <option value="Empire Galactique"         ${faction?.origin_nation_id === 'Empire Galactique'         ? 'selected' : ''}>Empire Galactique</option>
          <option value="Enfants maudits"           ${faction?.origin_nation_id === 'Enfants maudits'           ? 'selected' : ''}>Enfants maudits</option>
          <option value="Havana"                    ${faction?.origin_nation_id === 'Havana'                    ? 'selected' : ''}>Havana (Pirates)</option>
          <option value="Ligue des Planètes Libres" ${faction?.origin_nation_id === 'Ligue des Planètes Libres' ? 'selected' : ''}>Ligue des Planètes Libres</option>
          <option value="OCG"                       ${faction?.origin_nation_id === 'OCG'                       ? 'selected' : ''}>OCG</option>
        </select>
        <p class="text-xs text-gray-500 mt-1">Si cette faction est cachée aux joueurs, l'origine correspondante sera masquée lors de la création de personnage.</p>
      </div>

      <div class="flex gap-3">
        <button id="fmf-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="fmf-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#fmf-name').focus();

  const close = () => overlay.remove();
  overlay.querySelector('#fmf-close').addEventListener('click', close);
  overlay.querySelector('#fmf-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Image preview sync
  const urlInput = overlay.querySelector('#fmf-icon-url');
  const imgPrev = overlay.querySelector('#fmf-img-preview');
  const syncPreview = (url) => {
    if (url) {
      if (imgPrev.tagName === 'SPAN') {
        const img = document.createElement('img');
        img.id = 'fmf-img-preview';
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
        imgPrev.replaceWith(img);
      } else {
        imgPrev.src = url;
      }
    }
  };
  urlInput.addEventListener('input', () => syncPreview(urlInput.value.trim()));

  overlay.querySelector('#fmf-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
      urlInput.value = json.data.url;
      syncPreview(json.data.url);
    } catch (ex) {
      overlay.querySelector('#fmf-error').textContent = `Upload : ${ex.message}`;
      overlay.querySelector('#fmf-error').classList.remove('hidden');
    }
  });

  overlay.querySelector('#fmf-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#fmf-error');
    errEl.classList.add('hidden');
    const name = overlay.querySelector('#fmf-name').value.trim();
    if (!name) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }
    const body = {
      name,
      short: overlay.querySelector('#fmf-short').value.trim(),
      color: overlay.querySelector('#fmf-color').value,
      icon_url: overlay.querySelector('#fmf-icon-url').value.trim() || null,
      description: overlay.querySelector('#fmf-desc').value.trim(),
      origin_nation_id: overlay.querySelector('#fmf-origin-nation').value || null,
    };
    try {
      const apiUrl = isNew ? '/api/factions' : `/api/factions/${faction.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const fetcher = state.tableId ? fetchWithTable : (u, o) => fetch(u, { ...o, credentials: 'include' });
      const r = await fetcher(apiUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
      const updated = json.data;
      if (isNew) { if (updated) state.factions.push(updated); }
      else {
        const idx = state.factions.findIndex(f => String(f.id) === String(faction.id));
        if (idx !== -1) { state.factions[idx] = { ...updated, visible: state.factions[idx].visible }; }
      }
      overlay.remove();
      renderActiveTab();
    } catch (ex) { errEl.textContent = ex.message; errEl.classList.remove('hidden'); }
  });
}

// --- System edit modal (with solar data) ---
function openSystemModal(system) {
  const isNew = !system;
  let soleil = {}, corps = [], patrouilles = [];
  if (!isNew) {
    try { soleil = JSON.parse(system.soleil_json || 'null') || {}; } catch { soleil = {}; }
    try { corps = JSON.parse(system.corps_celestes_json || 'null') || []; } catch { corps = []; }
    try { patrouilles = JSON.parse(system.patrouilles_json || 'null') || []; } catch { patrouilles = []; }
  }

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const field = (id, label, type = 'text', val = '', suffix = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <div class="flex gap-1 items-center">
        <input type="${type}" id="${id}" value="${esc(String(val ?? ''))}"
          class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        ${suffix ? `<span class="text-xs text-gray-500 whitespace-nowrap">${esc(suffix)}</span>` : ''}
      </div></div>`;
  const ta = (id, label, val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <textarea id="${id}" rows="2"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(val ?? ''))}</textarea></div>`;
  const chk = (id, label, val = false) =>
    `<div class="flex items-center gap-2"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}
      class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500">
      <label for="${id}" class="text-sm text-gray-400">${esc(label)}</label></div>`;

  const renderBodyRow = (body, idx, depth = 0) => {
    const icon = depth > 0 ? '🌙' : '🪐';
    const indent = depth > 0 ? 'ml-4 border-l border-gray-700 pl-2' : '';
    return `<div class="${indent} flex items-center gap-2 py-1.5 body-row" data-idx="${idx}" data-depth="${depth}">
      <span class="text-sm">${icon}</span>
      <span class="flex-1 text-sm text-gray-200">${esc(body.nom || '?')}</span>
      <span class="text-xs text-gray-500">${body.orbite ? body.orbite + ' US' : ''}</span>
      <button class="btn-edit-body text-xs text-blue-400 hover:text-blue-300 px-2 py-1" data-idx="${idx}">✏️</button>
      <button class="btn-del-body text-xs text-red-500 hover:text-red-400 px-2 py-1" data-idx="${idx}">✕</button>
    </div>`;
  };

  const renderBodyList = () => {
    if (!corps.length) return '<p class="text-xs text-gray-500 italic py-2">Aucun corps céleste</p>';
    return corps.map((b, i) => renderBodyRow(b, i)).join('');
  };

  const renderPatrRow = (p, idx) =>
    `<div class="flex items-center gap-2 py-1 patr-row" data-idx="${idx}">
      <input type="text" class="patr-vaisseaux flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Vaisseaux" value="${esc(p.vaisseaux || '')}" data-idx="${idx}">
      <input type="text" class="patr-cout w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Coût" value="${esc(p.cout || '')}" data-idx="${idx}">
      <button class="btn-del-patr text-xs text-red-500 hover:text-red-400 px-2 py-1 flex-shrink-0" data-idx="${idx}">✕</button>
    </div>`;
  const renderPatrList = () =>
    !patrouilles.length ? '<p class="text-xs text-gray-500 italic py-2">Aucune patrouille</p>' :
    patrouilles.map((p, i) => renderPatrRow(p, i)).join('');

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isNew ? '+ Nouveau système' : `✏️ ${esc(system.nom)}`}</h2>
        <button id="fms-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <p id="fms-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>

      <!-- Informations système -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="col-span-2">${field('fms-nom', 'Nom du système *', 'text', system?.nom)}</div>
        ${field('fms-quadrant', 'Quadrant', 'text', system?.quadrant)}
        <div>
          <label class="block text-xs text-gray-400 mb-1">Faction</label>
          <select id="fms-faction" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Aucune —</option>
            ${state.factions.map(f => `<option value="${esc(f.name)}" ${system?.faction === f.name ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Gouvernement</label>
          <select id="fms-gouvernement" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Aucun —</option>
            ${['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].map(g => `<option value="${esc(g)}" ${system?.gouvernement === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
          </select>
          <input type="text" id="fms-gouvernement-autre" placeholder="Préciser…" value="${esc(system?.gouvernement && !['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].includes(system.gouvernement) ? system.gouvernement : '')}"
            class="mt-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${system?.gouvernement && !['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].includes(system.gouvernement) ? '' : 'hidden'}">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Route</label>
          <select id="fms-route" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Aucune —</option>
            ${['Route galactique (+1d)','Route commerciale','Hors des routes (D+1)','Mystérieux (TD)'].map(r => `<option value="${esc(r)}" ${system?.route === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-end">${chk('fms-frontiere', 'Zone frontière', system?.is_frontiere)}</div>
        <div class="col-span-2">${ta('fms-texte-ambiance', 'Texte d\'ambiance', system?.texte_ambiance)}</div>
        <div class="col-span-2">${ta('fms-description', 'Description', system?.description)}</div>
      </div>

      <!-- Étoile / Soleil -->
      <div class="border-t border-gray-700 pt-4 mb-4">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">☀️ Étoile</h3>
        <div class="grid grid-cols-2 gap-3">
          ${field('fms-sol-nom', 'Nom étoile', 'text', soleil.nom)}
          <div>
            <label class="block text-xs text-gray-400 mb-1">Classe</label>
            <select id="fms-sol-classe" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
              <option value="">— Aucune —</option>
              ${['Naine rouge','Naine jaune','Géante rouge','Etoile variable','Etoiles binaires','Autre'].map(c => `<option value="${esc(c)}" ${soleil.classe === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
            <input type="text" id="fms-sol-classe-autre" placeholder="Préciser…" value="${esc(soleil.classe && !['Naine rouge','Naine jaune','Géante rouge','Etoile variable','Etoiles binaires','Autre'].includes(soleil.classe) ? soleil.classe : '')}"
              class="mt-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${soleil.classe && !['Naine rouge','Naine jaune','Géante rouge','Etoile variable','Etoiles binaires','Autre'].includes(soleil.classe) ? '' : 'hidden'}">
          </div>
          ${field('fms-sol-diametre', 'Diamètre', 'number', soleil.diametre, 'K')}
          ${field('fms-sol-saut', 'Limite de saut', 'number', soleil.distanceSaut, 'US')}
          <div class="col-span-2">${ta('fms-sol-texte-ambiance', 'Texte d\'ambiance étoile', soleil.texte_ambiance)}</div>
          <div class="col-span-2">${ta('fms-sol-desc', 'Description étoile', soleil.description)}</div>
        </div>
      </div>

      <!-- Corps célestes -->
      <div class="border-t border-gray-700 pt-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-300">🪐 Corps célestes</h3>
          <button id="btn-add-body" class="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-2 py-1.5 rounded transition-colors">+ Ajouter</button>
        </div>
        <div id="fms-bodies-list" class="space-y-0.5 min-h-[24px]">${renderBodyList()}</div>
      </div>

      <!-- Matrice de distances -->
      <div class="border-t border-gray-700 pt-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-300">📐 Matrice des distances (estimations)</h3>
          <button id="btn-recalc-matrix" class="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-2 py-1.5 rounded transition-colors">🎲 Recalculer</button>
        </div>
        <div id="fms-matrix-wrap" class="overflow-x-auto text-xs"></div>
      </div>

      <div class="flex gap-3 mt-2">
        <button id="fms-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="fms-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#fms-nom').focus();

  const close = () => overlay.remove();
  overlay.querySelector('#fms-close').addEventListener('click', close);
  overlay.querySelector('#fms-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Distance matrix generator (logic from MAmap.html)
  const d6 = () => Math.floor(Math.random() * 6) + 1;
  const buildMatrixPoints = () => {
    const pts = [];
    const solNom = overlay.querySelector('#fms-sol-nom')?.value.trim();
    const solSaut = parseFloat(overlay.querySelector('#fms-sol-saut')?.value.trim());
    if (solNom) pts.push({ nom: solNom, orbite: 0, type: 'Soleil' });
    corps.forEach(c => {
      const orb = parseFloat(c.orbite);
      if (c.nom) pts.push({ nom: c.nom, orbite: isNaN(orb) ? 0 : orb, type: 'Planète' });
    });
    if (!isNaN(solSaut) && solSaut > 0) pts.push({ nom: 'Limite de saut', orbite: solSaut, type: 'Limite' });
    return pts;
  };
  const distModifier = (closestOrbit) => {
    let roll, val;
    if (closestOrbit < 1)          { roll = d6(); val = 0.5 * roll; }
    else if (closestOrbit >= 60)   { roll = d6() + d6(); val = 10 * roll; }
    else if (closestOrbit >= 30)   { roll = d6(); val = 10 * roll; }
    else if (closestOrbit >= 15)   { roll = d6(); val = 5 * roll; }
    else                            { roll = d6(); val = roll; }
    return { value: Math.round(val), roll };
  };
  const buildMatrixHtml = () => {
    const pts = buildMatrixPoints();
    if (pts.length <= 1) return '<p class="text-gray-500 italic">Pas assez de corps pour générer une matrice.</p>';
    const th = (t) => `<th class="px-2 py-1 text-center bg-gray-900 text-gray-400 border border-gray-700 whitespace-nowrap">${t}</th>`;
    const td = (t) => `<td class="px-2 py-1 text-center border border-gray-700 whitespace-nowrap">${t}</td>`;
    let html = `<table class="w-full border-collapse"><thead><tr>${th('&nbsp;')}`;
    pts.forEach(p => html += th(esc(p.nom)));
    html += '</tr></thead><tbody>';
    pts.forEach(p1 => {
      html += `<tr>${th(esc(p1.nom))}`;
      pts.forEach(p2 => {
        if (p1.nom === p2.nom) { html += td('<span class="text-gray-500">—</span>'); return; }
        let cell = '?';
        if (p1.type === 'Soleil')      cell = `${p2.orbite} US`;
        else if (p2.type === 'Soleil') cell = `${p1.orbite} US`;
        else if ((p1.type === 'Planète' && p2.type === 'Limite') || (p1.type === 'Limite' && p2.type === 'Planète')) {
          const diff = Math.abs(p1.orbite - p2.orbite);
          cell = `${diff.toFixed(1)} US`;
        } else if (p1.type === 'Planète' && p2.type === 'Planète') {
          const diff = Math.abs(p1.orbite - p2.orbite);
          const closest = Math.min(p1.orbite, p2.orbite);
          const mod = distModifier(closest);
          const total = diff + mod.value;
          cell = `${diff.toFixed(1)}<span class="text-gray-400">+${mod.value}</span>=<strong>${total}</strong>`;
        } else {
          const diff = Math.abs(p1.orbite - p2.orbite);
          cell = `${diff.toFixed(1)} US`;
        }
        html += td(cell);
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  };
  const refreshMatrix = () => {
    overlay.querySelector('#fms-matrix-wrap').innerHTML = buildMatrixHtml();
  };

  const refreshBodyList = () => {
    overlay.querySelector('#fms-bodies-list').innerHTML = renderBodyList();
    bindBodyButtons();
    refreshMatrix();
  };

  const bindBodyButtons = () => {
    overlay.querySelectorAll('.btn-edit-body').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        openBodyModal(corps[idx], (updated) => {
          corps[idx] = updated;
          refreshBodyList();
        });
      });
    });
    overlay.querySelectorAll('.btn-del-body').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        corps.splice(idx, 1);
        refreshBodyList();
      });
    });
  };
  bindBodyButtons();

  overlay.querySelector('#btn-add-body').addEventListener('click', () => {
    openBodyModal({}, (newBody) => {
      corps.push(newBody);
      refreshBodyList();
    });
  });

  overlay.querySelector('#btn-recalc-matrix').addEventListener('click', refreshMatrix);

  // Init matrix & refresh when star limit changes
  refreshMatrix();
  overlay.querySelector('#fms-sol-saut').addEventListener('change', refreshMatrix);
  overlay.querySelector('#fms-sol-nom').addEventListener('change', refreshMatrix);

  // Wire "Autre" free-text fields
  const wireAutreDropdown = (selId, inputId) => {
    const sel = overlay.querySelector(selId);
    const inp = overlay.querySelector(inputId);
    if (!sel || !inp) return;
    sel.addEventListener('change', () => {
      inp.classList.toggle('hidden', sel.value !== 'Autre');
    });
  };
  wireAutreDropdown('#fms-gouvernement', '#fms-gouvernement-autre');
  wireAutreDropdown('#fms-sol-classe', '#fms-sol-classe-autre');

  overlay.querySelector('#fms-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#fms-error');
    errEl.classList.add('hidden');
    const nom = overlay.querySelector('#fms-nom').value.trim();
    if (!nom) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }

    const str = id => overlay.querySelector(id)?.value?.trim() || undefined;
    const num = id => { const v = overlay.querySelector(id)?.value?.trim(); return v ? Number(v) : undefined; };

    // Read dropdown+autre fields
    const readDropdownAutre = (selId, autreId) => {
      const sel = overlay.querySelector(selId)?.value?.trim();
      if (!sel) return undefined;
      if (sel === 'Autre') return overlay.querySelector(autreId)?.value?.trim() || undefined;
      return sel;
    };

    // Build soleil_json
    const solNom = str('#fms-sol-nom');
    const solClasse = readDropdownAutre('#fms-sol-classe', '#fms-sol-classe-autre');
    const solDiam = num('#fms-sol-diametre'), solSaut = num('#fms-sol-saut');
    const solTexteAmbiance = str('#fms-sol-texte-ambiance'), solDesc = str('#fms-sol-desc');
    const soleilObj = (solNom || solClasse || solDiam || solSaut || solTexteAmbiance || solDesc)
      ? { nom: solNom, classe: solClasse, diametre: solDiam, distanceSaut: solSaut, texte_ambiance: solTexteAmbiance, description: solDesc, ...((soleil.activiteSolaire) ? { activiteSolaire: soleil.activiteSolaire } : {}) }
      : {};

    const body = {
      nom, quadrant: str('#fms-quadrant') || null,
      faction: overlay.querySelector('#fms-faction').value || null,
      gouvernement: readDropdownAutre('#fms-gouvernement', '#fms-gouvernement-autre') || null,
      route: overlay.querySelector('#fms-route')?.value?.trim() || null,
      is_frontiere: overlay.querySelector('#fms-frontiere').checked ? 1 : 0,
      texte_ambiance: str('#fms-texte-ambiance') || null,
      description: str('#fms-description') || null,
      soleil_json: Object.keys(soleilObj).length ? JSON.stringify(soleilObj) : null,
      corps_celestes_json: corps.length ? JSON.stringify(corps) : null,
    };

    try {
      const apiUrl = isNew ? '/api/systems' : `/api/systems/${system.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const fetcher = state.tableId ? fetchWithTable : (u, o) => fetch(u, { ...o, credentials: 'include' });
      const r = await fetcher(apiUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
      const updated = json.data;
      if (isNew) { if (updated) state.systems.push(updated); }
      else {
        const idx = state.systems.findIndex(s => String(s.id) === String(system.id));
        if (idx !== -1) { state.systems[idx] = { ...updated, visible: state.systems[idx].visible }; }
      }
      overlay.remove();
      renderActiveTab();
    } catch (ex) { errEl.textContent = ex.message; errEl.classList.remove('hidden'); }
  });
}

// --- Body (planet/moon) sub-modal ---
function openBodyModal(body, onSave) {
  const subOverlay = document.createElement('div');
  subOverlay.className = 'fixed inset-0 bg-black/80 flex items-start justify-center pt-8 px-4 overflow-y-auto';
  subOverlay.style.zIndex = '300';

  const sf = (id, label, type = 'text', val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <input type="${type}" id="${id}" value="${esc(String(val ?? ''))}"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"></div>`;
  const sta = (id, label, val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <textarea id="${id}" rows="2"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(val ?? ''))}</textarea></div>`;

  subOverlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-xl p-5 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg">🪐 Corps céleste</h3>
        <button id="bm-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${sf('bm-nom', 'Nom *', 'text', body.nom)}</div>
        ${sf('bm-orbite', 'Orbite (US)', 'number', body.orbite)}
        ${sf('bm-diametre', 'Diamètre (K)', 'number', body.diametre)}
        <div>
          <label class="block text-xs text-gray-400 mb-1">Atmosphère</label>
          <select id="bm-atmos" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Choisir —</option>
            ${['Respirable','Toxique (MdJ p.218)','Irrespirable (MdJ p.215)','Dangereux (MdJ p.216)','Aucun (vitesse x1.5, propulsion énergétique)'].map(a => `<option value="${esc(a)}" ${body.atmosphere === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Gravité</label>
          <select id="bm-gravite" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Choisir —</option>
            ${['Ecrasante (Survie/Technique TD, 1S/heure)','Forte (Survie/Technique D+1)','Normale','Faible','Très Faible','Aucune'].map(g => `<option value="${esc(g)}" ${body.gravite === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Niveau technologique</label>
          <input type="text" id="bm-techno" value="${esc(String(body.techno ?? ''))}" placeholder="A, B, C…"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Sécurité</label>
          <input type="number" id="bm-securite" value="${esc(String(body.securite ?? ''))}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        </div>
        ${sf('bm-pop', 'Population', 'text', body.population)}
        <div>
          <label class="block text-xs text-gray-400 mb-1">Gouvernement</label>
          <select id="bm-gouv" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="">— Aucun —</option>
            ${['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].map(g => `<option value="${esc(g)}" ${body.gouvernement === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
          </select>
          <input type="text" id="bm-gouv-autre" placeholder="Préciser…" value="${esc(body.gouvernement && !['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].includes(body.gouvernement) ? body.gouvernement : '')}"
            class="mt-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${body.gouvernement && !['Anarchie','Collectivisme','Corporatiste','Démocratie','Dictature','Monarchie','Autre'].includes(body.gouvernement) ? '' : 'hidden'}">
        </div>
        <div class="col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Environnements</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            ${['Arctique','Désert','Espace','Jungle','Marécages','Mer','Montagne','Roche','Tempéré','Urbain'].map(env => {
              const envList = Array.isArray(body.environnements) ? body.environnements : (body.environnement ? String(body.environnement).split(',').map(s => s.trim()) : []);
              return `<label class="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer"><input type="checkbox" value="${esc(env)}" ${envList.includes(env) ? 'checked' : ''} class="bm-env-chk w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-blue-500"> ${esc(env)}</label>`;
            }).join('')}
          </div>
        </div>
        <div class="col-span-2">
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-gray-400">Astroports</label>
            <button type="button" id="bm-add-astroport" class="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-2 py-1 rounded transition-colors">+ Ajouter</button>
          </div>
          <div id="bm-astroports-list" class="space-y-1.5">
            ${(Array.isArray(body.astroports) ? body.astroports : []).map((a, i) => `
              <div class="bm-astroport-row flex gap-2 items-center">
                <input type="text" class="bm-ap-nom flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Nom de l'astroport" value="${esc(a.nom || '')}">
                <select class="bm-ap-qualite bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
                  <option value="">— Qualité —</option>
                  ${['Rudimentaire (D+1)','Standard','Première classe (+1d)'].map(q => `<option value="${esc(q)}" ${a.type === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
                </select>
                <button type="button" class="bm-del-astroport flex-shrink-0 text-red-500 hover:text-red-400 px-2 py-1 text-xs">✕</button>
              </div>`).join('')}
          </div>
        </div>
        <div class="col-span-2">
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-gray-400">Système orbital</label>
            <button type="button" id="bm-add-satellite" class="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 px-2 py-1 rounded transition-colors">+ Ajouter</button>
          </div>
          <div id="bm-satellites-list" class="space-y-2">
            ${(Array.isArray(body.satellites) ? body.satellites : []).map((s, i) => `
              <div class="bm-satellite-row bg-gray-750 border border-gray-700 rounded p-2 space-y-1.5">
                <div class="flex gap-2 items-center">
                  <input type="text" class="bm-sat-nom flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Nom" value="${esc(s.nom || '')}">
                  <input type="number" class="bm-sat-dist w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Distance (K)" value="${esc(String(s.distance ?? ''))}">
                  <button type="button" class="bm-del-satellite flex-shrink-0 text-red-500 hover:text-red-400 px-2 py-1 text-xs">✕</button>
                </div>
                <textarea class="bm-sat-desc w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500 resize-y" rows="2" placeholder="Description">${esc(s.description || '')}</textarea>
              </div>`).join('')}
          </div>
        </div>
        <div class="col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Commerce</label>
          <select id="bm-commerce" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 mb-2">
            <option value="">— Choisir —</option>
            ${['Planète primitive (TD)','Planète pauvre (D+1)','Standard','Carrefour galactique (TF)','Impossible','Aucun'].map(c => `<option value="${esc(c)}" ${body.commerce === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Cours A</label>
              <input type="text" id="bm-mA" value="${esc(String(body.marchandiseA ?? ''))}" placeholder="Marchandise A"
                class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Cours B</label>
              <input type="text" id="bm-mB" value="${esc(String(body.marchandiseB ?? ''))}" placeholder="Marchandise B"
                class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Cours C</label>
              <input type="text" id="bm-mC" value="${esc(String(body.marchandiseC ?? ''))}" placeholder="Marchandise C"
                class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
            </div>
          </div>
          <div class="mt-2">
            <label class="block text-xs text-gray-500 mb-1">Marchandise illégale</label>
            <input type="text" id="bm-illegal" value="${esc(String(body.illegal ?? ''))}"
              class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
          </div>
        </div>
        <div class="col-span-2">${sta('bm-desc', 'Texte d\'ambiance', body.texte_ambiance)}</div>
        <div class="col-span-2">${sta('bm-description', 'Description', body.description)}</div>
      </div>
      <div class="flex gap-3 mt-4">
        <button id="bm-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors">OK</button>
        <button id="bm-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(subOverlay);
  subOverlay.querySelector('#bm-nom').focus();

  const closeBody = () => subOverlay.remove();
  subOverlay.querySelector('#bm-close').addEventListener('click', closeBody);
  subOverlay.querySelector('#bm-cancel').addEventListener('click', closeBody);
  subOverlay.addEventListener('click', e => { if (e.target === subOverlay) closeBody(); });

  // Wire gouvernement Autre dropdown
  const gouvSel = subOverlay.querySelector('#bm-gouv');
  const gouvAutre = subOverlay.querySelector('#bm-gouv-autre');
  if (gouvSel && gouvAutre) {
    gouvSel.addEventListener('change', () => {
      gouvAutre.classList.toggle('hidden', gouvSel.value !== 'Autre');
    });
  }

  // Astroports dynamic list
  const bindAstroDeleteBtns = () => {
    subOverlay.querySelectorAll('.bm-del-astroport').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.bm-astroport-row').remove());
    });
  };
  bindAstroDeleteBtns();
  subOverlay.querySelector('#bm-add-astroport').addEventListener('click', () => {
    const list = subOverlay.querySelector('#bm-astroports-list');
    const row = document.createElement('div');
    row.className = 'bm-astroport-row flex gap-2 items-center';
    row.innerHTML = `
      <input type="text" class="bm-ap-nom flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Nom de l'astroport">
      <select class="bm-ap-qualite bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        <option value="">— Qualité —</option>
        ${['Rudimentaire (D+1)','Standard','Premi\u00e8re classe (+1d)'].map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('')}
      </select>
      <button type="button" class="bm-del-astroport flex-shrink-0 text-red-500 hover:text-red-400 px-2 py-1 text-xs">✕</button>`;
    list.appendChild(row);
    row.querySelector('.bm-del-astroport').addEventListener('click', () => row.remove());
    row.querySelector('.bm-ap-nom').focus();
  });

  // Système orbital (satellites) dynamic list
  const bindSatDeleteBtns = () => {
    subOverlay.querySelectorAll('.bm-del-satellite').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.bm-satellite-row').remove());
    });
  };
  bindSatDeleteBtns();
  subOverlay.querySelector('#bm-add-satellite').addEventListener('click', () => {
    const list = subOverlay.querySelector('#bm-satellites-list');
    const row = document.createElement('div');
    row.className = 'bm-satellite-row bg-gray-750 border border-gray-700 rounded p-2 space-y-1.5';
    row.innerHTML = `
      <div class="flex gap-2 items-center">
        <input type="text" class="bm-sat-nom flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Nom">
        <input type="number" class="bm-sat-dist w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" placeholder="Distance (K)">
        <button type="button" class="bm-del-satellite flex-shrink-0 text-red-500 hover:text-red-400 px-2 py-1 text-xs">✕</button>
      </div>
      <textarea class="bm-sat-desc w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500 resize-y" rows="2" placeholder="Description"></textarea>`;
    list.appendChild(row);
    row.querySelector('.bm-del-satellite').addEventListener('click', () => row.remove());
    row.querySelector('.bm-sat-nom').focus();
  });

  subOverlay.querySelector('#bm-save').addEventListener('click', () => {
    const nom = subOverlay.querySelector('#bm-nom').value.trim();
    if (!nom) { subOverlay.querySelector('#bm-nom').focus(); return; }
    const str = id => subOverlay.querySelector(id)?.value?.trim() || undefined;
    const num = id => { const v = subOverlay.querySelector(id)?.value?.trim(); return v ? Number(v) : undefined; };
    const envChecked = [...subOverlay.querySelectorAll('.bm-env-chk:checked')].map(c => c.value);
    const astroports = [...subOverlay.querySelectorAll('.bm-astroport-row')]
      .map(row => ({ nom: row.querySelector('.bm-ap-nom')?.value?.trim() || '', type: row.querySelector('.bm-ap-qualite')?.value?.trim() || undefined }))
      .filter(a => a.nom);
    const satellites = [...subOverlay.querySelectorAll('.bm-satellite-row')]
      .map(row => ({ nom: row.querySelector('.bm-sat-nom')?.value?.trim() || '', distance: row.querySelector('.bm-sat-dist')?.value?.trim() ? Number(row.querySelector('.bm-sat-dist').value.trim()) : undefined, description: row.querySelector('.bm-sat-desc')?.value?.trim() || undefined }))
      .filter(s => s.nom);
    const gouvSel2 = subOverlay.querySelector('#bm-gouv')?.value?.trim();
    const gouvVal = gouvSel2 === 'Autre' ? (subOverlay.querySelector('#bm-gouv-autre')?.value?.trim() || undefined) : (gouvSel2 || undefined);
    const updated = {
      ...body, nom,
      orbite: num('#bm-orbite'), diametre: num('#bm-diametre'),
      atmosphere: str('#bm-atmos'),
      gravite: str('#bm-gravite'),
      techno: str('#bm-techno'),
      securite: num('#bm-securite'), population: str('#bm-pop'),
      gouvernement: gouvVal,
      environnements: envChecked.length ? envChecked : undefined,
      astroports: astroports.length ? astroports : undefined,
      satellites: satellites.length ? satellites : undefined,
      commerce: str('#bm-commerce'),
      marchandiseA: str('#bm-mA'), marchandiseB: str('#bm-mB'), marchandiseC: str('#bm-mC'),
      illegal: str('#bm-illegal'),
      texte_ambiance: str('#bm-desc'),
      description: str('#bm-description'),
    };
    // Remove undefined keys
    Object.keys(updated).forEach(k => updated[k] === undefined && delete updated[k]);
    closeBody();
    onSave(updated);
  });
}

// --- Ship model modal (admin-style) ---
function openShipModelModal(model) {
  const isNew = !model;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';

  const hasImg = !!model?.image;
  const field = (id, label, type = 'text', val = '', suffix = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <div class="flex gap-1 items-center">
        <input type="${type}" id="${id}" value="${esc(String(val ?? ''))}"
          class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        ${suffix ? `<span class="text-xs text-gray-500 whitespace-nowrap">${esc(suffix)}</span>` : ''}
      </div></div>`;
  const ta = (id, label, val = '') =>
    `<div><label class="block text-xs text-gray-400 mb-1">${esc(label)}</label>
      <textarea id="${id}" rows="3"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y">${esc(String(val ?? ''))}</textarea></div>`;

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl mb-8">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold">${isNew ? '+ Nouveau modèle de vaisseau' : `Modifier : ${esc(model.nom)}`}</h2>
        <button id="smm-close" class="text-gray-400 hover:text-gray-200 text-xl px-2">✕</button>
      </div>
      <p id="smm-error" class="hidden mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2"></p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">${field('smm-nom', 'Nom *', 'text', model?.nom)}</div>

        <div class="md:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Image</label>
          <div class="flex gap-2">
            <input type="text" id="smm-image" value="${esc(model?.image || '')}" placeholder="URL ou laisser vide pour uploader"
              class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            <label class="cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 transition-colors whitespace-nowrap">
              📁 Choisir
              <input type="file" id="smm-file" accept="image/*" class="hidden">
            </label>
          </div>
          ${hasImg
            ? `<img id="smm-img-preview" src="${esc(model.image)}" class="mt-2 w-full max-h-40 object-contain rounded" alt="">`
            : `<div id="smm-img-preview" class="hidden mt-2 w-full max-h-40 flex items-center justify-center bg-gray-900 rounded text-4xl">🚀</div>`
          }
        </div>

        ${field('smm-classe', 'Classe', 'text', model?.classe)}
        ${field('smm-origine', 'Origine / Faction', 'text', model?.origine)}
        ${field('smm-tonnage', 'Tonnage', 'text', model?.tonnage, 't')}
        ${field('smm-longueur', 'Longueur', 'text', model?.longueur, 'm')}
        ${field('smm-prix', 'Prix', 'number', model?.prix, '¢')}
        ${field('smm-v-cro', 'Vitesse croisière', 'number', model?.vitesse_croisiere, 'US/j')}
        ${field('smm-v-hyp', 'Vitesse hyperspatiale', 'number', model?.vitesse_hyperspatiale, 'PC/j')}
        ${field('smm-v-tac', 'Vitesse tactique', 'text', model?.vitesse_tactique, 'K/t')}
        ${field('smm-autonomie', 'Autonomie', 'number', model?.autonomie, 'PC')}
        ${field('smm-manoeuvre', 'Manœuvrabilité', 'text', model?.manoeuvrabilite)}
        ${field('smm-blindage', 'Blindage', 'number', model?.blindage)}
        ${field('smm-coque', 'Coque', 'number', model?.coque)}
        ${field('smm-senseurs-k', 'Senseurs (K)', 'text', model?.senseurs_k)}
        ${field('smm-senseurs-us', 'Senseurs (US)', 'text', model?.senseurs_us)}
        ${field('smm-equipage', 'Équipage', 'text', model?.equipage)}
        ${field('smm-passagers', 'Passagers', 'text', model?.passagers)}
        ${field('smm-soute', 'Soute', 'text', model?.soute, 't')}
      </div>

      <div class="mt-4">
        <label class="block text-xs text-gray-400 mb-1">Armement (JSON)</label>
        <textarea id="smm-armement" rows="2"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500 resize-y">${esc(model?.armement_json || '[]')}</textarea>
      </div>

      <div class="mt-4 space-y-3 border-t border-gray-700 pt-4">
        <h3 class="text-sm font-semibold text-gray-300">Descriptions</h3>
        ${ta('smm-description', 'Description générale', model?.description)}
        ${ta('smm-history', 'Historique', model?.history)}
        ${ta('smm-mj-notes', 'Notes MJ (privé)', model?.mj_notes)}
        ${ta('smm-special', 'Particularités', model?.special_features)}
      </div>

      <div class="flex gap-3 mt-6">
        <button id="smm-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">Enregistrer</button>
        <button id="smm-cancel" class="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#smm-close').addEventListener('click', close);
  overlay.querySelector('#smm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Image URL preview
  const imgInput = overlay.querySelector('#smm-image');
  const imgPreview = overlay.querySelector('#smm-img-preview');
  imgInput.addEventListener('input', () => {
    const url = imgInput.value.trim();
    if (url) { imgPreview.src = url; imgPreview.classList.remove('hidden'); }
    else { imgPreview.classList.add('hidden'); }
  });

  // File upload
  overlay.querySelector('#smm-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'Erreur upload');
      imgInput.value = json.data.url;
      imgPreview.src = json.data.url;
      imgPreview.classList.remove('hidden');
    } catch (ex) {
      overlay.querySelector('#smm-error').textContent = `Upload : ${ex.message}`;
      overlay.querySelector('#smm-error').classList.remove('hidden');
    }
  });

  // Save
  overlay.querySelector('#smm-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#smm-error');
    errEl.classList.add('hidden');
    const nom = overlay.querySelector('#smm-nom').value.trim();
    if (!nom) { errEl.textContent = 'Le nom est requis'; errEl.classList.remove('hidden'); return; }

    const num = id => { const v = overlay.querySelector(id).value.trim(); return v === '' ? null : Number(v); };
    const str = id => overlay.querySelector(id).value.trim();

    const armementStr = str('#smm-armement') || '[]';
    try { JSON.parse(armementStr); } catch { errEl.textContent = 'JSON armement invalide'; errEl.classList.remove('hidden'); return; }

    const body = {
      nom,
      classe: str('#smm-classe'), origine: str('#smm-origine'),
      tonnage: str('#smm-tonnage'), longueur: str('#smm-longueur'),
      prix: num('#smm-prix'),
      vitesse_croisiere: num('#smm-v-cro'), vitesse_hyperspatiale: num('#smm-v-hyp'),
      vitesse_tactique: str('#smm-v-tac'), autonomie: num('#smm-autonomie'),
      manoeuvrabilite: str('#smm-manoeuvre'),
      blindage: num('#smm-blindage'), coque: num('#smm-coque'),
      senseurs_k: str('#smm-senseurs-k'), senseurs_us: str('#smm-senseurs-us'),
      equipage: str('#smm-equipage'), passagers: str('#smm-passagers'), soute: str('#smm-soute'),
      image: str('#smm-image'),
      armement_json: armementStr,
      description: str('#smm-description'), history: str('#smm-history'),
      mj_notes: str('#smm-mj-notes'), special_features: str('#smm-special'),
    };

    try {
      const url = isNew ? '/api/ship-models' : `/api/ship-models/${model.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const fetcher = state.tableId ? fetchWithTable : (u, o) => fetch(u, { ...o, credentials: 'include' });
      const r = await fetcher(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || `Erreur ${r.status}`);
      const updated = json.data;
      if (isNew) {
        if (updated) state.ship_models.push(updated);
      } else {
        const idx = state.ship_models.findIndex(m => String(m.id) === String(model.id));
        if (idx !== -1) { const vis = state.ship_models[idx].visible; state.ship_models[idx] = { ...updated, visible: vis }; }
      }
      overlay.remove();
      renderActiveTab();
    } catch (ex) {
      errEl.textContent = ex.message; errEl.classList.remove('hidden');
    }
  });

  overlay.querySelector('#smm-nom').focus();
}

function openNewModelModal() {
  openShipModelModal(null);
}

// ── Périls tab (per-table CRUD) ───────────────────────────────────────────────
function renderPerils(panel) {
  if (!state.isMJ && !state.isAdmin) {
    panel.innerHTML = '<p class="text-gray-400 text-sm italic py-8 text-center">Réservé au MJ.</p>';
    return;
  }
  if (state.perilEditorOpen) {
    const t = state.perils.find(x => x.id === state.perilEditorOpen);
    if (t) { renderPerilEditor(panel, t); return; }
    state.perilEditorOpen = null;
  }
  renderPerilsList(panel);
}

function renderPerilsList(panel) {
  const importBtn = (state.tableId && (state.isMJ || state.isAdmin)) ? `<button id="cp-import-admin" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded text-sm" title="Importer les modèles et assignations par défaut de l'administrateur">⬇ Importer défauts admin</button>` : '';
  let html = `<div class="flex flex-wrap gap-2 mb-4"><button id="cp-add-ip" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm">+ Table IP</button><button id="cp-add-hs" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm">+ Table HS</button>${importBtn}</div><div id="cp-perils-rows"></div>`;
  panel.innerHTML = html;

  panel.querySelector('#cp-add-ip').addEventListener('click', () => createPerilTable('interplanetaire', panel));
  panel.querySelector('#cp-add-hs').addEventListener('click', () => createPerilTable('hyperspatial', panel));

  panel.querySelector('#cp-import-admin')?.addEventListener('click', async () => {
    if (!confirm('Importer les modèles et assignations par défaut de l\'administrateur ?\n\nLes tables manquantes seront créées et les assignations de quadrants/systèmes existantes seront remplacées.')) return;
    const btn = panel.querySelector('#cp-import-admin');
    btn.disabled = true; btn.textContent = '⏳ Import…';
    try {
      const r = await fetchWithTable('/api/perils/import-admin-defaults', { method: 'POST', credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
      const d = j.data;
      // Reload peril state
      const [pr, ar] = await Promise.all([
        fetchWithTable('/api/perils/tables', { credentials: 'include' }),
        fetchWithTable('/api/perils/assignments', { credentials: 'include' })
      ]);
      if (pr.ok) { const pj = await pr.json(); state.perils = pj.data || []; }
      if (ar.ok) { const aj = await ar.json(); state.peril_assignments = aj.data || { systems: {}, quadrants: {} }; }
      alert(`Import terminé : ${d.tables} table(s) créée(s), ${d.quadrants} quadrant(s) assigné(s), ${d.systems} système(s) assigné(s).`);
      renderPerilsList(panel);
    } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = '⬇ Importer défauts admin'; }
  });

  const rows = panel.querySelector('#cp-perils-rows');
  if (!state.perils.length) {
    rows.innerHTML = '<p class="text-gray-400 text-sm italic py-4">Aucune table de périls. Créez une table IP ou HS pour commencer.</p>';
    return;
  }
  state.perils.forEach(t => {
    const isIP = t.type === 'interplanetaire';
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700 mb-2';
    row.innerHTML = `<span class="text-xs font-bold px-2 py-1 rounded ${isIP ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}">${isIP ? 'IP' : 'HS'}</span><div class="flex-1 font-medium text-sm">${esc(t.name)}</div><div class="text-xs text-gray-400">${(t.categories || []).length} cat.</div><button class="text-xs text-blue-400 hover:text-blue-300" title="Éditer">✏️</button><button class="text-xs text-yellow-400 hover:text-yellow-300" title="Dupliquer">⧉</button><button class="text-xs text-red-400 hover:text-red-300" title="Supprimer">🗑️</button>`;
    row.querySelector('[title="Éditer"]').addEventListener('click', () => { state.perilEditorOpen = t.id; renderActiveTab(); });
    row.querySelector('[title="Dupliquer"]').addEventListener('click', () => duplicatePerilTable(t.id, panel));
    row.querySelector('[title="Supprimer"]').addEventListener('click', () => deletePerilTable(t.id, t.name, panel));
    rows.appendChild(row);
  });
}

async function duplicatePerilTable(id, panel) {
  try {
    const r = await fetchWithTable(`/api/perils/tables/${id}/duplicate`, { method: 'POST', credentials: 'include' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
    state.perils.push(j.data);
    renderActiveTab();
  } catch (e) { alert(e.message); }
}

async function createPerilTable(type, panel) {
  const name = prompt(`Nom de la nouvelle table ${type === 'interplanetaire' ? 'IP' : 'HS'} :`);
  if (!name?.trim()) return;
  try {
    const r = await fetchWithTable('/api/perils/tables', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), type, categories: [] }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || `Erreur ${r.status}`);
    state.perils.push(j.data);
    state.perilEditorOpen = j.data.id;
    renderActiveTab();
  } catch (e) { alert(e.message); }
}

function renderPerilEditor(panel, t) {
  const escA = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const inpF = (ci, pi, f, val, lbl, type = 'text', extra = '') =>
    `<div><label class="text-xs text-gray-400">${lbl}</label><input type="${type}" data-ci="${ci}" data-pi="${pi}" data-f="${f}" class="cpe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${escA(String(val ?? ''))}" ${extra}></div>`;
  const taF = (ci, pi, f, val, lbl, rows = 3) =>
    `<div><label class="text-xs text-gray-400">${lbl}</label><textarea data-ci="${ci}" data-pi="${pi}" data-f="${f}" class="cpe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" rows="${rows}">${escA(String(val ?? ''))}</textarea></div>`;

  function listBuilder(ci, pi, field, items, cols) {
    let rows = '';
    (items || []).forEach((item, idx) => {
      const cells = cols.map(c =>
        `<input data-ci="${ci}" data-pi="${pi}" data-f="${field}" data-idx="${idx}" data-col="${c.key}"
          class="cpe-list-field bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs ${c.flex ? 'flex-1' : 'w-20'}"
          placeholder="${escA(c.label)}" value="${escA(String(item[c.key] ?? ''))}">`
      ).join('');
      rows += `<div class="flex gap-1 items-center mb-1">${cells}<button data-del-list="${ci}-${pi}-${field}-${idx}" class="text-xs text-red-400 hover:text-red-300 px-1 shrink-0">✕</button></div>`;
    });
    return `<div class="cpe-list-container" data-listci="${ci}" data-listpi="${pi}" data-listf="${field}">${rows}</div>
      <button data-add-list="${ci}-${pi}-${field}" class="text-xs text-blue-400 hover:text-blue-300">+ Ajouter</button>`;
  }

  const cats = t.categories || [];
  let h = `<div class="flex items-center gap-3 mb-4"><button id="cpe-back" class="text-blue-400 hover:text-blue-300 text-sm">← Retour</button><input class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm flex-1" value="${escA(t.name)}" id="cpe-name"><span class="text-xs px-2 py-1 rounded ${t.type === 'interplanetaire' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}">${t.type === 'interplanetaire' ? 'IP' : 'HS'}</span></div>`;
  cats.forEach((cat, ci) => {
    h += `<details class="bg-gray-800 rounded-lg border border-gray-700 mb-2 p-3" open><summary class="cursor-pointer font-medium text-sm">${escA(cat.nom)} <span class="text-gray-400">(${cat.seuilMin}–${cat.seuilMax})</span></summary><div class="mt-3 space-y-2">`;
    (cat.perils || []).forEach((p, pi) => {
      const d = p.data || {};
      const proto = Array.isArray(d.protocole) ? d.protocole : [];
      const res = Array.isArray(d.resultat) ? d.resultat : [];
      h += `<details class="bg-gray-750 rounded border border-gray-600 p-2"><summary class="cursor-pointer text-sm flex justify-between"><span>${escA(p.nom)}</span><span class="text-gray-400 text-xs">${p.seuilMin}–${p.seuilMax}</span></summary><div class="mt-2 space-y-2 text-sm">`;
      h += inpF(ci, pi, 'nom', p.nom, 'Nom');
      h += taF(ci, pi, 'texteAmbiance', d.texteAmbiance ?? '', 'Texte d\'ambiance (joueurs)', 4);
      h += `<div class="flex gap-2 items-center">${inpF(ci, pi, 'mobile', d.mobile ? '1' : '', 'Mobile ?', 'checkbox', d.mobile ? 'checked' : '')}${inpF(ci, pi, 'senseurs', d.senseurs ?? 0, 'Senseurs', 'number')}${inpF(ci, pi, 'sciencesStellaires', d.sciencesStellaires ?? 0, 'Sc.Stellaires', 'number')}</div>`;
      h += taF(ci, pi, 'description', d.description ?? '', 'Description (MJ)', 4);
      h += `<div class="flex gap-2"><div class="flex-1"><label class="text-xs text-gray-400">Seuil min</label><input type="number" data-ci="${ci}" data-pi="${pi}" data-f="seuilMin" class="cpe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${p.seuilMin}"></div><div class="flex-1"><label class="text-xs text-gray-400">Seuil max</label><input type="number" data-ci="${ci}" data-pi="${pi}" data-f="seuilMax" class="cpe-field w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs" value="${p.seuilMax}"></div></div>`;
      h += `<div><label class="text-xs text-gray-400 block mb-1">Protocole (Rôle / Action)</label>${listBuilder(ci, pi, 'protocole', proto, [{key:'role', label:'Rôle', flex:false},{key:'action', label:'Action', flex:true}])}</div>`;
      h += `<div><label class="text-xs text-gray-400 block mb-1">Résultat (Seuil / Effet)</label>${listBuilder(ci, pi, 'resultat', res, [{key:'seuil', label:'Seuil', flex:false},{key:'effet', label:'Effet', flex:true}])}</div>`;
      h += `<button data-del-peril="${ci}-${pi}" class="text-xs text-red-400 hover:text-red-300">Supprimer ce péril</button></div></details>`;
    });
    h += `<button data-add-peril="${ci}" class="mt-1 text-xs text-blue-400 hover:text-blue-300">+ Ajouter un péril</button></div></details>`;
  });
  h += `<button id="cpe-add-cat" class="mt-2 text-sm text-yellow-400 hover:text-yellow-300 w-full py-2 border border-dashed border-gray-600 rounded-lg">+ Ajouter une catégorie</button>`;
  panel.innerHTML = h;

  panel.querySelector('#cpe-back').addEventListener('click', () => { state.perilEditorOpen = null; renderActiveTab(); });

  panel.querySelector('#cpe-name').addEventListener('change', async (e) => {
    const newName = e.target.value.trim();
    if (!newName || newName === t.name) return;
    await patchPerilTable(t.id, { name: newName });
    t.name = newName;
  });

  let saveTimer;
  panel.querySelectorAll('.cpe-field').forEach(inp => {
    inp.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => savePerilEditorState(t, panel), 800); });
  });
  panel.querySelectorAll('.cpe-list-field').forEach(inp => {
    inp.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => savePerilEditorState(t, panel), 800); });
  });

  panel.querySelectorAll('[data-del-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.delList.split('-');
      const ci = Number(parts[0]), pi = Number(parts[1]), field = parts[2], idx = Number(parts[3]);
      const peril = t.categories[ci]?.perils?.[pi];
      if (!peril?.data) return;
      if (Array.isArray(peril.data[field])) peril.data[field].splice(idx, 1);
      patchPerilTable(t.id, { categories: t.categories });
      renderActiveTab();
    });
  });

  panel.querySelectorAll('[data-add-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.addList.split('-');
      const ci = Number(parts[0]), pi = Number(parts[1]), field = parts[2];
      const peril = t.categories[ci]?.perils?.[pi];
      if (!peril?.data) return;
      if (!Array.isArray(peril.data[field])) peril.data[field] = [];
      if (field === 'protocole') peril.data[field].push({ role: '', action: '' });
      else if (field === 'resultat') peril.data[field].push({ seuil: '', effet: '' });
      patchPerilTable(t.id, { categories: t.categories });
      // Insertion DOM directe — pas de re-render pour éviter la rétraction des <details>
      const idx = peril.data[field].length - 1;
      const cols = field === 'protocole'
        ? [{ key: 'role', label: 'Rôle', flex: false }, { key: 'action', label: 'Action', flex: true }]
        : [{ key: 'seuil', label: 'Seuil', flex: false }, { key: 'effet', label: 'Effet', flex: true }];
      const container = panel.querySelector(`.cpe-list-container[data-listci="${ci}"][data-listpi="${pi}"][data-listf="${field}"]`);
      if (!container) return;
      const row = document.createElement('div');
      row.className = 'flex gap-1 items-center mb-1';
      cols.forEach(c => {
        const inp = document.createElement('input');
        inp.dataset.ci = ci; inp.dataset.pi = pi; inp.dataset.f = field;
        inp.dataset.idx = idx; inp.dataset.col = c.key;
        inp.className = `cpe-list-field bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs ${c.flex ? 'flex-1' : 'w-20'}`;
        inp.placeholder = c.label;
        inp.value = '';
        inp.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => savePerilEditorState(t, panel), 800); });
        row.appendChild(inp);
      });
      const delBtn = document.createElement('button');
      delBtn.dataset.delList = `${ci}-${pi}-${field}-${idx}`;
      delBtn.className = 'text-xs text-red-400 hover:text-red-300 px-1 shrink-0';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        const [ci2, pi2, field2, idx2] = delBtn.dataset.delList.split('-');
        const p2 = t.categories[Number(ci2)]?.perils?.[Number(pi2)];
        if (!p2?.data) return;
        if (Array.isArray(p2.data[field2])) p2.data[field2].splice(Number(idx2), 1);
        patchPerilTable(t.id, { categories: t.categories });
        renderActiveTab();
      });
      row.appendChild(delBtn);
      container.appendChild(row);
      row.querySelector('input')?.focus();
    });
  });

  panel.querySelectorAll('[data-del-peril]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [ci, pi] = btn.dataset.delPeril.split('-').map(Number);
      if (!confirm('Supprimer ce péril ?')) return;
      t.categories[ci].perils.splice(pi, 1);
      patchPerilTable(t.id, { categories: t.categories });
      renderActiveTab();
    });
  });

  panel.querySelectorAll('[data-add-peril]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = Number(btn.dataset.addPeril);
      const perils = t.categories[ci].perils || [];
      const mx = perils.length ? Math.max(...perils.map(p => p.seuilMax)) : 1;
      perils.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouveau péril', data: { texteAmbiance: '', mobile: false, senseurs: 0, sciencesStellaires: 0, description: '', protocole: [], resultat: [] } });
      t.categories[ci].perils = perils;
      patchPerilTable(t.id, { categories: t.categories });
      renderActiveTab();
    });
  });

  panel.querySelector('#cpe-add-cat').addEventListener('click', () => {
    const mx = t.categories.length ? Math.max(...t.categories.map(c => c.seuilMax)) : 1;
    t.categories.push({ seuilMin: mx + 1, seuilMax: mx + 1, nom: 'Nouvelle catégorie', perils: [] });
    patchPerilTable(t.id, { categories: t.categories });
    renderActiveTab();
  });
}

function savePerilEditorState(t, panel) {
  panel.querySelectorAll('.cpe-field').forEach(inp => {
    const ci = Number(inp.dataset.ci), pi = Number(inp.dataset.pi), f = inp.dataset.f;
    const peril = t.categories[ci]?.perils?.[pi];
    if (!peril) return;
    if (!peril.data) peril.data = {};
    if (f === 'nom') peril.nom = inp.value;
    else if (f === 'texteAmbiance') peril.data.texteAmbiance = inp.value;
    else if (f === 'description') peril.data.description = inp.value;
    else if (f === 'mobile') peril.data.mobile = inp.checked;
    else if (f === 'senseurs') peril.data.senseurs = +inp.value;
    else if (f === 'sciencesStellaires') peril.data.sciencesStellaires = +inp.value;
    else if (f === 'seuilMin') peril.seuilMin = +inp.value;
    else if (f === 'seuilMax') peril.seuilMax = +inp.value;
  });
  panel.querySelectorAll('.cpe-list-field').forEach(inp => {
    const ci = Number(inp.dataset.ci), pi = Number(inp.dataset.pi), f = inp.dataset.f;
    const idx = Number(inp.dataset.idx), col = inp.dataset.col;
    const peril = t.categories[ci]?.perils?.[pi];
    if (!peril?.data) return;
    if (!Array.isArray(peril.data[f])) return;
    if (peril.data[f][idx]) peril.data[f][idx][col] = inp.value;
  });
  patchPerilTable(t.id, { categories: t.categories });
}

async function patchPerilTable(id, body) {
  try {
    await fetchWithTable(`/api/perils/tables/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { console.error(e); }
}

async function deletePerilTable(id, name, panel) {
  if (!confirm(`Supprimer la table « ${name} » ? Les assignations liées seront aussi supprimées.`)) return;
  try {
    const r = await fetchWithTable(`/api/perils/tables/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    state.perils = state.perils.filter(t => t.id !== id);
    renderPerilsList(panel);
  } catch (e) { alert(e.message); }
}

//// -- Quadrants tab (per-table assignments) ------------------------------------
const QUAD_COLS_C = ["Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ","Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ","Φ","Χ","Ψ","Ω","Α′","Β′","Γ′","Δ′","Ε′","Ζ′","Η′","Θ′","Ι′","Κ′","Λ′","Μ′","Ν′","Ξ′","Ο′","Π′"];

function renderQuadrants(panel) {
  if (!state.isMJ && !state.isAdmin) {
    panel.innerHTML = '<p class="text-gray-400 text-sm italic py-8 text-center">Réservé au MJ.</p>';
    return;
  }
  const hsPerils = state.perils.filter(t => t.type === 'hyperspatial');
  const qAssignments = state.peril_assignments.quadrants || {};
  if (!hsPerils.length) {
    panel.innerHTML = `<p class="text-gray-400 text-sm italic py-4">Créez d'abord des tables HS dans l'onglet Périls.</p>`;
    return;
  }
  const hsOptions = `<option value="">— aucune —</option>` + hsPerils.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  function buildColPanel(col) {
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1 mt-3';
    for (let row = 1; row <= 40; row++) {
      const q = `${col}-${row}`;
      const cur = qAssignments[q] || '';
      const cell = document.createElement('div');
      cell.className = `flex items-center gap-2 px-2 py-1 rounded border ${cur ? 'bg-gray-800 border-purple-800' : 'bg-gray-800/50 border-gray-700'}`;
      cell.innerHTML = `<span class="text-yellow-400 text-xs font-bold w-16 shrink-0">${esc(q)}</span><select class="flex-1 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs">${hsOptions}</select>`;
      const sel = cell.querySelector('select');
      sel.value = cur;
      sel.addEventListener('change', async () => {
        const val = sel.value;
        try {
          const r = await fetchWithTable('/api/perils/assignments', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assign_type: 'hyperspatial', key: q, peril_table_id: val }) });
          if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
          if (val) state.peril_assignments.quadrants[q] = val;
          else delete state.peril_assignments.quadrants[q];
          cell.className = `flex items-center gap-2 px-2 py-1 rounded border ${val ? 'bg-gray-800 border-purple-800' : 'bg-gray-800/50 border-gray-700'}`;
        } catch (e) { sel.value = qAssignments[q] || ''; alert(e.message); }
      });
      wrap.appendChild(cell);
    }
    return wrap;
  }
  panel.innerHTML = '';
  // Navigation row: [◀] [clipped tab bar, translate-based] [▶]
  const navRow = document.createElement('div');
  navRow.className = 'flex items-center gap-1 border-b border-gray-700 pb-1';
  const prevArrow = document.createElement('button');
  prevArrow.innerHTML = '&#8249;';
  prevArrow.className = 'shrink-0 w-7 h-8 flex items-center justify-center text-xl text-gray-400 hover:text-white rounded hover:bg-gray-700';
  const tabScroller = document.createElement('div');
  tabScroller.style.cssText = 'flex:1; min-width:0; overflow:hidden;';
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex; gap:4px; transition:transform 0.2s ease; will-change:transform;';
  tabScroller.appendChild(tabBar);
  const nextArrow = document.createElement('button');
  nextArrow.innerHTML = '&#8250;';
  nextArrow.className = 'shrink-0 w-7 h-8 flex items-center justify-center text-xl text-gray-400 hover:text-white rounded hover:bg-gray-700';
  navRow.appendChild(prevArrow);
  navRow.appendChild(tabScroller);
  navRow.appendChild(nextArrow);
  let tabOffset = 0;
  function getMaxOffset() { return Math.max(0, tabBar.scrollWidth - tabScroller.clientWidth); }
  function applyOffset(offset) {
    tabOffset = Math.max(0, Math.min(getMaxOffset(), offset));
    tabBar.style.transform = `translateX(-${tabOffset}px)`;
    prevArrow.style.opacity = tabOffset <= 0 ? '0.3' : '1';
    nextArrow.style.opacity = tabOffset >= getMaxOffset() ? '0.3' : '1';
  }
  prevArrow.addEventListener('click', () => applyOffset(tabOffset - 200));
  nextArrow.addEventListener('click', () => applyOffset(tabOffset + 200));
  const panels = [];
  QUAD_COLS_C.forEach((col, i) => {
    const btn = document.createElement('button');
    btn.textContent = col;
    btn.className = `shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${i === 0 ? 'bg-gray-700 text-blue-400 border-t border-x border-gray-600' : 'text-gray-400 hover:text-gray-200'}`;
    tabBar.appendChild(btn);
    const p = document.createElement('div');
    if (i !== 0) p.classList.add('hidden');
    panels.push(p);
    btn.addEventListener('click', () => {
      tabBar.querySelectorAll('button').forEach((b, j) => {
        b.className = `shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${j === i ? 'bg-gray-700 text-blue-400 border-t border-x border-gray-600' : 'text-gray-400 hover:text-gray-200'}`;
      });
      panels.forEach((p2, j) => p2.classList.toggle('hidden', j !== i));
      if (!p.hasChildNodes()) p.appendChild(buildColPanel(col));
      // Center the selected tab in the visible area
      applyOffset(btn.offsetLeft - tabScroller.clientWidth / 2 + btn.clientWidth / 2);
    });
  });
  panels[0].appendChild(buildColPanel(QUAD_COLS_C[0]));
  panel.appendChild(navRow);
  panels.forEach(p => panel.appendChild(p));
  // Init arrows after layout
  requestAnimationFrame(() => applyOffset(0));
}
async function saveAssignment(assignType, key, perilTableId, panel) {
  try {
    const r = await fetchWithTable('/api/perils/assignments', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assign_type: assignType, key, peril_table_id: perilTableId }) });
    if (!r.ok) { const j = await r.json(); throw new Error(j.error?.message || `Erreur ${r.status}`); }
    // Update local state
    if (assignType === 'hyperspatial') {
      if (perilTableId) state.peril_assignments.quadrants[key] = perilTableId;
      else delete state.peril_assignments.quadrants[key];
    } else {
      if (perilTableId) state.peril_assignments.systems[key] = perilTableId;
      else delete state.peril_assignments.systems[key];
    }
    renderQuadrants(panel);
  } catch (e) { alert(e.message); }
}

// --- Exports for testing ---
export {
  state, loadAllData, renderApp, switchTab, handleSyncData,
  executeToggle, renderSystems, renderFactions, renderPerils, renderQuadrants, renderShipModels, renderFleet, esc,
  performSearch, exitSearchMode, renderSearchResults,
  openEditModal, EDIT_FIELDS, renderEditButton
};

init();
