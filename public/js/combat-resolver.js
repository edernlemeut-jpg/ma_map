/**
 * combat-resolver.js — Résolveur de tests d6 — Combat Spatial (Metal Adventures)
 *
 * Mécanique :
 *   - Dés : d6 uniquement
 *   - Difficulté standard : 4+ est un succès (valeurs 4,5,6)
 *   - TD (Trop Dur)    : seul le 6 est un succès
 *   - TF (Trop Facile) : seul le 1 est un échec (1 = échec, 2–6 = succès)
 *
 * Modificateurs (se compensent selon les règles MA) :
 *   E2F / e2f — Essaie 2 fois : relance les succès, doivent réussir à nouveau
 *   SC  / sc  — Seconde Chance : relance les échecs, chance de réussir
 *   PMF / pmf — Peut mieux faire : relance les succès, peut apporter +1 succès
 *   (majuscule = complet, minuscule = partiel = 1 seul dé affecté)
 *   +1d — Lancer un dé supplémentaire
 *   D+1 — Difficulté +1 (nombre de succès requis +1, affiché seulement)
 *
 * Règles de combinaison :
 *   - E2F se soustrait à SC/PMF (malus réduit le bonus)
 *   - Partiel + partiel = complet
 *   - Si SC et PMF résiduels, l'utilisateur choisit
 *   - E2F excédentaire : appliqué une seule fois
 *
 * Exporte CombatResolver :
 *   - open(combatId) : affiche la modale résolveur
 *   - close()        : ferme la modale
 *
 * Émet l'événement custom `journal-entry` sur document
 *   detail : { combatId, entry }
 */

import { fetchWithTable } from '/js/shared/table-selector.js';

// ── Moteur de jets d6 Metal Adventures ───────────────────────────────────────

/**
 * Lance n d6 et retourne les valeurs brutes [1..6]
 */
function lancerD6(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1);
}

/**
 * Détermine si un résultat de dé est un succès selon la difficulté.
 * @param {number} valeur  — valeur du dé (1–6)
 * @param {'standard'|'TD'|'TF'} diff
 */
function estSucces(valeur, diff) {
  if (diff === 'TD') return valeur === 6;
  if (diff === 'TF') return valeur !== 1;
  return valeur >= 4;          // standard : 4+
}

/**
 * Résout un jet complet Metal Adventures.
 *
 * @param {object} params
 *   pool        {number}                    — nombre de dés (avant +1d)
 *   bonusDes    {number}                    — nombre de +1d à ajouter
 *   diff        {'standard'|'TD'|'TF'}     — difficulté
 *   modif       {'aucun'|'E2F'|'e2f'|'SC'|'sc'|'PMF'|'pmf'} — modificateur résolu
 *   choixBonus  {'SC'|'PMF'|null}           — si conflit SC/PMF, lequel appliquer
 *
 * @returns {object}
 *   {
 *     poolTotal   {number}   — dés lancés au total
 *     diff        {string}
 *     modif       {string}
 *     lancers     [{valeur, succes, relanc, succes2, compteSucces}]
 *     succes      {number}   — total succès
 *     detail      {string}   — résumé textuel
 *   }
 */
function resoudreJet({ pool, bonusDes = 0, diff = 'standard', modif = 'aucun', choixBonus = null }) {
  const poolTotal = Math.max(1, pool + bonusDes);
  const deBase = lancerD6(poolTotal);

  const lancers = deBase.map(valeur => {
    const reussite = estSucces(valeur, diff);
    let relanc = null;
    let succes2 = null;
    let compteSucces = reussite ? 1 : 0;

    // Modificateurs appliqués sur ce dé (modif 'complet' = tous les dés)
    // modif 'partiel' = 1 seul dé (le premier concerné est marqué)
    // → On délègue la sélection du dé affecté en post-traitement
    return { valeur, reussite, relanc, succes2, compteSucces };
  });

  // — Application des modificateurs —
  if (modif === 'E2F' || modif === 'e2f') {
    // Relancer les succès ; doivent réussir à nouveau
    const cibles = modif === 'e2f'
      ? lancers.filter(d => d.reussite).slice(0, 1)
      : lancers.filter(d => d.reussite);
    for (const d of cibles) {
      const r = lancerD6(1)[0];
      d.relanc = r;
      d.succes2 = estSucces(r, diff);
      d.compteSucces = d.succes2 ? 1 : 0;
    }
  } else if (modif === 'SC' || modif === 'sc') {
    // Relancer les échecs ; une chance de réussir
    const cibles = modif === 'sc'
      ? lancers.filter(d => !d.reussite).slice(0, 1)
      : lancers.filter(d => !d.reussite);
    for (const d of cibles) {
      const r = lancerD6(1)[0];
      d.relanc = r;
      d.succes2 = estSucces(r, diff);
      d.compteSucces = d.succes2 ? 1 : 0;
    }
  } else if (modif === 'PMF' || modif === 'pmf') {
    // Relancer les succès ; peut apporter +1 supplémentaire (on garde le premier + éventuellement +1)
    const cibles = modif === 'pmf'
      ? lancers.filter(d => d.reussite).slice(0, 1)
      : lancers.filter(d => d.reussite);
    for (const d of cibles) {
      const r = lancerD6(1)[0];
      d.relanc = r;
      d.succes2 = estSucces(r, diff);
      // le succès de base est conservé + éventuellement +1
      d.compteSucces = 1 + (d.succes2 ? 1 : 0);
    }
  }

  const succes = lancers.reduce((acc, d) => acc + d.compteSucces, 0);
  const diffLabel = diff === 'TD' ? 'TD' : diff === 'TF' ? 'TF' : 'Standard';
  const detail = `${poolTotal}d6 ${modif !== 'aucun' ? modif + ' ' : ''}(${diffLabel}) → ${succes} succès`;

  return { poolTotal, diff, modif, lancers, succes, detail };
}

