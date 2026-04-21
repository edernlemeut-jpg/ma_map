/**
 * Header module — displays active table name + role + auth info.
 * Extends auth-ui.js by adding table context to the shared header.
 *
 * Usage: import { initHeader } from '/js/shared/header.js';
 *        await initHeader();
 */

import { initAuthUI } from '/js/shared/auth-ui.js';
import { getActiveTableId, fetchWithTable, clearActiveTable } from '/js/shared/table-selector.js';

/**
 * Initialize the shared header: auth UI + active table context.
 * Returns the current user or null if not authenticated.
 */
export async function initHeader() {
  const user = await initAuthUI();
  if (!user) return null;

  await loadTableContext();
  return user;
}

/**
 * Loads the active table info from the server and updates the header display.
 */
async function loadTableContext() {
  const tableId = getActiveTableId();
  const tableInfo = document.getElementById('header-table-info');
  const tableName = document.getElementById('header-table-name');
  const tableRole = document.getElementById('header-table-role');
  const changeBtn = document.getElementById('header-change-table');

  if (!tableId) {
    if (tableInfo) tableInfo.classList.add('hidden');
    return;
  }

  try {
    const res = await fetchWithTable('/api/game_tables/active');
    if (!res.ok) {
      // Table no longer valid — clear selection
      clearActiveTable();
      if (tableInfo) tableInfo.classList.add('hidden');
      return;
    }

    const json = await res.json();
    const table = json.data;

    if (!table) {
      clearActiveTable();
      if (tableInfo) tableInfo.classList.add('hidden');
      return;
    }

    if (tableInfo) tableInfo.classList.remove('hidden');
    if (tableName) tableName.textContent = table.name;
    if (tableRole) {
      tableRole.textContent = table.is_mj ? '🎲 MJ' : '🎮 Joueur';
    }
    if (changeBtn) {
      changeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearActiveTable();
        window.location.reload();
      });
    }
  } catch {
    if (tableInfo) tableInfo.classList.add('hidden');
  }
}
