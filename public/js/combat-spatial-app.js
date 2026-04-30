/**
 * combat-spatial-app.js — SPA Combat Spatial — Metal Adventures
 */

import { getActiveTableId, fetchWithTable, isMJ } from '/js/shared/table-selector.js';
import { initHeader } from '/js/shared/header.js';
import { CombatRadar } from '/js/combat-radar.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const CONFIGURATIONS = [
  { value: 'face-a-face',          label: 'Face-à-face' },
  { value: 'filature',             label: 'Filature' },
  { value: 'interception-reussie', label: 'Interception réussie' },
  { value: 'interception-ratee',   label: 'Interception ratée' },
  { value: 'accostage',            label: 'Accostage' },
  { value: 'combat-orbital',       label: 'Combat orbital' },
  { value: 'combat-hyperspatial',  label: 'Combat hyperspatial' },
  { value: 'combat-monstrueux',    label: 'Combat monstrueux' },
];

const CHAMPS = [
  { value: 'espace-profond', label: 'Espace profond' },
  { value: 'orbite',         label: 'Orbite planétaire' },
  { value: 'asteroides',     label: 'Astéroïdes' },
  { value: 'hyperespace',    label: 'Hyperespace' },
];

const PHASES = ['approche', 'tournoyant', 'poursuite', 'abordage'];

const PHASE_LABELS = {
  approche:    'Approche',
  tournoyant:  'Combat tournoyant',
  poursuite:   'Poursuite',
  abordage:    'Abordage',
};

const PHASE_ORDER = { approche: 0, tournoyant: 1, poursuite: 2, abordage: 3 };

const CLASSES = ['chasseur', 'frégate', 'croiseur', 'inconnu'];
const CAMPS   = ['joueurs', 'ennemis', 'neutres'];

// ── App ────────────────────────────────────────────────────────────────────────

class CombatSpatialApp {
  constructor() {
    this._currentCombat = null;
    this._radar         = null;
    this._mj            = false;
  }

  async init() {
    const user = await initHeader();
    if (!user) return;

    this._mj = isMJ();

    const tableId = getActiveTableId();
    if (!tableId) {
      this._showNoTable();
      return;
    }

    this._radar = new CombatRadar(document.getElementById('radar-container'));

    this._bindEvents();
    this._updateMJUI();
    await this._loadList();
  }

  // ── Chargement liste ─────────────────────────────────────────────────────────
  async _loadList() {
    const list = document.getElementById('combat-list');
    list.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">Chargement…</p>';

    try {
      const res = await fetchWithTable('/api/combat-spatial');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      const combats = json.data ?? [];
      this._renderList(combats);
    } catch (err) {
      list.innerHTML = `<p class="text-red-400 text-sm text-center py-8">${err.message}</p>`;
    }
  }

  _renderList(combats) {
    const list = document.getElementById('combat-list');

    if (combats.length === 0) {
      list.innerHTML = `
        <p class="text-gray-500 text-sm text-center py-8">
          Aucun combat actif.
          ${this._mj ? '<br><span class="text-xs">Cliquez « + Nouveau » pour commencer.</span>' : ''}
        </p>`;
      return;
    }

    list.innerHTML = '';
    combats.forEach(c => {
      const item = document.createElement('button');
      item.className = 'w-full text-left px-3 py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-750 transition-colors group';
      item.dataset.id = c.id;

      const statusColor = c.statut === 'en_cours' ? 'text-green-400' : 'text-gray-400';
      item.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium text-sm text-gray-200 truncate">${this._esc(c.nom)}</span>
          <span class="text-xs ${statusColor} flex-shrink-0">${this._phaseLabel(c.phase)}</span>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">${this._configLabel(c.configuration)}</div>`;
      item.addEventListener('click', () => this._loadCombat(c.id));
      list.appendChild(item);
    });
  }

