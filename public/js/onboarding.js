/**
 * Onboarding module — shows a welcome guide for first-time admin when no game tables exist.
 */
import { setActiveTable } from '/js/shared/table-selector.js';

export async function loadOnboarding() {
  const onboardingContainer = document.getElementById('onboarding-container');
  const dashboardContainer = document.getElementById('dashboard-container');

  try {
    const res = await fetch('/api/game_tables/count');
    if (!res.ok) {
      // If API fails, show dashboard by default
      if (dashboardContainer) dashboardContainer.classList.remove('hidden');
      return;
    }

    const json = await res.json();
    const count = json.data.count;

    if (count === 0) {
      // Show onboarding
      if (onboardingContainer) {
        onboardingContainer.innerHTML = renderOnboarding();
        onboardingContainer.classList.remove('hidden');
        attachOnboardingHandlers(onboardingContainer);
      }
    } else {
      // Show normal dashboard
      if (dashboardContainer) dashboardContainer.classList.remove('hidden');
    }
  } catch {
    // On error, show dashboard
    if (dashboardContainer) dashboardContainer.classList.remove('hidden');
  }
}

function renderOnboarding() {
  return `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-2xl mx-auto">
      <h2 class="text-2xl font-bold mb-2">Bienvenue, Capitaine ! 🚀</h2>
      <p class="text-gray-400 mb-6">
        Vous êtes le premier administrateur de cette instance Metal Adventures.
        Suivez ces étapes pour démarrer votre aventure galactique.
      </p>

      <div class="space-y-4">
        <!-- Step 1: Create first game table -->
        <div class="flex items-start gap-4 p-4 bg-gray-700/50 rounded border border-gray-600">
          <span class="text-2xl">🎲</span>
          <div class="flex-1">
            <h3 class="font-semibold text-lg">Étape 1 — Créer votre première table de jeu</h3>
            <p class="text-gray-400 text-sm mt-1">
              Une table de jeu regroupe votre équipage. Créez-en une et invitez vos joueurs.
            </p>
            <button id="create-table-toggle"
                    class="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">
              Créer une table
            </button>
            <form id="create-table-form" class="hidden mt-4 space-y-3">
              <label class="block">
                <span class="block text-sm font-medium text-gray-200 mb-2">Nom de la table</span>
                <input id="create-table-name"
                       type="text"
                       maxlength="80"
                       placeholder="Ex. Équipage du Raptor"
                       class="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none">
              </label>
              <div class="flex items-center gap-3">
                <button id="create-table-submit"
                        type="submit"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">
                  Créer et ouvrir
                </button>
                <button id="create-table-cancel"
                        type="button"
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors">
                  Annuler
                </button>
              </div>
              <p id="create-table-message" class="hidden text-sm"></p>
            </form>
          </div>
        </div>

        <!-- Step 2: Import universe data -->
        <div class="flex items-start gap-4 p-4 bg-gray-700/50 rounded border border-gray-600">
          <span class="text-2xl">🌌</span>
          <div class="flex-1">
            <h3 class="font-semibold text-lg">Étape 2 — Importer des données univers</h3>
            <p class="text-gray-400 text-sm mt-1">
              Importez les factions, systèmes et vaisseaux pour enrichir votre campagne.
            </p>
            <a href="/admin/import.html"
               class="mt-3 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium min-h-[44px] leading-[44px] transition-colors">
              Importer des données →
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachOnboardingHandlers(container) {
  const toggleBtn = container.querySelector('#create-table-toggle');
  const form = container.querySelector('#create-table-form');
  const input = container.querySelector('#create-table-name');
  const cancelBtn = container.querySelector('#create-table-cancel');
  const submitBtn = container.querySelector('#create-table-submit');
  const messageEl = container.querySelector('#create-table-message');

  if (!toggleBtn || !form || !input || !cancelBtn || !submitBtn || !messageEl) {
    return;
  }

  toggleBtn.addEventListener('click', () => {
    form.classList.remove('hidden');
    toggleBtn.classList.add('hidden');
    messageEl.classList.add('hidden');
    input.focus();
  });

  cancelBtn.addEventListener('click', () => {
    form.reset();
    form.classList.add('hidden');
    toggleBtn.classList.remove('hidden');
    messageEl.classList.add('hidden');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();

    if (!name) {
      showFormMessage(messageEl, 'Le nom de la table est requis.', 'error');
      input.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    showFormMessage(messageEl, 'Création en cours...', 'info');

    try {
      const res = await fetch('/api/game_tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const json = await res.json();

      if (!res.ok) {
        showFormMessage(messageEl, json.error?.message || 'Impossible de créer la table.', 'error');
        return;
      }

      setActiveTable(json.data.id);
      showFormMessage(messageEl, 'Table créée. Redirection...', 'success');
      window.location.reload();
    } catch {
      showFormMessage(messageEl, 'Erreur réseau lors de la création.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });
}

function showFormMessage(element, message, type) {
  element.textContent = message;
  element.classList.remove('hidden', 'text-red-300', 'text-green-300', 'text-gray-300');

  if (type === 'error') {
    element.classList.add('text-red-300');
    return;
  }

  if (type === 'success') {
    element.classList.add('text-green-300');
    return;
  }

  element.classList.add('text-gray-300');
}
