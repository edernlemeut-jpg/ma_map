/**
 * combat-resolver.js — Résolveur de tests d6 — Metal Adventures
 *
 * Exporte CombatResolver :
 *   - open(combatId) : affiche la modale résolveur
 *   - close()        : ferme la modale
 *
 * Système de dés d6 Metal Adventures :
 *   Normal  = succès si ≥ 4
 *   TD      = "Trop Dur"   — succès si = 6 uniquement
 *   TF      = "Trop Facile" — tout sauf 1 est un succès
 *
 * Modificateurs (0 = aucun, 1 = partiel, 2 = complet) :
 *   E2F  — malus : les succès sont relancés et doivent réussir à nouveau
 *   SC   — bonus : les échecs sont relancés, possibilité de réussir
 *   PMF  — bonus : les succès sont relancés, chaque réussite ajoute un succès bonus
 *   +1d  — ajoute des dés au pool
 *   D+1  — augmente la difficulté requise de succès
 *
 * Annulation E2F ↔ SC/PMF :
 *   Partiel = 1 unité, Complet = 2 unités.
 *   E2F réduit SC en premier, puis PMF.
 *   Ex : SC(2) – e2f(1) = sc(1)   |   sc(1) + sc(1) = SC(2)
 *   SC et PMF ne se cumulent pas (conflit si les deux restent après annulation).
 *
 * Émet l'événement custom `journal-entry` sur document
 *   detail : { combatId, entry }
 */

import { fetchWithTable } from '/js/shared/table-selector.js';

// ── Utilitaires dés ───────────────────────────────────────────────────────────

function rollD6(n) {
  return Array.from({ length: Math.max(0, n) }, () => Math.floor(Math.random() * 6) + 1);
}

function isSuccess(val, diff) {
  if (diff === 'TD') return val === 6;
  if (diff === 'TF') return val >= 2;
  return val >= 4; // Normal
}

/**
 * Calcule les modificateurs nets après annulation E2F ↔ SC/PMF.
 * E2F réduit SC en premier, puis PMF.
 * Retourne { e2f, sc, pmf } chacun dans [0, 2].
 */
function computeNetMods(e2fLevel, scLevel, pmfLevel) {
  let sc = scLevel, pmf = pmfLevel, remainE2F = e2fLevel;
  const scRed  = Math.min(sc,  remainE2F); sc  -= scRed;  remainE2F -= scRed;
  const pmfRed = Math.min(pmf, remainE2F); pmf -= pmfRed;  remainE2F -= pmfRed;
  return {
    e2f: Math.min(2, remainE2F),
    sc:  Math.min(2, sc),
    pmf: Math.min(2, pmf),
  };
}

/** Chaîne lisible des mods nets (ex : "SC", "e2f", "E2F+pmf") */
function modsLabel(net) {
  const parts = [];
  if (net.e2f === 2) parts.push('E2F');
  else if (net.e2f === 1) parts.push('e2f');
  if (net.sc  === 2) parts.push('SC');
  else if (net.sc  === 1) parts.push('sc');
  if (net.pmf === 2) parts.push('PMF');
  else if (net.pmf === 1) parts.push('pmf');
  return parts.join('+');
}

// ── Actions disponibles (tableaux 8.1–8.5 de analyse-combat-spatial.md) ──────
//    role · duree · competence · effet · violent · accidentRisk