  // ── Chargement détail combat ─────────────────────────────────────────────────
  async _loadCombat(id) {
    try {
      const res = await fetchWithTable(`/api/combat-spatial/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      this._currentCombat = json.data;
      this._renderCombat(json.data);

      // Mettre en évidence l'item sélectionné
      document.querySelectorAll('#combat-list button').forEach(btn => {
        btn.classList.toggle('ring-1', btn.dataset.id === id);
        btn.classList.toggle('ring-amber-500', btn.dataset.id === id);
      });
    } catch (err) {
      this._showError(err.message);
    }
  }

  _renderCombat(combat) {
    // Afficher le panneau principal
    document.getElementById('panel-empty').classList.add('hidden');
    document.getElementById('panel-combat').classList.remove('hidden');

    // Titre + badge phase
    document.getElementById('combat-title').textContent = combat.nom;
    this._renderPhaseBadge(combat.phase);
    document.getElementById('combat-config').textContent = this._configLabel(combat.configuration);
    document.getElementById('combat-champ').textContent  = this._champLabel(combat.champ_bataille);

    // Contrôles MJ
    this._renderMJControls(combat);

    // Radar
    this._radar.render(combat);
    this._radar.setEditable(this._mj && combat.statut === 'en_cours');

    // Liste vaisseaux (panneau latéral bas)
    this._renderShipList(combat.vaisseaux ?? []);
  }

  _renderPhaseBadge(phase) {
    const badge = document.getElementById('combat-phase-badge');
    const labels = { approche: 'Approche', tournoyant: 'Combat tournoyant', poursuite: 'Poursuite', abordage: 'Abordage' };
    const colors = { approche: 'bg-blue-800 text-blue-200', tournoyant: 'bg-red-800 text-red-200', poursuite: 'bg-orange-800 text-orange-200', abordage: 'bg-purple-800 text-purple-200' };
    badge.textContent = labels[phase] ?? phase;
    badge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[phase] ?? 'bg-gray-700 text-gray-200'}`;
  }

  _renderMJControls(combat) {
    const controls = document.getElementById('mj-controls');
    if (!this._mj) { controls.innerHTML = ''; return; }

    const nextPhase = PHASES[PHASE_ORDER[combat.phase] + 1];
    const canAdvance = Boolean(nextPhase) && combat.statut === 'en_cours';

    controls.innerHTML = `
      <div class="flex flex-wrap gap-2">
        ${canAdvance ? `
          <button id="btn-next-phase"
            class="px-3 py-1.5 rounded text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white">
            → ${PHASE_LABELS[nextPhase]}
          </button>` : ''}
        <button id="btn-add-ship"
          class="px-3 py-1.5 rounded text-xs font-medium bg-green-800 hover:bg-green-700 text-white">
          + Vaisseau
        </button>
        <button id="btn-delete-combat"
          class="px-3 py-1.5 rounded text-xs font-medium bg-red-900 hover:bg-red-800 text-white ml-auto">
          Supprimer combat
        </button>
      </div>`;

    if (canAdvance) {
      document.getElementById('btn-next-phase').addEventListener('click', () => {
        this._advancePhase(combat.id, nextPhase);
      });
    }
    document.getElementById('btn-add-ship').addEventListener('click', () => {
      this._openAddShipModal(combat.id);
    });
    document.getElementById('btn-delete-combat').addEventListener('click', () => {
      this._deleteCombat(combat.id);
    });
  }

  _renderShipList(ships) {
    const container = document.getElementById('ship-list');
    container.innerHTML = '';

    ships.forEach(ship => {
      const item = document.createElement('div');
      item.className = 'flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm';
      item.dataset.shipId = ship.id;

      const campColor = { joueurs: 'bg-green-500', ennemis: 'bg-red-500', neutres: 'bg-yellow-500' };
      const dot = `<span class="w-2 h-2 rounded-full flex-shrink-0 ${campColor[ship.camp] ?? 'bg-gray-400'}"></span>`;
      const traj = ship.trajectoire === 'attaque' ? '↔' : '↕';
      const pos  = `${ship.position_k}K`;
      const av   = ship.avantage != null ? ` <span class="text-yellow-400 text-xs">AVT${ship.avantage}</span>` : '';
      const cv   = ship.contact_visuel ? ' <span class="text-amber-400 text-[10px]">👁</span>' : '';

      item.innerHTML = `
        ${dot}
        <span class="font-medium text-gray-200 truncate flex-1">${this._esc(ship.nom)}</span>
        <span class="text-gray-500 text-xs font-mono">${traj} ${pos}</span>
        ${av}${cv}
        ${this._mj && this._currentCombat?.statut === 'en_cours' ? `
          <button class="btn-edit-ship text-gray-500 hover:text-gray-200 text-xs ml-1" data-ship-id="${ship.id}">✎</button>
          <button class="btn-remove-ship text-gray-600 hover:text-red-400 text-xs" data-ship-id="${ship.id}">✕</button>
        ` : ''}`;

      container.appendChild(item);
    });

    if (this._mj) {
      container.querySelectorAll('.btn-edit-ship').forEach(btn => {
        btn.addEventListener('click', () => this._openEditShipModal(btn.dataset.shipId));
      });
      container.querySelectorAll('.btn-remove-ship').forEach(btn => {
        btn.addEventListener('click', () => this._removeShip(btn.dataset.shipId));
      });
    }
  }

  // ── Binding événements ────────────────────────────────────────────────────────
  _bindEvents() {
    // Bouton nouveau combat
    const btnNew = document.getElementById('btn-new-combat');
    if (btnNew) btnNew.addEventListener('click', () => this._openNewCombatModal());

    // Fermer modaux
    document.getElementById('modal-close').addEventListener('click', () => this._closeModal('combat-modal'));
    document.getElementById('modal-ship-close').addEventListener('click', () => this._closeModal('ship-modal'));

    // Formulaire nouveau combat
    document.getElementById('form-new-combat').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._createCombat();
    });

    // Formulaire vaisseau
    document.getElementById('form-ship').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._submitShipForm();
    });

    // Drag-drop radar
    const radarEl = document.getElementById('radar-container');
    radarEl.addEventListener('ship-moved', async (e) => {
      const { shipId, trajectoire, position_k } = e.detail;
      await this._moveShip(shipId, trajectoire, position_k);
    });

    radarEl.addEventListener('ship-selected', (e) => {
      if (this._mj && this._currentCombat?.statut === 'en_cours') {
        this._openEditShipModal(e.detail.shipId);
      }
    });
  }

  _updateMJUI() {
    const btnNew = document.getElementById('btn-new-combat');
    if (btnNew) btnNew.style.display = this._mj ? '' : 'none';
  }

  // ── Actions MJ ───────────────────────────────────────────────────────────────
  async _advancePhase(combatId, newPhase) {
    try {
      const res = await fetchWithTable(`/api/combat-spatial/${combatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: newPhase }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      this._currentCombat = json.data;
      this._renderCombat(json.data);
      await this._loadList();
    } catch (err) { this._showError(err.message); }
  }

  async _moveShip(shipId, trajectoire, position_k) {
    if (!this._currentCombat) return;
    try {
      const res = await fetchWithTable(
        `/api/combat-spatial/${this._currentCombat.id}/ships/${shipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoire, position_k }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      // Mise à jour légère : token seul, sans re-render complet
      this._radar.updateShip(json.data);

      // Mettre à jour la liste vaisseaux
      const ships = this._currentCombat.vaisseaux ?? [];
      const idx = ships.findIndex(s => s.id === shipId);
      if (idx >= 0) ships[idx] = json.data;
      this._renderShipList(ships);
    } catch (err) { this._showError(err.message); }
  }

  async _removeShip(shipId) {
    if (!this._currentCombat) return;
    if (!confirm('Retirer ce vaisseau du combat ?')) return;
    try {
      const res = await fetchWithTable(
        `/api/combat-spatial/${this._currentCombat.id}/ships/${shipId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? res.statusText);
      }
      await this._loadCombat(this._currentCombat.id);
    } catch (err) { this._showError(err.message); }
  }

  async _deleteCombat(combatId) {
    if (!confirm('Supprimer ce combat définitivement ?')) return;
    try {
      const res = await fetchWithTable(`/api/combat-spatial/${combatId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? res.statusText);
      }
      this._currentCombat = null;
      document.getElementById('panel-empty').classList.remove('hidden');
      document.getElementById('panel-combat').classList.add('hidden');
      await this._loadList();
    } catch (err) { this._showError(err.message); }
  }

  // ── Modaux ────────────────────────────────────────────────────────────────────
  _openNewCombatModal() {
    const form = document.getElementById('form-new-combat');
    form.reset();
    form.dataset.mode = 'create';

    // Peupler les selects
    const selConfig = document.getElementById('modal-configuration');
    selConfig.innerHTML = CONFIGURATIONS.map(c =>
      `<option value="${c.value}">${c.label}</option>`
    ).join('');

    const selChamp = document.getElementById('modal-champ');
    selChamp.innerHTML = CHAMPS.map(c =>
      `<option value="${c.value}">${c.label}</option>`
    ).join('');

    document.getElementById('modal-title').textContent = 'Nouveau combat spatial';
    this._openModal('combat-modal');
  }

  async _createCombat() {
    const nom    = document.getElementById('modal-nom').value.trim();
    const config = document.getElementById('modal-configuration').value;
    const champ  = document.getElementById('modal-champ').value;
    const notes  = document.getElementById('modal-notes').value.trim();

    if (!nom) return;

    try {
      const res = await fetchWithTable('/api/combat-spatial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, configuration: config, champ_bataille: champ, notes: notes || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      this._closeModal('combat-modal');
      await this._loadList();
      await this._loadCombat(json.data.id);
    } catch (err) { this._showError(err.message); }
  }

  _openAddShipModal(combatId) {
    const form = document.getElementById('form-ship');
    form.reset();
    form.dataset.mode    = 'add';
    form.dataset.combatId = combatId;
    form.dataset.shipId   = '';

    this._populateShipForm({});
    document.getElementById('modal-ship-title').textContent = 'Ajouter un vaisseau';
    this._openModal('ship-modal');
  }

  _openEditShipModal(shipId) {
    if (!this._currentCombat) return;
    const ship = (this._currentCombat.vaisseaux ?? []).find(s => s.id === shipId);
    if (!ship) return;

    const form = document.getElementById('form-ship');
    form.dataset.mode     = 'edit';
    form.dataset.combatId = this._currentCombat.id;
    form.dataset.shipId   = shipId;

    this._populateShipForm(ship);
    document.getElementById('modal-ship-title').textContent = `Modifier : ${ship.nom}`;
    this._openModal('ship-modal');
  }

  _populateShipForm(ship) {
    document.getElementById('ship-nom').value         = ship.nom ?? '';
    document.getElementById('ship-camp').value        = ship.camp ?? 'joueurs';
    document.getElementById('ship-classe').value      = ship.classe ?? 'inconnu';
    document.getElementById('ship-trajectoire').value = ship.trajectoire ?? 'attaque';
    document.getElementById('ship-position').value    = ship.position_k ?? 200;
    document.getElementById('ship-structure-max').value   = ship.structure_max ?? 100;
    document.getElementById('ship-structure-actuelle').value = ship.structure_actuelle ?? 100;
    document.getElementById('ship-avantage').value    = ship.avantage ?? '';
    document.getElementById('ship-contact-visuel').checked = Boolean(ship.contact_visuel);
  }

  async _submitShipForm() {
    const form     = document.getElementById('form-ship');
    const mode     = form.dataset.mode;
    const combatId = form.dataset.combatId;
    const shipId   = form.dataset.shipId;

    const payload = {
      nom:                document.getElementById('ship-nom').value.trim(),
      camp:               document.getElementById('ship-camp').value,
      classe:             document.getElementById('ship-classe').value,
      trajectoire:        document.getElementById('ship-trajectoire').value,
      position_k:         Number(document.getElementById('ship-position').value),
      structure_max:      Number(document.getElementById('ship-structure-max').value),
      structure_actuelle: Number(document.getElementById('ship-structure-actuelle').value),
      avantage:           document.getElementById('ship-avantage').value !== ''
                            ? Number(document.getElementById('ship-avantage').value)
                            : null,
      contact_visuel:     document.getElementById('ship-contact-visuel').checked,
    };

    if (!payload.nom) return;

    try {
      let res;
      if (mode === 'add') {
        res = await fetchWithTable(`/api/combat-spatial/${combatId}/ships`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetchWithTable(`/api/combat-spatial/${combatId}/ships/${shipId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      this._closeModal('ship-modal');
      await this._loadCombat(combatId);
    } catch (err) { this._showError(err.message); }
  }

  _openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
  _closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  _phaseLabel(p)  { return PHASE_LABELS[p]  ?? p; }
  _configLabel(c) { return CONFIGURATIONS.find(x => x.value === c)?.label ?? c; }
  _champLabel(c)  { return CHAMPS.find(x => x.value === c)?.label ?? c; }

  _showNoTable() {
    document.getElementById('combat-list').innerHTML = `
      <p class="text-gray-500 text-sm text-center py-8">
        Sélectionnez une table de jeu<br>pour accéder aux combats.
      </p>`;
  }

  _showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-red-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const app = new CombatSpatialApp();
app.init();
