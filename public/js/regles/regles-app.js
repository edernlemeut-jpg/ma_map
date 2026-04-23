import { initHeader, loadTableContext } from '/js/shared/header.js';
import { fetchWithTable, renderTableSelector } from '/js/shared/table-selector.js';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  entries: [],
  filtered: [],
  activeCategory: 'all',
  searchQuery: '',
  selectedId: null,
  user: null,
  canEdit: false,
};

const CATEGORY_LABELS = {
  competences: 'Compétences',
  qualites:    'Qualités',
  defauts:     'Défauts',
  mutations:   'Mutations',
  actions:     'Actions',
};

const CATEGORY_ICONS = {
  competences: '🎯',
  qualites:    '⭐',
  defauts:     '💀',
  mutations:   '🧬',
  actions:     '⚔️',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const DOM = {
  loading:      () => $('loading'),
  mainLayout:   () => $('main-layout'),
  emptyState:   () => $('empty-state'),
  errorState:   () => $('error-state'),
  entryList:    () => $('entry-list'),
  detail:       () => $('entry-detail'),
  placeholder:  () => $('detail-placeholder'),
  searchInput:  () => $('search-input'),
  searchClear:  () => $('search-clear'),
  catNav:       () => $('cat-nav'),
  btnAdd:       () => $('btn-add'),
  modalOverlay: () => $('modal-overlay'),
  modalBody:    () => $('modal-body'),
  modalClose:   () => $('modal-close'),
  retryBtn:     () => $('retry-btn'),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Convert [[some-id]] references to bold spans */
function linkRefs(text) {
  if (!text) return '';
  return esc(text).replace(/\[\[([^\]]+)\]\]/g, (_, id) => {
    const ref = state.entries.find(e => e.id === id);
    const label = ref ? ref.name : id;
    return `<strong class="text-blue-400 cursor-pointer ref-link" data-ref-id="${esc(id)}">${esc(label)}</strong>`;
  });
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function loadEntries() {
  DOM.loading().classList.remove('hidden');
  DOM.mainLayout().classList.add('hidden');
  DOM.emptyState().classList.add('hidden');
  DOM.errorState().classList.add('hidden');

  try {
    const res = await fetchWithTable('/api/rules');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.entries = json.data ?? [];
  } catch {
    DOM.loading().classList.add('hidden');
    DOM.errorState().classList.remove('hidden');
    return;
  }

  DOM.loading().classList.add('hidden');
  applyFilter();
}

// ── Filter / render ──────────────────────────────────────────────────────────
function applyFilter() {
  const q = state.searchQuery.toLowerCase();
  state.filtered = state.entries.filter(e => {
    const catOk = state.activeCategory === 'all' || e.category === state.activeCategory;
    if (!catOk) return false;
    if (!q) return true;
    return (e.name + ' ' + (e.description ?? '') + ' ' + JSON.stringify(e.extra ?? '')).toLowerCase().includes(q);
  });

  renderList();
}

function renderList() {
  const list = DOM.entryList();
  list.innerHTML = '';

  if (state.filtered.length === 0) {
    DOM.mainLayout().classList.add('hidden');
    DOM.emptyState().classList.remove('hidden');
    return;
  }

  DOM.emptyState().classList.add('hidden');
  DOM.mainLayout().classList.remove('hidden');

  for (const entry of state.filtered) {
    const card = document.createElement('button');
    card.className = [
      'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
      state.selectedId === entry.id
        ? 'bg-gray-700 border-blue-500 text-white'
        : 'bg-gray-800 border-gray-700 hover:border-gray-500 text-gray-200',
    ].join(' ');
    card.dataset.id = entry.id;

    const icon = CATEGORY_ICONS[entry.category] ?? '📄';
    const badge = entry.table_id
      ? '<span class="ml-1 text-xs text-yellow-400" title="Règle maison">★</span>'
      : '';

    card.innerHTML = `
      <div class="flex items-start gap-1.5">
        <span class="text-base flex-shrink-0">${icon}</span>
        <span class="flex-1 leading-tight font-medium">${esc(entry.name)}${badge}</span>
      </div>
      ${state.activeCategory === 'all'
        ? `<div class="text-xs text-gray-500 mt-0.5 ml-6">${esc(CATEGORY_LABELS[entry.category] ?? entry.category)}</div>`
        : ''}
    `;
    card.addEventListener('click', () => selectEntry(entry.id));
    list.appendChild(card);
  }

  // Restore selection if still in filtered list
  if (state.selectedId && state.filtered.find(e => e.id === state.selectedId)) {
    if (window.innerWidth >= 1024) renderDetail(state.selectedId);
  } else if (state.filtered.length > 0 && window.innerWidth >= 1024) {
    selectEntry(state.filtered[0].id);
  }
}

function selectEntry(id) {
  state.selectedId = id;
  // Update active card style
  DOM.entryList().querySelectorAll('button[data-id]').forEach(btn => {
    const active = btn.dataset.id === id;
    btn.className = [
      'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
      active ? 'bg-gray-700 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 hover:border-gray-500 text-gray-200',
    ].join(' ');
  });
  // Mobile (< lg): open detail in modal overlay; Desktop: show in side panel
  if (window.innerWidth < 1024) {
    renderDetail(id, DOM.modalBody());
    DOM.modalOverlay().classList.remove('hidden');
  } else {
    renderDetail(id);
  }
}

function renderDetail(id, container) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  const detail = container ?? DOM.detail();
  DOM.placeholder()?.classList.add('hidden');

  const ex = entry.extra ?? {};
  const icon = CATEGORY_ICONS[entry.category] ?? '📄';
  const globalBadge = !entry.table_id
    ? '<span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">Globale</span>'
    : '<span class="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">★ Règle maison</span>';

  let extraHtml = '';

  if (entry.category === 'competences') {
    extraHtml = `
      <div class="flex flex-wrap gap-3 text-sm mt-3">
        ${ex.domain ? `<span class="bg-gray-700 px-2 py-0.5 rounded">🏷️ ${esc(ex.domain)}</span>` : ''}
        ${ex.is_closed ? '<span class="bg-gray-700 px-2 py-0.5 rounded">🔒 Fermée</span>' : ''}
        ${ex.is_violent ? '<span class="bg-red-900 text-red-300 px-2 py-0.5 rounded">⚔️ Violente</span>' : ''}
      </div>`;
  } else if (entry.category === 'qualites' || entry.category === 'defauts') {
    extraHtml = `
      <div class="flex flex-wrap gap-3 text-sm mt-3">
        ${ex.cost ? `<span class="bg-gray-700 px-2 py-0.5 rounded">💰 Coût: ${esc(ex.cost)}</span>` : ''}
        ${ex.nation && ex.nation !== 'Aucune' ? `<span class="bg-gray-700 px-2 py-0.5 rounded">🌍 ${esc(ex.nation)}</span>` : ''}
        ${ex.restriction ? `<span class="bg-orange-900 text-orange-300 px-2 py-0.5 rounded">⚠️ ${esc(ex.restriction)}</span>` : ''}
      </div>
      ${ex.effects ? `<div class="mt-3"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Effets</p><p class="text-sm text-gray-200 leading-relaxed">${linkRefs(ex.effects)}</p></div>` : ''}
      ${ex.prerequisites ? `<div class="mt-3"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Prérequis</p><p class="text-sm text-gray-300">${linkRefs(ex.prerequisites)}</p></div>` : ''}
      ${(ex.references ?? []).length > 0 ? `<div class="mt-3"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Références</p><p class="text-sm text-gray-400">${ex.references.map(r => esc(r)).join(', ')}</p></div>` : ''}`;
  } else if (entry.category === 'mutations') {
    extraHtml = `
      <div class="flex flex-wrap gap-3 text-sm mt-3">
        ${ex.mutation_type ? `<span class="bg-purple-900 text-purple-300 px-2 py-0.5 rounded">🧬 ${esc(ex.mutation_type)}</span>` : ''}
        ${ex.ex_cost ? `<span class="bg-gray-700 px-2 py-0.5 rounded">⚡ EX: ${esc(ex.ex_cost)}</span>` : ''}
        ${ex.is_maintained ? '<span class="bg-blue-900 text-blue-300 px-2 py-0.5 rounded">↺ Maintenu</span>' : ''}
      </div>
      ${ex.effect ? `<div class="mt-3"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Effet</p><p class="text-sm text-gray-200 leading-relaxed">${linkRefs(ex.effect)}</p></div>` : ''}`;
  } else if (entry.category === 'actions') {
    const tags = (ex.tags ?? []).map(t => `<span class="bg-gray-700 px-2 py-0.5 rounded">${esc(t)}</span>`).join(' ');
    extraHtml = `
      <div class="flex flex-wrap gap-3 text-sm mt-3">
        ${ex.category ? `<span class="bg-gray-700 px-2 py-0.5 rounded">🗂️ ${esc(ex.category)}</span>` : ''}
        ${ex.duration ? `<span class="bg-gray-700 px-2 py-0.5 rounded">⏱️ ${esc(ex.duration)}</span>` : ''}
        ${ex.domain ? `<span class="bg-gray-700 px-2 py-0.5 rounded">🏷️ ${esc(ex.domain)}</span>` : ''}
        ${tags}
      </div>
      ${ex.rules ? `<div class="mt-3"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Règle</p><p class="text-sm text-gray-200 leading-relaxed">${linkRefs(ex.rules)}</p></div>` : ''}`;
  }

  const editButtons = state.canEdit
    ? `<div class="flex gap-2 mt-5 pt-4 border-t border-gray-700">
         <button data-edit="${esc(id)}" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-lg">✏️ Modifier</button>
         ${(state.user?.is_admin || entry.table_id) ? `<button data-delete="${esc(id)}" class="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 text-sm rounded-lg">🗑️ Supprimer</button>` : ''}
       </div>`
    : '';

  detail.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <h3 class="text-lg font-bold">${icon} ${esc(entry.name)}</h3>
      ${globalBadge}
    </div>
    ${entry.description ? `<p class="text-gray-300 leading-relaxed">${linkRefs(entry.description)}</p>` : ''}
    ${extraHtml}
    ${editButtons}
  `;

  // ref links
  detail.querySelectorAll('.ref-link').forEach(el => {
    el.addEventListener('click', () => {
      const refId = el.dataset.refId;
      const ref = state.entries.find(e => e.id === refId);
      if (ref) {
        // Switch category if needed
        if (state.activeCategory !== 'all' && state.activeCategory !== ref.category) {
          activateCategory(ref.category);
        }
        selectEntry(refId);
        DOM.entryList().querySelector(`[data-id="${refId}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    });
  });

  // edit / delete buttons
  detail.querySelector('[data-edit]')?.addEventListener('click', () => openEditModal(entry.id));
  detail.querySelector('[data-delete]')?.addEventListener('click', () => confirmDelete(entry.id, entry.name));
}

