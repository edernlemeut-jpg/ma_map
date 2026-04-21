import { initHeader } from '/js/shared/header.js';
import { getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';
import { createPoller } from '/js/shared/poller.js';

// --- State ---
let state = {
  systems: [],
  factions: [],
  ship_models: [],
  activeTab: 'systems',
  isMJ: false,
  lastKnownCounts: { systems: 0, factions: 0, ship_models: 0 },
  badges: { systems: false, factions: false, ship_models: false },
  searchMode: false,
  searchResults: []
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
  if (!tableId) { window.location.href = '/'; return; }

  try {
    await loadAllData();
    $('loading').classList.add('hidden');
    renderApp();
    startPoller();
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
  const [sysRes, facRes, smRes] = await Promise.all([
    fetchWithTable('/api/systems'),
    fetchWithTable('/api/factions'),
    fetchWithTable('/api/ship-models')
  ]);

  if (!sysRes.ok || !facRes.ok || !smRes.ok) throw new Error('API error');

  const [sysJson, facJson, smJson] = await Promise.all([
    sysRes.json(), facRes.json(), smRes.json()
  ]);

  state.systems = sysJson.data;
  state.factions = facJson.data;
  state.ship_models = smJson.data;

  // Detect MJ: API returns 'visible' field on entities only for MJ
  const allEntities = [...state.systems, ...state.factions, ...state.ship_models];
  state.isMJ = allEntities.length > 0 && 'visible' in allEntities[0];

  // Update known counts for poller comparison
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

  if (totalCount === 0 && !state.isMJ) {
    $('empty-global').classList.remove('hidden');
    $('tab-nav').classList.add('hidden');
    return;
  }

  $('empty-global').classList.add('hidden');
  $('tab-nav').classList.remove('hidden');

  // Tab buttons
  setupTabNav();
  renderActiveTab();
}

function setupTabNav() {
  const nav = $('tab-nav');
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
  panel.classList.remove('hidden');

  const data = state[state.activeTab];
  const renderers = { systems: renderSystems, factions: renderFactions, ship_models: renderShipModels };
  renderers[state.activeTab](panel, data);
}

// --- Empty states per tab ---
const EMPTY_MESSAGES = {
  systems: { icon: '🌌', text: 'Aucun système stellaire cartographié. Vos capteurs longue portée n\'ont encore rien détecté…' },
  factions: { icon: '📡', text: 'Aucune faction répertoriée. Les canaux diplomatiques sont silencieux…' },
  ship_models: { icon: '🚀', text: 'Aucun modèle de vaisseau dans la base de données. Les chantiers navals n\'ont rien publié…' }
};

function renderEmptyState(panel, type) {
  const msg = EMPTY_MESSAGES[type];
  panel.innerHTML = `
    <div class="text-center py-12 px-4">
      <p class="text-2xl mb-3">${msg.icon}</p>
      <p class="text-gray-400 italic max-w-md mx-auto">${msg.text}</p>
    </div>`;
}

// --- Entity renderers ---
function renderSystems(panel, systems) {
  if (systems.length === 0) { renderEmptyState(panel, 'systems'); return; }
  panel.innerHTML = systems.map(s => `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">${esc(s.nom)}</h3>
          <div class="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>📍 ${esc(s.quadrant)}</span>
            ${s.faction ? `<span>⚔️ ${esc(s.faction)}</span>` : ''}
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
    </div>`).join('');
}

function renderFactions(panel, factions) {
  if (factions.length === 0) { renderEmptyState(panel, 'factions'); return; }
  panel.innerHTML = factions.map(f => `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">
            ${f.icon ? `<span class="mr-1">${esc(f.icon)}</span>` : ''}${esc(f.name)}
            ${f.short ? `<span class="text-xs text-gray-500 ml-2">(${esc(f.short)})</span>` : ''}
          </h3>
          ${f.description ? `<p class="text-sm text-gray-400 mt-2 line-clamp-2">${esc(f.description)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          ${renderEditButton('factions', f)}
          ${renderVisibilityToggle('factions', f)}
        </div>
      </div>
    </div>`).join('');
}

function renderShipModels(panel, models) {
  if (models.length === 0) { renderEmptyState(panel, 'ship_models'); return; }
  panel.innerHTML = models.map(m => `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">${esc(m.nom)}</h3>
          <div class="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            ${m.classe ? `<span>📦 ${esc(m.classe)}</span>` : ''}
            ${m.origine ? `<span>🏭 ${esc(m.origine)}</span>` : ''}
            ${m.prix ? `<span>💰 ${esc(String(m.prix))} cr.</span>` : ''}
          </div>
          ${m.equipage ? `<p class="text-sm text-gray-400 mt-1">👥 Équipage: ${esc(m.equipage)}</p>` : ''}
          ${m.description ? `<p class="text-sm text-gray-400 mt-2 line-clamp-2">${esc(m.description)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          ${renderEditButton('ship_models', m)}
          ${renderVisibilityToggle('ship_models', m)}
        </div>
      </div>
    </div>`).join('');
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

  if (currentlyVisible) {
    // Hiding — micro-confirmation
    showHideConfirmation(btn, entityType, entityId);
  } else {
    // Revealing — immediate
    executeToggle(entityType, entityId, true);
  }
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
            ${s.faction ? `<span>⚔️ ${esc(s.faction)}</span>` : ''}
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
  return `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3 hover:border-gray-500 transition-colors${hidden ? ' opacity-50' : ''}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-100 truncate">${esc(m.nom)}${hidden ? ' <span class="text-gray-500 ml-1" title="Caché aux joueurs">👁️‍🗨️</span>' : ''}</h3>
          <div class="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            ${m.classe ? `<span>📦 ${esc(m.classe)}</span>` : ''}
            ${m.origine ? `<span>🏭 ${esc(m.origine)}</span>` : ''}
            ${m.prix ? `<span>💰 ${esc(String(m.prix))} cr.</span>` : ''}
          </div>
          ${m.equipage ? `<p class="text-sm text-gray-400 mt-1">👥 Équipage: ${esc(m.equipage)}</p>` : ''}
          ${m.description ? `<p class="text-sm text-gray-400 mt-2 line-clamp-2">${esc(m.description)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          ${renderEditButton('ship_models', m)}
          ${renderVisibilityToggle('ship_models', m)}
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

// --- Edit modal (MJ only) ---

const EDIT_FIELDS = {
  systems: [
    { key: 'nom', label: 'Nom', type: 'text', required: true },
    { key: 'quadrant', label: 'Quadrant', type: 'text' },
    { key: 'faction', label: 'Faction', type: 'text' },
    { key: 'gouvernement', label: 'Gouvernement', type: 'text' },
    { key: 'route', label: 'Route', type: 'text' },
    { key: 'is_frontiere', label: 'Frontière', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'textarea' }
  ],
  factions: [
    { key: 'name', label: 'Nom', type: 'text', required: true },
    { key: 'short', label: 'Abréviation', type: 'text' },
    { key: 'icon', label: 'Icône', type: 'text' },
    { key: 'color', label: 'Couleur', type: 'color' },
    { key: 'description', label: 'Description', type: 'textarea' }
  ],
  ship_models: [
    { key: 'nom', label: 'Nom', type: 'text', required: true },
    { key: 'classe', label: 'Classe', type: 'text' },
    { key: 'origine', label: 'Origine', type: 'text' },
    { key: 'prix', label: 'Prix (cr.)', type: 'number' },
    { key: 'equipage', label: 'Équipage', type: 'text' },
    { key: 'passagers', label: 'Passagers', type: 'text' },
    { key: 'blindage', label: 'Blindage', type: 'number' },
    { key: 'coque', label: 'Coque', type: 'number' },
    { key: 'vitesse_croisiere', label: 'Vitesse croisière', type: 'number' },
    { key: 'vitesse_hyperspatiale', label: 'Vitesse hyperspatiale', type: 'number' },
    { key: 'vitesse_tactique', label: 'Vitesse tactique', type: 'text' },
    { key: 'autonomie', label: 'Autonomie', type: 'number' },
    { key: 'manoeuvrabilite', label: 'Manœuvrabilité', type: 'text' },
    { key: 'senseurs', label: 'Senseurs', type: 'text' },
    { key: 'soute', label: 'Soute (m³)', type: 'number' },
    { key: 'image', label: 'Image URL', type: 'text' }
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
  const list = state[entityType];
  const entity = list.find(e => String(e.id) === String(entityId));
  if (!entity) return;

  const fields = EDIT_FIELDS[entityType];
  if (!fields) return;

  const overlay = document.createElement('div');
  overlay.id = 'edit-modal-overlay';
  overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4';

  const nameField = fields.find(f => f.required);
  const title = entity[nameField?.key] || 'Entité';

  overlay.innerHTML = `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl" id="edit-modal-panel">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-100">Modifier : ${esc(String(title))}</h2>
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
    const res = await fetchWithTable(`${apiPath}/${entityId}`, {
      method: 'PATCH',
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
    const idx = list.findIndex(e => String(e.id) === String(entityId));
    if (idx !== -1) {
      // Preserve visibility info from local state
      const vis = list[idx].visible;
      list[idx] = { ...updated, visible: vis };
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
  openEditModal(btn.dataset.editType, btn.dataset.editId);
});

// --- Exports for testing ---
export {
  state, loadAllData, renderApp, switchTab, handleSyncData,
  executeToggle, renderSystems, renderFactions, renderShipModels, esc,
  performSearch, exitSearchMode, renderSearchResults,
  openEditModal, EDIT_FIELDS, renderEditButton
};

init();