const ACTIONS = [
  { value: '', label: '— Choisir une action —' },
  // ── Pilote ──────────────────────────────────────────────────────────────────
  { value: 'Engagement', label: 'Engagement (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Engager le combat tournoyant. Avantage = succès excédentaires. Difficulté = distance ÷ 25.',
    violent: true },
  { value: 'Accrocher', label: 'Accrocher (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: "Obtenir/augmenter l'Avantage et le contact visuel. Diff=1 si Avantage déjà tenu, sinon Diff = valeur de l'Avantage ennemi.",
    violent: true },
  { value: 'Break!', label: 'Break! (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: "Quitter le CT → poursuite, distance = vitesse tactique. Même difficulté qu'Accrocher.",
    violent: true },
  { value: 'Rétrofusées!', label: 'Rétrofusées! (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Faire demi-tour (25K). En approche → poursuite ; en poursuite → approche ou fin du combat.',
    violent: true },
  { value: 'Stella Special', label: 'Stella Special (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: "Amarrer en vol via sas rétractable. Nécessite contact visuel + Avantage. Test TD (opposé).",
    violent: true, accidentRisk: true },
  { value: 'Virer', label: 'Virer (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Changer de trajectoire. Les succès excédentaires × 25K doivent être ≥ à l\'axe de convergence du prochain round.',
    violent: true },
  { value: 'Cascade!', label: 'Cascade! (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Manœuvre en espace difficile. Difficulté variable de 2 à 11 selon la situation.',
    violent: true, accidentRisk: true },
  { value: 'Manœuvre défensive', label: 'Manœuvre défensive (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Les succès excédentaires s\'ajoutent à la difficulté de tous les tirs ennemis ce tour.',
    violent: true },
  { value: 'Manœuvre offensive', label: 'Manœuvre offensive (Pilote)',
    role: 'Pilote', duree: 'Complexe', competence: 'Pilotage (Vaisseau spatial)',
    effet: 'Les succès excédentaires s\'ajoutent en dés bonus aux canonniers et fusiliers alliés ce tour.',
    violent: true },
  // ── Canonnier ───────────────────────────────────────────────────────────────
  { value: 'Tirer', label: 'Tirer (Canonnier)',
    role: 'Canonnier', duree: 'Complexe', competence: 'Armes embarquées',
    effet: 'Tir sur cible (contact visuel requis). Diff : CT=1 · ≤portée=3 · ≤2×portée=5 · au-delà=impossible.',
    violent: true },
  { value: 'Viser', label: 'Viser (Canonnier)',
    role: 'Canonnier', duree: 'Simple', competence: '—',
    effet: 'Ajoute +1d au prochain tir sur cette cible. Ne peut pas être enchaîné.' },
  // ── Vigie ────────────────────────────────────────────────────────────────────
  { value: 'Identifier', label: 'Identifier (Vigie)',
    role: 'Vigie', duree: 'Complexe', competence: 'Senseurs',
    effet: 'Obtenir infos sur un contact radar (classe, modèle, état…). TD si senseurs passifs ; portée longue = impossible.' },
  { value: 'Recherche radar', label: 'Recherche radar (Vigie)',
    role: 'Vigie', duree: 'Complexe', competence: 'Senseurs',
    effet: 'Localiser un vaisseau non repéré. Test ouvert (D+1) pour couvrir un large secteur.' },
  { value: 'Brouillage radar', label: 'Brouillage radar (Vigie)',
    role: 'Vigie', duree: 'Complexe', competence: 'Senseurs',
    effet: '+succès excédentaires à la Difficulté des tirs ennemis. TD si cible hors portée courte.' },
  { value: 'Brouillage radio', label: 'Brouillage radio (Vigie)',
    role: 'Vigie', duree: 'Complexe', competence: 'Senseurs',
    effet: "Opposition Senseurs — coupe la coordination d'escadron ennemie." },
  // ── Ingénieur ────────────────────────────────────────────────────────────────
  { value: 'Canaliser', label: 'Canaliser (Ingénieur)',
    role: 'Ingénieur', duree: 'Complexe', competence: 'Ingénierie',
    effet: "Redistribuer l'énergie entre Armement / Propulsion / Senseurs. Systèmes favorisés = bonus ; appauvris = malus." },
  // ── Général ──────────────────────────────────────────────────────────────────
  { value: 'Rapport de situation', label: 'Rapport de situation',
    role: 'Général', duree: 'Complexe', competence: 'Navigation',
    effet: "Refaire le test d'initiative. Effectif au prochain round seulement." },
  { value: 'Bastardos Salto', label: 'Bastardos Salto',
    role: 'Général', duree: 'Complexe', competence: 'Athlétisme',
    effet: "Sauter sur la coque d'un vaisseau en mouvement. Toujours TD ; D+1 supplémentaire en apesanteur.",
    accidentRisk: true },
  { value: 'Autre', label: 'Autre (saisie libre)' },
];

// ── CombatResolver ─────────────────────────────────────────────────────────────

export class CombatResolver {
  constructor() {
    this._combatId    = null;
    this._mode        = 'des';       // 'des' | 'manuel'
    this._diff        = 'normal';    // 'normal' | 'TD' | 'TF'
    this._e2f         = 0;           // 0 | 1 | 2
    this._sc          = 0;
    this._pmf         = 0;
    this._lastRoll    = null;
    this._el          = null;
    // Metal Faktor
    this._mfPool      = null;        // { pj_pool, mj_pool } — null = non chargé
    this._mfViolent   = false;       // case Violent ? — réduit le transfert de 1
    this._mfActor     = 'pj';        // 'pj' | 'pnj'
    this._mfDirection = 'pj_to_mj';  // 'pj_to_mj' | 'mj_to_pj' (acteur PNJ)
    this._ensureModal();
  }

  // ── API publique ─────────────────────────────────────────────────────────────

  async open(combatId) {
    this._combatId    = combatId;
    this._lastRoll    = null;
    this._diff        = 'normal';
    this._e2f = this._sc = this._pmf = 0;
    this._mode        = 'des';
    this._mfPool      = null;
    this._mfViolent   = false;
    this._mfActor     = 'pj';
    this._mfDirection = 'pj_to_mj';
    this._reset();
    this._el.classList.remove('hidden');
    // Chargement asynchrone du pool MF
    try {
      const r = await fetchWithTable('/api/mf-pool');
      if (r.ok) {
        this._mfPool = (await r.json()).data;
        this._updateMFUI();
      }
    } catch { /* pool indisponible */ }
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
    el.className = 'fixed inset-0 bg-black/75 z-50 hidden flex items-start justify-center p-4 pt-8 overflow-y-auto';
    el.innerHTML = this._modalHTML();
    this._el = el;
    this._bindModalEvents();
  }

