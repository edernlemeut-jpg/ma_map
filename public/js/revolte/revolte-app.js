/**
 * revolte-app.js — Gestion des Révoltes Metal Adventures
 * Architecture: sessions persistantes via API + logique de calcul locale
 */
import { initHeader } from '/js/shared/header.js';
import { fetchWithTable, isMJ, getActiveTableId } from '/js/shared/table-selector.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const POPULATION_DATA = [
  { pop: 0,      insurgents: 25000,   sections: 3   },
  { pop: 1,      insurgents: 50000,   sections: 5   },
  { pop: 5,      insurgents: 100000,  sections: 10  },
  { pop: 10,     insurgents: 200000,  sections: 20  },
  { pop: 50,     insurgents: 500000,  sections: 50  },
  { pop: 100,    insurgents: 700000,  sections: 70  },
  { pop: 200,    insurgents: 800000,  sections: 80  },
  { pop: 500,    insurgents: 1000000, sections: 100 },
  { pop: 1000,   insurgents: 1200000, sections: 120 },
  { pop: 2000,   insurgents: 1500000, sections: 150 },
  { pop: 5000,   insurgents: 2000000, sections: 200 },
  { pop: 10000,  insurgents: 2500000, sections: 250 },
  { pop: 20000,  insurgents: 3000000, sections: 300 },
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
    stellaPropagande: { porteDrapeau: false, connu: false, morte: false },
    propagande: {
      gloire7: false, filme: false, pub: false,
      propagandeSucces: 1, eloquenceSucces: 3,
      bonusJets: 0, bonusDuree: 0,
    },
    pd:       { locaux: 0, pirates: 0, autres: 0 },
    officiers: 0,
    emeute:   { grandLieu: false, empathieSucces: 1, tactiqueSucces: 1, discoursSucces: 5 },
    festive: {
      lieuFete: 'vaisseau_nature', nbInvites: 10,
      autorisationTestSucces: 0, rassemblementTestSucces: 0,
      preparerLieuTestSucces: 0, appelFestiveSucces: 0,
      estReussie: false,
    },
    mutinerie: {
      tonnage: 100, eloquencePoste: 0, eloquenceCambuse: 0,
      discretion: 1, conditionsFavorables: false, tactique: 0,
      location: 1, appelSucces: 0,
    },
    revolution: {
      scope: 'planetaire',
      allies: [],
      powerPlaces: [],
      currentSections: 0, recrutementSucces: 0, troopQuality: -2,
      sensibilisation: { discours: 0, tracts: 0, comprehension: 0 },
      special: { secret: false, tech: false },
      execution: { appelSucces: 0, intimidationSucces: 0, assaults: {}, sectionsLost: 0 },
      celebration: { sciencesSolairesSucces: 3, joursDeCombat: 1 },
    },
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
  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  const container = document.getElementById('sessions-list');
  if (!container) return;

  if (!sessions.length) {
    container.innerHTML = '<p class="text-xs text-gray-500 p-3 text-center">Aucune session</p>';
    return;
  }

  container.innerHTML = sessions.map(s => {
    const isActive = s.id === currentSessionId;
    const typeColor = TYPE_COLORS[s.type] || 'text-gray-400';
    const location  = s.location_ref ? `<div class="text-xs text-gray-500 mt-0.5 font-mono truncate">${escHtml(s.location_ref)}</div>` : '';
    return `
      <div class="session-item p-2 rounded cursor-pointer select-none ${isActive ? 'active-session' : ''}"
           data-id="${s.id}">
        <div class="flex items-start justify-between gap-1">
          <span class="font-medium text-gray-200 text-sm truncate flex-1">${escHtml(s.name)}</span>
          <span class="text-xs ${typeColor} flex-shrink-0">${TYPE_LABELS[s.type] || s.type}</span>
        </div>
        ${location}
        <div class="text-xs badge-${s.status} mt-1">${STATUS_LABELS[s.status] || s.status}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => selectSession(el.dataset.id));
  });
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
    propagande:       { ...def.propagande,       ...(loaded.propagande       || {}) },
    pd:               { ...def.pd,               ...(loaded.pd               || {}) },
    emeute:           { ...def.emeute,            ...(loaded.emeute           || {}) },
    festive:          { ...def.festive,           ...(loaded.festive          || {}) },
    mutinerie:        { ...def.mutinerie,         ...(loaded.mutinerie        || {}) },
    revolution: {
      ...def.revolution,
      ...rev,
      allies:          Array.isArray(rev.allies)      ? rev.allies      : def.revolution.allies,
      powerPlaces:     Array.isArray(rev.powerPlaces) ? rev.powerPlaces : def.revolution.powerPlaces,
      sensibilisation: { ...def.revolution.sensibilisation, ...(rev.sensibilisation || {}) },
      special:         { ...def.revolution.special,         ...(rev.special         || {}) },
      execution:       { ...def.revolution.execution,       ...(rev.execution       || {}) },
      celebration:     { ...def.revolution.celebration,     ...(rev.celebration     || {}) },
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

  setVal('pdLocaux',                  state.pd.locaux);
  setVal('pdPirates',                 state.pd.pirates);
  setVal('pdAutres',                  state.pd.autres);

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
  const body = {
    state,
    status: statusEl?.value || 'en_cours',
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
  const name     = document.getElementById('ns-name')?.value.trim();
  const type     = document.getElementById('ns-type')?.value;
  const scope    = document.getElementById('ns-scope')?.value;
  const location = document.getElementById('ns-location')?.value.trim();

  if (!name) {
    alert('Le nom est requis');
    return;
  }

  try {
    const data = await apiFetch('/api/revolte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, scope: scope || null, location_ref: location || null }),
    });

    // Reset new-form fields
    ['ns-name', 'ns-location'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    await selectSession(data.id);
  } catch (err) {
    alert(`Erreur lors de la création : ${err.message}`);
  }
}

// ── Delete a session ───────────────────────────────────────────────────────────
async function deleteSession() {
  if (!currentSessionId) return;
  const name = document.getElementById('editor-session-name')?.textContent || 'cette session';
  if (!confirm(`Supprimer « ${name} » ? Cette action est irréversible.`)) return;

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
    const type = state.revolteType;
    ['emeute', 'festive', 'mutinerie', 'revolution'].forEach(t => {
      document.getElementById(`${t}-container`)?.classList.toggle('hidden', t !== type);
    });
    const container = document.getElementById(`${type}-container`);
    if (container) {
      container.querySelectorAll('.step-content').forEach(el => {
        el.classList.toggle('hidden', parseInt(el.dataset.stepId, 10) !== stepIndex);
      });
    }
  }

  updateUI();
  scheduleAutosave();
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

  updateGlobalSettingsUI();

  if (state.currentStepIndex > 0) {
    if (type === 'emeute')      updateEmeuteUI();
    if (type === 'mutinerie')   updateMutinerieUI();
    if (type === 'festive')     updateFestiveUI();
    if (type === 'revolution') {
      if (state.currentStepIndex === 1) updateRevolutionPrepUI();
      if (state.currentStepIndex === 2) updateRevolutionExecutionUI();
      if (state.currentStepIndex === 3) updateRevolutionCelebrationUI();
    }
  }
}

function getMalus() {
  const s = state.stellaPropagande;
  return (!s.porteDrapeau || !s.connu ? 1 : 0) + (s.morte ? 1 : 0);
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

  if (state.currentStepIndex === 1) {
    const empathieDiff  = 1 + malus;
    const tactiqueDiff  = 1 + malus;
    setInnerHTML('empathieTestLabel', `Empathie (${empathieDiff})${getBonusDiceSpan(totalPreparationBonus)}`);
    setInnerHTML('tactiqueTestLabel', `Tactique (${tactiqueDiff})${getBonusDiceSpan(totalPreparationBonus)}`);
    const mfBonusTactique = Math.max(0, state.emeute.tactiqueSucces - tactiqueDiff);
    setInnerHTML('emeutePreparationResult',
      `Bonus au test d'Éloquence : <strong>+${Math.max(0, state.emeute.empathieSucces - empathieDiff)}d</strong><br>` +
      `Coût du Retour de Flamme (Sécurité) : <strong>+${mfBonusTactique}d MF</strong>.`
    );
  }

  if (state.currentStepIndex === 2) {
    const empathieDiff       = 1 + malus;
    const etatEspritBonus    = Math.max(0, state.emeute.empathieSucces - empathieDiff);
    const totalExecutionBonus = pdBonusExecution + etatEspritBonus + propagandeBonus;
    const discoursDiff       = securite + malus;
    setInnerHTML('discoursTestLabel', `Eloquence (vs ${discoursDiff})${getBonusDiceSpan(totalExecutionBonus)}`);
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
      `Coût : Verrouillage de <strong>3 PP</strong>. (Max ${totalPd || 1} PP par personne).`
    );
  }

  if (state.currentStepIndex === 3) {
    setInnerHTML('emeuteCelebrationResult',
      "Si la Révolte est une réussite, la situation planétaire s'améliore.<br>" +
      "Les Officiers impliqués regagnent <strong>+1 PP</strong>.<br>" +
      "Les PJ gagnent <strong>+1d</strong> pour lancer une future révolte sur cette planète."
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
  const totalPreparationBonus = pdBonusPreparation + propagandeBonus;
  const totalExecutionBonus   = pdBonusExecution  + propagandeBonus;

  const nbInvitesData = {
    10:    { cout: 250,    diff: 1, bonus: 0, gloire_diff: 1 },
    100:   { cout: 2500,   diff: 3, bonus: 1, gloire_diff: 3 },
    1000:  { cout: 25000,  diff: 5, bonus: 0, gloire_diff: 5 },
    10000: { cout: 250000, diff: 8, bonus: 0, gloire_diff: 8 },
  };
  const invitesData = nbInvitesData[state.festive.nbInvites] || nbInvitesData[10];

  if (state.currentStepIndex === 1) {
    let autorisationDiff = 0;
    const autorisationGroup = document.querySelector('#autorisationTestSucces')?.closest('.input-group, div');
    if (state.festive.lieuFete === 'vaisseau_nature') {
      autorisationGroup?.classList.add('hidden');
    } else {
      autorisationDiff = securite + malus;
      autorisationGroup?.classList.remove('hidden');
    }
    const autorisationSkill = state.festive.lieuFete === 'lieu_illegale' ? 'Illégalités' : 'Étiquette';

    const preparationDiff  = invitesData.diff + malus;
    const rassemblementDiff = 3 + malus;

    setInnerHTML('autorisationTestLabel',    `Test d'autorisation : ${autorisationSkill} (${autorisationDiff})${getBonusDiceSpan(totalPreparationBonus)}`);
    setInnerHTML('rassemblementTestLabel',   `Test de rassemblement : Étiquette (${rassemblementDiff})${getBonusDiceSpan(totalPreparationBonus)}`);
    setInnerHTML('preparerLieuTestLabel',    `Test de préparation du lieu : Environnement (${preparationDiff})${getBonusDiceSpan(totalPreparationBonus)}`);
    document.getElementById('recruterTestGroup')?.classList.add('hidden');

    const rassemblementSuccesExc = Math.max(0, state.festive.rassemblementTestSucces - rassemblementDiff);
    const rassemblementReussi    = rassemblementSuccesExc >= invitesData.diff;
    const prepaLieuReussi        = state.festive.preparerLieuTestSucces >= preparationDiff;
    const autorisationReussie    = state.festive.lieuFete === 'vaisseau_nature' || state.festive.autorisationTestSucces >= autorisationDiff;

    let prepResultText = `Matériel acheté : <strong>${invitesData.cout.toLocaleString('fr-FR')} Ø</strong>.<br>`;
    prepResultText += `Préparation du lieu : ${prepaLieuReussi ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
    prepResultText += `Rassemblement des invités : ${rassemblementReussi ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
    if (state.festive.lieuFete !== 'vaisseau_nature') {
      prepResultText += `Obtention de l'autorisation : ${autorisationReussie ? '<span class="text-green-400">Réussi</span>' : '<span class="text-red-400">Échec</span>'}.<br>`;
    }
    prepResultText += `<hr class="my-2 border-gray-600"><strong>Recruter des invités de marque :</strong> ` +
      `Pour chaque invité, faire un test d'Étiquette (${3 + malus}) ou Illégalités (${3 + malus}). ` +
      `L'invité ne viendra que si sa Gloire minimum est strictement inférieure à la Difficulté (${invitesData.gloire_diff}).`;
    setInnerHTML('prepaFestiveDetails', prepResultText);

    const preparationComplete = autorisationReussie && prepaLieuReussi && rassemblementReussi;
    setInnerHTML('festivePrepResult',
      preparationComplete
        ? '<strong class="text-green-400">Préparation complète ! Vous pouvez passer à l\'exécution.</strong>'
        : '<strong class="text-red-400">Préparation incomplète.</strong>'
    );
  }

  if (state.currentStepIndex === 2) {
    const appelDiff = invitesData.diff + malus;
    setInnerHTML('appelFestiveLabel',
      `Appel à la Révolution : Eloquence (${appelDiff})${getBonusDiceSpan(totalExecutionBonus)}${getPdRequiredSpan()}`
    );
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

  if (state.currentStepIndex === 1) {
    const mutinsPoste   = Math.max(0, s.eloquencePoste   - 3);
    const mutinsCambuse = Math.max(0, s.eloquenceCambuse - 2);
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
    const appelDiff = parseInt(s.location, 10) || 1;
    setInnerHTML('mutinerieAppelLabel', `Appel à la mutinerie (Eloquence vs ${appelDiff})`);
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

  // 1. Lieux de Pouvoir
  const powerPlaceList = document.getElementById('powerPlaceList');
  if (powerPlaceList) {
    powerPlaceList.innerHTML = '';
    rev.powerPlaces.forEach((place, index) => {
      const el = document.createElement('div');
      el.className = 'bg-gray-800 p-2 rounded text-sm';
      el.innerHTML = `
        <div class="flex justify-between items-center">
          <div>
            <strong>${escHtml(place.name)}</strong>
            ${place.isQG ? '<span class="text-xs font-bold text-red-400 ml-1">[QG]</span>' : ''}
            ${place.desc ? `<p class="text-xs text-gray-400 mt-0.5">${escHtml(place.desc)}</p>` : ''}
          </div>
          <div class="flex items-center gap-2 ml-2">
            <label class="text-xs text-gray-300 cursor-pointer">
              Capturé <input type="checkbox" class="capture-place-check revolte-input" data-index="${index}" ${place.isCaptured ? 'checked' : ''}>
            </label>
            <button class="remove-place-btn text-red-400 hover:text-red-300 text-lg leading-none" data-index="${index}">×</button>
          </div>
        </div>
      `;
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
  setInnerHTML('recrutementLabel', `Recrutement : Éloquence (${recrutementDiff + prepBonus})`);

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
  setInnerHTML('discoursPeupleLabel',      `Discours de rue : Éloquence (${discoursDiff + prepBonus})`);
  setInnerHTML('tractsPeupleLabel',        `Tracts et affiches : Propagande (${tractsDiff + prepBonus})`);
  setInnerHTML('comprehensionPeupleLabel', `Compréhension du peuple : Sciences Solaires (${comprehensionDiff + prepBonus})`);

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

  container.innerHTML = rev.powerPlaces.map((place, i) => {
    const assaultData = rev.execution.assaults[i] || { reachRoll: 0, enterRoll: 0 };
    return `
      <div class="bg-gray-800 rounded p-3 text-sm">
        <div class="font-semibold mb-2">${escHtml(place.name)} ${place.isQG ? '<span class="text-xs text-red-400">[QG]</span>' : ''}</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Atteindre (Tactique)</label>
            <input type="number" min="0" value="${assaultData.reachRoll}"
                   class="assault-roll-input revolte-input w-20" data-index="${i}" data-action="reach">
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Entrer (Combat)</label>
            <input type="number" min="0" value="${assaultData.enterRoll}"
                   class="assault-roll-input revolte-input w-20" data-index="${i}" data-action="enter">
          </div>
        </div>
        <div class="mt-1 text-xs ${place.isCaptured ? 'text-green-400' : 'text-gray-500'}">
          ${place.isCaptured ? '✅ Capturé' : '⏳ Non capturé'}
        </div>
      </div>
    `;
  }).join('');
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

  setInnerHTML('appelRevolteLabel',
    `Appel à la Révolte : Éloquence (${appelDiff + totalExecBonus})${getPdRequiredSpan()}`
  );
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

  setInnerHTML('intimidationRedditionLabel',
    `Reddition des Autorités : Intimidation (${redditionDiff === 'TD' ? 'TD' : redditionDiff + totalExecBonus})`
  );

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
    selectEl.innerHTML = '<option>-- Candidats PD --</option>';
    rev.allies.filter(a => a.isPD).forEach(ally => {
      const opt = document.createElement('option');
      opt.value = ally.name;
      opt.textContent = ally.name;
      selectEl.appendChild(opt);
    });
  }

  setInnerHTML('sciencesSolairesLabel',
    `Prévoir les conséquences : Sciences Solaires (${3 + state.propagande.bonusJets})`
  );

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

  // Paramétrage
  addListener('revolteType', 'change', e => { state.revolteType = e.target.value; navigateTo(state.currentStepIndex); scheduleAutosave(); });
  addListener('populationInput', 'input', e => { state.population = parseFloat(e.target.value) || 0; updateUI(); scheduleAutosave(); });
  addListener('securitePlanetaireInput', 'input', e => { state.securitePlanetaire = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('revolutionScope', 'change', e => { state.revolution.scope = e.target.value; updateUI(); scheduleAutosave(); });

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

  // PD
  addListener('pdLocaux',  'input', e => { state.pd.locaux  = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('pdPirates', 'input', e => { state.pd.pirates = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('pdAutres',  'input', e => { state.pd.autres  = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });

  // Emeute
  addListener('empathieTestInput', 'input', e => { state.emeute.empathieSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('tactiqueTestInput', 'input', e => { state.emeute.tactiqueSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });
  addListener('discoursTestInput', 'input', e => { state.emeute.discoursSucces = parseInt(e.target.value, 10) || 0; updateUI(); scheduleAutosave(); });

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
    }
  });

  document.getElementById('powerPlaceList')?.addEventListener('click', e => {
    const btn = e.target.closest('.remove-place-btn');
    if (btn) {
      const idx = parseInt(btn.dataset.index, 10);
      state.revolution.powerPlaces.splice(idx, 1);
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

  // Assault section (delegated)
  document.getElementById('assault-section')?.addEventListener('input', e => {
    if (!e.target.classList.contains('assault-roll-input')) return;
    const idx    = parseInt(e.target.dataset.index, 10);
    const action = e.target.dataset.action;
    const value  = parseInt(e.target.value, 10) || 0;
    if (!state.revolution.execution.assaults[idx]) {
      state.revolution.execution.assaults[idx] = { reachRoll: 0, enterRoll: 0 };
    }
    state.revolution.execution.assaults[idx][`${action}Roll`] = value;

    const assaultData = state.revolution.execution.assaults[idx];
    const malus = getMalus();
    const assaultDiff = state.securitePlanetaire + malus;
    if (assaultData.reachRoll >= assaultDiff && assaultData.enterRoll >= assaultDiff) {
      state.revolution.powerPlaces[idx].isCaptured = true;
    }
    let totalLosses = 0;
    Object.keys(state.revolution.execution.assaults).forEach(pi => {
      const a = state.revolution.execution.assaults[pi];
      if (a.reachRoll > 0 && a.reachRoll < assaultDiff) totalLosses += (assaultDiff - a.reachRoll);
      if (a.enterRoll > 0 && a.enterRoll < assaultDiff) totalLosses += (assaultDiff - a.enterRoll);
    });
    state.revolution.execution.sectionsLost = totalLosses;
    updateRevolutionExecutionUI();
    scheduleAutosave();
  });

  // Célébration révolution
  addListener('sciencesSolairesSucces', 'input', e => { state.revolution.celebration.sciencesSolairesSucces = parseInt(e.target.value, 10) || 0; updateRevolutionCelebrationUI(); scheduleAutosave(); });
  addListener('joursDeCombatInput',     'input', e => { state.revolution.celebration.joursDeCombat           = parseInt(e.target.value, 10) || 0; updateRevolutionCelebrationUI(); scheduleAutosave(); });

  // Session actions
  document.getElementById('new-session-btn')?.addEventListener('click', showNewForm);
  document.getElementById('ns-create-btn')?.addEventListener('click', createSession);
  document.getElementById('ns-cancel-btn')?.addEventListener('click', cancelNewForm);
  document.getElementById('save-btn')?.addEventListener('click', saveSession);
  document.getElementById('delete-session-btn')?.addEventListener('click', deleteSession);
  document.getElementById('mobile-back-btn')?.addEventListener('click', showSessionsPanelMobile);
  document.getElementById('editor-status')?.addEventListener('change', scheduleAutosave);
  document.getElementById('session-filter')?.addEventListener('change', loadSessionList);
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
  }

  bindAll();
  await loadSessionList();
}

init();
