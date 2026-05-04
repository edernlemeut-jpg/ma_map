/**
 * dice-roller.js — Module de lancer de dés générique — Metal Adventures
 *
 * Système de dés d6 :
 *   Normal  = succès si ≥ 4
 *   TD      = "Trop Dur"    — succès si = 6 uniquement
 *   TF      = "Trop Facile" — tout sauf 1 est succès
 *
 * Modificateurs (0 = aucun, 1 = partiel, 2 = complet) :
 *   E2F  — les succès sont relancés et doivent réussir à nouveau
 *   SC   — les échecs sont relancés et peuvent devenir succès
 *   PMF  — les succès sont relancés, chaque réussite = +1 succès bonus
 *   +1d  — dés bonus ajoutés au pool
 *   D+1  — succès supplémentaires requis
 *
 * ── Exports moteur (fonctions pures, sans DOM) ────────────────────────────────
 *   rollD6(n)
 *   isSuccess(val, diff)
 *   computeNetMods(e2f, sc, pmf)
 *   modsLabel(net)
 *   resolveRoll(options)   → objet résultat complet
 *
 * ── Export UI ─────────────────────────────────────────────────────────────────
 *   DiceRollerModal        → modale générique réutilisable
 *
 * Usage :
 *   import { DiceRollerModal } from '/js/shared/dice-roller.js';
 *   const roller = new DiceRollerModal();
 *   roller.open({
 *     title:       'Test de Pilotage',
 *     context:     'Pilotage (Vaisseau spatial)',
 *     pool:        3,
 *     diff:        'normal',
 *     sc:          1,
 *     mfEnabled:   true,
 *     onResult:    (result) => console.log(result),
 *   });
 */

import { fetchWithTable } from '/js/shared/table-selector.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MOTEUR — Fonctions pures (sans DOM, sans API)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lance N dés d6.
 * @param   {number}   n
 * @returns {number[]} tableau de N entiers [1..6]
 */
export function rollD6(n) {
  return Array.from({ length: Math.max(0, n) }, () => Math.floor(Math.random() * 6) + 1);
}

/**
 * Détermine si une valeur est un succès selon la difficulté.
 * @param   {number}              val
 * @param   {'normal'|'TD'|'TF'} diff
 * @returns {boolean}
 */
export function isSuccess(val, diff) {
  if (diff === 'TD') return val === 6;
  if (diff === 'TF') return val >= 2;
  return val >= 4; // Normal
}

/**
 * Calcule les modificateurs nets après annulation E2F ↔ SC/PMF.
 * E2F annule SC en premier, puis PMF.
 * @param   {number} e2fLevel  [0..2]
 * @param   {number} scLevel   [0..2]
 * @param   {number} pmfLevel  [0..2]
 * @returns {{ e2f: number, sc: number, pmf: number }}
 */
export function computeNetMods(e2fLevel, scLevel, pmfLevel) {
  let sc = scLevel, pmf = pmfLevel, remainE2F = e2fLevel;
  const scRed  = Math.min(sc,  remainE2F); sc  -= scRed;  remainE2F -= scRed;
  const pmfRed = Math.min(pmf, remainE2F); pmf -= pmfRed; remainE2F -= pmfRed;
  return {
    e2f: Math.min(2, remainE2F),
    sc:  Math.min(2, sc),
    pmf: Math.min(2, pmf),
  };
}

/**
 * Chaîne lisible des modificateurs nets (ex : "SC", "e2f", "E2F+pmf").
 * @param   {{ e2f: number, sc: number, pmf: number }} net
 * @returns {string}
 */
export function modsLabel(net) {
  const parts = [];
  if (net.e2f === 2) parts.push('E2F');
  else if (net.e2f === 1) parts.push('e2f');
  if (net.sc  === 2) parts.push('SC');
  else if (net.sc  === 1) parts.push('sc');
  if (net.pmf === 2) parts.push('PMF');
  else if (net.pmf === 1) parts.push('pmf');
  return parts.join('+');
}