  _modalHTML() {
    const modRow = (id, label, color) => `
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold ${color} w-10 flex-shrink-0">${label}</span>
        <div class="flex gap-1 flex-1">
          <button id="${id}-0" class="${id}-btn res-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="0">—</button>
          <button id="${id}-1" class="${id}-btn res-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="1">${label.toLowerCase()}</button>
          <button id="${id}-2" class="${id}-btn res-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors"
            data-mod="${id}" data-val="2">${label.toUpperCase()}</button>
        </div>
      </div>`;

    return `
      <div class="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-600">

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
            <!-- Info compendium de l'action -->
            <div id="res-action-info"
              class="hidden bg-indigo-950/50 border border-indigo-800/40 rounded px-3 py-2.5 space-y-1.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span id="res-info-role"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-300 uppercase tracking-wider font-medium"></span>
                <span id="res-info-duree"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-300"></span>
                <span id="res-info-competence"
                  class="text-xs text-indigo-300 font-semibold"></span>
                <span id="res-info-violent"
                  class="hidden text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300">⚡ Violence (MF)</span>
                <span id="res-info-accident"
                  class="hidden text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300">🩸 Risque d'accident</span>
              </div>
              <div id="res-info-effet" class="text-xs text-gray-300 leading-relaxed"></div>
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
            <button id="res-mode-des"    class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Dés virtuels</button>
            <button id="res-mode-manuel" class="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors">Saisie manuelle</button>
          </div>

          <!-- ════ PANNEAU DÉS ════ -->
          <div id="res-panel-des" class="space-y-4">

            <!-- Pool + Difficulté -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Pool (d6)</label>
                <input id="res-pool" type="number" min="1" max="20" value="3"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              </div>
              <div>
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Difficulté</label>
                <div class="flex gap-1 mt-1">
                  <button id="res-diff-normal" class="res-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors" data-diff="normal">Normal<br><span class="text-[10px] opacity-70">4+</span></button>
                  <button id="res-diff-td"     class="res-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors" data-diff="TD">TD<br><span class="text-[10px] opacity-70">6 seul</span></button>
                  <button id="res-diff-tf"     class="res-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors" data-diff="TF">TF<br><span class="text-[10px] opacity-70">≠ 1</span></button>
                </div>
              </div>
            </div>

            <!-- Modificateurs -->
            <div>
              <label class="text-xs text-gray-400 uppercase tracking-wide block mb-2">Modificateurs</label>
              <div class="space-y-1.5">
                ${modRow('res-e2f', 'E2F', 'text-orange-400')}
                ${modRow('res-sc',  'SC',  'text-green-400')}
                ${modRow('res-pmf', 'PMF', 'text-blue-400')}
              </div>
            </div>

            <!-- +1d et D+1 -->
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">+1d (dés sup.)</label>
                <input id="res-plus1d" type="number" min="0" max="10" value="0"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              </div>
              <div class="flex-1">
                <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">D+1 (difficulté +)</label>
                <input id="res-dplus1" type="number" min="0" max="10" value="0"
                  class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              </div>
            </div>

            <!-- Metal Faktor -->
            <div class="border border-yellow-800/40 bg-yellow-950/20 rounded-lg p-3 space-y-2.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold text-yellow-400 uppercase tracking-wide">⚡ Metal Faktor</label>
                <div class="text-xs font-mono">
                  PJ&nbsp;<span id="res-mf-pj" class="text-green-400 font-bold">—</span>
                  &nbsp;·&nbsp;
                  MJ&nbsp;<span id="res-mf-mj" class="text-red-400 font-bold">—</span>
                </div>
              </div>
              <!-- Dés MF + Violent -->
              <div class="flex items-center gap-3">
                <div class="flex-1">
                  <label class="text-xs text-gray-400 block mb-1">Dés MF à ajouter</label>
                  <input id="res-mf-count" type="number" min="0" max="50" value="0"
                    class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                </div>
                <div class="flex items-center gap-2 self-end pb-2.5">
                  <input type="checkbox" id="res-mf-violent" class="w-4 h-4 accent-yellow-500">
                  <label for="res-mf-violent" class="text-xs text-gray-300 cursor-pointer select-none">Violent&nbsp;?</label>
                </div>
              </div>
              <!-- Qui agit ? -->
              <div>
                <label class="text-xs text-gray-400 block mb-1">Qui agit ?</label>
                <div class="flex gap-1">
                  <button id="res-mf-actor-pj"  class="res-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                    data-actor="pj">Joueur (PJ)</button>
                  <button id="res-mf-actor-pnj" class="res-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                    data-actor="pnj">MJ / PNJ</button>
                </div>
              </div>
              <!-- Sens du transfert (PNJ uniquement) -->
              <div id="res-mf-direction-wrap" class="hidden">
                <label class="text-xs text-gray-400 block mb-1">Sens du transfert</label>
                <div class="flex gap-1">
                  <button id="res-mf-dir-pj2mj" class="res-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                    data-dir="pj_to_mj">PJ → MJ</button>
                  <button id="res-mf-dir-mj2pj" class="res-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors"
                    data-dir="mj_to_pj">MJ → PJ</button>
                </div>
              </div>
              <!-- Résumé transfert -->
              <div id="res-mf-preview" class="hidden text-xs text-yellow-200 bg-yellow-900/30 rounded px-2 py-1.5"></div>
              <!-- Risque d'accident -->
              <div id="res-mf-accident" class="hidden text-xs text-red-300 bg-red-950/50 border border-red-800/50 rounded px-2 py-1.5"></div>
            </div>

            <!-- Avertissement conflit SC/PMF -->
            <div id="res-conflict-warn"
              class="hidden text-xs text-yellow-300 bg-yellow-900/30 border border-yellow-700/50 rounded px-3 py-1.5">
              ⚠ SC et PMF ne se cumulent pas après calcul des annulations — choisissez l'un ou l'autre.
            </div>

            <!-- Bouton Lancer -->
            <button id="res-lancer"
              class="w-full py-2 rounded font-medium text-sm bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Lancer les dés
            </button>

            <!-- ── Résultats ──────────────────────────────────────────────── -->
            <div id="res-results" class="hidden space-y-3 border border-gray-700 rounded-lg p-3">

              <!-- Jet initial -->
              <div>
                <div class="text-xs text-gray-400 mb-1.5">
                  Jet initial · <span id="res-diff-badge" class="font-medium text-indigo-300"></span>
                </div>
                <div id="res-dice-initial" class="flex flex-wrap gap-1.5"></div>
                <div id="res-base-summary" class="text-xs text-gray-400 mt-1.5"></div>
              </div>

              <!-- Relance E2F -->
              <div id="res-step-e2f" class="hidden pt-2 border-t border-gray-700">
                <div class="text-xs text-orange-400 mb-1.5">🔄 E2F — relance des succès (doivent réussir à nouveau)</div>
                <div id="res-dice-e2f"    class="flex flex-wrap gap-1.5"></div>
                <div id="res-e2f-summary" class="text-xs text-gray-400 mt-1.5"></div>
              </div>

              <!-- Relance SC ou PMF -->
              <div id="res-step-bonus" class="hidden pt-2 border-t border-gray-700">
                <div id="res-bonus-label"   class="text-xs mb-1.5"></div>
                <div id="res-dice-bonus"    class="flex flex-wrap gap-1.5"></div>
                <div id="res-bonus-summary" class="text-xs text-gray-400 mt-1.5"></div>
              </div>

              <!-- Total -->
              <div id="res-successes" class="pt-2 border-t border-gray-700 text-center text-lg font-bold"></div>

              <!-- Blessures MF accident -->
              <div id="res-step-mf-accident" class="hidden pt-2 border-t border-red-900/40 bg-red-950/30 rounded-b-lg px-2 py-2">
                <div class="text-xs text-red-400 font-semibold mb-0.5">🩸 Risque d'accident</div>
                <div id="res-mf-accident-detail" class="text-xs text-red-300"></div>
              </div>
            </div>

          </div><!-- /panneau dés -->

          <!-- ════ PANNEAU MANUEL ════ -->
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
            <button id="res-inscrire-manuel" disabled
              class="w-full py-2 text-sm rounded bg-green-800 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Inscrire au journal
            </button>
          </div>

          <!-- Note (mode dés) -->
          <div id="res-note-des-wrap">
            <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Note (optionnel)</label>
            <textarea id="res-note-des" rows="2" placeholder="Modificateurs contextuels, résultat narratif…"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
          </div>

        </div><!-- /corps -->

        <!-- Pied -->
        <div class="px-5 pb-5 pt-4 border-t border-gray-700 flex justify-end gap-3">
          <button id="res-cancel" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Fermer</button>
        </div>
      </div>`;
  }

