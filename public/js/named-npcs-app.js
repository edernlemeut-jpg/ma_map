/**
 * named-npcs-app.js — Gestion des PNJ Nommés (MJ)
 *
 * Fonctionnalités :
 *  - Liste des PNJ nommés (filtrée par faction / role_type / recherche)
 *  - Formulaire création / édition avec section entités liées (entity-links.js)
 *  - Toggle visibilité
 *  - Suppression
 *
 * Montage : appelé depuis campagne.html via import
 */
import { fetchWithTable, getActiveTableId } from '/js/shared/table-selector.js';
import { renderEntityLinksSection } from '/js/shared/entity-links.js';

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Échappe le HTML pour prévenir les injections XSS */
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

let _container = null;
let _npcs = [];
let _editingId = null;
let _searchTimeout = null;

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Initialise l'interface PNJ Nommés dans `container`.
 * @param {HTMLElement} container
 */
export async function initNamedNpcsApp(container) {
  _container = container;
  renderSkeleton();
  await loadAndRender();
}

// ── Chargement ────────────────────────────────────────────────────────────────

async function loadAndRender(filters = {}) {
  const params = new URLSearchParams();
  if (filters.faction)   params.set('faction', filters.faction);
  if (filters.role_type) params.set('role_type', filters.role_type);
  if (filters.q)         params.set('q', filters.q);

  try {
    const res = await fetchWithTable(`/api/named-npcs?${params}`);
    const json = await res.json();
    _npcs = json.data ?? [];
  } catch {
    _npcs = [];
  }
  renderList();
}

// ── Rendu liste ───────────────────────────────────────────────────────────────

function renderSkeleton() {
  _container.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 class="font-semibold text-lg">👤 PNJ Nommés</h3>
        <button id="npc-btn-new"
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors min-h-[40px]">
          + Nouveau PNJ
        </button>
      </div>

      <!-- Barre de filtres -->
      <div class="flex flex-wrap gap-2">
        <input id="npc-search" type="text" placeholder="Rechercher par nom…"
          class="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm"
          autocomplete="off">
        <select id="npc-filter-faction"
          class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm">
          <option value="">Toutes factions</option>
          <option value="EG">EG</option>
          <option value="Sol">Sol</option>
          <option value="OCG">OCG</option>
          <option value="LPL">LPL</option>
          <option value="Neutre">Neutre</option>
        </select>
        <select id="npc-filter-role"
          class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm">
          <option value="">Tous rôles</option>
          <option value="premier_role">Premier rôle</option>
          <option value="second_role">Second rôle</option>
        </select>
      </div>

      <!-- Liste -->
      <div id="npc-list" class="space-y-2"></div>

      <!-- Panneau formulaire -->
      <div id="npc-form-panel" class="hidden"></div>
    </div>`;

  _container.querySelector('#npc-btn-new').addEventListener('click', () => openForm(null));

  const search = _container.querySelector('#npc-search');
  search.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => applyFilters(), 300);
  });
  _container.querySelector('#npc-filter-faction').addEventListener('change', () => applyFilters());
  _container.querySelector('#npc-filter-role').addEventListener('change', () => applyFilters());
}

function applyFilters() {
  const q = _container.querySelector('#npc-search')?.value.trim();
  const faction = _container.querySelector('#npc-filter-faction')?.value;
  const role_type = _container.querySelector('#npc-filter-role')?.value;
  loadAndRender({ q: q || undefined, faction: faction || undefined, role_type: role_type || undefined });
}

function renderList() {
  const listEl = _container.querySelector('#npc-list');
  if (!listEl) return;

  if (_npcs.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm italic py-2">Aucun PNJ nommé. Cliquez "+ Nouveau PNJ" pour commencer.</p>';
    return;
  }

  listEl.innerHTML = _npcs.map(npc => `
    <div class="flex items-center justify-between gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700"
         data-npc-id="${esc(npc.id)}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm">${esc(npc.nom)}</span>
          <span class="text-xs px-1.5 py-0.5 rounded ${npc.role_type === 'premier_role' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-gray-700 text-gray-400'}">
            ${npc.role_type === 'premier_role' ? 'Premier rôle' : 'Second rôle'}
          </span>
          ${npc.faction ? `<span class="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">${esc(npc.faction)}</span>` : ''}
          <span class="text-xs px-1.5 py-0.5 rounded cursor-pointer select-none
                ${npc.visible ? 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-900' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}"
                data-npc-toggle="${esc(npc.id)}" title="${npc.visible ? 'Visible joueurs — cliquer pour cacher' : 'Caché — cliquer pour révéler'}">
            ${npc.visible ? '👁 Visible' : '🙈 Caché'}
          </span>
        </div>
        ${npc.archetype ? `<p class="text-xs text-gray-400 mt-0.5">${esc(npc.archetype)}</p>` : ''}
      </div>
      <div class="flex gap-2 shrink-0">
        <button data-npc-edit="${esc(npc.id)}"
          class="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors min-h-[32px]">
          Éditer
        </button>
        <button data-npc-delete="${esc(npc.id)}"
          class="text-xs px-3 py-1.5 bg-red-900/60 hover:bg-red-900 text-red-300 rounded transition-colors min-h-[32px]">
          ✕
        </button>
      </div>
    </div>`).join('');

  // Wiring boutons
  listEl.querySelectorAll('[data-npc-edit]').forEach(btn => {
    btn.addEventListener('click', () => openForm(Number(btn.dataset.npcEdit)));
  });
  listEl.querySelectorAll('[data-npc-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteNpc(Number(btn.dataset.npcDelete)));
  });
  listEl.querySelectorAll('[data-npc-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleVisible(Number(btn.dataset.npcToggle), !btn.textContent.includes('Visible')));
  });
}

// ── Toggle visibilité ─────────────────────────────────────────────────────────

async function toggleVisible(id, makeVisible) {
  try {
    const res = await fetchWithTable(`/api/named-npcs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: makeVisible ? 1 : 0 }),
    });
    if (!res.ok) return;
    const idx = _npcs.findIndex(n => n.id === id);
    if (idx !== -1) _npcs[idx].visible = makeVisible;
    renderList();
  } catch { /* ignore */ }
}

