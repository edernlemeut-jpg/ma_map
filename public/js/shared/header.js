/**
 * Header module — displays active table name + role + auth info.
 * Extends auth-ui.js by adding table context to the shared header.
 *
 * Usage: import { initHeader } from '/js/shared/header.js';
 *        await initHeader();
 *
 * Or just the table context part:
 *        import { loadTableContext } from '/js/shared/header.js';
 *        await loadTableContext();
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
 * Exported so pages can call it independently without the full initHeader().
 * Returns the table data or null.
 */
export async function loadTableContext() {
  const tableId = getActiveTableId();
  const tableInfo = document.getElementById('header-table-info');
  const tableName = document.getElementById('header-table-name');
  const tableRole = document.getElementById('header-table-role');
  const changeBtn = document.getElementById('header-change-table');

  if (!tableId) {
    if (tableInfo) tableInfo.classList.add('hidden');
    return null;
  }

  try {
    const res = await fetchWithTable('/api/game_tables/active');
    if (!res.ok) {
      // Table no longer valid — clear selection
      clearActiveTable();
      if (tableInfo) tableInfo.classList.add('hidden');
      return null;
    }

    const json = await res.json();
    const table = json.data;

    if (!table) {
      clearActiveTable();
      if (tableInfo) tableInfo.classList.add('hidden');
      return null;
    }

    if (tableInfo) tableInfo.classList.remove('hidden');

    if (tableName) {
      tableName.textContent = table.name;
      if (table.is_mj && table.invite_code) {
        tableName.style.cursor = 'pointer';
        tableName.title = 'Copier le lien d\'invitation';
        tableName.classList.add('hover:text-yellow-400', 'transition-colors');
        tableName.addEventListener('click', async () => {
          const link = `${location.origin}/rejoindre?code=${table.invite_code}`;
          try {
            await navigator.clipboard.writeText(link);
            const orig = tableName.textContent;
            tableName.textContent = '✓ Copié !';
            setTimeout(() => { tableName.textContent = orig; }, 2000);
          } catch {
            prompt('Lien d\'invitation :', link);
          }
        });
      }
    }

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

    return table;
  } catch {
    if (tableInfo) tableInfo.classList.add('hidden');
    return null;
  }
}
