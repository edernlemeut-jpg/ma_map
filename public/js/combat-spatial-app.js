/**
 * combat-spatial-app.js — SPA Combat Spatial — Metal Adventures
 */

import { getActiveTableId, fetchWithTable, isMJ } from '/js/shared/table-selector.js';
import { initHeader } from '/js/shared/header.js';
import { CombatRadar } from '/js/combat-radar.js';
import { CombatResolver } from '/js/combat-resolver.js';

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
    this._resolver      = null;
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

    this._radar    = new CombatRadar(document.getElementById('radar-container'));
    this._resolver  = new CombatResolver();

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
    document.getElementById('panel-empty').classList.add('hidden');
    document.getElementById('panel-combat').classList.remove('hidden');
    document.body.classList.add('detail-open');

    document.getElementById('combat-title').textContent = combat.nom;
    this._renderPhaseBadge(combat.phase);
    document.getElementById('combat-config').textContent = this._configLabel(combat.configuration);
    document.getElementById('combat-champ').textContent  = this._champLabel(combat.champ_bataille);

    this._renderMJControls(combat);
    this._renderPhaseBody(combat);   // phase-first: creates radar-container + ship-list + Écart
    this._renderJournal(combat.journal ?? []);
  }

  // ── Phase-first body ──────────────────────────────────────────────────────────
  _renderPhaseBody(combat) {
    const phaseBody = document.getElementById('phase-body');
    const ships = combat.vaisseaux ?? [];
    const phase = combat.phase;

    const shipSidebarHtml = `
      <aside class="w-64 flex-shrink-0 border-l border-gray-700 flex flex-col">
        <div class="p-3 border-b border-gray-700">
          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vaisseaux</h3>
        </div>
        <div id="ship-list" class="flex-1 overflow-y-auto p-3 space-y-2 text-sm"></div>
      </aside>`;

    const legendHtml = `
      <div class="flex items-center gap-6 justify-center text-xs text-gray-400">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block"></span> Joueurs</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-red-500 inline-block"></span> Ennemis</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block"></span> Neutres</span>
        <span class="flex items-center gap-1 text-gray-500">Ligne tiretée = contact visuel</span>
      </div>`;

    const radarWrapHtml = `
      <div id="radar-container" class="w-full aspect-square max-w-[600px] mx-auto"></div>
      ${legendHtml}`;

    if (phase === 'approche') {
      phaseBody.innerHTML = `
        <div class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          ${radarWrapHtml}
          <div class="p-3 rounded-lg text-sm" style="background:var(--bg2);border:1px solid var(--border)">
            <p class="text-xs font-semibold uppercase tracking-wide mb-1.5" style="color:var(--gold)">Phase : Approche</p>
            <p class="text-xs leading-relaxed" style="color:var(--text-muted)">Vaisseaux <strong>invisibles</strong> à l'œil nu — senseurs uniquement. Le <strong>Pilote</strong> annonce sa vitesse (multiple de 25K, min 25K). Les autres rôles attendent.<br>Action clé : <strong>Engagement</strong> pour passer en Combat Tournoyant (diff = distance ÷ 25).</p>
          </div>
        </div>
        ${shipSidebarHtml}`;
    } else if (phase === 'tournoyant') {
      phaseBody.innerHTML = `
        <div class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          ${radarWrapHtml}
        </div>
        ${shipSidebarHtml}`;
    } else if (phase === 'poursuite') {
      phaseBody.innerHTML = `
        <div class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--gold)">Phase : Poursuite</p>
            ${this._renderEcartCounter(ships)}
          </div>
          ${radarWrapHtml}
        </div>
        ${shipSidebarHtml}`;
    } else { // abordage
      phaseBody.innerHTML = `
        <div class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          ${radarWrapHtml}
          <div class="p-3 rounded-lg text-sm" style="background:rgba(139,0,0,0.15);border:1px solid #6b0000">
            <p class="text-xs font-semibold uppercase tracking-wide mb-1.5 text-red-400">Phase : Abordage</p>
            <p class="text-xs leading-relaxed" style="color:var(--text-muted)">Fusiliers à bord du vaisseau adverse. Combat personnel en parallèle. Action spéciale : <strong>Stella Special</strong> (amarrage en vol — TD opposé).</p>
          </div>
        </div>
        ${shipSidebarHtml}`;
    }

    // Avantage banner — visible uniquement en Tournoyant
    const banner = document.getElementById('avantage-banner');
    if (banner) {
      banner.classList.toggle('hidden', phase !== 'tournoyant');
      this._renderAvantageBanner(ships);
    }

    // Re-initialiser le radar avec le nouveau container (recréé dans le innerHTML)
    this._radar = new CombatRadar(document.getElementById('radar-container'));
    this._radar.setEditable(this._mj && combat.statut === 'en_cours');
    this._radar.setSensorMode(this._mj);
    this._radar.render(combat);

    // Re-binder les événements radar sur le nouveau container
    this._bindRadarEvents();

    // Remplir la liste vaisseaux dans le nouveau #ship-list
    this._renderShipList(ships);
  }

  _renderAvantageBanner(ships) {
    const container = document.getElementById('avantage-banner-ships');
    if (!container) return;
    const active = ships.filter(s => s.avantage != null && !s.destroyed);
    if (active.length === 0) {
      container.innerHTML = '<span class="text-xs italic" style="color:var(--text-muted)">Aucun avantage actif</span>';
      return;
    }
    const dotColor = { joueurs: '#4ade80', ennemis: '#f87171', neutres: '#facc15' };
    container.innerHTML = active.map(s => `
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded" style="background:rgba(200,148,58,0.1);border:1px solid var(--border)">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor[s.camp] ?? '#9ca3af'}"></span>
        <span class="text-xs font-medium" style="color:var(--text)">${this._esc(s.nom)}</span>
        <span class="text-xs font-bold ml-1" style="color:var(--gold)">AVT ${s.avantage}</span>
      </div>`).join('');
  }

  _renderEcartCounter(ships) {
    const active = ships.filter(s => !s.destroyed);
    if (active.length < 2) {
      return `<p class="text-xs italic" style="color:var(--text-muted)">Ajoutez au moins 2 vaisseaux pour visualiser l'Écart.</p>`;
    }
    const positions = active.map(s => s.position_k);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const ecart  = maxPos - minPos;
    const scale  = Math.max(300, maxPos + 100 - Math.min(0, minPos));
    const normalize = p => ((p - minPos) / scale) * 100;
    const dotColor = { joueurs: '#4ade80', ennemis: '#f87171', neutres: '#facc15' };

    const markers = active.map(s => {
      const pct = normalize(s.position_k);
      const color = dotColor[s.camp] ?? '#9ca3af';
      return `
        <div class="absolute flex flex-col items-center" style="left:${pct}%;transform:translateX(-50%);top:0">
          <span style="font-size:0.6rem;color:${color};max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._esc(s.nom)}</span>
          <div class="w-3 h-3 rounded-full border-2 border-white mt-1" style="background:${color}"></div>
        </div>`;
    }).join('');

    return `
      <div class="p-4 rounded-lg" style="background:var(--bg2);border:1px solid var(--border)">
        <div class="relative w-full" style="height:60px">
          <div class="absolute left-0 right-0 h-1.5 rounded-full" style="top:38px;background:var(--bg3);border:1px solid var(--border)">
            <div class="absolute h-full rounded-full" style="background:rgba(200,148,58,0.35);width:${Math.min(100, (ecart / scale) * 100)}%"></div>
          </div>
          ${markers}
        </div>
        <div class="flex justify-between text-xs mt-2" style="color:var(--text-muted)">
          <span>0K — Réengagement</span>
          <span class="font-bold" style="color:var(--gold)">Écart : ${ecart}K</span>
          <span>→ Liberté</span>
        </div>
        <p class="text-xs mt-1.5 italic" style="color:var(--text-muted)">Écart = 0 → réengagement en Tournoyant · Écart &gt; portée senseurs → vaisseau libre.</p>
      </div>`;
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

    const phaseIdx   = PHASE_ORDER[combat.phase];
    const nextPhase  = PHASES[phaseIdx + 1];
    const prevPhase  = PHASES[phaseIdx - 1];
    const canAdvance = Boolean(nextPhase) && combat.statut === 'en_cours';
    const canRegress = Boolean(prevPhase) && combat.statut === 'en_cours';
    const canResolve = combat.statut === 'en_cours';

    controls.innerHTML = `
      <div class="flex flex-wrap gap-2">
        ${canRegress ? `
          <button id="btn-prev-phase"
            class="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200"
            title="Revenir à la phase précédente (annule le journal de cette phase)">
            ← ${PHASE_LABELS[prevPhase]}
          </button>` : ''}
        ${canAdvance ? `
          <button id="btn-next-phase"
            class="px-3 py-1.5 rounded text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white">
            → ${PHASE_LABELS[nextPhase]}
          </button>` : ''}
        <button id="btn-add-ship"
          class="px-3 py-1.5 rounded text-xs font-medium bg-green-800 hover:bg-green-700 text-white">
          + Vaisseau
        </button>
        ${canResolve ? `
          <button id="btn-resolve"
            class="px-3 py-1.5 rounded text-xs font-medium bg-indigo-700 hover:bg-indigo-600 text-white">
            🎲 Résoudre
          </button>` : ''}
        <button id="btn-delete-combat"
          class="px-3 py-1.5 rounded text-xs font-medium bg-red-900 hover:bg-red-800 text-white ml-auto">
          Supprimer
        </button>
      </div>`;

    if (canRegress) {
      document.getElementById('btn-prev-phase').addEventListener('click', () => {
        this._regressPhase(combat.id, prevPhase);
      });
    }
    if (canAdvance) {
      document.getElementById('btn-next-phase').addEventListener('click', () => {
        this._advancePhase(combat.id, nextPhase);
      });
    }
    document.getElementById('btn-add-ship').addEventListener('click', () => {
      this._openAddShipModal(combat.id);
    });
    if (document.getElementById('btn-resolve')) {
      document.getElementById('btn-resolve').addEventListener('click', () => {
        this._resolver.open(combat.id);
      });
    }
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
    const btnNew = document.getElementById('btn-new-combat');
    if (btnNew) btnNew.addEventListener('click', () => this._openNewCombatModal());

    document.getElementById('modal-close').addEventListener('click', () => this._closeModal('combat-modal'));
    document.getElementById('modal-ship-close').addEventListener('click', () => this._closeModal('ship-modal'));

    document.getElementById('form-new-combat').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._createCombat();
    });

    document.getElementById('form-ship').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._submitShipForm();
    });

    document.addEventListener('journal-entry', (e) => {
      if (e.detail.combatId === this._currentCombat?.id) {
        this._prependJournalEntry(e.detail.entry);
      }
    });

    // Pré-remplissage depuis la flotte
    document.getElementById('ship-fleet-select').addEventListener('change', (e) => {
      const selected = e.target.options[e.target.selectedIndex];
      if (selected.value && selected.dataset.ship) {
        this._prefillFromFleet(selected.dataset.ship);
      }
    });

    // Note: radar events are bound in _bindRadarEvents() after each _renderPhaseBody()
  }

  // Rebind radar drag/select events after phase-body re-render (container is recreated)
  _bindRadarEvents() {
    const radarEl = document.getElementById('radar-container');
    if (!radarEl) return;
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
    if (btnNew) {
      if (this._mj) {
        btnNew.classList.remove('hidden');
      } else {
        btnNew.classList.add('hidden');
      }
    }
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

  async _regressPhase(combatId, prevPhase) {
    const label = PHASE_LABELS[prevPhase] ?? prevPhase;
    if (!confirm(`Revenir à la phase « ${label} » ?\nLes entrées du journal depuis la dernière transition seront supprimées.`)) return;
    try {
      const res = await fetchWithTable(`/api/combat-spatial/${combatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: prevPhase, force: true }),
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
      document.body.classList.remove('detail-open'); // mobile : retour liste
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

  async _openAddShipModal(combatId) {
    const form = document.getElementById('form-ship');
    form.reset();
    form.dataset.mode    = 'add';
    form.dataset.combatId = combatId;
    form.dataset.shipId   = '';

    this._populateShipForm({});
    document.getElementById('modal-ship-title').textContent = 'Ajouter un vaisseau';

    // Afficher + charger la flotte
    const section = document.getElementById('fleet-select-section');
    section.classList.remove('hidden');
    await this._loadFleetSelect();

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

    // Masquer la section flotte en mode édition
    document.getElementById('fleet-select-section').classList.add('hidden');

    this._populateShipForm(ship);
    document.getElementById('modal-ship-title').textContent = `Modifier : ${ship.nom}`;
    this._openModal('ship-modal');
  }

  async _loadFleetSelect() {
    const sel = document.getElementById('ship-fleet-select');
    sel.innerHTML = '<option value="">— Chargement… —</option>';
    try {
      const res = await fetchWithTable('/api/ships');
      const json = await res.json();
      const ships = json.data ?? json ?? [];
      sel.innerHTML = '<option value="">— Saisie manuelle —</option>';
      ships.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        const classeLabel = s.model?.classe ? ` (${s.model.classe})` : '';
        opt.textContent = `${s.name}${classeLabel}`;
        opt.dataset.ship = JSON.stringify(s);
        sel.appendChild(opt);
      });
      if (ships.length === 0) {
        sel.innerHTML += '<option value="" disabled>Aucun vaisseau dans la flotte</option>';
      }
    } catch {
      sel.innerHTML = '<option value="">— Erreur chargement flotte —</option>';
    }
  }

  _prefillFromFleet(fleetShipJson) {
    let s;
    try { s = JSON.parse(fleetShipJson); } catch { return; }
    const COMBAT_CLASSES = ['chasseur', 'frégate', 'croiseur'];
    const rawClasse = (s.model?.classe ?? '').toLowerCase();
    const classe = COMBAT_CLASSES.find(c => rawClasse.includes(c)) ?? 'inconnu';
    const coqueMax = s.model?.coque ?? 100;
    const sensK = s.model?.senseurs_k ?? null;
    this._populateShipForm({
      nom:               s.name,
      classe,
      structure_max:     coqueMax,
      structure_actuelle: coqueMax,
      senseurs_k:        sensK,
    });
  }

  _populateShipForm(ship) {
    document.getElementById('ship-nom').value         = ship.nom ?? '';
    document.getElementById('ship-camp').value        = ship.camp ?? 'joueurs';
    document.getElementById('ship-classe').value      = ship.classe ?? 'inconnu';
    document.getElementById('ship-trajectoire').value = ship.trajectoire ?? 'attaque';
    document.getElementById('ship-position').value    = ship.position_k ?? 200;
    document.getElementById('ship-structure-max').value   = ship.structure_max ?? 100;
    document.getElementById('ship-structure-actuelle').value = ship.structure_actuelle ?? 100;
    document.getElementById('ship-senseurs-k').value  = ship.senseurs_k ?? '';
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
      senseurs_k: document.getElementById('ship-senseurs-k').value !== ''
                    ? Number(document.getElementById('ship-senseurs-k').value)
                    : null,
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

  // ── Journal ───────────────────────────────────────────────────────────────────

  _renderJournal(entries) {
    const panel = document.getElementById('journal-panel');
    if (!panel) return;

    if (!entries || entries.length === 0) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    const list = document.getElementById('journal-list');
    list.innerHTML = '';
    entries.forEach(e => list.appendChild(this._buildJournalItem(e)));
  }

  _prependJournalEntry(entry) {
    const panel = document.getElementById('journal-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const list = document.getElementById('journal-list');
    list.insertBefore(this._buildJournalItem(entry), list.firstChild);
  }

  _buildJournalItem(e) {
    const li = document.createElement('li');
    // Phase transition entries get a distinct style
    if (e.action === '__phase_transition__') {
      li.className = 'px-3 py-1.5 rounded text-xs flex items-center gap-2';
      li.style.cssText = 'background:rgba(200,148,58,0.08);border:1px solid var(--gold-dim);color:var(--gold)';
      const ts = e.ts ? new Date(e.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
      li.innerHTML = `<span class="font-mono" style="color:var(--text-muted)">[${ts}]</span> <span>${this._esc(e.note ?? e.action)}</span>`;
      return li;
    }
    li.className = 'px-3 py-2 rounded border border-gray-700 text-sm space-y-0.5';

    const ts     = e.ts ? new Date(e.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const acteur = e.acteur ? ` — <span class="text-gray-400">${this._esc(e.acteur)}</span>` : '';
    const succes = e.succes != null
      ? `<span class="${e.succes === 0 ? 'text-red-400' : 'text-green-400'} font-semibold">${e.succes} succès</span>`
      : '';
    let poolLabel;
    if (e.pool == null) {
      poolLabel = '<span class="text-gray-500 text-xs">Manuel</span>';
    } else if (e.difficulte) {
      const diffStr  = e.difficulte === 'normal' ? '4+' : e.difficulte;
      const modsStr  = e.mods ? ` [${this._esc(e.mods)}]` : '';
      const mfStr    = e.mfDice ? ` <span class="text-yellow-400">+${e.mfDice}⚡</span>` : '';
      poolLabel = `<span class="text-gray-500 text-xs">${e.pool}d6 ${diffStr}${modsStr}${mfStr}</span>`;
    } else {
      const seuilStr = e.seuil != null ? `d10 ≤${e.seuil}` : 'd6';
      poolLabel = `<span class="text-gray-500 text-xs">${e.pool}${seuilStr}</span>`;
    }
    const pool = poolLabel;
    const note = e.note
      ? `<div class="text-xs text-gray-500 italic">${this._esc(e.note)}</div>`
      : '';

    // Affichage des dés (résultats bruts)
    let diceRow = '';
    if (Array.isArray(e.resultats) && e.resultats.length > 0) {
      const mfOffset = (e.resultats.length) - (e.mfDice || 0);
      const dice = e.resultats.map((v, i) => {
        const isMF  = i >= mfOffset;
        const isSucc = e.difficulte === 'TF' ? (v >= 6) : e.difficulte === 'TD' ? (v >= 5) : (v >= 4);
        const bg = isMF
          ? (isSucc ? 'bg-green-900 border-yellow-500 text-yellow-200' : 'bg-red-950 border-yellow-700 text-red-400')
          : (isSucc ? 'bg-green-900 border-green-600 text-green-200'   : 'bg-gray-800 border-gray-600 text-gray-400');
        return `<span class="inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-mono font-bold ${bg}">${isMF ? '⚡' : ''}${v}</span>`;
      }).join('\u200b');
      diceRow = `<div class="flex flex-wrap gap-0.5 mt-1">${dice}</div>`;
    }

    // Dégâts accident MF
    const accidentRow = (e.mfAccidents > 0)
      ? `<div class="text-xs text-red-400 mt-0.5">🩸 ${e.mfAccidents}S — dés MF ⚡ à 1 (ignore Blindage)</div>`
      : '';

    li.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-gray-500 font-mono text-xs">[${ts}]</span>
        <span class="font-medium text-gray-200">${this._esc(e.action)}</span>${acteur}
        ${pool}
        ${succes}
      </div>
      ${diceRow}
      ${accidentRow}
      ${note}`;
    return li;
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