/**
 * Résout les modificateurs bruts saisis par le MJ pour retourner
 * le modificateur effectif à appliquer et l'éventuel conflit SC/PMF.
 *
 * Règles :
 *   - partial (minuscule) vaut 0.5 ; complet vaut 1
 *   - E2F (malus) se soustrait à SC et PMF (bonus)
 *   - 2 partiels = 1 complet (round down : 1 partiel reste partiel)
 *   - Si E2F excédentaire : on applique 1 E2F
 *   - Si SC et PMF résiduels : conflit → retourne conflict: true pour que l'UI demande
 *
 * @param {{ e2f: number, sc: number, pmf: number }} mods — nombre de chaque modificateur (0, 0.5 ou 1+)
 * @returns {{ modif: string, conflict: boolean, conflictOptions: string[] }}
 */
function resoudreModificateurs({ e2f = 0, sc = 0, pmf = 0 }) {
  // Normalise les partiels (0.5) vs complets (1)
  // L'UI envoie des entiers : 0 = aucun, 1 = partiel, 2 = complet (ou plus)
  // On convertit en "unités" où partiel = 1 unité, complet = 2 unités
  const toUnits = v => Math.round(v * 2);
  const toMod   = u => u === 0 ? 'aucun' : u === 1 ? 'partiel' : 'complet';

  let uE2F = toUnits(e2f);
  let uSC  = toUnits(sc);
  let uPMF = toUnits(pmf);

  // Soustraction : E2F se soustrait à SC puis PMF
  if (uE2F > 0 && uSC > 0) {
    const sub = Math.min(uE2F, uSC);
    uE2F -= sub; uSC -= sub;
  }
  if (uE2F > 0 && uPMF > 0) {
    const sub = Math.min(uE2F, uPMF);
    uE2F -= sub; uPMF -= sub;
  }

  // Plafonnement : E2F excédentaire → 1 application max (= 2 unités)
  if (uE2F > 2) uE2F = 2;

  // Conflit SC + PMF ?
  if (uSC > 0 && uPMF > 0) {
    return { modif: 'aucun', conflict: true, conflictOptions: ['SC', 'PMF'] };
  }

  if (uE2F > 0) {
    return { modif: uE2F >= 2 ? 'E2F' : 'e2f', conflict: false, conflictOptions: [] };
  }
  if (uSC > 0) {
    return { modif: uSC >= 2 ? 'SC' : 'sc', conflict: false, conflictOptions: [] };
  }
  if (uPMF > 0) {
    return { modif: uPMF >= 2 ? 'PMF' : 'pmf', conflict: false, conflictOptions: [] };
  }
  return { modif: 'aucun', conflict: false, conflictOptions: [] };
}

// ── Actions disponibles (tableaux 8.1–8.5 de analyse-combat-spatial.md) ──────

const ACTIONS = [
  { value: '',                     label: '— Choisir une action —' },
  // Pilote
  { value: 'Engagement',           label: 'Engagement (Pilote)' },
  { value: 'Accrocher',            label: 'Accrocher (Pilote)' },
  { value: 'Break!',               label: 'Break! (Pilote)' },
  { value: 'Rétrofusées!',         label: 'Rétrofusées! (Pilote)' },
  { value: 'Stella Special',       label: 'Stella Special (Pilote)' },
  { value: 'Virer',                label: 'Virer (Pilote)' },
  { value: 'Cascade!',             label: 'Cascade! (Pilote)' },
  { value: 'Manœuvre défensive',   label: 'Manœuvre défensive (Pilote)' },
  { value: 'Manœuvre offensive',   label: 'Manœuvre offensive (Pilote)' },
  // Canonnier
  { value: 'Tirer',                label: 'Tirer (Canonnier)' },
  { value: 'Viser',                label: 'Viser (Canonnier)' },
  // Vigie
  { value: 'Identifier',           label: 'Identifier (Vigie)' },
  { value: 'Recherche radar',      label: 'Recherche radar (Vigie)' },
  { value: 'Brouillage radar',     label: 'Brouillage radar (Vigie)' },
  { value: 'Brouillage radio',     label: 'Brouillage radio (Vigie)' },
  // Machineries
  { value: 'Canaliser',            label: 'Canaliser (Ingénieur)' },
  // Générales
  { value: 'Rapport de situation', label: 'Rapport de situation' },
  { value: 'Bastardos Salto',      label: 'Bastardos Salto' },
  { value: 'Autre',                label: 'Autre (saisie libre)' },
];