// ── Suppression ──────────────────────────────────────────────────────────────

async function deleteNpc(id) {
  const npc = _npcs.find(n => n.id === id);
  if (!npc) return;
  if (!confirm(`Supprimer "${npc.nom}" ? Cette action est irréversible.`)) return;
  try {
    const res = await fetchWithTable(`/api/named-npcs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      _npcs = _npcs.filter(n => n.id !== id);
      renderList();
      // Fermer le formulaire si on éditait ce PNJ
      if (_editingId === id) closeForm();
    }
  } catch { /* ignore */ }
}

// ── Formulaire création / édition ─────────────────────────────────────────────

async function openForm(id) {
  _editingId = id;
  const panel = _container.querySelector('#npc-form-panel');
  if (!panel) return;

  let npc = null;
  if (id) {
    try {
      const res = await fetchWithTable(`/api/named-npcs/${id}`);
      const json = await res.json();
      npc = json.data ?? null;
    } catch { /* ignore */ }
  }

  panel.classList.remove('hidden');
  panel.innerHTML = renderFormHtml(npc);

  // Wiring form
  panel.querySelector('#npc-form-cancel')?.addEventListener('click', closeForm);
  panel.querySelector('#npc-form-save')?.addEventListener('click', () => saveForm(id, panel));

  // Entity-links (seulement pour PNJ existants)
  if (id) {
    const elContainer = panel.querySelector('#npc-entity-links');
    if (elContainer) {
      await renderEntityLinksSection(elContainer, 'named_npc', id, true);
    }
  }

  // Scroll vers le formulaire
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFormHtml(npc) {
  const v = (field, fallback = '') => esc(npc?.[field] ?? fallback);
  return `
    <div class="mt-4 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-semibold">${npc ? `Éditer : ${esc(npc.nom)}` : 'Nouveau PNJ Nommé'}</h4>
        <button id="npc-form-cancel" class="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Nom *</label>
          <input id="nf-nom" type="text" value="${v('nom')}" required
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Type de rôle *</label>
          <select id="nf-role_type" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
            <option value="premier_role" ${npc?.role_type === 'premier_role' ? 'selected' : ''}>Premier rôle</option>
            <option value="second_role"  ${npc?.role_type === 'second_role'  ? 'selected' : ''}>Second rôle</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Faction</label>
          <input id="nf-faction" type="text" value="${v('faction')}" placeholder="EG, Sol, OCG…"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Archétype</label>
          <input id="nf-archetype" type="text" value="${v('archetype')}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div class="flex items-center gap-3 pt-5">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input id="nf-is_mutant" type="checkbox" class="w-4 h-4" ${npc?.is_mutant ? 'checked' : ''}>
            Mutant
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input id="nf-visible" type="checkbox" class="w-4 h-4" ${npc?.visible ? 'checked' : ''}>
            Visible joueurs
          </label>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Stats (JSON)</label>
          <textarea id="nf-stats" rows="2" placeholder='{"car":3,"sf":2,"int":2,"per":2}'
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm font-mono resize-none">${v('stats') ? esc(JSON.stringify(npc.stats)) : ''}</textarea>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">PP</label>
          <input id="nf-pp" type="number" min="0" value="${v('pp', 3)}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Motivation</label>
          <input id="nf-motivation" type="text" value="${v('motivation')}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Déclencheur Overdrive</label>
          <input id="nf-overdrive_trigger" type="text" value="${v('overdrive_trigger')}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">Notes (MJ)</label>
          <textarea id="nf-notes" rows="3"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm resize-none">${v('notes')}</textarea>
        </div>
      </div>

      <p id="nf-error" class="text-red-400 text-sm hidden"></p>

      <div class="flex gap-2">
        <button id="npc-form-save"
          class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors min-h-[40px]">
          ${npc ? 'Enregistrer' : 'Créer'}
        </button>
        <button id="npc-form-cancel"
          class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors min-h-[40px]">
          Annuler
        </button>
      </div>

      ${npc ? `
        <div class="border-t border-gray-700 pt-4">
          <h5 class="text-sm font-medium text-gray-300 mb-2">Entités liées</h5>
          <div id="npc-entity-links"></div>
        </div>` : '<p class="text-xs text-gray-500 italic">Sauvegardez le PNJ pour gérer les entités liées.</p>'}
    </div>`;
}

async function saveForm(id, panel) {
  const get = (sel) => panel.querySelector(sel);
  const errEl = get('#nf-error');
  errEl.classList.add('hidden');

  const nom = get('#nf-nom')?.value.trim();
  if (!nom) { errEl.textContent = 'Le nom est requis.'; errEl.classList.remove('hidden'); return; }

  let stats_json = null;
  const statsRaw = get('#nf-stats')?.value.trim();
  if (statsRaw) {
    try { JSON.parse(statsRaw); stats_json = statsRaw; }
    catch { errEl.textContent = 'Stats JSON invalide.'; errEl.classList.remove('hidden'); return; }
  }

  const body = {
    nom,
    role_type:        get('#nf-role_type')?.value,
    faction:          get('#nf-faction')?.value.trim() || null,
    archetype:        get('#nf-archetype')?.value.trim() || null,
    is_mutant:        get('#nf-is_mutant')?.checked ? 1 : 0,
    visible:          get('#nf-visible')?.checked ? 1 : 0,
    motivation:       get('#nf-motivation')?.value.trim() || null,
    overdrive_trigger: get('#nf-overdrive_trigger')?.value.trim() || null,
    notes:            get('#nf-notes')?.value.trim() || null,
    pp:               Number(get('#nf-pp')?.value ?? 3),
    stats_json,
  };

  try {
    const url = id ? `/api/named-npcs/${id}` : '/api/named-npcs';
    const method = id ? 'PATCH' : 'POST';
    const res = await fetchWithTable(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.message ?? 'Erreur lors de la sauvegarde.';
      errEl.classList.remove('hidden');
      return;
    }

    // Mise à jour état local
    const saved = json.data;
    if (id) {
      const idx = _npcs.findIndex(n => n.id === id);
      if (idx !== -1) _npcs[idx] = saved; else _npcs.push(saved);
    } else {
      _npcs.unshift(saved);
      // Rouvrir en mode édition pour accéder aux entity-links
      closeForm();
      renderList();
      openForm(saved.id);
      return;
    }

    renderList();
    closeForm();
  } catch {
    errEl.textContent = 'Erreur réseau.';
    errEl.classList.remove('hidden');
  }
}

function closeForm() {
  _editingId = null;
  const panel = _container.querySelector('#npc-form-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
}
