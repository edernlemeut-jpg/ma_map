/**
 * personnage-app.js — Wizard de création de personnages Metal Adventures
 */
import { initHeader } from '/js/shared/header.js';
import { isMJ, getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';

// ── Config ────────────────────────────────────────────────────────────────────
const API = {
  refData:    '/api/characters/ref-data',
  characters: '/api/characters',
};

const ATTR_POOL_PJ = [4, 3, 3, 3, 3, 2]; // doit être assigné exactement
const FREE_COMPETENCES_PJ = 18;

// ── State global ──────────────────────────────────────────────────────────────
let REF = null;          // données de référence
let MODE = null;         // 'list' | 'wizard-pj' | 'wizard-pnj' | 'sheet'
let ROLE = null;         // 'mj' | 'joueur'
let USER_ID = null;
let TABLE_ID = null;

// Draft du personnage en cours de création/édition
const newState = () => ({
  // Commun
  id: null,
  type: 'pj',
  name: '',
  // PJ étape 1
  is_mutant: false,
  // PJ étape 2
  origine_id: null,
  _origine_nation: null, // UI-only: nation sélectionnée avant le choix d'une origine
  origine_choix: {},    // { comptenceAvChoix: 'specialité choisie', ... }
  // PJ étape 3
  motivation_id: null,
  // PJ étape 4
  archetype_id: null,
  action_archetype: null,
  // PJ étape 5 : attributs — map { agilite: null|3, ... }
  attributs: { agilite: null, carrure: null, perception: null, intelligence: null, presence: null, sang_froid: null },
  // PJ étape 6 : compétences libres — map { 'Navigation': 2, ... }
  competences_libres: {},
  // PJ étape 7 : traits
  qualites_ids: [],
  defauts_ids: [],
  // PJ étape 8 : finitions
  nom_personnage: '',
  age: '',
  description: '',
  mutations_ids: [],
  avatar_url: '',       // image de profil (URL)
  // PNJ spécifique
  pnj_niveau: 'normal',
  pnj_is_pirate: false,
  pnj_is_named: false,
  domaines_libres: [],     // 3 domaines si PNJ non-pirate
  competences_pnj: {},     // { 'Navigation': 5 } — dés directs pour PNJ
  attributs_pnj: { agilite: null, carrure: null, perception: null, intelligence: null, presence: null, sang_froid: null },
});

let DRAFT = newState();
let CURRENT_STEP = 0;
let EDITING_ID = null;   // si on édite un personnage existant

// ── Initialisation ────────────────────────────────────────────────────────────
async function init() {
  // Pattern standard du projet : initHeader gère auth + table context header
  const user = await initHeader();
  USER_ID  = user?.id ?? null;
  TABLE_ID = getActiveTableId();
  ROLE     = (isMJ() || user?.is_admin) ? 'mj' : 'joueur';

  updateTopButtons();

  // Charger les données de référence (avec contexte de table pour filtrer les origines)
  try {
    const r = await fetchWithTable(API.refData, { credentials: 'include' });
    if (!r.ok) throw new Error('Erreur chargement données');
    const { data } = await r.json();
    REF = data;
  } catch (e) {
    showError('Impossible de charger les données de référence : ' + e.message);
    return;
  }

  document.getElementById('loading').classList.add('hidden');
  showListView();
}

document.addEventListener('DOMContentLoaded', init);

// ── Boutons de la top-bar ─────────────────────────────────────────────────────
function updateTopButtons() {
  const isAuth = !!USER_ID;
  document.getElementById('btn-list').classList.toggle('hidden', !isAuth);
  document.getElementById('btn-new-pj').classList.toggle('hidden', !isAuth);
  document.getElementById('btn-new-pnj').classList.toggle('hidden', !(isAuth && (ROLE === 'mj' || ROLE === 'admin')));
}

document.getElementById('btn-new-pj').addEventListener('click', () => startWizard('pj'));
document.getElementById('btn-new-pnj').addEventListener('click', () => startWizard('pnj'));
document.getElementById('btn-list').addEventListener('click', showListView);
document.getElementById('btn-cancel').addEventListener('click', showListView);
document.getElementById('btn-prev').addEventListener('click', stepBack);
document.getElementById('btn-next').addEventListener('click', stepForward);

// ── Vue liste ─────────────────────────────────────────────────────────────────
async function showListView() {
  setView('list');

  if (!USER_ID || !TABLE_ID) {
    document.getElementById('char-list-container').innerHTML = '';
    document.getElementById('char-list-empty').textContent = 'Connectez-vous et sélectionnez une table pour voir vos personnages.';
    document.getElementById('char-list-empty').classList.remove('hidden');
    return;
  }

  try {
    const r = await fetchWithTable(API.characters, { credentials: 'include' });
    if (!r.ok) throw new Error();
    const { data: chars } = await r.json();
    renderCharList(chars);
  } catch {
    renderCharList([]);
  }
}

function renderCharList(chars) {
  const container = document.getElementById('char-list-container');
  const empty     = document.getElementById('char-list-empty');
  container.innerHTML = '';

  if (!chars.length) {
    empty.textContent = 'Aucun personnage. Créez-en un avec le bouton ci-dessus.';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const pjs  = chars.filter(c => c.type === 'pj');
  const pnjs = chars.filter(c => c.type === 'pnj');

  if (pjs.length) {
    container.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-500 uppercase mb-2">Personnages-Joueurs</p>');
    pjs.forEach(c => container.appendChild(charCard(c)));
  }
  if (pnjs.length) {
    container.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-500 uppercase mt-4 mb-2">Personnages Non-Joueurs (MJ)</p>');
    pnjs.forEach(c => container.appendChild(charCard(c)));
  }
}

function charCard(c) {
  const d = c.data || {};
  const div = document.createElement('div');
  div.className = 'flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 gap-3';
  const arch = d.archetype_id ? (REF?.archetypes?.find(a => a.id === d.archetype_id)?.nom || '') : '';
  const orig = d.origine_id   ? (REF?.origines?.find(o => o.id === d.origine_id)?.nom || '') : '';
  const sub  = [arch, orig].filter(Boolean).join(' · ') || (c.type === 'pnj' ? 'PNJ' : 'PJ');
  div.innerHTML = `
    <div>
      <p class="font-medium">${esc(c.name)}</p>
      <p class="text-xs text-gray-400">${esc(sub)}</p>
    </div>
    <div class="flex gap-2 shrink-0">
      <button data-id="${c.id}" data-action="view"
        class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Voir</button>
      ${ canEdit(c) ? `<button data-id="${c.id}" data-action="edit"
        class="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs">Modifier</button>` : '' }
      ${ canDelete(c) ? `<button data-id="${c.id}" data-action="delete"
        class="px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs">✕</button>` : '' }
    </div>`;
  div.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { id, action } = btn.dataset;
    if (action === 'view')   showSheet(id);
    if (action === 'edit')   editChar(id);
    if (action === 'delete') deleteChar(id, c.name);
  });
  return div;
}

function canEdit(c)   { return c.created_by === USER_ID || ROLE === 'mj' || ROLE === 'admin'; }
function canDelete(c) { return canEdit(c); }

