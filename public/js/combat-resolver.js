/**
 * combat-resolver.js — Résolveur de tests d10 — Combat Spatial
 *
 * Exporte CombatResolver :
 *   - open(combatId, combat) : affiche la modale résolveur
 *   - close()                : ferme la modale
 *
 * Modes :
 *   - Dés virtuels : N d10 (1–16), seuil configurable (1–10),
 *     résultats colorisés, succès = résultats <= seuil
 *   - Manuel       : saisie directe du nb de succès + note libre
 *
 * Émet l'événement custom `journal-entry` sur document
 *   detail : { combatId, entry }
 */

import { fetchWithTable } from '/js/shared/table-selector.js';

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
    this._lastRoll  = null;  // { pool, seuil, resultats, succes }
    this._el        = null;
    this._ensureModal();
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
