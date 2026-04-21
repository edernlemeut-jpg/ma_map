import { initHeader } from '/js/shared/header.js';
import { getActiveTableId, clearActiveTable, fetchWithTable, renderTableSelector } from '/js/shared/table-selector.js';
import { loadOnboarding } from '/js/onboarding.js';

async function init() {
  const user = await initHeader();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Check if a table is selected
  const tableId = getActiveTableId();

  if (!tableId) {
    // No table selected — show selector or onboarding
    await showTableSelectorOrOnboarding();
    return;
  }

  // Validate the selected table is still valid
  try {
    const res = await fetchWithTable('/api/game_tables/active');
    if (!res.ok) {
      // Table no longer valid — clear and show selector
      clearActiveTable();
      await showTableSelectorOrOnboarding();
      return;
    }

    const json = await res.json();
    if (!json.data) {
      clearActiveTable();
      await showTableSelectorOrOnboarding();
      return;
    }

    // Table is valid — show table home hub
    showDashboard(json.data, user);
  } catch {
    // Network error — clear stale table and show selector (AC #3)
    clearActiveTable();
    await showTableSelectorOrOnboarding();
  }
}

async function showTableSelectorOrOnboarding() {
  // First check if there are any tables at all (for onboarding)
  try {
    const res = await fetch('/api/game_tables/count');
    if (res.ok) {
      const json = await res.json();
      if (json.data.count === 0) {
        await loadOnboarding();
        return;
      }
    }
  } catch {
    // Ignore — fall through to table selector
  }

  // Show table selector
  const selectorContainer = document.getElementById('table-selector-container');
  if (selectorContainer) {
    selectorContainer.classList.remove('hidden');
    await renderTableSelector('table-selector-container', () => {
      // On table selected — reload to apply context
      window.location.reload();
    });
  }
}

function showDashboard(table, user) {
  const dashboardContainer = document.getElementById('dashboard-container');
  if (!dashboardContainer) return;

  dashboardContainer.classList.remove('hidden');

  const title = document.getElementById('home-table-title');
  const subtitle = document.getElementById('home-table-subtitle');
  const roleBadge = document.getElementById('home-role-badge');
  const dashboardLink = document.getElementById('home-dashboard-link');
  const importLink = document.getElementById('home-import-link');
  const nextStep = document.getElementById('home-next-step');

  if (title) {
    title.textContent = table?.name || 'Table sélectionnée';
  }

  if (subtitle) {
    subtitle.textContent = table?.is_mj
      ? 'Votre table est prête. Utilisez les raccourcis ci-dessous pour piloter la campagne.'
      : 'Vous avez rejoint une table. Utilisez les raccourcis ci-dessous pour consulter la partie.';
  }

  if (roleBadge) {
    roleBadge.classList.remove('hidden');
    roleBadge.textContent = table?.is_mj ? '🎲 Meneur de jeu' : '🎮 Joueur';
  }

  if (dashboardLink && table?.is_mj) {
    dashboardLink.classList.remove('hidden');
  }

  if (importLink && user?.is_admin) {
    importLink.classList.remove('hidden');
  }

  if (nextStep) {
    if (user?.is_admin && table?.is_mj) {
      nextStep.textContent = 'Commencez par importer les données univers si ce n’est pas déjà fait, puis ouvrez le dashboard MJ ou l’itinéraire.';
    } else if (table?.is_mj) {
      nextStep.textContent = 'Ouvrez le dashboard MJ pour gérer la session, puis préparez vos vaisseaux et itinéraires.';
    } else {
      nextStep.textContent = 'Consultez le compendium et l’itinéraire de votre table pour suivre la campagne.';
    }
  }
}

init();