// ── Fiche de personnage (lecture) ─────────────────────────────────────────────
async function showSheet(id) {
  setView('sheet');
  const container = document.getElementById('sheet-view');
  container.innerHTML = '<p class="text-gray-400">Chargement…</p>';

  try {
    const r = await fetchWithTable(`${API.characters}/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error();
    const { data: char } = await r.json();
    container.innerHTML = renderSheet(char);
  } catch {
    container.innerHTML = '<p class="text-red-400">Impossible de charger le personnage.</p>';
  }
}

function renderSheet(char) {
  const d = char.data || {};
  const type = char.type === 'pnj' ? 'PNJ' : 'PJ';
  const arch  = d.archetype_id ? REF?.archetypes?.find(a => a.id === d.archetype_id) : null;
  const orig  = d.origine_id   ? REF?.origines?.find(o => o.id === d.origine_id)   : null;
  const motiv = d.motivation_id? REF?.motivations?.find(m => m.id === d.motivation_id) : null;

  // Calcul totaux
  const attrs = d.attributs || {};
  const attrBonus = orig?.bonus_attribut ? { [orig.bonus_attribut.attribut]: orig.bonus_attribut.valeur } : {};

  const finalAttrs = {};
  for (const a of REF?.attributs || []) {
    finalAttrs[a.id] = (attrs[a.id] || 0) + (attrBonus[a.id] || 0);
  }

  const competences = buildCompetences(d);

  const sante    = (finalAttrs.carrure || 0) + (finalAttrs.sang_froid || 0);
  const energieX = d.is_mutant ? (finalAttrs.perception || 0) + (finalAttrs.intelligence || 0) : null;

  const domPriv = arch?.domaines_privileges || d.domaines_libres || [];

  return `
  <div class="space-y-6">
    <!-- En-tête -->
    <div class="flex flex-wrap gap-4 justify-between">
      <div>
        <h3 class="text-2xl font-bold">${esc(d.nom_personnage || char.name)}</h3>
        <p class="text-sm text-gray-400 mt-0.5">
          ${esc(orig?.nom || '')}${orig ? ' · ' : ''}${esc(arch?.nom || '')}${motiv ? ' · ' + esc(motiv.nom) : ''}
          ${ type === 'PNJ' ? ` · <span class="text-purple-400">PNJ ${esc(d.pnj_niveau || '')}</span>` : '' }
        </p>
      </div>
      <div class="flex gap-3 text-sm">
        ${ canEdit(char) ? `<button onclick="editChar('${char.id}')" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded">Modifier</button>` : '' }
        <button onclick="showListView()" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded">← Retour</button>
      </div>
    </div>

    <!-- Attributs + trackers -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
      ${(REF?.attributs || []).map(a => {
        const val = finalAttrs[a.id] || 0;
        const base = attrs[a.id] || 0;
        const bonus = attrBonus[a.id] || 0;
        return `
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center"
             data-tip="${esc(a.description)}">
          <p class="text-xs text-gray-400 mb-0.5">${esc(a.nom)}</p>
          <p class="text-3xl font-bold" style="color:var(--gold)">${val}</p>
          ${ bonus ? `<p class="text-xs text-green-400">(${base} + ${bonus})</p>` : '' }
          <p class="text-xs text-gray-500">${esc(a.domaine)}</p>
        </div>`;
      }).join('')}
    </div>

    <!-- Santé / Énergie X / Panache / Gloire -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Santé <span class="text-gray-500">(Car.+SC)</span></p>
        <p class="font-bold text-xl text-red-400">${sante}</p>
        <div class="tracker-boxes mt-2">${trackerBoxes(sante)}</div>
      </div>
      ${ energieX !== null ? `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Énergie X <span class="text-gray-500">(Per.+Int.)</span></p>
        <p class="font-bold text-xl text-cyan-400">${energieX}</p>
        <div class="tracker-boxes mt-2">${trackerBoxes(energieX)}</div>
      </div>` : '<div></div>' }
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Panache</p>
        <p class="font-bold text-xl text-yellow-400">${d.panache ?? 3}</p>
        <div class="tracker-boxes mt-2">${trackerBoxes(d.panache ?? 3)}</div>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Gloire</p>
        <p class="font-bold text-xl">${d.gloire ?? 0}</p>
      </div>
    </div>

    <!-- Archétype + domaines -->
    ${ arch ? `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-sm font-semibold mb-1" style="color:var(--gold)">Archétype : ${esc(arch.nom)}</p>
      <p class="text-xs text-gray-400 mb-2">${esc(arch.description)}</p>
      <p class="text-xs text-gray-500">Domaines privilégiés : ${arch.domaines_privileges.map(d => `<span class="text-gray-300">${esc(d)}</span>`).join(', ')}</p>
      ${ d.action_archetype ? `<p class="text-xs text-gray-400 mt-1">Action choisie : <span class="text-blue-300">${esc(d.action_archetype)}</span></p>` : '' }
    </div>` :
    domPriv.length ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-xs text-gray-500">Domaines privilégiés : ${domPriv.map(x => `<span class="text-gray-300">${esc(x)}</span>`).join(', ')}</p>
    </div>` : '' }

    <!-- Compétences -->
    <div>
      <h4 class="text-sm font-semibold text-gray-300 mb-3">Compétences</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-4">
        ${renderCompetencesSheet(competences, finalAttrs, domPriv)}
      </div>
    </div>

    <!-- Qualités / Défauts -->
    ${renderTraitsSheet(d)}

    <!-- Mutations -->
    ${d.is_mutant && d.mutations_ids?.length ? `
    <div>
      <h4 class="text-sm font-semibold text-gray-300 mb-2">Mutations</h4>
      <div class="flex flex-wrap gap-2">
        ${d.mutations_ids.map(mid => {
          const m = REF?.mutations?.find(x => x.id === mid);
          return `<span class="text-xs bg-cyan-900 border border-cyan-700 rounded px-2 py-0.5">${esc(m?.name || mid)}</span>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Équipement de départ -->
    ${ arch?.equipement_depart ? `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-xs text-gray-400">Équipement de départ :</p>
      <p class="text-sm mt-0.5">${esc(arch.equipement_depart)}</p>
    </div>` : '' }

    <!-- Notes narratives -->
    ${ d.description ? `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-xs text-gray-400 mb-1">Description / Historique</p>
      <p class="text-sm text-gray-300">${esc(d.description)}</p>
    </div>` : '' }
  </div>`;
}

function trackerBoxes(n) {
  return Array.from({ length: Math.max(0, n) }, () => '<div class="tracker-box"></div>').join('');
}

function renderCompetencesSheet(comps, finalAttrs, domPriv) {
  return Object.entries(comps)
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'fr'))
    .map(([name, v]) => {
      const dom = REF?.competences?.find(c => c.name === name)?.domain || '';
      const attrId = REF?.domaines?.find(d => d.id === dom)?.attribut || '';
      const attrVal = finalAttrs[attrId] || 0;
      const dice = attrVal + v.total;
      const priv = domPriv.includes(dom);
      return `
      <div class="flex items-center justify-between py-0.5 border-b border-gray-700 text-xs">
        <span class="${priv ? 'text-yellow-300' : 'text-gray-300'}">${esc(name)}${v.specialite ? ` (${esc(v.specialite)})` : ''}</span>
        <span class="font-mono text-gray-200 shrink-0 ml-2">${dice}d <span class="text-gray-500">(${attrVal}+${v.total})</span></span>
      </div>`;
    }).join('') || '<p class="text-gray-500 text-xs">Aucune compétence</p>';
}

function renderTraitsSheet(d) {
  const qs = (d.qualites_ids || []).map(qid => REF?.qualites?.find(x => x.id === qid)).filter(Boolean);
  const ds = (d.defauts_ids  || []).map(did => REF?.defauts?.find(x => x.id === did) ).filter(Boolean);
  if (!qs.length && !ds.length) return '';
  return `
  <div class="grid md:grid-cols-2 gap-4">
    ${ qs.length ? `<div>
      <h4 class="text-sm font-semibold text-gray-300 mb-2">Qualités</h4>
      <div class="space-y-1">
        ${qs.map(q => `<div class="text-xs bg-gray-800 border border-gray-700 rounded px-3 py-1.5">
          <span class="text-blue-300 font-medium">${esc(q.name)}</span>
          <span class="text-gray-500 ml-1">(${esc(q.cost || '')} pts)</span>
        </div>`).join('')}
      </div>
    </div>` : '' }
    ${ ds.length ? `<div>
      <h4 class="text-sm font-semibold text-gray-300 mb-2">Défauts</h4>
      <div class="space-y-1">
        ${ds.map(d => `<div class="text-xs bg-gray-800 border border-gray-700 rounded px-3 py-1.5">
          <span class="text-yellow-300 font-medium">${esc(d.name)}</span>
          <span class="text-gray-500 ml-1">(${esc(d.cost || '')} pts)</span>
        </div>`).join('')}
      </div>
    </div>` : '' }
  </div>`;
}

// ── Wizard ────────────────────────────────────────────────────────────────────
function startWizard(type) {
  DRAFT = newState();
  DRAFT.type = type;
  EDITING_ID = null;
  CURRENT_STEP = 0;
  setView('wizard');
  renderWizard();
}

async function editChar(id) {
  try {
    const r = await fetchWithTable(`${API.characters}/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error();
    const { data: char } = await r.json();
    // Rehydrate draft from saved data
    DRAFT = { ...newState(), ...char.data, id: char.id, type: char.type, name: char.name };
    EDITING_ID = char.id;
    CURRENT_STEP = 0;
    setView('wizard');
    renderWizard();
  } catch {
    alert('Impossible de charger le personnage.');
  }
}

async function deleteChar(id, name) {
  if (!confirm(`Supprimer "${name}" ? Cette action est irréversible.`)) return;
  try {
    await fetchWithTable(`${API.characters}/${id}`, { method: 'DELETE', credentials: 'include' });
    showListView();
  } catch {
    alert('Erreur lors de la suppression.');
  }
}

// ── Steps PJ ──────────────────────────────────────────────────────────────────
const STEPS_PJ = [
  { label: 'Mutant ?',          render: renderStepMutant,         validate: () => true },
  { label: 'Origine',           render: renderStepOrigine,        validate: () => !!DRAFT.origine_id },
  { label: 'Motivation',        render: renderStepMotivation,     validate: () => !!DRAFT.motivation_id },
  { label: 'Archétype',         render: renderStepArchetype,      validate: () => !!DRAFT.archetype_id },
  { label: 'Caractéristiques',  render: renderStepAttributs,      validate: validateAttributs },
  { label: 'Compétences',       render: renderStepCompetences,    validate: () => true },
  { label: 'Traits',            render: renderStepTraits,         validate: () => true },
  { label: 'Finitions',         render: renderStepFinitions,      validate: validateFinitions },
];

// ── Steps PNJ ─────────────────────────────────────────────────────────────────
const STEPS_PNJ = [
  { label: 'Mutant ?',          render: renderStepMutant,         validate: () => true },
  { label: 'Type de PNJ',       render: renderStepPNJType,        validate: validatePNJType },
  { label: 'Profil',            render: renderStepPNJProfil,      validate: validatePNJProfil },
  { label: 'Origine',           render: renderStepOrigine,        validate: () => true },
  { label: 'Attributs',         render: renderStepPNJAttributs,   validate: () => true },
  { label: 'Compétences',       render: renderStepPNJCompetences, validate: () => true },
  { label: 'Traits',            render: renderStepTraits,         validate: () => true },
  { label: 'Finitions',         render: renderStepFinitions,      validate: validateFinitions },
];

function getSteps() { return DRAFT.type === 'pnj' ? STEPS_PNJ : STEPS_PJ; }

function renderWizard() {
  const steps = getSteps();
  // Dots
  const dotsEl = document.getElementById('step-dots');
  dotsEl.innerHTML = steps.map((s, i) => {
    const cls = i < CURRENT_STEP ? 'done' : i === CURRENT_STEP ? 'active' : '';
    return `<div class="step-dot ${cls}" title="${esc(s.label)}"></div>`;
  }).join('');

  document.getElementById('step-label').textContent = `Étape ${CURRENT_STEP + 1} / ${steps.length} — ${steps[CURRENT_STEP].label}`;

  // Content
  document.getElementById('wizard-step').innerHTML = steps[CURRENT_STEP].render();
  attachStepListeners();

  // Nav buttons
  document.getElementById('btn-prev').disabled  = CURRENT_STEP === 0;
  const isLast = CURRENT_STEP === steps.length - 1;
  const nextBtn = document.getElementById('btn-next');
  nextBtn.textContent = isLast ? '✔ Enregistrer' : 'Suivant →';
}

function stepForward() {
  const steps = getSteps();
  if (!steps[CURRENT_STEP].validate()) {
    steps[CURRENT_STEP].render(); // re-render to show errors
    showStepError(getValidationError());
    return;
  }
  if (CURRENT_STEP < steps.length - 1) {
    CURRENT_STEP++;
    renderWizard();
  } else {
    saveCharacter();
  }
}

function stepBack() {
  if (CURRENT_STEP > 0) { CURRENT_STEP--; renderWizard(); }
}

function getValidationError() {
  if (DRAFT.type === 'pj') {
    if (CURRENT_STEP === 1 && !DRAFT.origine_id)    return 'Choisissez une origine.';
    if (CURRENT_STEP === 2 && !DRAFT.motivation_id) return 'Choisissez une motivation.';
    if (CURRENT_STEP === 3 && !DRAFT.archetype_id)  return 'Choisissez un archétype.';
    if (CURRENT_STEP === 4) return 'Assignez exactement les valeurs 4,3,3,3,3,2 aux caractéristiques.';
    if (CURRENT_STEP === 7 && !DRAFT.nom_personnage?.trim()) return 'Le nom du personnage est requis.';
  } else {
    if (CURRENT_STEP === 1 && !DRAFT.pnj_niveau) return 'Choisissez un niveau de PNJ.';
    if (CURRENT_STEP === 7 && !DRAFT.nom_personnage?.trim()) return 'Le nom du personnage est requis.';
  }
  return 'Veuillez compléter cette étape.';
}

function showStepError(msg) {
  const existing = document.getElementById('step-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'step-error';
  div.className = 'mt-3 text-sm text-red-400 text-center';
  div.textContent = msg;
  document.getElementById('btn-next').after(div);
}

// ── Étape 1 : Mutant ? ────────────────────────────────────────────────────────
function renderStepMutant() {
  return `
  <h3 class="text-base font-semibold mb-4">Votre personnage est-il un mutant ?</h3>
  <p class="text-sm text-gray-400 mb-6">
    Les mutants ont accès à l'<strong>Énergie X</strong> (Perception + Intelligence)
    et peuvent choisir des <strong>mutations</strong> à l'étape des finitions.
  </p>
  <div class="flex gap-4">
    <button data-val="false"
      class="mutant-btn sel-btn flex-1 py-4 text-center text-lg font-bold ${!DRAFT.is_mutant ? 'sel-gold' : ''}">
      👤 Non
    </button>
    <button data-val="true"
      class="mutant-btn sel-btn flex-1 py-4 text-center text-lg font-bold ${DRAFT.is_mutant ? 'sel-cyan' : ''}">
      ☢️ Oui — Mutant
    </button>
  </div>`;
}

// ── Étape 2 : Origine ─────────────────────────────────────────────────────────
function renderStepOrigine() {
  const nations  = REF?.nations  || [];
  const origines = REF?.origines || [];

  const byNation = {};
  nations.forEach(n => { byNation[n.id] = []; });
  origines.forEach(o => { if (byNation[o.nation]) byNation[o.nation].push(o); });

  const selectedOrigine   = origines.find(o => o.id === DRAFT.origine_id);
  const selectedNationId  = selectedOrigine?.nation ?? DRAFT._origine_nation ?? '';

  return `
  <h3 class="text-base font-semibold mb-1">Choisissez votre origine</h3>
  <p class="text-xs text-gray-500 mb-4">Donne +1 à une caractéristique et +3 à 2 compétences.</p>

  <!-- Nation cards -->
  <p class="text-xs text-gray-400 mb-2">Nation stellaire</p>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
    ${nations.map(n => {
      const isSelected = n.id === selectedNationId;
      const hidden = ROLE === 'mj' && n.visible === false;
      return `<button type="button"
        class="nation-card flex flex-col items-center gap-1 p-2 rounded-lg border text-center cursor-pointer transition-all
          ${isSelected
            ? 'border-yellow-500 bg-yellow-900/20 text-yellow-300'
            : 'border-gray-700 bg-gray-800 hover:border-gray-500 text-gray-300'}
          ${hidden ? 'opacity-50' : ''}"
        data-nation="${esc(n.id)}">
        ${n.faction_icon_url
          ? `<img src="${esc(n.faction_icon_url)}" alt="${esc(n.nom)}" class="w-8 h-8 object-contain rounded">`
          : `<span class="w-8 h-8 flex items-center justify-center text-xl">🌐</span>`}
        <span class="text-xs font-medium leading-tight">${esc(n.nom)}</span>
        ${hidden ? '<span class="text-xs text-gray-500" title="Caché aux joueurs">👁️‍🗨️</span>' : ''}
      </button>`;
    }).join('')}
  </div>

  <!-- Origine selector -->
  <div id="origine-select-wrap" class="${selectedNationId ? '' : 'hidden'}">
    <p class="text-xs text-gray-400 mb-1">Origine / Carrière</p>
    <select id="origine-select"
      class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm mb-4">
      <option value="">— Choisir une origine —</option>
      ${selectedNationId
        ? (byNation[selectedNationId] || []).map(o =>
            `<option value="${esc(o.id)}" ${o.id === DRAFT.origine_id ? 'selected' : ''}>${esc(o.nom)}</option>`
          ).join('')
        : ''}
    </select>
  </div>

  <!-- Détails de l'origine sélectionnée -->
  <div id="origine-detail" class="mt-2">
    ${selectedOrigine ? renderOrigineDetail(selectedOrigine) : ''}
  </div>

  <!-- Champs "au choix" -->
  <div id="origine-choix" class="mt-3 space-y-2">
    ${selectedOrigine ? renderOrigineChoix(selectedOrigine) : ''}
  </div>`;
}

function renderOrigineDetail(o) {
  const attrName = REF?.attributs?.find(a => a.id === o.bonus_attribut?.attribut)?.nom || '';
  const comps = o.bonus_competences || [];
  return `
  <div class="bg-gray-700 rounded-lg p-3 text-sm">
    <p class="font-medium mb-1">${esc(o.nom)}</p>
    <p class="text-xs text-gray-400 mb-2">${esc(o.source || '')}</p>
    ${ o.restriction ? `<p class="text-xs text-orange-400 mb-2">⚠️ ${esc(o.restriction)}</p>` : '' }
    <p class="text-xs text-green-400">+1 ${esc(attrName)}</p>
    ${comps.map(c => {
      const label = c.au_choix ? `${esc(c.competence)} <span class="text-yellow-400">(spécialité à choisir)</span>`
                  : c.specialite ? `${esc(c.competence)} <span class="text-gray-400">(${esc(c.specialite)})</span>`
                  : esc(c.competence);
      return `<p class="text-xs text-green-400">+${c.valeur} ${label}</p>`;
    }).join('')}
  </div>`;
}

function renderOrigineChoix(o) {
  const comps = o.bonus_competences || [];
  const needsChoix = comps.filter(c => c.au_choix);
  if (!needsChoix.length) return '';
  return needsChoix.map(c => `
  <div class="flex items-center gap-2 text-sm">
    <label class="text-gray-300 shrink-0 w-40">${esc(c.competence)} :</label>
    <input type="text" data-choix="${esc(c.competence)}"
      value="${esc(DRAFT.origine_choix[c.competence] || c.specialite || '')}"
      placeholder="Spécialité…"
      class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
  </div>`).join('');
}

// ── Étape 3 : Motivation ──────────────────────────────────────────────────────
function renderStepMotivation() {
  const motivations = REF?.motivations || [];
  return `
  <h3 class="text-base font-semibold mb-1">Choisissez votre motivation</h3>
  <p class="text-xs text-gray-500 mb-4">Donne +1 à 2 compétences et détermine la condition d'Overdrive.</p>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    ${motivations.map(m => {
      const comps = m.bonus_competences || [];
      const sel = DRAFT.motivation_id === m.id;
      return `
      <button data-motiv="${m.id}"
        class="motiv-btn sel-btn text-left px-4 py-3 ${sel ? 'sel-gold' : ''}">
        <p class="font-semibold text-sm">${esc(m.nom)}</p>
        <p class="text-xs text-gray-400 mt-0.5">${esc(m.overdrive)}</p>
        <p class="text-xs text-green-400 mt-1">${comps.map(c => `+1 ${esc(c.competence)}`).join(', ')}</p>
      </button>`;
    }).join('')}
  </div>`;
}

// ── Étape 4 : Archétype ───────────────────────────────────────────────────────
function renderStepArchetype() {
  const archetypes = REF?.archetypes || [];
  return `
  <h3 class="text-base font-semibold mb-1">Choisissez votre archétype</h3>
  <p class="text-xs text-gray-500 mb-4">Détermine vos 3 domaines privilégiés et vos actions spéciales.</p>
  <div class="flex flex-col gap-3">
    ${archetypes.map(a => {
      const sel = DRAFT.archetype_id === a.id;
      return `
      <div data-arch="${a.id}"
        class="archetype-card rounded-xl p-4 ${sel ? 'selected' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-semibold">${esc(a.nom)}</p>
            <p class="text-xs text-gray-400 mt-0.5">${esc(a.description)}</p>
            <p class="text-xs text-gray-500 mt-1">Domaines : ${a.domaines_privileges.map(d => `<span class="text-yellow-300">${esc(d)}</span>`).join(', ')}</p>
          </div>
          <div class="text-xl shrink-0">${sel ? '✔' : ''}</div>
        </div>
        ${sel ? `
        <div class="mt-3 border-t border-gray-600 pt-3">
          <p class="text-xs text-gray-400 mb-2">Action spéciale (choisissez-en une) :</p>
          <div class="flex flex-col gap-2">
            ${a.actions.map(act => `
            <label class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="action-arch" value="${esc(act.nom)}"
                ${DRAFT.action_archetype === act.nom ? 'checked' : ''}
                class="mt-0.5 shrink-0">
              <span><strong>${esc(act.nom)}</strong>
                <span class="text-xs text-gray-400 ml-1">(${esc(act.type)})</span>
                — <span class="text-xs text-gray-300">${esc(act.description)}</span>
              </span>
            </label>`).join('')}
          </div>
          <p class="text-xs text-gray-500 mt-3">Équipement de départ : ${esc(a.equipement_depart)}</p>
          <p class="text-xs text-gray-500 mt-1">Compétences d'archétype : ${a.competences_archetype.map(c => `<span class="text-gray-300">${esc(c)}</span>`).join(', ')}</p>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Étape 5 : Caractéristiques (PJ) ──────────────────────────────────────────
function renderStepAttributs() {
  const attrs = REF?.attributs || [];
  const pool = [...ATTR_POOL_PJ];
  const assigned = Object.values(DRAFT.attributs).filter(v => v !== null);
  const used = assigned.reduce((s, v) => { const i = pool.indexOf(v); i >= 0 && pool.splice(i, 1); return s + 1; }, 0);

  // Valeurs disponibles restantes
  const remaining = [...ATTR_POOL_PJ];
  for (const v of Object.values(DRAFT.attributs)) {
    if (v !== null) { const i = remaining.indexOf(v); if (i >= 0) remaining.splice(i, 1); }
  }

  const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  const bonusAttrId = orig?.bonus_attribut?.attribut;
  const bonusVal    = orig?.bonus_attribut?.valeur || 0;

  return `
  <h3 class="text-base font-semibold mb-1">Répartissez vos caractéristiques</h3>
  <p class="text-xs text-gray-500 mb-1">Assignez <strong>exactement</strong> les valeurs suivantes : 4, 3, 3, 3, 3, 2.</p>
  <p class="text-xs text-gray-400 mb-4">
    Valeurs restantes :
    ${ATTR_POOL_PJ.map(v => {
      const cnt = remaining.filter(x => x === v).length;
      return cnt > 0 ? `<span class="font-mono text-yellow-400">${v}×${cnt}</span>` : null;
    }).filter(Boolean).join(' ')}
    ${remaining.length === 0 ? '<span class="text-green-400">✔ Complet</span>' : ''}
  </p>
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    ${attrs.map(a => {
      const val  = DRAFT.attributs[a.id];
      const final = val !== null ? val + (bonusAttrId === a.id ? bonusVal : 0) : null;
      return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1" data-tip="${esc(a.description)}">${esc(a.nom)} ℹ</p>
        <p class="text-xs text-gray-500 mb-2">${esc(a.domaine)}</p>
        <select data-attr="${a.id}"
          class="attr-select w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm">
          <option value="">—</option>
          ${ATTR_POOL_PJ.map(v => {
            const cnt = remaining.filter(x => x === v).length + (val === v ? 1 : 0);
            const isAssignedHere = val === v;
            const available = remaining.filter(x => x === v).length + (isAssignedHere ? 1 : 0);
            return `<option value="${v}" ${val === v ? 'selected' : ''} ${available === 0 && val !== v ? 'disabled' : ''}>${v}</option>`;
          }).filter((html, i, arr) => arr.indexOf(html) === i)}
        </select>
        ${final !== null ? `
        <p class="text-xs text-gray-400 mt-1">
          Final : <strong class="text-yellow-400">${final}</strong>
          ${bonusAttrId === a.id && val !== null ? `<span class="text-green-400 ml-1">(+${bonusVal} origine)</span>` : ''}
        </p>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function validateAttributs() {
  const vals = Object.values(DRAFT.attributs);
  if (vals.some(v => v === null)) return false;
  const sorted = [...vals].sort((a,b) => b-a).join(',');
  return sorted === '4,3,3,3,3,2';
}

// ── Étape 6 : Compétences (PJ) ────────────────────────────────────────────────
function renderStepCompetences() {
  const arch = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const domPriv = arch?.domaines_privileges || [];
  const compArchetype = arch?.competences_archetype || [];
  const competences = REF?.competences || [];
  const domaines = REF?.domaines || [];

  // Bonus depuis origine et motivation
  const bonusMap = buildBonusMap();
  // Points libres utilisés
  const usedFree = Object.values(DRAFT.competences_libres).reduce((s, v) => s + v, 0);
  const remaining = FREE_COMPETENCES_PJ - usedFree;

  // Grouper par domaine
  const byDomain = {};
  domaines.forEach(d => { byDomain[d.id] = []; });
  competences.forEach(c => { if (byDomain[c.domain]) byDomain[c.domain].push(c); });

  return `
  <h3 class="text-base font-semibold mb-1">Répartissez vos compétences</h3>
  <div class="flex items-center justify-between mb-3">
    <p class="text-xs text-gray-500">Points libres à distribuer : </p>
    <span class="font-mono font-bold text-lg ${remaining < 0 ? 'text-red-400' : remaining === 0 ? 'text-green-400' : 'text-yellow-400'}">
      ${remaining} / ${FREE_COMPETENCES_PJ}
    </span>
  </div>
  <p class="text-xs text-gray-500 mb-3">
    Les <span class="text-yellow-300">domaines privilégiés</span> sont marqués ★.
    Les compétences d'archétype sont en <span class="text-blue-300">bleu</span>.
    Les bonus d'origine/motivation sont affichés en <span class="text-green-400">vert</span>.
  </p>

  <div class="space-y-4 overflow-y-auto max-h-[55vh] pr-1">
    ${domaines.map(dom => {
      const skills = byDomain[dom.id] || [];
      const priv = domPriv.includes(dom.id);
      const attrNom = REF?.attributs?.find(a => a.id === dom.attribut)?.nom || '';
      return `
      <div>
        <p class="text-xs font-semibold mb-1 ${priv ? 'text-yellow-300' : 'text-gray-400'}">
          ${priv ? '★ ' : ''}${esc(dom.id)} <span class="text-gray-500 font-normal">(${esc(attrNom)})</span>
        </p>
        <div class="space-y-0.5">
          ${skills.map(sk => {
            const bonus = bonusMap[sk.name] || 0;
            const free  = DRAFT.competences_libres[sk.name] || 0;
            const total = free + bonus;
            const isArch = compArchetype.includes(sk.name);
            return `
            <div class="skill-row flex items-center gap-2 py-0.5 border-b border-gray-700/50">
              <span class="flex-1 text-xs ${isArch ? 'text-blue-300' : 'text-gray-300'} truncate"
                    title="${esc(sk.description || sk.name)}">${esc(sk.name)}</span>
              <span class="text-xs text-green-400 w-6 text-right shrink-0">${bonus > 0 ? '+' + bonus : ''}</span>
              <div class="flex items-center gap-1 shrink-0">
                <button data-sk="${esc(sk.name)}" data-d="-1"
                  class="sk-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold flex items-center justify-center
                         ${free <= 0 ? 'opacity-30 cursor-not-allowed' : ''}">−</button>
                <span class="w-5 text-center text-sm font-mono">${free}</span>
                <button data-sk="${esc(sk.name)}" data-d="1"
                  class="sk-btn w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold flex items-center justify-center
                         ${remaining <= 0 && free < 1 ? 'opacity-30 cursor-not-allowed' : ''}">＋</button>
              </div>
              <span class="text-xs font-mono text-yellow-300 w-6 text-right shrink-0">${total > 0 ? total : '—'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Étape 7 : Traits (Qualités / Défauts) ─────────────────────────────────────
function renderStepTraits() {
  const isPNJ = DRAFT.type === 'pnj';
  const qualites = (REF?.qualites || []).filter(q => {
    if (!isPNJ) return !String(q.notes || '').toLowerCase().includes('pnj uniquement');
    return true;
  });
  const defauts = (REF?.defauts || []).filter(d => {
    if (!isPNJ) return !String(d.notes || '').toLowerCase().includes('pnj uniquement');
    return true;
  });

  const qPts = traitPoints(DRAFT.qualites_ids, REF?.qualites, 'cost');
  const dPts = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost');
  const dTotal = -dPts; // défauts ont coût négatif (ex: "-3")
  const qTotal =  qPts;
  const balance = dTotal - qTotal;
  const maxDef = 10;

  return `
  <h3 class="text-base font-semibold mb-1">Qualités &amp; Défauts (optionnel)</h3>
  <p class="text-xs text-gray-500 mb-1">Max 10 pts de défauts. Chaque défaut apporte des points, chaque qualité en coûte.</p>
  <div class="flex gap-4 text-sm mb-4 flex-wrap">
    <span>Défauts : <strong class="text-yellow-400">${dTotal} pts</strong> / max ${maxDef}</span>
    <span>Qualités dépensées : <strong class="text-blue-400">${qTotal} pts</strong></span>
    <span>Solde : <strong class="${balance >= 0 ? 'text-green-400' : 'text-red-400'}">${balance} pts</strong></span>
  </div>

  <div class="grid md:grid-cols-2 gap-4 overflow-y-auto max-h-[55vh]">
    <!-- Qualités -->
    <div>
      <p class="text-xs text-gray-400 font-semibold mb-2">Qualités</p>
      <div class="space-y-1 pr-1">
        ${qualites.map(q => {
          const sel = DRAFT.qualites_ids.includes(q.id);
          const cost = parseInt(q.cost) || 0;
          const disabled = !sel && balance < cost;
          return `
          <button data-trait="${q.id}" data-ttype="q"
            class="trait-btn w-full ${sel ? 'selected-q' : ''} ${disabled && !sel ? 'opacity-40' : ''}">
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium ${sel ? 'text-blue-300' : 'text-gray-300'}">${esc(q.name)}</span>
              <span class="text-xs text-blue-400 shrink-0 ml-2">${cost} pts</span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${esc(q.description || '')}</p>
          </button>`;
        }).join('')}
      </div>
    </div>
    <!-- Défauts -->
    <div>
      <p class="text-xs text-gray-400 font-semibold mb-2">Défauts</p>
      <div class="space-y-1 pr-1">
        ${defauts.map(d => {
          const sel = DRAFT.defauts_ids.includes(d.id);
          const pts = Math.abs(parseInt(d.cost) || 0);
          const wouldExceed = !sel && (dTotal + pts > maxDef);
          return `
          <button data-trait="${d.id}" data-ttype="d"
            class="trait-btn w-full ${sel ? 'selected-d' : ''} ${wouldExceed && !sel ? 'opacity-40' : ''}">
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium ${sel ? 'text-yellow-300' : 'text-gray-300'}">${esc(d.name)}</span>
              <span class="text-xs text-yellow-400 shrink-0 ml-2">+${pts} pts</span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${esc(d.description || '')}</p>
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function traitPoints(ids, list, field) {
  if (!ids || !list) return 0;
  return ids.reduce((sum, id) => {
    const item = list.find(x => x.id === id);
    const val = Math.abs(parseInt(item?.[field] || 0));
    return sum + val;
  }, 0);
}

// ── Étape 8 : Finitions (PJ) ──────────────────────────────────────────────────
function renderStepFinitions() {
  const orig  = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  const arch  = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const attrs = DRAFT.type === 'pj' ? DRAFT.attributs : DRAFT.attributs_pnj;
  const bonusAttrId = orig?.bonus_attribut?.attribut;
  const bonusVal    = orig?.bonus_attribut?.valeur || 0;

  const finalAttrs = {};
  for (const a of REF?.attributs || []) {
    const base = attrs[a.id] || 0;
    finalAttrs[a.id] = base + (bonusAttrId === a.id ? bonusVal : 0);
  }

  const sante    = (finalAttrs.carrure || 0) + (finalAttrs.sang_froid || 0);
  const energieX = DRAFT.is_mutant ? (finalAttrs.perception || 0) + (finalAttrs.intelligence || 0) : null;

  const mutations = DRAFT.is_mutant ? (REF?.mutations || []) : [];

  return `
  <h3 class="text-base font-semibold mb-4">Finitions</h3>

  <!-- Image de profil -->
  <div class="mb-4">
    <label class="text-xs text-gray-400 block mb-1">Image de profil</label>
    <div class="flex gap-3 items-start">
      <div id="fin-avatar-preview"
        style="width:96px;height:96px;border-radius:10px;background:#1f2937;border:1px solid #374151;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${DRAFT.avatar_url
          ? `<img src="${esc(DRAFT.avatar_url)}" style="width:100%;height:100%;object-fit:cover">`
          : `<span style="font-size:2.5rem">👤</span>`}
      </div>
      <div class="flex-1 space-y-2">
        <input type="text" id="fin-avatar-url" value="${esc(DRAFT.avatar_url || '')}"
          placeholder="URL de l'image…"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
        <label class="cursor-pointer inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors">
          📁 Choisir un fichier
          <input type="file" id="fin-avatar-file" accept="image/*" class="hidden">
        </label>
      </div>
    </div>
  </div>

  <!-- Nom + âge + description -->
  <div class="space-y-3 mb-5">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Nom du personnage *</label>
      <input type="text" id="fin-nom" value="${esc(DRAFT.nom_personnage || '')}"
        placeholder="Nom…"
        class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
    </div>
    <div class="flex gap-3">
      <div class="w-32">
        <label class="text-xs text-gray-400 block mb-1">Âge</label>
        <input type="number" id="fin-age" value="${DRAFT.age || ''}" min="1" max="999"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex-1">
        <label class="text-xs text-gray-400 block mb-1">Apparence / Historique</label>
        <textarea id="fin-desc" rows="2"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm resize-none"
          placeholder="Description, historique…">${esc(DRAFT.description || '')}</textarea>
      </div>
    </div>
  </div>

  <!-- Récapitulatif automatique -->
  <div class="bg-gray-900 border border-gray-600 rounded-xl p-4 space-y-3 text-sm">
    <p class="font-semibold text-gray-300">Récapitulatif automatique</p>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
      <div class="bg-gray-800 rounded-lg p-2">
        <p class="text-gray-400">Santé</p>
        <p class="text-2xl font-bold text-red-400">${sante}</p>
        <p class="text-gray-500">Car.${finalAttrs.carrure||0} + SC.${finalAttrs.sang_froid||0}</p>
      </div>
      ${ energieX !== null ? `
      <div class="bg-gray-800 rounded-lg p-2">
        <p class="text-gray-400">Énergie X</p>
        <p class="text-2xl font-bold text-cyan-400">${energieX}</p>
        <p class="text-gray-500">Per.${finalAttrs.perception||0} + Int.${finalAttrs.intelligence||0}</p>
      </div>` : '<div></div>' }
      <div class="bg-gray-800 rounded-lg p-2">
        <p class="text-gray-400">Panache</p>
        <p class="text-2xl font-bold text-yellow-400">3</p>
      </div>
      <div class="bg-gray-800 rounded-lg p-2">
        <p class="text-gray-400">Gloire</p>
        <p class="text-2xl font-bold">0</p>
      </div>
    </div>
    ${arch ? `<p class="text-xs text-gray-500">Équipement de départ : ${esc(arch.equipement_depart)}</p>` : ''}
  </div>

  <!-- Mutations (si mutant) -->
  ${mutations.length ? `
  <div class="mt-4">
    <p class="text-xs text-gray-400 font-semibold mb-2">Mutations (facultatif)</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
      ${mutations.map(m => {
        const sel = DRAFT.mutations_ids.includes(m.id);
        return `
        <label class="flex items-center gap-2 text-xs bg-gray-800 border ${sel ? 'border-cyan-600' : 'border-gray-700'} rounded px-3 py-2 cursor-pointer">
          <input type="checkbox" data-mut="${m.id}" ${sel ? 'checked' : ''}
            class="mut-check accent-cyan-500">
          <span class="${sel ? 'text-cyan-300' : 'text-gray-300'}">${esc(m.name)}</span>
          <span class="text-gray-500 ml-auto">${esc(m.mutation_type || '')}</span>
        </label>`;
      }).join('')}
    </div>
  </div>` : ''}`;
}

function _syncAvatarPreview(container, url) {
  const preview = container?.querySelector('#fin-avatar-preview');
  if (!preview) return;
  preview.innerHTML = url
    ? `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover">`
    : `<span style="font-size:2.5rem">👤</span>`;
}

function validateFinitions() {
  const nom = document.getElementById('fin-nom')?.value?.trim();
  if (nom) DRAFT.nom_personnage = nom;
  return !!DRAFT.nom_personnage?.trim();
}

// ── Étapes PNJ-spécifiques ────────────────────────────────────────────────────
function renderStepPNJType() {
  const niveaux = REF?.pnj_niveaux || [];
  return `
  <h3 class="text-base font-semibold mb-1">Type de PNJ</h3>
  <p class="text-xs text-gray-500 mb-4">Choisissez le niveau de puissance du PNJ.</p>
  <div class="space-y-2">
    ${niveaux.map(n => {
      const sel = DRAFT.pnj_niveau === n.id;
      return `
      <button data-niveau="${n.id}"
        class="pnj-niveau-btn sel-btn w-full text-left px-4 py-3 ${sel ? 'sel-purple' : ''}">
        <div class="flex items-center justify-between">
          <div>
            <span class="font-semibold">${esc(n.nom)}</span>
            <span class="text-xs text-gray-400 ml-2">(${esc(n.code)})</span>
            <p class="text-xs text-gray-500 mt-0.5">${esc(n.description)}</p>
          </div>
          <span class="text-xs text-gray-500 text-right shrink-0 ml-2">
            Car. ${n.caracteristiques.join('/')}<br>
            Comp. ${n.competences_pool.join('/')}
          </span>
        </div>
      </button>`;
    }).join('')}
  </div>`;
}

function validatePNJType() { return !!DRAFT.pnj_niveau; }

function renderStepPNJProfil() {
  const isPirate = DRAFT.pnj_is_pirate;
  const isNamed  = DRAFT.pnj_is_named;

  const motivations = REF?.motivations || [];
  const archetypes  = REF?.archetypes  || [];
  const domaines    = REF?.domaines    || [];

  return `
  <h3 class="text-base font-semibold mb-4">Profil du PNJ</h3>

  <!-- Pirate ? -->
  <div class="mb-4">
    <p class="text-xs text-gray-400 mb-2">Est-ce un pirate ?</p>
    <div class="flex gap-3">
      <button data-pirate="false"
        class="pnj-pirate-btn sel-btn flex-1 py-2 text-sm text-center ${!isPirate ? 'sel-gold' : ''}">
        🚔 Non-pirate
      </button>
      <button data-pirate="true"
        class="pnj-pirate-btn sel-btn flex-1 py-2 text-sm text-center ${isPirate ? 'sel-pirate' : ''}">
        🏴‍☠️ Pirate
      </button>
    </div>
  </div>

  <!-- Nommé ? -->
  <div class="mb-4">
    <p class="text-xs text-gray-400 mb-2">Est-ce un personnage nommé ?</p>
    <div class="flex gap-3">
      <button data-named="false"
        class="pnj-named-btn sel-btn flex-1 py-2 text-sm text-center ${!isNamed ? 'sel-gold' : ''}">
        Figurant
      </button>
      <button data-named="true"
        class="pnj-named-btn sel-btn flex-1 py-2 text-sm text-center ${isNamed ? 'sel-purple' : ''}">
        Nommé
      </button>
    </div>
  </div>

  ${ isPirate && isNamed ? `
  <!-- Motivation (pirate nommé) -->
  <div class="mb-4">
    <p class="text-xs text-gray-400 mb-2">Motivation</p>
    <select id="pnj-motiv-select"
      class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      <option value="">— Choisir —</option>
      ${motivations.map(m => `<option value="${m.id}" ${DRAFT.motivation_id === m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}
    </select>
  </div>
  <!-- Archétype (pirate nommé) -->
  <div class="mb-4">
    <p class="text-xs text-gray-400 mb-2">Archétype <span class="text-gray-500">(détermine les domaines privilégiés)</span></p>
    <select id="pnj-arch-select"
      class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
      <option value="">— Choisir —</option>
      ${archetypes.map(a => `<option value="${a.id}" ${DRAFT.archetype_id === a.id ? 'selected' : ''}>${esc(a.nom)} — [${a.domaines_privileges.join(', ')}]</option>`).join('')}
    </select>
  </div>` :
  !isPirate ? `
  <!-- Domaines libres (non-pirate) -->
  <div class="mb-4">
    <p class="text-xs text-gray-400 mb-2">Choisissez 3 domaines privilégiés</p>
    <div class="flex flex-wrap gap-2">
      ${domaines.map(d => {
        const sel = DRAFT.domaines_libres.includes(d.id);
        const disabled = !sel && DRAFT.domaines_libres.length >= 3;
        return `
        <button data-dom="${d.id}"
          class="dom-btn px-3 py-1.5 rounded-lg border text-sm transition-colors
                 ${sel ? 'border-yellow-500 bg-yellow-900/20 text-yellow-300' : disabled ? 'border-gray-700 text-gray-600' : 'border-gray-600 text-gray-300 hover:border-gray-400'}">
          ${sel ? '★ ' : ''}${esc(d.id)}
        </button>`;
      }).join('')}
    </div>
    <p class="text-xs text-gray-500 mt-1">${DRAFT.domaines_libres.length}/3 domaines sélectionnés</p>
  </div>` : '' }`;
}

function validatePNJProfil() {
  if (DRAFT.pnj_is_pirate && DRAFT.pnj_is_named) {
    return !!DRAFT.motivation_id && !!DRAFT.archetype_id;
  }
  if (!DRAFT.pnj_is_pirate) {
    return DRAFT.domaines_libres.length === 3;
  }
  return true;
}

function renderStepPNJAttributs() {
  const level = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
  const pool  = level?.caracteristiques || [3,2,2,2,2,1];
  const attrs = REF?.attributs || [];

  return `
  <h3 class="text-base font-semibold mb-1">Attributs du PNJ</h3>
  <p class="text-xs text-gray-500 mb-4">
    Répartissez les valeurs suggérées (${pool.join('/')}) ou personnalisez librement.
  </p>
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    ${attrs.map(a => {
      const val = DRAFT.attributs_pnj[a.id] ?? '';
      return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <label class="text-xs text-gray-400 block mb-1">${esc(a.nom)}</label>
        <input type="number" data-pnj-attr="${a.id}" value="${val}" min="1" max="8"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-center">
      </div>`;
    }).join('')}
  </div>
  <button id="btn-fill-pnj-attrs"
    class="mt-3 text-xs text-blue-400 hover:text-blue-300">
    ↺ Pré-remplir avec les valeurs du niveau (${pool.join('/')})
  </button>`;
}

function renderStepPNJCompetences() {
  const domaines = REF?.domaines || [];
  const competences = REF?.competences || [];
  const arch = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const domPriv = arch?.domaines_privileges || DRAFT.domaines_libres || [];

  const byDomain = {};
  domaines.forEach(d => { byDomain[d.id] = []; });
  competences.forEach(c => { if (byDomain[c.domain]) byDomain[c.domain].push(c); });

  return `
  <h3 class="text-base font-semibold mb-1">Compétences du PNJ</h3>
  <p class="text-xs text-gray-500 mb-4">
    Saisissez directement le nombre de dés d'action pour les compétences maîtrisées.
    Les autres afficheront la valeur de la caractéristique associée.
  </p>
  <div class="space-y-4 overflow-y-auto max-h-[55vh] pr-1">
    ${domaines.map(dom => {
      const skills = byDomain[dom.id] || [];
      const priv = domPriv.includes(dom.id);
      const attrNom = REF?.attributs?.find(a => a.id === dom.attribut)?.nom || '';
      return `
      <div>
        <p class="text-xs font-semibold mb-1 ${priv ? 'text-yellow-300' : 'text-gray-400'}">
          ${priv ? '★ ' : ''}${esc(dom.id)} <span class="text-gray-500 font-normal">(${esc(attrNom)})</span>
        </p>
        <div class="space-y-0.5">
          ${skills.map(sk => {
            const val = DRAFT.competences_pnj[sk.name] ?? '';
            return `
            <div class="flex items-center gap-2 py-0.5 border-b border-gray-700/50">
              <span class="flex-1 text-xs text-gray-300 truncate">${esc(sk.name)}</span>
              <input type="number" data-pnj-sk="${esc(sk.name)}" value="${val}" min="0" max="12"
                placeholder="—"
                class="w-14 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs text-center">
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Listeners des étapes ──────────────────────────────────────────────────────
function attachStepListeners() {
  const step = document.getElementById('wizard-step');

  // Mutant toggle
  step.querySelectorAll('.mutant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.is_mutant = btn.dataset.val === 'true';
      document.getElementById('wizard-step').innerHTML = renderStepMutant();
      attachStepListeners();
    });
  });

  // Nation cards → populate origine select
  step.querySelectorAll('.nation-card').forEach(card => {
    card.addEventListener('click', () => {
      const nation = card.dataset.nation;
      DRAFT._origine_nation = nation;
      // Highlight selected card
      step.querySelectorAll('.nation-card').forEach(c => {
        const isNow = c.dataset.nation === nation;
        c.classList.toggle('border-yellow-500', isNow);
        c.classList.toggle('bg-yellow-900/20', isNow);
        c.classList.toggle('text-yellow-300', isNow);
        c.classList.toggle('border-gray-700', !isNow);
        c.classList.toggle('bg-gray-800', !isNow);
        c.classList.toggle('text-gray-300', !isNow);
      });
      // Show and populate origine select
      const wrap    = step.querySelector('#origine-select-wrap');
      const origSel = step.querySelector('#origine-select');
      if (wrap) wrap.classList.remove('hidden');
      if (origSel) {
        const opts = (REF?.origines || []).filter(o => o.nation === nation);
        origSel.innerHTML = `<option value="">— Choisir une origine —</option>` +
          opts.map(o => `<option value="${esc(o.id)}">${esc(o.nom)}${o.restriction ? ' ⚠' : ''}</option>`).join('');
      }
      // Reset origine if nation changed
      if (DRAFT.origine_id) {
        const currentOrigine = REF?.origines?.find(o => o.id === DRAFT.origine_id);
        if (currentOrigine?.nation !== nation) {
          DRAFT.origine_id = null;
          DRAFT.origine_choix = {};
          step.querySelector('#origine-detail').innerHTML = '';
          step.querySelector('#origine-choix').innerHTML  = '';
        }
      }
    });
  });

  // Origine select
  const origSel = step.querySelector('#origine-select');
  if (origSel) {
    origSel.addEventListener('change', () => {
      DRAFT.origine_id = origSel.value || null;
      DRAFT.origine_choix = {};
      const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
      step.querySelector('#origine-detail').innerHTML = orig ? renderOrigineDetail(orig) : '';
      step.querySelector('#origine-choix').innerHTML  = orig ? renderOrigineChoix(orig) : '';
      attachOrigineChoixListeners(step);
    });
    attachOrigineChoixListeners(step);
  }

  // Motivation
  step.querySelectorAll('.motiv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.motivation_id = btn.dataset.motiv;
      document.getElementById('wizard-step').innerHTML = renderStepMotivation();
      attachStepListeners();
    });
  });

  // Archétype
  step.querySelectorAll('[data-arch]').forEach(card => {
    card.addEventListener('click', e => {
      const radio = e.target.closest('input[type=radio]');
      if (radio) { DRAFT.action_archetype = radio.value; return; } // action radio
      DRAFT.archetype_id = card.dataset.arch;
      DRAFT.action_archetype = null;
      document.getElementById('wizard-step').innerHTML = renderStepArchetype();
      attachStepListeners();
    });
  });
  step.querySelectorAll('input[name=action-arch]').forEach(r => {
    r.addEventListener('change', () => { DRAFT.action_archetype = r.value; });
  });

  // Attributs PJ
  step.querySelectorAll('.attr-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const attr = sel.dataset.attr;
      DRAFT.attributs[attr] = sel.value ? parseInt(sel.value) : null;
      document.getElementById('wizard-step').innerHTML = renderStepAttributs();
      attachStepListeners();
    });
  });

  // Compétences PJ
  step.querySelectorAll('.sk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sk = btn.dataset.sk;
      const delta = parseInt(btn.dataset.d);
      const cur = DRAFT.competences_libres[sk] || 0;
      const newVal = Math.max(0, cur + delta);
      const used = Object.values(DRAFT.competences_libres).reduce((s,v) => s+v, 0) - cur + newVal;
      if (delta > 0 && used > FREE_COMPETENCES_PJ) return;
      if (newVal === 0) delete DRAFT.competences_libres[sk];
      else DRAFT.competences_libres[sk] = newVal;
      document.getElementById('wizard-step').innerHTML = renderStepCompetences();
      attachStepListeners();
    });
  });

  // Traits
  step.querySelectorAll('[data-trait]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.trait;
      const ttype = btn.dataset.ttype;
      if (ttype === 'q') {
        const idx = DRAFT.qualites_ids.indexOf(id);
        const cost = parseInt(REF?.qualites?.find(q => q.id === id)?.cost || 0);
        const qPts = traitPoints(DRAFT.qualites_ids, REF?.qualites, 'cost');
        const dPs  = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost');
        const balance = dPs - qPts;
        if (idx >= 0) { DRAFT.qualites_ids.splice(idx, 1); }
        else if (balance >= cost) { DRAFT.qualites_ids.push(id); }
      } else {
        const idx = DRAFT.defauts_ids.indexOf(id);
        const pts  = Math.abs(parseInt(REF?.defauts?.find(d => d.id === id)?.cost || 0));
        const dPs  = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost');
        const maxDef = 10;
        if (idx >= 0) { DRAFT.defauts_ids.splice(idx, 1); }
        else if (dPs + pts <= maxDef) { DRAFT.defauts_ids.push(id); }
      }
      document.getElementById('wizard-step').innerHTML = renderStepTraits();
      attachStepListeners();
    });
  });

  // Finitions
  const finNom = step.querySelector('#fin-nom');
  if (finNom) {
    finNom.addEventListener('input', () => { DRAFT.nom_personnage = finNom.value; });
    step.querySelector('#fin-age')?.addEventListener('input', e => { DRAFT.age = e.target.value; });
    step.querySelector('#fin-desc')?.addEventListener('input', e => { DRAFT.description = e.target.value; });

    // Image de profil — champ URL
    const avatarUrlInput = step.querySelector('#fin-avatar-url');
    if (avatarUrlInput) {
      avatarUrlInput.addEventListener('input', () => {
        DRAFT.avatar_url = avatarUrlInput.value.trim() || '';
        _syncAvatarPreview(step, DRAFT.avatar_url);
      });
    }

    // Image de profil — import fichier
    step.querySelector('#fin-avatar-file')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetchWithTable('/api/upload', { method: 'POST', body: fd });
        const json = await r.json();
        if (r.ok && json.data?.url) {
          DRAFT.avatar_url = json.data.url;
          if (avatarUrlInput) avatarUrlInput.value = json.data.url;
          _syncAvatarPreview(step, json.data.url);
        }
      } catch { /* ignore upload errors */ }
    });

    step.querySelectorAll('.mut-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const mid = cb.dataset.mut;
        const idx = DRAFT.mutations_ids.indexOf(mid);
        if (cb.checked && idx < 0) DRAFT.mutations_ids.push(mid);
        if (!cb.checked && idx >= 0) DRAFT.mutations_ids.splice(idx, 1);
      });
    });
  }

  // PNJ: niveau
  step.querySelectorAll('[data-niveau]').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.pnj_niveau = btn.dataset.niveau;
      document.getElementById('wizard-step').innerHTML = renderStepPNJType();
      attachStepListeners();
    });
  });

  // PNJ: pirate toggle
  step.querySelectorAll('.pnj-pirate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.pnj_is_pirate = btn.dataset.pirate === 'true';
      if (!DRAFT.pnj_is_pirate) { DRAFT.motivation_id = null; DRAFT.archetype_id = null; }
      else { DRAFT.domaines_libres = []; }
      document.getElementById('wizard-step').innerHTML = renderStepPNJProfil();
      attachStepListeners();
    });
  });

  // PNJ: named toggle
  step.querySelectorAll('.pnj-named-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.pnj_is_named = btn.dataset.named === 'true';
      document.getElementById('wizard-step').innerHTML = renderStepPNJProfil();
      attachStepListeners();
    });
  });

  // PNJ: motivation select
  const pnjMotivSel = step.querySelector('#pnj-motiv-select');
  if (pnjMotivSel) pnjMotivSel.addEventListener('change', () => { DRAFT.motivation_id = pnjMotivSel.value || null; });

  // PNJ: archétype select
  const pnjArchSel = step.querySelector('#pnj-arch-select');
  if (pnjArchSel) pnjArchSel.addEventListener('change', () => { DRAFT.archetype_id = pnjArchSel.value || null; });

  // PNJ: domaines libres
  step.querySelectorAll('[data-dom]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dom = btn.dataset.dom;
      const idx = DRAFT.domaines_libres.indexOf(dom);
      if (idx >= 0) { DRAFT.domaines_libres.splice(idx, 1); }
      else if (DRAFT.domaines_libres.length < 3) { DRAFT.domaines_libres.push(dom); }
      document.getElementById('wizard-step').innerHTML = renderStepPNJProfil();
      attachStepListeners();
    });
  });

  // PNJ: attributs
  step.querySelectorAll('[data-pnj-attr]').forEach(inp => {
    inp.addEventListener('input', () => {
      DRAFT.attributs_pnj[inp.dataset.pnjAttr] = inp.value ? parseInt(inp.value) : null;
    });
  });
  const fillBtn = step.querySelector('#btn-fill-pnj-attrs');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      const level = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
      const pool  = [...(level?.caracteristiques || [3,2,2,2,2,1])].sort((a,b) => b-a);
      const attrs = REF?.attributs || [];
      // Assign highest attr values to the attributes in order
      attrs.forEach((a, i) => { DRAFT.attributs_pnj[a.id] = pool[i] ?? 1; });
      document.getElementById('wizard-step').innerHTML = renderStepPNJAttributs();
      attachStepListeners();
    });
  }

  // PNJ: compétences directes
  step.querySelectorAll('[data-pnj-sk]').forEach(inp => {
    inp.addEventListener('input', () => {
      const sk = inp.dataset.pnjSk;
      const v  = parseInt(inp.value);
      if (!isNaN(v) && v > 0) DRAFT.competences_pnj[sk] = v;
      else delete DRAFT.competences_pnj[sk];
    });
  });
}

function attachOrigineChoixListeners(step) {
  step.querySelectorAll('[data-choix]').forEach(inp => {
    inp.addEventListener('input', () => {
      DRAFT.origine_choix[inp.dataset.choix] = inp.value;
    });
  });
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────
async function saveCharacter() {
  // Collecter derniers champs de finitions
  const finNom  = document.getElementById('fin-nom');
  const finAge  = document.getElementById('fin-age');
  const finDesc = document.getElementById('fin-desc');
  if (finNom) DRAFT.nom_personnage = finNom.value?.trim();
  if (finAge) DRAFT.age = finAge.value;
  if (finDesc) DRAFT.description = finDesc.value;

  if (!DRAFT.nom_personnage?.trim()) {
    showStepError('Le nom du personnage est requis.'); return;
  }

  // Calculer valeurs finales
  const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  const bonusAttrId = orig?.bonus_attribut?.attribut;
  const bonusVal    = orig?.bonus_attribut?.valeur || 0;
  const baseAttrs   = DRAFT.type === 'pj' ? DRAFT.attributs : DRAFT.attributs_pnj;

  const finalAttrs = {};
  for (const a of REF?.attributs || []) {
    finalAttrs[a.id] = (baseAttrs[a.id] || 0) + (bonusAttrId === a.id ? bonusVal : 0);
  }

  const payload = {
    type: DRAFT.type,
    name: DRAFT.nom_personnage,
    data: {
      ...DRAFT,
      panache:   3,
      gloire:    0,
      sante:     (finalAttrs.carrure || 0) + (finalAttrs.sang_froid || 0),
      energie_x: DRAFT.is_mutant ? (finalAttrs.perception || 0) + (finalAttrs.intelligence || 0) : null,
    },
  };

  try {
    let r;
    if (EDITING_ID) {
      r = await fetchWithTable(`${API.characters}/${EDITING_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } else {
      r = await fetchWithTable(API.characters, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      showStepError(err?.error?.message || 'Erreur lors de la sauvegarde.');
      return;
    }
    const { data: saved } = await r.json();
    showSheet(saved.id);
  } catch (e) {
    showStepError('Erreur réseau : ' + e.message);
  }
}

// ── Helpers globaux ───────────────────────────────────────────────────────────
function setView(v) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('char-list-view').classList.toggle('hidden', v !== 'list');
  document.getElementById('wizard-view').classList.toggle('hidden', v !== 'wizard');
  document.getElementById('sheet-view').classList.toggle('hidden', v !== 'sheet');
  MODE = v;
  updateTopButtons();
}

function showError(msg) {
  document.getElementById('loading').innerHTML = `<p class="text-red-400">${esc(msg)}</p>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Calcule le bonus total par compétence (origine + motivation, sans les points libres). */
function buildBonusMap() {
  const map = {};
  const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  if (orig) {
    for (const bc of orig.bonus_competences || []) {
      const key = bc.competence;
      map[key] = (map[key] || 0) + bc.valeur;
    }
  }
  const motiv = REF?.motivations?.find(m => m.id === DRAFT.motivation_id);
  if (motiv) {
    for (const bc of motiv.bonus_competences || []) {
      map[bc.competence] = (map[bc.competence] || 0) + bc.valeur;
    }
  }
  return map;
}

/** Construit la map totale des compétences (libres + bonus). */
function buildCompetences(d) {
  const map = {};
  const orig = REF?.origines?.find(o => o.id === d.origine_id);
  const motiv = REF?.motivations?.find(m => m.id === d.motivation_id);

  // Bonus origine
  if (orig) {
    for (const bc of orig.bonus_competences || []) {
      const key = bc.competence;
      if (!map[key]) map[key] = { bonus: 0, libre: 0, total: 0, specialite: bc.specialite || null };
      map[key].bonus += bc.valeur;
    }
  }
  // Bonus motivation
  if (motiv) {
    for (const bc of motiv.bonus_competences || []) {
      if (!map[bc.competence]) map[bc.competence] = { bonus: 0, libre: 0, total: 0, specialite: null };
      map[bc.competence].bonus += bc.valeur;
    }
  }
  // Points libres PJ
  for (const [sk, v] of Object.entries(d.competences_libres || {})) {
    if (!map[sk]) map[sk] = { bonus: 0, libre: 0, total: 0, specialite: null };
    map[sk].libre = v;
  }
  // Points directs PNJ
  for (const [sk, v] of Object.entries(d.competences_pnj || {})) {
    if (!map[sk]) map[sk] = { bonus: 0, libre: 0, total: 0, specialite: null };
    map[sk].libre = v; // valeur directe pour PNJ
  }
  // Totaux
  for (const v of Object.values(map)) { v.total = v.bonus + v.libre; }
  return map;
}

// Expose showListView et editChar globalement pour les handlers inline
window.showListView = showListView;
window.editChar = editChar;
