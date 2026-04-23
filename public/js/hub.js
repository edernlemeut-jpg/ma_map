/**
 * hub.js — Page d'accueil : sélection de table + dashboard
 */
import { initAuthUI, getCurrentUser } from './shared/auth-ui.js';
import { loadTableContext } from './shared/header.js';
import { renderTableSelector } from './shared/table-selector.js';
import { loadOnboarding } from './onboarding.js';

async function init() {
  await initAuthUI();
  const user = getCurrentUser();

  // Show admin link if admin
  if (user?.is_admin) {
    const adminLink = document.getElementById('home-admin-link');
    if (adminLink) adminLink.classList.remove('hidden');
  }

  // Load table context — shows table name in header if a table is active
  const table = await loadTableContext();

  if (!table) {
    // No active table — show the table selector so the user can pick or join one
    const selectorContainer = document.getElementById('table-selector-container');
    if (selectorContainer) {
      selectorContainer.classList.remove('hidden');
      await renderTableSelector('table-selector-container', () => {
        window.location.reload();
      });
    }
    return;
  }

  // Table is active — show campaign link for MJ
  if (table.is_mj) {
    const campaignLink = document.getElementById('home-campaign-link');
    if (campaignLink) campaignLink.classList.remove('hidden');
  }

  // Show onboarding (first-time admin) or dashboard
  await loadOnboarding();
}

document.addEventListener('DOMContentLoaded', init);