// ── Category nav ─────────────────────────────────────────────────────────────
function activateCategory(cat) {
  state.activeCategory = cat;
  DOM.catNav().querySelectorAll('.cat-btn').forEach(btn => {
    const active = btn.dataset.cat === cat;
    btn.className = [
      'cat-btn px-3 py-2 text-sm rounded-t-md min-h-[40px] transition-colors',
      active ? 'bg-gray-700 text-white font-semibold border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200',
    ].join(' ');
  });
  applyFilter();
}

// ── Modal: edit ───────────────────────────────────────────────────────────────
function openEditModal(id) {
  const entry = id ? state.entries.find(e => e.id === id) : null;
  const isNew = !entry;
  const ex = entry?.extra ?? {};

  const catOptions = Object.entries(CATEGORY_LABELS)
    .map(([k, v]) => `<option value="${k}" ${(!isNew && entry.category === k) ? 'selected' : ''}>${v}</option>`)
    .join('');

  DOM.modalBody().innerHTML = `
    <h3 class="text-lg font-bold mb-4">${isNew ? '➕ Nouvelle entrée' : '✏️ Modifier'}</h3>
    <form id="edit-form" class="space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Catégorie</label>
        <select name="category" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100" ${!isNew ? 'disabled' : 'required'}>
          ${catOptions}
        </select>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Nom *</label>
        <input name="name" type="text" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:border-blue-500 outline-none" value="${esc(entry?.name ?? '')}">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Description</label>
        <textarea name="description" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:border-blue-500 outline-none resize-y">${esc(entry?.description ?? '')}</textarea>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Champs spécifiques (JSON)</label>
        <textarea name="extra" rows="4" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:border-blue-500 outline-none resize-y font-mono text-xs">${esc(JSON.stringify(ex, null, 2))}</textarea>
        <p class="text-xs text-gray-500 mt-1">Optionnel. Contient les champs spécifiques à la catégorie (domain, cost, effects…).</p>
      </div>
      <div id="form-error" class="hidden text-red-400 text-sm"></div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="modal-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Annuler</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">Enregistrer</button>
      </div>
    </form>
  `;

  DOM.modalOverlay().classList.remove('hidden');

  DOM.modalBody().querySelector('#modal-cancel').addEventListener('click', closeModal);

  DOM.modalBody().querySelector('#edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name')?.trim();
    const category = fd.get('category') || entry?.category;
    const description = fd.get('description')?.trim() || null;
    let extra = null;
    const rawExtra = fd.get('extra')?.trim();
    if (rawExtra) {
      try { extra = JSON.parse(rawExtra); } catch {
        DOM.modalBody().querySelector('#form-error').textContent = 'JSON invalide dans "Champs spécifiques"';
        DOM.modalBody().querySelector('#form-error').classList.remove('hidden');
        return;
      }
    }

    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/rules' : `/api/rules/${entry.id}`;
    const body = isNew ? { category, name, description, extra } : { name, description, extra };

    const res = await fetchWithTable(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      DOM.modalBody().querySelector('#form-error').textContent = err.message || 'Erreur serveur';
      DOM.modalBody().querySelector('#form-error').classList.remove('hidden');
      return;
    }
    closeModal();
    await loadEntries();
  });
}

