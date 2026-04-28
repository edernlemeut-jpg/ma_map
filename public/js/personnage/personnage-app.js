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

// Distribution libre compétences PJ : 2×+3 (dom. principal), 4×+2 (dom. privil.), 4×+1 (libre)
const COMP_SLOTS = { plus3: 2, plus2: 4, plus1: 4 };
// Types disponibles pour compétences "Au choix"
const ENV_TYPES      = ['Arctique','Désert','Espace','Jungle','Marécages','Mer','Montagne','Roche','Tempéré','Urbain'];
const PILOTAGE_TYPES = ['Bateau à voiles','Véhicule maritime','Véhicule spatial','Véhicule aérien','Véhicule terrestre'];

/** Retourne +1 si skName est une compétence de départ de l'archétype (direct ou via choix Au choix). */
function getArchBonusForSkill(skName, compArch, choix) {
  if (compArch.includes(skName)) return 1;
  for (const ac of compArch) {
    if (!ac.includes('(Au choix)')) continue;
    const chosen = choix[ac];
    if (!chosen) continue;
    const base = ac.split('(')[0].trim().toLowerCase();
    if (skName.toLowerCase().startsWith(base) && skName.toLowerCase().includes(chosen.toLowerCase())) return 1;
  }
  return 0;
}

/** Résout le nom final d'un bonus_competences d'origine.
 * - bc.au_choix=true → le joueur choisit dans origine_choix
 * - compétence "(Au choix)" avec bc.specialite → type pré-défini dans les données
 * - sinon → nom direct
 * Retourne null si le type n'est pas encore choisi.
 */
function resolveOrigineComp(bc, origineChoix) {
  if (bc.au_choix) {
    return resolveAuChoixKey(bc.competence, (origineChoix || {})[bc.competence]) || null;
  }
  if (/\(au choix/i.test(bc.competence) && bc.specialite) {
    return resolveAuChoixKey(bc.competence, bc.specialite) || bc.competence;
  }
  return bc.competence;
}

/** Retourne les options de type pour une compétence "(Au choix)" ou null sinon. */
function archChoixTypeOptions(sk) {
  if (sk.startsWith('Environnement')) return ENV_TYPES;
  if (sk.startsWith('Pilotage'))      return PILOTAGE_TYPES;
  return null; // texte libre
}

/**
 * Résout une compétence "(Au choix)" en son nom réel dans REF.competences,
 * en utilisant le type choisi par l'utilisateur.
 * Ex: resolveAuChoixKey('Environnement (Au choix)', 'Espace') → 'Environnement (espace)'
 * ou 'Artisanat (Au choix)' + 'Armes' → 'Artisanat (Armes)' (clé libre, pas dans REF)
 */
function resolveAuChoixKey(baseComp, chosen) {
  if (!chosen) return null;
  const base = baseComp.replace(/\s*\(Au choix\)\s*/i, '').trim();
  // Chercher une correspondance exacte dans REF
  const match = (REF?.competences || []).find(c =>
    c.name.toLowerCase().startsWith(base.toLowerCase() + ' (') &&
    c.name.toLowerCase().includes(chosen.toLowerCase()) &&
    !c.name.toLowerCase().includes('au choix')
  );
  return match ? match.name : `${base} (${chosen})`;
}

/**
 * Retourne les options de type pour une compétence d'origine "(Au choix)",
 * en cherchant les variantes existant dans REF.competences.
 */
function origineChoixTypeOptions(compName) {
  const base = compName.replace(/\s*\(Au choix\)\s*/i, '').trim().toLowerCase();
  const variants = (REF?.competences || [])
    .filter(c => {
      const n = c.name.toLowerCase();
      return n.startsWith(base + ' (') && !n.includes('au choix');
    })
    .map(c => { const m = c.name.match(/\(([^)]+)\)/); return m ? m[1] : c.name; });
  if (variants.length > 0) return variants;
  // Fallback connu
  if (base === 'environnement') return ENV_TYPES;
  if (base === 'pilotage')      return PILOTAGE_TYPES;
  return null; // texte libre
}

// ── Variable-cost trait levels (accessible partout dans le module) ────────────
const VARIABLE_TRAIT_LEVELS = {
  'qualite-contact':         [1, 3, 5],
  'qualite-entraînement':    [1, 2, 3, 4, 5],
  'qualite-gloire':          [1, 2, 3, 4, 5],
  'qualite-heroïque':        [1, 2, 3, 4, 5],
  'qualite-pacifiste':       [1, 3, 5],
  'qualite-riche':           [1, 2, 3, 4, 5],
  'qualite-route-dhavana':   [1, 3, 5],
  'qualite-tresor':          [1, 2, 3, 4, 5],
  'qualite-grand-voyageur-2': [1, 2, 3, 4, 5],
  'defaut-dettes':           [1, 2, 3, 4, 5],
  'defaut-dette-dhonneur':   [1, 2, 3, 4, 5],
  'defaut-hook ':            [1, 3, 5],
  'defaut-signe-distinctif': [1, 3, 5],
  'defaut-vengeance ':       [1, 3, 5],
  'defaut-wanted':           [1, 3, 5],
};

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
  // PJ étape 6 : compétences libres — map { 'Navigation': 2, ... } — valeur = 1|2|3 (slots libres)
  competences_libres: {},
  // PJ étape 6 : choix de type pour compétences d'archétype "Au choix"
  competences_archetype_choix: {},
  // PJ étape 7 : traits
  qualites_ids: [],
  defauts_ids: [],
  traits_niveaux: {},
  entrainement_bonus: {}, // { 'CompétenceName': nbPts } attribués via l'avantage Entraînement
  // PJ étape 8 : finitions
  nom_personnage: '',
  age: '',
  description: '',
  mutations_ids: [],
  avatar_url: '',       // image de profil (URL)
  // Genre
  genre: 'homme',
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
let TRAITS_TAB    = { section: 'd', filter: 'all' }; // UI-only : onglets de l'étape Traits
let LIST_TAB      = 'joueurs';   // UI-only : onglet actif de la liste MJ ('joueurs' | 'mj')
let CHARS_CACHE   = [];          // dernier fetch de la liste (pour changer d'onglet sans re-fetch)
let MUTATION_TAB  = 'basique';               // UI-only : onglet actif de l'étape Mutations
let SHEET_TAB     = 'caracteristiques';      // UI-only : onglet actif de la fiche
let CURRENT_SHEET_CHAR = null;               // char courant affiché en fiche

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
    CHARS_CACHE = chars;
    renderCharList(chars);
  } catch {
    CHARS_CACHE = [];
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

  if (ROLE !== 'mj' && ROLE !== 'admin') {
    // Joueur : uniquement les PJs de la table
    chars.forEach(c => container.appendChild(charCard(c)));
    return;
  }

  // MJ : onglets séparés
  const pjsJoueurs = chars.filter(c => c.type === 'pj'  && c.created_by !== USER_ID);
  const mesCreas   = chars.filter(c => c.created_by === USER_ID || c.type === 'pnj');
  // Dédupliquer (PNJ créé par le MJ compte une seule fois)
  const mesCreaUniq = [...new Map(mesCreas.map(c => [c.id, c])).values()];

  const tabBtn = (key, label, count) => `
    <button data-list-tab="${key}"
      class="flex-1 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 flex items-center justify-center gap-2
        ${LIST_TAB === key
          ? 'text-white border-yellow-400 bg-gray-700/60'
          : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800'}">
      ${label}
      <span class="text-xs px-1.5 py-0.5 rounded-full
        ${LIST_TAB === key ? 'bg-yellow-500/20 text-yellow-300' : 'bg-gray-700 text-gray-500'}">${count}</span>
    </button>`;

  container.insertAdjacentHTML('beforeend', `
    <div class="flex gap-0 border-b border-gray-700 mb-3">
      ${tabBtn('joueurs', '🧑‍🤝‍🧑 PJs des joueurs', pjsJoueurs.length)}
      ${tabBtn('mj',      '🎲 Mes créations',        mesCreaUniq.length)}
    </div>
    <div id="list-tab-content" class="space-y-2"></div>
  `);

  const content = container.querySelector('#list-tab-content');
  const renderTab = async () => {
    content.innerHTML = '';
    const list = LIST_TAB === 'joueurs' ? pjsJoueurs : mesCreaUniq;

    // Panneau MJ — expérience et récompenses (onglet Joueurs uniquement)
    if (LIST_TAB === 'joueurs') {
      const mjPanel = document.createElement('div');
      mjPanel.className = 'bg-gray-800/80 border border-yellow-700/40 rounded-xl p-4 mb-4';
      mjPanel.innerHTML = `
        <p class="text-sm font-semibold text-yellow-300 mb-3">🎖 Récompenses — Table de jeu</p>
        ${list.length ? `
        <div>
          <p class="text-xs text-gray-400 mb-2">Récompenses par joueur</p>
          <div class="space-y-2">
            ${list.map(c => `
            <div class="flex items-center gap-3 py-1 border-b border-gray-700/50">
              <span class="text-sm text-gray-300 flex-1 truncate">${esc(c.data?.nom_personnage || c.name)}</span>
              <span class="text-xs text-yellow-400">${c.data?.px_actuel ?? 0} PX</span>
              <input type="number" data-px-for="${c.id}" min="1" value="500"
                class="w-16 bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-center">
              <button data-char-id="${c.id}" data-award="px" data-delta="-1"
                class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-red-800/40 rounded text-xs border border-gray-600 hover:border-red-600 transition-colors">−</button>
              <button data-char-id="${c.id}" data-award="px" data-delta="1"
                class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-green-800/40 rounded text-xs border border-gray-600 hover:border-green-600 transition-colors">+</button>
              <span class="text-xs text-gray-500 ml-2">Gloire <strong class="text-gray-200">${c.data?.gloire ?? 0}</strong></span>
              <div class="flex gap-1">
                <button data-char-id="${c.id}" data-award="gloire" data-delta="-1"
                  class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-red-800/40 rounded text-xs border border-gray-600 hover:border-red-600 transition-colors">−</button>
                <button data-char-id="${c.id}" data-award="gloire" data-delta="1"
                  class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-green-800/40 rounded text-xs border border-gray-600 hover:border-green-600 transition-colors">+</button>
              </div>
              <span class="text-xs text-gray-500 ml-2">Panache <strong class="text-gray-200">${c.data?.panache ?? 3}</strong></span>
              <div class="flex gap-1">
                <button data-char-id="${c.id}" data-award="panache" data-delta="-1"
                  class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-red-800/40 rounded text-xs border border-gray-600 hover:border-red-600 transition-colors">−</button>
                <button data-char-id="${c.id}" data-award="panache" data-delta="1"
                  class="award-btn px-1.5 py-0.5 bg-gray-700 hover:bg-green-800/40 rounded text-xs border border-gray-600 hover:border-green-600 transition-colors">+</button>
              </div>
            </div>`).join('')}
          </div>
        </div>` : ''}`;
      content.appendChild(mjPanel);

      mjPanel.querySelectorAll('.award-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { charId, award, delta } = btn.dataset;
          let body;
          if (award === 'gloire')       body = { gloire_delta:  parseInt(delta) };
          else if (award === 'panache') body = { panache_delta: parseInt(delta) };
          else if (award === 'px') {
            const input = mjPanel.querySelector(`[data-px-for="${charId}"]`);
            const amount = parseInt(input?.value || 500);
            body = { px_delta: parseInt(delta) * amount };
          }
          if (!body) return;
          const r = await fetchWithTable(`/api/characters/${charId}/awards`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (r.ok) { showListView(); }
          else {
            const err = await r.json().catch(() => ({}));
            console.error('awards error', r.status, err);
            alert(`Erreur ${r.status} : ${err?.message || 'Impossible de modifier le personnage'}`);
          }
        });
      });
    }

    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'text-gray-600 text-xs py-4 text-center';
      p.textContent = 'Aucun personnage dans cette catégorie.';
      content.appendChild(p);
      return;
    }
    if (LIST_TAB === 'mj') {
      const mjPjs  = mesCreaUniq.filter(c => c.type === 'pj');
      const mjPnjs = mesCreaUniq.filter(c => c.type === 'pnj');
      if (mjPjs.length) {
        content.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-500 uppercase mb-2">PJs</p>');
        mjPjs.forEach(c => content.appendChild(charCard(c)));
      }
      if (mjPnjs.length) {
        content.insertAdjacentHTML('beforeend', `<p class="text-xs text-gray-500 uppercase ${mjPjs.length ? 'mt-4 ' : ''}mb-2">PNJs</p>`);
        mjPnjs.forEach(c => content.appendChild(charCard(c)));
      }
    } else {
      list.forEach(c => content.appendChild(charCard(c)));
    }
  };

  renderTab();

  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-list-tab]');
    if (!btn) return;
    LIST_TAB = btn.dataset.listTab;
    renderCharList(CHARS_CACHE);
  }, { once: true });
}

function charCard(c) {
  const d = c.data || {};
  const div = document.createElement('div');
  div.className = 'flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 gap-3';
  const arch = d.archetype_id ? (REF?.archetypes?.find(a => a.id === d.archetype_id)?.nom || '') : '';
  const orig = d.origine_id   ? (REF?.origines?.find(o => o.id === d.origine_id)?.nom || '') : '';
  const sub  = [arch, orig].filter(Boolean).join(' · ') || (c.type === 'pnj' ? 'PNJ' : 'PJ');
  const creatorTag = (ROLE === 'mj' || ROLE === 'admin') && c.creator_name && c.type === 'pj'
    ? `<span class="text-xs text-yellow-500/80">👤 ${esc(c.creator_name)}</span>`
    : '';
  const avatarHtml = d.avatar_url
    ? `<img src="${esc(d.avatar_url)}" class="w-10 h-10 rounded-full object-cover shrink-0" alt="">`
    : `<div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg shrink-0">👤</div>`;
  div.innerHTML = `
    ${avatarHtml}
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate">${esc(c.name)}</p>
      <p class="text-xs text-gray-400">${esc(sub)}</p>
      ${creatorTag}
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
  SHEET_TAB = 'caracteristiques';
  const container = document.getElementById('sheet-view');
  container.innerHTML = '<p class="text-gray-400 py-8 text-center">Chargement…</p>';
  try {
    const r = await fetchWithTable(`${API.characters}/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error();
    const { data: char } = await r.json();
    CURRENT_SHEET_CHAR = char;
    renderAndAttachSheet(container, char);
  } catch {
    container.innerHTML = '<p class="text-red-400">Impossible de charger le personnage.</p>';
  }
}

function renderAndAttachSheet(container, char) {
  container.innerHTML = renderSheet(char);
  // Trackers
  const state = _loadTrackerState(char.id);
  _applyTrackerState(container, state);
  container.querySelectorAll('.tracker-box[data-tracker-id]').forEach(box => {
    box.addEventListener('click', () => {
      box.classList.toggle('checked');
      _saveTrackerState(char.id, _collectTrackerState(container));
    });
  });
  // Onglets de la fiche
  container.querySelectorAll('[data-sheet-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      SHEET_TAB = btn.dataset.sheetTab;
      renderAndAttachSheet(container, char);
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  // Entités multiples (PNJ non-nommés)
  if (char.data?.type === 'pnj' && !char.data?.pnj_is_named) {
    container.querySelector('#btn-add-entity')?.addEventListener('click', () => {
      const entities = _loadPnjEntities(char.id);
      entities.names.push(`Figurant ${entities.names.length + 1}`);
      _savePnjEntities(char.id, entities);
      renderAndAttachSheet(container, char);
    });
    container.querySelectorAll('[data-del-entity]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delEntity);
        const entities = _loadPnjEntities(char.id);
        entities.names.splice(idx, 1);
        _savePnjEntities(char.id, entities);
        renderAndAttachSheet(container, char);
      });
    });
    container.querySelectorAll('.entity-name-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.dataset.entityIdx);
        const entities = _loadPnjEntities(char.id);
        entities.names[idx] = inp.value.trim() || `Figurant ${idx + 1}`;
        _savePnjEntities(char.id, entities);
      });
    });
  }
  // Boutons d'achat de spécialité
  container.querySelectorAll('.xp-buy-spec-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cost      = parseInt(btn.dataset.xpCost);
      const compName  = decodeURIComponent(btn.dataset.compName);
      const inputId   = btn.dataset.inputId;
      const selEl     = container.querySelector(`#${CSS.escape(inputId)}`);
      const libreEl   = container.querySelector(`#${CSS.escape(inputId)}_libre`);
      let specValue   = selEl ? selEl.value.trim() : '';
      if (specValue === '__libre__' && libreEl) specValue = libreEl.value.trim();
      if (!specValue || specValue === '__libre__') {
        alert('Veuillez saisir ou choisir une spécialité.');
        return;
      }
      const d = char.data;
      d.specialites_xp = d.specialites_xp || {};
      d.specialites_xp[compName] = specValue;
      d.px_actuel  = Math.max(0, (d.px_actuel  || 0) - cost);
      d.px_depense = (d.px_depense || 0) + cost;
      await patchSheet(char);
      renderAndAttachSheet(container, char);
    });
  });
  // Select spécialité → affiche/masque le champ texte libre
  container.querySelectorAll('[id^="spec-inp-"]').forEach(sel => {
    if (sel.tagName !== 'SELECT') return;
    const libreId = CSS.escape(sel.id) + '_libre';
    const libreEl = container.querySelector(`#${libreId}`);
    if (!libreEl) return;
    sel.addEventListener('change', () => {
      libreEl.classList.toggle('hidden', sel.value !== '__libre__');
    });
  });

  // Boutons de suppression XP (remboursement)
  container.querySelectorAll('.xp-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cost = parseInt(btn.dataset.xpCost);
      const type = btn.dataset.xpType;
      const key  = decodeURIComponent(btn.dataset.xpKey);
      const d = char.data;
      // Rembourser les PX
      d.px_actuel  = (d.px_actuel  || 0) + cost;
      d.px_depense = Math.max(0, (d.px_depense || 0) - cost);
      // Annuler la progression
      if (type === 'attr') {
        d.attributs_xp = d.attributs_xp || {};
        d.attributs_xp[key] = Math.max(0, (d.attributs_xp[key] || 0) - 1);
        if (d.attributs_xp[key] === 0) delete d.attributs_xp[key];
      } else if (type === 'comp') {
        d.competences_xp = d.competences_xp || {};
        d.competences_xp[key] = Math.max(0, (d.competences_xp[key] || 0) - 1);
        if (d.competences_xp[key] === 0) delete d.competences_xp[key];
      } else if (type === 'qualite') {
        d.qualites_ids = (d.qualites_ids || []).filter(id => id !== key);
      } else if (type === 'mutation') {
        d.mutations_ids = (d.mutations_ids || []).filter(id => id !== key);
      } else if (type === 'spec') {
        d.specialites_xp = d.specialites_xp || {};
        delete d.specialites_xp[key];
      }
      await patchSheet(char);
      renderAndAttachSheet(container, char);
    });
  });

  // Boutons d'achat XP
  container.querySelectorAll('.xp-buy-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cost = parseInt(btn.dataset.xpCost);
      const type = btn.dataset.xpType;
      const key  = decodeURIComponent(btn.dataset.xpKey);
      const d = char.data;
      // 1. Apply purchase to char.data
      if (type === 'attr') {
        d.attributs_xp = d.attributs_xp || {};
        d.attributs_xp[key] = (d.attributs_xp[key] || 0) + 1;
      } else if (type === 'comp') {
        d.competences_xp = d.competences_xp || {};
        d.competences_xp[key] = (d.competences_xp[key] || 0) + 1;
      } else if (type === 'qualite') {
        d.qualites_ids = [...(d.qualites_ids || []), key];
      } else if (type === 'mutation') {
        d.mutations_ids = [...(d.mutations_ids || []), key];
      }
      d.px_actuel  = (d.px_actuel  || 0) - cost;
      d.px_depense = (d.px_depense || 0) + cost;
      // 2. Save & re-render
      await patchSheet(char);
      renderAndAttachSheet(container, char);
    });
  });
  // Champs éditables (background, notes, inventaire, crédits)
  attachSheetEditListeners(container, char);
}

