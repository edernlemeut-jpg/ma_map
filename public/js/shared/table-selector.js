/**
 * Table Selector module — manages active table selection, persistence, and API fetch wrapper.
 *
 * Usage:
 *   import { getActiveTableId, setActiveTable, clearActiveTable, fetchWithTable } from '/js/shared/table-selector.js';
 */

const STORAGE_KEY = 'active_table_id';
const ROLE_KEY = 'active_table_role';

export function getActiveTableId() {
  return localStorage.getItem(STORAGE_KEY);
}

/** Returns 'mj', 'joueur', or null if no table is active. */
export function getActiveTableRole() {
  return localStorage.getItem(ROLE_KEY);
}

/** Returns true if the current user is MJ for the active table. */
export function isMJ() {
  return getActiveTableRole() === 'mj';
}

export function setActiveTable(tableId, role) {
  localStorage.setItem(STORAGE_KEY, String(tableId));
  if (role) localStorage.setItem(ROLE_KEY, role);
}

export function clearActiveTable() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ROLE_KEY);
}

/**
 * Fetch wrapper that automatically adds X-Table-Id header from localStorage.
 */
export function fetchWithTable(url, options = {}) {
  const tableId = getActiveTableId();
  const headers = { ...(options.headers || {}) };
  if (tableId) {
    headers['X-Table-Id'] = tableId;
  }
  return fetch(url, { ...options, headers });
}

/**
 * Loads the user's tables and renders a selector UI into the given container.
 * @param {string} containerId - DOM element ID to render into
 * @param {function} onSelect - Callback when a table is selected: onSelect(tableId)
 */