// ── CombatResolver ─────────────────────────────────────────────────────────────

export class CombatResolver {
  constructor() {
    this._combatId  = null;
    this._mode      = 'des'; // 'des' | 'manuel'
    this._lastRoll  = null;  // résultat resoudreJet()
    this._pendingConflict = null; // { sc, pmf } unités en attente si conflit
    this._el        = null;
    this._ensureModal();
  }

  // ── API publique ─────────────────────────────────────────────────────────────

  open(combatId) {
    this._combatId = combatId;
    this._lastRoll = null;
    this._pendingConflict = null;
    this._mode     = 'des';
    this._reset();
    this._el.classList.remove('hidden');
  }

  close() {
    this._el.classList.add('hidden');
  }

  // ── Construction de la modale ────────────────────────────────────────────────

  _ensureModal() {
    let el = document.getElementById('resolver-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'resolver-modal';
      document.body.appendChild(el);
    }

    el.className = 'fixed inset-0 bg-black/75 z-50 hidden flex items-center justify-center p-4';
    el.innerHTML = `
      <div class="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-600 max-h-screen overflow-y-auto">

        <!-- En-tête -->
        <div class="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-base text-gray-100">🎲 Résoudre une action</h2>
          <button id="res-close" class="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <!-- Corps -->
        <div class="p-5 space-y-4">

          <!-- Action + Acteur -->
          <div class="space-y-2">
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Action</label>
              <select id="res-action"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
              </select>
            </div>
            <div id="res-action-libre" class="hidden">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Description libre</label>
              <input id="res-action-text" type="text" maxlength="100" placeholder="Ex : Évasion improvisée…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Acteur (optionnel)</label>
              <input id="res-acteur" type="text" maxlength="60" placeholder="Ex : Hawk, Vaisseau A…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
          </div>

          <!-- Toggle mode -->
          <div class="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            <button id="res-mode-des" class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Dés virtuels</button>
            <button id="res-mode-manuel" class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Saisie manuelle</button>
          </div>

          <!-- Panneau dés -->
          <div id="res-panel-des" class="space-y-3">

            <!-- Pool + Difficulté -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Nombre de dés</label>
                <input id="res-pool" type="number" min="1" max="20" value="3"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
              </div>
              <div>
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Difficulté</label>
                <select id="res-diff"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
                  <option value="standard">Standard (4+)</option>
                  <option value="TD">TD — Trop Dur (6 seulement)</option>
                  <option value="TF">TF — Trop Facile (1 = échec)</option>
                </select>
              </div>
            </div>

            <!-- Modificateurs -->
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Modificateurs</label>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <!-- E2F -->
                <div class="bg-gray-900 rounded p-2 space-y-1">
                  <div class="text-orange-400 font-semibold">E2F <span class="text-gray-500 font-normal">(malus)</span></div>
                  <div class="flex gap-1.5 items-center justify-center">
                    <button data-modif="e2f" data-dir="-1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
                    <span id="val-e2f" class="w-5 text-center font-mono">0</span>
                    <button data-modif="e2f" data-dir="1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">+</button>
                  </div>
                  <div class="text-gray-500 text-center">pair=complet</div>
                </div>
                <!-- SC -->
                <div class="bg-gray-900 rounded p-2 space-y-1">
                  <div class="text-blue-400 font-semibold">SC <span class="text-gray-500 font-normal">(bonus)</span></div>
                  <div class="flex gap-1.5 items-center justify-center">
                    <button data-modif="sc" data-dir="-1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
                    <span id="val-sc" class="w-5 text-center font-mono">0</span>
                    <button data-modif="sc" data-dir="1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">+</button>
                  </div>
                  <div class="text-gray-500 text-center">pair=complet</div>
                </div>
                <!-- PMF -->
                <div class="bg-gray-900 rounded p-2 space-y-1">
                  <div class="text-green-400 font-semibold">PMF <span class="text-gray-500 font-normal">(bonus)</span></div>
                  <div class="flex gap-1.5 items-center justify-center">
                    <button data-modif="pmf" data-dir="-1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
                    <span id="val-pmf" class="w-5 text-center font-mono">0</span>
                    <button data-modif="pmf" data-dir="1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">+</button>
                  </div>
                  <div class="text-gray-500 text-center">pair=complet</div>
                </div>
              </div>
              <!-- +1d -->
              <div class="mt-2 flex items-center gap-3">
                <label class="text-xs text-gray-400">+1d supplémentaire(s)</label>
                <div class="flex gap-1.5 items-center">
                  <button data-modif="bonus-des" data-dir="-1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">−</button>
                  <span id="val-bonus-des" class="w-5 text-center font-mono text-xs text-gray-200">0</span>
                  <button data-modif="bonus-des" data-dir="1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">+</button>
                </div>
                <label class="text-xs text-gray-400 ml-2">D+1 difficulté</label>
                <div class="flex gap-1.5 items-center">
                  <button data-modif="bonus-diff" data-dir="-1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">−</button>
                  <span id="val-bonus-diff" class="w-5 text-center font-mono text-xs text-gray-200">0</span>
                  <button data-modif="bonus-diff" data-dir="1" class="modif-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">+</button>
                </div>
              </div>
              <!-- Résumé modificateurs -->
              <div id="res-modif-summary" class="text-xs text-gray-400 mt-1 min-h-[1.2em]"></div>
            </div>

            <!-- Conflit SC/PMF -->
            <div id="res-conflict" class="hidden bg-yellow-900/40 border border-yellow-700 rounded p-3 space-y-2">
              <div class="text-yellow-300 text-xs font-semibold">Conflit SC / PMF — choisir lequel appliquer :</div>
              <div class="flex gap-2">
                <button id="res-conflict-sc"  class="flex-1 py-1.5 rounded bg-blue-800 hover:bg-blue-700 text-white text-xs font-medium">Seconde Chance (SC)</button>
                <button id="res-conflict-pmf" class="flex-1 py-1.5 rounded bg-green-800 hover:bg-green-700 text-white text-xs font-medium">Peut mieux faire (PMF)</button>
              </div>
            </div>

            <!-- Bouton lancer -->
            <button id="res-lancer"
              class="w-full py-2 rounded font-medium text-sm bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
              Lancer les dés
            </button>

            <!-- Résultats dés -->
            <div id="res-results" class="hidden space-y-2">
              <div id="res-dice-row" class="flex flex-wrap gap-1.5"></div>
              <div id="res-successes" class="text-center text-lg font-bold text-white"></div>
            </div>

            <!-- Note (mode dés) -->
            <div id="res-note-des-wrap">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Note (optionnel)</label>
              <textarea id="res-note-des" rows="2" placeholder="Contexte, modificateurs narratifs…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
            </div>

          </div>

          <!-- Panneau manuel -->
          <div id="res-panel-manuel" class="hidden space-y-3">
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Nombre de succès</label>
              <input id="res-succes-manuel" type="number" min="0" value="0"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Note (optionnel)</label>
              <textarea id="res-note-manuel" rows="2" placeholder="Ex : 2 succès avec PMF, manœuvre défensive active…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
            </div>
          </div>

        </div>

        <!-- Pied -->
        <div class="px-5 pb-5 flex justify-end gap-3">
          <button id="res-cancel" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Fermer</button>
          <button id="res-inscrire" disabled
            class="px-4 py-2 text-sm rounded bg-green-800 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Inscrire au journal
          </button>
        </div>
      </div>`;

    this._el = el;
    this._modifVals = { e2f: 0, sc: 0, pmf: 0, 'bonus-des': 0, 'bonus-diff': 0 };
    this._bindModalEvents();
  }

