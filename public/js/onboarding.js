/**
 * Onboarding module — shows a welcome guide for first-time admin when no game tables exist.
 */
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
            <button disabled
                    class="mt-3 px-4 py-2 bg-blue-600 opacity-50 cursor-not-allowed rounded text-sm font-medium"
                    title="Bientôt disponible">
              Créer une table — Bientôt disponible
            </button>
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
