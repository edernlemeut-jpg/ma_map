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

    if (!tables || tables.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
          <p class="text-gray-400 mb-2">Vous n'appartenez à aucune table de jeu.</p>
          <p class="text-gray-500 text-sm">Créez une table ou rejoignez-en une avec un code d'invitation.</p>
        </div>
      `;
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
  } catch {
    container.innerHTML = '<p class="text-red-400">Erreur de connexion au serveur.</p>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
