/**
 * revolte-app.js — Gestion des Révoltes Metal Adventures
 * Architecture: sessions persistantes via API + logique de calcul locale
 */
import { initHeader } from '/js/shared/header.js';
import { fetchWithTable, isMJ, getActiveTableId } from '/js/shared/table-selector.js';
import { DiceRollerModal } from '/js/shared/dice-roller.js';

// ── Dice roller singleton ──────────────────────────────────────────────────────
let _roller = null;
function getRoller() { if (!_roller) _roller = new DiceRollerModal(); return _roller; }

/**
 * Returns { diff, title, comp } for a given test input id, computed from current state.
 * diff may be a number or 'TD'/'TF'.
 */
function getDiffForInput(inputId) {
  const malus    = getMalus();
  const securite = state.securitePlanetaire;
  const rev      = state.revolution;
  const qgMalus  = rev.powerPlaces.filter(p => p.isQG && !p.isCaptured).length;
  const prepMalus = malus + qgMalus;

  const invDiff = { 10: 1, 100: 3, 1000: 5, 10000: 8 };

  switch (inputId) {
    case 'propagandeSuccesInput':
      return { diff: 1 + malus, title: 'Propagande', comp: 'Propagande' };
    case 'eloquencePropagandeInput':
      return { diff: 3 + malus, title: 'Éloquence (Propagande)', comp: 'Éloquence' };
    case 'empathieTestInput':
      return { diff: 1 + malus, title: 'Empathie', comp: 'Empathie' };
    case 'tactiqueTestInput':
      return { diff: 1 + malus, title: 'Tactique', comp: 'Tactique' };
    case 'discoursTestInput':
      return { diff: securite + malus, title: 'Éloquence (Discours)', comp: 'Éloquence' };
    case 'autorisationTestSucces':
      return { diff: securite + malus, title: 'Autorisation', comp: state.festive.lieuFete === 'lieu_illegale' ? 'Illégalités' : 'Étiquette' };
    case 'rassemblementTestSucces':
      return { diff: 3 + malus, title: 'Rassemblement', comp: 'Étiquette' };
    case 'preparerLieuTestSucces': {
      const lf = state.festive.lieuFete;
      const prepComp = lf === 'vaisseau_nature' ? 'Environnement'
                     : lf === 'lieu_illegale'   ? 'Illégalités'
                     : 'Étiquette';
      return { diff: (invDiff[state.festive.nbInvites] || 1) + malus, title: 'Préparer le Lieu', comp: prepComp };
    }
    case 'appelFestiveSucces':
      return { diff: (invDiff[state.festive.nbInvites] || 1) + malus, title: 'Appel Festive', comp: 'Éloquence' };
    case 'mutinerieEloquencePoste':
      return { diff: 3, title: 'Éloquence (Poste)', comp: 'Éloquence' };
    case 'mutinerieEloquenceCambuse':
      return { diff: 2, title: 'Éloquence (Cambuse)', comp: 'Éloquence' };
    case 'mutinerieDiscretion':
      return { diff: 1, title: 'Discrétion', comp: 'Discrétion' };
    case 'mutinerieTactique':
      return { diff: 3, title: 'Tactique (Planification)', comp: 'Tactique' };
    case 'mutinerieAppelSucces':
      return { diff: parseInt(state.mutinerie.location, 10) || 1, title: 'Appel à la Mutinerie', comp: 'Éloquence' };
    case 'recrutementSucces':
      return { diff: securite + prepMalus, title: 'Recrutement', comp: 'Éloquence' };
    case 'discoursPeupleSucces':
      return { diff: securite + prepMalus, title: 'Discours de Rue', comp: 'Éloquence' };
    case 'tractsPeupleSucces':
      return { diff: securite + prepMalus, title: 'Tracts et Affiches', comp: 'Propagande' };
    case 'comprehensionPeupleSucces':
      return { diff: 3 + prepMalus, title: 'Compréhension du Peuple', comp: 'Sciences Solaires' };
    case 'appelRevolteSucces':
      return { diff: securite + malus, title: 'Appel à la Révolte', comp: 'Éloquence' };
    case 'intimidationRedditionSucces': {
      const capturedCount = rev.powerPlaces.filter(p => p.isCaptured).length;
      const totalPlaces   = rev.powerPlaces.length;
      let d = securite + malus;
      if (totalPlaces > 0) {
        if (capturedCount === totalPlaces)         d = 0;
        else if (capturedCount >= totalPlaces / 2) d = securite + malus + 1;
        else if (capturedCount > 0)                d = 'TD';
      }
      return { diff: d, title: 'Reddition des Autorités', comp: 'Intimidation' };
    }
    case 'sciencesSolairesSucces':
      return { diff: 3 + state.propagande.bonusJets, title: 'Prévisions', comp: 'Sciences Solaires' };
    default: return null;
  }
}

/**
 * Opens DiceRollerModal for a test input, writes result.succes back on confirm.
 */
