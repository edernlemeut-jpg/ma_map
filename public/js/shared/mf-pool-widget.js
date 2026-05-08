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
    <div id="mfpw-root" style="background:linear-gradient(160deg,#2d3140 0%,#21242d 100%);border:1px solid #3a3e50;border-top:2px solid #c8943a;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h4 style="margin:0;font-size:0.78rem;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#c8943a;display:flex;align-items:center;gap:6px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Metal Faktor Pool
        </h4>
        <button id="mfpw-mult-btn"
          style="font-size:0.7rem;padding:2px 8px;border-radius:4px;border:1px solid #3a3e50;color:#7a7e92;background:transparent;cursor:pointer;transition:color .15s,border-color .15s;font-family:'Rajdhani',sans-serif;font-weight:600;"
          title="Activer le mode ×5">×5</button>
      </div>
      <!-- Chiffres -->
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;font-family:'Rajdhani',sans-serif;font-weight:600;">
        <span style="color:#dce1ec;">PJ : <span id="mfpw-pj" style="color:#e8b454;font-size:1rem;font-weight:700;">${MF_TOTAL}</span></span>
        <span style="color:#7a7e92;">Tension : <span id="mfpw-tension-text" style="color:#dce1ec;">Low</span></span>
        <span style="color:#dce1ec;">MJ : <span id="mfpw-mj" style="color:#c44040;font-size:1rem;font-weight:700;">0</span></span>
      </div>
      <!-- Barre visuelle -->
      <div style="width:100%;height:8px;background:#21242d;border-radius:4px;overflow:hidden;display:flex;border:1px solid #3a3e50;">
        <div id="mfpw-bar-pj" style="background:linear-gradient(90deg,#8a6225,#c8943a);transition:width .3s;width:100%"></div>
        <div id="mfpw-bar-mj" class="${tensionClass(0)}" style="transition:width .3s;width:0%"></div>
      </div>
      <!-- Boutons transfert -->
      <div style="display:flex;gap:8px;">
        <button id="mfpw-btn-mj-plus"
          style="flex:1;background:rgba(196,64,64,0.15);border:1px solid #6b2020;color:#e08080;font-size:0.78rem;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:0.04em;border-radius:4px;padding:6px 4px;cursor:pointer;transition:background .15s;"
          title="Prend des dés aux PJ">− PJ / + MJ</button>
        <button id="mfpw-btn-pj-plus"
          style="flex:1;background:rgba(138,98,37,0.2);border:1px solid #8a6225;color:#e8b454;font-size:0.78rem;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:0.04em;border-radius:4px;padding:6px 4px;cursor:pointer;transition:background .15s;"
          title="Redonne des dés aux PJ">+ PJ / − MJ</button>
      </div>
      <!-- Reset -->
      <button id="mfpw-btn-reset"
        style="width:100%;font-size:0.7rem;font-family:'Rajdhani',sans-serif;color:#7a7e92;background:transparent;border:none;cursor:pointer;padding:2px;transition:color .15s;"
        title="Remet PJ:50 / MJ:0">↺ Reset aventure</button>
      <!-- Message erreur -->
      <div id="mfpw-error" style="color:#e08080;font-size:0.75rem;display:none;"></div>
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

  // ── Écoute les transferts déclenchés par le combat resolver (autre composant) ──
  document.addEventListener('mf-pool-transferred', (e) => {
    if (e.detail) {
      state = e.detail;
      renderState();
    }
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