  _bindModalEvents() {
    const el = this._el;

    el.querySelector('#res-close').addEventListener('click',  () => this.close());
    el.querySelector('#res-cancel').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });

    // Mode
    el.querySelector('#res-mode-des').addEventListener('click',    () => this._setMode('des'));
    el.querySelector('#res-mode-manuel').addEventListener('click', () => this._setMode('manuel'));

    // Actions select + info compendium
    const sel = el.querySelector('#res-action');
    sel.innerHTML = ACTIONS.map(a =>
      `<option value="${a.value}">${this._esc(a.label)}</option>`
    ).join('');
    sel.addEventListener('change', () => {
      el.querySelector('#res-action-libre').classList.toggle('hidden', sel.value !== 'Autre');
      this._updateActionInfo();
      this._updateInscireBtn();
    });
    el.querySelector('#res-action-text').addEventListener('input', () => this._updateInscireBtn());

    // Difficulté
    el.querySelectorAll('.res-diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._diff = btn.dataset.diff;
        this._clearResults();
        this._updateDiffUI();
        this._updateInscireBtn();
      });
    });

    // Modificateurs
    el.querySelectorAll('.res-mod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mod = btn.dataset.mod;
        const val = parseInt(btn.dataset.val);
        if      (mod === 'res-e2f') this._e2f = val;
        else if (mod === 'res-sc')  this._sc  = val;
        else if (mod === 'res-pmf') this._pmf = val;
        this._clearResults();
        this._updateModUI();
        this._updateInscireBtn();
      });
    });

    // Pool / +1d / D+1
    ['#res-pool', '#res-plus1d', '#res-dplus1'].forEach(id => {
      el.querySelector(id).addEventListener('input', () => {
        this._clearResults();
        this._updateInscireBtn();
      });
    });

    // Metal Faktor
    el.querySelector('#res-mf-count').addEventListener('input', () => this._updateMFUI());
    el.querySelector('#res-mf-violent').addEventListener('change', () => this._updateMFUI());
    el.querySelectorAll('.res-mf-actor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mfActor = btn.dataset.actor;
        if (this._mfActor === 'pj') this._mfDirection = 'pj_to_mj';
        this._updateMFUI();
      });
    });
    el.querySelectorAll('.res-mf-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mfDirection = btn.dataset.dir;
        this._updateMFUI();
      });
    });

    el.querySelector('#res-lancer').addEventListener('click',   () => this._lancerDes());
    el.querySelector('#res-inscrire-manuel').addEventListener('click', () => this._inscrire());
    el.querySelector('#res-succes-manuel').addEventListener('input', () => this._updateInscireBtn());

    this._updateDiffUI();
    this._updateModUI();
    this._updateMFUI();
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────────

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

  _renderDiceRow(containerId, values, mfOffset = values.length) {
    this._el.querySelector(containerId).innerHTML =
      values.map((v, i) => this._diceHTML(v, isSuccess(v, this._diff), i >= mfOffset)).join('');
  }

  _clearResults() {
    this._lastRoll = null;
    this._el.querySelector('#res-results').classList.add('hidden');
  }

  // ── Info compendium de l'action ───────────────────────────────────────────────

  _updateActionInfo() {
    const val  = this._el.querySelector('#res-action').value;
    const info = ACTIONS.find(a => a.value === val);
    const panel = this._el.querySelector('#res-action-info');
    if (!info?.effet) { panel.classList.add('hidden'); this._updateMFUI(); return; }

    panel.classList.remove('hidden');
    this._el.querySelector('#res-info-role').textContent       = info.role        ?? '';
    this._el.querySelector('#res-info-duree').textContent      = info.duree       ?? '';
    this._el.querySelector('#res-info-competence').textContent = info.competence  ?? '';
    this._el.querySelector('#res-info-effet').textContent      = info.effet       ?? '';
    this._el.querySelector('#res-info-violent').classList.toggle('hidden', !info.violent);
    this._el.querySelector('#res-info-accident').classList.toggle('hidden', !info.accidentRisk);
    this._updateMFUI();
  }

  // ── Metal Faktor UI ───────────────────────────────────────────────────────────

  _updateMFUI() {
    const pjEl       = this._el.querySelector('#res-mf-pj');
    const mjEl       = this._el.querySelector('#res-mf-mj');
    const countEl    = this._el.querySelector('#res-mf-count');
    const previewEl  = this._el.querySelector('#res-mf-preview');
    const accidentEl = this._el.querySelector('#res-mf-accident');
    const dirWrap    = this._el.querySelector('#res-mf-direction-wrap');

    // Afficher le pool courant
    if (this._mfPool) {
      pjEl.textContent = this._mfPool.pj_pool;
      mjEl.textContent = this._mfPool.mj_pool;
      // Limiter l'input au pool disponible
      const avail = this._mfDirection === 'mj_to_pj'
        ? this._mfPool.mj_pool
        : this._mfPool.pj_pool;
      countEl.max = avail;
      const cur = parseInt(countEl.value) || 0;
      if (cur > avail) countEl.value = avail;
    }

    // Boutons "Qui agit ?"
    this._el.querySelectorAll('.res-mf-actor-btn').forEach(btn => {
      const active = btn.dataset.actor === this._mfActor;
      btn.className = `res-mf-actor-btn flex-1 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`;
    });

    // Section direction (PNJ uniquement)
    const isPNJ = this._mfActor === 'pnj';
    dirWrap.classList.toggle('hidden', !isPNJ);
    if (!isPNJ) this._mfDirection = 'pj_to_mj';
    this._el.querySelectorAll('.res-mf-dir-btn').forEach(btn => {
      const active = btn.dataset.dir === this._mfDirection;
      btn.className = `res-mf-dir-btn flex-1 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`;
    });

    const mfCount = Math.max(0, parseInt(countEl.value) || 0);
    const violent = this._el.querySelector('#res-mf-violent').checked;
    const transfer = Math.max(0, mfCount - (violent ? 1 : 0));

    if (mfCount > 0) {
      previewEl.classList.remove('hidden');
      const from = this._mfDirection === 'pj_to_mj' ? 'PJ' : 'MJ';
      const to   = this._mfDirection === 'pj_to_mj' ? 'MJ' : 'PJ';
      previewEl.textContent = transfer > 0
        ? `${mfCount} dé${mfCount > 1 ? 's' : ''} MF ajouté${mfCount > 1 ? 's' : ''} au jet · transfert ${transfer} dé${transfer > 1 ? 's' : ''} ${from} → ${to} lors de l'inscription`
        : `${mfCount} dé${mfCount > 1 ? 's' : ''} MF ajouté${mfCount > 1 ? 's' : ''} au jet · aucun transfert (action violente)`;
    } else {
      previewEl.classList.add('hidden');
    }

    // Risque d'accident
    const actionVal = this._el.querySelector('#res-action').value;
    const info      = ACTIONS.find(a => a.value === actionVal);
    const hasRisk   = (info?.accidentRisk ?? false) && mfCount > 0;
    accidentEl.classList.toggle('hidden', !hasRisk);
    if (hasRisk) {
      accidentEl.innerHTML = `🩸 Risque d'accident — ${mfCount} dé${mfCount > 1 ? 's' : ''} MF = <strong>${mfCount} blessure${mfCount > 1 ? 's' : ''} superficielle${mfCount > 1 ? 's' : ''} (${mfCount}S)</strong> au vaisseau, ignorant Blindage et Protection.`;
    }
  }

  _updateDiffUI() {
    this._el.querySelectorAll('.res-diff-btn').forEach(btn => {
      const active = btn.dataset.diff === this._diff;
      btn.className = `res-diff-btn flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
        active ? 'bg-indigo-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`;
    });
  }

  _updateModUI() {
    const net = computeNetMods(this._e2f, this._sc, this._pmf);
    const hasConflict = net.sc > 0 && net.pmf > 0;

    [
      { cls: '.res-e2f-btn', cur: this._e2f, on: 'bg-orange-700 text-white' },
      { cls: '.res-sc-btn',  cur: this._sc,  on: 'bg-green-700  text-white' },
      { cls: '.res-pmf-btn', cur: this._pmf, on: 'bg-blue-700   text-white' },
    ].forEach(({ cls, cur, on }) => {
      this._el.querySelectorAll(cls).forEach(btn => {
        const val    = parseInt(btn.dataset.val);
        const active = val === cur;
        // Reconstruct class preserving the group selector (e.g. 'res-e2f-btn')
        const prefix = btn.id.replace(/-\d+$/, '') + '-btn';
        btn.className = `${prefix} res-mod-btn flex-1 py-1 rounded text-xs font-mono transition-colors ${
          active && val > 0 ? on
          : active          ? 'bg-gray-600 text-white'
          :                   'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`;
      });
    });

    this._el.querySelector('#res-conflict-warn').classList.toggle('hidden', !hasConflict);
    this._el.querySelector('#res-lancer').disabled = hasConflict;
  }

  // ── Logique ──────────────────────────────────────────────────────────────────

  _setMode(mode) {
    this._mode = mode;
    this._clearResults();

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

  async _lancerDes() {
    const poolBase    = Math.max(1, Math.min(20, parseInt(this._el.querySelector('#res-pool').value)      || 3));
    const plus1d      = Math.max(0, Math.min(10, parseInt(this._el.querySelector('#res-plus1d').value)    || 0));
    const diffPlus    = Math.max(0, Math.min(10, parseInt(this._el.querySelector('#res-dplus1').value)    || 0));
    const mfCount     = Math.max(0, Math.min(50, parseInt(this._el.querySelector('#res-mf-count').value)  || 0));
    const regularPool = poolBase + plus1d;
    const totalPool   = regularPool + mfCount;
    const net = computeNetMods(this._e2f, this._sc, this._pmf);

    // ── Étape 1 : jet initial ─────────────────────────────────────────────────
    const initialReg = rollD6(regularPool);
    const initialMF  = rollD6(mfCount);
    const initial    = [...initialReg, ...initialMF];
    let successesNow = initial.filter(v => isSuccess(v, this._diff)).length;
    let failuresNow  = totalPool - successesNow;

    const diffLabels = { normal: 'Normal (4+)', TD: 'TD (6 seul)', TF: 'TF (≠ 1)' };
    this._el.querySelector('#res-diff-badge').textContent = diffLabels[this._diff] ?? '';
    this._renderDiceRow('#res-dice-initial', initial, regularPool);
    const mfSuffix = mfCount > 0 ? ` + ${mfCount}⚡MF` : '';
    this._el.querySelector('#res-base-summary').textContent =
      `${regularPool}d6${mfSuffix} → ${successesNow} succès · ${failuresNow} échec${failuresNow !== 1 ? 's' : ''}`;

    // ── Étape 2 : E2F ─────────────────────────────────────────────────────────
    let e2fResultats = null;
    if (net.e2f > 0 && successesNow > 0) {
      const diceCount = net.e2f >= 2 ? successesNow : 1;
      const rerolled  = rollD6(diceCount);
      const confirmed = rerolled.filter(v => isSuccess(v, this._diff)).length;
      const lost      = diceCount - confirmed;
      e2fResultats  = rerolled;
      successesNow  = (successesNow - diceCount) + confirmed;
      failuresNow   = totalPool - successesNow;

      this._el.querySelector('#res-step-e2f').classList.remove('hidden');
      this._renderDiceRow('#res-dice-e2f', rerolled);
      this._el.querySelector('#res-e2f-summary').textContent =
        net.e2f >= 2
          ? `Relance des ${diceCount} succès : ${confirmed} confirmé${confirmed !== 1 ? 's' : ''}, ${lost} perdu${lost !== 1 ? 's' : ''}`
          : `Relance de 1 succès : ${confirmed > 0 ? 'confirmé' : 'perdu'}`;
    } else {
      this._el.querySelector('#res-step-e2f').classList.add('hidden');
    }

    // ── Étape 3 : SC ou PMF ───────────────────────────────────────────────────
    let bonusResultats = null;
    let bonusType      = null;

    if (net.sc > 0 && failuresNow > 0) {
      const diceCount = net.sc >= 2 ? failuresNow : 1;
      const rerolled  = rollD6(diceCount);
      const newSucc   = rerolled.filter(v => isSuccess(v, this._diff)).length;
      bonusResultats  = rerolled;
      bonusType       = net.sc >= 2 ? 'SC' : 'sc';
      successesNow   += newSucc;

      this._el.querySelector('#res-step-bonus').classList.remove('hidden');
      this._el.querySelector('#res-bonus-label').className   = 'text-xs text-green-400 mb-1.5';
      this._el.querySelector('#res-bonus-label').textContent =
        `🍀 ${bonusType} — relance ${diceCount === 1 ? '1 échec' : `les ${diceCount} échecs`}`;
      this._renderDiceRow('#res-dice-bonus', rerolled);
      this._el.querySelector('#res-bonus-summary').textContent =
        `+${newSucc} succès supplémentaire${newSucc !== 1 ? 's' : ''}`;

    } else if (net.pmf > 0 && successesNow > 0) {
      const diceCount = net.pmf >= 2 ? successesNow : 1;
      const rerolled  = rollD6(diceCount);
      const extras    = rerolled.filter(v => isSuccess(v, this._diff)).length;
      bonusResultats  = rerolled;
      bonusType       = net.pmf >= 2 ? 'PMF' : 'pmf';
      successesNow   += extras;

      this._el.querySelector('#res-step-bonus').classList.remove('hidden');
      this._el.querySelector('#res-bonus-label').className   = 'text-xs text-blue-400 mb-1.5';
      this._el.querySelector('#res-bonus-label').textContent =
        `✨ ${bonusType} — relance ${diceCount === 1 ? '1 succès' : `les ${diceCount} succès`} (bonus possible)`;
      this._renderDiceRow('#res-dice-bonus', rerolled);
      this._el.querySelector('#res-bonus-summary').textContent =
        extras > 0 ? `+${extras} succès bonus` : 'Aucun succès bonus';
    } else {
      this._el.querySelector('#res-step-bonus').classList.add('hidden');
    }

    // ── Total ─────────────────────────────────────────────────────────────────
    const sucColor = successesNow === 0 ? 'text-red-400' : 'text-green-400';
    const sucTitle = successesNow === 0 ? '☠ Échec total' : `${successesNow} succès`;
    const diffHint = diffPlus > 0
      ? ` <span class="text-xs text-gray-400 font-normal">(D+${diffPlus} → ${diffPlus + 1} requis)</span>`
      : '';
    this._el.querySelector('#res-successes').innerHTML =
      `<span class="${sucColor}">${sucTitle}</span>${diffHint}`;

    // ── Accidents MF ─────────────────────────────────────────────────────────
    // Règle : tout dé MF affichant 1 inflige 1S (ignore Blindage & Protection)
    const actionVal   = this._el.querySelector('#res-action').value;
    const actionInfo  = ACTIONS.find(a => a.value === actionVal);
    const mfAccidents = initialMF.filter(v => v === 1).length;
    const stepAcc     = this._el.querySelector('#res-step-mf-accident');
    const detailAcc   = this._el.querySelector('#res-mf-accident-detail');

    if (actionInfo?.accidentRisk && mfCount > 0) {
      stepAcc.classList.remove('hidden');
      if (mfAccidents === 0) {
        detailAcc.innerHTML =
          `${mfCount} dé${mfCount > 1 ? 's' : ''} MF lancé${mfCount > 1 ? 's' : ''} — ` +
          `<span class="text-green-400">aucun 1 → pas de blessure</span>`;
      } else {
        detailAcc.innerHTML =
          `${mfCount} dé${mfCount > 1 ? 's' : ''} MF lancé${mfCount > 1 ? 's' : ''} — ` +
          `<strong class="text-red-300">${mfAccidents} dé${mfAccidents > 1 ? 's' : ''} à 1 → ${mfAccidents}S</strong> ` +
          `<span class="text-gray-400">(ignore Blindage &amp; Protection)</span>`;
      }
    } else {
      stepAcc.classList.add('hidden');
    }

    this._el.querySelector('#res-results').classList.remove('hidden');

    this._lastRoll = {
      pool:           totalPool,
      mfDice:         mfCount || null,
      mfAccidents:    (actionInfo?.accidentRisk && mfCount > 0 && mfAccidents > 0) ? mfAccidents : null,
      difficulte:     this._diff,
      mods:           modsLabel(net) || null,
      diffPlus:       diffPlus || null,
      resultats:      initial,
      e2fResultats,
      bonusResultats,
      bonusType,
      succes:         successesNow,
    };

    // Transfert + inscription immédiats au moment du jet
    if (mfCount > 0) await this._doMFTransfer(mfCount);
    await this._inscrire();
  }

  // ── Transfert Metal Faktor ──────────────────────────────────────────────────────
  async _doMFTransfer(mfCount) {
    const violent    = this._el.querySelector('#res-mf-violent').checked;
    const mfTransfer = Math.max(0, mfCount - (violent ? 1 : 0));
    const _showMFNotif = (cls, msg) => {
      const n = document.createElement('div');
      n.className   = `fixed bottom-4 right-4 ${cls} text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50`;
      n.textContent = msg;
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 6000);
    };
    if (mfTransfer === 0) {
      _showMFNotif('bg-gray-700', `⚡ ${mfCount} dé${mfCount > 1 ? 's' : ''} MF · aucun transfert (action violente)`);
      return;
    }
    try {
      const mfRes = await fetchWithTable('/api/mf-pool/transfer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ delta: mfTransfer, direction: this._mfDirection }),
      });
      const mfJson = await mfRes.json().catch(() => ({}));
      if (mfRes.ok) {
        if (mfJson.data) {
          this._mfPool = mfJson.data;
          this._updateMFUI();
        }
        document.dispatchEvent(new CustomEvent('mf-pool-transferred', { detail: mfJson.data }));
        const from = this._mfDirection === 'pj_to_mj' ? 'PJ' : 'MJ';
        const to   = this._mfDirection === 'pj_to_mj' ? 'MJ' : 'PJ';
        const pj   = mfJson.data?.pj_pool ?? '?';
        const mj   = mfJson.data?.mj_pool ?? '?';
        _showMFNotif('bg-yellow-700', `⚡ ${mfTransfer} dé${mfTransfer > 1 ? 's' : ''} MF transféré${mfTransfer > 1 ? 's' : ''} ${from}→${to} · PJ ${pj} / MJ ${mj}`);
      } else {
        _showMFNotif('bg-red-800', `⚡ Transfert MF impossible (${mfRes.status}${mfJson.error ? ' — ' + mfJson.error : ''})`);
      }
    } catch {
      _showMFNotif('bg-red-800', `⚡ Transfert MF — erreur réseau`);
    }
  }

  _updateInscireBtn() {
    if (this._mode !== 'manuel') return;
    const sel    = this._el.querySelector('#res-action');
    const action = sel.value;
    const canInscrire = action === 'Autre'
      ? Boolean(this._el.querySelector('#res-action-text').value.trim())
      : Boolean(action);
    this._el.querySelector('#res-inscrire-manuel').disabled = !canInscrire;
  }

  async _inscrire() {
    const sel    = this._el.querySelector('#res-action');
    const action = sel.value === 'Autre'
      ? this._el.querySelector('#res-action-text').value.trim()
      : sel.value;
    if (!action) return;

    const acteur = this._el.querySelector('#res-acteur').value.trim() || null;

    let entry;
    if (this._mode === 'des' && this._lastRoll) {
      const roll = this._lastRoll;
      const note = this._el.querySelector('#res-note-des').value.trim() || null;
      entry = {
        id:             Date.now(),
        ts:             new Date().toISOString(),
        action,
        acteur,
        pool:           roll.pool,
        mfDice:         roll.mfDice,
        mfAccidents:    roll.mfAccidents,
        difficulte:     roll.difficulte,
        mods:           roll.mods,
        diffPlus:       roll.diffPlus,
        resultats:      roll.resultats,
        e2fResultats:   roll.e2fResultats,
        bonusResultats: roll.bonusResultats,
        bonusType:      roll.bonusType,
        succes:         roll.succes,
        note,
      };
    } else if (this._mode === 'manuel') {
      const succes = parseInt(this._el.querySelector('#res-succes-manuel').value) || 0;
      const note   = this._el.querySelector('#res-note-manuel').value.trim() || null;
      entry = {
        id:             Date.now(),
        ts:             new Date().toISOString(),
        action,
        acteur,
        pool:           null,
        mfDice:         null,
        mfAccidents:    null,
        difficulte:     null,
        mods:           null,
        diffPlus:       null,
        resultats:      null,
        e2fResultats:   null,
        bonusResultats: null,
        bonusType:      null,
        succes,
        note,
      };
    } else {
      return;
    }

    try {
      const res = await fetchWithTable(`/api/combat-spatial/${this._combatId}/journal`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry),
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
      const errEl = document.createElement('div');
      errEl.className   = 'fixed bottom-4 right-4 bg-red-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50';
      errEl.textContent = `Erreur inscription : ${err.message}`;
      document.body.appendChild(errEl);
      setTimeout(() => errEl.remove(), 4000);
    }
  }

  // ── État initial ──────────────────────────────────────────────────────────────

  _reset() {
    this._el.querySelector('#res-action').value         = '';
    this._el.querySelector('#res-action-info').classList.add('hidden');
    this._el.querySelector('#res-action-libre').classList.add('hidden');
    this._el.querySelector('#res-action-text').value    = '';
    this._el.querySelector('#res-acteur').value         = '';
    this._el.querySelector('#res-pool').value           = '3';
    this._el.querySelector('#res-plus1d').value         = '0';
    this._el.querySelector('#res-dplus1').value         = '0';
    this._el.querySelector('#res-mf-count').value       = '0';
    this._el.querySelector('#res-mf-violent').checked   = false;
    this._el.querySelector('#res-note-des').value       = '';
    this._el.querySelector('#res-succes-manuel').value  = '0';
    this._el.querySelector('#res-note-manuel').value    = '';
    this._el.querySelector('#res-step-e2f').classList.add('hidden');
    this._el.querySelector('#res-step-bonus').classList.add('hidden');
    this._clearResults();
    this._diff = 'normal';
    this._e2f = this._sc = this._pmf = 0;
    this._mfActor     = 'pj';
    this._mfDirection = 'pj_to_mj';
    this._updateDiffUI();
    this._updateModUI();
    this._updateMFUI();
    this._setMode('des');
    this._updateInscireBtn();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

