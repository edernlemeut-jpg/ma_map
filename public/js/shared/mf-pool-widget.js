/**
 * mf-pool-widget.js — Widget Metal Faktor Pool
 *
 * Module autonome paramétrable : initMFPoolWidget(containerId, tableId)
 *
 * - Affiche pj_pool / mj_pool avec barre visuelle
 * - Barre de tension : couleur rouge croissante selon mj_pool
 * - Boutons transfert ±1/±5
 * - Optimistic UI (revert en cas d'erreur API)
 * - Reset avec confirmation
 *
 * Epic 11 — Story 11.3 + 11.4
 */

const MF_TOTAL = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function tensionClass(mjPool) {
  if (mjPool >= 30) return 'bg-red-600';
  if (mjPool >= 20) return 'bg-orange-500';
  if (mjPool >= 10) return 'bg-yellow-500';
  return 'bg-green-600';
}

function tensionText(mjPool) {
  if (mjPool >= 30) return 'DANGER';
  if (mjPool >= 20) return 'Haute';
  if (mjPool >= 10) return 'Modérée';
  return 'Low';
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise le widget MF Pool.
 * @param {string} containerId — ID de l'élément DOM cible
 * @param {number} tableId     — ID de la table de jeu active
 */
export async function initMFPoolWidget(containerId, tableId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.classList.remove('hidden');

  let state = { pj_pool: MF_TOTAL, mj_pool: 0 };
  let multiplier = 1;

  // ── Render skeleton ──
  container.innerHTML = `
    <div id="mfpw-root" class="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-semibold text-gray-200">⚡ Metal Faktor Pool</h4>
        <button id="mfpw-mult-btn"
          class="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:border-yellow-500 hover:text-yellow-400 transition-colors"
          title="Activer le mode ×5">×5</button>
      </div>
      <!-- Chiffres -->
      <div class="flex justify-between text-sm font-mono">
        <span>PJ : <span id="mfpw-pj" class="text-green-400 font-bold text-base">${MF_TOTAL}</span></span>
        <span class="text-gray-500">Tension : <span id="mfpw-tension-text" class="text-gray-300">Low</span></span>
        <span>MJ : <span id="mfpw-mj" class="text-red-400 font-bold text-base">0</span></span>
      </div>
      <!-- Barre visuelle -->
      <div class="w-full h-3 bg-gray-700 rounded-full overflow-hidden flex">
        <div id="mfpw-bar-pj" class="bg-green-600 transition-all duration-300" style="width:100%"></div>
        <div id="mfpw-bar-mj" class="${tensionClass(0)} transition-all duration-300" style="width:0%"></div>
      </div>
      <!-- Boutons transfert -->
      <div class="flex gap-2">
        <button id="mfpw-btn-mj-plus"
          class="flex-1 bg-red-900/60 hover:bg-red-800 border border-red-800 text-red-300 text-sm rounded px-2 py-1.5 transition-colors"
          title="Prend des dés aux PJ">− PJ / + MJ</button>
        <button id="mfpw-btn-pj-plus"
          class="flex-1 bg-green-900/60 hover:bg-green-800 border border-green-800 text-green-300 text-sm rounded px-2 py-1.5 transition-colors"
          title="Redonne des dés aux PJ">+ PJ / − MJ</button>
      </div>
      <!-- Reset -->
      <button id="mfpw-btn-reset"
        class="w-full text-xs text-gray-500 hover:text-yellow-400 transition-colors py-0.5"
        title="Remet PJ:50 / MJ:0">↺ Reset aventure</button>
      <!-- Message erreur -->
      <div id="mfpw-error" class="text-red-400 text-xs hidden"></div>
    </div>`;

  // ── Bind events ──
  document.getElementById('mfpw-mult-btn').addEventListener('click', () => {
    multiplier = multiplier === 1 ? 5 : 1;
    const btn = document.getElementById('mfpw-mult-btn');
    btn.classList.toggle('text-yellow-400', multiplier === 5);
    btn.classList.toggle('border-yellow-500', multiplier === 5);
    btn.textContent = multiplier === 5 ? '×5 ON' : '×5';
  });

  document.getElementById('mfpw-btn-mj-plus').addEventListener('click', () =>
    doTransfer(multiplier, 'pj_to_mj', tableId));
  document.getElementById('mfpw-btn-pj-plus').addEventListener('click', () =>
    doTransfer(multiplier, 'mj_to_pj', tableId));
  document.getElementById('mfpw-btn-reset').addEventListener('click', () => {
    if (confirm('Remettre le pool MF à PJ:50 / MJ:0 ?')) doReset(tableId);
  });

  // ── Load initial state ──
  await loadPool(tableId);

  // Rafraîchit automatiquement quand un autre composant (combat resolver…) effectue un transfert
  document.addEventListener('mf-pool-transferred', (e) => {
    if (e.detail) { state = e.detail; renderState(); }
    else { loadPool(tableId); }
  });

  // ── Helpers ──
  async function loadPool(tid) {
    try {
      const res = await fetch('/api/mf-pool', {
        credentials: 'include',
        headers: { 'X-Table-Id': String(tid) },
      });
      if (!res.ok) return;
      const json = await res.json();
      state = json.data;
      renderState();
    } catch { /* ignore */ }
  }

  function renderState() {
    const { pj_pool, mj_pool } = state;
    document.getElementById('mfpw-pj').textContent      = pj_pool;
    document.getElementById('mfpw-mj').textContent      = mj_pool;
    document.getElementById('mfpw-tension-text').textContent = tensionText(mj_pool);

    const pjPct = Math.round((pj_pool / MF_TOTAL) * 100);
    const mjPct = 100 - pjPct;
    document.getElementById('mfpw-bar-pj').style.width = `${pjPct}%`;
    const barMj = document.getElementById('mfpw-bar-mj');
    barMj.style.width = `${mjPct}%`;
    // Update tension color
    barMj.className = `${tensionClass(mj_pool)} transition-all duration-300`;
  }

  function showError(msg) {
    const el = document.getElementById('mfpw-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  async function doTransfer(delta, direction, tid) {
    const prev = { ...state };
    // Optimistic update
    const newPj = direction === 'pj_to_mj' ? state.pj_pool - delta : state.pj_pool + delta;
    const newMj = direction === 'pj_to_mj' ? state.mj_pool + delta : state.mj_pool - delta;
    if (newPj < 0 || newMj < 0) { showError('Fonds MF insuffisants.'); return; }
    state = { pj_pool: newPj, mj_pool: newMj };
    renderState();

    try {
      const res = await fetch('/api/mf-pool/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Table-Id': String(tid) },
        body: JSON.stringify({ delta, direction }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Revert
        state = prev;
        renderState();
        showError(json.error?.message ?? 'Erreur transfert MF.');
        return;
      }
      state = json.data;
      renderState();
    } catch {
      state = prev;
      renderState();
      showError('Erreur réseau.');
    }
  }

  async function doReset(tid) {
    try {
      const res = await fetch('/api/mf-pool/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Table-Id': String(tid) },
      });
      const json = await res.json();
      if (!res.ok) { showError(json.error?.message ?? 'Erreur reset.'); return; }
      state = json.data;
      renderState();
    } catch {
      showError('Erreur réseau.');
    }
  }
}