/**
 * Résout un lancer de dés complet selon les règles Metal Adventures.
 *
 * @param {object}               options
 * @param {number}               options.pool            — dés de base
 * @param {number}               [options.plus1d=0]      — dés bonus (+1d)
 * @param {number}               [options.mfCount=0]     — dés Metal Faktor
 * @param {'normal'|'TD'|'TF'}  [options.diff='normal']
 * @param {number}               [options.e2f=0]
 * @param {number}               [options.sc=0]
 * @param {number}               [options.pmf=0]
 * @param {boolean}              [options.accidentRisk=false]
 *
 * @returns {{
 *   pool:           number,
 *   regularPool:    number,
 *   mfCount:        number,
 *   diff:           string,
 *   net:            { e2f: number, sc: number, pmf: number },
 *   initial:        number[],
 *   initialReg:     number[],
 *   initialMF:      number[],
 *   e2fResultats:   number[]|null,
 *   bonusResultats: number[]|null,
 *   bonusType:      string|null,
 *   succes:         number,
 *   mfAccidents:    number,
 * }}
 */
export function resolveRoll({
  pool,
  plus1d = 0,
  mfCount = 0,
  diff = 'normal',
  e2f = 0,
  sc = 0,
  pmf = 0,
  accidentRisk = false,
}) {
  const regularPool = Math.max(1, pool) + plus1d;
  const totalPool   = regularPool + mfCount;
  const net = computeNetMods(e2f, sc, pmf);

  // Étape 1 : jet initial
  const initialReg = rollD6(regularPool);
  const initialMF  = rollD6(mfCount);
  const initial    = [...initialReg, ...initialMF];
  let successesNow = initial.filter(v => isSuccess(v, diff)).length;
  let failuresNow  = totalPool - successesNow;

  // Étape 2 : E2F — relance des succès
  let e2fResultats = null;
  if (net.e2f > 0 && successesNow > 0) {
    const cnt       = net.e2f >= 2 ? successesNow : 1;
    const rolled    = rollD6(cnt);
    const confirmed = rolled.filter(v => isSuccess(v, diff)).length;
    e2fResultats    = rolled;
    successesNow    = (successesNow - cnt) + confirmed;
    failuresNow     = totalPool - successesNow;
  }

  // Étape 3 : SC — relance des échecs
  let bonusResultats = null;
  let bonusType      = null;
  if (net.sc > 0 && failuresNow > 0) {
    const cnt      = net.sc >= 2 ? failuresNow : 1;
    const rolled   = rollD6(cnt);
    const newSucc  = rolled.filter(v => isSuccess(v, diff)).length;
    bonusResultats = rolled;
    bonusType      = net.sc >= 2 ? 'SC' : 'sc';
    successesNow  += newSucc;

  // Étape 3 (alt) : PMF — relance des succès pour bonus
  } else if (net.pmf > 0 && successesNow > 0) {
    const cnt      = net.pmf >= 2 ? successesNow : 1;
    const rolled   = rollD6(cnt);
    const extras   = rolled.filter(v => isSuccess(v, diff)).length;
    bonusResultats = rolled;
    bonusType      = net.pmf >= 2 ? 'PMF' : 'pmf';
    successesNow  += extras;
  }

  // Accidents MF (seulement si risque déclaré)
  const mfAccidents = accidentRisk ? initialMF.filter(v => v === 1).length : 0;

  return {
    pool:           totalPool,
    regularPool,
    mfCount,
    diff,
    net,
    initial,
    initialReg,
    initialMF,
    e2fResultats,
    bonusResultats,
    bonusType,
    succes:         successesNow,
    mfAccidents,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI — Modale générique DiceRollerModal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Modale de lancer de dés générique réutilisable.
 *
 * Un seul singleton par page. Peut être ouvert depuis n'importe quel contexte
 * (compendium, fiche personnage, fiche vaisseau, combat spatial…) avec des
 * options pré-configurées.
 *
 * @example
 *   const roller = new DiceRollerModal();
 *   roller.open({
 *     title:     'Test de Navigation',
 *     pool:      4,
 *     sc:        1,      // SC partiel pré-coché
 *     mfEnabled: true,
 *     onResult:  (r) => console.log(r.succes, 'succès'),
 *   });
 */
export class DiceRollerModal {
  constructor() {
    this._diff         = 'normal';
    this._e2f          = 0;
    this._sc           = 0;
    this._pmf          = 0;
    this._mfActor      = 'pj';
    this._mfDirection  = 'pj_to_mj';
    this._mfPool       = null;
    this._mfEnabled    = true;
    this._accidentRisk = false;
    this._lockPool     = false;
    this._lockDiff     = false;
    this._onResult     = null;
    this._lastRoll     = null;
    this._el           = null;
    this._ensureModal();
  }

  // ── API publique ─────────────────────────────────────────────────────────────

  /**
   * Ouvre la modale avec la configuration donnée.
   *
   * @param {object}              [opts]
   * @param {string}              [opts.title='Lancer de dés']
   * @param {string}              [opts.context='']       — sous-titre (compétence…)
   * @param {number}              [opts.pool=3]
   * @param {'normal'|'TD'|'TF'} [opts.diff='normal']
   * @param {number}              [opts.e2f=0]
   * @param {number}              [opts.sc=0]
   * @param {number}              [opts.pmf=0]
   * @param {number}              [opts.plus1d=0]
   * @param {boolean}             [opts.mfEnabled=true]
   * @param {'pj'|'pnj'}         [opts.mfActor='pj']
   * @param {boolean}             [opts.accidentRisk=false]
   * @param {boolean}             [opts.lockPool=false]
   * @param {boolean}             [opts.lockDiff=false]
   * @param {function}            [opts.onResult]         — callback(result)
   */
  async open(opts = {}) {
    const {
      title        = 'Lancer de dés',
      context      = '',
      pool         = 3,
      diff         = 'normal',
      e2f          = 0,
      sc           = 0,
      pmf          = 0,
      plus1d       = 0,
      mfEnabled    = true,
      mfActor      = 'pj',
      accidentRisk = false,
      lockPool     = false,
      lockDiff     = false,
      onResult     = null,
    } = opts;

    this._diff         = diff;
    this._e2f          = e2f;
    this._sc           = sc;
    this._pmf          = pmf;
    this._mfActor      = mfActor;
    this._mfDirection  = mfActor === 'pnj' ? 'mj_to_pj' : 'pj_to_mj';
    this._mfEnabled    = mfEnabled;
    this._accidentRisk = accidentRisk;
    this._lockPool     = lockPool;
    this._lockDiff     = lockDiff;
    this._onResult     = onResult;
    this._lastRoll     = null;
    this._mfPool       = null;

    // Titre et contexte
    this._el.querySelector('#dr-title').textContent = title;
    const ctxEl = this._el.querySelector('#dr-context');
    if (context) {
      ctxEl.textContent = context;
      ctxEl.classList.remove('hidden');
    } else {
      ctxEl.classList.add('hidden');
    }

    // Champs
    this._el.querySelector('#dr-pool').value    = Math.max(1, pool);
    this._el.querySelector('#dr-plus1d').value  = Math.max(0, plus1d);
    this._el.querySelector('#dr-dplus1').value  = 0;
    this._el.querySelector('#dr-mf-count').value = 0;
    this._el.querySelector('#dr-mf-violent').checked = false;

    // Verrouillages
    const poolInput = this._el.querySelector('#dr-pool');
    poolInput.readOnly = lockPool;
    poolInput.classList.toggle('opacity-60', lockPool);
    poolInput.classList.toggle('cursor-not-allowed', lockPool);

    // Sections conditionnelles
    this._el.querySelector('#dr-mf-section').classList.toggle('hidden', !mfEnabled);
    this._el.querySelector('#dr-accident-info').classList.toggle('hidden', !accidentRisk);

    this._clearResults();
    this._updateDiffUI();
    this._updateModUI();
    this._updateMFActorUI();
    this._updateMFPreview();
    this._el.classList.remove('hidden');

    // Charger le pool MF si activé
    if (mfEnabled) {
      try {
        const r = await fetchWithTable('/api/mf-pool');
        if (r.ok) {
          this._mfPool = (await r.json()).data;
          this._updateMFCounterUI();
        }
      } catch { /* pool indisponible */ }
    }
  }

  close() {
    if (this._el) this._el.classList.add('hidden');
  }

  // ── Construction du DOM ───────────────────────────────────────────────────────

  _ensureModal() {
    let el = document.getElementById('dr-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dr-modal';
      document.body.appendChild(el);
    }
    el.className = 'fixed inset-0 bg-black/75 z-50 hidden flex items-start justify-center p-4 pt-8 overflow-y-auto';
    el.innerHTML = this._modalHTML();
    this._el = el;
    this._bindEvents();
  }

  _modRow(id, label, color) {
    return `
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold ${color} w-10 flex-shrink-0">${label}</span>
        <div class="flex gap-1 flex-1">
          <button class="dr-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="0">—</button>
          <button class="dr-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="1">${label.toLowerCase()}</button>
          <button class="dr-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="2">${label.toUpperCase()}</button>
        </div>
      </div>`;
  }

  _modalHTML() {
    return `
      <div class="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-600">

        <!-- En-tête -->
        <div class="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 id="dr-title" class="font-semibold text-base text-gray-100">Lancer de dés</h2>
            <p  id="dr-context" class="hidden text-xs text-indigo-300 mt-0.5 truncate"></p>
          </div>
          <button id="dr-close" class="text-gray-400 hover:text-white text-xl leading-none flex-shrink-0">×</button>
        </div>

        <!-- Corps -->
        <div class="p-5 space-y-4">

          <!-- Pool + Difficulté -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Pool (d6)</label>
              <input id="dr-pool" type="number" min="1" max="20" value="3"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            </div>
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Difficulté</label>
              <div class="flex gap-1 mt-1">
                <button class="dr-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                  data-diff="normal">Normal<br><span class="text-[10px] opacity-70">4+</span></button>
                <button class="dr-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                  data-diff="TD">TD<br><span class="text-[10px] opacity-70">6 seul</span></button>
                <button class="dr-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                  data-diff="TF">TF<br><span class="text-[10px] opacity-70">≠ 1</span></button>
              </div>
            </div>
          </div>

          <!-- Modificateurs -->
          <div>
            <label class="text-xs text-gray-400 uppercase tracking-wide block mb-2">Modificateurs</label>
            <div class="space-y-1.5">
              ${this._modRow('e2f', 'E2F', 'text-orange-400')}
              ${this._modRow('sc',  'SC',  'text-green-400')}
              ${this._modRow('pmf', 'PMF', 'text-blue-400')}
            </div>
          </div>

          <!-- +1d et D+1 -->
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Dés bonus (+1d)</label>
              <input id="dr-plus1d" type="number" min="0" max="10" value="0"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            </div>
            <div class="flex-1">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Succès requis (D+1)</label>
              <input id="dr-dplus1" type="number" min="0" max="10" value="0"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            </div>
          </div>

          <!-- Info risque d'accident -->
          <div id="dr-accident-info"
            class="hidden text-xs text-red-300 bg-red-950/50 border border-red-800/50 rounded px-3 py-2">
            🩸 Action à risque — chaque dé MF affichant 1 inflige 1S au vaisseau (ignore Blindage &amp; Protection).
          </div>

          <!-- Metal Faktor -->
          <div id="dr-mf-section"
            class="border border-yellow-800/40 bg-yellow-950/20 rounded-lg p-3 space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-yellow-400 uppercase tracking-wide">⚡ Metal Faktor</label>
              <div class="text-xs font-mono">
                PJ&nbsp;<span id="dr-mf-pj" class="text-green-400 font-bold">—</span>
                &nbsp;·&nbsp;
                MJ&nbsp;<span id="dr-mf-mj" class="text-red-400 font-bold">—</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <label class="text-xs text-gray-400 block mb-1">Dés MF à ajouter</label>
                <input id="dr-mf-count" type="number" min="0" max="50" value="0"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
              </div>
              <div class="flex items-center gap-2 self-end pb-2.5">
                <input type="checkbox" id="dr-mf-violent" class="w-4 h-4 accent-yellow-500">
                <label for="dr-mf-violent" class="text-xs text-gray-300 cursor-pointer select-none">Violent&nbsp;?</label>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">Qui agit ?</label>
              <div class="flex gap-1">
                <button class="dr-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                  data-actor="pj">Joueur (PJ)</button>
                <button class="dr-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                  data-actor="pnj">MJ / PNJ</button>
              </div>
            </div>
            <div id="dr-mf-direction-wrap" class="hidden">
              <label class="text-xs text-gray-400 block mb-1">Sens du transfert</label>
              <div class="flex gap-1">
                <button class="dr-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                  data-dir="pj_to_mj">PJ → MJ</button>
                <button class="dr-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                  data-dir="mj_to_pj">MJ → PJ</button>
              </div>
            </div>
            <div id="dr-mf-preview"
              class="hidden text-xs text-yellow-200 bg-yellow-900/30 rounded px-2 py-1.5"></div>
          </div>

          <!-- Avertissement conflit SC/PMF -->
          <div id="dr-conflict-warn"
            class="hidden text-xs text-yellow-300 bg-yellow-900/30 border border-yellow-700/50 rounded px-3 py-1.5">
            ⚠ SC et PMF ne se cumulent pas après calcul des annulations — choisissez l'un ou l'autre.
          </div>

          <!-- Bouton Lancer -->
          <button id="dr-lancer"
            class="w-full py-2.5 rounded font-medium text-sm bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            🎲 Lancer les dés
          </button>

          <!-- ── Résultats ─────────────────────────────────────────────────── -->
          <div id="dr-results" class="hidden space-y-3 border border-gray-700 rounded-lg p-3">

            <div>
              <div class="text-xs text-gray-400 mb-1.5">
                Jet initial · <span id="dr-diff-badge" class="font-medium text-indigo-300"></span>
              </div>
              <div id="dr-dice-initial" class="flex flex-wrap gap-1.5"></div>
              <div id="dr-base-summary" class="text-xs text-gray-400 mt-1.5"></div>
            </div>

            <div id="dr-step-e2f" class="hidden pt-2 border-t border-gray-700">
              <div class="text-xs text-orange-400 mb-1.5">🔄 E2F — relance des succès (doivent réussir à nouveau)</div>
              <div id="dr-dice-e2f"    class="flex flex-wrap gap-1.5"></div>
              <div id="dr-e2f-summary" class="text-xs text-gray-400 mt-1.5"></div>
            </div>

            <div id="dr-step-bonus" class="hidden pt-2 border-t border-gray-700">
              <div id="dr-bonus-label"   class="text-xs mb-1.5"></div>
              <div id="dr-dice-bonus"    class="flex flex-wrap gap-1.5"></div>
              <div id="dr-bonus-summary" class="text-xs text-gray-400 mt-1.5"></div>
            </div>

            <div id="dr-successes"
              class="pt-2 border-t border-gray-700 text-center text-lg font-bold"></div>

            <div id="dr-step-accident"
              class="hidden pt-2 border-t border-red-900/40 bg-red-950/30 rounded-b-lg px-2 py-2">
              <div class="text-xs text-red-400 font-semibold mb-0.5">🩸 Accident MF</div>
              <div id="dr-accident-detail" class="text-xs text-red-300"></div>
            </div>

          </div><!-- /résultats -->

        </div><!-- /corps -->

        <!-- Pied -->
        <div class="px-5 pb-5 pt-4 border-t border-gray-700 flex justify-end">
          <button id="dr-cancel"
            class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Fermer</button>
        </div>

      </div>`;
  }

  // ── Événements ────────────────────────────────────────────────────────────────

  _bindEvents() {
    const el = this._el;

    el.querySelector('#dr-close').addEventListener('click',  () => this.close());
    el.querySelector('#dr-cancel').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });

    // Difficulté
    el.querySelectorAll('.dr-diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._lockDiff) return;
        this._diff = btn.dataset.diff;
        this._clearResults();
        this._updateDiffUI();
      });
    });

    // Modificateurs
    el.querySelectorAll('.dr-mod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mod = btn.dataset.mod;
        const val = parseInt(btn.dataset.val);
        if      (mod === 'e2f') this._e2f = val;
        else if (mod === 'sc')  this._sc  = val;
        else if (mod === 'pmf') this._pmf = val;
        this._clearResults();
        this._updateModUI();
      });
    });

    // Pool / +1d / D+1
    ['#dr-pool', '#dr-plus1d', '#dr-dplus1'].forEach(id => {
      el.querySelector(id).addEventListener('input', () => this._clearResults());
    });

    // Metal Faktor — dés + violent
    el.querySelector('#dr-mf-count').addEventListener('input',    () => this._updateMFPreview());
    el.querySelector('#dr-mf-violent').addEventListener('change', () => this._updateMFPreview());

    // Qui agit ?
    el.querySelectorAll('.dr-mf-actor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mfActor = btn.dataset.actor;
        if (this._mfActor === 'pj') this._mfDirection = 'pj_to_mj';
        this._updateMFActorUI();
        this._updateMFCounterUI();
        this._updateMFPreview();
      });
    });

    // Sens du transfert
    el.querySelectorAll('.dr-mf-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mfDirection = btn.dataset.dir;
        this._updateMFDirUI();
        this._updateMFCounterUI();
        this._updateMFPreview();
      });
    });

    el.querySelector('#dr-lancer').addEventListener('click', () => this._lancerDes());
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────────

  _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _diceHTML(val, success, isMF = false) {
    if (isMF) {
      const bg = success
        ? 'bg-green-900 border-yellow-500 text-green-200'
        : 'bg-red-950  border-yellow-600 text-red-400';
      return `<span title="Dé MF" class="w-9 h-9 flex items-center justify-center rounded border-2 text-sm font-mono font-bold ${bg}">⚡${val}</span>`;
    }
    const color = success
      ? 'bg-green-800 border-green-500 text-green-200'
      : 'bg-red-900  border-red-700  text-red-300';
    return `<span class="w-9 h-9 flex items-center justify-center rounded border text-sm font-mono font-bold ${color}">${val}</span>`;
  }

  _renderDiceRow(id, values, mfOffset = values.length) {
    this._el.querySelector(id).innerHTML =
      values.map((v, i) => this._diceHTML(v, isSuccess(v, this._diff), i >= mfOffset)).join('');
  }

  _clearResults() {
    this._lastRoll = null;
    this._el.querySelector('#dr-results').classList.add('hidden');
  }

  _updateDiffUI() {
    this._el.querySelectorAll('.dr-diff-btn').forEach(btn => {
      const active = btn.dataset.diff === this._diff;
      btn.className = `dr-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
        this._lockDiff
          ? (active ? 'bg-indigo-800 text-indigo-200 opacity-80 cursor-not-allowed' : 'bg-gray-800 text-gray-600 cursor-not-allowed')
          : (active ? 'bg-indigo-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')
      }`;
    });
  }

  _updateModUI() {
    const net         = computeNetMods(this._e2f, this._sc, this._pmf);
    const hasConflict = net.sc > 0 && net.pmf > 0;

    const configs = [
      { mod: 'e2f', cur: this._e2f, on: 'bg-orange-700 text-white' },
      { mod: 'sc',  cur: this._sc,  on: 'bg-green-700  text-white' },
      { mod: 'pmf', cur: this._pmf, on: 'bg-blue-700   text-white' },
    ];

    this._el.querySelectorAll('.dr-mod-btn').forEach(btn => {
      const mod  = btn.dataset.mod;
      const val  = parseInt(btn.dataset.val);
      const conf = configs.find(c => c.mod === mod);
      if (!conf) return;
      const active = val === conf.cur;
      btn.className = `dr-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors ${
        active && val > 0 ? conf.on
        : active          ? 'bg-gray-600 text-white'
        :                   'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`;
    });

    this._el.querySelector('#dr-conflict-warn').classList.toggle('hidden', !hasConflict);
    this._el.querySelector('#dr-lancer').disabled = hasConflict;
  }

  _updateMFActorUI() {
    const isPNJ = this._mfActor === 'pnj';
    this._el.querySelectorAll('.dr-mf-actor-btn').forEach(btn => {
      const active = btn.dataset.actor === this._mfActor;
      btn.className = `dr-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`;
    });
    this._el.querySelector('#dr-mf-direction-wrap').classList.toggle('hidden', !isPNJ);
    if (!isPNJ) this._mfDirection = 'pj_to_mj';
    this._updateMFDirUI();
  }

  _updateMFDirUI() {
    this._el.querySelectorAll('.dr-mf-dir-btn').forEach(btn => {
      const active = btn.dataset.dir === this._mfDirection;
      btn.className = `dr-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`;
    });
  }

  _updateMFCounterUI() {
    if (!this._mfPool) return;
    const pjEl = this._el.querySelector('#dr-mf-pj');
    const mjEl = this._el.querySelector('#dr-mf-mj');
    if (pjEl) pjEl.textContent = this._mfPool.pj_pool;
    if (mjEl) mjEl.textContent = this._mfPool.mj_pool;
    const avail   = this._mfDirection === 'mj_to_pj' ? this._mfPool.mj_pool : this._mfPool.pj_pool;
    const countEl = this._el.querySelector('#dr-mf-count');
    countEl.max = avail;
    if ((parseInt(countEl.value) || 0) > avail) countEl.value = avail;
    this._updateMFPreview();
  }

  _updateMFPreview() {
    const previewEl = this._el.querySelector('#dr-mf-preview');
    const mfCount   = Math.max(0, parseInt(this._el.querySelector('#dr-mf-count').value) || 0);
    const violent   = this._el.querySelector('#dr-mf-violent').checked;
    const transfer  = Math.max(0, mfCount - (violent ? 1 : 0));

    if (mfCount > 0) {
      previewEl.classList.remove('hidden');
      const from = this._mfDirection === 'pj_to_mj' ? 'PJ' : 'MJ';
      const to   = this._mfDirection === 'pj_to_mj' ? 'MJ' : 'PJ';
      previewEl.textContent = transfer > 0
        ? `${mfCount} dé${mfCount > 1 ? 's' : ''} MF · transfert ${transfer} ${from} → ${to} à l'inscription`
        : `${mfCount} dé${mfCount > 1 ? 's' : ''} MF · aucun transfert (action violente)`;
    } else {
      previewEl.classList.add('hidden');
    }
  }

  // ── Logique de jet ─────────────────────────────────────────────────────────────

  async _lancerDes() {
    const poolBase = Math.max(1, Math.min(20, parseInt(this._el.querySelector('#dr-pool').value)    || 3));
    const plus1d   = Math.max(0, Math.min(10, parseInt(this._el.querySelector('#dr-plus1d').value)  || 0));
    const diffPlus = Math.max(0, Math.min(10, parseInt(this._el.querySelector('#dr-dplus1').value)  || 0));
    const mfCount  = this._mfEnabled
      ? Math.max(0, Math.min(50, parseInt(this._el.querySelector('#dr-mf-count').value) || 0))
      : 0;
    const violent  = this._mfEnabled && this._el.querySelector('#dr-mf-violent').checked;

    const result = resolveRoll({
      pool:         poolBase,
      plus1d,
      mfCount,
      diff:         this._diff,
      e2f:          this._e2f,
      sc:           this._sc,
      pmf:          this._pmf,
      accidentRisk: this._accidentRisk,
    });

    this._renderResults(result, diffPlus);

    this._lastRoll = {
      ...result,
      diffPlus,
      violent,
      mfDirection: this._mfDirection,
      mods:        modsLabel(result.net) || null,
    };

    // Transfert MF
    if (this._mfEnabled && mfCount > 0) {
      await this._doMFTransfer(mfCount, violent);
    }

    // Callback vers l'appelant
    if (typeof this._onResult === 'function') {
      this._onResult({ ...this._lastRoll });
    }
  }

  _renderResults(result, diffPlus = 0) {
    const {
      pool, regularPool, mfCount, diff, net,
      initial, e2fResultats, bonusResultats, bonusType,
      succes, mfAccidents,
    } = result;

    const diffLabels = { normal: 'Normal (4+)', TD: 'TD (6 seul)', TF: 'TF (≠ 1)' };
    this._el.querySelector('#dr-diff-badge').textContent = diffLabels[diff] ?? '';

    this._renderDiceRow('#dr-dice-initial', initial, regularPool);
    const initSucc = initial.filter(v => isSuccess(v, diff)).length;
    const initFail = pool - initSucc;
    const mfSuffix = mfCount > 0 ? ` + ${mfCount}⚡MF` : '';
    this._el.querySelector('#dr-base-summary').textContent =
      `${regularPool}d6${mfSuffix} → ${initSucc} succès · ${initFail} échec${initFail !== 1 ? 's' : ''}`;

    // E2F
    if (e2fResultats && net.e2f > 0) {
      const confirmed = e2fResultats.filter(v => isSuccess(v, diff)).length;
      const lost      = e2fResultats.length - confirmed;
      this._el.querySelector('#dr-step-e2f').classList.remove('hidden');
      this._renderDiceRow('#dr-dice-e2f', e2fResultats);
      this._el.querySelector('#dr-e2f-summary').textContent = net.e2f >= 2
        ? `Relance des ${e2fResultats.length} succès : ${confirmed} confirmé${confirmed !== 1 ? 's' : ''}, ${lost} perdu${lost !== 1 ? 's' : ''}`
        : `Relance de 1 succès : ${confirmed > 0 ? 'confirmé' : 'perdu'}`;
    } else {
      this._el.querySelector('#dr-step-e2f').classList.add('hidden');
    }

    // SC / PMF
    if (bonusResultats) {
      const newSucc  = bonusResultats.filter(v => isSuccess(v, diff)).length;
      const labelEl  = this._el.querySelector('#dr-bonus-label');
      this._el.querySelector('#dr-step-bonus').classList.remove('hidden');
      if (bonusType === 'SC' || bonusType === 'sc') {
        labelEl.className   = 'text-xs text-green-400 mb-1.5';
        labelEl.textContent = `🍀 ${bonusType} — relance ${bonusResultats.length === 1 ? '1 échec' : `les ${bonusResultats.length} échecs`}`;
        this._renderDiceRow('#dr-dice-bonus', bonusResultats);
        this._el.querySelector('#dr-bonus-summary').textContent =
          `+${newSucc} succès supplémentaire${newSucc !== 1 ? 's' : ''}`;
      } else {
        labelEl.className   = 'text-xs text-blue-400 mb-1.5';
        labelEl.textContent = `✨ ${bonusType} — relance ${bonusResultats.length === 1 ? '1 succès' : `les ${bonusResultats.length} succès`} (bonus possible)`;
        this._renderDiceRow('#dr-dice-bonus', bonusResultats);
        this._el.querySelector('#dr-bonus-summary').textContent =
          newSucc > 0 ? `+${newSucc} succès bonus` : 'Aucun succès bonus';
      }
    } else {
      this._el.querySelector('#dr-step-bonus').classList.add('hidden');
    }

    // Total
    const sucColor = succes === 0 ? 'text-red-400' : 'text-green-400';
    const sucTitle = succes === 0 ? '☠ Échec total' : `${succes} succès`;
    const diffHint = diffPlus > 0
      ? ` <span class="text-xs text-gray-400 font-normal">(D+${diffPlus} → ${diffPlus + 1} requis)</span>`
      : '';
    this._el.querySelector('#dr-successes').innerHTML =
      `<span class="${sucColor}">${sucTitle}</span>${diffHint}`;

    // Accident MF
    const stepAcc = this._el.querySelector('#dr-step-accident');
    if (this._accidentRisk && mfCount > 0) {
      stepAcc.classList.remove('hidden');
      const detailEl = this._el.querySelector('#dr-accident-detail');
      detailEl.innerHTML = mfAccidents === 0
        ? `${mfCount} dé${mfCount > 1 ? 's' : ''} MF — <span class="text-green-400">aucun 1 → pas de blessure</span>`
        : `${mfCount} dé${mfCount > 1 ? 's' : ''} MF — <strong class="text-red-300">${mfAccidents} dé${mfAccidents > 1 ? 's' : ''} à 1 → ${mfAccidents}S</strong> <span class="text-gray-400">(ignore Blindage &amp; Protection)</span>`;
    } else {
      stepAcc.classList.add('hidden');
    }

    this._el.querySelector('#dr-results').classList.remove('hidden');
  }

  // ── Transfert Metal Faktor ────────────────────────────────────────────────────

  async _doMFTransfer(mfCount, violent) {
    const mfTransfer = Math.max(0, mfCount - (violent ? 1 : 0));
    const notify     = (cls, msg) => {
      const n = document.createElement('div');
      n.className   = `fixed bottom-4 right-4 ${cls} text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-[60]`;
      n.textContent = msg;
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 6000);
    };

    if (mfTransfer === 0) {
      notify('bg-gray-700', `⚡ ${mfCount} dé${mfCount > 1 ? 's' : ''} MF · aucun transfert (action violente)`);
      return;
    }

    try {
      const r = await fetchWithTable('/api/mf-pool/transfer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ delta: mfTransfer, direction: this._mfDirection }),
      });
      const json = await r.json().catch(() => ({}));
      if (r.ok) {
        if (json.data) {
          this._mfPool = json.data;
          this._updateMFCounterUI();
        }
        document.dispatchEvent(new CustomEvent('mf-pool-transferred', { detail: json.data }));
        const from = this._mfDirection === 'pj_to_mj' ? 'PJ' : 'MJ';
        const to   = this._mfDirection === 'pj_to_mj' ? 'MJ' : 'PJ';
        const pj   = json.data?.pj_pool ?? '?';
        const mj   = json.data?.mj_pool ?? '?';
        notify('bg-yellow-700', `⚡ ${mfTransfer} MF → ${from}→${to} · PJ ${pj} / MJ ${mj}`);
      } else {
        notify('bg-red-800', `⚡ Transfert MF impossible (${r.status})`);
      }
    } catch {
      notify('bg-red-800', '⚡ Transfert MF — erreur réseau');
    }
  }
}