function openRollForInput(inputId) {
  if (!currentSessionId) return;
  const info = getDiffForInput(inputId);
  if (!info) return;
  const diffNum = typeof info.diff === 'number' ? info.diff : null;
  getRoller().open({
    title:    info.title,
    context:  info.comp,
    diff:     info.diff,
    lockDiff: true,
    onResult: (result) => {
      const el = document.getElementById(inputId);
      if (el) {
        el.value = result.succes ?? 0;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  });
}

// ── World data caches ──────────────────────────────────────────────────────────
let _worldSystems = null; // [{id, quadrant, nom, faction, ...}]
let _worldPlanets = {};   // {systemId: [{id, nom, population, gouvernement, ...}]}
let _worldShips   = null; // [{id, name, model_name, model_tonnage, ...}]
let _worldCharacters = null; // [{id, name, type}]

async function ensureWorldSystems() {
  if (_worldSystems !== null) return _worldSystems;
  _worldSystems = await apiFetch('/api/systems').catch(() => []);
  if (!Array.isArray(_worldSystems)) _worldSystems = [];
  return _worldSystems;
}

async function ensurePlanets(systemId) {
  if (_worldPlanets[systemId]) return _worldPlanets[systemId];
  const data = await apiFetch(`/api/planets?system_id=${systemId}`).catch(() => []);
  _worldPlanets[systemId] = Array.isArray(data) ? data : [];
  return _worldPlanets[systemId];
}

async function ensureShips() {
  if (_worldShips !== null) return _worldShips;
  _worldShips = await apiFetch('/api/ships').catch(() => []);
  if (!Array.isArray(_worldShips)) _worldShips = [];
  return _worldShips;
}

async function ensureCharacters() {
  if (_worldCharacters !== null) return _worldCharacters;
  _worldCharacters = await apiFetch('/api/characters').catch(() => []);
  if (!Array.isArray(_worldCharacters)) _worldCharacters = [];
  return _worldCharacters;
}

/** Returns what kind of location selector to show based on revolt type and revolution scope. */
function getLocationType() {
  if (state.revolteType === 'mutinerie') return 'ship';
  if (state.revolteType === 'revolution') {
    if (state.revolution.scope === 'stellaire') return 'quadrant';
    if (state.revolution.scope === 'locale')    return 'system';
  }
  return 'planet';
}

/** Builds a human-readable location reference string for saving. */
function computeLocationRef() {
  const t  = getLocationType();
  const lr = state.locationRef;
  if (t === 'ship')     return lr.shipNom || '';
  if (t === 'planet')   return [lr.planetNom, lr.systemNom, lr.quadrant].filter(Boolean).join(', ');
  if (t === 'system')   return [lr.systemNom, lr.quadrant].filter(Boolean).join(', ');
  if (t === 'quadrant') return lr.quadrant || '';
  return '';
}

/** Syncs visibility of location selector groups based on current type (sync only). */
function buildLocationUI() {
  const t    = getLocationType();
  const geo  = document.getElementById('loc-geo-group');
  const ship = document.getElementById('loc-ship-group');
  const leg  = document.getElementById('location-selector-legend');
  const popR = document.getElementById('loc-population-row');
  if (t === 'ship') {
    geo?.classList.add('hidden');
    ship?.classList.remove('hidden');
    if (leg) leg.textContent = 'Vaisseau Impliqué';
    popR?.classList.add('hidden');
  } else {
    geo?.classList.remove('hidden');
    ship?.classList.add('hidden');
    popR?.classList.remove('hidden');
    const legends = { planet: 'Planète de la Révolte', system: 'Système de la Révolte', quadrant: 'Secteur / Quadrant' };
    if (leg) leg.textContent = legends[t] || 'Lieu de la Révolte';
  }
  // Fire-and-forget async populate
  refreshLocationSelects();
}

/** Async: populate cascaded selects from cached/fetched world data. */
async function refreshLocationSelects() {
  const t  = getLocationType();
  const lr = state.locationRef;

  if (t === 'ship') {
    const ships = await ensureShips();
    const sel = document.getElementById('loc-ship');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Sélectionner un vaisseau —</option>' +
      ships.map(s => {
        const label = escHtml(s.name || '') +
          (s.model_name ? ` (${escHtml(s.model_name)})` : '') +
          (s.model_tonnage ? ` · ${Number(s.model_tonnage).toLocaleString('fr-FR')}t` : '');
        return `<option value="${escHtml(String(s.id))}" ${String(s.id) === String(lr.shipId) ? 'selected' : ''}>${label}</option>`;
      }).join('');
    updateLocationInfo();
    return;
  }

  const systems   = await ensureWorldSystems();
  const quadrants = [...new Set(systems.map(s => s.quadrant).filter(Boolean))].sort();
  const qSel = document.getElementById('loc-quadrant');
  if (!qSel) return;
  qSel.innerHTML = '<option value="">— Tous les quadrants —</option>' +
    quadrants.map(q => `<option value="${escHtml(q)}" ${q === lr.quadrant ? 'selected' : ''}>${escHtml(q)}</option>`).join('');

  const sRow = document.getElementById('loc-system-row');
  const sSel = document.getElementById('loc-system');
  if (lr.quadrant && t !== 'quadrant') {
    sRow?.classList.remove('hidden');
    const filtered = systems.filter(s => s.quadrant === lr.quadrant);
    if (sSel) {
      sSel.innerHTML = '<option value="">— Choisir un système —</option>' +
        filtered.map(s => `<option value="${s.id}" ${s.id === lr.systemId ? 'selected' : ''}>${escHtml(s.nom)}</option>`).join('');
    }
  } else {
    sRow?.classList.toggle('hidden', !lr.quadrant || t === 'quadrant');
    if (sSel) sSel.innerHTML = '<option value="">— Choisir un système —</option>';
  }

  const pRow = document.getElementById('loc-planet-row');
  const pSel = document.getElementById('loc-planet');
  if (lr.systemId && t === 'planet') {
    const planets = await ensurePlanets(lr.systemId);
    pRow?.classList.remove('hidden');
    if (pSel) {
      pSel.innerHTML = '<option value="">— Choisir une planète —</option>' +
        planets.map(p => `<option value="${escHtml(String(p.id))}" ${String(p.id) === String(lr.planetId) ? 'selected' : ''}>${escHtml(p.nom)}</option>`).join('');
    }
  } else {
    pRow?.classList.add('hidden');
    if (pSel) pSel.innerHTML = '<option value="">— Choisir une planète —</option>';
  }

  updateLocationInfo();
}

/** Update the info box and auto-fill population/tonnage from selected location. */
async function updateLocationInfo() {
  const t    = getLocationType();
  const lr   = state.locationRef;
  const info = document.getElementById('location-info');
  const popL = document.getElementById('loc-pop-auto');
  const secL = document.getElementById('loc-sec-auto');
  if (!info) return;

  if (t === 'ship') {
    const ship = (_worldShips || []).find(s => String(s.id) === String(lr.shipId));
    if (ship) {
      const tonnage = Number(ship?.model?.tonnage) || 0;
      const meta = [ship.model_name, tonnage ? `${tonnage.toLocaleString('fr-FR')}t` : ''].filter(Boolean);
      info.innerHTML = `<strong>${escHtml(ship.name || '')}</strong>${meta.length ? ' — ' + meta.map(escHtml).join(' · ') : ''}`;
      info.classList.remove('hidden');
      // Auto-fill mutinerie tonnage selector + verrouille (la donnée vient du vaisseau)
      const closest = tonnage >= 50000 ? 100000 : tonnage >= 5000 ? 10000 : tonnage >= 500 ? 1000 : 100;
      const tonSel  = document.getElementById('mutinerieTonnage');
      if (tonSel) {
        tonSel.value = String(closest);
        tonSel.disabled = true;
        tonSel.title = `Tonnage verrouillé sur le vaisseau « ${ship.name} » (${tonnage}t)`;
        state.mutinerie.tonnage = closest;
        // Déclenche la mise à jour de l'UI Mutinerie
        if (typeof updateMutinerieUI === 'function') updateMutinerieUI();
      }
    } else {
      info.classList.add('hidden');
      const tonSel = document.getElementById('mutinerieTonnage');
      if (tonSel) { tonSel.disabled = false; tonSel.title = ''; }
    }
    return;
  }

  if (t === 'planet' && lr.planetId) {
    const planets = _worldPlanets[lr.systemId] || [];
    const planet  = planets.find(p => String(p.id) === String(lr.planetId));
    if (planet) {
      const pop = parseFloat(planet.population) || 0;
      setVal('populationInput', pop);
      state.population = pop;
      if (popL) popL.textContent = '— auto';

      // auto-fill sécurité if provided in corps_celestes_json
      if (planet.securite != null && !isNaN(Number(planet.securite))) {
        const sec = Number(planet.securite);
        setVal('securitePlanetaireInput', sec);
        state.securitePlanetaire = sec;
        if (secL) secL.textContent = '— auto';
      } else {
        if (secL) secL.textContent = '';
      }

      const meta = [planet.type, planet.atmosphere, planet.gouvernement ? `Gouv: ${planet.gouvernement}` : ''].filter(Boolean);
      info.innerHTML = `<strong>${escHtml(planet.nom)}</strong>${meta.length ? ' — ' + meta.map(escHtml).join(' · ') : ''}`;
      info.classList.remove('hidden');
      return;
    }
  } else if (t === 'system' && lr.systemId) {
    const sys     = (_worldSystems || []).find(s => s.id === lr.systemId);
    const planets = await ensurePlanets(lr.systemId);
    const totalPop = planets.reduce((sum, p) => sum + (parseFloat(p.population) || 0), 0);
    if (totalPop > 0) {
      setVal('populationInput', totalPop);
      state.population = totalPop;
      if (popL) popL.textContent = `— auto (${planets.length} planètes)`;
    }
    if (secL) secL.textContent = '';
    if (sys) {
      const meta = [sys.faction, planets.length > 0 ? `${planets.length} planètes, ~${totalPop}md hab.` : ''].filter(Boolean).map(escHtml);
      info.innerHTML = `<strong>${escHtml(sys.nom)}</strong>${meta.length ? ' — ' + meta.join(' · ') : ''}`;
      info.classList.remove('hidden');
      return;
    }
  } else if (t === 'quadrant' && lr.quadrant) {
    const systems   = (_worldSystems || []).filter(s => s.quadrant === lr.quadrant);
    const allPlanets = (await Promise.all(systems.map(s => ensurePlanets(s.id)))).flat();
    const totalPop  = allPlanets.reduce((sum, p) => sum + (parseFloat(p.population) || 0), 0);
    if (totalPop > 0) {
      setVal('populationInput', totalPop);
      state.population = totalPop;
      if (popL) popL.textContent = `— auto (${systems.length} systèmes, ${allPlanets.length} planètes)`;
    }
    if (secL) secL.textContent = '';
    info.innerHTML = `Quadrant <strong>${escHtml(lr.quadrant)}</strong> — ${systems.length} systèmes, ~${totalPop.toLocaleString('fr-FR')}md hab.`;
    info.classList.remove('hidden');
    return;
  }

  info.classList.add('hidden');
  if (popL) popL.textContent = '';
  if (secL) secL.textContent = '';
}

// ── Participant lists (Porte-Drapeau / Officiers) ──────────────────────────────

const PD_CATS = ['locaux', 'pirates', 'autres', 'officiers'];

function getPdList(cat) {
  if (cat === 'officiers') return state.officiersList;
  return state.pdList[cat];
}

function syncPdCount(cat) {
  const list = getPdList(cat);
  if (cat === 'officiers') {
    state.officiers = list.length;
  } else {
    state.pd[cat] = list.length;
  }
  const countEl = document.getElementById(`pdCount-${cat}`);
  if (countEl) countEl.textContent = list.length ? `(${list.length})` : '';
}

function renderPdChips(cat) {
  const list = getPdList(cat);
  const wrap = document.getElementById(`pdChips-${cat}`);
  if (!wrap) return;
  wrap.innerHTML = list.map((entry, idx) => {
    const typeBadge = entry.type ? `<span class="pd-type-badge">${escHtml(entry.type)}</span>` : '';
    return `<span class="pd-chip" data-cat="${cat}" data-idx="${idx}">
      ${typeBadge}${escHtml(entry.nom)}
      <button type="button" data-cat="${cat}" data-idx="${idx}" title="Retirer">×</button>
    </span>`;
  }).join('');
}

function renderAllPdLists() {
  PD_CATS.forEach(cat => {
    syncPdCount(cat);
    renderPdChips(cat);
  });
}

function addPdMember(cat, nom, type, charId) {
  nom = (nom || '').trim();
  if (!nom) return;
  const list = getPdList(cat);
  // Avoid double-adding the same named character
  if (charId && list.some(e => e.charId === charId)) return;
  list.push({ nom, type: type || null, charId: charId || null });
  syncPdCount(cat);
  renderPdChips(cat);
  updateUI();
  scheduleAutosave();
}

function removePdMember(cat, idx) {
  const list = getPdList(cat);
  list.splice(idx, 1);
  syncPdCount(cat);
  renderPdChips(cat);
  updateUI();
  scheduleAutosave();
}

async function populatePdSelects() {
  const chars = await ensureCharacters();
  PD_CATS.forEach(cat => {
    const sel = document.getElementById(`pdSelect-${cat}`);
    if (!sel) return;
    // Keep placeholder option, rebuild rest
    sel.innerHTML = '<option value="">— PJ / PNJ —</option>' +
      chars.map(c => `<option value="${escHtml(c.id)}">[${escHtml(c.type.toUpperCase())}] ${escHtml(c.name)}</option>`).join('');
  });
}


const POPULATION_DATA = [
  { pop: 0,      insurgents: 25000,   sections: 3   },
  { pop: 1,      insurgents: 50000,   sections: 5   },
  { pop: 5,      insurgents: 75000,   sections: 8   },
  { pop: 7,      insurgents: 100000,  sections: 10  },
  { pop: 10,     insurgents: 125000,  sections: 13  },
  { pop: 15,     insurgents: 150000,  sections: 15  },
  { pop: 25,     insurgents: 250000,  sections: 25  },
  { pop: 50,     insurgents: 350000,  sections: 35  },
  { pop: 100,    insurgents: 500000,  sections: 50  },
  { pop: 250,    insurgents: 750000,  sections: 75  },
  { pop: 500,    insurgents: 1000000, sections: 100 },
  { pop: 1000,   insurgents: 1250000, sections: 125 },
  { pop: 2500,   insurgents: 1500000, sections: 150 },
  { pop: 5000,   insurgents: 2000000, sections: 200 },
  { pop: 10000,  insurgents: 2500000, sections: 250 },
  { pop: 25000,  insurgents: 3000000, sections: 300 },
  { pop: 50000,  insurgents: 3500000, sections: 350 },
];

const TROOP_QUALITY_LEVELS = {
  '2':  { label: 'Excellente (TF)',    color: 'text-green-400' },
  '1':  { label: 'Bonne (+1d)',        color: 'text-green-500' },
  '0':  { label: 'Standard',          color: 'text-gray-300' },
  '-1': { label: 'Médiocre (D+1)',     color: 'text-red-400' },
  '-2': { label: 'Très Mauvaise (TD)', color: 'text-red-500' },
};

const TYPE_LABELS = {
  emeute:     'Émeute Pirate',
  festive:    'Révolution Festive',
  mutinerie:  'Mutinerie',
  revolution: 'Révolution',
};

const TYPE_COLORS = {
  emeute:     'text-orange-400',
  festive:    'text-purple-400',
  mutinerie:  'text-red-400',
  revolution: 'text-blue-400',
};

const STATUS_LABELS = {
  en_cours:  '⚡ En cours',
  reussie:   '✅ Réussie',
  echouee:   '❌ Échouée',
  archivee:  '📦 Archivée',
};

// ── State ──────────────────────────────────────────────────────────────────────
let currentSessionId = null;
let currentUserIsMJ  = false;
let autosaveTimer    = null;

function defaultState() {
  return {
    currentStepIndex: 0,
    revolteType: 'emeute',
    population: 1.0,
    securitePlanetaire: 5,
    qgFactionsOnPlanet: 0,
    locationRef: { quadrant: '', systemId: null, systemNom: '', planetId: null, planetNom: '', shipId: null, shipNom: '' },
    stellaPropagande: { porteDrapeau: false, connu: false, morte: false },
    propagande: {
      gloire7: false, filme: false, pub: false,
      propagandeSucces: 1, eloquenceSucces: 3,
      bonusJets: 0, bonusDuree: 0,
    },
    propagandeGenerale: { portee: 'planete', succesExc: 0, choix: 'bonus' },
    ppLedger: [],
    pd:       { locaux: 0, pirates: 0, autres: 0 },
    pdList:   { locaux: [], pirates: [], autres: [] },
    officiers: 0,
    officiersList: [],
    emeute:   {
      grandLieu: false, empathieSucces: 1, tactiqueSucces: 1, discoursSucces: 5,
      inRun: { tranches: 0, notes: '' },
    },
    festive: {
      lieuFete: 'vaisseau_nature', nbInvites: 10,
      autorisationTestSucces: 0, rassemblementTestSucces: 0,
      preparerLieuTestSucces: 0, appelFestiveSucces: 0,
      estReussie: false,
      invitesDeMarque: [],
      inRun: { heuresEcoulees: 0, notes: '' },
    },
    mutinerie: {
      tonnage: 100, eloquencePoste: 0, eloquenceCambuse: 0,
      discretion: 1, conditionsFavorables: false, tactique: 0,
      location: 1, appelSucces: 0,
      journal: [],
      currentDay: 1,
    },
    revolution: {
      scope: 'planetaire',
      allies: [],
      powerPlaces: [],
      currentSections: 0, recrutementSucces: 0, troopQuality: -2,
      sensibilisation: { discours: 0, tracts: 0, comprehension: 0 },
      special: { secret: false, tech: false, secretNiveau: '+1d', secretDementi: false, techNiveau: 1, techTonnageVendu: 0 },
      execution: { appelSucces: 0, intimidationSucces: 0, assaults: {}, sectionsLost: 0 },
      celebration: { sciencesSolairesSucces: 3, joursDeCombat: 1, nouveauDirigeant: '', gouvernement: '' },
      contreRevolution: { trahisonDirigeant: false, flotteDelai: '1mois', negociationsEnCours: false, notes: '' },
      delegues: [],
      insurrection: { quadrants: [] },
    },
    retoursDeFlamme: [],
  };
}

let state = defaultState();

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetchWithTable(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Erreur ${res.status}`);
  return json.data ?? json;
}

// ── Session list ───────────────────────────────────────────────────────────────
async function loadSessionList() {
  const filter = document.getElementById('session-filter')?.value || '';
  const url = '/api/revolte' + (filter ? `?status=${filter}` : '');
  const sessions = await apiFetch(url).catch(() => []);
  // Pre-parse state_json for dot indicators
  sessions.forEach(s => {
    try { s._cachedState = typeof s.state_json === 'string' ? JSON.parse(s.state_json) : (s.state_json || null); }
    catch (_) { s._cachedState = null; }
  });
  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  const container = document.getElementById('sessions-list');
  if (!container) return;

  if (!sessions.length) {
    container.innerHTML = '<p class="text-xs text-gray-500 p-3 text-center">Aucune session</p>';
    return;
  }

  // Source de vérité = options du <select id="revolteType"> du panneau Paramétrage.
  const typeLabelFromSelect = (() => {
    const sel = document.getElementById('revolteType');
    if (!sel) return null;
    const map = {};
    Array.from(sel.options).forEach(o => { map[o.value] = o.textContent.trim(); });
    return map;
  })();
  const labelOf = (t) => (typeLabelFromSelect && typeLabelFromSelect[t]) || TYPE_LABELS[t] || t;

  container.innerHTML = '<div class="p-2 space-y-1.5">' + sessions.map(s => {
    const isActive = s.id === currentSessionId;
    const typeColor = TYPE_COLORS[s.type] || 'text-gray-400';
    const location  = s.location_ref ? `<div class="text-xs mt-0.5 font-mono truncate" style="color:var(--text-muted)">${escHtml(s.location_ref)}</div>` : '';
    const stepDots  = renderStepDots(s);
    return `
      <div class="session-item p-3 rounded-lg border cursor-pointer select-none transition-colors ${isActive ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}"
           data-id="${s.id}">
        <div class="flex items-start justify-between gap-1">
          <span class="font-medium text-sm truncate flex-1" style="color:var(--text)">${escHtml(s.name)}</span>
          <span class="text-xs flex-shrink-0 ${typeColor}">${labelOf(s.type)}</span>
        </div>
        ${location}
        <div class="flex items-center justify-between mt-1.5">
          <div class="text-xs badge-${s.status}">${STATUS_LABELS[s.status] || s.status}</div>
          ${stepDots}
        </div>
      </div>
    `;
  }).join('') + '</div>';

  container.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => selectSession(el.dataset.id));
  });
}

/** Render 3 step-dot indicators for a session (from its state_json or current state). */
function renderStepDots(session) {
  const st = (session.id === currentSessionId) ? state : (session._cachedState || null);
  if (!st) return '';

  const type = st.revolteType || 'emeute';
  const dots = [1, 2, 3].map(stepIdx => {
    const status = getStepStatus(st, type, stepIdx);
    const colors = { done: '#4a9e58', partial: '#5baad0', empty: '#3a3e50', fail: '#c44040' };
    const titles = { done: `Étape ${stepIdx} réussie`, partial: `Étape ${stepIdx} en cours`, empty: `Étape ${stepIdx} non commencée`, fail: `Étape ${stepIdx} échouée` };
    return `<span title="${titles[status]}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[status]};margin-left:2px;"></span>`;
  }).join('');
  return `<div class="step-dots flex items-center gap-0">${dots}</div>`;
}

/** Compute step completion status for a given state/type/stepIndex. */
function getStepStatus(st, type, stepIdx) {
  const malus = 0; // simplified for sidebar — no PD malus computation needed
  const sec   = st.securitePlanetaire || 0;

  if (type === 'emeute') {
    if (stepIdx === 1) {
      const v = (st.emeute?.empathieSucces || 0) + (st.emeute?.tactiqueSucces || 0);
      return v > 0 ? 'partial' : 'empty';
    }
    if (stepIdx === 2) {
      const d = st.emeute?.discoursSucces || 0;
      if (d === 0) return 'empty';
      return d >= sec ? 'done' : 'fail';
    }
    if (stepIdx === 3) return (st.emeute?.discoursSucces || 0) >= sec ? 'done' : 'empty';
  }
  if (type === 'festive') {
    if (stepIdx === 1) {
      const v = (st.festive?.rassemblementTestSucces || 0) + (st.festive?.preparerLieuTestSucces || 0);
      return v > 0 ? 'partial' : 'empty';
    }
    if (stepIdx === 2) {
      const d = st.festive?.appelFestiveSucces || 0;
      if (d === 0) return 'empty';
      const invD = { 10: 1, 100: 3, 1000: 5, 10000: 8 };
      const diff = invD[st.festive?.nbInvites || 10] || 1;
      return d >= diff ? 'done' : 'fail';
    }
    if (stepIdx === 3) return (st.festive?.estReussie) ? 'done' : 'empty';
  }
  if (type === 'mutinerie') {
    if (stepIdx === 1) {
      const v = (st.mutinerie?.eloquencePoste || 0) + (st.mutinerie?.eloquenceCambuse || 0);
      return v > 0 ? 'partial' : 'empty';
    }
    if (stepIdx === 2) {
      const d = st.mutinerie?.appelSucces || 0;
      const diff = parseInt(st.mutinerie?.location, 10) || 1;
      if (d === 0) return 'empty';
      return d >= diff ? 'done' : 'fail';
    }
    if (stepIdx === 3) return (st.mutinerie?.appelSucces || 0) >= (parseInt(st.mutinerie?.location, 10) || 1) ? 'done' : 'empty';
  }
  if (type === 'revolution') {
    const rev = st.revolution || {};
    if (stepIdx === 1) {
      const v = (rev.recrutementSucces || 0) + (rev.sensibilisation?.discours || 0);
      return v > 0 ? 'partial' : 'empty';
    }
    if (stepIdx === 2) {
      const d = rev.execution?.appelSucces || 0;
      if (d === 0) return 'empty';
      return d >= sec ? 'done' : 'fail';
    }
    if (stepIdx === 3) return (rev.execution?.appelSucces || 0) >= sec ? 'done' : 'empty';
  }
  return 'empty';
}

/** Deep-merge a loaded state with defaultState() to fill any missing sub-objects. */
function mergeState(loaded) {
  const def = defaultState();
  if (!loaded || typeof loaded !== 'object') return def;
  const rev = loaded.revolution || {};
  return {
    ...def,
    ...loaded,
    stellaPropagande: { ...def.stellaPropagande, ...(loaded.stellaPropagande || {}) },
    locationRef:  { ...def.locationRef,       ...(loaded.locationRef       || {}) },
    propagande:       { ...def.propagande,       ...(loaded.propagande       || {}) },
    propagandeGenerale: { ...def.propagandeGenerale, ...(loaded.propagandeGenerale || {}) },
    ppLedger: Array.isArray(loaded.ppLedger) ? loaded.ppLedger : [],
    retoursDeFlamme: Array.isArray(loaded.retoursDeFlamme) ? loaded.retoursDeFlamme : [],
    pd:               { ...def.pd,               ...(loaded.pd               || {}) },
    pdList: {
      locaux:  Array.isArray(loaded.pdList?.locaux)  ? loaded.pdList.locaux  : [],
      pirates: Array.isArray(loaded.pdList?.pirates) ? loaded.pdList.pirates : [],
      autres:  Array.isArray(loaded.pdList?.autres)  ? loaded.pdList.autres  : [],
    },
    officiersList: Array.isArray(loaded.officiersList) ? loaded.officiersList : [],
    emeute: {
      ...def.emeute,
      ...(loaded.emeute || {}),
      inRun: { ...def.emeute.inRun, ...((loaded.emeute || {}).inRun || {}) },
    },
    festive: {
      ...def.festive,
      ...(loaded.festive || {}),
      invitesDeMarque: Array.isArray((loaded.festive || {}).invitesDeMarque) ? loaded.festive.invitesDeMarque : [],
      inRun: { ...def.festive.inRun, ...((loaded.festive || {}).inRun || {}) },
    },
    mutinerie: {
      ...def.mutinerie,
      ...(loaded.mutinerie || {}),
      journal: Array.isArray((loaded.mutinerie || {}).journal) ? loaded.mutinerie.journal : [],
    },
    revolution: {
      ...def.revolution,
      ...rev,
      allies:          Array.isArray(rev.allies)      ? rev.allies      : def.revolution.allies,
      powerPlaces:     Array.isArray(rev.powerPlaces) ? rev.powerPlaces.map(p => ({
        discoveryStatus: 'identified',
        isPersonnageNomme: true,
        ...p,
      })) : def.revolution.powerPlaces,
      delegues:        Array.isArray(rev.delegues) ? rev.delegues : [],
      sensibilisation: { ...def.revolution.sensibilisation, ...(rev.sensibilisation || {}) },
      special:         { ...def.revolution.special,         ...(rev.special         || {}) },
      execution:       { ...def.revolution.execution,       ...(rev.execution       || {}) },
      celebration:     { ...def.revolution.celebration,     ...(rev.celebration     || {}) },
      contreRevolution:{ ...def.revolution.contreRevolution,...(rev.contreRevolution|| {}) },
      insurrection: {
        quadrants: Array.isArray((rev.insurrection || {}).quadrants) ? rev.insurrection.quadrants : [],
      },
    },
  };
}

// ── Load a session ─────────────────────────────────────────────────────────────
async function selectSession(id) {
  const data = await apiFetch(`/api/revolte/${id}`).catch(err => {
    console.error(err);
    return null;
  });
  if (!data) return;

  currentSessionId = id;
  state = mergeState(data.state);

  showEditor();
  applyStateToUI(data);
  navigateTo(state.currentStepIndex || 0);
  await loadSessionList(); // refresh active highlight

  // Self-heal: si la colonne type/scope du DB ne reflète plus l'état (cache JS périmé sur une session ancienne),
  // déclencher un autosave pour la resynchroniser sans intervention manuelle.
  const expectedScope = state.revolteType === 'revolution' ? (state.revolution?.scope || null) : null;
  if (data.type !== state.revolteType || (data.scope || null) !== expectedScope) {
    console.info('[revolte] type/scope DB hors sync avec state — autosave de rattrapage');
    scheduleAutosave();
  }
}

function applyStateToUI(session) {
  document.getElementById('editor-session-name').textContent = session.name;
  document.getElementById('editor-session-location').textContent =
    [session.location_ref, session.scope ? `(${session.scope})` : ''].filter(Boolean).join(' ');

  const statusSel = document.getElementById('editor-status');
  if (statusSel) statusSel.value = session.status;

  // Sync form controls from state
  setVal('revolteType',            state.revolteType);
  setVal('populationInput',        state.population);
  setVal('securitePlanetaireInput',state.securitePlanetaire);

  setCheck('stellaPorteDrapeauCheck', state.stellaPropagande.porteDrapeau);
  setCheck('stellaConnuCheck',        state.stellaPropagande.connu);
  setCheck('stellaMorteCheck',        state.stellaPropagande.morte);

  setCheck('gloireCheck',             state.propagande.gloire7);
  setCheck('filmeCheck',              state.propagande.filme);
  setCheck('pubCheck',                state.propagande.pub);
  setVal('propagandeSuccesInput',     state.propagande.propagandeSucces);
  setVal('eloquencePropagandeInput',  state.propagande.eloquenceSucces);
  setVal('bonusJets',                 state.propagande.bonusJets);
  setVal('bonusDuree',                state.propagande.bonusDuree);

  renderAllPdLists();
  populatePdSelects(); // async, non-blocking — refreshes selects if not yet populated

  // Emeute
  setCheck('grandLieuCheck',          state.emeute.grandLieu);
  setVal('empathieTestInput',         state.emeute.empathieSucces);
  setVal('tactiqueTestInput',         state.emeute.tactiqueSucces);
  setVal('discoursTestInput',         state.emeute.discoursSucces);

  // Festive
  setVal('lieuFete',                  state.festive.lieuFete);
  setVal('nbInvites',                 state.festive.nbInvites);
  setVal('autorisationTestSucces',    state.festive.autorisationTestSucces);
  setVal('rassemblementTestSucces',   state.festive.rassemblementTestSucces);
  setVal('preparerLieuTestSucces',    state.festive.preparerLieuTestSucces);
  setVal('appelFestiveSucces',        state.festive.appelFestiveSucces);

  // Mutinerie
  setVal('mutinerieTonnage',          state.mutinerie.tonnage);
  setVal('mutinerieEloquencePoste',   state.mutinerie.eloquencePoste);
  setVal('mutinerieEloquenceCambuse', state.mutinerie.eloquenceCambuse);
  setVal('mutinerieDiscretion',       state.mutinerie.discretion);
  setCheck('mutinerieConditions',     state.mutinerie.conditionsFavorables);
  setVal('mutinerieTactique',         state.mutinerie.tactique);
  setVal('mutinerieLocation',         state.mutinerie.location);
  setVal('mutinerieAppelSucces',      state.mutinerie.appelSucces);

  // Revolution
  setVal('revolutionScope',           state.revolution.scope);
  setVal('currentSectionsInput',      state.revolution.currentSections);
  setVal('recrutementSucces',         state.revolution.recrutementSucces);
  setCheck('secretCheck',             state.revolution.special.secret);
  setCheck('techCheck',               state.revolution.special.tech);
  setVal('discoursPeupleSucces',      state.revolution.sensibilisation.discours);
  setVal('tractsPeupleSucces',        state.revolution.sensibilisation.tracts);
  setVal('comprehensionPeupleSucces', state.revolution.sensibilisation.comprehension);
  setVal('appelRevolteSucces',        state.revolution.execution.appelSucces);
  setVal('intimidationRedditionSucces',state.revolution.execution.intimidationSucces);
  setVal('sciencesSolairesSucces',    state.revolution.celebration.sciencesSolairesSucces);
  setVal('joursDeCombatInput',        state.revolution.celebration.joursDeCombat);
  setVal('nouveauDirigeantSelect',    state.revolution.celebration.nouveauDirigeant);

  // QG factions hors lieux assaillis
  setVal('qgFactionsPlanetInput',     state.qgFactionsOnPlanet);

  // Contre-Révolution
  setCheck('crTrahisonDirigeantCheck', state.revolution.contreRevolution.trahisonDirigeant);
  setVal('crFlotteDelaiSelect',        state.revolution.contreRevolution.flotteDelai);
  setCheck('crNegociationsCheck',      state.revolution.contreRevolution.negociationsEnCours);
  setVal('crNotesInput',               state.revolution.contreRevolution.notes);

  // Rendus dynamiques (PP ledger / Délégués / Insurrection)
  renderPPLedger();
  renderDelegues();
  renderInsurrection();

  buildLocationUI();
  refreshLocationSelects();
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function setCheck(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

// ── Save ───────────────────────────────────────────────────────────────────────
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveSession, 1200);
}

async function saveSession() {
  if (!currentSessionId) return;
  const statusEl = document.getElementById('editor-status');
  const locationRef = computeLocationRef();
  const body = {
    state,
    status: statusEl?.value || 'en_cours',
    ...(locationRef ? { location_ref: locationRef } : {}),
  };
  try {
    await apiFetch(`/api/revolte/${currentSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ind = document.getElementById('save-indicator');
    if (ind) {
      ind.classList.remove('hidden');
      setTimeout(() => ind.classList.add('hidden'), 2000);
    }
    // Refresh list to update status badge
    await loadSessionList();
  } catch (err) {
    console.error('Autosave error:', err);
  }
}

// ── Create a new session ───────────────────────────────────────────────────────
function showNewForm() {
  hideAll();
  document.getElementById('new-session-form')?.classList.remove('hidden');
  // Mobile: basculer vers le panneau éditeur
  if (window.innerWidth < 640) {
    document.getElementById('sessions-panel')?.classList.add('mobile-hidden');
    document.getElementById('editor-pane')?.classList.add('mobile-visible');
  }
}

function cancelNewForm() {
  hideAll();
  if (currentSessionId) {
    document.getElementById('session-editor')?.classList.remove('hidden');
  } else {
    document.getElementById('editor-empty')?.classList.remove('hidden');
    // Mobile: retourner au panel sessions
    if (window.innerWidth < 640) {
      showSessionsPanelMobile();
    }
  }
}

async function createSession() {
  const name = document.getElementById('ns-name')?.value.trim();
  if (!name) {
    alert('Le nom est requis');
    return;
  }
  // Tout le paramétrage (type, portée, lieu) se fait dans le panneau "Paramétrage"
  // de la session. On crée juste l'enveloppe avec un état par défaut.
  try {
    const data = await apiFetch('/api/revolte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'emeute', state: defaultState() }),
    });
    const el = document.getElementById('ns-name'); if (el) el.value = '';
    await selectSession(data.id);
  } catch (err) {
    alert(`Erreur lors de la création : ${err.message}`);
  }
}

// ── Delete a session ───────────────────────────────────────────────────────────
async function deleteSession() {
  if (!currentSessionId) return;
  const name = document.getElementById('editor-session-name')?.textContent || 'cette session';
  const ok = await showConfirm({
    title:   'Supprimer la session',
    message: `Supprimer « ${name} » ? Cette action est irréversible.`,
  });
  if (!ok) return;

  try {
    await apiFetch(`/api/revolte/${currentSessionId}`, { method: 'DELETE' });
    currentSessionId = null;
    state = defaultState();
    hideAll();
    document.getElementById('editor-empty')?.classList.remove('hidden');
    await loadSessionList();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function hideAll() {
  ['editor-empty', 'new-session-form', 'session-editor'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function showEditor() {
  hideAll();
  document.getElementById('session-editor')?.classList.remove('hidden');
  // Mobile: hide session panel, show editor pane
  if (window.innerWidth < 640) {
    document.getElementById('sessions-panel')?.classList.add('mobile-hidden');
    document.getElementById('editor-pane')?.classList.add('mobile-visible');
  }
}

function showSessionsPanelMobile() {
  document.getElementById('sessions-panel')?.classList.remove('mobile-hidden');
  document.getElementById('editor-pane')?.classList.remove('mobile-visible');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Navigation entre étapes ────────────────────────────────────────────────────
function navigateTo(stepIndex) {
  state.currentStepIndex = stepIndex;

  document.querySelectorAll('.progress-step').forEach((step, index) => {
    step.classList.toggle('active', index === stepIndex);
  });

  const step0  = document.getElementById('step-content-0');
  const stepsC = document.getElementById('revolte-steps-container');
  const isP    = stepIndex === 0;
  step0?.classList.toggle('hidden', !isP);
  stepsC?.classList.toggle('hidden', isP);

  if (!isP) {
    // Show correct step panel (tracker-first: unified step-content-N)
    [1, 2, 3].forEach(n => {
      document.getElementById(`step-content-${n}`)?.classList.toggle('hidden', n !== stepIndex);
    });
    // Apply type filter on tracker rows and type blocks
    applyTypeFilter(state.revolteType);
  }

  updateUI();
  scheduleAutosave();
}

/** Show/hide .tracker-row and .tracker-type-block elements based on revolteType. */
function applyTypeFilter(type) {
  document.querySelectorAll('[data-types]').forEach(el => {
    const types = el.dataset.types ? el.dataset.types.split(',') : [];
    el.classList.toggle('hidden', types.length > 0 && !types.includes(type));
  });
  // Filtre par scope (révolution uniquement) : data-scope="locale,stellaire"
  const scope = state.revolution?.scope || '';
  document.querySelectorAll('[data-scope]').forEach(el => {
    const scopes = el.dataset.scope ? el.dataset.scope.split(',') : [];
    if (scopes.length === 0) return;
    // Cumulé avec data-types : ne masque que si déjà visible côté type
    const visibleByType = !el.classList.contains('hidden') || type === 'revolution';
    el.classList.toggle('hidden', !(visibleByType && scopes.includes(scope)));
  });
}

// ── UI Update ──────────────────────────────────────────────────────────────────
const descriptions = {
  emeute:    "L'émeute pirate est la forme la plus spontanée de Révolte. Rapide et chaotique, ses effets sont éphémères mais elle peut donner le goût de la Révolte.",
  festive:   "La Révolution festive est une forme de Révolte très douce. Ses effets sont moins spectaculaires mais peuvent influencer sur le long terme et attirer moins l'attention des autorités.",
  revolution:"La Révolution vise à changer de dirigeant ou de régime sur une planète, un système, voire une nation. C'est la plus ambitieuse des Révoltes.",
  mutinerie: "La mutinerie pirate consiste à organiser une mutinerie dans un vaisseau... autre que le vôtre ! Elle ne fonctionne que si le vaisseau est dans l'espace.",
};

const revolutionScopeDescriptions = {
  planetaire: "La révolution vise à prendre le contrôle de la planète actuelle.",
  locale:     "Il faut réussir une Révolution planétaire sur chaque planète du système.",
  stellaire:  "Il faut réussir une Révolution locale sur chaque système majeur du secteur.",
};

function updateUI() {
  const type = state.revolteType;
  const descEl = document.getElementById('revolteDescription');
  if (descEl) descEl.innerHTML = descriptions[type] || '';

  document.getElementById('revolution-options')?.classList.toggle('hidden', type !== 'revolution');
  if (type === 'revolution') {
    const descDiv = document.getElementById('revolutionScopeDescription');
    if (descDiv) descDiv.textContent = revolutionScopeDescriptions[state.revolution.scope] || '';
  }

  buildLocationUI();
  updateGlobalSettingsUI();
  applyTypeFilter(type);

  // Coût révolution (dépend du scope)
  if (type === 'revolution') {
    const revCosts = { planetaire: 5, locale: 10, stellaire: 25 };
    const revCost  = revCosts[state.revolution.scope] || 5;
    setInnerHTML('revolutionCoutResult',
      `Déclenchement : sacrifice de <strong>${revCost} PP</strong> (à répartir entre les participants).`
    );
  }
  document.getElementById('revolutionCoutResult')?.classList.toggle('hidden', type !== 'revolution');

  if (state.currentStepIndex > 0) {
    if (type === 'emeute')      updateEmeuteUI();
    if (type === 'mutinerie')   updateMutinerieUI();
    if (type === 'festive')     updateFestiveUI();
    if (type === 'revolution') {
      updateRevolutionPrepUI();
      if (state.currentStepIndex === 2) updateRevolutionExecutionUI();
      if (state.currentStepIndex === 3) updateRevolutionCelebrationUI();
    }
  }
  updatePPCounter();
}

function getMalus() {
  // Conditions OK = (au moins un PD pirate impliqué) ET (population connaît Stella). Sinon D+1.
  // Stella morte → encore +1.
  const s = state.stellaPropagande;
  const pirateCount = (state.pdList?.pirates?.length) ?? state.pd?.pirates ?? 0;
  const okStella = pirateCount > 0 && !!s.connu;
  let m = (okStella ? 0 : 1) + (s.morte ? 1 : 0);
  // Pour une Révolution, chaque QG de faction présent sur la planète ajoute +1 à l'Appel/Sécurité.
  if (state.revolteType === 'revolution') {
    m += Number(state.qgFactionsOnPlanet) || 0;
  }
  return m;
}

/** Compute and render the PP counter in the sidebar. */
function updatePPCounter() {
  const el = document.getElementById('pp-counter');
  if (!el || !currentSessionId) { if (el) el.textContent = ''; return; }

  const type   = state.revolteType;
  const malus  = getMalus();
  const sec    = state.securitePlanetaire;
  let ppDepenses = 0, ppGagnes = 0;

  if (type === 'emeute') {
    ppDepenses = 3;
    ppGagnes   = state.emeute.discoursSucces >= (sec + malus) ? 1 : 0;
  } else if (type === 'festive') {
    ppDepenses = 3;
    ppGagnes   = state.festive.estReussie ? 1 : 0;
  } else if (type === 'mutinerie') {
    const tc   = { 100: 1, 1000: 5, 10000: 8, 100000: 10 };
    ppDepenses = tc[state.mutinerie.tonnage] ?? 1;
    const aD   = parseInt(state.mutinerie.location, 10) || 1;
    ppGagnes   = state.mutinerie.appelSucces >= aD ? (state.mutinerie.tonnage >= 10000 ? 2 : 1) : 0;
  } else if (type === 'revolution') {
    const costs = { planetaire: 5, locale: 10, stellaire: 25 };
    const gains = { planetaire: 1, locale: 2,  stellaire: 3  };
    ppDepenses  = costs[state.revolution.scope] || 5;
    const ok    = state.revolution.execution.appelSucces >= (sec + malus);
    ppGagnes    = ok ? (gains[state.revolution.scope] || 1) : 0;
  }

  // Compteur qualifié (depense vs sacrifice) issu du ppLedger
  let ledgerDepense   = 0;
  let ledgerSacrifice = 0;
  (state.ppLedger || []).forEach(e => {
    if (e.kind === 'depense')   ledgerDepense   += Number(e.amount) || 0;
    if (e.kind === 'sacrifice') ledgerSacrifice += Number(e.amount) || 0;
  });

  const net      = ppGagnes - ppDepenses;
  const netSign  = net >= 0 ? '+' : '';
  const netClass = net >= 0 ? 'text-green-400' : 'text-red-400';
  el.innerHTML   = `<span class="text-gray-500 text-xs mr-1">PP cible :</span>` +
    `<span class="text-red-400 text-xs font-mono">\u2212${ppDepenses}</span>` +
    `<span class="text-gray-600 text-xs mx-1">/</span>` +
    `<span class="text-green-400 text-xs font-mono">+${ppGagnes}</span>` +
    `<span class="${netClass} text-xs font-mono ml-1">(${netSign}${net})</span>` +
    (ledgerDepense || ledgerSacrifice
      ? `<span class="text-gray-500 text-xs ml-2" title="Détail du registre PP de la révolte">` +
        `réservé : <span class="text-yellow-300">${ledgerDepense}d</span>·` +
        `<span class="text-red-300">${ledgerSacrifice}s</span></span>`
      : '');
  renderPPLedger();
}

/** Render the PP ledger detail panel (collapsible). */
function renderPPLedger() {
  const wrap = document.getElementById('pp-ledger-list');
  if (!wrap) return;
  const entries = state.ppLedger || [];
  if (entries.length === 0) {
    wrap.innerHTML = '<p class="text-xs text-gray-500 italic">Aucune entrée. Ajoutez une dépense (récupérable en cas d\'échec) ou un sacrifice (consommé).</p>';
    return;
  }
  wrap.innerHTML = entries.map((e, i) => {
    const kindCls = e.kind === 'sacrifice' ? 'text-red-300' : 'text-yellow-300';
    const kindLbl = e.kind === 'sacrifice' ? 'Sacrifice' : 'Dépense';
    return `<div class="pp-ledger-row flex items-center gap-2 text-xs py-1">
      <span class="${kindCls} font-mono w-20">${kindLbl}</span>
      <span class="font-mono w-8 text-right">${Number(e.amount) || 0}</span>
      <span class="flex-1 truncate">${escHtml(e.who || '?')}${e.reason ? ` — ${escHtml(e.reason)}` : ''}</span>
      <button class="pp-ledger-remove text-red-400 hover:text-red-300" data-idx="${i}" title="Retirer">×</button>
    </div>`;
  }).join('');
}

/** Render délégués (officiers délégués pour scope locale/stellaire). Lecture + Modifier. */
function renderDelegues() {
  const wrap = document.getElementById('delegues-list');
  if (!wrap) return;
  const list = state.revolution.delegues || [];
  if (list.length === 0) {
    wrap.innerHTML = '<p class="text-xs text-gray-500 italic">Aucun délégué. Pour une Révolution locale/stellaire, désigner un délégué par planète.</p>';
    return;
  }
  const editingIdx = wrap.dataset.editingIdx ? parseInt(wrap.dataset.editingIdx, 10) : -1;
  wrap.innerHTML = list.map((d, i) => {
    const m = parseInt(d.lastRdvMonth, 10) || 0;
    let bonusTxt = '<span class="text-gray-500">—</span>';
    if (m >= 6)      bonusTxt = '<span class="text-green-300 font-bold">TF (6+ mois)</span>';
    else if (m >= 1) bonusTxt = `<span class="text-green-400">+1d (${m} mois)</span>`;
    if (i === editingIdx) {
      return `<div class="delegue-row bg-gray-800 p-2 rounded text-xs mb-1 border border-blue-700">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <input type="text" class="del-edit-nom revolte-input md:col-span-3" data-idx="${i}" value="${escHtml(d.nom || '')}" placeholder="Nom">
          <input type="text" class="del-edit-planete revolte-input md:col-span-3" data-idx="${i}" value="${escHtml(d.planete || '')}" placeholder="Planète">
          <label class="md:col-span-2 text-gray-400 flex items-center gap-1">
            Mois&nbsp;<input type="number" min="0" class="del-edit-rdv revolte-input w-14 text-center" data-idx="${i}" value="${m}">
          </label>
          <input type="text" class="del-edit-action revolte-input md:col-span-3" data-idx="${i}" value="${escHtml(d.action || '')}" placeholder="Action en cours">
          <button class="delegue-save md:col-span-1 text-green-400 hover:text-green-300 text-right" data-idx="${i}" title="Valider">✓</button>
        </div>
      </div>`;
    }
    return `<div class="delegue-row bg-gray-800 p-2 rounded text-xs mb-1">
      <div class="flex items-center gap-2 flex-wrap">
        <strong>${escHtml(d.nom || '(sans nom)')}</strong>
        <span class="text-gray-400">${escHtml(d.planete || '—')}</span>
        <span class="ml-auto">${bonusTxt}</span>
        <button class="delegue-edit text-blue-400 hover:text-blue-300" data-idx="${i}" title="Modifier">✎</button>
        <button class="delegue-remove text-red-400 hover:text-red-300" data-idx="${i}" title="Retirer">×</button>
      </div>
      ${d.action ? `<div class="text-gray-300 mt-1 italic">↳ ${escHtml(d.action)}</div>` : ''}
    </div>`;
  }).join('');
}

/** Render insurrection générale (révolution stellaire). */
function renderInsurrection() {
  const wrap = document.getElementById('insurrection-list');
  if (!wrap) return;
  const list = state.revolution.insurrection?.quadrants || [];
  if (list.length === 0) {
    wrap.innerHTML = '<p class="text-xs text-gray-500 italic">Aucun quadrant. L\'Insurrection générale est requise comme préalable à la Révolution stellaire.</p>';
    return;
  }
  wrap.innerHTML = list.map((q, i) => {
    const tests = q.tests || { politique: 0, social: 0, economique: 0, securitaire: 0 };
    const total = (tests.politique || 0) + (tests.social || 0) + (tests.economique || 0) + (tests.securitaire || 0);
    const instab = total >= 12 ? -2 : total >= 6 ? -1 : 0;
    return `<div class="insurrection-row bg-gray-800 p-2 rounded text-xs mb-1">
      <div class="flex items-center gap-2 mb-1">
        <strong>Quadrant ${escHtml(q.name || '?')}</strong>
        <span class="ml-auto">Instabilité : <strong class="${instab < 0 ? 'text-red-400' : 'text-gray-400'}">${instab}</strong></span>
        <button class="insurrection-remove text-red-400 hover:text-red-300" data-idx="${i}" title="Retirer">×</button>
      </div>
      <div class="grid grid-cols-4 gap-1 text-center">
        ${['politique', 'social', 'economique', 'securitaire'].map(k => `
          <label class="block">
            <span class="text-gray-400 text-xs">${k}</span>
            <input type="number" min="0" value="${tests[k] || 0}"
                   class="insurrection-test-input revolte-input w-full text-center"
                   data-idx="${i}" data-key="${k}">
          </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

/** Create a calendar event linked to the current revolt session (MJ only).
 *  Utilise la date de campagne courante. Évite les mismatch d'année qui
 *  rendaient l'événement invisible dans le calendrier. */
async function createCalendarEvent() {
  if (!currentSessionId) return;
  if (!currentUserIsMJ) {
    alert('Réservé au MJ');
    return;
  }
  // 1. Récupère la date galactique courante de la campagne
  let curDate = '0101.01';
  let curYear = 50429;
  try {
    const st = await apiFetch('/api/calendar/state');
    if (st?.date) curDate = String(st.date);
    if (st?.year) curYear = Number(st.year);
  } catch (e) {
    console.warn('Impossible de récupérer la date courante du calendrier, valeurs par défaut utilisées.', e);
  }

  const sessName     = document.getElementById('editor-session-name')?.textContent || 'Révolte';
  const titleSuggest = `${TYPE_LABELS[state.revolteType] || 'Révolte'} — ${sessName}`;
  const title = prompt('Titre de l\'événement :', titleSuggest);
  if (!title) return;
  const dateStr = prompt(`Date galactique (XXYY.ZZ)\n(date courante de campagne pré-remplie) :`, curDate);
  if (!dateStr) return;
  if (!/^\d{4}\.\d{2}$/.test(dateStr)) {
    alert('Format de date invalide. Attendu : XXYY.ZZ (ex. 0303.04 pour mois 3 / semaine 3 / jour 4)');
    return;
  }
  // Validation des bornes (mm 01-10, ww 01-05, dd 01-05)
  const mm = parseInt(dateStr.slice(0, 2), 10);
  const ww = parseInt(dateStr.slice(2, 4), 10);
  const dd = parseInt(dateStr.slice(5, 7), 10);
  if (mm < 1 || mm > 10 || ww < 1 || ww > 5 || dd < 1 || dd > 5) {
    alert('Date hors-limites : mois 01-10, semaine 01-05, jour 01-05.');
    return;
  }
  const yearStr = prompt(`Année galactique\n(année courante de campagne pré-remplie) :`, String(curYear));
  if (!yearStr) return;
  const year = parseInt(yearStr, 10);
  if (!Number.isInteger(year) || year < 1) {
    alert('Année invalide.');
    return;
  }
  const visible = confirm('Rendre cet événement visible aux joueurs ?\n(OK = visible / Annuler = privé MJ)');

  try {
    const evt = await apiFetch(`/api/revolte/${currentSessionId}/calendar-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: `Lieu : ${computeLocationRef() || '—'}\nStatut : ${document.getElementById('editor-status')?.value || 'en_cours'}`,
        date_start: dateStr,
        date_end:   dateStr,
        galactic_year: year,
        color: '#c89c3a',
        is_public: !!visible,
      }),
    });
    if (!evt || !evt.id) {
      alert('Événement créé mais réponse inattendue. Vérifie le calendrier.');
      return;
    }
    // Vérifie que l'événement est bien retrouvable par le calendrier
    let verified = false;
    try {
      const list = await apiFetch(`/api/calendar/events?year=${year}`);
      verified = Array.isArray(list) && list.some(e => e.id === evt.id);
    } catch (_) { /* ignore */ }
    const msg = `✓ Événement créé pour ${dateStr} / année ${year}\n(visibilité : ${visible ? 'publique' : 'MJ seulement'})${verified ? '\n✓ Vérifié dans le calendrier' : '\n⚠ Non retrouvé dans la requête de vérification — vérifie manuellement'}.\n\nOuvrir le calendrier galactique ?`;
    if (confirm(msg)) window.open(`/calendrier.html?year=${year}`, '_blank');
  } catch (err) {
    console.error('createCalendarEvent failed:', err);
    alert(`Erreur lors de la création : ${err.message}`);
  }
}

/** Generate a markdown CR summary and trigger download. */
function exportCR() {
  if (!currentSessionId) return;
  const type     = state.revolteType;
  const malus    = getMalus();
  const sec      = state.securitePlanetaire;
  const name     = document.getElementById('editor-session-name')?.textContent || 'Révolte';
  const dateStr  = new Date().toLocaleDateString('fr-FR');
  const locRef   = computeLocationRef();

  const lines = [
    `# CR — ${name}`,
    `**Date :** ${dateStr}  `,
    `**Type :** ${TYPE_LABELS[type] || type}  `,
    `**Localisation :** ${locRef || '(non précisée)'}  `,
    `**Sécurité planétaire :** ${sec}  `,
    '',
  ];

  if (type === 'emeute') {
    const emp  = state.emeute.empathieSucces;
    const tact = state.emeute.tactiqueSucces;
    const disc = state.emeute.discoursSucces;
    const empD = 1 + malus, tactD = 1 + malus, discD = sec + malus;
    lines.push('## Préparation',
      `- Empathie : **${emp}** succès (diff ${empD}) — ${emp >= empD ? '✅' : '❌'}`,
      `- Tactique : **${tact}** succès (diff ${tactD}) — ${tact >= tactD ? '✅' : '❌'}`,
      '');
    lines.push('## Exécution',
      `- Discours : **${disc}** succès (diff ${discD}) — ${disc >= discD ? '✅ Émeute déclenchée' : '❌ Échec'}`,
      `- Coût : 3 PP`,
      disc >= discD ? `- Durée : **${5 * (1 + Math.max(0, disc - discD))} min**` : '',
      '');
  } else if (type === 'festive') {
    const inv  = state.festive.nbInvites;
    const inv2diff = { 10: 1, 100: 3, 1000: 5, 10000: 8 };
    const appel    = state.festive.appelFestiveSucces;
    const appelD   = (inv2diff[inv] || 1) + malus;
    lines.push('## Préparation',
      `- Invités : **${inv.toLocaleString('fr-FR')}**`,
      `- Lieu : ${state.festive.lieuFete || '—'}`,
      `- Rassemblement : **${state.festive.rassemblementTestSucces}** succès — ${state.festive.rassemblementTestSucces >= 3 + malus ? '✅' : '❌'}`,
      `- Préparation lieu : **${state.festive.preparerLieuTestSucces}** succès — ${state.festive.preparerLieuTestSucces >= (inv2diff[inv] || 1) + malus ? '✅' : '❌'}`,
      '');
    lines.push('## Exécution',
      `- Appel : **${appel}** succès (diff ${appelD}) — ${appel >= appelD ? '✅ Fête lancée' : '❌ Échec'}`,
      `- Coût : 3 PP`,
      '');
  } else if (type === 'mutinerie') {
    const s  = state.mutinerie;
    const aD = parseInt(s.location, 10) || 1;
    lines.push('## Préparation',
      `- Éloquence (poste) : **${s.eloquencePoste}** succès (diff 3) — ${s.eloquencePoste >= 3 ? '✅' : '❌'}`,
      `- Éloquence (cambuse) : **${s.eloquenceCambuse}** succès (diff 2) — ${s.eloquenceCambuse >= 2 ? '✅' : '❌'}`,
      `- Discrétion : **${s.discretion}** succès (diff 1) — ${s.discretion >= 1 ? '✅' : '❌'}`,
      `- Tactique : **${s.tactique}** succès (diff 3) — ${s.tactique >= 3 ? '✅' : '❌'}`,
      '');
    lines.push('## Exécution',
      `- Appel mutinerie : **${s.appelSucces}** succès (diff ${aD}) — ${s.appelSucces >= aD ? '✅' : '❌'}`,
      `- Coût : ${({ 100: 1, 1000: 5, 10000: 8, 100000: 10 }[s.tonnage] ?? 1)} PP`,
      '');
  } else if (type === 'revolution') {
    const rev = state.revolution;
    const recD = sec + malus;
    lines.push('## Préparation',
      `- Recrutement : **${rev.recrutementSucces}** succès (diff ${recD}) — ${rev.recrutementSucces >= recD ? '✅' : '❌'}`,
      `- Discours peuple : **${rev.sensibilisation.discours}** — ${rev.sensibilisation.discours >= sec + malus ? '✅' : '❌'}`,
      `- Tracts : **${rev.sensibilisation.tracts}** — ${rev.sensibilisation.tracts >= sec + malus ? '✅' : '❌'}`,
      `- QG factions hors lieux assaillis : **${state.qgFactionsOnPlanet || 0}**`,
      '');

    // Lieux de pouvoir détaillés
    if ((rev.powerPlaces || []).length > 0) {
      lines.push('## Lieux de Pouvoir');
      rev.powerPlaces.forEach(p => {
        const a = p.assault || {};
        const stepD = sec + malus + (p.isPersonnageNomme ? 0 : 1);
        const icon = (v) => v === 0 ? '⏳' : (v >= stepD ? '✅' : '❌');
        lines.push(`- **${p.name}** ${p.isQG ? '[QG]' : ''}${p.isPersonnageNomme ? '' : ' _(non nommé, D+1)_'} — ` +
          `Atteindre ${icon(a.atteindre)} / Entrer ${icon(a.entrer)} / Dirigeant ${icon(a.dirigeant)} / Reddition ${icon(a.reddition)} — ` +
          (p.isCaptured ? '**Capturé**' : '_en cours_'));
      });
      lines.push('');
    }

    // Insurrection (stellaire)
    const quads = rev.insurrection?.quadrants || [];
    if (quads.length > 0) {
      lines.push('## Insurrection Générale');
      quads.forEach(q => {
        const t = q.tests || {};
        const tot = (t.politique || 0) + (t.social || 0) + (t.economique || 0) + (t.securitaire || 0);
        lines.push(`- Quadrant **${q.name}** — Politique ${t.politique || 0} / Social ${t.social || 0} / Économique ${t.economique || 0} / Sécuritaire ${t.securitaire || 0} (total **${tot}**)`);
      });
      lines.push('');
    }

    // Délégués (locale/stellaire)
    const delegues = rev.delegues || [];
    if (delegues.length > 0) {
      lines.push('## Délégués');
      delegues.forEach(d => {
        lines.push(`- **${d.nom}** (${d.planete || 'planète ?'}) — dernier RDV : ${d.lastRdvMonth || 0} mois — ${d.action || '—'}`);
      });
      lines.push('');
    }

    const appelD = sec + malus;
    lines.push('## Exécution',
      `- Appel révolte : **${rev.execution.appelSucces}** succès (diff ${appelD}) — ${rev.execution.appelSucces >= appelD ? '✅' : '❌'}`,
      `- Reddition : **${rev.execution.intimidationSucces}** succès`,
      `- Sections perdues (assauts échoués) : **${rev.execution.sectionsLost || 0}**`,
      '');

    // Contre-révolution
    const cr = rev.contreRevolution || {};
    if (cr.trahisonDirigeant || cr.flotteDelai !== '1mois' || cr.negociationsEnCours || cr.notes) {
      lines.push('## Contre-Révolution',
        `- Trahison potentielle du nouveau dirigeant : ${cr.trahisonDirigeant ? '⚠️ OUI' : 'non'}`,
        `- Flotte de répression : **${cr.flotteDelai}**`,
        `- Négociations en cours : ${cr.negociationsEnCours ? 'oui' : 'non'}`,
        cr.notes ? `- Notes : ${cr.notes}` : '',
        '');
    }

    // Nouveau dirigeant (célébration)
    if (rev.celebration?.nouveauDirigeant) {
      lines.push('## Nouveau Pouvoir',
        `- Dirigeant : **${rev.celebration.nouveauDirigeant}**`,
        rev.celebration.gouvernement ? `- Gouvernement : ${rev.celebration.gouvernement}` : '',
        '');
    }
  }

  // Registre PP (commun à tous les types)
  const ledger = state.ppLedger || [];
  if (ledger.length > 0) {
    lines.push('## Registre des Points de Pouvoir');
    const depTotal  = ledger.filter(e => e.kind === 'depense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const sacTotal  = ledger.filter(e => e.kind === 'sacrifice').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    lines.push(`- Total dépensé : **${depTotal}** · Total sacrifié : **${sacTotal}**`);
    ledger.forEach(e => {
      lines.push(`  - ${e.kind === 'sacrifice' ? '🔥 Sacrifice' : '💰 Dépense'} **${e.amount}** par ${e.who}${e.reason ? ` — ${e.reason}` : ''}`);
    });
    lines.push('');
  }

  lines.push('---', `*Généré automatiquement — Metal Adventures*`);

  const txt  = lines.filter(l => l !== undefined).join('\n');
  const blob = new Blob([txt], { type: 'text/markdown; charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `CR-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function getBonusDiceSpan(bonus) {
  return bonus > 0 ? ` <span class="bonus-dice">(+${bonus}d)</span>` : '';
}

function getPdRequiredSpan() {
  const total = state.pd.pirates + state.pd.locaux + state.pd.autres;
  return total > 0 ? ' <span class="pd-highlight">(PD)</span>' : '';
}

function setInnerHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/** Update .tracker-diff-badge with diff label and optional bonus dice. */
function setDiffBadge(id, diff, bonusDice = 0) {
  const el = document.getElementById(id);
  if (!el) return;
  let label = diff > 0 ? `diff ${diff}` : (diff === 0 ? 'auto' : '—');
  if (bonusDice > 0) label += ` +${bonusDice}d`;
  el.textContent = label;
}

/** Update .tracker-status span for an input row. */
function setTrackerStatus(inputId, succesValue, diffValue) {
  const el = document.getElementById(`${inputId}-status`);
  if (!el) return;
  const v = parseInt(succesValue, 10) || 0;
  const d = parseInt(diffValue, 10) || 0;
  if (v === 0) {
    el.textContent = '—';
    el.className = 'tracker-status';
  } else if (v >= d) {
    el.textContent = '✅';
    el.className = 'tracker-status success';
  } else {
    el.textContent = '❌';
    el.className = 'tracker-status failure';
  }
}

function updateGlobalSettingsUI() {
  const malus = getMalus();
  setInnerHTML('stellaMalusResult',
    malus > 0
      ? `Tous les tests de compétence de la révolte subissent un malus de <strong>D+${malus}</strong>.`
      : `<strong>Aucun malus</strong> de Stella Bell.`
  );

  const canPropagande = (state.propagande.gloire7 && state.propagande.filme) || state.propagande.pub;
  document.getElementById('propagandeTest')?.classList.toggle('hidden', !canPropagande);
  if (canPropagande) {
    const propagandeDiff = 1 + malus;
    setInnerHTML('propagandeSuccesLabel', `Propagande (${propagandeDiff})`);
    const eloquenceBonusD = Math.max(0, state.propagande.propagandeSucces - propagandeDiff);
    const eloquenceDiff   = 3 + malus;
    setInnerHTML('eloquencePropagandeLabel', `Eloquence (${eloquenceDiff})${getBonusDiceSpan(eloquenceBonusD)}`);
    const totalBonus = Math.max(0, state.propagande.eloquenceSucces - eloquenceDiff);
    setInnerHTML('propagandeResult',
      `Bonus : <strong>+${state.propagande.bonusJets}d</strong> pendant <strong>${1 + state.propagande.bonusDuree}</strong> mois. (Total disponible: ${totalBonus})`
    );
  }

  const pd = state.pd;
  const totalPd = pd.locaux + pd.pirates + pd.autres;
  if (totalPd > 0) {
    if (pd.pirates > pd.locaux) {
      setInnerHTML('pdResult', `Bonus : <strong>+1d</strong> aux jets pendant l'Exécution <span class="text-xs text-gray-400">(Pirates majoritaires)</span>`);
    } else if (pd.locaux > pd.pirates) {
      setInnerHTML('pdResult', `Bonus : <strong>+1d</strong> aux jets pendant la Préparation <span class="text-xs text-gray-400">(Locaux majoritaires)</span>`);
    } else {
      setInnerHTML('pdResult', 'Aucun bonus de majorité.');
    }
  } else {
    setInnerHTML('pdResult', 'Aucun bonus de Porte-Drapeau.');
  }
}

function updateEmeuteUI() {
  const malus = getMalus();
  const pd    = state.pd;
  const totalPd            = pd.locaux + pd.pirates + pd.autres;
  const pdBonusPreparation = totalPd > 0 && pd.locaux  > pd.pirates ? 1 : 0;
  const pdBonusExecution   = totalPd > 0 && pd.pirates > pd.locaux  ? 1 : 0;
  const propagandeBonus    = state.propagande.bonusJets;
  const totalPreparationBonus = pdBonusPreparation + propagandeBonus;
  const securite = state.securitePlanetaire;

  const empathieDiff  = 1 + malus;
  const tactiqueDiff  = 1 + malus;
  setDiffBadge('empathieDiffBadge',  empathieDiff,  totalPreparationBonus);
  setDiffBadge('tactiqueDiffBadge',  tactiqueDiff,  totalPreparationBonus);
  setInnerHTML('empathieTestLabel', `Empathie`);
  setInnerHTML('tactiqueTestLabel', `Tactique`);
  setTrackerStatus('empathieTestInput', state.emeute.empathieSucces, empathieDiff);
  setTrackerStatus('tactiqueTestInput', state.emeute.tactiqueSucces, tactiqueDiff);
  const mfBonusTactique = Math.max(0, state.emeute.tactiqueSucces - tactiqueDiff);
  setInnerHTML('emeutePreparationResult',
    `Bonus au test d'Éloquence : <strong>+${Math.max(0, state.emeute.empathieSucces - empathieDiff)}d</strong><br>` +
    `Coût du Retour de Flamme (Sécurité) : <strong>+${mfBonusTactique}d MF</strong>.`
  );

  if (state.currentStepIndex === 2) {
    const etatEspritBonus    = Math.max(0, state.emeute.empathieSucces - empathieDiff);
    // Note: « Grand lieu » n'a PAS d'effet sur le discours — il multiplie le prix du sang (×10 décès/5 min).
    const totalExecutionBonus = pdBonusExecution + etatEspritBonus + propagandeBonus;
    const discoursDiff       = securite + malus;
    setDiffBadge('discoursDiffBadge', discoursDiff, totalExecutionBonus);
    setInnerHTML('discoursTestLabel', `Éloquence (Discours)`);
    setTrackerStatus('discoursTestInput', state.emeute.discoursSucces, discoursDiff);
    const discoursReussi = state.emeute.discoursSucces >= discoursDiff;
    if (discoursReussi) {
      const succesExc = state.emeute.discoursSucces - discoursDiff;
      const duree     = 5 * (1 + succesExc);
      setInnerHTML('emeuteExecutionResult',
        `<span class="text-green-400">Discours réussi !</span> L'émeute débute. Durée : <strong>${duree} minutes</strong>.`
      );
    } else {
      setInnerHTML('emeuteExecutionResult',
        `<span class="text-red-400">Échec du discours !</span> Retour de Flamme "Police !" possible.`
      );
    }
    setInnerHTML('coutPanache',
      `Dépense : <strong>3 PP</strong> (à répartir entre les participants).`
    );
  }

  if (state.currentStepIndex === 3) {
    // Prix du sang : 1 décès / 5 min (ou ×10 si Grand Lieu).
    const discoursDiffCel = securite + malus;
    const succesExc       = Math.max(0, state.emeute.discoursSucces - discoursDiffCel);
    const dureeMin        = state.emeute.discoursSucces >= discoursDiffCel ? 5 * (1 + succesExc) : 0;
    const tranches        = Math.floor(dureeMin / 5);
    const tauxParTranche  = state.emeute.grandLieu ? 10 : 1;
    const morts           = tranches * tauxParTranche;
    setInnerHTML('emeuteCelebrationResult',
      "Si la Révolte est une réussite, la situation planétaire s'améliore.<br>" +
      "Les Officiers impliqués regagnent <strong>+1 PP</strong>.<br>" +
      "Les PJ gagnent <strong>+1d</strong> pour lancer une future révolte sur cette planète."
    );
    setInnerHTML('emeutePrixDuSangResult',
      `Durée : <strong>${dureeMin} min</strong> &middot; ` +
      `Décès estimés : <strong>${morts}</strong>` +
      (state.emeute.grandLieu ? ' <span class="text-orange-400 text-xs">(Grand Lieu ×10)</span>' : '')
    );
  }
}

function updateFestiveUI() {
  const malus = getMalus();
  const securite = state.securitePlanetaire;
  const pd   = state.pd;
  const totalPd            = pd.locaux + pd.pirates + pd.autres;
  const pdBonusPreparation = totalPd > 0 && pd.locaux  > pd.pirates ? 1 : 0;
  const pdBonusExecution   = totalPd > 0 && pd.pirates > pd.locaux  ? 1 : 0;
  const propagandeBonus    = state.propagande.bonusJets;
  // Le bonus de référence (refBonusD) est ajouté plus bas après lecture de nbInvitesData.
  let totalPreparationBonus = pdBonusPreparation + propagandeBonus;
  let totalExecutionBonus   = pdBonusExecution  + propagandeBonus;

  // Bonus de référence (table d'invités) — s'applique à toutes les actions pendant la fête.
  //   10 inv → aucun ; 100 → +1d ; 1000 → TF ; 10000 → TF.
  const nbInvitesData = {
    10:    { cout: 250,    diff: 1, refBonus: 0,     gloire_diff: 1 },
    100:   { cout: 2500,   diff: 3, refBonus: '+1d', gloire_diff: 3 },
    1000:  { cout: 25000,  diff: 5, refBonus: 'TF',  gloire_diff: 5 },
    10000: { cout: 250000, diff: 8, refBonus: 'TF',  gloire_diff: 8 },
  };
  const invitesData = nbInvitesData[state.festive.nbInvites] || nbInvitesData[10];
  const refBonusD  = invitesData.refBonus === '+1d' ? 1 : 0;
  const refBonusTF = invitesData.refBonus === 'TF';
  // Le bonus de référence s'applique à TOUTES les actions de la fête (préparation + exécution).
  totalPreparationBonus += refBonusD;
  totalExecutionBonus   += refBonusD;

  // Step 1 prep calcs (always update badges even if on step 2/3 for sidebar)
  let autorisationDiff = 0;
  const autorisationRow = document.getElementById('autorisationRow');
  if (state.festive.lieuFete === 'vaisseau_nature') {
    autorisationRow?.classList.add('hidden');
  } else {
    autorisationDiff = securite + malus;
    autorisationRow?.classList.remove('hidden');
  }
  const autorisationSkill = state.festive.lieuFete === 'lieu_illegale' ? 'Illégalités' : 'Étiquette';

  const preparationDiff   = invitesData.diff + malus;
  const rassemblementDiff = 3 + malus;

  setInnerHTML('autorisationTestLabel',  autorisationSkill);
  setInnerHTML('rassemblementTestLabel', 'Rassemblement');
  setInnerHTML('preparerLieuTestLabel',  'Préparer le lieu');
  // Affichage du bonus de référence (TF affiché en suffixe puisque setDiffBadge ne gère que des nombres)
  const tfTag = refBonusTF ? ' <span class="text-green-300 text-xs font-bold">TF</span>' : '';
  if (tfTag) {
    setInnerHTML('autorisationTestLabel',  autorisationSkill   + tfTag);
    setInnerHTML('rassemblementTestLabel', 'Rassemblement'     + tfTag);
    setInnerHTML('preparerLieuTestLabel',  'Préparer le lieu'  + tfTag);
  }
  setDiffBadge('autorisationDiffBadge',  autorisationDiff,  totalPreparationBonus);
  setDiffBadge('rassemblementDiffBadge', rassemblementDiff, totalPreparationBonus);
  setDiffBadge('preparerLieuDiffBadge',  preparationDiff,   totalPreparationBonus);

  setTrackerStatus('autorisationTestSucces',  state.festive.autorisationTestSucces,  autorisationDiff);
  setTrackerStatus('rassemblementTestSucces', state.festive.rassemblementTestSucces, rassemblementDiff);
  setTrackerStatus('preparerLieuTestSucces',  state.festive.preparerLieuTestSucces,  preparationDiff);

  const rassemblementSuccesExc = Math.max(0, state.festive.rassemblementTestSucces - rassemblementDiff);
  const rassemblementReussi    = rassemblementSuccesExc >= invitesData.diff;
  const prepaLieuReussi        = state.festive.preparerLieuTestSucces >= preparationDiff;
  const autorisationReussie    = state.festive.lieuFete === 'vaisseau_nature' || state.festive.autorisationTestSucces >= autorisationDiff;

  // prepaFestiveResult = coût + résumé lieu
  setInnerHTML('prepaFestiveResult', `Matériel acheté : <strong>${invitesData.cout.toLocaleString('fr-FR')} Ø</strong>.`);

  let prepResultText = `Préparation du lieu : ${prepaLieuReussi ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
  prepResultText += `Rassemblement des invités : ${rassemblementReussi ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
  if (state.festive.lieuFete !== 'vaisseau_nature') {
    prepResultText += `Obtention de l'autorisation : ${autorisationReussie ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
  }
  prepResultText += `<hr class="my-2 border-gray-600"><strong>Recruter des invités de marque :</strong> ` +
    `Étiquette ou Illégalités (${3 + malus}). Gloire min &lt; ${invitesData.gloire_diff}.`;
  setInnerHTML('prepaFestiveDetails', prepResultText);

  if (state.currentStepIndex === 2) {
    const appelDiff = invitesData.diff + malus;
    setInnerHTML('appelFestiveLabel', `Appel Révolution Festive${tfTag}`);
    setDiffBadge('appelFestiveDiffBadge', appelDiff, totalExecutionBonus);
    setTrackerStatus('appelFestiveSucces', state.festive.appelFestiveSucces, appelDiff);
    const appelReussi = state.festive.appelFestiveSucces >= appelDiff;
    state.festive.estReussie = appelReussi;
    setInnerHTML('festiveExecutionResult',
      appelReussi
        ? '<strong class="text-green-400">Appel réussi ! La fête commence et dure entre 6 et 10 heures.</strong>'
        : '<strong class="text-red-400">Appel échoué. Coût : 1 PP pour une nouvelle tentative.</strong>'
    );
  }

  if (state.currentStepIndex === 3) {
    if (state.festive.estReussie) {
      setInnerHTML('festiveCelebrationResult',
        `La Révolution festive est un succès. Les officiers impliqués récupèrent chacun <strong>1 PP</strong>.`
      );
      setInnerHTML('festiveContreRevolutionResult', '<strong>Prix du sang :</strong> Aucun décès, sauf en cas de rixe.');
    } else {
      setInnerHTML('festiveCelebrationResult',
        `La Révolution festive a échoué. Aucun PP n'est récupéré.`
      );
      setInnerHTML('festiveContreRevolutionResult',
        `<strong>Conséquences :</strong> La fête a été dispersée par les autorités.`
      );
    }
  }
}

function updateMutinerieUI() {
  const s = state.mutinerie;
  const tonnageCosts = { 100: 1, 1000: 5, 10000: 8, 100000: 10 };
  setInnerHTML('mutinerieCostResult',
    `Coût pour déclencher : <strong>${tonnageCosts[s.tonnage] ?? 1} PP</strong> (dépense).`
  );

  // Affiche le vaisseau lié (si référencé) pour rappeler la source du tonnage
  const lr   = state.locationRef || {};
  const ship = lr.shipId ? (_worldShips || []).find(x => String(x.id) === String(lr.shipId)) : null;
  const shipInfoEl = document.getElementById('mutinerie-ship-info');
  if (shipInfoEl) {
    if (ship) {
      const ton = Number(ship?.model?.tonnage) || 0;
      shipInfoEl.innerHTML = `🔒 Vaisseau lié : <strong>${escHtml(ship.name)}</strong>` +
        (ton ? ` (${ton.toLocaleString('fr-FR')}t — tonnage verrouillé)` : '');
      shipInfoEl.classList.remove('hidden');
    } else {
      shipInfoEl.classList.add('hidden');
    }
  }

  // Tracker badges (always visible)
  setTrackerStatus('mutinerieEloquencePoste',   s.eloquencePoste,   3);
  setTrackerStatus('mutinerieEloquenceCambuse', s.eloquenceCambuse, 2);
  setTrackerStatus('mutinerieDiscretion',       s.discretion,       1);
  setTrackerStatus('mutinerieTactique',         s.tactique,         3);

  if (state.currentStepIndex >= 1) {
    // Règle: chaque test d'Éloquence réussi recrute 1 mutin + 1 par succès excédentaire.
    const mutinsPoste   = s.eloquencePoste   >= 3 ? 1 + (s.eloquencePoste   - 3) : 0;
    const mutinsCambuse = s.eloquenceCambuse >= 2 ? 1 + (s.eloquenceCambuse - 2) : 0;
    const totalMutins   = mutinsPoste + mutinsCambuse;
    const masseCritique = s.tonnage / 100;
    const aMasseCritique = totalMutins >= masseCritique;
    setInnerHTML('mutinerieRalliementResult',
      `Mutins recrutés ce jour : <strong>${totalMutins}</strong>. ` +
      `Masse critique (${masseCritique} mutins) : ${aMasseCritique
        ? '<strong class="text-green-400">Atteinte</strong>'
        : '<strong class="text-red-400">Non atteinte</strong>'}.`
    );
    const planBonus = Math.max(0, s.tactique - 3);
    setInnerHTML('mutineriePlanificationResult',
      `Bonus aux tentatives de "Progresser" : <strong class="text-green-400">+${planBonus}d</strong>`
    );
  }

  if (state.currentStepIndex === 2) {
    const appelDiff      = parseInt(s.location, 10) || 1;
    const conditionsBonus = s.conditionsFavorables ? 1 : 0;
    setInnerHTML('mutinerieAppelLabel', `Appel à la Mutinerie`);
    setDiffBadge('mutinerieAppelDiffBadge', appelDiff, conditionsBonus);
    setTrackerStatus('mutinerieAppelSucces', s.appelSucces, appelDiff);
    const succesExc = Math.max(0, s.appelSucces - appelDiff);
    const duree = 5 * succesExc;
    setInnerHTML('mutinerieExecutionResult',
      s.appelSucces >= appelDiff
        ? `<span class="text-green-400">Réussi !</span> La mutinerie dure <strong>${duree} minutes</strong>. Le vaisseau est en alerte orange.`
        : `<span class="text-red-400">Échec !</span> L'appel n'est pas suivi.`
    );
  }

  if (state.currentStepIndex === 3) {
    const recompense = s.tonnage >= 10000 ? 2 : 1;
    setInnerHTML('mutinerieRecompensesResult',
      `Chaque officier récupère <strong>${recompense} PP</strong>.`
    );
    const appelDiff   = parseInt(s.location, 10) || 1;
    const succesExc   = Math.max(0, s.appelSucces - appelDiff);
    const dureeMin    = 5 * succesExc;
    const tranches    = Math.floor(dureeMin / 5);
    const morts       = s.tonnage > 100 ? Math.floor(s.tonnage / 200) * tranches : 0;
    setInnerHTML('mutineriePrixDuSangResult', `Décès estimés : <strong>${morts}</strong>.`);
    const wantedLevel = s.tonnage >= 10000 ? -3 : -1;
    setInnerHTML('mutinerieContreRevolutionResult',
      `Les mutins sont désormais <strong>Wanted (${wantedLevel})</strong> par la nation d'origine du vaisseau.`
    );
  }
}

function updateRevolutionPrepUI() {
  const malus = getMalus();
  const rev   = state.revolution;

  // 1. Lieux de Pouvoir (carte lecture seule + bouton Modifier déverrouille un lieu)
  const powerPlaceList = document.getElementById('powerPlaceList');
  if (powerPlaceList) {
    // Mémoriser l'index en cours d'édition pour ne pas le perdre au re-render
    const editingIdx = powerPlaceList.dataset.editingIdx ? parseInt(powerPlaceList.dataset.editingIdx, 10) : -1;
    powerPlaceList.innerHTML = '';
    rev.powerPlaces.forEach((place, index) => {
      const isEditing = index === editingIdx;
      const stateBadge = place.isCaptured
        ? '<span class="text-green-400 text-xs font-bold">✓ Capturé</span>'
        : '<span class="text-yellow-400 text-xs">⚔ À conquérir</span>';
      const qgBadge = place.isQG ? '<span class="text-purple-300 text-xs ml-2">★ QG</span>' : '';

      const el = document.createElement('div');
      el.className = 'bg-gray-800 p-3 rounded border border-gray-700';
      if (!isEditing) {
        el.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <strong class="text-base">${escHtml(place.name || '(sans nom)')}</strong>
                ${qgBadge}
                ${stateBadge}
              </div>
              ${place.desc ? `<p class="text-xs text-gray-300 mt-1">${escHtml(place.desc)}</p>` : ''}
            </div>
            <div class="flex flex-col gap-1 flex-shrink-0">
              <button class="pp-edit-btn text-xs bg-gray-700 hover:bg-gray-600 text-blue-300 px-2 py-1 rounded" data-index="${index}" title="Modifier ce lieu">✎ Modifier</button>
              <button class="remove-place-btn text-xs text-red-400 hover:text-red-300" data-index="${index}" title="Retirer">× Retirer</button>
            </div>
          </div>`;
      } else {
        el.innerHTML = `
          <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
            <div class="md:col-span-5">
              <label class="block text-xs text-gray-400">Nom</label>
              <input type="text" class="pp-edit-name revolte-input w-full" data-index="${index}" value="${escHtml(place.name)}">
            </div>
            <div class="md:col-span-5">
              <label class="block text-xs text-gray-400">Description</label>
              <input type="text" class="pp-edit-desc revolte-input w-full" data-index="${index}" value="${escHtml(place.desc || '')}">
            </div>
            <div class="md:col-span-2 flex flex-col gap-1 pt-4">
              <label class="text-xs text-gray-300 cursor-pointer flex items-center gap-1">
                <input type="checkbox" class="pp-edit-qg revolte-input" data-index="${index}" ${place.isQG ? 'checked' : ''}> QG
              </label>
              <label class="text-xs text-gray-300 cursor-pointer flex items-center gap-1" title="Marqué capturé manuellement (indépendant des 4 étapes d'assaut)">
                <input type="checkbox" class="capture-place-check revolte-input" data-index="${index}" ${place.isCaptured ? 'checked' : ''}> Capturé
              </label>
              <button class="pp-save-btn text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded mt-1" data-index="${index}">✓ OK</button>
            </div>
          </div>`;
      }
      powerPlaceList.appendChild(el);
    });
  }

  const capturedPlaces = rev.powerPlaces.filter(p => p.isCaptured).length;
  const qgMalus = rev.powerPlaces.filter(p => p.isQG && !p.isCaptured).length;
  setInnerHTML('powerPlaceResult',
    `Lieux capturés : <strong>${capturedPlaces} / ${rev.powerPlaces.length}</strong>. ` +
    `Malus QG actuel : <strong class="text-red-400">D+${qgMalus}</strong>`
  );

  const totalPrepMalus = malus + qgMalus;
  const prepBonus      = rev.allies.reduce((a, al) => a + (al.gloire || 0), 0);
  const execBonus      = rev.allies.reduce((a, al) => a + (al.grade || 0), 0);
  const mfCostIncrease = rev.allies.reduce((a, al) => a + (al.statut || 0), 0);
  const tresor         = rev.allies.reduce((a, al) => a + ((al.riche || 0) * 100) + ((al.grade || 0) * 100), 0);

  // 2. Allies
  const allyListDiv = document.getElementById('allyList');
  if (allyListDiv) {
    allyListDiv.innerHTML = '';
    rev.allies.forEach((ally, index) => {
      const stats = [];
      if (ally.gloire > 0)  stats.push(`Gloire: ${ally.gloire}`);
      if (ally.grade > 0)   stats.push(`Grade: ${ally.grade}`);
      if (ally.statut > 0)  stats.push(`Statut: ${ally.statut}`);
      if (ally.riche > 0)   stats.push(`Riche: ${ally.riche}`);
      const el = document.createElement('div');
      el.className = 'flex justify-between items-center bg-gray-800 p-2 rounded text-sm';
      el.innerHTML = `
        <div class="flex-grow">
          <strong>${escHtml(ally.name)}</strong>
          <span class="text-xs text-gray-400 ml-1">(${stats.join(', ') || 'Aucun atout'}${ally.isPD ? ' — <strong class="text-yellow-400">PD</strong>' : ''})</span>
        </div>
        <button class="remove-ally-btn text-red-400 hover:text-red-300 text-lg leading-none ml-2" data-index="${index}">×</button>
      `;
      allyListDiv.appendChild(el);
    });
  }

  setInnerHTML('allyBonusResult', `
    <ul class="list-disc list-inside space-y-0.5">
      <li>Bonus aux actions de Préparation : <strong class="text-green-400">+${prepBonus}d</strong></li>
      <li>Bonus aux tests d'Exécution : <strong class="text-green-400">+${execBonus}d</strong></li>
      <li>Augmentation du coût des MF : <strong class="text-blue-400">+${mfCostIncrease}d MF</strong></li>
      <li>Trésor de guerre / mois : <strong class="text-yellow-400">${tresor.toLocaleString('fr-FR')} Ø</strong></li>
    </ul>
  `);

  // 3. Insurgents
  const securite = state.securitePlanetaire;
  const recrutementDiff = securite + totalPrepMalus;
  setInnerHTML('recrutementLabel', `Recrutement (Éloquence)`);
  setDiffBadge('recrutementDiffBadge', recrutementDiff, prepBonus);
  setTrackerStatus('recrutementSucces', rev.recrutementSucces, recrutementDiff);

  const recruitedSections     = Math.max(0, rev.recrutementSucces - recrutementDiff);
  const totalInsurgentSections = rev.currentSections + recruitedSections;
  const popInBillions          = state.population;
  const popRow = [...POPULATION_DATA].reverse().find(row => popInBillions >= row.pop) || POPULATION_DATA[0];
  const insurgentRow = totalInsurgentSections > 0
    ? ([...POPULATION_DATA].reverse().find(row => totalInsurgentSections >= row.sections) || POPULATION_DATA[0])
    : { sections: 0, insurgents: 0 };

  const popIndex       = POPULATION_DATA.indexOf(popRow);
  const insurgentIndex = POPULATION_DATA.indexOf(insurgentRow);
  let insurgentBonusMalus = '';
  if      (insurgentIndex >= popIndex + 2)                insurgentBonusMalus = '<strong class="text-green-400">(TF)</strong>';
  else if (insurgentIndex >= popIndex + 1)                insurgentBonusMalus = '<strong class="text-green-400">(+1d)</strong>';
  else if (insurgentIndex <= popIndex - 2 && popIndex > 1) insurgentBonusMalus = '<strong class="text-red-400">(TD)</strong>';
  else if (insurgentIndex <= popIndex - 1 && popIndex > 0) insurgentBonusMalus = '<strong class="text-red-400">(D+1)</strong>';

  const totalInsurgents = insurgentRow.sections > 0
    ? Math.round((totalInsurgentSections / insurgentRow.sections) * insurgentRow.insurgents) : 0;
  const autoRecruit = securite > 0 ? Math.floor(totalInsurgentSections / securite) : 0;

  setInnerHTML('insurgentInfo', `
    <ul class="list-disc list-inside space-y-0.5">
      <li>Sections actuelles : <strong>${rev.currentSections}</strong></li>
      <li>Sections recrutées : <strong>${recruitedSections}</strong></li>
      <hr class="my-1 border-gray-600">
      <li>Total de sections : <strong>${totalInsurgentSections}</strong> ${insurgentBonusMalus}</li>
      <li>Combattants estimés : <strong>~${totalInsurgents.toLocaleString('fr-FR')}</strong></li>
      <li>Auto-recrutement (seuil ${securite} sections) : <strong>${autoRecruit}</strong>/mois</li>
      <li>Trésor de guerre / mois : <strong class="text-yellow-400">${(totalInsurgentSections * 100).toLocaleString('fr-FR')} Ø</strong></li>
      <li>Vaisseaux disponibles : <strong>${totalInsurgentSections}</strong></li>
    </ul>
  `);

  // 4. Troop quality
  const quality     = String(rev.troopQuality);
  const qualityInfo = TROOP_QUALITY_LEVELS[quality] || TROOP_QUALITY_LEVELS['0'];
  const tqDiv = document.getElementById('troopQualityResult');
  if (tqDiv) {
    tqDiv.textContent  = qualityInfo.label;
    tqDiv.className    = `text-center text-xl font-bold mb-3 ${qualityInfo.color}`;
  }

  // 5. Sensibilisation
  const discoursDiff      = securite + totalPrepMalus;
  const tractsDiff        = securite + totalPrepMalus;
  const comprehensionDiff = 3 + totalPrepMalus;
  setInnerHTML('discoursPeupleLabel',      `Discours de rue`);
  setInnerHTML('tractsPeupleLabel',        `Tracts et affiches`);
  setInnerHTML('comprehensionPeupleLabel', `Compréhension du peuple`);
  setDiffBadge('discoursPeupleDiffBadge',      discoursDiff,      prepBonus);
  setDiffBadge('tractsPeupleDiffBadge',        tractsDiff,        prepBonus);
  setDiffBadge('comprehensionPeupleDiffBadge', comprehensionDiff, prepBonus);
  setTrackerStatus('discoursPeupleSucces',      rev.sensibilisation.discours,      discoursDiff);
  setTrackerStatus('tractsPeupleSucces',        rev.sensibilisation.tracts,        tractsDiff);
  setTrackerStatus('comprehensionPeupleSucces', rev.sensibilisation.comprehension, comprehensionDiff);

  const totalSensBonus = Math.max(0, rev.sensibilisation.discours     - discoursDiff)
                       + Math.max(0, rev.sensibilisation.tracts       - tractsDiff)
                       + Math.max(0, rev.sensibilisation.comprehension - comprehensionDiff);
  setInnerHTML('sensibilisationResult',
    `Total des dés bonus pour l'insurrection finale : <strong class="text-green-400">+${totalSensBonus}d</strong>`
  );

  // 6. Special actions
  let specialText = 'Aucun bonus spécial actif.';
  const bonuses = [];
  if (rev.special.secret) bonuses.push('Bonus pour divulgation de secret (MJ évalue)');
  if (rev.special.tech)   bonuses.push('Bonus de bouleversement technologique (SC aux tests de prép. pour 1 mois)');
  if (bonuses.length > 0) specialText = bonuses.join('<br>');
  setInnerHTML('specialActionsResult', specialText);

  // Rebuild assault section
  buildAssaultSection();
}

function buildAssaultSection() {
  const container = document.getElementById('assault-section');
  if (!container) return;
  const rev = state.revolution;

  if (rev.powerPlaces.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500">Ajoutez des Lieux de Pouvoir dans la Préparation.</p>';
    return;
  }

  const malus       = getMalus();
  const baseDiff    = state.securitePlanetaire + malus;

  container.innerHTML = rev.powerPlaces.map((place, i) => {
    // Backfill structure for legacy data
    if (!place.assault) place.assault = {};
    const a = Object.assign({ atteindre: 0, entrer: 0, dirigeant: 0, reddition: 0 }, place.assault);
    if (place.isPersonnageNomme === undefined) place.isPersonnageNomme = true;
    const nomMalus = place.isPersonnageNomme ? 0 : 1;
    const stepDiff = baseDiff + nomMalus;

    // Compute step statuses
    const stepDone = {
      atteindre: a.atteindre >= stepDiff,
      entrer:    a.entrer    >= stepDiff,
      dirigeant: a.dirigeant >= stepDiff,
      reddition: a.reddition >= stepDiff,
    };
    const allDone = stepDone.atteindre && stepDone.entrer && stepDone.dirigeant && stepDone.reddition;
    // Auto-marque "capturé" UNIQUEMENT si les 4 étapes sont validées.
    // L'utilisateur garde le contrôle manuel (peut décocher après, ou cocher sans faire les 4).
    if (allDone) place.isCaptured = true;

    // Sections lost on each failed step (succès manquants)
    const lostFor = (val) => val > 0 && val < stepDiff ? (stepDiff - val) : 0;
    const totalLostHere = lostFor(a.atteindre) + lostFor(a.entrer) + lostFor(a.dirigeant) + lostFor(a.reddition);

    const stepHtml = (key, label, comp) => {
      const v = a[key];
      const status = v === 0 ? '⏳' : (v >= stepDiff ? '✅' : '❌');
      return `
        <div class="assault-step ${stepDone[key] ? 'done' : ''}">
          <div class="assault-step-header">
            <span class="text-xs font-semibold">${label}</span>
            <span class="text-xs text-gray-400">${comp} · diff ${stepDiff}</span>
            <span class="ml-auto text-xs">${status}</span>
          </div>
          <div class="flex items-center gap-2 mt-1">
            <input type="number" min="0" value="${v}"
                   class="assault-roll-input revolte-input w-20" data-index="${i}" data-action="${key}">
            <button class="revolte-dice-btn assault-step-btn" data-index="${i}" data-action="${key}" data-comp="${comp}"
                    title="Lancer ${comp}">🎲</button>
          </div>
        </div>`;
    };

    return `
      <div class="bg-gray-800 rounded p-3 text-sm assault-card ${place.isCaptured ? 'captured' : ''}">
        <div class="flex items-start justify-between mb-2 gap-2">
          <div class="flex-1">
            <div class="font-semibold">${escHtml(place.name)} ${place.isQG ? '<span class="text-xs text-red-400">[QG]</span>' : ''}</div>
            ${place.desc ? `<div class="text-xs text-gray-400">${escHtml(place.desc)}</div>` : ''}
          </div>
          <label class="text-xs text-gray-300 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                 title="Si non coché, D+1 à tous les tests d'assaut (personnage nommé requis pour Atteindre dirigeant / Reddition)">
            <input type="checkbox" class="place-nomme-check revolte-input" data-index="${i}" ${place.isPersonnageNomme ? 'checked' : ''}>
            Perso. nommé
          </label>
        </div>
        <div class="assault-grid">
          ${stepHtml('atteindre', '① Atteindre',         'Tactique')}
          ${stepHtml('entrer',    '② Entrer',            'Commandement')}
          ${stepHtml('dirigeant', '③ Atteindre dirigeant','Combat')}
          ${stepHtml('reddition', '④ Reddition',         'Combat')}
        </div>
        <div class="mt-2 text-xs flex items-center justify-between">
          <span class="${place.isCaptured ? 'text-green-400 font-semibold' : 'text-gray-500'}">
            ${place.isCaptured ? '✅ Lieu capturé' : '⏳ En cours'}
          </span>
          ${totalLostHere > 0
            ? `<span class="text-red-400">Sections perdues ici : ${totalLostHere}</span>`
            : ''}
        </div>
      </div>
    `;
  }).join('');

  // Aggregate sections lost across all places
  let totalLost = 0;
  rev.powerPlaces.forEach((p) => {
    const a = p.assault || {};
    const stepDiff = baseDiff + (p.isPersonnageNomme ? 0 : 1);
    ['atteindre', 'entrer', 'dirigeant', 'reddition'].forEach(k => {
      if (a[k] > 0 && a[k] < stepDiff) totalLost += (stepDiff - a[k]);
    });
  });
  rev.execution.sectionsLost = totalLost;

  const lostEl = document.getElementById('sections-lost-summary');
  if (lostEl) {
    lostEl.innerHTML = totalLost > 0
      ? `Pertes cumulées (assauts échoués) : <strong class="text-red-400">${totalLost} sections</strong>`
      : 'Aucune perte pour le moment.';
  }
}

function updateRevolutionExecutionUI() {
  const malus = getMalus();
  const rev   = state.revolution;

  const qgMalus        = rev.powerPlaces.filter(p => p.isQG && !p.isCaptured).length;
  const totalPrepMalus = malus + qgMalus;
  const securite       = state.securitePlanetaire;

  const discoursDiff      = securite + totalPrepMalus;
  const tractsDiff        = securite + totalPrepMalus;
  const comprehensionDiff = 3 + totalPrepMalus;
  const totalSensBonus  = Math.max(0, rev.sensibilisation.discours     - discoursDiff)
                        + Math.max(0, rev.sensibilisation.tracts       - tractsDiff)
                        + Math.max(0, rev.sensibilisation.comprehension - comprehensionDiff);

  const recrutementDiff    = securite + totalPrepMalus;
  const recruitedSections  = Math.max(0, rev.recrutementSucces - recrutementDiff);
  const totalSections      = rev.currentSections + recruitedSections;
  const qualityInfo        = TROOP_QUALITY_LEVELS[String(rev.troopQuality)] || TROOP_QUALITY_LEVELS['0'];
  const execBonusAllies    = rev.allies.reduce((a, al) => a + (al.grade || 0), 0);

  setInnerHTML('execution-summary', `
    <ul class="list-disc list-inside space-y-0.5">
      <li>Bonus de sensibilisation : <strong class="text-green-400">+${totalSensBonus}d</strong></li>
      <li>Sections d'insurgés : <strong>${totalSections}</strong></li>
      <li>Qualité des troupes : <strong class="${qualityInfo.color}">${qualityInfo.label}</strong></li>
      <li>Bonus des alliés gradés : <strong class="text-green-400">+${execBonusAllies}d</strong></li>
    </ul>
  `);

  const pdBonusExecution = (state.pd.pirates > state.pd.locaux) ? 1 : 0;
  const totalExecBonus   = pdBonusExecution + state.propagande.bonusJets + execBonusAllies + totalSensBonus;
  const appelDiff        = securite + malus;

  setInnerHTML('appelRevolteLabel', `Appel à la Révolte`);
  setDiffBadge('appelRevolteDiffBadge', appelDiff, totalExecBonus);
  setTrackerStatus('appelRevolteSucces', rev.execution.appelSucces, appelDiff);
  setInnerHTML('appelRevolteResult',
    rev.execution.appelSucces >= appelDiff
      ? `<span class="text-green-400">Réussi !</span> L'insurrection commence !`
      : `<span class="text-red-400">Échec !</span> Coût : 1 PP pour une nouvelle tentative.`
  );

  const capturedCount = rev.powerPlaces.filter(p => p.isCaptured).length;
  const totalPlaces   = rev.powerPlaces.length;
  let redditionDiff   = securite + malus;
  if (totalPlaces > 0) {
    if (capturedCount === totalPlaces)         redditionDiff = 0;
    else if (capturedCount >= totalPlaces / 2) redditionDiff += 1;
    else if (capturedCount > 0)                redditionDiff = 'TD';
  }

  setInnerHTML('intimidationRedditionLabel', `Reddition des Autorités`);
  setDiffBadge('intimidationDiffBadge', redditionDiff === 'TD' ? 'TD' : redditionDiff, totalExecBonus);
  setTrackerStatus('intimidationRedditionSucces', rev.execution.intimidationSucces, redditionDiff === 'TD' ? securite + malus + 1 : redditionDiff);

  let redditionText = 'En attente du résultat...';
  if (redditionDiff === 0) {
    redditionText = `<span class="text-green-400">Victoire !</span> Les autorités se rendent.`;
  } else if (redditionDiff !== 'TD' && rev.execution.intimidationSucces >= redditionDiff) {
    redditionText = `<span class="text-green-400">Réussi !</span> Les autorités acceptent de négocier leur reddition.`;
  } else if (redditionDiff === 'TD' && rev.execution.intimidationSucces > securite + malus) {
    redditionText = `<span class="text-green-400">Réussi !</span> Les autorités acceptent de négocier leur reddition.`;
  }
  setInnerHTML('intimidationRedditionResult', redditionText);
}

function updateRevolutionCelebrationUI() {
  const malus = getMalus();
  const rev   = state.revolution;

  const selectEl = document.getElementById('nouveauDirigeantSelect');
  if (selectEl) {
    const currentVal = selectEl.value;
    selectEl.innerHTML = '<option value="">-- Candidats PD locaux --</option>';
    // Règle: le nouveau dirigeant doit être un PD local.
    const candidates = state.pdList.locaux.map(e => ({ ...e, cat: 'Local' }));
    candidates.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nom;
      opt.textContent = `[${c.cat}] ${c.nom}`;
      selectEl.appendChild(opt);
    });
    // Restore previous selection if still valid
    if (currentVal && candidates.some(c => c.nom === currentVal)) selectEl.value = currentVal;
  }

  const sciencesDiff = 3;
  setInnerHTML('sciencesSolairesLabel', `Sciences Solaires`);
  setDiffBadge('sciencesSolairsDiffBadge', sciencesDiff, state.propagande.bonusJets);
  setTrackerStatus('sciencesSolairesSucces', rev.celebration.sciencesSolairesSucces, sciencesDiff);

  let ppGain = 0, pgGain = 0;
  switch (rev.scope) {
    case 'planetaire': ppGain = 1; pgGain = 1; break;
    case 'locale':     ppGain = 2; pgGain = 2; break;
    case 'stellaire':  ppGain = 3; pgGain = 3; break;
  }
  setInnerHTML('recompensesResult',
    `Chaque officier de la révolte gagne <strong>${ppGain} PP</strong> et <strong>${pgGain} PG</strong>.`
  );

  const qgMalus        = rev.powerPlaces.filter(p => p.isQG && !p.isCaptured).length;
  const totalPrepMalus = malus + qgMalus;
  const securite       = state.securitePlanetaire;
  const recrutementDiff = securite + totalPrepMalus;
  const recruitedSections = Math.max(0, rev.recrutementSucces - recrutementDiff);
  const totalSections   = rev.currentSections + recruitedSections;

  const discoursDiff      = securite + totalPrepMalus;
  const tractsDiff        = securite + totalPrepMalus;
  const comprehensionDiff = 3 + totalPrepMalus;
  const totalSensBonus  = Math.max(0, rev.sensibilisation.discours     - discoursDiff)
                        + Math.max(0, rev.sensibilisation.tracts       - tractsDiff)
                        + Math.max(0, rev.sensibilisation.comprehension - comprehensionDiff);

  const morts   = (totalSections + totalSensBonus) * 1000 * rev.celebration.joursDeCombat;
  const blesses = morts * 10;
  setInnerHTML('prixDuSangResult',
    `Morts estimés : <strong>${morts.toLocaleString('fr-FR')}</strong><br>` +
    `Blessés estimés : <strong>${blesses.toLocaleString('fr-FR')}</strong>`
  );
}

// ── Event Listeners binding ────────────────────────────────────────────────────
function addListener(id, event, callback) {
  document.getElementById(id)?.addEventListener(event, callback);
}

function bindAll() {
  // Progress steps
  document.querySelectorAll('.progress-step').forEach(step => {
    step.addEventListener('click', () => {
      if (!currentSessionId) return;
      navigateTo(parseInt(step.dataset.step, 10));
    });
  });

  // Export CR
  addListener('export-cr-btn', 'click', () => exportCR());

  // Calendrier galactique
  addListener('calendar-event-btn', 'click', () => createCalendarEvent());

  // Paramétrage
  addListener('revolteType', 'change', e => {
    state.revolteType = e.target.value;
    navigateTo(state.currentStepIndex);
    refreshLocationSelects();
    // Mise à jour instantanée du libellé dans la liste de sessions (sans attendre l'autosave)
    const item = document.querySelector(`.session-item[data-id="${currentSessionId}"] .text-xs.flex-shrink-0`);
    if (item) {
      const sel = document.getElementById('revolteType');
      const opt = sel?.options[sel.selectedIndex];
      const label = opt ? opt.textContent.trim() : (TYPE_LABELS[state.revolteType] || state.revolteType);
      item.textContent = label;
      // mettre à jour aussi la couleur
      item.className = `text-xs flex-shrink-0 ${TYPE_COLORS[state.revolteType] || 'text-gray-400'}`;
    }
    scheduleAutosave();
  });
  addListener('populationInput', 'input', e => { state.population = parseFloat(e.target.value) || 0; updateUI(); scheduleAutosave(); });
  addListener('securitePlanetaireInput', 'input', e => { state.securitePlanetaire = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('revolutionScope', 'change', e => { state.revolution.scope = e.target.value; applyTypeFilter(state.revolteType); updateUI(); refreshLocationSelects(); scheduleAutosave(); });

  // Stella Bell
  addListener('stellaPorteDrapeauCheck', 'change', e => { state.stellaPropagande.porteDrapeau = e.target.checked; updateUI(); scheduleAutosave(); });
  addListener('stellaConnuCheck',        'change', e => { state.stellaPropagande.connu        = e.target.checked; updateUI(); scheduleAutosave(); });
  addListener('stellaMorteCheck',        'change', e => { state.stellaPropagande.morte        = e.target.checked; updateUI(); scheduleAutosave(); });

  // Propagande
  addListener('gloireCheck',             'change', e => { state.propagande.gloire7 = e.target.checked; updateUI(); scheduleAutosave(); });
  addListener('filmeCheck',              'change', e => { state.propagande.filme   = e.target.checked; updateUI(); scheduleAutosave(); });
  addListener('pubCheck',                'change', e => { state.propagande.pub     = e.target.checked; updateUI(); scheduleAutosave(); });
  addListener('propagandeSuccesInput',   'input',  e => { state.propagande.propagandeSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('eloquencePropagandeInput','input',  e => { state.propagande.eloquenceSucces  = parseInt(e.target.value, 10) || 0; handleBonusDistribution(); });
  addListener('bonusJets',               'input',  () => handleBonusDistribution('jets'));
  addListener('bonusDuree',              'input',  () => handleBonusDistribution('duree'));

  // PD — participant lists (add via select or free-text; remove via chip button)
  populatePdSelects(); // async, non-blocking

  document.addEventListener('click', e => {
    // Remove button inside a chip
    const removeBtn = e.target.closest('.pd-chip button[data-cat]');
    if (removeBtn) {
      removePdMember(removeBtn.dataset.cat, parseInt(removeBtn.dataset.idx, 10));
      return;
    }
    // Add button
    const addBtn = e.target.closest('.pd-add-btn[data-cat]');
    if (addBtn) {
      const cat   = addBtn.dataset.cat;
      const sel   = document.getElementById(`pdSelect-${cat}`);
      const freeI = document.getElementById(`pdFree-${cat}`);
      if (sel && sel.value) {
        const opt = sel.options[sel.selectedIndex];
        // opt.text = "[PJ] Daraness Raktar" — extract type and name
        const m = opt.text.match(/^\[(\w+)\]\s*(.*)/);
        addPdMember(cat, m ? m[2] : opt.text, m ? m[1].toLowerCase() : null, sel.value);
        sel.value = '';
      } else if (freeI && freeI.value.trim()) {
        addPdMember(cat, freeI.value.trim(), null, null);
        freeI.value = '';
      }
    }
  });

  // Allow pressing Enter in the free-text inputs
  PD_CATS.forEach(cat => {
    const freeI = document.getElementById(`pdFree-${cat}`);
    if (freeI) {
      freeI.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.querySelector(`.pd-add-btn[data-cat="${cat}"]`)?.click();
        }
      });
    }
  });

  // Emeute
  addListener('grandLieuCheck',    'change', e => { state.emeute.grandLieu     = e.target.checked;                updateUI(); scheduleAutosave(); });
  addListener('empathieTestInput', 'input',  e => { state.emeute.empathieSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('tactiqueTestInput', 'input',  e => { state.emeute.tactiqueSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('discoursTestInput', 'input',  e => { state.emeute.discoursSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });

  // Festive
  addListener('lieuFete',              'change', e => { state.festive.lieuFete = e.target.value; updateFestiveUI(); scheduleAutosave(); });
  addListener('nbInvites',             'change', e => { state.festive.nbInvites = parseInt(e.target.value, 10); updateFestiveUI(); scheduleAutosave(); });
  addListener('autorisationTestSucces','input',  e => { state.festive.autorisationTestSucces = parseInt(e.target.value, 10) || 0; updateFestiveUI(); scheduleAutosave(); });
  addListener('rassemblementTestSucces','input', e => { state.festive.rassemblementTestSucces = parseInt(e.target.value, 10) || 0; updateFestiveUI(); scheduleAutosave(); });
  addListener('preparerLieuTestSucces','input',  e => { state.festive.preparerLieuTestSucces = parseInt(e.target.value, 10) || 0; updateFestiveUI(); scheduleAutosave(); });
  addListener('appelFestiveSucces',    'input',  e => { state.festive.appelFestiveSucces = parseInt(e.target.value, 10) || 0; updateFestiveUI(); scheduleAutosave(); });

  // Mutinerie
  addListener('mutinerieTonnage',          'change', e => { state.mutinerie.tonnage           = parseInt(e.target.value, 10) || 100; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieEloquencePoste',   'input',  e => { state.mutinerie.eloquencePoste    = parseInt(e.target.value, 10) || 0; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieEloquenceCambuse', 'input',  e => { state.mutinerie.eloquenceCambuse  = parseInt(e.target.value, 10) || 0; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieDiscretion',       'input',  e => { state.mutinerie.discretion        = parseInt(e.target.value, 10) || 0; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieConditions',       'change', e => { state.mutinerie.conditionsFavorables = e.target.checked; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieTactique',         'input',  e => { state.mutinerie.tactique          = parseInt(e.target.value, 10) || 0; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieLocation',         'change', e => { state.mutinerie.location          = parseInt(e.target.value, 10) || 1; updateMutinerieUI(); scheduleAutosave(); });
  addListener('mutinerieAppelSucces',      'input',  e => { state.mutinerie.appelSucces       = parseInt(e.target.value, 10) || 0; updateMutinerieUI(); scheduleAutosave(); });

  // Revolution — power places
  addListener('addPowerPlaceBtn', 'click', () => {
    const name  = document.getElementById('powerPlaceName')?.value.trim();
    const desc  = document.getElementById('powerPlaceDesc')?.value.trim() || '';
    const isQG  = document.getElementById('powerPlaceIsQG')?.checked || false;
    if (!name) return;
    state.revolution.powerPlaces.push({ name, desc, isQG, isCaptured: false });
    ['powerPlaceName','powerPlaceDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const qgEl = document.getElementById('powerPlaceIsQG');
    if (qgEl) qgEl.checked = false;
    updateRevolutionPrepUI();
    scheduleAutosave();
  });

  document.getElementById('powerPlaceList')?.addEventListener('change', e => {
    if (e.target.classList.contains('capture-place-check')) {
      const idx = parseInt(e.target.dataset.index, 10);
      state.revolution.powerPlaces[idx].isCaptured = e.target.checked;
      updateRevolutionPrepUI();
      scheduleAutosave();
    } else if (e.target.classList.contains('pp-edit-qg')) {
      const idx = parseInt(e.target.dataset.index, 10);
      state.revolution.powerPlaces[idx].isQG = e.target.checked;
      updateRevolutionPrepUI();
      scheduleAutosave();
    }
  });

  document.getElementById('powerPlaceList')?.addEventListener('input', e => {
    if (e.target.classList.contains('pp-edit-name')) {
      const idx = parseInt(e.target.dataset.index, 10);
      state.revolution.powerPlaces[idx].name = e.target.value;
      buildAssaultSection();
      scheduleAutosave();
    } else if (e.target.classList.contains('pp-edit-desc')) {
      const idx = parseInt(e.target.dataset.index, 10);
      state.revolution.powerPlaces[idx].desc = e.target.value;
      scheduleAutosave();
    }
  });

  document.getElementById('powerPlaceList')?.addEventListener('click', e => {
    const list = document.getElementById('powerPlaceList');
    const editBtn = e.target.closest('.pp-edit-btn');
    if (editBtn) {
      list.dataset.editingIdx = editBtn.dataset.index;
      updateRevolutionPrepUI();
      return;
    }
    const saveBtn = e.target.closest('.pp-save-btn');
    if (saveBtn) {
      delete list.dataset.editingIdx;
      updateRevolutionPrepUI();
      buildAssaultSection();
      return;
    }
    const removeBtn = e.target.closest('.remove-place-btn');
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.index, 10);
      state.revolution.powerPlaces.splice(idx, 1);
      delete list.dataset.editingIdx;
      updateRevolutionPrepUI();
      scheduleAutosave();
    }
  });

  // Revolution — allies
  addListener('addAllyBtn', 'click', () => {
    const name   = document.getElementById('allyName')?.value.trim() || 'Anonyme';
    const gloire = parseInt(document.getElementById('allyGloire')?.value, 10) || 0;
    const grade  = parseInt(document.getElementById('allyGrade')?.value,  10) || 0;
    const statut = parseInt(document.getElementById('allyStatut')?.value, 10) || 0;
    const riche  = parseInt(document.getElementById('allyRiche')?.value,  10) || 0;
    const isPD   = document.getElementById('allyIsPD')?.checked || false;
    state.revolution.allies.push({ name, gloire, grade, statut, riche, isPD });
    ['allyName','allyGloire','allyGrade','allyStatut','allyRiche'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = id === 'allyName' ? '' : '0';
    });
    const isPDEl = document.getElementById('allyIsPD');
    if (isPDEl) isPDEl.checked = false;
    updateRevolutionPrepUI();
    scheduleAutosave();
  });

  document.getElementById('allyList')?.addEventListener('click', e => {
    const btn = e.target.closest('.remove-ally-btn');
    if (btn) {
      const idx = parseInt(btn.dataset.index, 10);
      state.revolution.allies.splice(idx, 1);
      updateRevolutionPrepUI();
      scheduleAutosave();
    }
  });

  // Insurgents
  addListener('currentSectionsInput', 'input', e => { state.revolution.currentSections = parseInt(e.target.value, 10) || 0; updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('recrutementSucces',    'input', e => { state.revolution.recrutementSucces = parseInt(e.target.value, 10) || 0; updateRevolutionPrepUI(); scheduleAutosave(); });

  addListener('equipTroopsBtn',      'click', () => { state.revolution.troopQuality = Math.min(2, state.revolution.troopQuality + 1); updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('trainTroopsBtn',      'click', () => { state.revolution.troopQuality = Math.min(2, state.revolution.troopQuality + 1); updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('planInsurrectionBtn', 'click', () => { state.revolution.troopQuality = Math.min(2, state.revolution.troopQuality + 1); updateRevolutionPrepUI(); scheduleAutosave(); });

  // Sensibilisation
  addListener('discoursPeupleSucces',      'input', e => { state.revolution.sensibilisation.discours      = parseInt(e.target.value, 10) || 0; updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('tractsPeupleSucces',        'input', e => { state.revolution.sensibilisation.tracts        = parseInt(e.target.value, 10) || 0; updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('comprehensionPeupleSucces', 'input', e => { state.revolution.sensibilisation.comprehension = parseInt(e.target.value, 10) || 0; updateRevolutionPrepUI(); scheduleAutosave(); });

  addListener('secretCheck', 'change', e => { state.revolution.special.secret = e.target.checked; updateRevolutionPrepUI(); scheduleAutosave(); });
  addListener('techCheck',   'change', e => { state.revolution.special.tech   = e.target.checked; updateRevolutionPrepUI(); scheduleAutosave(); });

  // Revolution execution
  addListener('appelRevolteSucces',        'input', e => { state.revolution.execution.appelSucces       = parseInt(e.target.value, 10) || 0; updateRevolutionExecutionUI(); scheduleAutosave(); });
  addListener('intimidationRedditionSucces','input',e => { state.revolution.execution.intimidationSucces = parseInt(e.target.value, 10) || 0; updateRevolutionExecutionUI(); scheduleAutosave(); });

  // Assault section (delegated) — 4 sub-steps: atteindre / entrer / dirigeant / reddition
  document.getElementById('assault-section')?.addEventListener('input', e => {
    if (e.target.classList.contains('assault-roll-input')) {
      const idx    = parseInt(e.target.dataset.index, 10);
      const action = e.target.dataset.action;
      const value  = parseInt(e.target.value, 10) || 0;
      const place  = state.revolution.powerPlaces[idx];
      if (!place) return;
      if (!place.assault) place.assault = { atteindre: 0, entrer: 0, dirigeant: 0, reddition: 0 };
      place.assault[action] = value;
      buildAssaultSection();
      updateRevolutionExecutionUI();
      scheduleAutosave();
    }
  });
  document.getElementById('assault-section')?.addEventListener('change', e => {
    if (e.target.classList.contains('place-nomme-check')) {
      const idx   = parseInt(e.target.dataset.index, 10);
      const place = state.revolution.powerPlaces[idx];
      if (!place) return;
      place.isPersonnageNomme = e.target.checked;
      buildAssaultSection();
      scheduleAutosave();
    }
  });

  // Célébration révolution
  addListener('sciencesSolairesSucces', 'input', e => { state.revolution.celebration.sciencesSolairesSucces = parseInt(e.target.value, 10) || 0; updateRevolutionCelebrationUI(); scheduleAutosave(); });
  addListener('joursDeCombatInput',     'input', e => { state.revolution.celebration.joursDeCombat           = parseInt(e.target.value, 10) || 0; updateRevolutionCelebrationUI(); scheduleAutosave(); });
  addListener('nouveauDirigeantSelect', 'change', e => { state.revolution.celebration.nouveauDirigeant = e.target.value; scheduleAutosave(); });

  // 🎲 Dice roll buttons (delegated)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.revolte-dice-btn');
    if (!btn || !currentSessionId) return;

    // Assault section buttons (4 steps: atteindre / entrer / dirigeant / reddition)
    const action = btn.dataset.action;
    if (['atteindre', 'entrer', 'dirigeant', 'reddition'].includes(action)) {
      const idx        = parseInt(btn.dataset.index, 10);
      const place      = state.revolution.powerPlaces[idx];
      const malus      = getMalus();
      const nomMalus   = place && !place.isPersonnageNomme ? 1 : 0;
      const stepDiff   = state.securitePlanetaire + malus + nomMalus;
      const compLabel  = btn.dataset.comp || 'Combat';
      const placeName  = place?.name || `Lieu ${idx + 1}`;
      const stepLabels = { atteindre: 'Atteindre', entrer: 'Entrer', dirigeant: 'Atteindre dirigeant', reddition: 'Reddition' };
      getRoller().open({
        title:    `${stepLabels[action]} — ${placeName}`,
        context:  `${compLabel} · diff ${stepDiff}${nomMalus ? ' (perso. non nommé)' : ''}`,
        diff:     stepDiff,
        lockDiff: true,
        onResult: (result) => {
          const inp = document.querySelector(`.assault-roll-input[data-index="${idx}"][data-action="${action}"]`);
          if (inp) {
            inp.value = result.succes ?? 0;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
      });
      return;
    }

    // Static test inputs
    if (btn.dataset.input) openRollForInput(btn.dataset.input);
  });

  // Location selectors
  addListener('loc-quadrant', 'change', e => {
    const q = e.target.value;
    state.locationRef.quadrant  = q;
    state.locationRef.systemId  = null;
    state.locationRef.systemNom = '';
    state.locationRef.planetId  = null;
    state.locationRef.planetNom = '';
    const sSel = document.getElementById('loc-system');
    const pSel = document.getElementById('loc-planet');
    if (sSel) sSel.innerHTML = '<option value="">— Choisir un système —</option>';
    if (pSel) pSel.innerHTML = '<option value="">— Choisir une planète —</option>';
    document.getElementById('loc-planet-row')?.classList.add('hidden');
    document.getElementById('location-info')?.classList.add('hidden');
    const t = getLocationType();
    if (q && t !== 'quadrant') {
      document.getElementById('loc-system-row')?.classList.remove('hidden');
      const filtered = (_worldSystems || []).filter(s => s.quadrant === q);
      if (sSel) {
        sSel.innerHTML = '<option value="">— Choisir un système —</option>' +
          filtered.map(s => `<option value="${s.id}">${escHtml(s.nom)}</option>`).join('');
      }
    } else {
      document.getElementById('loc-system-row')?.classList.toggle('hidden', !q || t === 'quadrant');
      if (t === 'quadrant' && q) updateLocationInfo();
    }
    const locBar = document.getElementById('editor-session-location');
    if (locBar) locBar.textContent = computeLocationRef();
    scheduleAutosave();
  });

  addListener('loc-system', 'change', async e => {
    const id  = e.target.value ? parseInt(e.target.value, 10) : null;
    const sys = (_worldSystems || []).find(s => s.id === id);
    state.locationRef.systemId  = id;
    state.locationRef.systemNom = sys?.nom || '';
    state.locationRef.planetId  = null;
    state.locationRef.planetNom = '';
    const pRow = document.getElementById('loc-planet-row');
    const pSel = document.getElementById('loc-planet');
    if (id && getLocationType() === 'planet') {
      const planets = await ensurePlanets(id);
      pRow?.classList.remove('hidden');
      if (pSel) {
        pSel.innerHTML = '<option value="">— Choisir une planète —</option>' +
          planets.map(p => `<option value="${p.id}">${escHtml(p.nom)}</option>`).join('');
      }
    } else {
      pRow?.classList.add('hidden');
    }
    document.getElementById('location-info')?.classList.add('hidden');
    if (id) updateLocationInfo();
    const locBar = document.getElementById('editor-session-location');
    if (locBar) locBar.textContent = computeLocationRef();
    scheduleAutosave();
  });

  addListener('loc-planet', 'change', e => {
    const id       = e.target.value || null;   // keep as string — may be "sys_N_i"
    const systemId = state.locationRef.systemId;
    const planets  = _worldPlanets[systemId] || [];
    const planet   = planets.find(p => p.id === id);
    state.locationRef.planetId  = id;
    state.locationRef.planetNom = planet?.nom || '';
    updateLocationInfo();
    const locBar = document.getElementById('editor-session-location');
    if (locBar) locBar.textContent = computeLocationRef();
    scheduleAutosave();
  });

  addListener('loc-ship', 'change', e => {
    const id   = e.target.value || null;
    const ship = (_worldShips || []).find(s => String(s.id) === String(id));
    state.locationRef.shipId  = id;
    state.locationRef.shipNom = ship?.name || '';
    updateLocationInfo();
    const locBar = document.getElementById('editor-session-location');
    if (locBar) locBar.textContent = computeLocationRef();
    scheduleAutosave();
  });

  // Session actions
  document.getElementById('new-session-btn')?.addEventListener('click', showNewForm);
  document.getElementById('ns-create-btn')?.addEventListener('click', createSession);
  document.getElementById('ns-cancel-btn')?.addEventListener('click', cancelNewForm);
  document.getElementById('save-btn')?.addEventListener('click', saveSession);
  document.getElementById('delete-session-btn')?.addEventListener('click', deleteSession);
  document.getElementById('mobile-back-btn')?.addEventListener('click', showSessionsPanelMobile);
  document.getElementById('editor-status')?.addEventListener('change', scheduleAutosave);
  document.getElementById('session-filter')?.addEventListener('change', loadSessionList);

  // ── Nouveaux bindings (Lot B + C) ──────────────────────────────────────────

  // QG factions hors lieux assaillis (révolution)
  addListener('qgFactionsPlanetInput', 'input', e => {
    state.qgFactionsOnPlanet = parseInt(e.target.value, 10) || 0;
    updateUI();
    scheduleAutosave();
  });

  // Registre PP — toggle panel + ajouter/retirer entrée
  document.getElementById('ppLedgerLegend')?.addEventListener('click', () => {
    document.getElementById('ppLedgerWrap')?.classList.toggle('hidden');
  });
  document.getElementById('ppEntryAddBtn')?.addEventListener('click', () => {
    const who    = document.getElementById('ppEntryWho')?.value.trim();
    const kind   = document.getElementById('ppEntryKind')?.value || 'depense';
    const amount = parseInt(document.getElementById('ppEntryAmount')?.value, 10) || 0;
    const reason = document.getElementById('ppEntryReason')?.value.trim() || '';
    if (!who || amount <= 0) return;
    state.ppLedger.push({ id: 'pp_' + Date.now(), who, kind, amount, reason, when: new Date().toISOString() });
    ['ppEntryWho', 'ppEntryAmount', 'ppEntryReason'].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'ppEntryAmount' ? '1' : ''; });
    renderPPLedger();
    updatePPCounter();
    scheduleAutosave();
  });
  document.getElementById('pp-ledger-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.pp-ledger-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (!Number.isNaN(idx)) state.ppLedger.splice(idx, 1);
    renderPPLedger();
    updatePPCounter();
    scheduleAutosave();
  });

  // Délégués
  document.getElementById('addDelegueBtn')?.addEventListener('click', () => {
    const nom     = document.getElementById('delegueNom')?.value.trim();
    const planete = document.getElementById('deleguePlanete')?.value.trim();
    const last    = parseInt(document.getElementById('delegueLastRdv')?.value, 10) || 0;
    const action  = document.getElementById('delegueAction')?.value.trim() || '';
    if (!nom) return;
    state.revolution.delegues.push({ nom, planete, lastRdvMonth: last, action });
    ['delegueNom', 'deleguePlanete', 'delegueAction'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const lastEl = document.getElementById('delegueLastRdv'); if (lastEl) lastEl.value = '0';
    renderDelegues();
    scheduleAutosave();
  });
  document.getElementById('delegues-list')?.addEventListener('click', e => {
    const wrap = document.getElementById('delegues-list');
    const editBtn = e.target.closest('.delegue-edit');
    if (editBtn) {
      wrap.dataset.editingIdx = editBtn.dataset.idx;
      renderDelegues();
      return;
    }
    const saveBtn = e.target.closest('.delegue-save');
    if (saveBtn) {
      delete wrap.dataset.editingIdx;
      renderDelegues();
      return;
    }
    const rmBtn = e.target.closest('.delegue-remove');
    if (rmBtn) {
      const idx = parseInt(rmBtn.dataset.idx, 10);
      if (!Number.isNaN(idx)) state.revolution.delegues.splice(idx, 1);
      delete wrap.dataset.editingIdx;
      renderDelegues();
      scheduleAutosave();
    }
  });
  document.getElementById('delegues-list')?.addEventListener('input', e => {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (Number.isNaN(idx)) return;
    const d = state.revolution.delegues[idx];
    if (!d) return;
    if (e.target.classList.contains('del-edit-nom'))     d.nom = e.target.value;
    else if (e.target.classList.contains('del-edit-planete')) d.planete = e.target.value;
    else if (e.target.classList.contains('del-edit-action'))  d.action = e.target.value;
    else if (e.target.classList.contains('del-edit-rdv'))     d.lastRdvMonth = parseInt(e.target.value, 10) || 0;
    scheduleAutosave();
  });

  // Insurrection Générale
  document.getElementById('addQuadrantBtn')?.addEventListener('click', () => {
    const name = document.getElementById('insurrectionQuadrantName')?.value.trim();
    if (!name) return;
    state.revolution.insurrection.quadrants.push({
      name, tests: { politique: 0, social: 0, economique: 0, securitaire: 0 },
    });
    document.getElementById('insurrectionQuadrantName').value = '';
    renderInsurrection();
    scheduleAutosave();
  });
  document.getElementById('insurrection-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.insurrection-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (!Number.isNaN(idx)) state.revolution.insurrection.quadrants.splice(idx, 1);
    renderInsurrection();
    scheduleAutosave();
  });
  document.getElementById('insurrection-list')?.addEventListener('input', e => {
    const inp = e.target.closest('.insurrection-test-input');
    if (!inp) return;
    const idx = parseInt(inp.dataset.idx, 10);
    const key = inp.dataset.key;
    const q   = state.revolution.insurrection.quadrants[idx];
    if (q) {
      q.tests = q.tests || {};
      q.tests[key] = parseInt(inp.value, 10) || 0;
      renderInsurrection();
      scheduleAutosave();
    }
  });

  // Contre-Révolution
  addListener('crTrahisonDirigeantCheck', 'change', e => { state.revolution.contreRevolution.trahisonDirigeant = e.target.checked; scheduleAutosave(); });
  addListener('crFlotteDelaiSelect',      'change', e => { state.revolution.contreRevolution.flotteDelai      = e.target.value;   scheduleAutosave(); });
  addListener('crNegociationsCheck',      'change', e => { state.revolution.contreRevolution.negociationsEnCours = e.target.checked; scheduleAutosave(); });
  addListener('crNotesInput',             'input',  e => { state.revolution.contreRevolution.notes           = e.target.value;   scheduleAutosave(); });

  // Glossaire flottant
  document.getElementById('glossaryToggleBtn')?.addEventListener('click', () => {
    document.getElementById('glossaryPanel')?.classList.toggle('hidden');
  });
}

// ── Confirm modal (remplace window.confirm) ────────────────────────────────
function showConfirm({ title = 'Confirmation requise', message = 'Êtes-vous sûr ?' } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    if (!modal) { resolve(window.confirm(message)); return; }
    const tEl = document.getElementById('confirmModalTitle');
    const mEl = document.getElementById('confirmModalMessage');
    const ok  = document.getElementById('confirmModalOk');
    const cn  = document.getElementById('confirmModalCancel');
    if (tEl) tEl.textContent = title;
    if (mEl) mEl.textContent = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const cleanup = (val) => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      ok?.removeEventListener('click', onOk);
      cn?.removeEventListener('click', onCancel);
      resolve(val);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);
    ok?.addEventListener('click', onOk);
    cn?.addEventListener('click', onCancel);
  });
}

function handleBonusDistribution(changedInput) {
  const malus = getMalus();
  const eloquenceDiff = 3 + malus;
  const totalBonus = Math.max(0, state.propagande.eloquenceSucces - eloquenceDiff);
  const bonusJetsEl  = document.getElementById('bonusJets');
  const bonusDureeEl = document.getElementById('bonusDuree');
  let bonusJets  = parseInt(bonusJetsEl?.value,  10) || 0;
  let bonusDuree = parseInt(bonusDureeEl?.value, 10) || 0;

  if (changedInput === 'jets') {
    if (bonusJets > totalBonus) bonusJets = totalBonus;
    if (bonusJets + bonusDuree > totalBonus) bonusDuree = totalBonus - bonusJets;
  } else if (changedInput === 'duree') {
    if (bonusDuree > totalBonus) bonusDuree = totalBonus;
    if (bonusJets + bonusDuree > totalBonus) bonusJets = totalBonus - bonusDuree;
  }

  state.propagande.bonusJets  = bonusJets;
  state.propagande.bonusDuree = bonusDuree;
  if (bonusJetsEl)  bonusJetsEl.value  = bonusJets;
  if (bonusDureeEl) bonusDureeEl.value = bonusDuree;
  updateUI();
  scheduleAutosave();
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  const user = await initHeader();

  const authGate    = document.getElementById('auth-gate');
  const noTableGate = document.getElementById('no-table-gate');
  const mainContent = document.getElementById('main-content');

  if (!user) {
    authGate?.classList.remove('hidden');
    return;
  }

  const tableId = getActiveTableId();
  if (!tableId) {
    authGate?.classList.add('hidden');
    noTableGate?.classList.remove('hidden');
    return;
  }

  // Check MJ role — les admins ont toujours accès au bouton de création
  currentUserIsMJ = isMJ() || !!user?.is_admin;

  authGate?.classList.add('hidden');
  noTableGate?.classList.add('hidden');
  mainContent?.classList.remove('hidden');

  // Show MJ badge + new-session-btn for MJ
  if (currentUserIsMJ) {
    document.getElementById('mj-only-badge')?.classList.remove('hidden');
    document.getElementById('new-session-btn')?.classList.remove('hidden');
    document.getElementById('calendar-event-btn')?.classList.remove('hidden');
  }

  bindAll();
  expandRuleTipsInline();   // affiche les règles sous chaque test (au lieu de tooltip)
  ensureWorldSystems(); // preload for location picker
  ensureCharacters();   // preload for PD participant selects
  await loadSessionList();
}

/**
 * Convertit chaque <abbr class="rule-tip" title="..."> en bloc d'aide visible
 * inséré dans la même tracker-row. Le ⓘ est masqué (la règle est désormais
 * affichée directement sous le label).
 */
function expandRuleTipsInline() {
  document.querySelectorAll('.tracker-row .rule-tip[title]').forEach(tip => {
    const row = tip.closest('.tracker-row');
    if (!row || row.querySelector('.tracker-help')) return;
    const help = document.createElement('span');
    help.className = 'tracker-help';
    help.textContent = tip.getAttribute('title');
    row.appendChild(help);
    tip.style.display = 'none';
  });
}

init();