async function patchSheet(char) {
  try {
    await fetchWithTable(`${API.characters}/${char.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: char.name, type: char.type, data: char.data }),
    });
    const ind = document.getElementById('sheet-save-indicator');
    if (ind) { ind.classList.remove('opacity-0'); setTimeout(() => ind.classList.add('opacity-0'), 1800); }
  } catch { /* silent */ }
}

function attachSheetEditListeners(container, char) {
  const wire = (id, field, isNumber = false) => {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    let timer;
    const handler = () => {
      char.data[field] = isNumber ? (parseInt(el.value) || 0) : el.value;
      clearTimeout(timer);
      timer = setTimeout(() => patchSheet(char), isNumber ? 400 : 1200);
    };
    el.addEventListener('input', handler);
  };
  wire('sheet-background', 'background');
  wire('sheet-notes',      'notes');
  wire('sheet-inventaire', 'inventaire');
  wire('sheet-credits',    'credits', true);
}

function renderSheet(char) {
  const d     = char.data || {};
  const arch  = d.archetype_id  ? REF?.archetypes?.find(a => a.id === d.archetype_id)  : null;
  const orig  = d.origine_id    ? REF?.origines?.find(o => o.id === d.origine_id)       : null;
  const motiv = d.motivation_id ? REF?.motivations?.find(m => m.id === d.motivation_id) : null;

  const attrs      = d.type === 'pnj' ? (d.attributs_pnj || {}) : (d.attributs || {});
  const attrBonus  = orig?.bonus_attribut ? { [orig.bonus_attribut.attribut]: orig.bonus_attribut.valeur } : {};
  const traitFx    = applyTraitEffects(d);
  const finalAttrs = {};
  for (const a of REF?.attributs || []) {
    finalAttrs[a.id] = (attrs[a.id] || 0) + (attrBonus[a.id] || 0) + (traitFx.attr[a.id] || 0) + ((d.attributs_xp || {})[a.id] || 0);
  }
  const competences = buildCompetences(d);
  const sante       = (finalAttrs.carrure || 0) + (finalAttrs.sang_froid || 0);
  const energieX    = (finalAttrs.perception || 0) + (finalAttrs.intelligence || 0);
  const domPriv     = arch?.domaines_privileges || d.domaines_libres || [];
  const editable    = canEdit(char);
  const typeLabel   = char.type === 'pnj' ? 'PNJ' : 'PJ';

  const TABS = [
    { id: 'caracteristiques', label: '⚡ Carac.' },
    { id: 'competences',      label: '🎯 Compétences' },
    { id: 'traits',           label: '✦ Traits' },
    { id: 'background',       label: '📖 Background' },
    { id: 'notes',            label: '📝 Notes' },
    { id: 'inventaire',       label: '🎒 Inventaire' },
    ...(d.type === 'pj' ? [{ id: 'experience', label: '💎 Expérience' }] : []),
  ];
  const tabBar = `<div class="flex gap-1 flex-wrap border-b border-gray-700 mb-5 pb-1">
    ${TABS.map(t => `<button data-sheet-tab="${t.id}"
      class="px-3 py-1.5 text-xs font-medium rounded-t transition-colors border-b-2
        ${SHEET_TAB === t.id
          ? 'text-white border-yellow-400 bg-gray-700/60'
          : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800'}">${t.label}</button>`).join('')}
  </div>`;

  let content = '';
  switch (SHEET_TAB) {
    case 'competences': content = renderSheetTabCompetences(competences, finalAttrs, domPriv); break;
    case 'traits':      content = renderSheetTabTraits(d); break;
    case 'background':  content = renderSheetTabBackground(d, editable); break;
    case 'notes':       content = renderSheetTabNotes(d, editable); break;
    case 'inventaire':  content = renderSheetTabInventaire(d, editable); break;
    case 'experience':  content = renderSheetTabExperience(char, d, finalAttrs, domPriv); break;
    default:            content = renderSheetTabCaracteristiques(d, finalAttrs, attrBonus, attrs, sante, energieX, arch, domPriv);
  }

  const avatarHtml = d.avatar_url
    ? `<img src="${esc(d.avatar_url)}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-600 shrink-0" alt="">`
    : `<div class="w-16 h-16 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-2xl shrink-0">🧑‍🚀</div>`;

  return `
  <div class="space-y-4">
    <div class="flex flex-wrap gap-4 justify-between items-start">
      <div class="flex gap-3 items-center min-w-0">
        ${avatarHtml}
        <div class="min-w-0">
          <h3 class="text-2xl font-bold">${esc(d.nom_personnage || char.name)}</h3>
          <p class="text-sm text-gray-400 mt-0.5">
            ${esc(orig?.nom || '')}${orig ? ' · ' : ''}${esc(arch?.nom || '')}${motiv ? ' · ' + esc(motiv.nom) : ''}
            ${ typeLabel === 'PNJ' ? ` · <span class="text-purple-400">PNJ ${esc(d.pnj_niveau || '')}</span>` : '' }
          </p>
          <p class="text-xs text-gray-600 mt-0.5">${typeLabel}${d.age ? ' · ' + esc(String(d.age)) + ' ans' : ''}</p>
        </div>
      </div>
      <div class="flex gap-2 text-sm items-center flex-wrap shrink-0">
        <span id="sheet-save-indicator" class="text-xs text-green-400 opacity-0 transition-opacity duration-500">✓ Sauvegardé</span>
        ${ editable ? `<button onclick="editChar('${char.id}')" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded">Modifier</button>` : '' }
        <button onclick="showListView()" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded">← Retour</button>
      </div>
    </div>
    ${tabBar}
    ${content}
  </div>`;
}

function applyTraitEffects(d) {
  const attr = {};
  const allTraits = [
    ...(d.qualites_ids  || []).map(id => REF?.qualites?.find(x => x.id === id)),
    ...(d.defauts_ids   || []).map(id => REF?.defauts?.find(x => x.id === id)),
    ...(d.mutations_ids || []).map(id => REF?.mutations?.find(x => x.id === id)),
  ].filter(Boolean);
  for (const t of allTraits) {
    if (t.attr_bonus) {
      for (const [k, v] of Object.entries(t.attr_bonus)) {
        attr[k] = (attr[k] || 0) + Number(v);
      }
    }
  }
  return { attr };
}

function trackerBoxes(n, trackerId = '', colorClass = '') {
  const cls = colorClass ? ` tracker-box--${colorClass}` : '';
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const id = trackerId ? ` data-tracker-id="${trackerId}-${i}"` : '';
    return `<div class="tracker-box${cls}"${id}></div>`;
  }).join('');
}

function _loadTrackerState(charId) {
  try { return JSON.parse(localStorage.getItem(`tracker_${charId}`) || '{}'); } catch { return {}; }
}
function _saveTrackerState(charId, state) {
  localStorage.setItem(`tracker_${charId}`, JSON.stringify(state));
}
function _applyTrackerState(container, state) {
  container.querySelectorAll('.tracker-box[data-tracker-id]').forEach(box => {
    if (state[box.dataset.trackerId]) box.classList.add('checked');
  });
}
function _collectTrackerState(container) {
  const state = {};
  container.querySelectorAll('.tracker-box[data-tracker-id]').forEach(box => {
    state[box.dataset.trackerId] = box.classList.contains('checked');
  });
  return state;
}

// ── Entités PNJ multiples (non-nommés) ────────────────────────────────────────
function _loadPnjEntities(charId) {
  try { return JSON.parse(localStorage.getItem(`pnj_entities_${charId}`) || 'null') || { names: [] }; }
  catch { return { names: [] }; }
}
function _savePnjEntities(charId, data) {
  localStorage.setItem(`pnj_entities_${charId}`, JSON.stringify(data));
}

function renderPnjEntityCard(idx, name, sante) {
  const rows = [['Indemne','text-green-400'],['Blessé léger','text-yellow-400'],['Blessé grave','text-orange-400'],['Mort ?','text-red-500']];
  return `
  <div class="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
    <div class="flex items-center justify-between mb-2">
      <input type="text" data-entity-idx="${idx}" value="${esc(name)}" placeholder="Nom de l'entité…"
        class="entity-name-input flex-1 bg-transparent border-b border-gray-500 text-sm text-gray-200 px-1 py-0.5 focus:outline-none focus:border-yellow-400">
      <button data-del-entity="${idx}" type="button"
        class="ml-3 text-xs text-gray-500 hover:text-red-400 transition-colors" title="Supprimer">✕</button>
    </div>
    <div class="space-y-1">
      ${rows.map(([label, cls], row) => `
      <div class="flex items-center gap-2">
        <span class="text-xs ${cls} w-24 shrink-0">${label}</span>
        <div class="flex gap-1 flex-wrap">${trackerBoxes(sante, `pnj-e${idx}-sante-${row}`)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderPnjEntitySection(sante) {
  const charId = CURRENT_SHEET_CHAR?.id;
  const entities = _loadPnjEntities(charId);
  const names = entities.names || [];
  return `
  <div class="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-4">
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm font-semibold text-gray-300">👥 Entités en jeu</p>
      <button id="btn-add-entity" type="button"
        class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-green-700/30 border border-gray-600 hover:border-green-500 text-gray-300 hover:text-green-300 transition-colors">
        ＋ Ajouter
      </button>
    </div>
    ${names.length === 0 ? '<p class="text-xs text-gray-500">Aucune entité. Cliquez sur ＋ Ajouter pour suivre plusieurs figurants indépendamment.</p>' : ''}
    <div class="space-y-3">
      ${names.map((n, i) => renderPnjEntityCard(i, n, sante)).join('')}
    </div>
  </div>`;
}

function renderCompetencesSheet(comps, finalAttrs, domPriv) {
  const entries = Object.entries(comps).filter(([, v]) => v.total > 0);
  if (!entries.length) return '<p class="text-gray-500 text-xs">Aucune compétence</p>';

  // Group by domain, preserving REF domain order
  const domOrder = (REF?.domaines || []).map(d => d.id);
  const byDomain = {};
  entries.forEach(([name, v]) => {
    const dom = findCompDomain(name);
    if (!byDomain[dom]) byDomain[dom] = [];
    byDomain[dom].push([name, v]);
  });
  // Sort each domain's skills by level desc then alpha
  Object.values(byDomain).forEach(arr =>
    arr.sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'fr'))
  );
  // Render domain groups in REF order, unknowns at end
  const orderedDoms = [
    ...domOrder.filter(id => byDomain[id]),
    ...Object.keys(byDomain).filter(id => !domOrder.includes(id)),
  ];

  return orderedDoms.map(domId => {
    const domInfo  = (REF?.domaines || []).find(d => d.id === domId);
    const domLabel = domInfo?.nom || domId;
    const attrId   = domInfo?.attribut || '';
    const attrInfo = (REF?.attributs || []).find(a => a.id === attrId);
    const attrLabel = attrInfo?.nom || attrId;
    const attrVal  = finalAttrs[attrId] || 0;
    const isPriv   = domPriv.includes(domId);

    const rows = byDomain[domId].map(([name, v]) => {
      const dice = attrVal + v.total;
      return `
      <div class="py-0.5 border-b border-gray-700/60 text-xs">
        <div class="flex items-center justify-between">
          <span class="${isPriv ? 'text-yellow-300' : 'text-gray-300'}">${esc(name)}</span>
          <span class="font-mono text-gray-200 shrink-0 ml-2">${dice}d <span class="text-gray-500">(${attrVal}+${v.total})</span></span>
        </div>
        ${v.specialite ? `<div class="text-gray-500 mt-0.5">Spécialité : <span class="text-purple-300">${esc(v.specialite)}</span></div>` : ''}
      </div>`;
    }).join('');

    return `
    <div class="mb-3">
      <div class="flex items-center justify-between px-1 py-1 mb-1 border-b border-gray-600">
        <span class="text-xs font-semibold ${isPriv ? 'text-yellow-400' : 'text-gray-400'}">${esc(domLabel)}${isPriv ? ' ★' : ''}</span>
        ${attrLabel ? `<span class="text-xs text-gray-500">${esc(attrLabel)} <span class="font-mono text-gray-300">${attrVal}</span></span>` : ''}
      </div>
      ${rows}
    </div>`;
  }).join('');
}

function renderTraitsSheet(d) {
  const niveaux  = d.traits_niveaux || {};
  const violentQ = !d.is_mutant ? (REF?.qualites?.find(q => q.id === 'qualite-violent') || null) : null;
  const qs = [
    ...(violentQ ? [violentQ] : []),
    ...(d.qualites_ids || [])
      .filter(qid => qid !== 'qualite-violent')
      .map(qid => REF?.qualites?.find(x => x.id === qid)).filter(Boolean),
  ];
  const ds = (d.defauts_ids || []).map(did => REF?.defauts?.find(x => x.id === did)).filter(Boolean);
  if (!qs.length && !ds.length) return '';
  const traitCard = (t, isDefaut, isAuto = false) => {
    const niv = niveaux[t.id];
    let costStr;
    if (isAuto) {
      costStr = `<span class="text-green-400 shrink-0">auto</span>`;
    } else if (niv != null) {
      costStr = `<span class="${isDefaut ? 'text-yellow-400' : 'text-blue-400'} shrink-0">${isDefaut ? '+' : '−'}${niv} pts</span>`;
    } else {
      costStr = `<span class="${isDefaut ? 'text-yellow-400' : 'text-blue-400'} shrink-0">${isDefaut ? '+' : ''}${esc(String(t.cost || ''))} pts</span>`;
    }
    return `
  <div class="text-xs bg-gray-800 border ${isDefaut ? 'border-yellow-800/40' : 'border-blue-800/40'} rounded-lg px-3 py-2">
    <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
      <span class="${isDefaut ? 'text-yellow-300' : 'text-blue-300'} font-medium">${esc(t.name)}</span>
      <div class="flex gap-1.5 items-center">
        ${t.nation ? `<span class="text-xs px-1.5 py-px rounded bg-gray-700 text-gray-300">⛳ ${esc(t.nation)}</span>` : ''}
        ${String(t.restriction || '').toLowerCase().includes('mutant') ? `<span class="text-xs px-1.5 py-px rounded bg-cyan-900/60 text-cyan-400">🦠 Mutant</span>` : ''}
        ${costStr}
      </div>
    </div>
    ${t.description ? `<p class="text-gray-400 mb-1">${esc(t.description)}</p>` : ''}
    ${t.effects     ? `<p class="text-gray-300 mt-0.5"><span class="text-gray-500">Effet : </span>${esc(t.effects)}</p>` : ''}
    ${t.prerequisites ? `<p class="text-gray-500 mt-0.5"><span class="text-gray-600">Prérequis : </span>${esc(t.prerequisites)}</p>` : ''}
    ${t.restriction ? `<p class="text-gray-500 mt-0.5"><span class="text-gray-600">Restriction : </span>${esc(t.restriction)}</p>` : ''}
    ${Array.isArray(t.references) && t.references.length ? `<p class="text-gray-600 mt-0.5">${t.references.map(r => esc(r)).join(', ')}</p>` : ''}
  </div>`;
  };
  return `
  <div class="grid md:grid-cols-2 gap-4">
    ${ ds.length ? `<div>
      <h4 class="text-sm font-semibold text-gray-300 mb-2">Défauts</h4>
      <div class="space-y-2">${ds.map(d => traitCard(d, true)).join('')}</div>
    </div>` : '' }
    ${ qs.length ? `<div>
      <h4 class="text-sm font-semibold text-gray-300 mb-2">Qualités</h4>
      <div class="space-y-2">${qs.map(q => traitCard(q, false, q.id === 'qualite-violent')).join('')}</div>
    </div>` : '' }
  </div>`;
}

// ── Onglets de la fiche de consultation ──────────────────────────────────────
function renderSheetTabCaracteristiques(d, finalAttrs, attrBonus, attrs, sante, energieX, arch, domPriv) {
  const isMutant = d.is_mutant;
  return `
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
    ${(REF?.attributs || []).map(a => {
      const val   = finalAttrs[a.id] || 0;
      const base  = attrs[a.id] || 0;
      const bonus = attrBonus[a.id] || 0;
      return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
        <p class="text-xs text-gray-400 mb-0.5">${esc(a.nom)}</p>
        <p class="text-3xl font-bold" style="color:var(--gold)">${val}</p>
        ${ bonus ? `<p class="text-xs text-green-400">(${base} + ${bonus})</p>` : '' }
        <p class="text-xs text-gray-500">${esc(a.domaine)}</p>
      </div>`;
    }).join('')}
  </div>

  <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
    <p class="text-xs text-gray-300 font-semibold mb-3">Santé <span class="text-gray-500 font-normal">(Car.+SC = ${sante} cases/ligne)</span></p>
    <div class="space-y-2">
      ${[['sante-0','Indemne','text-green-400'],['sante-1','Blessé léger','text-yellow-400'],['sante-2','Blessé grave','text-orange-400'],['sante-3','Mort ?','text-red-500']].map(([key,label,cls]) => `
      <div class="flex items-center gap-3">
        <span class="text-xs ${cls} w-24 shrink-0">${label}</span>
        <div class="flex gap-1 flex-wrap">${trackerBoxes(sante, key)}</div>
      </div>`).join('')}
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
    ${ isMutant ? `
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-xs text-gray-300 font-semibold mb-2">Énergie X <span class="text-gray-500 font-normal">(Per.+Int. = ${energieX})</span></p>
      <div class="flex gap-1 flex-wrap">${trackerBoxes(energieX, 'energie-x')}</div>
    </div>` : '<div></div>' }
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p class="text-xs text-gray-300 font-semibold mb-2">Panache <span class="text-yellow-400 font-mono">${d.panache ?? 3}</span></p>
      <div class="flex gap-1 flex-wrap">${trackerBoxes(d.panache ?? 3, 'panache')}</div>
    </div>
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col justify-center">
      <p class="text-xs text-gray-400 mb-1">Gloire</p>
      <p class="font-bold text-3xl">${d.gloire ?? 0}</p>
    </div>
  </div>

  ${ arch ? `
  <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
    <p class="text-sm font-semibold mb-1" style="color:var(--gold)">Archétype : ${esc(arch.nom)}</p>
    <p class="text-xs text-gray-400 mb-2">${esc(arch.description)}</p>
    <p class="text-xs text-gray-500">Domaines : ${arch.domaines_privileges.map(dp => `<span class="text-gray-300">${esc(dp)}</span>`).join(', ')}</p>
    ${ d.action_archetype ? `<p class="text-xs text-gray-400 mt-1">Action choisie : <span class="text-blue-300">${esc(d.action_archetype)}</span></p>` : '' }
  </div>` :
  domPriv.length ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
    <p class="text-xs text-gray-500">Domaines : ${domPriv.map(x => `<span class="text-gray-300">${esc(x)}</span>`).join(', ')}</p>
  </div>` : '' }

  ${ (d.type === 'pnj' && !d.pnj_is_named) ? renderPnjEntitySection(sante) : '' }`;}

function renderSheetTabCompetences(competences, finalAttrs, domPriv) {
  return `<div class="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-4">
    ${renderCompetencesSheet(competences, finalAttrs, domPriv)}
  </div>`;
}

function renderSheetTabTraits(d) {
  const traitsHtml = renderTraitsSheet(d);
  // Coordonnées hyperspatiales mémorisables : Navigation + bonus Grand Voyageur 2
  const competences = buildCompetences(d);
  const navTotal = competences['Navigation']?.total ?? 0;
  const gv2Bonus = d.traits_niveaux?.['qualite-grand-voyageur-2'] ?? 0;
  const hasGV2   = (d.qualites_ids || []).includes('qualite-grand-voyageur-2');
  const coordHtml = navTotal > 0 ? `
  <div class="mt-5 bg-gray-800 border border-indigo-800/40 rounded-lg px-4 py-3">
    <p class="text-xs text-indigo-300 font-semibold mb-2">🧭 Coordonnées hyperspatiales mémorisables</p>
    <div class="flex items-center gap-3 text-sm">
      <span class="text-gray-300">Navigation <span class="font-mono text-white">${navTotal}</span></span>
      ${hasGV2 && gv2Bonus > 0 ? `<span class="text-gray-500">+</span><span class="text-gray-300">Grand voyageur 2 <span class="font-mono text-indigo-300">+${gv2Bonus}</span></span>` : ''}
      <span class="text-gray-500">=</span>
      <span class="text-lg font-bold text-indigo-200">${navTotal + gv2Bonus}</span>
    </div>
  </div>` : '';
  const mutHtml = d.is_mutant && d.mutations_ids?.length ? `
  <div class="mt-5">
    <h4 class="text-sm font-semibold text-gray-300 mb-2">Mutations</h4>
    <div class="space-y-2">
      ${d.mutations_ids.map(mid => {
        const m = REF?.mutations?.find(x => x.id === mid);
        return m
          ? `<div class="text-xs bg-cyan-900/40 border border-cyan-700/60 rounded px-3 py-2">
               <div class="flex items-center gap-2 flex-wrap">
                 <span class="text-cyan-300 font-medium">${esc(m.name)}</span>
                 ${m.mutation_type ? `<span class="text-xs px-1.5 py-px rounded bg-cyan-900/60 text-cyan-400">${esc(m.mutation_type)}</span>` : ''}
                 ${m.ex_cost ? `<span class="text-gray-400">⚡ ${esc(m.ex_cost)}</span>` : ''}
                 ${m.is_maintained ? `<span class="text-xs px-1.5 py-px rounded bg-blue-900/60 text-blue-300">↺ Maintenu</span>` : ''}
               </div>
               ${m.effect ? `<p class="mt-1 text-gray-400">${esc(m.effect)}</p>` : ''}
             </div>`
          : `<span class="text-xs bg-cyan-900 border border-cyan-700 rounded px-2 py-0.5">${esc(mid)}</span>`;
      }).join('')}
    </div>
  </div>` : '';
  const tagsHtml = d.tags_regles?.length ? `
  <div class="mt-5 bg-gray-800 border border-purple-800/40 rounded-lg p-4">
    <p class="text-xs text-purple-300 font-semibold mb-2">⚙ Règles spéciales</p>
    <ul class="space-y-1">${d.tags_regles.map(t => `<li class="text-xs text-gray-300">• ${esc(t)}</li>`).join('')}</ul>
  </div>` : '';
  return (traitsHtml || '<p class="text-gray-500 text-xs py-4">Aucun trait sélectionné.</p>') + mutHtml + coordHtml + tagsHtml;
}

function renderSheetTabBackground(d, editable) {
  const descHtml = d.description ? `
  <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
    <p class="text-xs text-gray-400 mb-1">Description (issue de la création)</p>
    <p class="text-sm text-gray-300">${esc(d.description)}</p>
  </div>` : '';
  if (!editable) {
    return descHtml + (d.background
      ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap">${esc(d.background)}</div>`
      : '<p class="text-gray-500 text-sm">Aucun background renseigné.</p>');
  }
  return `${descHtml}
  <label class="block text-xs text-gray-400 mb-1">Background / Historique</label>
  <textarea id="sheet-background" rows="14"
    class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 resize-y focus:border-yellow-600/60 focus:outline-none"
    placeholder="Historique du personnage, événements marquants…">${esc(d.background || '')}</textarea>`;
}

function renderSheetTabNotes(d, editable) {
  if (!editable) {
    return d.notes
      ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap">${esc(d.notes)}</div>`
      : '<p class="text-gray-500 text-sm">Aucune note.</p>';
  }
  return `
  <label class="block text-xs text-gray-400 mb-1">Notes de jeu</label>
  <textarea id="sheet-notes" rows="16"
    class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 resize-y focus:border-blue-600/60 focus:outline-none"
    placeholder="Notes libres : indices, contacts, PNJs rencontrés…">${esc(d.notes || '')}</textarea>`;
}

function renderSheetTabInventaire(d, editable) {
  const credits = d.credits ?? 0;
  const creditsBlock = editable
    ? `<div class="flex items-center gap-3 bg-gray-800 border border-yellow-900/40 rounded-lg px-4 py-3 mb-5">
         <span class="text-yellow-300 font-semibold text-xl shrink-0">₡</span>
         <label class="text-sm text-gray-300 shrink-0">Crédits :</label>
         <input id="sheet-credits" type="number" min="0" value="${credits}"
           class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-yellow-200 font-mono focus:border-yellow-600/60 focus:outline-none max-w-xs">
       </div>`
    : `<div class="flex items-center gap-3 bg-gray-800 border border-yellow-900/40 rounded-lg px-4 py-3 mb-5">
         <span class="text-yellow-300 font-semibold text-xl">₡</span>
         <span class="text-xl font-mono text-yellow-200">${credits.toLocaleString('fr-FR')}</span>
       </div>`;
  const equipBlock = editable
    ? `<label class="block text-xs text-gray-400 mb-1">Équipement &amp; objets</label>
       <textarea id="sheet-inventaire" rows="14"
         class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 resize-y focus:border-gray-500 focus:outline-none"
         placeholder="Armes, armures, équipement divers…">${esc(d.inventaire || '')}</textarea>`
    : (d.inventaire
        ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap">${esc(d.inventaire)}</div>`
        : '<p class="text-gray-500 text-sm">Aucun équipement renseigné.</p>');
  const arch = d.archetype_id ? REF?.archetypes?.find(a => a.id === d.archetype_id) : null;
  const archBlock = arch?.equipement_depart ? `
  <div class="bg-gray-800 border border-gray-700/50 rounded-lg p-4 mt-4">
    <p class="text-xs text-gray-400 mb-0.5">Équipement de départ (archétype)</p>
    <p class="text-sm text-gray-300">${esc(arch.equipement_depart)}</p>
  </div>` : '';
  return creditsBlock + equipBlock + archBlock;
}

// ── Spécialités référentiel (extrait du livre de règles) ─────────────────────
// null  = spécialité libre (texte à saisir)
// array = options nommées + "Autre (libre)..." toujours proposé en sus
const SPEC_REF = {
  'Acrobaties':          ['Funambule', 'Contorsionniste'],
  'Analyse':             ['Cryptographie', 'Mémoire', 'Recoupements'],
  'Armes de jet':        null,   // "chaque type d'arme" → libre
  'Armes de poing':      null,
  'Armes d\'épaule':     null,
  'Armes de traits':     null,
  'Armes embarquées':    null,
  'Armes lourdes':       null,
  'Artisanat':           ['Artiste', 'Bricoleur'],
  'Arts':                null,   // "chaque courant artistique" → libre
  'Athlétisme':          ['Endurance', 'Escalade', 'Natation', 'Récupération', 'Résistance', 'Sauts', 'Sprint'],
  'Baratin':             ['Embrouille', 'Langue de vipère'],
  'Bureaucratie':        null,   // "chaque nation stellaire" → libre
  'Cartographie':        ['Aérienne', 'Hyperspatiale', 'Maritime', 'Spatiale', 'Terrestre'],
  'Comédie':             ['Impassible', 'Exubérant', 'Subtil'],
  'Commandement':        ['Chantier', 'Combat', 'Compagnie', 'Voyage'],
  'Commerce':            null,   // "chaque catégorie / nation" → libre
  'Connaissance':        null,   // "selon le champ d'application choisi" → libre
  'Danse':               ['Valse solaire', 'Danse galactique', 'Danse havanaise'],
  'Déguisement':         null,   // "chaque origine" → libre
  'Démolition':          ['Démineur'],  // + libre pour "type de cible"
  'Détermination':       ['Peur', 'Intimidation', 'Torture'],
  'Discrétion':          ['Infiltration', 'Passe-partout', 'Pickpocket'],
  'Dressage':            null,   // "chaque type d'animal" → libre
  'Eloquence':           ['Discours', 'Face-à-face'],
  'Empathie':            ['Entretien', 'Perspicacité'],
  'Environnement':       ['Campeur', 'Pourvoyeur', 'Inoxydable'],
  'Equitation':          null,   // "chaque type de monture" → libre
  'Esotérisme':          ['Groupements occultes', 'Magie', 'Métaphysique'],
  'Etiquette':           ['Protocole'],  // + libre pour "nation stellaire"
  'Falsification':       ['Calligraphie', 'Documents commerciaux', 'Documents militaires', 'Documents officiels', 'Documents scientifiques'],
  'Histoire':            null,   // "chaque époque / nation" → libre
  'Illégalités':         null,   // "chaque catégorie / nation" → libre
  'Ingénierie':          ['Armement', 'Electronique', 'Industrie lourde', 'Mécanique', 'Propulsion', 'Senseurs'],
  'Intimidation':        ['Regard', 'Chantage', 'Brutal'],
  'Jeux':                ['Poker havanais'],  // + libre pour "chaque jeu"
  'Langue':              null,   // "chaque région / groupe ethnique" → libre
  'Médecine':            ['Chirurgien', 'Généraliste', 'Spécialiste'],
  'Mêlée':               ['Combat à mains nues', 'Contondantes', 'Technologiques', 'Tranchantes'],
  'Navigation':          ['Aérienne', 'Combat', 'Maritime', 'Spatiale', 'Terrestre', 'Hyperespace'],
  'Pilotage':            null,   // "chaque classe / modèle de véhicule" → libre
  'Premiers soins':      ['Blessures de guerre', 'Généraliste', 'Médecin de campagne'],
  'Propagande':          ['Homme de l\'ombre', 'Homme des foules'],
  'Recherche':           ['Bibliothécaire', 'Enquêteur', 'Explorateur', 'Fouineur', 'Pisteur'],
  'Sciences solaires':   ['Droit', 'Humanités', 'Psychologie', 'Sociologie'],
  'Sciences stellaires': ['Astrophysique', 'Biogéologie', 'Chimie', 'Mathématiques', 'Physique'],
  'Séduction':           ['Mignonneries', 'Flamboyant'],
  'Senseurs':            ['Ciblage', 'Détection', 'Furtivité'],
  'Sorcellerie':         ['Découvreur', 'Sage'],  // + libre pour "chaque sortilège"
  'Stratégie':           ['Commerciale', 'Militaire', 'Politique', 'Spatiale'],
  'Système de sécurité': ['Alarmes', 'Pièges', 'Serrures'],
  'Tactiques':           ['Assaut', 'Capture', 'Extraction', 'Progression', 'Réaction'],
  'TechnoCog':           null,   // "chaque type de programme" → libre
  'Technologie':         ['Armement', 'Electronique', 'Domestique', 'Mécanique', 'Senseurs'],
  'Vigilance':           ['Actif', 'Passif'],
};

function getSpecForComp(compName) {
  // Exact match first (including null entries)
  if (Object.prototype.hasOwnProperty.call(SPEC_REF, compName)) return SPEC_REF[compName];
  // Prefix match for "Artisanat (Forge)", "Pilotage (Vaisseau spatial)", etc.
  for (const [key, specs] of Object.entries(SPEC_REF)) {
    if (compName.toLowerCase().startsWith(key.toLowerCase() + ' (') ||
        compName.toLowerCase().startsWith(key.toLowerCase() + '(')) return specs;
  }
  return null;
}

/** Trouve le domaine d'une compétence : REF direct, puis parent "(Au choix)". */
function findCompDomain(name) {
  const direct = (REF?.competences || []).find(c => c.name === name);
  if (direct) return direct.domain || '';
  // Typed variant of an "(Au choix)" skill: "Connaissance (Empire)" → base "Connaissance"
  const base = name.split('(')[0].trim().toLowerCase();
  const parent = (REF?.competences || []).find(c =>
    /\(au choix/i.test(c.name) && c.name.split('(')[0].trim().toLowerCase() === base
  );
  return parent?.domain || '';
}

function renderSheetTabExperience(char, d, finalAttrs, domPriv) {
  const pxActuel  = d.px_actuel  ?? 0;
  const pxTotal   = d.px_total   ?? 0;
  const pxDepense = d.px_depense ?? 0;
  const hasGenesEvolutifs = (d.mutations_ids || []).includes('mutation-genes-evolutifs');

  // XP cost for next skill level
  function compCost(currentLevel, isPriv) {
    if (currentLevel < 3) return isPriv ? 500 : 1000;
    if (currentLevel === 3) return isPriv ? 1000 : 2000;
    return isPriv ? 2500 : 5000;
  }
  // Quality cost from "cost" field (e.g. "-3" → 3000)
  function qualityCost(q) {
    const n = Math.abs(parseInt(q.cost) || 0);
    return n * 1000;
  }

  // IDs non-achetables par XP (marqués * dans la liste officielle)
  const NON_XP_QUALITY_IDS = new Set([
    'qualite-beni','qualite-beni-par-la-nature','qualite-carac-exceptionnel',
    'qualite-chanceux','qualite-chromosomes-hyperdenses',
    'qualite-contact','qualite-contact-boss','qualite-contact-heros','qualite-contact-elite',
    'qualite-combattant-des-rues','qualite-defenseur-de-lhumanite-*',
    'qualite-discipline','qualite-dur-en-affaire',
    'qualite-entraînement','qualite-entrainement',
    'qualite-escrimeur','qualite-et-une-bouteille-de-rhum-',
    'qualite-genie','qualite-gloire','qualite-guerison-miraculeuse',
    'qualite-idealiste','qualite-loup-de-mer',
    'qualite-mutant-sympathique','qualite-mutant-costaud','qualite-mutant-furtif',
    'qualite-mystique','qualite-parrain','qualite-prestige',
    'qualite-riche','qualite-route-dhavana',
    'qualite-taille-anormale','qualite-teigneux','qualite-terrifiant',
    'qualite-tireur-delite','qualite-vieux-routard',
  ]);

  const charOrig     = REF?.origines?.find(o => o.id === d.origine_id) ?? null;
  const charNation   = charOrig?.nation ?? null;
  const charIsMutant = !!d.is_mutant;

  // Nation label → faction_icon_url
  const nationIconMap = {};
  for (const n of (REF?.nations || [])) {
    if (n.name && n.faction_icon_url) nationIconMap[n.name] = n.faction_icon_url;
  }

  function qualityVisibleForChar(q) {
    if (!q?.id || !q.id.startsWith('qualite-')) return false;
    if (q.pnj_only) return false;
    if (NON_XP_QUALITY_IDS.has(q.id)) return false;
    // Mutant-only (champ restriction)
    const restr = String(q.restriction || '').toLowerCase();
    if (restr.includes('mutant') && !charIsMutant) return false;
    // Nation-spécifique : visible seulement si même nation que le personage
    if (q.nation && q.nation !== 'Aucune' && q.nation !== charNation) return false;
    // Coût variable ou nul
    const c = String(q.cost || '');
    const n = parseInt(c);
    if (c.toUpperCase().includes('X') || isNaN(n) || n === 0) return false;
    return true;
  }

  const ownedQualites  = new Set(d.qualites_ids  || []);
  const ownedMutations = new Set(d.mutations_ids  || []);
  const competences    = buildCompetences(d);
  const attrs          = REF?.attributs || [];

  // ── Header ────────────────────────────────────────────────────────────────
  const pct = pxTotal > 0 ? Math.min(100, Math.round(pxDepense / pxTotal * 100)) : 0;
  const header = `
  <div class="bg-gray-800 border border-purple-900/40 rounded-xl px-5 py-4 mb-5">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p class="text-xs text-gray-400 mb-0.5">PX disponibles</p>
        <p class="text-3xl font-bold text-purple-300">${pxActuel.toLocaleString('fr-FR')}</p>
      </div>
      <div class="text-right">
        <p class="text-xs text-gray-400 mb-0.5">Total reçus / dépensés</p>
        <p class="text-sm text-gray-300">${pxTotal.toLocaleString('fr-FR')} / ${pxDepense.toLocaleString('fr-FR')} PX</p>
      </div>
    </div>
    ${pxTotal > 0 ? `<div class="mt-3 bg-gray-700 rounded-full h-2 overflow-hidden">
      <div class="bg-purple-500 h-2 rounded-full" style="width:${pct}%"></div>
    </div>
    <p class="text-xs text-gray-500 mt-1 text-right">${pct}% dépensé</p>` : ''}
  </div>`;

  // ── Coût table ref ─────────────────────────────────────────────────────────
  const coutTable = `
  <details class="mb-5 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <summary class="cursor-pointer px-4 py-2.5 text-sm text-gray-300 hover:text-white select-none">📋 Tableau des coûts</summary>
    <table class="w-full text-xs text-gray-300 px-4 pb-3">
      <thead><tr class="border-b border-gray-700 text-gray-400"><th class="text-left px-3 py-1.5">Achat</th><th class="text-right px-3">Dom. priv.</th><th class="text-right px-3">Autres</th></tr></thead>
      <tbody>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Caractéristique</td><td class="text-right px-3 text-purple-300">5 000</td><td class="text-right px-3 text-purple-300">5 000</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Compétence 0→3 (par niveau)</td><td class="text-right px-3">500</td><td class="text-right px-3">1 000</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Compétence 3→4</td><td class="text-right px-3">1 000</td><td class="text-right px-3">2 000</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Compétence 4+</td><td class="text-right px-3">2 500</td><td class="text-right px-3">5 000</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Spécialité +3</td><td class="text-right px-3" colspan="2">2 500</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Spécialité +4</td><td class="text-right px-3" colspan="2">5 000</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Spécialité +5+</td><td class="text-right px-3" colspan="2">7 500</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Qualité (coût × 1 000)</td><td class="text-right px-3" colspan="2">variable</td></tr>
        <tr class="border-b border-gray-800"><td class="px-3 py-1">Mutation basique</td><td class="text-right px-3" colspan="2">2 500</td></tr>
        <tr><td class="px-3 py-1">Mutation avancée</td><td class="text-right px-3" colspan="2">5 000</td></tr>
      </tbody>
    </table>
  </details>`;

  // ── Helper: buy button ─────────────────────────────────────────────────────
  function buyBtn(type, key, cost, disabled = false) {
    const tooExpensive = pxActuel < cost;
    const dis = disabled || tooExpensive;
    const title = tooExpensive ? 'PX insuffisants' : disabled ? 'Non disponible' : `Acheter pour ${cost.toLocaleString('fr-FR')} PX`;
    return `<button class="xp-buy-btn text-xs px-2 py-1 rounded ${dis ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-purple-700 hover:bg-purple-600 text-white'}"
      ${dis ? 'disabled' : ''} data-xp-type="${type}" data-xp-key="${encodeURIComponent(key)}" data-xp-cost="${cost}"
      title="${esc(title)}">${cost.toLocaleString('fr-FR')} PX</button>`;
  }
  // ── Helper: remove (refund) button ────────────────────────────────────────
  function removeBtn(type, key, cost) {
    return `<button class="xp-remove-btn text-xs px-1.5 py-1 rounded bg-red-900/50 hover:bg-red-800 text-red-400 border border-red-800/60"
      data-xp-type="${type}" data-xp-key="${encodeURIComponent(key)}" data-xp-cost="${cost}"
      title="Annuler — rembourse ${cost.toLocaleString('fr-FR')} PX">↩</button>`;
  }

  // ── Caractéristiques ───────────────────────────────────────────────────────
  const attrRows = attrs.map(a => {
    const cur      = finalAttrs[a.id] || 0;
    const xpBought = (d.attributs_xp || {})[a.id] || 0;
    return `<div class="flex items-center justify-between py-1.5 border-b border-gray-800 text-sm">
      <span class="text-gray-300">${esc(a.nom || a.id)}</span>
      <div class="flex items-center gap-2">
        <span class="font-mono text-gray-400 text-xs">${cur} → <span class="text-white">${cur + 1}</span></span>
        ${xpBought > 0 ? removeBtn('attr', a.id, 5000) : ''}
        ${buyBtn('attr', a.id, 5000)}
      </div>
    </div>`;
  }).join('');

  // ── Compétences ────────────────────────────────────────────────────────────
  // Group by domain
  const compByDomain = {};
  for (const comp of (REF?.competences || []).filter(c => !/\(au choix/i.test(c.name))) {
    const dom = comp.domain || 'autre';
    if (!compByDomain[dom]) compByDomain[dom] = [];
    compByDomain[dom].push(comp);
  }
  const compRows = Object.entries(compByDomain).map(([domId, comps]) => {
    const domLabel = REF?.domaines?.find(x => x.id === domId)?.nom || domId;
    const isPriv = domPriv.includes(domId);
    const rows = comps.map(comp => {
      const cur       = competences[comp.name]?.total || 0;
      const xpBought  = (d.competences_xp || {})[comp.name] || 0;
      const cost      = compCost(cur, isPriv);
      const refundCost = xpBought > 0 ? compCost(cur - 1, isPriv) : 0;
      return `<div class="flex items-center justify-between py-1 border-b border-gray-800 text-xs pl-3">
        <span class="${isPriv ? 'text-yellow-300' : 'text-gray-300'}">${esc(comp.name)}</span>
        <div class="flex items-center gap-2">
          <span class="font-mono text-gray-400">${cur} → <span class="text-white">${cur + 1}</span></span>
          ${xpBought > 0 ? removeBtn('comp', comp.name, refundCost) : ''}
          ${buyBtn('comp', comp.name, cost)}
        </div>
      </div>`;
    }).join('');
    return `<div class="mb-3">
      <p class="text-xs text-gray-500 font-semibold px-1 py-1">${esc(domLabel)}${isPriv ? ' <span class="text-yellow-400">★ Priv.</span>' : ''}</p>
      ${rows}
    </div>`;
  }).join('');

  // ── Qualités ───────────────────────────────────────────────────────────────
  const visibleQ = (REF?.qualites || []).filter(qualityVisibleForChar);
  const qRows = visibleQ.length
    ? visibleQ.map(q => {
        const cost    = qualityCost(q);
        const owned   = ownedQualites.has(q.id);
        const tooExp  = !owned && pxActuel < cost;
        const factionIcon = (q.nation && q.nation !== 'Aucune' && nationIconMap[q.nation])
          ? `<img src="${esc(nationIconMap[q.nation])}" alt="${esc(q.nation)}" class="w-4 h-4 rounded-sm object-cover flex-shrink-0" title="${esc(q.nation)}">`
          : '<span class="w-4 h-4 flex-shrink-0"></span>';
        const restrictText = q.restriction
          ? `<span class="text-orange-400 truncate max-w-[140px] text-right" title="${esc(q.restriction)}">${esc(q.restriction)}</span>`
          : '';
        let btnHtml;
        if (owned) {
          btnHtml = removeBtn('qualite', q.id, cost);
        } else {
          const tit = tooExp ? 'PX insuffisants' : `Acheter pour ${cost.toLocaleString('fr-FR')} PX`;
          btnHtml = `<button class="xp-buy-btn text-xs px-2 py-1 rounded ${ tooExp ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-purple-700 hover:bg-purple-600 text-white'}" ${ tooExp ? 'disabled' : ''} data-xp-type="qualite" data-xp-key="${encodeURIComponent(q.id)}" data-xp-cost="${cost}" title="${esc(tit)}">${cost.toLocaleString('fr-FR')} PX</button>`;
        }
        return `<div class="py-2 border-b border-gray-800 text-xs">
          <div class="flex items-start gap-2">
            ${factionIcon}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-0.5">
                <span class="${owned ? 'text-green-400 font-medium' : 'text-blue-300 font-medium'}">${esc(q.name)}${owned ? ' ✔' : ''}</span>
                ${restrictText}
              </div>
              ${q.description ? `<p class="text-gray-500 mt-0.5">${esc(q.description)}</p>` : ''}
              ${q.effects ? `<p class="text-gray-400 mt-0.5"><span class="text-gray-500">Effet : </span>${esc(q.effects)}</p>` : ''}
              ${q.prerequisites ? `<p class="text-gray-500 mt-0.5"><span class="text-gray-600">Prérequis : </span>${esc(q.prerequisites)}</p>` : ''}
            </div>
            <div class="flex-shrink-0 ml-2">${btnHtml}</div>
          </div>
        </div>`;
      }).join('')
    : '<p class="text-gray-500 text-xs">Aucune qualité disponible pour ce personnage.</p>';

  // ── Mutations ──────────────────────────────────────────────────────────────
  let mutSection = '';
  if (!hasGenesEvolutifs) {
    mutSection = `<p class="text-gray-500 text-xs">Requiert la mutation <span class="text-cyan-400">Gènes évolutifs</span>.</p>`;
  } else {
    const allMuts   = REF?.mutations || [];
    const buyableM  = allMuts.filter(m => !ownedMutations.has(m.id));
    const ownedMuts = allMuts.filter(m =>  ownedMutations.has(m.id));
    const mutRow = (m, isOwned) => {
      const isAvancee = (m.mutation_type || '').toLowerCase() !== 'basique';
      const cost = isAvancee ? 5000 : 2500;
      const typeBadge = m.mutation_type
        ? `<span class="text-xs px-1.5 py-px rounded ${isAvancee ? 'bg-cyan-900/60 text-cyan-400' : 'bg-teal-900/60 text-teal-300'}">${esc(m.mutation_type)}</span>`
        : '';
      return `<div class="py-2 border-b border-gray-800 text-xs">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-0.5">
              <span class="${isOwned ? 'text-green-400 font-medium' : 'text-cyan-300 font-medium'}">${esc(m.name || m.id)}${isOwned ? ' ✔' : ''}</span>
              ${typeBadge}
              ${m.ex_cost ? `<span class="text-gray-500">⚡ ${esc(m.ex_cost)}</span>` : ''}
              ${m.is_maintained ? `<span class="text-blue-400">↺ Maintenu</span>` : ''}
            </div>
            ${m.effect ? `<p class="text-gray-400 mt-0.5">${esc(m.effect)}</p>` : ''}
          </div>
          <div class="flex-shrink-0 ml-2">${isOwned ? removeBtn('mutation', m.id, cost) : buyBtn('mutation', m.id, cost)}</div>
        </div>
      </div>`;
    };
    const ownedMRows  = ownedMuts.map(m => mutRow(m, true)).join('');
    const buyableMRows = buyableM.map(m => mutRow(m, false)).join('');
    mutSection = ownedMRows + buyableMRows
      || '<p class="text-gray-500 text-xs">Aucune mutation disponible.</p>';
  }

  function section(title, content) {
    return `<div class="mb-5 bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
      <p class="text-sm font-semibold text-gray-200 px-4 py-2.5 border-b border-gray-700 bg-gray-800">${title}</p>
      <div class="px-4 py-2">${content}</div>
    </div>`;
  }

  // ── Spécialités ────────────────────────────────────────────────────────────
  function specialtyCost(level) {
    if (level >= 5) return 7500;
    if (level >= 4) return 5000;
    return 2500; // level >= 3
  }
  const ownedSpecs = d.specialites_xp || {};
  const specEligible = Object.entries(competences)
    .filter(([name, v]) => {
      const dom = findCompDomain(name);
      return domPriv.includes(dom) && v.total >= 3;
    })
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'));

  const specRows = specEligible.length
    ? specEligible.map(([name, v]) => {
        const specOptions = getSpecForComp(name);  // null = libre only, array = named options
        const cost        = specialtyCost(v.total);
        const tooExp      = pxActuel < cost;
        const current     = v.specialite || ownedSpecs[name] || null;
        const inputId     = 'spec-inp-' + name.replace(/[^a-zA-Z0-9]/g, '_');
        let inputHtml;
        if (specOptions && specOptions.length > 0) {
          // Named options + always offer "Autre (texte libre)…"
          const isLibre = current && !specOptions.includes(current);
          inputHtml = `<select id="${inputId}" class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 max-w-[200px]">
            <option value="">— choisir —</option>
            ${specOptions.map(o => `<option value="${esc(o)}" ${current===o?'selected':''}>${esc(o)}</option>`).join('')}
            <option value="__libre__" ${isLibre?'selected':''}>Autre (texte libre)…</option>
          </select>
          <input type="text" id="${inputId}_libre" placeholder="Spécialité…"
            class="${isLibre ? '' : 'hidden'} bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-36"
            value="${esc(isLibre ? current : '')}">`;
        } else {
          // Libre uniquement (champ d'application libre ou null dans SPEC_REF)
          inputHtml = `<input type="text" id="${inputId}" placeholder="Saisir la spécialité…"
            class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-40"
            value="${esc(current || '')}">`;
        }
        const hasXpSpec = !!ownedSpecs[name];
        return `<div class="flex items-center flex-wrap gap-2 py-2 border-b border-gray-800 text-xs">
          <span class="text-yellow-300 font-medium flex-1 min-w-[120px]">${esc(name)}</span>
          ${current ? `<span class="text-green-400 text-xs italic">Actuelle : ${esc(current)}</span>` : ''}
          <span class="text-gray-500 text-xs">niv.${v.total}</span>
          ${inputHtml}
          ${hasXpSpec ? removeBtn('spec', name, cost) : ''}
          <button class="xp-buy-spec-btn text-xs px-2 py-1 rounded ${tooExp ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-purple-700 hover:bg-purple-600 text-white'}"
            ${tooExp ? 'disabled' : ''}
            data-xp-cost="${cost}" data-comp-name="${encodeURIComponent(name)}"
            data-input-id="${inputId}"
            title="${cost.toLocaleString('fr-FR')} PX${current ? ' — remplace la spécialité actuelle' : ''}">
            ${cost.toLocaleString('fr-FR')} PX
          </button>
        </div>`;
      }).join('')
    : '<p class="text-gray-500 text-xs">Aucune compétence de domaine privilégié au niveau 3+ pour l\'instant.</p>';

  const specSection = `<div>${specRows}</div>`;

  return header + coutTable
    + section('⚡ Caractéristiques', attrRows)
    + section('🎯 Compétences', compRows)
    + section('⭐ Spécialités', specSection)
    + section('✦ Qualités', qRows)
    + section('🦠 Mutations', mutSection);
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
  { label: 'Origine',           render: renderStepOrigine,        validate: () => {
    if (!DRAFT.origine_id) return false;
    const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
    return (orig?.bonus_competences || []).filter(c => c.au_choix)
      .every(c => !!DRAFT.origine_choix[c.competence]);
  }},
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
  { label: 'Attributs',         render: renderStepPNJAttributs,   validate: validatePNJAttributs },
  { label: 'Compétences',       render: renderStepPNJCompetences, validate: () => true },
  { label: 'Traits',            render: renderStepTraits,         validate: () => true },
  { label: 'Finitions',         render: renderStepFinitions,      validate: validateFinitions },
];

function getSteps() {
  const base = DRAFT.type === 'pnj' ? STEPS_PNJ : STEPS_PJ;
  const hasEntrainement = DRAFT.qualites_ids.includes('qualite-entraînement')
    && (DRAFT.traits_niveaux?.['qualite-entraînement'] || 0) > 0;

  const extras = [];
  if (hasEntrainement) extras.push({ label: 'Entraînement', render: renderStepEntrainement, validate: () => true });
  if (DRAFT.is_mutant)  extras.push({ label: 'Mutations',    render: renderStepMutations,    validate: validateMutations });
  return [...base.slice(0, 7), ...extras, ...base.slice(7)];
}

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
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-base font-semibold">Votre personnage est-il un mutant ?</h3>
    <button id="btn-rand-mutant" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Choisissez votre origine</h3>
    <button id="btn-rand-orig" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
      let label;
      if (c.au_choix) {
        const chosen = DRAFT.origine_choix[c.competence];
        if (chosen) {
          const resolved = resolveAuChoixKey(c.competence, chosen);
          label = esc(resolved || c.competence.replace(/\s*\(Au choix\)\s*/i, '').trim() + ' (' + chosen + ')');
        } else {
          const base = c.competence.replace(/\s*\(Au choix\)\s*/i, '').trim();
          label = `${esc(base)} <span class="text-orange-400">(type à choisir ↓)</span>`;
        }
      } else if (/\(au choix/i.test(c.competence) && c.specialite) {
        // Type pré-défini dans les données : affiche le nom résolu directement
        const resolved = resolveAuChoixKey(c.competence, c.specialite);
        label = esc(resolved || c.competence);
      } else if (c.specialite) {
        label = `${esc(c.competence)} <span class="text-gray-400">(${esc(c.specialite)})</span>`;
      } else {
        label = esc(c.competence);
      }
      return `<p class="text-xs text-green-400">+${c.valeur} ${label}</p>`;
    }).join('')}
  </div>`;
}

function renderOrigineChoix(o) {
  const comps = o.bonus_competences || [];
  const needsChoix = comps.filter(c => c.au_choix);
  if (!needsChoix.length) return '';
  return needsChoix.map(c => {
    const cur  = DRAFT.origine_choix[c.competence] || '';
    const opts = origineChoixTypeOptions(c.competence);
    const base = c.competence.replace(/\s*\(Au choix\)\s*/i, '').trim();
    const ctrl = opts
      ? `<select data-choix="${esc(c.competence)}"
           class="orig-choix-sel flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
           <option value="">— Choisir le type —</option>
           ${opts.map(t => `<option value="${esc(t)}" ${cur===t?'selected':''}>${esc(t)}</option>`).join('')}
         </select>`
      : `<input type="text" data-choix="${esc(c.competence)}"
           value="${esc(cur)}"
           placeholder="Préciser…"
           class="orig-choix-inp flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">`;
    return `
    <div class="flex items-center gap-2 text-sm">
      <label class="text-gray-300 shrink-0 w-48">+${c.valeur} ${esc(base)} :</label>
      ${ctrl}
    </div>`;
  }).join('');
}

// ── Étape 3 : Motivation ──────────────────────────────────────────────────────
function renderStepMotivation() {
  const motivations = REF?.motivations || [];
  return `
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Choisissez votre motivation</h3>
    <button id="btn-rand-motiv" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Choisissez votre archétype</h3>
    <button id="btn-rand-arch" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Répartissez vos caractéristiques</h3>
    <button id="btn-rand-attrs" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
  const arch        = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const domPriv     = arch?.domaines_privileges || [];
  const domPrimaire = domPriv[0] || null;
  const compArch    = arch?.competences_archetype || [];
  const competences = REF?.competences || [];
  const domaines    = REF?.domaines || [];
  const bonusMap    = buildBonusMap(); // bonus origine + motivation
  const orig        = REF?.origines?.find(o => o.id === DRAFT.origine_id);

  // Comptage des slots utilisés
  const used3 = Object.values(DRAFT.competences_libres).filter(v => v === 3).length;
  const used2 = Object.values(DRAFT.competences_libres).filter(v => v === 2).length;
  const used1 = Object.values(DRAFT.competences_libres).filter(v => v === 1).length;

  // Skills that are typed variants of "(Au choix)" base skills are hidden from the regular list
  // (they appear instead in the "Au choix" group panels below)
  const auChoixBases = new Set(
    (REF?.competences || [])
      .filter(c => /\(au choix/i.test(c.name))
      .map(c => c.name.split('(')[0].trim().toLowerCase())
  );
  const isTypedAuChoixVariant = sk =>
    !(/\(au choix/i.test(sk.name)) &&
    sk.name.includes('(') &&
    auChoixBases.has(sk.name.split('(')[0].trim().toLowerCase());

  // Grouper par domaine (excluant les variantes typées d'Au choix)
  const byDomain = {};
  domaines.forEach(d => { byDomain[d.id] = []; });
  competences
    .filter(c => !isTypedAuChoixVariant(c))
    .forEach(c => { if (byDomain[c.domain]) byDomain[c.domain].push(c); });

  const slotTracker = (label, used, max, colorClass) => `
    <div class="flex items-center gap-2">
      <span class="text-xs ${colorClass} w-48 shrink-0">${label}</span>
      <div class="flex gap-0.5">
        ${Array.from({length: max}, (_, i) =>
          `<div class="w-3.5 h-3.5 rounded-sm border border-gray-600 ${i < used ? colorClass.replace('text-','bg-') : 'bg-gray-800'}"></div>`
        ).join('')}
      </div>
      <span class="text-xs text-gray-400">${used}/${max}</span>
    </div>`;

  return `
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-base font-semibold">Compétences</h3>
    <button id="btn-rand-comps" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>

  ${orig ? `<!-- Bonus d'origine -->
  <div class="mb-3 bg-gray-800/60 border border-green-900/40 rounded-lg px-3 py-2 text-xs">
    <span class="text-gray-400 font-semibold">Bonus origine (${esc(orig.nom)}) : </span>
    ${(orig.bonus_competences || []).map(c => {
      const key = resolveOrigineComp(c, DRAFT.origine_choix);
      const name = key || (c.competence.replace(/\s*\(Au choix\)\s*/i,'').trim() + ' <span class="text-orange-400">(à choisir)</span>');
      return `<span class="text-green-400 mr-2">+${c.valeur} ${key ? esc(name) : name}</span>`;
    }).join('')}
  </div>` : ''}

  <!-- Compétences de départ (archétype) -->
  <div class="mb-3 bg-gray-800/60 border border-blue-900/40 rounded-lg p-3">
    <p class="text-xs font-semibold text-blue-300 mb-2">Compétences de départ – ${esc(arch?.nom || '?')} <span class="font-normal text-blue-400/70">(+1 chacune)</span></p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
      ${compArch.map(sk => {
        const isChoix = sk.includes('(Au choix)');
        const opts    = archChoixTypeOptions(sk);
        const curChoix = DRAFT.competences_archetype_choix[sk] || '';
        const label   = isChoix ? sk.replace('(Au choix)', '').trim() : sk;
        return `
        <div class="flex items-center gap-1.5">
          <span class="text-blue-400 text-xs font-mono shrink-0">+1</span>
          <span class="text-xs text-blue-200 shrink-0">${esc(label)}</span>
          ${isChoix
            ? (opts
                ? `<select data-arch-choix="${esc(sk)}"
                     class="arch-choix-select flex-1 min-w-0 text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5">
                     <option value="">— type —</option>
                     ${opts.map(t => `<option value="${esc(t)}" ${curChoix===t?'selected':''}>${esc(t)}</option>`).join('')}
                   </select>`
                : `<input data-arch-choix="${esc(sk)}" value="${esc(curChoix)}" placeholder="Préciser…"
                     class="arch-choix-input flex-1 min-w-0 text-xs bg-gray-700 border border-gray-600 rounded px-2 py-0.5">`)
            : ''}
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- Budget de distribution libre -->
  <div class="mb-3 bg-gray-800/60 border border-yellow-900/30 rounded-lg p-3 space-y-2">
    <p class="text-xs font-semibold text-yellow-300 mb-1">Distribution libre (10 groupes)</p>
    ${slotTracker(`+3 dom. principal (${domPrimaire||'?'})`, used3, COMP_SLOTS.plus3, 'text-red-300')}
    ${slotTracker(`+2 domaines privilégiés`,                 used2, COMP_SLOTS.plus2, 'text-orange-300')}
    ${slotTracker(`+1 n'importe quel domaine`,               used1, COMP_SLOTS.plus1, 'text-yellow-300')}
  </div>

  <p class="text-xs text-gray-500 mb-2">
    <span class="text-red-300">★★</span> dom. principal (+3 max) ·
    <span class="text-yellow-300">★</span> dom. privilégiés (+2 max) ·
    colonnes : <span class="text-green-400">+orig</span> · <span class="text-blue-400">+arch</span> · libre · <span class="text-yellow-300">total</span>
  </p>

  <!-- Liste compétences par domaine -->
  <div class="space-y-3 overflow-y-auto max-h-[38vh] pr-1">
    ${domaines.map(dom => {
      const allSkillsInDom = byDomain[dom.id] || [];
      const isPrimaire = dom.id === domPrimaire;
      const isPriv     = domPriv.includes(dom.id);
      const domClass   = isPrimaire ? 'text-red-300' : isPriv ? 'text-yellow-300' : 'text-gray-400';
      const domMark    = isPrimaire ? '★★ ' : isPriv ? '★ ' : '';
      const attrNom    = REF?.attributs?.find(a => a.id === dom.attribut)?.nom || '';

      // Split regular vs "(Au choix)"
      const regularSkills = allSkillsInDom.filter(sk => !/\(au choix/i.test(sk.name));
      const auChoixSkills = allSkillsInDom.filter(sk =>  /\(au choix/i.test(sk.name));

      // Regular skills rows
      const regularRows = regularSkills.map(sk => {
        const archB = getArchBonusForSkill(sk.name, compArch, DRAFT.competences_archetype_choix);
        const origB = bonusMap[sk.name] || 0;
        const libre = DRAFT.competences_libres[sk.name] || 0;
        const total = archB + origB + libre;
        const can3  = isPrimaire && (used3 < COMP_SLOTS.plus3 || libre === 3);
        const can2  = isPriv     && (used2 < COMP_SLOTS.plus2 || libre === 2);
        const can1  =               (used1 < COMP_SLOTS.plus1 || libre === 1);
        return `
        <div class="flex items-center gap-1.5 py-0.5 border-b border-gray-700/50">
          <span class="flex-1 text-xs ${archB ? 'text-blue-200' : 'text-gray-300'} truncate"
                title="${esc(sk.description || sk.name)}">${esc(sk.name)}</span>
          <span class="text-xs text-green-400 w-5 text-right shrink-0">${origB > 0 ? '+'+origB : ''}</span>
          <span class="text-xs text-blue-400  w-5 text-right shrink-0">${archB > 0 ? '+'+archB : ''}</span>
          <select data-sk="${esc(sk.name)}" class="sk-libre bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs w-14 shrink-0">
            <option value="0" ${libre===0?'selected':''}>—</option>
            <option value="1" ${libre===1?'selected':''} ${!can1&&libre!==1?'disabled':''}>+1</option>
            <option value="2" ${libre===2?'selected':''} ${!can2&&libre!==2?'disabled':''}>+2</option>
            <option value="3" ${libre===3?'selected':''} ${!can3&&libre!==3?'disabled':''}>+3</option>
          </select>
          <span class="text-xs font-mono w-6 text-right shrink-0 ${total>0?'text-yellow-300':'text-gray-700'}">${total>0?total:'—'}</span>
        </div>`;
      }).join('');

      // "(Au choix)" skill groups
      const auChoixGroups = auChoixSkills.map(acSk => {
        const base = acSk.name.split('(')[0].trim();

        // Origin pre-specified instances for this base (e.g. Connaissance → Empire Galactique)
        const origInstances = [];
        if (orig) {
          for (const bc of orig.bonus_competences || []) {
            if (bc.au_choix) continue; // player-chosen — handled by origine_choix
            if (!bc.specialite) continue;
            if (!/\(au choix/i.test(bc.competence)) continue;
            if (bc.competence.split('(')[0].trim().toLowerCase() !== base.toLowerCase()) continue;
            const resolved = resolveAuChoixKey(bc.competence, bc.specialite);
            if (resolved) origInstances.push({ name: resolved, bonus: bc.valeur });
          }
          // Also include au_choix=true entries where player already chose a type
          for (const bc of orig.bonus_competences || []) {
            if (!bc.au_choix) continue;
            if (bc.competence.split('(')[0].trim().toLowerCase() !== base.toLowerCase()) continue;
            const chosen = DRAFT.origine_choix[bc.competence];
            if (!chosen) continue;
            const resolved = resolveAuChoixKey(bc.competence, chosen);
            if (resolved) origInstances.push({ name: resolved, bonus: bc.valeur });
          }
        }

        // Find existing typed instances in competences_libres that belong to this base
        const instances = Object.entries(DRAFT.competences_libres)
          .filter(([sk]) => sk.toLowerCase().startsWith(base.toLowerCase() + ' ('))
          .sort((a, b) => a[0].localeCompare(b[0], 'fr'));

        // Options for the select
        let opts;
        if (/^Environnement/i.test(acSk.name)) opts = ENV_TYPES;
        else if (/^Pilotage/i.test(acSk.name)) opts = PILOTAGE_TYPES;
        else opts = origineChoixTypeOptions(acSk.name); // REF-based variants or null

        // Slot capacity for the add row
        const hasRoom1 = used1 < COMP_SLOTS.plus1;
        const hasRoom2 = isPriv && used2 < COMP_SLOTS.plus2;
        const hasRoom3 = isPrimaire && used3 < COMP_SLOTS.plus3;
        const defaultLev = hasRoom3 ? 3 : hasRoom2 ? 2 : 1;

        // Read-only rows for origin-pre-specified instances not covered by player's libres
        const playerKeys = new Set(instances.map(([sk]) => sk));
        const origOnlyRows = origInstances
          .filter(oi => !playerKeys.has(oi.name))
          .map(oi => `
          <div class="flex items-center gap-1 py-0.5 border-b border-gray-700/40 opacity-80">
            <span class="flex-1 text-xs text-gray-300 truncate" title="${esc(oi.name)}">${esc(oi.name)}</span>
            <span class="text-xs text-green-400 w-5 text-right shrink-0">+${oi.bonus}</span>
            <span class="text-xs text-gray-600 w-5 shrink-0"></span>
            <span class="text-xs text-gray-500 w-14 text-center shrink-0 italic">origine</span>
            <span class="text-xs font-mono w-6 text-right shrink-0 text-yellow-300">${oi.bonus}</span>
            <span class="w-5 shrink-0"></span>
          </div>`).join('');

        const instanceRows = instances.map(([sk, libre]) => {
          const archB = getArchBonusForSkill(sk, compArch, DRAFT.competences_archetype_choix);
          const origB = bonusMap[sk] || 0;
          const total = archB + origB + libre;
          const can3i = isPrimaire && (used3 < COMP_SLOTS.plus3 || libre === 3);
          const can2i = isPriv     && (used2 < COMP_SLOTS.plus2 || libre === 2);
          const can1i =               (used1 < COMP_SLOTS.plus1 || libre === 1);
          return `
          <div class="flex items-center gap-1 py-0.5 border-b border-gray-700/40">
            <span class="flex-1 text-xs text-gray-300 truncate" title="${esc(sk)}">${esc(sk)}</span>
            <span class="text-xs text-green-400 w-5 text-right shrink-0">${origB > 0 ? '+'+origB : ''}</span>
            <span class="text-xs text-blue-400  w-5 text-right shrink-0">${archB > 0 ? '+'+archB : ''}</span>
            <select data-sk="${esc(sk)}" class="sk-libre bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs w-14 shrink-0">
              <option value="0">—</option>
              <option value="1" ${libre===1?'selected':''} ${!can1i&&libre!==1?'disabled':''}>+1</option>
              <option value="2" ${libre===2?'selected':''} ${!can2i&&libre!==2?'disabled':''}>+2</option>
              <option value="3" ${libre===3?'selected':''} ${!can3i&&libre!==3?'disabled':''}>+3</option>
            </select>
            <span class="text-xs font-mono w-6 text-right shrink-0 ${total>0?'text-yellow-300':'text-gray-700'}">${total>0?total:'—'}</span>
            <button data-del-ac="${esc(sk)}" class="text-red-500 hover:text-red-400 text-xs ml-1 shrink-0 leading-none">✕</button>
          </div>`;
        }).join('');

        const selectOrInput = opts
          ? `<select data-ac-type="${esc(acSk.name)}" class="ac-type-sel flex-1 min-w-0 text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5">
               <option value="">— choisir —</option>
               ${opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
               <option value="__autre__">Autre…</option>
             </select>
             <input data-ac-libre="${esc(acSk.name)}" placeholder="Préciser…"
               class="ac-libre-inp hidden text-xs bg-gray-700 border border-gray-600 rounded px-2 py-0.5 w-24 shrink-0">`
          : `<input data-ac-libre="${esc(acSk.name)}" placeholder="Nom du type…"
               class="ac-libre-inp flex-1 min-w-0 text-xs bg-gray-700 border border-gray-600 rounded px-2 py-0.5">`;

        return `
        <div class="mt-2 bg-gray-800/40 border border-gray-700/50 rounded-lg p-2">
          <p class="text-xs font-medium text-gray-400 mb-1">${esc(base)} <span class="text-gray-600 font-normal">(spécialisée)</span></p>
          ${origOnlyRows}
          ${instanceRows}
          <div class="flex gap-1 mt-1.5 items-center flex-wrap">
            ${selectOrInput}
            <select data-ac-lev="${esc(acSk.name)}" class="ac-lev-sel text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 shrink-0 w-14">
              <option value="1" ${hasRoom1?'':'disabled'}>+1</option>
              <option value="2" ${hasRoom2?'':'disabled'} ${defaultLev===2?'selected':''}>+2</option>
              <option value="3" ${hasRoom3?'':'disabled'} ${defaultLev===3?'selected':''}>+3</option>
            </select>
            <button data-ac-add="${esc(acSk.name)}" class="px-2 py-1 text-xs bg-green-800/60 hover:bg-green-700/60 border border-green-700/50 rounded text-green-300 shrink-0">➕ Ajouter</button>
          </div>
        </div>`;
      }).join('');

      return `
      <div>
        <p class="text-xs font-semibold mb-1 ${domClass}">
          ${domMark}${esc(dom.id)} <span class="text-gray-500 font-normal">(${esc(attrNom)})</span>
        </p>
        <div class="space-y-0.5">
          ${regularRows}
        </div>
        ${auChoixGroups}
      </div>`;
    }).join('')}
  </div>`;
}


// ── Étape 7 : Traits (Qualités / Défauts) ─────────────────────────────────────
function renderStepTraits() {
  const isMutant   = DRAFT.is_mutant;
  const orig       = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  const charNation = orig?.nation || null;

  const isMutantOnly = t => String(t.restriction || '').toLowerCase().includes('mutant');
  const traitHasNation = t => t.nation && t.nation !== 'Aucune';
  const canSee = t => {
    if (DRAFT.type === 'pj' && t.pnj_only) return false;
    if (isMutantOnly(t) && !isMutant) return false;
    if (traitHasNation(t) && t.nation !== charNation) return false;
    if (t.id === 'qualite-violent') return false; // auto-granté aux non-mutants, caché de la liste
    return true;
  };

  const allQ = (REF?.qualites || []).filter(canSee);
  const allD = (REF?.defauts  || []).filter(canSee);

  const groupTraits = list => ({
    general: list.filter(t => !traitHasNation(t) && !isMutantOnly(t)),
    nation:  list.filter(t =>  traitHasNation(t) && t.nation === charNation),
    mutant:  list.filter(t =>  isMutantOnly(t)),
  });
  const qGroups = groupTraits(allQ);
  const dGroups = groupTraits(allD);

  const isDefaut = TRAITS_TAB.section === 'd';
  const curGroups = isDefaut ? dGroups : qGroups;
  const curAll    = isDefaut ? allD    : allQ;

  const qPts   = traitPoints(DRAFT.qualites_ids, REF?.qualites, 'cost', DRAFT.traits_niveaux);
  const dPts   = traitPoints(DRAFT.defauts_ids,  REF?.defauts,  'cost', DRAFT.traits_niveaux);
  const dTotal = dPts;
  const qTotal = qPts;
  const balance = dTotal - qTotal;
  const maxDef  = 10;

  const displayList = TRAITS_TAB.filter === 'nation'  ? curGroups.nation  :
                      TRAITS_TAB.filter === 'mutant'  ? curGroups.mutant  :
                      TRAITS_TAB.filter === 'general' ? curGroups.general :
                      curAll;

  const hasNation   = !!(charNation && curGroups.nation.length);
  const hasMutant   = !!(isMutant   && curGroups.mutant.length);
  const hasMultiCat = (hasNation || hasMutant) && curGroups.general.length > 0;

  const charNationObj  = charNation ? (REF?.nations?.find(n => n.id === charNation) || null) : null;
  const nationLabel    = charNationObj?.nom || charNation || '';
  const nationIconUrl  = charNationObj?.faction_icon_url || null;
  const nationImgTag   = nationIconUrl
    ? `<img src="${esc(nationIconUrl)}" alt="${esc(nationLabel)}" class="w-4 h-4 object-contain inline-block">`
    : '⚓';

  const sectionTab = (section, label, pts, count) => `
    <button data-traits-tab-section="${section}"
      class="flex-1 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 flex items-center justify-center gap-2
        ${TRAITS_TAB.section === section
          ? 'text-white border-yellow-400 bg-gray-700/60'
          : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800'}">
      ${label}
      <span class="text-xs ${TRAITS_TAB.section === section ? 'text-yellow-300' : 'text-gray-500'}">${pts} pts</span>
      ${count ? `<span class="text-xs px-1.5 py-0.5 rounded-full ${TRAITS_TAB.section === section ? 'bg-yellow-500/20 text-yellow-300' : 'bg-gray-700 text-gray-500'}">${count}</span>` : ''}
    </button>`;

  const filterBtn = (filter, label) => `
    <button data-traits-tab-filter="${filter}"
      class="px-2.5 py-1 rounded text-xs font-medium transition-colors
        ${TRAITS_TAB.filter === filter ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}">
      ${label}
    </button>`;

  const renderCard = t => {
    const varLevels = VARIABLE_TRAIT_LEVELS[t.id];
    if (varLevels) {
      const selVar = isDefaut ? DRAFT.defauts_ids.includes(t.id) : DRAFT.qualites_ids.includes(t.id);
      const chosen  = DRAFT.traits_niveaux?.[t.id] ?? null;
      const checkWouldExceedVar = lv => {
        const curNiv = selVar ? (DRAFT.traits_niveaux?.[t.id] || 0) : 0;
        return isDefaut ? (dTotal - curNiv + lv > maxDef) : (balance + curNiv < lv);
      };
      return `
    <div class="trait-btn w-full text-left ${selVar ? (isDefaut ? 'selected-d' : 'selected-q') : ''}">
      <div class="flex justify-between items-center gap-2 flex-wrap mb-1">
        <span class="${selVar ? (isDefaut ? 'text-yellow-300' : 'text-blue-300') : 'text-gray-300'} font-medium text-xs">${esc(t.name)}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          ${isMutantOnly(t) ? `<span class="text-xs px-1 py-px rounded bg-cyan-900/40 text-cyan-500">🧬</span>` : ''}
          <select data-trait-level="${t.id}" data-ttype="${isDefaut ? 'd' : 'q'}"
            class="bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-gray-200">
            <option value="">— niveau —</option>
            ${varLevels.map(lv => `<option value="${lv}" ${chosen === lv ? 'selected' : ''} ${checkWouldExceedVar(lv) ? 'disabled' : ''}>${isDefaut ? '+' : '−'}${lv} pts</option>`).join('')}
          </select>
        </div>
      </div>
      ${t.description ? `<p class="text-xs text-gray-500">${esc(t.description)}</p>` : ''}
      ${t.effects     ? `<p class="text-xs text-gray-400 mt-0.5"><span class="text-gray-500">Effet : </span>${esc(t.effects)}</p>` : ''}
    </div>`;
    }
    const sel = isDefaut ? DRAFT.defauts_ids.includes(t.id) : DRAFT.qualites_ids.includes(t.id);
    const pts = Math.abs(parseInt(t.cost) || 0);
    const wouldExceed = isDefaut ? (!sel && dTotal + pts > maxDef) : (!sel && balance < pts);
    return `
    <button data-trait="${t.id}" data-ttype="${isDefaut ? 'd' : 'q'}"
      class="trait-btn w-full text-left ${sel ? (isDefaut ? 'selected-d' : 'selected-q') : ''} ${wouldExceed && !sel ? 'opacity-40' : ''}">
      <div class="flex justify-between items-center gap-2 flex-wrap mb-1">
        <span class="${sel ? (isDefaut ? 'text-yellow-300' : 'text-blue-300') : 'text-gray-300'} font-medium text-xs">${esc(t.name)}</span>
        <div class="flex gap-1 items-center shrink-0">
          ${traitHasNation(t) ? `<span class="text-xs px-1 py-px rounded bg-gray-700/60 text-gray-400">${nationIconUrl ? `<img src="${esc(nationIconUrl)}" alt="" class="w-3 h-3 object-contain inline-block">` : '⚓'}</span>` : ''}
          ${isMutantOnly(t) ? `<span class="text-xs px-1 py-px rounded bg-cyan-900/40 text-cyan-500">🧬</span>` : ''}
          <span class="${isDefaut ? 'text-yellow-400' : 'text-blue-400'} text-xs">${isDefaut ? '+' : ''}${pts} pts</span>
        </div>
      </div>
      ${t.description ? `<p class="text-xs text-gray-500">${esc(t.description)}</p>` : ''}
      ${t.effects     ? `<p class="text-xs text-gray-400 mt-0.5"><span class="text-gray-500">Effet : </span>${esc(t.effects)}</p>` : ''}
      ${t.prerequisites ? `<p class="text-xs text-gray-600 mt-0.5">Prérequis : ${esc(t.prerequisites)}</p>` : ''}
      ${t.restriction ? `<p class="text-xs text-gray-600 mt-0.5">Restriction : ${esc(t.restriction)}</p>` : ''}
    </button>`;
  };

  return `
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Qualités &amp; Défauts (optionnel)</h3>
    <button id="btn-rand-traits" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
  <div class="flex gap-4 text-xs mb-3 flex-wrap">
    <span>Défauts : <strong class="text-yellow-400">${dTotal} pts</strong> / max ${maxDef}</span>
    <span>Qualités : <strong class="text-blue-400">${qTotal} pts</strong></span>
    <span>Solde : <strong class="${balance >= 0 ? 'text-green-400' : 'text-red-400'}">${balance} pts</strong></span>
  </div>

  <div class="flex gap-0 border-b border-gray-700 mb-3">
    ${sectionTab('d', '① Désavantages', dTotal, DRAFT.defauts_ids.length  || '')}
    ${sectionTab('q', '② Avantages',    qTotal, DRAFT.qualites_ids.length || '')}
  </div>

  ${!isMutant && !isDefaut ? `
  <div class="mb-3 px-3 py-2 bg-gray-800/80 border border-gray-700 rounded-lg flex items-center gap-2 text-xs">
    <span class="text-green-400 font-semibold">✔ Violent</span>
    <span class="text-gray-500">Accordé automatiquement à tous les non-mutants (gratuit)</span>
  </div>` : ''}

  ${hasMultiCat ? `
  <div class="flex gap-1.5 mb-3 flex-wrap">
    ${filterBtn('all',     'Tous')}
    ${curGroups.general.length ? filterBtn('general', 'Généraux') : ''}
    ${hasNation ? filterBtn('nation', nationImgTag + ' ' + esc(nationLabel)) : ''}
    ${hasMutant ? filterBtn('mutant', '🧬 Mutants') : ''}
  </div>` : ''}

  <div class="space-y-2">
    ${displayList.length
      ? displayList.map(renderCard).join('')
      : '<p class="text-gray-600 text-xs py-4 text-center">Aucun trait disponible dans cette catégorie.</p>'}
  </div>`;
}

// ── Étape Entraînement (attributionde points de compétence) ───────────────────
function renderStepEntrainement() {
  const maxBonus = DRAFT.traits_niveaux?.['qualite-entraînement'] || 0;
  const bonus    = DRAFT.entrainement_bonus || {};
  const totalDistributed = Object.values(bonus).reduce((s, v) => s + v, 0);
  const remaining = maxBonus - totalDistributed;

  // Build skill list from current DRAFT (excluding entrainement bonus itself)
  const tempDraft = { ...DRAFT, entrainement_bonus: {} };
  const comps   = buildCompetences(tempDraft);
  const skillList = Object.keys(comps).sort((a, b) => a.localeCompare(b, 'fr'));

  const rows = skillList.map(sk => {
    const c    = comps[sk];
    const base = (c.bonus || 0) + (c.archetype || 0) + (c.libre || 0);
    const added = bonus[sk] || 0;
    const canAdd    = remaining > 0 && added < 3;
    const canRemove = added > 0;
    return `
    <div class="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <span class="flex-1 text-sm text-gray-200">${esc(sk)}</span>
      <span class="text-xs text-gray-500 w-16 text-right shrink-0">${base > 0 ? `base ${base}` : '—'}</span>
      <div class="flex items-center gap-1.5 shrink-0">
        <button data-entr-sk="${esc(sk)}" data-entr-delta="-1"
          class="w-7 h-7 rounded bg-gray-700 text-gray-300 text-base font-bold flex items-center justify-center
                 ${canRemove ? 'hover:bg-red-800/50 hover:text-red-300' : 'opacity-30 cursor-not-allowed'}"
          ${canRemove ? '' : 'disabled'}>−</button>
        <span class="w-7 text-center font-bold text-sm ${added > 0 ? 'text-green-400' : 'text-gray-600'}">${added > 0 ? '+' + added : '0'}</span>
        <button data-entr-sk="${esc(sk)}" data-entr-delta="+1"
          class="w-7 h-7 rounded bg-gray-700 text-gray-300 text-base font-bold flex items-center justify-center
                 ${canAdd ? 'hover:bg-green-800/50 hover:text-green-300' : 'opacity-30 cursor-not-allowed'}"
          ${canAdd ? '' : 'disabled'}>+</button>
      </div>
    </div>`;
  }).join('');

  return `
  <h3 class="text-base font-semibold mb-1">Entraînement — Distribution des points</h3>
  <div class="bg-gray-900/50 rounded-lg px-3 py-2 mb-4 text-xs text-gray-400">
    Avantage <strong class="text-green-400">Entraînement ×${maxBonus}</strong> :
    répartissez <strong class="text-green-300">${remaining} point${remaining !== 1 ? 's' : ''}</strong>
    restant${remaining !== 1 ? 's' : ''} parmi vos compétences existantes.
    Maximum <strong class="text-gray-300">+3</strong> par compétence.
  </div>
  <div class="space-y-1.5">
    ${rows || '<p class="text-gray-500 text-sm">Aucune compétence disponible.</p>'}
  </div>`;
}

function traitPoints(ids, list, field, niveaux = {}) {
  if (!ids || !list) return 0;
  return ids.reduce((sum, id) => {
    const item = list.find(x => x.id === id);
    const niv = niveaux?.[id];
    const val = niv != null ? niv : Math.abs(parseInt(item?.[field] || 0));
    return sum + val;
  }, 0);
}

// ── Étape Mutations (mutants uniquement) ──────────────────────────────────────
function renderStepMutations() {
  const all      = REF?.mutations || [];
  const basiques = all.filter(m => (m.mutation_type || '').toLowerCase() === 'basique');
  const avancees = all.filter(m => (m.mutation_type || '').toLowerCase() !== 'basique');

  const sel         = DRAFT.mutations_ids;
  const selBasiques = sel.filter(id => basiques.some(m => m.id === id));
  const selAvancees = sel.filter(id => avancees.some(m => m.id === id));

  const tab  = MUTATION_TAB;
  const list = tab === 'basique' ? basiques : avancees;

  const typeBadge = type => {
    const t = (type || '').toLowerCase();
    if (t === 'passive') return `<span class="text-xs px-1.5 py-px rounded bg-green-900/60 text-green-400">Passive</span>`;
    if (t === 'avancée' || t === 'avancee') return `<span class="text-xs px-1.5 py-px rounded bg-purple-900/60 text-purple-300">Avancée</span>`;
    return '';
  };

  const mutCard = m => {
    const isSel = sel.includes(m.id);
    return `
    <button data-mutation="${m.id}"
      class="mutation-card w-full text-left px-4 py-3 rounded-xl border transition-colors
             ${isSel ? 'border-cyan-500 bg-cyan-900/30 text-cyan-100' : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-cyan-600'}">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-medium text-sm">${esc(m.name)}</span>
        ${typeBadge(m.mutation_type)}
        ${m.ex_cost ? `<span class="text-xs text-gray-500 ml-auto shrink-0">${esc(m.ex_cost)}</span>` : ''}
      </div>
      ${m.effect ? `<div class="text-xs text-gray-400 mt-1">${esc(m.effect)}</div>` : ''}
    </button>`;
  };

  return `
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Mutations</h3>
    <button id="btn-rand-mutations" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
  <div class="bg-gray-900/50 rounded-lg px-3 py-2 mb-4 text-xs text-gray-400">
    Règle : choisissez <strong class="text-cyan-300">2 mutations basiques</strong>
    ou <strong class="text-purple-300">1 mutation avancée</strong>.
    <span class="ml-2 text-gray-500">
      Sélectionnées : ${selBasiques.length} basique(s)&nbsp;·&nbsp;${selAvancees.length} avancée(s)
    </span>
  </div>

  <!-- Onglets Basiques / Avancées -->
  <div class="flex gap-1 mb-4">
    <button data-mutation-tab="basique"
      class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
             ${tab === 'basique' ? 'bg-cyan-800 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
      Basiques <span class="ml-1 text-xs opacity-70">(${selBasiques.length})</span>
    </button>
    <button data-mutation-tab="avancee"
      class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
             ${tab === 'avancee' ? 'bg-purple-800 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
      Avancées <span class="ml-1 text-xs opacity-70">(${selAvancees.length})</span>
    </button>
  </div>

  <!-- Cartes -->
  <div class="space-y-2">
    ${list.map(mutCard).join('') || '<p class="text-gray-500 text-sm">Aucune mutation disponible.</p>'}
  </div>`;
}

function validateMutations() {
  const all      = REF?.mutations || [];
  const basiques = all.filter(m => (m.mutation_type || '').toLowerCase() === 'basique');
  const avancees = all.filter(m => (m.mutation_type || '').toLowerCase() !== 'basique');
  const sel         = DRAFT.mutations_ids;
  const selBasiques = sel.filter(id => basiques.some(m => m.id === id));
  const selAvancees = sel.filter(id => avancees.some(m => m.id === id));
  // Valide si : 0 sélectionnées, 2 basiques sans avancée, ou 1 avancée sans basique
  if (sel.length === 0) return true;
  if (selBasiques.length === 2 && selAvancees.length === 0) return true;
  if (selAvancees.length === 1 && selBasiques.length === 0) return true;
  return false;
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

  <!-- Nom + genre + âge + description -->
  <div class="space-y-3 mb-5">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Genre / Sexe</label>
      <div class="flex gap-2">
        ${['homme','femme','autre'].map(g => `
          <button type="button" data-genre="${g}"
            class="genre-btn flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors
              ${(DRAFT.genre || 'homme') === g
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}">
            ${g === 'homme' ? '♂ Homme' : g === 'femme' ? '♀ Femme' : '⚧ Autre'}
          </button>`).join('')}
      </div>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Nom du personnage *</label>
      <div class="flex gap-2">
        <input type="text" id="fin-nom" value="${esc(DRAFT.nom_personnage || '')}"
          placeholder="Nom…"
          class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
        ${(() => {
          const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
          const nation = orig?.nation ?? null;
          const canGen = nation && nation !== 'Daemon';
          return canGen
            ? `<button type="button" id="btn-gen-name" title="Générer un nom aléatoire"
                class="px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm transition-colors">🎲</button>`
            : '';
        })()}
      </div>
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
    ${(() => {
      const niveauxF = DRAFT.traits_niveaux || {};
      const archCreditsMatch2 = (arch?.equipement_depart || '').match(/—\s*(\d+)\s*₡/);
      const archCr = archCreditsMatch2 ? parseInt(archCreditsMatch2[1]) : 0;
      const richeCr  = DRAFT.qualites_ids.includes('qualite-riche')  ? (niveauxF['qualite-riche']  || 0) * 250 : 0;
      const tresorCr = DRAFT.qualites_ids.includes('qualite-tresor') ? (niveauxF['qualite-tresor'] || 0) * 250 : 0;
      const totalCr  = archCr + richeCr + tresorCr;
      const parts = [];
      if (archCr)   parts.push(`${archCr} ₡ (archétype)`);
      if (richeCr)  parts.push(`+${richeCr} ₡ (Riche ×${niveauxF['qualite-riche']})`);
      if (tresorCr) parts.push(`+${tresorCr} ₡ (Trésor ×${niveauxF['qualite-tresor']})`);
      return totalCr > 0
        ? `<p class="text-xs text-yellow-300 font-semibold mt-1">Crédits de départ : ${totalCr.toLocaleString('fr-FR')} ₡
             <span class="text-gray-500 font-normal">(${parts.join(' ')})</span></p>`
        : '';
    })()}
  </div>`;
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
  // genre est sauvegardé en direct via le listener
  return !!DRAFT.nom_personnage?.trim();
}

// ── Étapes PNJ-spécifiques ────────────────────────────────────────────────────
function renderStepPNJType() {
  const niveaux = REF?.pnj_niveaux || [];
  return `
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Type de PNJ</h3>
    <button id="btn-rand-pnj-type" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
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
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-base font-semibold">Profil du PNJ</h3>
    <button id="btn-rand-pnj-profil" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>

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
  const pool  = [...(level?.caracteristiques || [3,2,2,2,2,1])].sort((a,b) => b-a);
  const attrs = REF?.attributs || [];

  // Valeurs restantes
  const remaining = [...pool];
  for (const v of Object.values(DRAFT.attributs_pnj)) {
    if (v !== null) { const i = remaining.indexOf(v); if (i >= 0) remaining.splice(i, 1); }
  }

  return `
  <div class="flex items-center justify-between mb-1">
    <h3 class="text-base font-semibold">Répartissez les caractéristiques du PNJ</h3>
    <button id="btn-rand-pnj-attrs" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>
  <p class="text-xs text-gray-500 mb-1">Assignez <strong>exactement</strong> les valeurs suivantes : ${pool.join(', ')}.</p>
  <p class="text-xs text-gray-400 mb-4">
    Valeurs restantes :
    ${pool.filter((v,i,a)=>a.indexOf(v)===i).map(v => {
      const cnt = remaining.filter(x => x === v).length;
      return cnt > 0 ? `<span class="font-mono text-yellow-400">${v}×${cnt}</span>` : null;
    }).filter(Boolean).join(' ')}
    ${remaining.length === 0 ? '<span class="text-green-400">✔ Complet</span>' : ''}
  </p>
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    ${attrs.map(a => {
      const val = DRAFT.attributs_pnj[a.id];
      return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1"${a.description ? ` data-tip="${esc(a.description)}"` : ''}>${esc(a.nom)}${a.description ? ' ℹ' : ''}</p>
        <p class="text-xs text-gray-500 mb-2">${esc(a.domaine || '')}</p>
        <select data-pnj-attr="${a.id}"
          class="attr-pnj-select w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm">
          <option value="">—</option>
          ${pool.map(v => {
            const available = remaining.filter(x => x === v).length + (val === v ? 1 : 0);
            return `<option value="${v}" ${val === v ? 'selected' : ''} ${available === 0 && val !== v ? 'disabled' : ''}>${v}</option>`;
          }).filter((html, i, arr) => arr.indexOf(html) === i)}
        </select>
      </div>`;
    }).join('')}
  </div>`;
}

function validatePNJAttributs() {
  const level = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
  const pool  = [...(level?.caracteristiques || [3,2,2,2,2,1])].sort((a,b) => b-a);
  const vals  = Object.values(DRAFT.attributs_pnj).filter(v => v !== null).sort((a,b) => b-a);
  return vals.length === pool.length && vals.join(',') === pool.join(',');
}

function renderStepPNJCompetences() {
  const level     = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
  const pool      = [...(level?.competences_pool || [])].sort((a,b) => b-a);
  const domaines  = REF?.domaines || [];
  const competences = REF?.competences || [];
  const arch      = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const domPriv   = arch?.domaines_privileges || DRAFT.domaines_libres || [];

  // Valeurs restantes dans le pool
  const remaining = [...pool];
  for (const v of Object.values(DRAFT.competences_pnj)) {
    const i = remaining.indexOf(v);
    if (i >= 0) remaining.splice(i, 1);
  }
  const poolUniq = [...new Set(pool)].sort((a,b) => b-a);

  const byDomain = {};
  domaines.forEach(d => { byDomain[d.id] = []; });
  // Exclude "(Au choix)" base skills — must be entered as typed instances
  competences.filter(c => !/\(au choix/i.test(c.name)).forEach(c => { if (byDomain[c.domain]) byDomain[c.domain].push(c); });

  return `
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-base font-semibold">Compétences du PNJ</h3>
    <button id="btn-rand-pnj-comps" type="button"
      class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-600/30 border border-gray-600 hover:border-yellow-500 text-gray-300 hover:text-yellow-300 transition-colors">
      🎲 Aléatoire
    </button>
  </div>

  <!-- Pool disponible -->
  <div class="mb-3 bg-gray-800/60 border border-gray-700 rounded-lg p-3">
    <p class="text-xs font-semibold text-yellow-300 mb-2">Pool – ${esc(level?.nom || '')} (niveau ${esc(level?.code || '')})</p>
    <div class="flex flex-wrap gap-1.5 items-center">
      ${poolUniq.map(v => {
        const total = pool.filter(x=>x===v).length;
        const used  = total - remaining.filter(x=>x===v).length;
        return `<div class="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-700 border ${used>=total?'border-green-500/40 text-green-400':'border-gray-600 text-yellow-300'}">
          <span class="font-mono font-bold">${v}</span>
          <span class="text-gray-400">×${total-used}/${total}</span>
        </div>`;
      }).join('')}
      <span class="text-xs ${remaining.length===0?'text-green-400':'text-gray-500'}">
        ${remaining.length===0 ? '✔ Pool épuisé' : `${remaining.length} slot${remaining.length>1?'s':''} restant${remaining.length>1?'s':''}`}
      </span>
    </div>
  </div>

  <div class="space-y-3 overflow-y-auto max-h-[45vh] pr-1">
    ${domaines.map(dom => {
      const skills = byDomain[dom.id] || [];
      const priv   = domPriv.includes(dom.id);
      const attrNom = REF?.attributs?.find(a => a.id === dom.attribut)?.nom || '';
      return `
      <div>
        <p class="text-xs font-semibold mb-1 ${priv ? 'text-yellow-300' : 'text-gray-400'}">
          ${priv ? '★ ' : ''}${esc(dom.id)} <span class="text-gray-500 font-normal">(${esc(attrNom)})</span>
        </p>
        <div class="space-y-0.5">
          ${skills.map(sk => {
            const val = DRAFT.competences_pnj[sk.name] ?? 0;
            return `
            <div class="flex items-center gap-2 py-0.5 border-b border-gray-700/50">
              <span class="flex-1 text-xs text-gray-300 truncate">${esc(sk.name)}</span>
              <select data-pnj-sk="${esc(sk.name)}" class="sk-pnj-libre bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs w-14 shrink-0">
                <option value="0" ${val===0?'selected':''}>—</option>
                ${poolUniq.map(pv => {
                  const avail = remaining.filter(x=>x===pv).length + (val===pv?1:0);
                  return `<option value="${pv}" ${val===pv?'selected':''} ${avail===0&&val!==pv?'disabled':''}>${pv}</option>`;
                }).join('')}
              </select>
              <span class="text-xs font-mono w-6 text-right shrink-0 ${val>0?'text-yellow-300':'text-gray-700'}">${val>0?val:'—'}</span>
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
  step.querySelector('#btn-rand-mutant')?.addEventListener('click', () => {
    DRAFT.is_mutant = Math.random() < 0.5;
    document.getElementById('wizard-step').innerHTML = renderStepMutant();
    attachStepListeners();
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
  step.querySelector('#btn-rand-orig')?.addEventListener('click', () => {
    const origines = REF?.origines || [];
    if (!origines.length) return;
    const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
    const orig = rnd(origines);
    DRAFT.origine_id = orig.id;
    DRAFT._origine_nation = orig.nation;
    DRAFT.origine_choix = {};
    for (const c of (orig.bonus_competences || [])) {
      if (c.au_choix) {
        const opts = origineChoixTypeOptions(c.competence);
        if (opts?.length) DRAFT.origine_choix[c.competence] = rnd(opts);
      }
    }
    document.getElementById('wizard-step').innerHTML = renderStepOrigine();
    attachStepListeners();
  });

  // Motivation
  step.querySelectorAll('.motiv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.motivation_id = btn.dataset.motiv;
      document.getElementById('wizard-step').innerHTML = renderStepMotivation();
      attachStepListeners();
    });
  });
  step.querySelector('#btn-rand-motiv')?.addEventListener('click', () => {
    const motivations = REF?.motivations || [];
    if (!motivations.length) return;
    DRAFT.motivation_id = motivations[Math.floor(Math.random() * motivations.length)].id;
    document.getElementById('wizard-step').innerHTML = renderStepMotivation();
    attachStepListeners();
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
  step.querySelector('#btn-rand-arch')?.addEventListener('click', () => {
    const archetypes = REF?.archetypes || [];
    if (!archetypes.length) return;
    const arch = archetypes[Math.floor(Math.random() * archetypes.length)];
    DRAFT.archetype_id = arch.id;
    const actions = arch.actions || [];
    DRAFT.action_archetype = actions.length ? actions[Math.floor(Math.random() * actions.length)].nom : null;
    DRAFT.competences_libres = {};
    document.getElementById('wizard-step').innerHTML = renderStepArchetype();
    attachStepListeners();
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
  step.querySelector('#btn-rand-attrs')?.addEventListener('click', () => {
    const shuffled = [...ATTR_POOL_PJ].sort(() => Math.random() - 0.5);
    const attrs = REF?.attributs || [];
    attrs.forEach((a, i) => { DRAFT.attributs[a.id] = shuffled[i]; });
    document.getElementById('wizard-step').innerHTML = renderStepAttributs();
    attachStepListeners();
  });
  step.querySelector('#btn-rand-comps')?.addEventListener('click', () => {
    DRAFT.competences_libres = {};
    const arch = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
    const domPriv = arch?.domaines_privileges || [];
    const domPrimaire = domPriv[0] || null;
    // Exclude "(Au choix)" base skills — they need explicit typed entries
    const comps = (REF?.competences || []).filter(c => !/\(au choix/i.test(c.name));
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const primSkills = domPrimaire ? comps.filter(c => c.domain === domPrimaire) : comps;
    const privSkills = comps.filter(c => domPriv.includes(c.domain) && c.domain !== domPrimaire);
    const chosen3 = shuffle(primSkills).slice(0, COMP_SLOTS.plus3);
    const used = new Set(chosen3.map(s => s.name));
    chosen3.forEach(s => { DRAFT.competences_libres[s.name] = 3; });
    const chosen2 = shuffle(privSkills.filter(s => !used.has(s.name))).slice(0, COMP_SLOTS.plus2);
    chosen2.forEach(s => { DRAFT.competences_libres[s.name] = 2; used.add(s.name); });
    const chosen1 = shuffle(comps.filter(s => !used.has(s.name))).slice(0, COMP_SLOTS.plus1);
    chosen1.forEach(s => { DRAFT.competences_libres[s.name] = 1; });
    document.getElementById('wizard-step').innerHTML = renderStepCompetences();
    attachStepListeners();
  });

  // Compétences PJ — sélects libres
  step.querySelectorAll('.sk-libre').forEach(sel => {
    sel.addEventListener('change', () => {
      const sk  = sel.dataset.sk;
      const val = parseInt(sel.value);
      if (val === 0) delete DRAFT.competences_libres[sk];
      else           DRAFT.competences_libres[sk] = val;
      document.getElementById('wizard-step').innerHTML = renderStepCompetences();
      attachStepListeners();
    });
  });
  // Archétype "Au choix" — sélects typés
  step.querySelectorAll('.arch-choix-select').forEach(sel => {
    sel.addEventListener('change', () => {
      DRAFT.competences_archetype_choix[sel.dataset.archChoix] = sel.value || '';
      document.getElementById('wizard-step').innerHTML = renderStepCompetences();
      attachStepListeners();
    });
  });
  step.querySelectorAll('.arch-choix-input').forEach(inp => {
    inp.addEventListener('input', () => {
      DRAFT.competences_archetype_choix[inp.dataset.archChoix] = inp.value.trim();
    });
    inp.addEventListener('change', () => {
      DRAFT.competences_archetype_choix[inp.dataset.archChoix] = inp.value.trim();
      document.getElementById('wizard-step').innerHTML = renderStepCompetences();
      attachStepListeners();
    });
  });

  // Compétences "(Au choix)" — type select → affiche/masque le champ texte libre
  step.querySelectorAll('.ac-type-sel').forEach(sel => {
    const acName = sel.dataset.acType;
    const libreInp = step.querySelector(`[data-ac-libre="${CSS.escape(acName)}"]`);
    if (!libreInp) return;
    sel.addEventListener('change', () => {
      libreInp.classList.toggle('hidden', sel.value !== '__autre__');
    });
  });
  // Compétences "(Au choix)" — bouton Ajouter
  step.querySelectorAll('[data-ac-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acName  = btn.dataset.acAdd;
      const typeSel = step.querySelector(`.ac-type-sel[data-ac-type="${CSS.escape(acName)}"]`);
      const libreInp= step.querySelector(`.ac-libre-inp[data-ac-libre="${CSS.escape(acName)}"]`);
      const levSel  = step.querySelector(`.ac-lev-sel[data-ac-lev="${CSS.escape(acName)}"]`);
      let typeName = typeSel ? typeSel.value : '';
      if (typeName === '__autre__' || !typeSel) typeName = (libreInp?.value || '').trim();
      if (!typeName) { alert('Veuillez choisir ou saisir un type.'); return; }
      const level = parseInt(levSel?.value || '1');
      const resolved = resolveAuChoixKey(acName, typeName) || `${acName.split('(')[0].trim()} (${typeName})`;
      DRAFT.competences_libres[resolved] = level;
      document.getElementById('wizard-step').innerHTML = renderStepCompetences();
      attachStepListeners();
    });
  });
  // Compétences "(Au choix)" — supprimer une instance typée
  step.querySelectorAll('[data-del-ac]').forEach(btn => {
    btn.addEventListener('click', () => {
      delete DRAFT.competences_libres[btn.dataset.delAc];
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
        const qPts = traitPoints(DRAFT.qualites_ids, REF?.qualites, 'cost', DRAFT.traits_niveaux);
        const dPs  = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost', DRAFT.traits_niveaux);
        const balance = dPs - qPts;
        if (idx >= 0) { DRAFT.qualites_ids.splice(idx, 1); }
        else if (balance >= cost) { DRAFT.qualites_ids.push(id); }
      } else {
        const idx = DRAFT.defauts_ids.indexOf(id);
        const pts  = Math.abs(parseInt(REF?.defauts?.find(d => d.id === id)?.cost || 0));
        const dPs  = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost', DRAFT.traits_niveaux);
        const maxDef = 10;
        if (idx >= 0) { DRAFT.defauts_ids.splice(idx, 1); }
        else if (dPs + pts <= maxDef) { DRAFT.defauts_ids.push(id); }
      }
      document.getElementById('wizard-step').innerHTML = renderStepTraits();
      attachStepListeners();
    });
  });

  // Traits — sélection du niveau pour traits à coût variable
  step.querySelectorAll('[data-trait-level]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.traitLevel;
      const ttype = sel.dataset.ttype;
      const lv = parseInt(sel.value) || 0;
      const arr    = ttype === 'q' ? DRAFT.qualites_ids : DRAFT.defauts_ids;
      DRAFT.traits_niveaux = DRAFT.traits_niveaux || {};
      const niveaux = DRAFT.traits_niveaux;
      const idx = arr.indexOf(id);
      if (!lv) {
        if (idx >= 0) arr.splice(idx, 1);
        delete niveaux[id];
      } else {
        const dPts = traitPoints(DRAFT.defauts_ids, REF?.defauts, 'cost', niveaux);
        const qPts = traitPoints(DRAFT.qualites_ids, REF?.qualites, 'cost', niveaux);
        if (ttype === 'd') {
          const curD = idx >= 0 ? (niveaux[id] || 0) : 0;
          if (dPts - curD + lv > 10) { sel.value = niveaux[id] || ''; return; }
        } else {
          const curQ = idx >= 0 ? (niveaux[id] || 0) : 0;
          const balance = dPts - qPts + curQ;
          if (balance < lv) { sel.value = niveaux[id] || ''; return; }
        }
        niveaux[id] = lv;
        if (idx < 0) arr.push(id);
      }
      document.getElementById('wizard-step').innerHTML = renderStepTraits();
      attachStepListeners();
    });
  });

  // Traits — tab navigation (section + filter)
  step.querySelectorAll('[data-traits-tab-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      TRAITS_TAB.section = btn.dataset.traitsTabSection;
      TRAITS_TAB.filter  = 'all';
      document.getElementById('wizard-step').innerHTML = renderStepTraits();
      attachStepListeners();
    });
  });
  step.querySelectorAll('[data-traits-tab-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      TRAITS_TAB.filter = btn.dataset.traitsTabFilter;
      document.getElementById('wizard-step').innerHTML = renderStepTraits();
      attachStepListeners();
    });
  });
  step.querySelector('#btn-rand-traits')?.addEventListener('click', () => {
    DRAFT.defauts_ids  = [];
    DRAFT.qualites_ids = [];
    DRAFT.traits_niveaux = {};
    const isMutant = DRAFT.is_mutant;
    const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
    const charNation = orig?.nation || null;
    const isMutantOnly = t => String(t.restriction || '').toLowerCase().includes('mutant');
    const traitHasNation = t => t.nation && t.nation !== 'Aucune';
    const canSee = t => {
      if (DRAFT.type === 'pj' && t.pnj_only) return false;
      if (isMutantOnly(t) && !isMutant) return false;
      if (traitHasNation(t) && t.nation !== charNation) return false;
      return true;
    };
    const defauts = [...(REF?.defauts || []).filter(canSee)].sort(() => Math.random() - 0.5);
    let dPts = 0;
    for (const d of defauts) {
      const pts = Math.abs(parseInt(d.cost) || 0);
      if (pts > 0 && dPts + pts <= 10) { DRAFT.defauts_ids.push(d.id); dPts += pts; }
      if (dPts >= 10) break;
    }
    const qualites = [...(REF?.qualites || []).filter(canSee)].sort(() => Math.random() - 0.5);
    let qPts = 0;
    for (const q of qualites) {
      const pts = Math.abs(parseInt(q.cost) || 0);
      if (pts > 0 && qPts + pts <= dPts) { DRAFT.qualites_ids.push(q.id); qPts += pts; }
    }
    document.getElementById('wizard-step').innerHTML = renderStepTraits();
    attachStepListeners();
  });

  // Entraînement — attribution de points de compétence
  step.querySelectorAll('[data-entr-sk]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sk    = btn.dataset.entrSk;
      const delta = parseInt(btn.dataset.entrDelta);
      const maxBonus = DRAFT.traits_niveaux?.['qualite-entraînement'] || 0;
      DRAFT.entrainement_bonus = DRAFT.entrainement_bonus || {};
      const bonus = DRAFT.entrainement_bonus;
      const totalDistributed = Object.values(bonus).reduce((s, v) => s + v, 0);
      const current = bonus[sk] || 0;
      const newVal  = current + delta;
      if (newVal < 0) return;
      if (newVal > 3) return;
      if (delta > 0 && totalDistributed >= maxBonus) return;
      if (newVal === 0) delete bonus[sk];
      else bonus[sk] = newVal;
      document.getElementById('wizard-step').innerHTML = renderStepEntrainement();
      attachStepListeners();
    });
  });

  // Mutations — onglets Basiques / Avancées
  step.querySelectorAll('[data-mutation-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      MUTATION_TAB = btn.dataset.mutationTab;
      document.getElementById('wizard-step').innerHTML = renderStepMutations();
      attachStepListeners();
    });
  });
  step.querySelector('#btn-rand-mutations')?.addEventListener('click', () => {
    DRAFT.mutations_ids = [];
    const all = REF?.mutations || [];
    const basiques = all.filter(m => (m.mutation_type || '').toLowerCase() === 'basique');
    const avancees = all.filter(m => (m.mutation_type || '').toLowerCase() !== 'basique');
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    if (Math.random() < 0.5 && avancees.length) {
      DRAFT.mutations_ids = [shuffle(avancees)[0].id];
    } else if (basiques.length >= 2) {
      DRAFT.mutations_ids = shuffle(basiques).slice(0, 2).map(m => m.id);
    } else if (avancees.length) {
      DRAFT.mutations_ids = [shuffle(avancees)[0].id];
    }
    document.getElementById('wizard-step').innerHTML = renderStepMutations();
    attachStepListeners();
  });

  // Mutations — sélection d'une carte
  step.querySelectorAll('[data-mutation]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid = btn.dataset.mutation;
      const all      = REF?.mutations || [];
      const basiques = all.filter(m => (m.mutation_type || '').toLowerCase() === 'basique');
      const avancees = all.filter(m => (m.mutation_type || '').toLowerCase() !== 'basique');
      const isBasique = basiques.some(m => m.id === mid);

      const idx = DRAFT.mutations_ids.indexOf(mid);
      if (idx >= 0) {
        // Désélectionner
        DRAFT.mutations_ids.splice(idx, 1);
      } else {
        // Sélectionner en respectant la règle : 2 basiques OU 1 avancée
        const selAvancees = DRAFT.mutations_ids.filter(id => avancees.some(m => m.id === id));
        const selBasiques = DRAFT.mutations_ids.filter(id => basiques.some(m => m.id === id));
        if (isBasique && selAvancees.length === 0 && selBasiques.length < 2) {
          DRAFT.mutations_ids.push(mid);
        } else if (!isBasique && selBasiques.length === 0 && selAvancees.length === 0) {
          DRAFT.mutations_ids.push(mid);
        }
      }
      document.getElementById('wizard-step').innerHTML = renderStepMutations();
      attachStepListeners();
    });
  });

  // Finitions
  const finNom = step.querySelector('#fin-nom');
  if (finNom) {
    finNom.addEventListener('input', () => { DRAFT.nom_personnage = finNom.value; });
    step.querySelector('#fin-age')?.addEventListener('input', e => { DRAFT.age = e.target.value; });
    step.querySelector('#fin-desc')?.addEventListener('input', e => { DRAFT.description = e.target.value; });

    // Genre
    step.querySelectorAll('.genre-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        DRAFT.genre = btn.dataset.genre;
        step.querySelectorAll('.genre-btn').forEach(b => {
          const active = b.dataset.genre === DRAFT.genre;
          b.className = b.className
            .replace(/bg-\S+|border-\S+|text-\S+/g, '')
            .trim();
          b.classList.add(
            ...(active
              ? ['bg-blue-700','border-blue-500','text-white']
              : ['bg-gray-800','border-gray-600','text-gray-400','hover:border-gray-400'])
          );
        });
      });
    });

    // Bouton génération de nom aléatoire
    step.querySelector('#btn-gen-name')?.addEventListener('click', () => {
      const generated = generateRandomName();
      if (generated) {
        finNom.value = generated;
        DRAFT.nom_personnage = generated;
      }
    });

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
  }

  // PNJ: niveau
  step.querySelectorAll('[data-niveau]').forEach(btn => {
    btn.addEventListener('click', () => {
      DRAFT.pnj_niveau = btn.dataset.niveau;
      document.getElementById('wizard-step').innerHTML = renderStepPNJType();
      attachStepListeners();
    });
  });
  step.querySelector('#btn-rand-pnj-type')?.addEventListener('click', () => {
    const niveaux = REF?.pnj_niveaux || [];
    if (!niveaux.length) return;
    DRAFT.pnj_niveau = niveaux[Math.floor(Math.random() * niveaux.length)].id;
    document.getElementById('wizard-step').innerHTML = renderStepPNJType();
    attachStepListeners();
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
  step.querySelector('#btn-rand-pnj-profil')?.addEventListener('click', () => {
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    DRAFT.pnj_is_pirate = Math.random() < 0.5;
    DRAFT.pnj_is_named  = Math.random() < 0.5;
    if (DRAFT.pnj_is_pirate) {
      DRAFT.domaines_libres = [];
      if (DRAFT.pnj_is_named) {
        const motivations = REF?.motivations || [];
        const archetypes  = REF?.archetypes  || [];
        if (motivations.length) DRAFT.motivation_id = shuffle(motivations)[0].id;
        if (archetypes.length)  DRAFT.archetype_id  = shuffle(archetypes)[0].id;
      } else {
        DRAFT.motivation_id = null;
        DRAFT.archetype_id  = null;
      }
    } else {
      DRAFT.motivation_id = null;
      DRAFT.archetype_id  = null;
      const domaines = REF?.domaines || [];
      DRAFT.domaines_libres = shuffle(domaines).slice(0, 3).map(d => d.id);
    }
    document.getElementById('wizard-step').innerHTML = renderStepPNJProfil();
    attachStepListeners();
  });

  // PNJ: attributs
  step.querySelectorAll('.attr-pnj-select').forEach(sel => {
    sel.addEventListener('change', () => {
      DRAFT.attributs_pnj[sel.dataset.pnjAttr] = sel.value ? parseInt(sel.value) : null;
      document.getElementById('wizard-step').innerHTML = renderStepPNJAttributs();
      attachStepListeners();
    });
  });
  step.querySelector('#btn-rand-pnj-attrs')?.addEventListener('click', () => {
    const level = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
    const shuffled = [...(level?.caracteristiques || [3,2,2,2,2,1])].sort(() => Math.random() - 0.5);
    const attrs = REF?.attributs || [];
    attrs.forEach((a, i) => { DRAFT.attributs_pnj[a.id] = shuffled[i]; });
    document.getElementById('wizard-step').innerHTML = renderStepPNJAttributs();
    attachStepListeners();
  });
  step.querySelector('#btn-rand-pnj-comps')?.addEventListener('click', () => {
    DRAFT.competences_pnj = {};
    const level = REF?.pnj_niveaux?.find(n => n.id === DRAFT.pnj_niveau);
    const pool = [...(level?.competences_pool || [])].sort((a, b) => b - a);
    const comps = [...(REF?.competences || []).filter(c => !/\(au choix/i.test(c.name))].sort(() => Math.random() - 0.5);
    pool.forEach((val, i) => { if (comps[i]) DRAFT.competences_pnj[comps[i].name] = val; });
    document.getElementById('wizard-step').innerHTML = renderStepPNJCompetences();
    attachStepListeners();
  });

  // PNJ: compétences — sélects pool
  step.querySelectorAll('.sk-pnj-libre').forEach(sel => {
    sel.addEventListener('change', () => {
      const sk  = sel.dataset.pnjSk;
      const val = parseInt(sel.value);
      if (val === 0) delete DRAFT.competences_pnj[sk];
      else           DRAFT.competences_pnj[sk] = val;
      document.getElementById('wizard-step').innerHTML = renderStepPNJCompetences();
      attachStepListeners();
    });
  });
}

function attachOrigineChoixListeners(step) {
  const refreshDetail = () => {
    const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
    const det = document.getElementById('origine-detail');
    if (det && orig) det.innerHTML = renderOrigineDetail(orig);
  };
  // Selects typés (Environnement, Pilotage…)
  step.querySelectorAll('.orig-choix-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      DRAFT.origine_choix[sel.dataset.choix] = sel.value;
      refreshDetail();
      // Re-render l'étape compétences si déjà passée (bonus à jour)
      const wsHTML = document.getElementById('wizard-step');
      if (wsHTML && step.querySelector('.sk-libre')) {
        wsHTML.innerHTML = renderStepCompetences();
        attachStepListeners();
      }
    });
  });
  // Inputs texte libres (Artisanat, Connaissance…)
  step.querySelectorAll('.orig-choix-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      DRAFT.origine_choix[inp.dataset.choix] = inp.value;
      refreshDetail();
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

  // Crédits de départ : archtype + avantages Riche et Trésor
  const arch4credits  = REF?.archetypes?.find(a => a.id === DRAFT.archetype_id);
  const archCreditsMatch = (arch4credits?.equipement_depart || '').match(/—\s*(\d+)\s*₡/);
  const archCredits   = archCreditsMatch ? parseInt(archCreditsMatch[1]) : 0;
  const niveauxC      = DRAFT.traits_niveaux || {};
  const richeBonus    = DRAFT.qualites_ids.includes('qualite-riche')  ? (niveauxC['qualite-riche']  || 0) * 250 : 0;
  const tresorBonus   = DRAFT.qualites_ids.includes('qualite-tresor') ? (niveauxC['qualite-tresor'] || 0) * 250 : 0;
  const startingCredits = archCredits + richeBonus + tresorBonus;

  const payload = {
    type: DRAFT.type,
    name: DRAFT.nom_personnage,
    data: {
      ...DRAFT,
      panache:   3,
      gloire:    0,
      sante:     (finalAttrs.carrure || 0) + (finalAttrs.sang_froid || 0),
      energie_x: DRAFT.is_mutant ? (finalAttrs.perception || 0) + (finalAttrs.intelligence || 0) : null,
      credits:   EDITING_ID ? (DRAFT.credits ?? 0) : startingCredits,
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
      const key = resolveOrigineComp(bc, DRAFT.origine_choix);
      if (!key) continue;
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
  const orig  = REF?.origines?.find(o => o.id === d.origine_id);
  const motiv = REF?.motivations?.find(m => m.id === d.motivation_id);

  const ensure = (key, spec) => {
    if (!map[key]) map[key] = { bonus: 0, archetype: 0, libre: 0, total: 0, specialite: spec || null };
  };

  // Bonus origine
  if (orig) {
    for (const bc of orig.bonus_competences || []) {
      const key = resolveOrigineComp(bc, d.origine_choix);
      if (!key) continue;
      // specialite = vraie spécialisation seulement pour les compétences non-(Au choix)
      const spec = /\(au choix/i.test(bc.competence) ? null : bc.specialite;
      ensure(key, spec);
      map[key].bonus += bc.valeur;
    }
  }
  // Bonus motivation
  if (motiv) {
    for (const bc of motiv.bonus_competences || []) {
      ensure(bc.competence, null);
      map[bc.competence].bonus += bc.valeur;
    }
  }
  // Archétype +1 starting competences (PJ uniquement)
  const arch = d.type !== 'pnj'
    ? REF?.archetypes?.find(a => a.id === d.archetype_id)
    : null;
  if (arch) {
    for (const sk of arch.competences_archetype || []) {
      let finalSk = sk;
      if (sk.includes('(Au choix)')) {
        const chosen = (d.competences_archetype_choix || {})[sk];
        if (!chosen) continue;
        const base  = sk.split('(')[0].trim();
        const match = (REF?.competences || []).find(c =>
          c.name.toLowerCase().startsWith(base.toLowerCase()) &&
          c.name.toLowerCase().includes(chosen.toLowerCase())
        );
        finalSk = match ? match.name : `${base} (${chosen})`;
      }
      ensure(finalSk, null);
      map[finalSk].archetype += 1;
    }
  }
  // Points libres PJ
  for (const [sk, v] of Object.entries(d.competences_libres || {})) {
    ensure(sk, null);
    map[sk].libre = v;
  }
  // Points directs PNJ
  for (const [sk, v] of Object.entries(d.competences_pnj || {})) {
    ensure(sk, null);
    map[sk].libre = v;
  }
  // Points achetés avec XP
  for (const [sk, v] of Object.entries(d.competences_xp || {})) {
    ensure(sk, null);
    map[sk].libre = (map[sk].libre || 0) + v;
  }
  // Spécialités achetées avec XP (remplacent les spécialités d'origine si présentes)
  for (const [sk, spec] of Object.entries(d.specialites_xp || {})) {
    if (map[sk]) map[sk].specialite = spec;
    else { ensure(sk, spec); }
  }
  // Bonus Entraînement (avantage)
  for (const [sk, v] of Object.entries(d.entrainement_bonus || {})) {
    ensure(sk, null);
    map[sk].entrainement = (map[sk].entrainement || 0) + v;
  }
  // Totaux
  for (const v of Object.values(map)) { v.total = v.bonus + v.archetype + v.libre + (v.entrainement || 0); }
  return map;
}

// Expose showListView et editChar globalement pour les handlers inline
window.showListView = showListView;
window.editChar = editChar;

// ── Banque de noms par nation ─────────────────────────────────────────────────
const NAME_POOLS = {
  'Empire de Sol': {
    m: ['Alcemides','Almarus','Altaro','Aratus','Arus','Balthus','Broca','Constantius','Demetrio','Drago','Emilius','Galannus','Ivanos','Nabonidus','Namedides','Orastes','Otho','Pallantides','Pelias','Promero','Prospero','Rinaldo','Thespides','Thespius','Theteles','Tiberias','Valannus','Valerus'],
    f: ['Diane','Dorea','Kucia','Lissa','Muriela','Natala','Octavia','Olivia','Petra','Taramis','Tina','Valeria','Vateesa','Zelata','Znobia'],
    n: ['Aluredes','Anthys','Arcand','Arius','Arvina','Assimof','Badrigio','Bazin','Bellator','Bralazzi','Brascio','Buccio','Carantus','Cato','Chalerio','Cyricus','Dardanus','Dolabella','Donaes','Dorass','Dormio','Dyvarc','Elyse','Fadus','Gervaes','Geta','Gracilis','Hölm','Lamsyn','Larraga','Libo','Litumaris','Lyber','Mancrio','Muco','Naud','Perennis','Rampal','Rimbaldi','Segestes','Sorel','Tadiri','Torys','Tranio','Vala','Vespillo','Vettese','Watz','Weyne','Wolta','Wythsten'],
    prefix: ['de ','de ','von ',''],  // 4 options : 50% "de", 25% "von", 25% sans
  },
  'OCG': {
    m: ['Alan','Alex','Barry','Ben','Bob','Brad','Brian','Clarence','Clyde','Colin','Craig','Dan','Dennis','Doug','Ed','Fred','Gary','Greg','Hal','Harry','Hugh','Ian','Jay','Jeff','Jim','Jo','John','Kevin','Kyle','Luke','Matt','Neil','Pete','Oliver','Ray','Ricky','Rob','Ron','Scott','Terry','Tim','Todd','Tom','Troy','William'],
    f: ['Amanda','April','Betty','Bridget','Carol','Chloe','Courtney','Dana','Darlene','Denise','Donna','Emma','Eva','Gloria','Jen','Joyce','Kara','Kate','Laura','Leslie','Lisa','Lynn','Mary','Meg','Nancy','Pam','Rachel','Sam','Sarah','Shanen','Shelly','Tina','Tracy','Vicky'],
    n: ['Adams','Anderson','Barnett','Brady','Caldwell','Carter','Clayton','Cummings','Davies','Dillon','Farmer','Fisher','Frazer','Gibson','Hines','Hobbs','Jones','Larson','Milford','Morton','Murphy','Owens','Paige','Phillips','Spencer','Watson'],
  },
  'Empire Galactique': {
    m: ['Arkes','Asidor','Drastos','Erestes','Farros','Generk','Haron','Kayron','Korban','Korlon','Kron','Larius','Melander','Naystus','Partos','Rasteus','Rex','Sark','Tarus','Terebus','Tyram','Vayneros','Vemas'],
    f: ['Adernia','Alteyria','Anora','Argea','Arkeyla','Celiste','Ceryma','Daraness','Dorima','Eclea','Erydine','Karylee','Kassia','Keryl','Kora','Miarra','Nertys','Nysis','Tarlia','Tarnae'],
    n: ['Ardenys','Berkol','Bayrtenis','Darkos','Dayros','Ganera','Kerydion','Keyrtin','Malendre','Noretyn','Raktar','Starkos','Tallidora','Torcas'],
  },
  'Ligue des Planètes Libres': {
    m: ['Amra','Chakotay','Gitara','Hyam','Khemsa','Kintan','Naeem','Noam','Sakumbe','Shan','Shukeli','Subba','Tabari','Tuli','Yadon','Yasunga'],
    f: ['Amadika','Amaka','Bakula','Chandi','Idra','Indira','Jamila','Latifa','Nyasha','Rajni','Tananda','Tapanga','Thula','Yael','Yasmina','Yelaya'],
    n: ['Assireni','Bakari','Chinaka','Kanefer','Kashka','Mongo','Nefertari','Shomari','Taharqa'],
  },
  'Barrens': {
    m: ['Ahmad','Akando','Akkutho','Assad','Derk','Gorm','Joka','Kalantes','Kevas','Korman','Vanko','Zogar'],
    f: ['Anichka','Kara','Luba','Orenda','Oxana','Salome','Samirah','Yasmela'],
    n: [],
  },
  'Havana': {
    m: ['Adolfo','Alberto','Alexandro','Alfonzo','Andres','Antonio','Armando','Arturo','Augusto','Benito','Carlos','Cecelio','Diego','Domingo','Eduardo','Enrique','Eusebio','Filippe','Francesco','Gabriel','Georgio','Guilermo','Javier','Juan','Julio','Luis','Manuel','Nestor','Oscar','Pancho','Pedro','Pepe','Rafael','Ramiro','Ramon','Raul','Ricardo','Roberto','Rodolfo','Rodrigo','Rossi','Salvador','Sergio','Thomas','Tito'],
    f: ['Adrianna','Alexandra','Andrea','Anita','Bariela','Carmen','Clara','Claudia','Consuela','Delores','Eva','Francesca','Isabella','Josephina','Juanita','Julietta','Laura','Linda','Luisa','Maria','Marisa','Miranda','Nina','Ramona','Theresa','Yolanda'],
    n: ['Acosta','Aguayo','Alverez','Aranda','Argones','Arruza','Avilés','Baro','Basoalto','Batista','Gorges','Clemente','Colon','Colonnato','Corado','Costello','Deleon','Delgado','Diaz','Donada','Espinosa','Fabila','Falcon','Fernandez','Flores','Fuentes','Gallardo','Garcia','Garza','Gomez','Gonzalez','Guardia','Guzman','Gutiérrez','Hernandez','Ibanez','Lopez','Lorca','Mano','Marquez','Martinez','Mendoza','Menendez','Montana','Montoya','Moreno','Ortega','Patrone','Pas','Pena','Perales','Perez','Ramez','Ramirez','Ramos','Ricardo','Rodriguez','Ruiz','Salinas','Sanchez','Santiago','Silvio','Terrones','Toll','Torres','Vazquez','Valdez','Vargas','Verona','Villareal'],
  },
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateRandomName() {
  const orig = REF?.origines?.find(o => o.id === DRAFT.origine_id);
  const nation = orig?.nation ?? null;

  // Daemon : pas de génération
  if (nation === 'Daemon') return null;

  const genre = DRAFT.genre || 'homme';
  let pool;

  if (nation === 'Enfants maudits') {
    // Fusionner toutes les nations
    const allM = Object.values(NAME_POOLS).flatMap(p => p.m);
    const allF = Object.values(NAME_POOLS).flatMap(p => p.f);
    const allN = Object.values(NAME_POOLS).flatMap(p => p.n);
    pool = { m: allM, f: allF, n: allN };
  } else {
    pool = NAME_POOLS[nation] ?? null;
  }

  if (!pool) return null;

  const firstNames = genre === 'homme' ? pool.m : genre === 'femme' ? pool.f : [...pool.m, ...pool.f];
  if (!firstNames.length) return null;

  const prenom = pick(firstNames);
  let nom = pool.n?.length ? pick(pool.n) : '';

  // Préfixe particule pour Empire de Sol
  if (nation === 'Empire de Sol' && nom && pool.prefix) {
    nom = pick(pool.prefix) + nom;
  }

  return nom ? `${prenom} ${nom.trimStart()}` : prenom;
}