export async function renderTableSelector(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch('/api/game_tables');
    if (!res.ok) {
      container.innerHTML = '<p class="text-red-400">Erreur lors du chargement des tables.</p>';
      return;
    }

    const json = await res.json();
    const tables = json.data;
    const profileRole = json.profile_role || null;

    if (!tables || tables.length === 0) {
      const canCreate = profileRole !== 'joueur';
      const canJoin   = profileRole !== 'mj';
      container.innerHTML = `
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md mx-auto">
          <p class="text-lg font-semibold mb-1">Bienvenue ! 🚀</p>
          <p class="text-gray-400 text-sm mb-6">Créez une table de jeu ou rejoignez-en une avec un code d'invitation.</p>

          <div class="space-y-4">
            ${canCreate ? `<!-- Create table -->
            <div>
              <button id="ts-create-toggle"
                      class="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                + Créer une table
              </button>
              <form id="ts-create-form" class="hidden mt-3 space-y-3">
                <input id="ts-create-name" type="text" maxlength="80"
                       placeholder="Nom de la table (ex. Équipage du Raptor)"
                       class="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none text-sm">
                <div class="flex gap-3">
                  <button id="ts-create-submit" type="submit"
                          class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                    Créer et rejoindre
                  </button>
                  <button id="ts-create-cancel" type="button"
                          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors">
                    Annuler
                  </button>
                </div>
                <p id="ts-create-msg" class="hidden text-sm"></p>
              </form>
            </div>` : `<p class="text-gray-400 text-sm text-center py-2">Votre compte est de type Joueur. Pour être MJ, créez un second compte.</p>`}

            ${canJoin ? `<div class="${canCreate ? 'border-t border-gray-700 pt-4' : ''}">
              <button id="ts-join-toggle"
                      class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors">
                Rejoindre avec un code d'invitation
              </button>
              <form id="ts-join-form" class="hidden mt-3 space-y-3">
                <input id="ts-join-code" type="text" maxlength="40"
                       placeholder="Code d'invitation"
                       class="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none text-sm">
                <div class="flex gap-3">
                  <button id="ts-join-submit" type="submit"
                          class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Rejoindre
                  </button>
                  <button id="ts-join-cancel" type="button"
                          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors">
                    Annuler
                  </button>
                </div>
                <p id="ts-join-msg" class="hidden text-sm"></p>
              </form>
            </div>` : ''}
          </div>
        </div>
      `;

      // Create table handlers
      const createToggle = container.querySelector('#ts-create-toggle');
      const createForm   = container.querySelector('#ts-create-form');
      const createCancel = container.querySelector('#ts-create-cancel');
      const createMsg    = container.querySelector('#ts-create-msg');
      createToggle.addEventListener('click', () => {
        createForm.classList.toggle('hidden');
        container.querySelector('#ts-join-form').classList.add('hidden');
        container.querySelector('#ts-create-name').focus();
      });
      createCancel.addEventListener('click', () => createForm.classList.add('hidden'));
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = container.querySelector('#ts-create-name').value.trim();
        if (!name) return;
        const submit = container.querySelector('#ts-create-submit');
        submit.disabled = true;
        submit.textContent = 'Création…';
        try {
          const res = await fetch('/api/game_tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
          });
          const json = await res.json();
          if (!res.ok) {
            createMsg.textContent = json?.error?.message || 'Erreur lors de la création.';
            createMsg.className = 'text-sm text-red-400';
            createMsg.classList.remove('hidden');
            return;
          }
          const table = json.data;
          setActiveTable(table.id, 'mj');
          if (onSelect) onSelect(table.id);
          else location.reload();
        } catch {
          createMsg.textContent = 'Erreur réseau.';
          createMsg.className = 'text-sm text-red-400';
          createMsg.classList.remove('hidden');
        } finally {
          submit.disabled = false;
          submit.textContent = 'Créer et rejoindre';
        }
      });

      // Join table handlers
      const joinToggle = container.querySelector('#ts-join-toggle');
      const joinForm   = container.querySelector('#ts-join-form');
      const joinCancel = container.querySelector('#ts-join-cancel');
      const joinMsg    = container.querySelector('#ts-join-msg');
      joinToggle.addEventListener('click', () => {
        joinForm.classList.toggle('hidden');
        createForm.classList.add('hidden');
        container.querySelector('#ts-join-code').focus();
      });
      joinCancel.addEventListener('click', () => joinForm.classList.add('hidden'));
      joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = container.querySelector('#ts-join-code').value.trim();
        if (!code) return;
        const submit = container.querySelector('#ts-join-submit');
        submit.disabled = true;
        submit.textContent = 'Connexion…';
        try {
          const res = await fetch('/api/game_tables/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ invite_code: code })
          });
          const json = await res.json();
          if (!res.ok) {
            joinMsg.textContent = json?.error?.message || 'Code invalide ou table introuvable.';
            joinMsg.className = 'text-sm text-red-400';
            joinMsg.classList.remove('hidden');
            return;
          }
          const table = json.data;
          setActiveTable(table.id, table.role || 'joueur');
          if (onSelect) onSelect(table.id);
          else location.reload();
        } catch {
          joinMsg.textContent = 'Erreur réseau.';
          joinMsg.className = 'text-sm text-red-400';
          joinMsg.classList.remove('hidden');
        } finally {
          submit.disabled = false;
          submit.textContent = 'Rejoindre';
        }
      });

      return;
    }

    container.innerHTML = `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-4">Sélectionnez votre table de jeu</h3>
        <div class="space-y-2" id="table-list">
          ${tables.map(t => `
            <button data-table-id="${t.id}" data-table-role="${t.role || 'joueur'}"
                    class="table-select-btn w-full text-left px-4 py-3 rounded border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-colors flex items-center justify-between">
              <span>
                <span class="font-medium">${escapeHtml(t.name)}</span>
                <span class="text-gray-400 text-sm ml-2">${t.role === 'mj' ? '🎲 MJ' : '🎮 Joueur'}</span>
              </span>
              <span class="text-gray-500 text-xs">→</span>
            </button>
          `).join('')}
        </div>
        ${profileRole !== 'joueur' ? `<div class="border-t border-gray-700 mt-4 pt-4">
          <button id="ts-create-toggle"
                  class="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
            + Créer une nouvelle table
          </button>
          <form id="ts-create-form" class="hidden mt-3 space-y-3">
            <input id="ts-create-name" type="text" maxlength="80"
                   placeholder="Nom de la table (ex. Équipage du Raptor)"
                   class="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none text-sm">
            <div class="flex gap-3">
              <button id="ts-create-submit" type="submit"
                      class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Créer et rejoindre
              </button>
              <button id="ts-create-cancel" type="button"
                      class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors">
                Annuler
              </button>
            </div>
            <p id="ts-create-msg" class="hidden text-sm"></p>
          </form>
        </div>` : ''}
      </div>
    `;

    // Attach click handlers
    container.querySelectorAll('.table-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tableId = btn.dataset.tableId;
        const role = btn.dataset.tableRole;
        setActiveTable(tableId, role);
        if (onSelect) onSelect(tableId);
      });
    });

    // Create new table handlers (when tables already exist)
    const createToggle = container.querySelector('#ts-create-toggle');
    const createForm   = container.querySelector('#ts-create-form');
    const createCancel = container.querySelector('#ts-create-cancel');
    const createMsg    = container.querySelector('#ts-create-msg');
    if (createToggle) {
      createToggle.addEventListener('click', () => {
        createForm.classList.toggle('hidden');
        if (!createForm.classList.contains('hidden')) container.querySelector('#ts-create-name').focus();
      });
      createCancel.addEventListener('click', () => createForm.classList.add('hidden'));
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = container.querySelector('#ts-create-name').value.trim();
        if (!name) return;
        const submit = container.querySelector('#ts-create-submit');
        submit.disabled = true; submit.textContent = 'Création…';
        try {
          const r = await fetch('/api/game_tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
          });
          const j = await r.json();
          if (!r.ok) {
            createMsg.textContent = j?.error?.message || 'Erreur lors de la création.';
            createMsg.className = 'text-sm text-red-400';
            createMsg.classList.remove('hidden');
            return;
          }
          setActiveTable(j.data.id, 'mj');
          if (onSelect) onSelect(j.data.id);
          else location.reload();
        } catch {
          createMsg.textContent = 'Erreur réseau.';
          createMsg.className = 'text-sm text-red-400';
          createMsg.classList.remove('hidden');
        } finally {
          submit.disabled = false; submit.textContent = 'Créer et rejoindre';
        }
      });
    }
  } catch {
    container.innerHTML = '<p class="text-red-400">Erreur de connexion au serveur.</p>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
