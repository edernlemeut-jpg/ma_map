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
    <div style="border:1px solid var(--border,#3a3e50);border-top:3px solid var(--gold,#c8943a);border-radius:.75rem;background:linear-gradient(160deg,var(--bg3,#2d3140),var(--bg2,#21242d));padding:2.5rem;max-width:42rem;margin:0 auto;">
      <div style="text-align:center;margin-bottom:2rem;">
        <img src="/images/logo.png" alt="Metal Adventures" style="height:64px;margin:0 auto 1.25rem;filter:drop-shadow(0 0 12px rgba(200,148,58,.45));">
        <h2 style="font-family:'Russo One',sans-serif;font-size:1.4rem;color:var(--gold,#c8943a);letter-spacing:.04em;margin-bottom:.5rem;">Bienvenue, Capitaine !</h2>
        <p style="color:var(--text-muted,#7a7e92);font-size:.9rem;max-width:28rem;margin:0 auto;">
          Vous êtes l'administrateur de cette instance Metal Adventures.
          Suivez ces étapes pour lancer votre première campagne.
        </p>
      </div>

      <div class="space-y-4">
        <!-- Step 1: Create first game table -->
        <div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem;background:rgba(255,255,255,.03);border-radius:.5rem;border:1px solid var(--border,#3a3e50);">
          <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:rgba(200,148,58,.15);border:1px solid var(--gold-dim,#8a6225);display:flex;align-items:center;justify-content:center;color:var(--gold,#c8943a);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="flex-1">
            <h3 style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.05rem;color:var(--text,#dce1ec);">Étape 1 — Créer votre première table de jeu</h3>
            <p style="color:var(--text-muted,#7a7e92);font-size:.875rem;margin:.4rem 0 0;">
              Une table de jeu regroupe votre équipage. Créez-en une et invitez vos joueurs.
            </p>
            <button id="create-table-toggle"
                    style="margin-top:.75rem;padding:.45rem 1rem;background:var(--gold,#c8943a);color:#161820;border:none;border-radius:.375rem;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.875rem;cursor:pointer;letter-spacing:.04em;text-transform:uppercase;transition:background .15s;">
              Créer une table
            </button>
            <form id="create-table-form" class="hidden mt-4 space-y-3">
              <label class="block">
                <span style="display:block;font-size:.8rem;color:var(--text-muted,#7a7e92);margin-bottom:.4rem;">Nom de la table</span>
                <input id="create-table-name"
                       type="text"
                       maxlength="80"
                       placeholder="Ex. Équipage du Raptor"
                       class="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none">
              </label>
              <div class="flex items-center gap-3">
                <button id="create-table-submit"
                        type="submit"
                        style="padding:.4rem 1rem;background:var(--gold,#c8943a);color:#161820;border:none;border-radius:.375rem;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.875rem;cursor:pointer;transition:background .15s;">
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
        <div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem;background:rgba(255,255,255,.03);border-radius:.5rem;border:1px solid var(--border,#3a3e50);">
          <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:rgba(91,170,208,.12);border:1px solid rgba(91,170,208,.35);display:flex;align-items:center;justify-content:center;color:var(--primary,#5baad0);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="11" ry="4.5" transform="rotate(-20 12 12)"/></svg>
          </div>
          <div class="flex-1">
            <h3 style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.05rem;color:var(--text,#dce1ec);">Étape 2 — Importer des données univers</h3>
            <p style="color:var(--text-muted,#7a7e92);font-size:.875rem;margin:.4rem 0 0;">
              Importez les factions, systèmes et vaisseaux pour enrichir votre campagne.
            </p>
            <a href="/admin/import.html"
               style="margin-top:.75rem;display:inline-block;padding:.45rem 1rem;background:var(--bg3,#2d3140);border:1px solid var(--border,#3a3e50);color:var(--primary,#5baad0);border-radius:.375rem;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.875rem;text-decoration:none;letter-spacing:.04em;text-transform:uppercase;transition:border-color .15s;">
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