  _bindModalEvents() {
    const el = this._el;

    el.querySelector('#res-close').addEventListener('click', () => this.close());
    el.querySelector('#res-cancel').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });

    // Toggle mode
    el.querySelector('#res-mode-des').addEventListener('click', () => this._setMode('des'));
    el.querySelector('#res-mode-manuel').addEventListener('click', () => this._setMode('manuel'));

    // Peupler select actions
    const sel = el.querySelector('#res-action');
    sel.innerHTML = ACTIONS.map(a =>
      `<option value="${a.value}">${this._esc(a.label)}</option>`
    ).join('');
    sel.addEventListener('change', () => {
      el.querySelector('#res-action-libre').classList.toggle('hidden', sel.value !== 'Autre');
      this._updateInscireBtn();
    });
    el.querySelector('#res-action-text').addEventListener('input', () => this._updateInscireBtn());

    // Boutons modificateurs (délégation)
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.modif-btn');
      if (!btn) return;
      const modif = btn.dataset.modif;
      const dir   = parseInt(btn.dataset.dir);
      this._modifVals[modif] = Math.max(0, (this._modifVals[modif] || 0) + dir);
      el.querySelector(`#val-${modif}`).textContent = this._modifVals[modif];
      this._updateModifSummary();
      // Réinitialiser le résultat quand les modifs changent
      this._lastRoll = null;
      this._pendingConflict = null;
      el.querySelector('#res-results').classList.add('hidden');
      el.querySelector('#res-conflict').classList.add('hidden');
      this._updateInscireBtn();
    });

    // Résolution conflit SC/PMF
    el.querySelector('#res-conflict-sc').addEventListener('click', () => this._lancerAvecChoix('SC'));
    el.querySelector('#res-conflict-pmf').addEventListener('click', () => this._lancerAvecChoix('PMF'));

    // Lancer les dés
    el.querySelector('#res-lancer').addEventListener('click', () => this._lancerDes());

    // Inscrire
    el.querySelector('#res-inscrire').addEventListener('click', () => this._inscrire());

    // manuel succes change
    el.querySelector('#res-succes-manuel').addEventListener('input', () => this._updateInscireBtn());
  }

  // ── Logique ──────────────────────────────────────────────────────────────────

  _setMode(mode) {
    this._mode = mode;
    this._lastRoll = null;
    this._pendingConflict = null;
    this._el.querySelector('#res-results').classList.add('hidden');
    this._el.querySelector('#res-conflict').classList.add('hidden');

    const btnDes    = this._el.querySelector('#res-mode-des');
    const btnManuel = this._el.querySelector('#res-mode-manuel');
    const panelDes  = this._el.querySelector('#res-panel-des');
    const panelMnl  = this._el.querySelector('#res-panel-manuel');

    if (mode === 'des') {
      btnDes.className    = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors bg-gray-700 text-white';
      btnManuel.className = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-gray-200';
      panelDes.classList.remove('hidden');
      panelMnl.classList.add('hidden');
    } else {
      btnManuel.className = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors bg-gray-700 text-white';
      btnDes.className    = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-gray-200';
      panelMnl.classList.remove('hidden');
      panelDes.classList.add('hidden');
    }
    this._updateInscireBtn();
  }

  _updateModifSummary() {
    const { e2f, sc, pmf } = this._modifVals;
    const parts = [];
    if (e2f > 0) parts.push(`${e2f === 1 ? 'e2f' : `${e2f}×e2f`}`);
    if (sc  > 0) parts.push(`${sc  === 1 ? 'sc'  : `${sc}×sc`}`);
    if (pmf > 0) parts.push(`${pmf === 1 ? 'pmf' : `${pmf}×pmf`}`);
    const bonusDes  = this._modifVals['bonus-des'];
    const bonusDiff = this._modifVals['bonus-diff'];
    if (bonusDes  > 0) parts.push(`+${bonusDes}d`);
    if (bonusDiff > 0) parts.push(`D+${bonusDiff}`);
    this._el.querySelector('#res-modif-summary').textContent = parts.length ? parts.join(' · ') : '';
  }

  _lancerDes(choixBonus = null) {
    const pool  = Math.max(1, Math.min(20, parseInt(this._el.querySelector('#res-pool').value) || 3));
    const diff  = this._el.querySelector('#res-diff').value;
    const bonusDes = this._modifVals['bonus-des'] || 0;

    // Résoudre modificateurs
    const { e2f, sc, pmf } = this._modifVals;
    const resModif = resoudreModificateurs({
      e2f: e2f / 2,  // convertit unités (1 partiel, 2 complet) → 0.5 / 1
      sc:  sc  / 2,
      pmf: pmf / 2,
    });

    if (resModif.conflict && !choixBonus) {
      // Afficher le sélecteur de conflit et stopper
      this._pendingConflict = { pool, diff, bonusDes };
      this._el.querySelector('#res-conflict').classList.remove('hidden');
      this._el.querySelector('#res-results').classList.add('hidden');
      this._updateInscireBtn();
      return;
    }

    const modifEffectif = choixBonus
      ? (choixBonus === 'SC' ? (sc >= 2 ? 'SC' : 'sc') : (pmf >= 2 ? 'PMF' : 'pmf'))
      : resModif.modif;

    const result = resoudreJet({ pool, bonusDes, diff, modif: modifEffectif });
    this._lastRoll = result;
    this._pendingConflict = null;
    this._el.querySelector('#res-conflict').classList.add('hidden');

    this._renderDiceResult(result);
    this._updateInscireBtn();
  }

  _lancerAvecChoix(choix) {
    this._lancerDes(choix);
  }

  _renderDiceResult(result) {
    const el = this._el;
    const { lancers, succes, diff, modif, poolTotal } = result;

    const diceRow = el.querySelector('#res-dice-row');
    diceRow.innerHTML = lancers.map((d, i) => {
      const items = [];

      // Dé principal
      const colorBase = d.reussite
        ? 'bg-green-800 border-green-500 text-green-200'
        : 'bg-red-900 border-red-700 text-red-300';
      items.push(`<span class="w-9 h-9 flex items-center justify-center rounded border text-sm font-mono font-bold ${colorBase}" title="Dé ${i+1}">${d.valeur}</span>`);

      // Flèche + relancé (si applicable)
      if (d.relanc !== null) {
        const colorRelanc = d.succes2
          ? 'bg-green-800 border-green-500 text-green-200'
          : 'bg-red-900 border-red-700 text-red-300';
        const arrow = (modif === 'E2F' || modif === 'e2f') ? '→' : '↺';
        items.push(`<span class="text-gray-500 text-xs self-center">${arrow}</span>`);
        items.push(`<span class="w-9 h-9 flex items-center justify-center rounded border text-sm font-mono font-bold ${colorRelanc} opacity-80">${d.relanc}</span>`);
        // PMF : +1 bonus affiché
        if ((modif === 'PMF' || modif === 'pmf') && d.succes2) {
          items.push(`<span class="text-green-400 text-xs self-center font-bold">+1</span>`);
        }
      }

      return `<div class="flex items-center gap-0.5">${items.join('')}</div>`;
    }).join('');

    const diffLabel = diff === 'TD' ? ' · TD (6+)' : diff === 'TF' ? ' · TF (2+)' : ' · Std (4+)';
    const modifLabel = modif !== 'aucun' ? ` · ${modif}` : '';
    const sucTitle = succes === 0 ? 'Échec total' : succes === 1 ? '1 succès' : `${succes} succès`;
    const sucColor = succes === 0 ? 'text-red-400' : 'text-green-400';
    el.querySelector('#res-successes').innerHTML =
      `<span class="${sucColor}">${sucTitle}</span><span class="text-gray-400 text-sm font-normal">${diffLabel}${modifLabel}</span>`;

    el.querySelector('#res-results').classList.remove('hidden');
  }

  _updateInscireBtn() {
    const sel = this._el.querySelector('#res-action');
    const action = sel.value;
    let canInscrire = Boolean(action);

    if (action === 'Autre') {
      canInscrire = Boolean(this._el.querySelector('#res-action-text').value.trim());
    }

    if (this._mode === 'des' && !this._lastRoll) canInscrire = false;

    this._el.querySelector('#res-inscrire').disabled = !canInscrire;
  }

  async _inscrire() {
    const sel   = this._el.querySelector('#res-action');
    const action = sel.value === 'Autre'
      ? this._el.querySelector('#res-action-text').value.trim()
      : sel.value;
    if (!action) return;

    const acteur = this._el.querySelector('#res-acteur').value.trim() || null;

    let entry;
    if (this._mode === 'des' && this._lastRoll) {
      const r = this._lastRoll;
      const note = this._el.querySelector('#res-note-des').value.trim() || null;
      const bonusDiff = this._modifVals['bonus-diff'] || 0;
      entry = {
        id:        Date.now(),
        ts:        new Date().toISOString(),
        action,
        acteur,
        pool:      r.poolTotal,
        diff:      r.diff,
        modif:     r.modif !== 'aucun' ? r.modif : null,
        bonus_diff: bonusDiff || null,
        resultats: r.lancers.map(d => d.valeur),
        relances:  r.lancers.some(d => d.relanc !== null)
          ? r.lancers.map(d => d.relanc)
          : null,
        succes:    r.succes,
        note,
      };
    } else if (this._mode === 'manuel') {
      const succes = parseInt(this._el.querySelector('#res-succes-manuel').value) || 0;
      const note   = this._el.querySelector('#res-note-manuel').value.trim() || null;
      entry = {
        id:        Date.now(),
        ts:        new Date().toISOString(),
        action,
        acteur,
        pool:      null,
        diff:      null,
        modif:     null,
        bonus_diff: null,
        resultats: null,
        relances:  null,
        succes,
        note,
      };
    } else {
      return;
    }

    const btn = this._el.querySelector('#res-inscrire');
    btn.disabled = true;
    btn.textContent = 'Inscription…';

    try {
      const res = await fetchWithTable(`/api/combat-spatial/${this._combatId}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      const confirmedEntry = (Array.isArray(json.data?.journal) && json.data.journal.length > 0)
        ? json.data.journal[0]
        : entry;

      document.dispatchEvent(new CustomEvent('journal-entry', {
        detail: { combatId: this._combatId, entry: confirmedEntry },
      }));

      this.close();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Inscrire au journal';

      const errEl = document.createElement('div');
      errEl.className = 'fixed bottom-4 right-4 bg-red-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50';
      errEl.textContent = err.message;
      document.body.appendChild(errEl);
      setTimeout(() => errEl.remove(), 4000);
    }
  }

  // ── État initial de la modale ────────────────────────────────────────────────

  _reset() {
    this._el.querySelector('#res-action').value    = '';
    this._el.querySelector('#res-action-libre').classList.add('hidden');
    this._el.querySelector('#res-action-text').value = '';
    this._el.querySelector('#res-acteur').value    = '';
    this._el.querySelector('#res-inscrire').textContent = 'Inscrire au journal';
    this._el.querySelector('#res-pool').value      = '3';
    this._el.querySelector('#res-diff').value      = 'standard';
    this._el.querySelector('#res-note-des').value  = '';
    this._el.querySelector('#res-succes-manuel').value = '0';
    this._el.querySelector('#res-note-manuel').value   = '';
    this._el.querySelector('#res-results').classList.add('hidden');
    this._el.querySelector('#res-conflict').classList.add('hidden');
    // Remise à zéro des compteurs modifs
    this._modifVals = { e2f: 0, sc: 0, pmf: 0, 'bonus-des': 0, 'bonus-diff': 0 };
    for (const k of ['e2f', 'sc', 'pmf', 'bonus-des', 'bonus-diff']) {
      const el = this._el.querySelector(`#val-${k}`);
      if (el) el.textContent = '0';
    }
    this._el.querySelector('#res-modif-summary').textContent = '';
    this._setMode('des');
    this._updateInscireBtn();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

  // ── API publique ─────────────────────────────────────────────────────────────

  open(combatId) {
    this._combatId = combatId;
    this._lastRoll = null;
    this._mode     = 'des';
    this._reset();
    this._el.classList.remove('hidden');
  }

  close() {
    this._el.classList.add('hidden');
  }

  // ── Construction de la modale ────────────────────────────────────────────────

  _ensureModal() {
    let el = document.getElementById('resolver-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'resolver-modal';
      document.body.appendChild(el);
    }

    el.className = 'fixed inset-0 bg-black/75 z-50 hidden flex items-center justify-center p-4';
    el.innerHTML = `
      <div class="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-600">

        <!-- En-tête -->
        <div class="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-base text-gray-100">🎲 Résoudre une action</h2>
          <button id="res-close" class="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <!-- Corps -->
        <div class="p-5 space-y-4">

          <!-- Action + Acteur -->
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Action</label>
              <select id="res-action"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
              </select>
            </div>
            <div id="res-action-libre" class="col-span-2 hidden">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Description libre</label>
              <input id="res-action-text" type="text" maxlength="100" placeholder="Ex : Évasion improvisée…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
            <div class="col-span-2">
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Acteur (optionnel)</label>
              <input id="res-acteur" type="text" maxlength="60" placeholder="Ex : Hawk, Vaisseau A…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
          </div>

          <!-- Toggle mode -->
          <div class="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            <button id="res-mode-des" class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Dés virtuels</button>
            <button id="res-mode-manuel" class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Saisie manuelle</button>
          </div>

          <!-- Panneau dés -->
          <div id="res-panel-des" class="space-y-3">
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Nombre de dés</label>
                <input id="res-pool" type="number" min="1" max="16" value="3"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
              </div>
              <div class="flex-1">
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Seuil de succès (≤)</label>
                <input id="res-seuil" type="number" min="1" max="10" value="3"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
              </div>
            </div>
            <button id="res-lancer"
              class="w-full py-2 rounded font-medium text-sm bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
              Lancer les dés
            </button>
            <!-- Résultats dés -->
            <div id="res-results" class="hidden space-y-2">
              <div id="res-dice-row" class="flex flex-wrap gap-1.5"></div>
              <div id="res-successes" class="text-center text-lg font-bold text-white"></div>
            </div>
          </div>

          <!-- Panneau manuel -->
          <div id="res-panel-manuel" class="hidden space-y-3">
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Nombre de succès</label>
              <input id="res-succes-manuel" type="number" min="0" value="0"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
            </div>
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Note (optionnel)</label>
              <textarea id="res-note-manuel" rows="2" placeholder="Ex : +1d de Viser, manœuvre défensive active…"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
            </div>
          </div>

          <!-- Note commune (mode dés) -->
          <div id="res-note-des-wrap">
            <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Note (optionnel)</label>
            <textarea id="res-note-des" rows="2" placeholder="Modificateurs, contexte…"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
          </div>

        </div>

        <!-- Pied -->
        <div class="px-5 pb-5 flex justify-end gap-3">
          <button id="res-cancel" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Fermer</button>
          <button id="res-inscrire" disabled
            class="px-4 py-2 text-sm rounded bg-green-800 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Inscrire au journal
          </button>
        </div>
      </div>`;

    this._el = el;
    this._bindModalEvents();
  }

  _bindModalEvents() {
    const el = this._el;

    el.querySelector('#res-close').addEventListener('click', () => this.close());
    el.querySelector('#res-cancel').addEventListener('click', () => this.close());

    // Fermer en cliquant l'overlay
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });

    // Toggle mode
    el.querySelector('#res-mode-des').addEventListener('click', () => this._setMode('des'));
    el.querySelector('#res-mode-manuel').addEventListener('click', () => this._setMode('manuel'));

    // Peupler select actions
    const sel = el.querySelector('#res-action');
    sel.innerHTML = ACTIONS.map(a =>
      `<option value="${a.value}">${this._esc(a.label)}</option>`
    ).join('');
    sel.addEventListener('change', () => {
      el.querySelector('#res-action-libre').classList.toggle('hidden', sel.value !== 'Autre');
      this._updateInscireBtn();
    });
    el.querySelector('#res-action-text').addEventListener('input', () => this._updateInscireBtn());

    // Lancer les dés
    el.querySelector('#res-lancer').addEventListener('click', () => this._lancerDes());

    // Inscrire
    el.querySelector('#res-inscrire').addEventListener('click', () => this._inscrire());

    // Mise à jour bouton inscrire à chaque changement pertinent
    el.querySelector('#res-succes-manuel').addEventListener('input', () => this._updateInscireBtn());
  }

  // ── Logique ──────────────────────────────────────────────────────────────────

  _setMode(mode) {
    this._mode = mode;
    this._lastRoll = null;
    this._el.querySelector('#res-results').classList.add('hidden');

    const btnDes    = this._el.querySelector('#res-mode-des');
    const btnManuel = this._el.querySelector('#res-mode-manuel');
    const panelDes  = this._el.querySelector('#res-panel-des');
    const panelMnl  = this._el.querySelector('#res-panel-manuel');
    const noteDes   = this._el.querySelector('#res-note-des-wrap');

    if (mode === 'des') {
      btnDes.className    = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors bg-gray-700 text-white';
      btnManuel.className = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-gray-200';
      panelDes.classList.remove('hidden');
      panelMnl.classList.add('hidden');
      noteDes.classList.remove('hidden');
    } else {
      btnManuel.className = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors bg-gray-700 text-white';
      btnDes.className    = 'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-gray-200';
      panelMnl.classList.remove('hidden');
      panelDes.classList.add('hidden');
      noteDes.classList.add('hidden');
    }
    this._updateInscireBtn();
  }

  _lancerDes() {
    const pool  = Math.max(1, Math.min(16, parseInt(this._el.querySelector('#res-pool').value) || 3));
    const seuil = Math.max(1, Math.min(10, parseInt(this._el.querySelector('#res-seuil').value) || 3));

    const resultats = Array.from({ length: pool }, () => Math.floor(Math.random() * 10) + 1);
    const succes    = resultats.filter(r => r <= seuil).length;

    this._lastRoll = { pool, seuil, resultats, succes };

    // Affichage
    const diceRow = this._el.querySelector('#res-dice-row');
    diceRow.innerHTML = resultats.map(r => {
      const isSucces = r <= seuil;
      const color = isSucces
        ? 'bg-green-800 border-green-500 text-green-200'
        : 'bg-red-900 border-red-700 text-red-300';
      return `<span class="w-9 h-9 flex items-center justify-center rounded border text-sm font-mono font-bold ${color}">${r}</span>`;
    }).join('');

    const sucTitle = succes === 0 ? 'Échec' : succes === 1 ? '1 succès' : `${succes} succès`;
    const sucColor = succes === 0 ? 'text-red-400' : 'text-green-400';
    this._el.querySelector('#res-successes').innerHTML =
      `<span class="${sucColor}">${sucTitle}</span> <span class="text-gray-400 text-sm font-normal">(seuil ≤${seuil})</span>`;

    this._el.querySelector('#res-results').classList.remove('hidden');
    this._updateInscireBtn();
  }

  _updateInscireBtn() {
    const sel = this._el.querySelector('#res-action');
    const action = sel.value;
    let canInscrire = Boolean(action);

    if (action === 'Autre') {
      canInscrire = Boolean(this._el.querySelector('#res-action-text').value.trim());
    }

    if (this._mode === 'des' && !this._lastRoll) canInscrire = false;

    this._el.querySelector('#res-inscrire').disabled = !canInscrire;
  }

  async _inscrire() {
    const sel   = this._el.querySelector('#res-action');
    const action = sel.value === 'Autre'
      ? this._el.querySelector('#res-action-text').value.trim()
      : sel.value;
    if (!action) return;

    const acteur = this._el.querySelector('#res-acteur').value.trim() || null;

    let entry;
    if (this._mode === 'des' && this._lastRoll) {
      const note = this._el.querySelector('#res-note-des').value.trim() || null;
      entry = {
        id:        Date.now(),
        ts:        new Date().toISOString(),
        action,
        acteur,
        pool:      this._lastRoll.pool,
        seuil:     this._lastRoll.seuil,
        resultats: this._lastRoll.resultats,
        succes:    this._lastRoll.succes,
        note,
      };
    } else if (this._mode === 'manuel') {
      const succes = parseInt(this._el.querySelector('#res-succes-manuel').value) || 0;
      const note   = this._el.querySelector('#res-note-manuel').value.trim() || null;
      entry = {
        id:        Date.now(),
        ts:        new Date().toISOString(),
        action,
        acteur,
        pool:      null,
        seuil:     null,
        resultats: null,
        succes,
        note,
      };
    } else {
      return;
    }

    const btn = this._el.querySelector('#res-inscrire');
    btn.disabled = true;
    btn.textContent = 'Inscription…';

    try {
      const res = await fetchWithTable(`/api/combat-spatial/${this._combatId}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      // Use server-confirmed entry so the DOM reflects what was actually persisted
      const confirmedEntry = (Array.isArray(json.data?.journal) && json.data.journal.length > 0)
        ? json.data.journal[0]
        : entry;

      document.dispatchEvent(new CustomEvent('journal-entry', {
        detail: { combatId: this._combatId, entry: confirmedEntry },
      }));

      this.close();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Inscrire au journal';

      const errEl = document.createElement('div');
      errEl.className = 'fixed bottom-4 right-4 bg-red-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50';
      errEl.textContent = err.message;
      document.body.appendChild(errEl);
      setTimeout(() => errEl.remove(), 4000);
    }
  }

  // ── État initial de la modale ────────────────────────────────────────────────

  _reset() {
    this._el.querySelector('#res-action').value    = '';
    this._el.querySelector('#res-action-libre').classList.add('hidden');
    this._el.querySelector('#res-action-text').value = '';
    this._el.querySelector('#res-acteur').value    = '';
    this._el.querySelector('#res-inscrire').textContent = 'Inscrire au journal';
    this._el.querySelector('#res-pool').value      = '3';
    this._el.querySelector('#res-seuil').value     = '3';
    this._el.querySelector('#res-note-des').value  = '';
    this._el.querySelector('#res-succes-manuel').value = '0';
    this._el.querySelector('#res-note-manuel').value   = '';
    this._el.querySelector('#res-results').classList.add('hidden');
    this._setMode('des');
    this._updateInscireBtn();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
