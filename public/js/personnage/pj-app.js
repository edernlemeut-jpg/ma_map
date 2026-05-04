/**
 * pj-app.js — Vue de session PJ Metal Adventures
 *
 * Gère le suivi en temps réel d'une fiche PJ pendant une partie :
 *  - Santé (cases cochées / noircies)
 *  - PP (Points de Panache)
 *  - Gloire
 *  - Énergie X (mutants)
 *  - Motivation + Déclencheur Overdrive mis en valeur
 *
 * Ce module s'attache au div#session-view de personnage.html.
 * Il est inactif si l'utilisateur n'est pas connecté ou n'a pas de table sélectionnée.
 */

import { initHeader }           from '/js/shared/header.js';
import { isMJ, getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';

// ── Helpers sécurité ─────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Constantes ───────────────────────────────────────────────────────────────
const API_CHARS = '/api/characters';

// ── État ─────────────────────────────────────────────────────────────────────
let STATE = {
  user:    null,
  role:    null,   // 'mj' | 'joueur'
  tableId: null,
  char:    null,   // PJ courant (joueur) ou null (MJ → liste)
  chars:   [],     // pour le MJ : liste complète des PJs
};

// ── Point d'entrée ───────────────────────────────────────────────────────────
async function init() {
  // N'intervient que si le div#session-view existe
  const root = document.getElementById('session-view');
  if (!root) return;

  const user = await initHeader();
  STATE.user    = user;
  STATE.tableId = getActiveTableId();
  STATE.role    = (isMJ() || user?.is_admin) ? 'mj' : 'joueur';

  // Bouton "Session" dans la top-bar (si présent)
  const btnSession = document.getElementById('btn-session');
  if (btnSession) {
    btnSession.classList.remove('hidden');
    btnSession.addEventListener('click', showSessionView);
  }

  // Joueur : affichage automatique au chargement
  if (STATE.role === 'joueur' && STATE.tableId && user?.id) {
    await showSessionView();
  }
}

// ── Affichage session ─────────────────────────────────────────────────────────
async function showSessionView() {
  const root = document.getElementById('session-view');
  if (!root) return;

  // Masquer les autres vues
  ['loading', 'char-list-view', 'wizard-view', 'sheet-view'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  root.classList.remove('hidden');
  root.innerHTML = '<p class="text-gray-400 py-8 text-center animate-pulse">Chargement de la session…</p>';

  if (!STATE.tableId) {
    root.innerHTML = '<p class="text-gray-500 text-sm py-6 text-center">Sélectionnez une table pour voir la session.</p>';
    return;
  }

  try {
    if (STATE.role === 'joueur') {
      await loadJoueurView(root);
    } else {
      await loadMJView(root);
    }
  } catch (err) {
    root.innerHTML = `<p class="text-red-400 py-4 text-center">Erreur : ${esc(err.message)}</p>`;
  }
}

// ── Vue joueur ───────────────────────────────────────────────────────────────
async function loadJoueurView(root) {
  const r = await fetchWithTable(`${API_CHARS}?type=pj`, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { data: chars } = await r.json();

  // Le joueur ne voit que ses propres PJs — on prend le premier (ou on propose un choix)
  const mine = chars.filter(c => c.type === 'pj');
  if (!mine.length) {
    root.innerHTML = '<p class="text-gray-500 text-sm py-6 text-center">Aucun PJ trouvé pour votre compte sur cette table.</p>';
    return;
  }

  // Si plusieurs PJs, obtenir le détail du premier (ou du sélectionné)
  const selected = mine[0];
  const det = await fetchWithTable(`${API_CHARS}/${selected.id}`, { credentials: 'include' });
  if (!det.ok) throw new Error(`HTTP ${det.status}`);
  const { data: char } = await det.json();
  STATE.char = char;

  // Si plusieurs PJs, afficher un sélecteur
  if (mine.length > 1) {
    renderPJSelector(root, mine, char);
  } else {
    renderSessionSheet(root, char, 'joueur');
  }
}

function renderPJSelector(root, chars, active) {
  const selector = document.createElement('div');
  selector.className = 'flex gap-2 flex-wrap mb-4';
  chars.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `px-3 py-1.5 rounded text-sm border ${c.id === active.id
      ? 'border-yellow-500 bg-yellow-900/20 text-yellow-300'
      : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400'}`;
    btn.textContent = c.name;
    btn.addEventListener('click', async () => {
      const r = await fetchWithTable(`${API_CHARS}/${c.id}`, { credentials: 'include' });
      if (!r.ok) return;
      const { data: char } = await r.json();
      STATE.char = char;
      root.innerHTML = '';
      root.appendChild(selector);
      renderSessionSheet(root, char, 'joueur');
    });
    selector.appendChild(btn);
  });
  root.innerHTML = '';
  root.appendChild(selector);
  const sheet = document.createElement('div');
  root.appendChild(sheet);
  renderSessionSheet(sheet, active, 'joueur');
}

// ── Vue MJ : liste des PJs de la table ───────────────────────────────────────
async function loadMJView(root) {
  const r = await fetchWithTable(`${API_CHARS}?type=pj`, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { data: chars } = await r.json();
  STATE.chars = chars;

  if (!chars.length) {
    root.innerHTML = '<p class="text-gray-500 text-sm py-6 text-center">Aucun PJ sur cette table.</p>';
    return;
  }

  root.innerHTML = `
    <h3 class="text-sm font-semibold text-gray-300 mb-4">🎮 Suivi de session — ${esc(String(chars.length))} PJ${chars.length > 1 ? 's' : ''}</h3>
    <div id="mj-pj-list" class="space-y-6"></div>`;

  const list = root.querySelector('#mj-pj-list');
  for (const brief of chars) {
    const det = await fetchWithTable(`${API_CHARS}/${brief.id}`, { credentials: 'include' });
    if (!det.ok) continue;
    const { data: char } = await det.json();

    const wrapper = document.createElement('div');
    wrapper.className = 'bg-gray-800 border border-gray-700 rounded-xl p-4';
    wrapper.id = `pj-card-${esc(char.id)}`;
    renderSessionSheet(wrapper, char, 'mj');
    list.appendChild(wrapper);
  }
}

// ── Fiche de session ──────────────────────────────────────────────────────────
function renderSessionSheet(container, char, role) {
  const sante           = char.sante;
  const niveaux         = sante?.niveaux ?? [];
  const pp              = char.pp          ?? 3;
  const gloire          = char.gloire      ?? 0;
  const isMutant        = char.is_mutant   === 1 || char.is_mutant === true;
  const energieXCur     = char.energie_x_cur ?? 0;
  const energieXMax     = char.energie_x_max ?? 0;
  const motivation      = char.motivation    ?? null;
  const odTrigger       = char.overdrive_trigger ?? null;
  const nom             = char.name;

  // ── OD Banner (OD visible sans scroll sur mobile = placé EN FIRST à l'intérieur du container)
  const odBanner = odTrigger ? `
    <div class="flex items-start gap-3 bg-amber-950/70 border border-amber-600/60 rounded-xl px-4 py-3 mb-4">
      <span class="text-2xl shrink-0 mt-0.5">⚡</span>
      <div>
        <p class="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-0.5">Déclencheur Overdrive</p>
        <p class="text-amber-200 font-medium">${esc(odTrigger)}</p>
        ${motivation ? `<p class="text-amber-300/70 text-xs mt-1">Motivation : ${esc(motivation)}</p>` : ''}
      </div>
    </div>` : (motivation ? `
    <div class="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-2 mb-4">
      <p class="text-xs text-gray-500 mb-0.5">Motivation</p>
      <p class="text-gray-300 text-sm">${esc(motivation)}</p>
    </div>` : '');

  // ── En-tête du personnage
  const header = `
    <div class="flex items-center gap-3 mb-4">
      <div>
        <h3 class="font-bold text-lg">${esc(nom)}</h3>
        ${char.archetype ? `<p class="text-xs text-gray-400">${esc(char.archetype)}</p>` : ''}
      </div>
    </div>`;

  // ── Santé
  const santeHtml = niveaux.length
    ? `<div class="mb-4">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Santé</p>
        <div class="space-y-2" data-health-container="${esc(char.id)}">
          ${niveaux.map((niv, ni) => `
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs text-gray-500 w-14 shrink-0">Niv. ${ni + 1}</span>
              <div class="flex gap-1 flex-wrap">
                ${(niv.cases ?? []).map((c, ci) => {
                  const etat = c.etat ?? 'vide';
                  let cls = 'health-case w-6 h-6 rounded border-2 cursor-pointer transition-colors shrink-0';
                  let style = '';
                  if (etat === 'cochée')  { cls += ' bg-red-600 border-red-400'; }
                  else if (etat === 'noircie') { cls += ' bg-gray-900 border-gray-500'; style = 'background:repeating-linear-gradient(45deg,#111,#111 3px,#374151 3px,#374151 6px)'; }
                  else { cls += ' bg-gray-700 border-gray-600 hover:border-gray-400'; }
                  return `<div class="${cls}" style="${style}"
                    data-char-id="${esc(char.id)}" data-niv="${ni}" data-case="${ci}" data-etat="${esc(etat)}"
                    title="Niv.${ni + 1} Case ${ci + 1} — ${esc(etat)}"></div>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  // ── Ressources (PP, Gloire, Énergie X)
  const ppDots    = Array.from({ length: Math.max(pp, 3) }, (_, i) => `
    <div class="w-5 h-5 rounded-full border-2 transition-colors shrink-0 cursor-pointer ${i < pp
      ? 'bg-blue-500 border-blue-400 hover:bg-blue-600'
      : 'bg-gray-700 border-gray-600 hover:border-gray-400'}"
      data-pp-dot="${i}" data-char-id="${esc(char.id)}" data-current="${pp}" title="PP ${i + 1}/${Math.max(pp, 3)}">
    </div>`).join('');

  const exDots = isMutant
    ? Array.from({ length: energieXMax }, (_, i) => `
      <div class="w-5 h-5 rounded border-2 transition-colors shrink-0 cursor-pointer ${i < energieXCur
        ? 'bg-cyan-500 border-cyan-400 hover:bg-cyan-600'
        : 'bg-gray-700 border-gray-600 hover:border-gray-400'}"
        data-ex-dot="${i}" data-char-id="${esc(char.id)}" data-cur-ex="${energieXCur}" data-max-ex="${energieXMax}"
        title="Énergie X ${i + 1}/${energieXMax}">
      </div>`).join('')
    : null;

  const ressources = `
    <div class="mb-4">
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ressources</p>
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <span class="text-xs text-blue-400 w-16 shrink-0">PP <span class="font-mono text-blue-300">${pp}</span></span>
          <div class="flex gap-1 flex-wrap">${ppDots}</div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-yellow-400 w-16 shrink-0">Gloire</span>
          <span class="font-bold text-yellow-300">${esc(String(gloire))}</span>
        </div>
        ${isMutant && exDots !== null ? `
        <div class="flex items-center gap-3">
          <span class="text-xs text-cyan-400 w-16 shrink-0">Énergie X <span class="font-mono text-cyan-300">${energieXCur}/${energieXMax}</span></span>
          <div class="flex gap-1 flex-wrap">${exDots}</div>
        </div>` : ''}
      </div>
    </div>`;

  // Assembler
  container.innerHTML = header + odBanner + santeHtml + ressources;

  // ── Wiring événements ─────────────────────────────────────────────────────

  // Cases de santé
  container.querySelectorAll('.health-case').forEach(el => {
    el.addEventListener('click', async () => {
      const { charId, niv, case: ci, etat } = el.dataset;
      // Cycle d'état selon le rôle
      const cycle = role === 'mj'
        ? { vide: 'cochée', cochée: 'noircie', noircie: 'vide' }
        : { vide: 'cochée', cochée: 'vide',    noircie: 'vide' };
      const nextEtat = cycle[etat] ?? 'vide';

      const resp = await fetchWithTable(`${API_CHARS}/${charId}/health`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niveau_index: Number(niv), case_index: Number(ci), etat: nextEtat }),
      });
      if (!resp.ok) { console.warn('health patch failed', resp.status); return; }
      const { data: updated } = await resp.json();
      // Re-render uniquement ce container
      renderSessionSheet(container, updated, role);
    });
  });

  // Dots PP
  container.querySelectorAll('[data-pp-dot]').forEach(el => {
    el.addEventListener('click', async () => {
      const dotIdx = Number(el.dataset.ppDot);
      const cur    = Number(el.dataset.current);
      const charId = el.dataset.charId;
      // Clic sur dot i → pp = i+1 (si déjà = i+1 → pp = i)
      const newPP = (dotIdx + 1 === cur) ? dotIdx : dotIdx + 1;
      const delta = newPP - cur;

      if (role !== 'mj' && delta > 0) return; // joueur ne peut qu'augmenter via MJ

      const endpoint = role === 'mj'
        ? `${API_CHARS}/${charId}`
        : `${API_CHARS}/${charId}/resources`;
      const body = role === 'mj'
        ? { pp: newPP }
        : { delta_pp: delta };

      const resp = await fetchWithTable(endpoint, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) { console.warn('pp patch failed', resp.status); return; }
      const { data: updated } = await resp.json();
      renderSessionSheet(container, updated, role);
    });
  });

  // Dots Énergie X
  container.querySelectorAll('[data-ex-dot]').forEach(el => {
    el.addEventListener('click', async () => {
      const dotIdx  = Number(el.dataset.exDot);
      const curEx   = Number(el.dataset.curEx);
      const maxEx   = Number(el.dataset.maxEx);
      const charId  = el.dataset.charId;
      const newVal  = (dotIdx + 1 === curEx) ? dotIdx : dotIdx + 1;
      const delta   = newVal - curEx;

      if (role !== 'mj' && delta > 0) return;

      const endpoint = role === 'mj'
        ? `${API_CHARS}/${charId}`
        : `${API_CHARS}/${charId}/resources`;
      const body = role === 'mj'
        ? { energie_x_cur: newVal }
        : { delta_energie_x: delta };

      const resp = await fetchWithTable(endpoint, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) { console.warn('ex patch failed', resp.status); return; }
      const { data: updated } = await resp.json();
      renderSessionSheet(container, updated, role);
    });
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
