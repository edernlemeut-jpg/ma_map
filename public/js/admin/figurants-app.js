/**
 * figurants-app.js — Catalogue Figurants (MJ)
 *
 * Module autonome:  initFigurantsApp(container, isMJ = true)
 * Epic 10 — Story 10.3
 *
 * - Browse stats-blocs (list + filtre faction/q debounce 300ms)
 * - Détail complet en overlay
 * - CRUD templates personnalisés (MJ uniquement)
 * - Toutes les valeurs HTML via esc()
 */

/* ── XSS guard ──────────────────────────────────────────────────────────────── */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── State ──────────────────────────────────────────────────────────────────── */
let _root     = null;
let _isMJ     = false;
let _templates = [];
let _searchTimeout = null;

/* ── Entry point ────────────────────────────────────────────────────────────── */
export async function initFigurantsApp(container, isMJ = false) {
  _root  = container;
  _isMJ  = isMJ;
  renderSkeleton();
  await loadAndRender({});
}

/* ── Skeleton ───────────────────────────────────────────────────────────────── */
function renderSkeleton() {
  _root.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold flex-1">Catalogue Figurants</h2>
        ${_isMJ ? `<button id="fig-btn-new" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">+ Nouveau</button>` : ''}
      </div>
      <!-- Filtres -->
      <div class="flex flex-wrap gap-2">
        <input id="fig-search" type="text" placeholder="Rechercher par nom…"
          class="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm placeholder-gray-400">
        <select id="fig-faction" class="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          <option value="">Toutes factions</option>
          <option value="EG">EG</option>
          <option value="Sol">Sol</option>
          <option value="OCG">OCG</option>
          <option value="LPL">LPL</option>
          <option value="B">Barrens</option>
          <option value="P">Pirates</option>
          <option value="Havane">Havane</option>
        </select>
        <select id="fig-categorie" class="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          <option value="">Toutes catégories</option>
          <option value="militaire">Militaire</option>
          <option value="pirate">Pirate</option>
          <option value="espion">Espion</option>
          <option value="corporatif">Corporatif</option>
          <option value="civil">Civil</option>
        </select>
      </div>
      <!-- Liste -->
      <div id="fig-list" class="space-y-2"></div>
    </div>`;

  document.getElementById('fig-search')?.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(applyFilters, 300);
  });
  document.getElementById('fig-faction')?.addEventListener('change', applyFilters);
  document.getElementById('fig-categorie')?.addEventListener('change', applyFilters);
  document.getElementById('fig-btn-new')?.addEventListener('click', () => openForm(null));
}

/* ── Load ─────────────────────────────────────────────────────────────────── */
async function loadAndRender(filters) {
  const params = new URLSearchParams();
  if (filters.q)         params.set('q', filters.q);
  if (filters.faction)   params.set('faction', filters.faction);
  if (filters.categorie) params.set('categorie', filters.categorie);

  try {
    const res = await fetch(`/api/figurants?${params}`, { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const json = await res.json();
    _templates = json.data ?? [];
    renderList();
  } catch {
    const list = document.getElementById('fig-list');
    if (list) list.innerHTML = `<p class="text-red-400 text-sm">Erreur lors du chargement du catalogue.</p>`;
  }
}

/* ── Apply filters ──────────────────────────────────────────────────────────── */
function applyFilters() {
  loadAndRender({
    q:         document.getElementById('fig-search')?.value.trim() || '',
    faction:   document.getElementById('fig-faction')?.value || '',
    categorie: document.getElementById('fig-categorie')?.value || '',
  });
}

/* ── Render list ────────────────────────────────────────────────────────────── */
function renderList() {
  const list = document.getElementById('fig-list');
  if (!list) return;

  if (_templates.length === 0) {
    list.innerHTML = `
      <div class="text-center py-8">
        <p class="text-gray-400 italic">Aucun figurant trouvé.</p>
      </div>`;
    return;
  }

  list.innerHTML = _templates.map(t => {
    const sysTag = t.is_system_template
      ? `<span class="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">système</span>`
      : `<span class="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">perso</span>`;
    const factionBadge = t.faction
      ? `<span class="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">${esc(t.faction)}</span>`
      : '';
    const catBadge = t.categorie
      ? `<span class="text-xs text-gray-500">${esc(t.categorie)}</span>`
      : '';
    const stats = `STR ${esc(t.structure)} | BLD ${esc(t.blindage)} | DMG ${esc(t.degats ?? '—')} | MF ${esc(t.mf_disponible)}`;
    const editBtn = _isMJ && !t.is_system_template
      ? `<button data-fig-edit="${esc(t.id)}" class="text-xs text-blue-400 hover:text-blue-300 ml-2">Éditer</button>`
      : '';
    const deleteBtn = _isMJ && !t.is_system_template
      ? `<button data-fig-delete="${esc(t.id)}" class="text-xs text-red-400 hover:text-red-300 ml-1">✕</button>`
      : '';

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-gray-500 transition-colors"
           data-fig-detail="${esc(t.id)}">
        <div class="flex items-start gap-2 flex-wrap">
          <span class="font-medium text-sm flex-1">${esc(t.nom)}</span>
          ${sysTag} ${factionBadge} ${catBadge}
        </div>
        <p class="text-xs text-gray-400 font-mono mt-1">${stats}</p>
        <div class="mt-1 flex items-center">
          <button data-fig-detail="${esc(t.id)}" class="text-xs text-gray-400 hover:text-gray-200">Voir stats-bloc</button>
          ${editBtn}${deleteBtn}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-fig-detail]').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.figDetail);
      const t = _templates.find(x => x.id === id);
      if (t) openDetail(t);
    });
  });
  list.querySelectorAll('[data-fig-edit]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = _templates.find(x => x.id === Number(el.dataset.figEdit));
      if (t) openForm(t);
    });
  });
  list.querySelectorAll('[data-fig-delete]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(el.dataset.figDelete);
      const t = _templates.find(x => x.id === id);
      if (!t) return;
      if (!confirm(`Supprimer "${t.nom}" ?`)) return;
      await deleteFigurant(id);
    });
  });
}

/* ── Detail overlay ─────────────────────────────────────────────────────────── */
function openDetail(t) {
  const existing = document.getElementById('fig-detail-overlay');
  if (existing) existing.remove();

  let comps = '';
  if (t.competences && Array.isArray(t.competences)) {
    comps = t.competences.map(c => `<span class="text-xs bg-gray-700 px-1.5 py-0.5 rounded">${esc(c)}</span>`).join(' ');
  } else if (t.competences) {
    comps = `<span class="text-xs text-gray-400">${esc(JSON.stringify(t.competences))}</span>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'fig-detail-overlay';
  overlay.className = 'fixed inset-0 bg-black/75 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';
  overlay.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mb-8">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 class="font-semibold text-base">${esc(t.nom)}</h3>
        <button id="fig-detail-close" class="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
      </div>
      <div class="p-4 space-y-3">
        <!-- Badges -->
        <div class="flex flex-wrap gap-1.5">
          ${t.faction ? `<span class="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">${esc(t.faction)}</span>` : ''}
          ${t.categorie ? `<span class="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">${esc(t.categorie)}</span>` : ''}
          ${t.is_system_template ? `<span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">template système</span>` : ''}
        </div>
        <!-- Stats grid -->
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="bg-gray-800 rounded p-2 text-center">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Structure</p>
            <p class="text-lg font-bold text-white">${esc(t.structure)}</p>
          </div>
          <div class="bg-gray-800 rounded p-2 text-center">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Blindage</p>
            <p class="text-lg font-bold text-white">${esc(t.blindage)}</p>
          </div>
          <div class="bg-gray-800 rounded p-2 text-center">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Dégâts</p>
            <p class="text-base font-bold text-amber-300">${esc(t.degats ?? '—')}</p>
          </div>
          <div class="bg-gray-800 rounded p-2 text-center">
            <p class="text-xs text-gray-500 uppercase tracking-wide">MF disponible</p>
            <p class="text-lg font-bold text-yellow-300">${esc(t.mf_disponible)}</p>
          </div>
        </div>
        ${comps ? `<div><p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Compétences</p><div class="flex flex-wrap gap-1">${comps}</div></div>` : ''}
        ${t.notes ? `<div><p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p><p class="text-sm text-gray-300">${esc(t.notes)}</p></div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#fig-detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ── Form (add/edit custom templates) ──────────────────────────────────────── */
function openForm(t) {
  const existing = document.getElementById('fig-form-overlay');
  if (existing) existing.remove();

  const v = (field, fallback = '') => esc(t?.[field] ?? fallback);
  const overlay = document.createElement('div');
  overlay.id = 'fig-form-overlay';
  overlay.className = 'fixed inset-0 bg-black/75 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto';
  overlay.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mb-8">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 class="font-semibold text-base">${t ? `Éditer : ${esc(t.nom)}` : 'Nouveau figurant'}</h3>
        <button id="fig-form-close" class="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
      </div>
      <div class="p-4 space-y-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Nom *</label>
          <input id="ffe-nom" type="text" value="${v('nom')}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Faction</label>
            <input id="ffe-faction" type="text" value="${v('faction')}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Catégorie</label>
            <input id="ffe-categorie" type="text" value="${v('categorie')}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Structure</label>
            <input id="ffe-structure" type="number" min="1" value="${t?.structure ?? 3}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Blindage</label>
            <input id="ffe-blindage" type="number" min="0" value="${t?.blindage ?? 0}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">MF dispo</label>
            <input id="ffe-mf" type="number" min="0" value="${t?.mf_disponible ?? 0}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          </div>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Dégâts</label>
          <input id="ffe-degats" type="text" value="${v('degats')}" placeholder="ex: 1D6+1" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Notes</label>
          <textarea id="ffe-notes" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm resize-none">${v('notes')}</textarea>
        </div>
        <div id="fig-form-error" class="text-red-400 text-xs hidden"></div>
        <div class="flex gap-2 pt-1">
          <button id="fig-form-save" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 rounded">
            ${t ? 'Enregistrer' : 'Créer'}
          </button>
          <button id="fig-form-cancel" class="px-4 py-2 text-sm text-gray-400 hover:text-white">Annuler</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#fig-form-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#fig-form-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#fig-form-save').addEventListener('click', () => saveForm(t?.id ?? null, overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveForm(id, overlay) {
  const nom       = document.getElementById('ffe-nom')?.value.trim();
  const faction   = document.getElementById('ffe-faction')?.value.trim() || null;
  const categorie = document.getElementById('ffe-categorie')?.value.trim() || null;
  const structure = Number(document.getElementById('ffe-structure')?.value);
  const blindage  = Number(document.getElementById('ffe-blindage')?.value);
  const degats    = document.getElementById('ffe-degats')?.value.trim() || null;
  const mf_disponible = Number(document.getElementById('ffe-mf')?.value);
  const notes     = document.getElementById('ffe-notes')?.value.trim() || null;

  const errEl = document.getElementById('fig-form-error');
  if (!nom) { errEl.textContent = 'Le nom est requis.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  const method = id ? 'PATCH' : 'POST';
  const url    = id ? `/api/figurants/${id}` : '/api/figurants';

  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, faction, categorie, structure, blindage, degats, mf_disponible, notes }),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.error?.message ?? 'Erreur lors de l\'enregistrement.';
      errEl.classList.remove('hidden');
      return;
    }
    overlay.remove();
    applyFilters();
  } catch {
    errEl.textContent = 'Erreur réseau.';
    errEl.classList.remove('hidden');
  }
}

async function deleteFigurant(id) {
  try {
    await fetch(`/api/figurants/${id}`, { method: 'DELETE', credentials: 'include' });
    applyFilters();
  } catch { /* ignore */ }
}