function closeModal() {
  DOM.modalOverlay().classList.add('hidden');
  DOM.modalBody().innerHTML = '';
}

async function confirmDelete(id, name) {
  if (!confirm(`Supprimer "${name}" ? Cette action est irréversible.`)) return;
  const res = await fetchWithTable(`/api/rules/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('Erreur lors de la suppression.');
    return;
  }
  state.selectedId = null;
  DOM.detail().innerHTML = '';
  DOM.placeholder()?.classList.remove('hidden');
  await loadEntries();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  state.user = await initHeader();

  // Can edit if MJ or admin
  state.canEdit = !!(state.user?.is_admin || state.user?.profile_role === 'mj');
  if (state.canEdit) DOM.btnAdd().classList.remove('hidden');

  DOM.btnAdd().addEventListener('click', () => openEditModal(null));
  DOM.modalClose().addEventListener('click', closeModal);
  DOM.modalOverlay().addEventListener('click', e => { if (e.target === DOM.modalOverlay()) closeModal(); });
  DOM.retryBtn()?.addEventListener('click', loadEntries);

  // Category tabs
  DOM.catNav().querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => activateCategory(btn.dataset.cat));
  });
  activateCategory('all');

  // Search
  DOM.searchInput().addEventListener('input', e => {
    state.searchQuery = e.target.value;
    DOM.searchClear().classList.toggle('hidden', !e.target.value);
    applyFilter();
  });
  DOM.searchClear().addEventListener('click', () => {
    DOM.searchInput().value = '';
    state.searchQuery = '';
    DOM.searchClear().classList.add('hidden');
    applyFilter();
  });

  // Table change button in header
  document.getElementById('header-change-table')?.addEventListener('click', async e => {
    e.preventDefault();
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
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
    renderTableSelector('tswitch-body', async () => {
      overlay.remove();
      await loadTableContext();
      await loadEntries();
    });
  });

  await loadEntries();
}

document.addEventListener('DOMContentLoaded', init);
