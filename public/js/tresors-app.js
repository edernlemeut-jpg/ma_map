/**
 * tresors-app.js — Chasses au Trésor (supplément TdM)
 * Générateur aléatoire + gestionnaire de chasses
 */

import { initHeader } from '/js/shared/header.js';
import { getActiveTableId, fetchWithTable, isMJ } from '/js/shared/table-selector.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TABLES DE GÉNÉRATION ALÉATOIRE (données du supplément)
// ═══════════════════════════════════════════════════════════════════════════════

// 1d6 → Origine (carte & trésor)
const T_ORIGINE = [
  null,
  { label: 'Alien',      langue: 'Alien',       std_diff: 5 },
  { label: 'Découverte', langue: 'Stellaire',   std_diff: 5 },
  { label: 'Conquête',   langue: 'Stellaire',   std_diff: 3 },
  { label: 'Conquête',   langue: 'Stellaire',   std_diff: 3 },
  { label: 'Métal',      langue: 'Stellaire AdM', std_diff: 1 },
  { label: 'Stellaire',  langue: 'Galactique',  std_diff: 1 },
];

// 2d6 → Forme de la carte (range 2-12)
const T_FORME = {
  2:  { label: 'Tatouage',          solidite: '-',       pds: '0',   diff_fouille: 0 },
  3:  { label: 'Peinture',          solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  4:  { label: 'Module-mémoire',    solidite: 'Solide',  pds: '0-3', diff_fouille: 3 },
  5:  { label: 'Module-mémoire',    solidite: 'Solide',  pds: '0-3', diff_fouille: 3 },
  6:  { label: 'Parchemin',         solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  7:  { label: 'Parchemin',         solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  8:  { label: 'Parchemin',         solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  9:  { label: 'Ordinateur',        solidite: 'Solide',  pds: '0-5', diff_fouille: 1 },
  10: { label: 'Ordinateur',        solidite: 'Solide',  pds: '0-5', diff_fouille: 1 },
  11: { label: 'Objet enchanté',    solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
  12: { label: 'Talisman enchanté', solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
};

// 2d6 → Fonction + présentation (range 2-12)
const T_FONCTION = {
  2:  { label: 'Journal intime',          type: 'indirecte', exploit_diff: 3 },
  3:  { label: 'Manifeste de chargement', type: 'indirecte', exploit_diff: 1 },
  4:  { label: 'Journal de bord',         type: 'indirecte', exploit_diff: 1 },
  5:  { label: 'Journal de bord',         type: 'indirecte', exploit_diff: 1 },
  6:  { label: 'Carte au trésor',         type: 'directe',   exploit_diff: 1 },
  7:  { label: 'Carte au trésor',         type: 'directe',   exploit_diff: 1 },
  8:  { label: 'Carte au trésor',         type: 'directe',   exploit_diff: 1 },
  9:  { label: 'News',                    type: 'indirecte', exploit_diff: 3 },
  10: { label: 'News',                    type: 'indirecte', exploit_diff: 3 },
  11: { label: 'Rapport de colonisation', type: 'indirecte', exploit_diff: 5 },
  12: { label: 'Textes sacrés',           type: 'indirecte', exploit_diff: 8 },
};

// 2d6 → Localisation (rang 2-12, table du supplément)
const T_LOCALISATION = {
  2:  { label: 'Hétios',             ref: 'R&P p.91' },
  3:  { label: 'Tarus',              ref: 'B&B p.107' },
  4:  { label: 'Itoyo',              ref: 'S&l p.99' },
  5:  { label: 'Hyma',               ref: 'S&l p.101' },
  6:  { label: 'Système Talanndar',  ref: 'p.170' },
  7:  { label: 'Système Shalifar',   ref: 'C&D p.93' },
  8:  { label: 'Système Bazaar',     ref: 'C&D p.90' },
  9:  { label: 'Kyers',              ref: 'F&S p.110' },
  10: { label: 'Exxatia',            ref: 'P&P p.91' },
  11: { label: 'Palace',             ref: 'P&P p.93' },
  12: { label: 'Hyperespace',        ref: 'station alien *' },
};

// Valeur en crédits selon PX (table p.49)
const T_VALEUR = [
  { label: '<5 000 PX',        px_max: 5000,   cred_min: 10000,     cred_max: 25000 },
  { label: '5 000–10 000 PX',  px_max: 10000,  cred_min: 50000,     cred_max: 75000 },
  { label: '10 000–15 000 PX', px_max: 15000,  cred_min: 100000,    cred_max: 150000 },
  { label: '15 000–25 000 PX', px_max: 25000,  cred_min: 200000,    cred_max: 500000 },
  { label: '25 000–35 000 PX', px_max: 35000,  cred_min: 1000000,   cred_max: 2500000 },
  { label: '35 000–50 000 PX', px_max: 50000,  cred_min: 5000000,   cred_max: 25000000 },
  { label: '50 000+ PX',       px_max: Infinity, cred_min: 50000000, cred_max: 250000000 },
];

// 1d6 → Célébrité trésor & Gloire
const T_CELEBRITE = [
  null,
  { label: 'Commun',          gloire: 0 },
  { label: 'Commun',          gloire: 0 },
  { label: 'Commun',          gloire: 0 },
  { label: 'Célèbre',         gloire: 3 },
  { label: 'Très célèbre',    gloire: 5 },
  { label: 'Légendaire',      gloire: 8 },
];

// 2d6 → Traits particuliers du trésor
const T_TRAITS_TRESOR = {
  2:  'Désiré',
  3:  'Exaltant',
  4:  'Hanté',
  5:  'Initiatique',
  10: 'Prestigieux',
  11: 'Radioactif',
  12: 'Recherché',
};

// 1d6 → Origine antre
const T_ORIGINE_ANTRE = [
  null,
  { label: 'Alien',                tech: 'Alien' },
  { label: 'Âge des Découvertes',  tech: 'AdD' },
  { label: 'Âge des Conquêtes',    tech: 'AdC' },
  { label: 'Âge des Conquêtes',    tech: 'AdC' },
  { label: 'Âge de Métal',         tech: 'AdM' },
  { label: 'Âge Stellaire',        tech: 'AdS' },
];

// 1d6 → Nature de l'antre
const T_NATURE_ANTRE = [
  null,
  'Base militaire',
  'Avant-poste',
  'Temple / Sanctuaire',
  'Laboratoire',
  'Station spatiale / Épave',
  'Habitation fortifiée',
];

// 1d6 → Taille
const T_TAILLE = [
  null,
  { label: 'Petite',      desc: '<100 m', deplacement: '1 tour' },
  { label: 'Petite',      desc: '<100 m', deplacement: '1 tour' },
  { label: 'Moyenne',     desc: '<1 km',  deplacement: '5 mn' },
  { label: 'Moyenne',     desc: '<1 km',  deplacement: '5 mn' },
  { label: 'Grande',      desc: 'quelques km', deplacement: '1 h' },
  { label: 'Gigantesque', desc: '>10 km', deplacement: '1 j' },
];

// 1d6 → Énergie
const T_ENERGIE = [
  null,
  { label: 'Inactive',    lumino: 'Obscurité totale', systemes: 'aucun système' },
  { label: 'Réduite',     lumino: 'Pénombre',         systemes: 'pièges limités' },
  { label: 'Réduite',     lumino: 'Pénombre',         systemes: 'pièges limités' },
  { label: 'Normale',     lumino: 'Standard',         systemes: 'pièges actifs' },
  { label: 'Normale',     lumino: 'Standard',         systemes: 'pièges actifs' },
  { label: 'Surchargée',  lumino: 'Intense',          systemes: 'pièges renforcés' },
];

// 1d6 → Occupation
const T_OCCUPATION = [
  null,
  { label: 'Désert',               desc: 'pièges uniquement' },
  { label: 'Désert',               desc: 'pièges uniquement' },
  { label: 'Désert',               desc: 'pièges uniquement' },
  { label: 'Partiellement occupé', desc: 'quelques gardiens' },
  { label: 'Partiellement occupé', desc: 'quelques gardiens' },
  { label: 'Occupé',               desc: 'nombreux gardiens' },
];

// 1d6 → Usure
const T_USURE = [
  null,
  { label: 'Intact',       desc: 'tous systèmes fonctionnels' },
  { label: 'Intact',       desc: 'tous systèmes fonctionnels' },
  { label: 'Endommagé',    desc: 'quelques pannes' },
  { label: 'Endommagé',    desc: 'quelques pannes' },
  { label: 'Délabré',      desc: 'sections instables' },
  { label: 'Délabré',      desc: 'sections instables' },
];

// Stats des portes/sas selon époque (p.53)
const T_PORTES = {
  Alien: { porte: { prot: 2 }, porte_fort: { prot: 3 }, sas: { prot: 5 } },
  AdD:   { porte: { prot: 1 }, porte_fort: { prot: 2 }, sas: { prot: 3 } },
  AdC:   { porte: { prot: 2 }, porte_fort: { prot: 3 }, sas: { prot: 3 } },
  AdM:   { porte: { prot: 1 }, porte_fort: { prot: 2 }, sas: { prot: 2 } },
  AdS:   { porte: { prot: 1 }, porte_fort: { prot: 2 }, sas: { prot: 2 } },
};

// Table équilibrage (p.61): danger selon PX
// index 0 = <5k PX ... index 6 = 50k+ PX
const T_EQUILIBRAGE = [
  { label: '<5 000 PX',        pieges: '1×NO',   adversaires: '—',               salle: 'HE ou EL+3×NO',  concurrent: '—' },
  { label: '5–10 000 PX',      pieges: '3×NO',   adversaires: '3×NO',            salle: 'HE+6×NO',        concurrent: 'HE+6×NO' },
  { label: '10–15 000 PX',     pieges: '6×NO',   adversaires: '6×NO+BO',         salle: 'HE+6×NO',        concurrent: 'HE+6×NO' },
  { label: '15–25 000 PX',     pieges: '3×EL',   adversaires: '3×EL+BO+3×NO',   salle: 'BO',             concurrent: 'BO' },
  { label: '25–35 000 PX',     pieges: '6×EL',   adversaires: '6×EL+BO+3×EL',   salle: 'BO+3×EL',        concurrent: 'BO+3×EL' },
  { label: '35–50 000 PX',     pieges: '3×HE',   adversaires: '3×HE+BB',         salle: 'BB',             concurrent: 'BB' },
  { label: '50 000+ PX',       pieges: '6×HE',   adversaires: '6×HE+BB+3×EL',   salle: 'BB+3×EL',        concurrent: 'BB+3×EL' },
];

// Retours de flamme TdM spécifiques
const RETOURS_TDM = [
  {
    id: 'tdm_carte_perdue',
    nom: 'La carte perdue',
    cout_base: 25,
    cout_fixe: true,
    description: 'La carte au trésor est égarée, volée par un membre de l\'équipage ou par un concurrent.',
    modificateurs: [],
  },
  {
    id: 'tdm_tresor_a_moi',
    nom: 'Ce trésor est à moi !',
    cout_base: 35,
    cout_fixe: false,
    description: 'Les PJ sont attaqués par un chasseur de trésor concurrent.',
    modificateurs: [
      { label: 'Gloire du trésor ≥ 7',        delta: -10, type: 'checkbox' },
      { label: 'Chasseur présent dans l\'aventure', delta: -5, type: 'checkbox' },
      { label: 'PJ recherchés (Wanted)',         delta: -5, type: 'checkbox' },
      { label: 'PJ ont fait Fierté pirate',      delta: -10, type: 'checkbox' },
      { label: 'Trésor Recherché (trait)',        delta: +5, type: 'checkbox' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAT DE L'APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

let chasses    = [];
let currentId  = null;   // chasse sélectionnée
let viewMode   = 'view'; // 'view' | 'wizard'
let wizardStep = 0;      // 0=infos  1=carte  2=trésor  3=antre+récap
let wizardBuf  = null;   // { _editId, nom, difficulte, nb_seances, statut, notes, carte, tresor, antre }
let mfPool     = { pj_pool: 50, mj_pool: 0 };

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
function roll2d6()   { return roll(6) + roll(6); }
function pick1d6(table) { return table[roll(6)]; }

function formatCredits(n) {
  if (n >= 1000000) return `${(n / 1000000).toLocaleString('fr')} M₵`;
  if (n >= 1000)    return `${(n / 1000).toLocaleString('fr')} k₵`;
  return `${n.toLocaleString('fr')} ₵`;
}

function statutBadge(s) {
  const map = {
    en_cours:   '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-900/50 text-amber-300">En cours</span>',
    terminee:   '<span class="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-300">Terminée</span>',
    abandonnee: '<span class="px-2 py-0.5 text-xs rounded-full bg-red-900/50 text-red-300">Abandonnée</span>',
  };
  return map[s] || s;
}

// Retourne l'index d'équilibrage à partir du PX max du trésor
function equilibrageIndex(px_max) {
  if (!px_max || px_max <= 0) return 0;
  if (px_max <= 5000)  return 0;
  if (px_max <= 10000) return 1;
  if (px_max <= 15000) return 2;
  if (px_max <= 25000) return 3;
  if (px_max <= 35000) return 4;
  if (px_max <= 50000) return 5;
  return 6;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GÉNÉRATION ALÉATOIRE
// ═══════════════════════════════════════════════════════════════════════════════

function generateCarte() {
  const orig = pick1d6(T_ORIGINE);
  const forme = T_FORME[roll2d6()];
  const fonc = T_FONCTION[roll2d6()];
  const localRoll = roll2d6();
  const local = T_LOCALISATION[localRoll] || T_LOCALISATION[2];

  // Présentation aléatoire selon fonc type
  const presentOptions = fonc.type === 'directe'
    ? [
        { label: '1 page rédigée proprement', diff: 1 },
        { label: 'Dispersée sur plusieurs sources', diff: 3 },
        { label: 'Dispersée sur plusieurs sources, chaotique', diff: 5 },
      ]
    : [
        { label: 'Sources multiples chaotiques (indirecte)', diff: 8 },
        { label: 'Journal intime d\'un chasseur (indirecte)', diff: 10 },
      ];
  const present = presentOptions[roll(presentOptions.length) - 1];

  return {
    origine:             orig.label,
    langue:              orig.langue,
    forme:               forme.label,
    forme_solidite:      forme.solidite,
    forme_pds:           forme.pds,
    forme_diff_fouille:  forme.diff_fouille,
    fonction:            fonc.label,
    fonction_type:       fonc.type,
    fonction_diff_exploit: fonc.exploit_diff,
    standard_diff:       orig.std_diff,
    presentation:        present.label,
    presentation_diff:   present.diff,
    localisation:        local.label,
    localisation_ref:    local.ref,
    systeme_id:          null,
  };
}

function generateTresor() {
  const origRoll = roll(6);
  const orig = T_ORIGINE[origRoll];
  const valIdx = roll(7) - 1; // 0-6
  const val = T_VALEUR[valIdx];
  const celRoll = roll(6);
  const cel = T_CELEBRITE[celRoll];

  // Traits (2d6, 6-9 = aucun trait)
  const traitRoll = roll2d6();
  const trait = T_TRAITS_TRESOR[traitRoll] || null;

  // Valeur PX aléatoire dans la fourchette
  let px_range;
  if (valIdx === 0) px_range = [0, 5000];
  else if (valIdx === 1) px_range = [5000, 10000];
  else if (valIdx === 2) px_range = [10000, 15000];
  else if (valIdx === 3) px_range = [15000, 25000];
  else if (valIdx === 4) px_range = [25000, 35000];
  else if (valIdx === 5) px_range = [35000, 50000];
  else px_range = [50000, 100000];

  const px_max = px_range[1];

  return {
    origine:       orig.label,
    valeur_label:  val.label,
    px_max,
    credits_min:   val.cred_min,
    credits_max:   val.cred_max,
    celebrite:     cel.label,
    gloire:        cel.gloire,
    traits:        trait ? [trait] : [],
    proprietaire:  '',
    secret:        '',
    contenu:       '',
  };
}

function generateAntre(origLabel) {
  const origRoll = roll(6);
  const orig = T_ORIGINE_ANTRE[origRoll];
  const nature = T_NATURE_ANTRE[roll(6)];
  const taille = pick1d6(T_TAILLE);
  const energie = pick1d6(T_ENERGIE);
  const occupation = pick1d6(T_OCCUPATION);
  const usure = pick1d6(T_USURE);
  const porteStats = T_PORTES[orig.tech] || T_PORTES.AdC;
  const nb_niveaux = roll(4);
  // Salle spéciale aléatoire (optionnel)
  const sallesOpts = ['Armurerie', 'Entrepôt', 'Hangar', 'Labyrinthe', 'Section instable'];
  const salles = [];
  if (roll(6) >= 5) salles.push(sallesOpts[roll(sallesOpts.length) - 1]);

  return {
    origine:         orig.label,
    tech:            orig.tech,
    nature,
    nb_niveaux,
    taille:          taille.label,
    taille_desc:     taille.desc,
    deplacement:     taille.deplacement,
    energie:         energie.label,
    energie_lumino:  energie.lumino,
    energie_systemes: energie.systemes,
    occupation:      occupation.label,
    occupation_desc: occupation.desc,
    usure:           usure.label,
    usure_desc:      usure.desc,
    salles_speciales: salles,
    porte_protect:   porteStats.porte.prot,
    porte_fort_protect: porteStats.porte_fort.prot,
    sas_protect:     porteStats.sas.prot,
    traits:          [],
    notes:           '',
  };
}

function generateAll() {
  const carte  = generateCarte();
  const tresor = generateTresor();
  const antre  = generateAntre(tresor.origine);
  return { carte, tresor, antre };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════════════════════

async function apiList() {
  const r = await fetchWithTable('/api/chasses-tresor');
  if (!r.ok) return [];
  const d = await r.json();
  return d.data || [];
}

async function apiCreate(payload) {
  const r = await fetchWithTable('/api/chasses-tresor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Erreur création');
  return d.data;
}

async function apiUpdate(id, payload) {
  const r = await fetchWithTable(`/api/chasses-tresor/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Erreur mise à jour');
  return d.data;
}

async function apiDelete(id) {
  const r = await fetchWithTable(`/api/chasses-tresor/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Erreur suppression');
}

async function fetchMFPool() {
  try {
    const r = await fetchWithTable('/api/mf-pool');
    if (!r.ok) return;
    const d = await r.json();
    mfPool = d.data || mfPool;
  } catch { /* ignore */ }
}

async function doMFTransfer(delta, direction) {
  const r = await fetchWithTable('/api/mf-pool/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta, direction }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Erreur transfert MF');
  mfPool = d.data;
  renderMFPoolBar();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER — LISTE
// ═══════════════════════════════════════════════════════════════════════════════

function renderList() {
  const container = document.getElementById('chasse-list');
  if (!container) return;

  if (!chasses.length) {
    container.innerHTML = `<p class="text-gray-500 text-sm text-center py-8">Aucune chasse au trésor.<br>Créez-en une avec le bouton +</p>`;
    return;
  }

  container.innerHTML = chasses.map(c => {
    const isActive = c.id === currentId;
    const px = c.tresor?.px_max;
    const pxLabel = px ? `${px.toLocaleString('fr')} PX` : '';
    return `
      <div class="chasse-card p-3 rounded-lg cursor-pointer border ${isActive ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'} transition-colors"
           data-id="${c.id}" onclick="selectChasse('${c.id}')">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm truncate">${c.nom}</p>
            <p class="text-xs text-gray-400 mt-0.5">${c.carte?.localisation || 'Localisation inconnue'}${pxLabel ? ` · ${pxLabel}` : ''}</p>
          </div>
          ${statutBadge(c.statut)}
        </div>
        ${c.tresor?.gloire > 0 ? `<p class="text-xs text-amber-400 mt-1">⭐ ${c.tresor.gloire > 0 ? `Gloire ${c.tresor.gloire}` : ''} ${c.tresor.celebrite || ''}</p>` : ''}
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER — PANNEAU DROIT
// ═══════════════════════════════════════════════════════════════════════════════

function field(label, value, sub) {
  if (!value && value !== 0) return '';
  return `<div class="mb-3">
    <dt class="text-xs text-gray-400 uppercase tracking-wide">${label}</dt>
    <dd class="text-sm text-gray-100 mt-0.5">${value}${sub ? `<span class="text-gray-400 ml-1">${sub}</span>` : ''}</dd>
  </div>`;
}

function renderRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel) return;

  if (viewMode === 'wizard' && wizardBuf) {
    document.body.classList.add('detail-open');
    renderWizard();
    return;
  }

  if (!currentId) {
    document.body.classList.remove('detail-open');
    panel.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-500 gap-4 py-20">
        <span class="text-5xl">🗺️</span>
        <p class="text-center">Sélectionnez une chasse dans la liste<br>ou créez-en une nouvelle.</p>
        ${isMJ() ? `<button onclick="startWizard(null)" class="btn-primary px-4 py-2 rounded-lg text-sm">+ Nouvelle chasse</button>` : ''}
      </div>`;
    return;
  }

  const c = chasses.find(x => x.id === currentId);
  if (!c) return;
  renderView(c);
}

// ── Vue fiche (mode consultation) ────────────────────────────────────────────
function renderView(c) {
  const panel = document.getElementById('right-panel');
  if (!panel) return;

  const cr = c.carte  || {};
  const tr = c.tresor || {};
  const an = c.antre  || {};
  const hasCarte  = Object.keys(cr).some(k => cr[k]);
  const hasTresor = !!tr.valeur_label;
  const hasAntre  = !!an.origine;
  const idx = equilibrageIndex(tr.px_max);
  const eq  = T_EQUILIBRAGE[idx];

  panel.innerHTML = `
    <button class="mobile-back mb-3 text-sm text-blue-400 hover:text-blue-300" onclick="closeDetail()">&#8592; Mes chasses</button>
    <div class="flex items-start justify-between gap-2 mb-4">
      <div>
        <h2 class="text-xl font-bold">${escHtml(c.nom)}</h2>
        <div class="flex flex-wrap items-center gap-2 mt-1">
          ${statutBadge(c.statut)}
          ${c.difficulte ? `<span class="text-xs text-gray-400">Diff. ${c.difficulte}</span>` : ''}
          ${c.nb_seances  ? `<span class="text-xs text-gray-400">${c.nb_seances} séance${c.nb_seances > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      ${isMJ() ? `
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="startWizard(chasses.find(x=>x.id==='${c.id}'))" class="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">✏️ Modifier</button>
          <button onclick="confirmDeleteChasse('${c.id}')" class="text-xs px-3 py-1.5 rounded bg-red-900/50 hover:bg-red-900 text-red-300">Supprimer</button>
        </div>` : ''}
    </div>
    ${c.notes ? `<div class="mb-4 p-3 bg-gray-800 rounded-lg text-sm text-gray-300 whitespace-pre-wrap">${escHtml(c.notes)}</div>` : ''}

    <div class="space-y-2">
      <!-- CARTE -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50" onclick="toggleSection('carte')">
          <div class="flex items-center gap-2 min-w-0">
            <span>🗺️</span><span class="font-semibold text-sm">La Carte</span>
            <span class="text-xs text-gray-400 truncate">${hasCarte ? `${escHtml(cr.forme ?? '')} · ${escHtml(cr.origine ?? '')} · Diff. ${(cr.fonction_diff_exploit || 0) + (cr.presentation_diff || 0)}` : '<em class="text-gray-500 not-italic">Non générée</em>'}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${isMJ() ? `<button onclick="regenViewSection('carte');event.stopPropagation()" class="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600" title="Re-générer">↺</button>` : ''}
            <span class="section-chevron text-gray-400 text-xs">▼</span>
          </div>
        </div>
        <div id="sec-carte" class="px-4 pb-3 border-t border-gray-700/50">
          ${hasCarte ? `<dl class="grid grid-cols-2 gap-x-6 mt-2">
            ${field('Origine', cr.origine)}
            ${field('Langue', cr.langue)}
            ${field('Forme', cr.forme, cr.forme_solidite ? `(${cr.forme_solidite})` : '')}
            ${field('PdS / Diff. fouille', `${cr.forme_pds ?? '—'} / ${cr.forme_diff_fouille ?? '—'}`)}
            ${field('Fonction', cr.fonction, cr.fonction_type ? `(${cr.fonction_type})` : '')}
            ${field('Standard astro Diff.', cr.standard_diff)}
            ${field('Présentation', cr.presentation, cr.presentation_diff ? `(Diff. ${cr.presentation_diff})` : '')}
            ${field('Diff. exploitation totale', (cr.fonction_diff_exploit || 0) + (cr.presentation_diff || 0))}
            ${field('Localisation', cr.localisation, cr.localisation_ref ? `(${cr.localisation_ref})` : '')}
          </dl>` : `<p class="text-sm text-gray-500 py-3">Section non générée.${isMJ() ? ` <button onclick="regenViewSection('carte')" class="text-amber-400 hover:underline">Générer</button>` : ''}</p>`}
        </div>
      </div>

      <!-- TRÉSOR -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50" onclick="toggleSection('tresor')">
          <div class="flex items-center gap-2 min-w-0">
            <span>💎</span><span class="font-semibold text-sm">Le Trésor</span>
            <span class="text-xs text-gray-400 truncate">${hasTresor ? `${escHtml(tr.valeur_label ?? '')} · ${escHtml(tr.celebrite ?? '')}${tr.gloire > 0 ? ` ★${tr.gloire}` : ''}` : '<em class="text-gray-500 not-italic">Non généré</em>'}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${isMJ() ? `<button onclick="regenViewSection('tresor');event.stopPropagation()" class="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600" title="Re-générer">↺</button>` : ''}
            <span class="section-chevron text-gray-400 text-xs">▼</span>
          </div>
        </div>
        <div id="sec-tresor" class="px-4 pb-3 border-t border-gray-700/50">
          ${hasTresor ? `<dl class="grid grid-cols-2 gap-x-6 mt-2">
            ${field('Origine', tr.origine)}
            ${field('Valeur', tr.valeur_label)}
            ${field('Crédits', tr.credits_min ? `${formatCredits(tr.credits_min)} – ${formatCredits(tr.credits_max)}` : '—')}
            ${field('Célébrité', tr.celebrite)}
            ${field('Gloire', tr.gloire > 0 ? `★ ${tr.gloire}` : 'Aucune')}
            ${field('Traits', tr.traits?.length ? tr.traits.join(', ') : 'Aucun')}
            ${tr.proprietaire ? field('Propriétaire', escHtml(tr.proprietaire)) : ''}
          </dl>
          ${tr.secret ? `<div class="mt-2 pt-2 border-t border-gray-700"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Secret</p><p class="text-sm text-gray-300 whitespace-pre-wrap">${escHtml(tr.secret)}</p></div>` : ''}
          ${tr.contenu ? `<div class="mt-2"><p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Contenu</p><p class="text-sm text-gray-300 whitespace-pre-wrap">${escHtml(tr.contenu)}</p></div>` : ''}` : `<p class="text-sm text-gray-500 py-3">Section non générée.${isMJ() ? ` <button onclick="regenViewSection('tresor')" class="text-amber-400 hover:underline">Générer</button>` : ''}</p>`}
        </div>
      </div>

      <!-- ANTRE -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50" onclick="toggleSection('antre')">
          <div class="flex items-center gap-2 min-w-0">
            <span>🏛️</span><span class="font-semibold text-sm">L'Antre</span>
            <span class="text-xs text-gray-400 truncate">${hasAntre ? `${escHtml(an.taille ?? '')} · ${escHtml(an.nature ?? '')} (${escHtml(an.origine ?? '')})` : '<em class="text-gray-500 not-italic">Non générée</em>'}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${isMJ() ? `<button onclick="regenViewSection('antre');event.stopPropagation()" class="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600" title="Re-générer">↺</button>` : ''}
            <span class="section-chevron text-gray-400 text-xs">▼</span>
          </div>
        </div>
        <div id="sec-antre" class="px-4 pb-3 border-t border-gray-700/50">
          ${hasAntre ? `<dl class="grid grid-cols-2 gap-x-6 mt-2">
            ${field('Origine', an.origine, an.tech ? `(${an.tech})` : '')}
            ${field('Nature', an.nature)}
            ${field('Taille', an.taille, an.taille_desc ? `— ${an.taille_desc}` : '')}
            ${field('Niveaux', an.nb_niveaux)}
            ${field('Déplacement', an.deplacement)}
            ${field('Énergie', an.energie, an.energie_lumino ? `— ${an.energie_lumino}` : '')}
            ${field('Occupation', an.occupation, an.occupation_desc ? `(${an.occupation_desc})` : '')}
            ${field('Usure', an.usure, an.usure_desc ? `(${an.usure_desc})` : '')}
            ${an.salles_speciales?.length ? field('Salles spéciales', an.salles_speciales.join(', ')) : ''}
            ${field('Porte Prot.', an.porte_protect)}
            ${field('P. fortifiée Prot.', an.porte_fort_protect)}
            ${field('Sas Prot.', an.sas_protect)}
          </dl>
          ${an.traits?.length ? `<p class="text-sm mt-2"><span class="text-gray-400">Traits : </span>${an.traits.join(', ')}</p>` : ''}` : `<p class="text-sm text-gray-500 py-3">Section non générée.${isMJ() ? ` <button onclick="regenViewSection('antre')" class="text-amber-400 hover:underline">Générer</button>` : ''}</p>`}
        </div>
      </div>

      <!-- GARDIENS -->
      ${hasTresor ? `
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50" onclick="toggleSection('gardiens')">
          <div class="flex items-center gap-2">
            <span>⚔️</span><span class="font-semibold text-sm">Gardiens</span>
            <span class="text-xs text-gray-400">${eq.label}</span>
          </div>
          <span class="section-chevron text-gray-400 text-xs">▼</span>
        </div>
        <div id="sec-gardiens" class="px-4 pb-3 border-t border-gray-700/50">
          <div class="grid grid-cols-2 gap-2 mt-2">
            ${[['🔩 Pièges', eq.pieges], ['👾 Adversaires', eq.adversaires], ['🏆 Salle trésor', eq.salle], ['🏴‍☠️ Concurrent', eq.concurrent]].map(([k, v]) => `
              <div class="p-2 bg-gray-900/60 rounded border border-gray-700">
                <p class="text-xs text-gray-400">${k}</p>
                <p class="text-sm font-medium text-gray-100 mt-0.5">${v}</p>
              </div>`).join('')}
          </div>
          <p class="mt-2 text-xs text-gray-500">NO=Normal · EL=Élite · HE=Héros · BO=Boss · BB=Big Boss</p>
        </div>
      </div>` : ''}

      <!-- RETOURS MF -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50" onclick="toggleSection('retours')">
          <div class="flex items-center gap-2">
            <span>🎲</span><span class="font-semibold text-sm">Retours MF</span>
          </div>
          <span class="section-chevron text-gray-400 text-xs">▼</span>
        </div>
        <div id="sec-retours" class="px-4 pb-3 border-t border-gray-700/50">
          <div id="mf-bar" class="my-3 p-3 bg-gray-900 rounded-lg"></div>
          ${renderTabRetours(c, false)}
        </div>
      </div>

    </div>`;
  renderMFPoolBar();
}

// ── Wizard de création / édition ─────────────────────────────────────────────
function renderWizard() {
  const panel = document.getElementById('right-panel');
  if (!panel) return;

  const labels = ['📝 Infos', '🗺️ Carte', '💎 Trésor', '🏛️ Antre'];
  const dots = labels.map((lbl, i) => {
    const done   = i < wizardStep;
    const active = i === wizardStep;
    const dotCls = done ? 'bg-amber-600 text-white' : active ? 'bg-amber-500 text-white' : 'bg-gray-700 text-gray-400';
    const lineCls = i < wizardStep ? 'bg-amber-600' : 'bg-gray-700';
    return `<div class="flex items-center ${i < labels.length - 1 ? 'flex-1' : ''}">
      <div class="flex flex-col items-center gap-0.5 flex-shrink-0">
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${dotCls}">${done ? '✓' : i + 1}</div>
        <span class="text-xs ${active ? 'text-amber-300' : 'text-gray-500'}">${lbl}</span>
      </div>
      ${i < labels.length - 1 ? `<div class="flex-1 h-px mx-1 mb-3 ${lineCls}"></div>` : ''}
    </div>`;
  }).join('');

  const isEditing = !!wizardBuf._editId;
  panel.innerHTML = `
    <button class="mobile-back mb-3 text-sm text-blue-400 hover:text-blue-300" onclick="wizardCancel()">&#8592; Mes chasses</button>
    <div class="mb-5">
      <h2 class="text-lg font-bold mb-3">${isEditing ? '✏️ Modifier la chasse' : '✨ Nouvelle chasse'}</h2>
      <div class="flex items-start">${dots}</div>
    </div>
    <div id="wiz-step-content">${renderWizardStep()}</div>`;
}

function renderWizardStep() {
  switch (wizardStep) {
    case 0: return renderWizardStep0();
    case 1: return renderWizardStep1();
    case 2: return renderWizardStep2();
    case 3: return renderWizardStep3();
    default: return '';
  }
}

function renderWizardStep0() {
  const b = wizardBuf;
  return `
    <div class="space-y-4">
      <div>
        <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Nom de la chasse *</label>
        <input id="wiz-nom" type="text" maxlength="120" value="${escHtml(b.nom)}"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
          placeholder="Ex : La carte du capitaine Ibañez">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Difficulté</label>
          <input id="wiz-diff" type="number" min="1" max="10" value="${b.difficulte ?? ''}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            placeholder="1–10">
        </div>
        <div>
          <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Séances prévues</label>
          <input id="wiz-seances" type="number" min="1" value="${b.nb_seances ?? ''}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            placeholder="Ex : 3">
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Statut</label>
        <select id="wiz-statut"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
          <option value="en_cours" ${b.statut === 'en_cours' ? 'selected' : ''}>En cours</option>
          <option value="terminee" ${b.statut === 'terminee' ? 'selected' : ''}>Terminée</option>
          <option value="abandonnee" ${b.statut === 'abandonnee' ? 'selected' : ''}>Abandonnée</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Notes MJ</label>
        <textarea id="wiz-notes" rows="3"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
          placeholder="Intrigues, PNJs, étapes clés…">${escHtml(b.notes)}</textarea>
      </div>
    </div>
    <div class="flex justify-between mt-6">
      <button onclick="wizardCancel()" class="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Annuler</button>
      <button onclick="wizardNext()" class="px-4 py-2 text-sm rounded btn-primary font-medium">🗺️ La Carte →</button>
    </div>`;
}

function renderWizardStep1() {
  if (!wizardBuf.carte) wizardBuf.carte = generateCarte();
  const cr = wizardBuf.carte;
  return `
    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-semibold text-amber-300">Carte générée</span>
        <button onclick="wizardRollCarte()" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">🎲 Re-tirer</button>
      </div>
      <dl class="grid grid-cols-2 gap-x-6">
        ${field('Origine', cr.origine)}
        ${field('Langue', cr.langue)}
        ${field('Forme', cr.forme, cr.forme_solidite ? `(${cr.forme_solidite})` : '')}
        ${field('PdS / Diff. fouille', `${cr.forme_pds ?? '—'} / ${cr.forme_diff_fouille ?? '—'}`)}
        ${field('Fonction', cr.fonction, cr.fonction_type ? `(${cr.fonction_type})` : '')}
        ${field('Présentation', cr.presentation, cr.presentation_diff ? `(Diff. ${cr.presentation_diff})` : '')}
        ${field('Diff. exploitation', (cr.fonction_diff_exploit || 0) + (cr.presentation_diff || 0))}
        ${field('Standard astro Diff.', cr.standard_diff)}
        ${field('Localisation', cr.localisation, cr.localisation_ref ? `(${cr.localisation_ref})` : '')}
      </dl>
    </div>
    <div class="flex justify-between mt-6">
      <button onclick="wizardPrev()" class="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200">← Retour</button>
      <button onclick="wizardNext()" class="px-4 py-2 text-sm rounded btn-primary font-medium">💎 Le Trésor →</button>
    </div>`;
}

function renderWizardStep2() {
  if (!wizardBuf.tresor) wizardBuf.tresor = generateTresor();
  const tr = wizardBuf.tresor;
  return `
    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-semibold text-amber-300">Trésor généré</span>
        <button onclick="wizardRollTresor()" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">🎲 Re-tirer</button>
      </div>
      <dl class="grid grid-cols-2 gap-x-6">
        ${field('Origine', tr.origine)}
        ${field('Valeur', tr.valeur_label)}
        ${field('Crédits', tr.credits_min ? `${formatCredits(tr.credits_min)} – ${formatCredits(tr.credits_max)}` : '—')}
        ${field('Célébrité', tr.celebrite)}
        ${field('Gloire', tr.gloire > 0 ? `★ ${tr.gloire}` : 'Aucune')}
        ${field('Traits', tr.traits?.length ? tr.traits.join(', ') : 'Aucun')}
      </dl>
      <div class="mt-3 space-y-2 border-t border-gray-700 pt-3">
        <div>
          <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Propriétaire</label>
          <input id="wiz-tresor-proprio" type="text" value="${escHtml(tr.proprietaire || '')}"
            class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
            placeholder="Qui possède ce trésor ?">
        </div>
        <div>
          <label class="text-xs text-gray-400 uppercase tracking-wide block mb-1">Secret du trésor</label>
          <textarea id="wiz-tresor-secret" rows="2"
            class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500 resize-none"
            placeholder="Ce que les PJs ne savent pas encore…">${escHtml(tr.secret || '')}</textarea>
        </div>
      </div>
    </div>
    <div class="flex justify-between mt-6">
      <button onclick="wizardPrev()" class="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200">← Retour</button>
      <button onclick="wizardNext()" class="px-4 py-2 text-sm rounded btn-primary font-medium">🏛️ L'Antre →</button>
    </div>`;
}

function renderWizardStep3() {
  if (!wizardBuf.antre) wizardBuf.antre = generateAntre(wizardBuf.tresor?.origine || '');
  const an = wizardBuf.antre;
  const tr = wizardBuf.tresor || {};
  const idx = equilibrageIndex(tr.px_max);
  const eq  = T_EQUILIBRAGE[idx];
  return `
    <div class="space-y-3">
      <div class="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold text-amber-300">Antre générée</span>
          <button onclick="wizardRollAntre()" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">🎲 Re-tirer</button>
        </div>
        <dl class="grid grid-cols-2 gap-x-6">
          ${field('Origine', an.origine, an.tech ? `(${an.tech})` : '')}
          ${field('Nature', an.nature)}
          ${field('Taille', an.taille, an.taille_desc ? `— ${an.taille_desc}` : '')}
          ${field('Niveaux', an.nb_niveaux)}
          ${field('Énergie', an.energie, an.energie_lumino ? `— ${an.energie_lumino}` : '')}
          ${field('Occupation', an.occupation, an.occupation_desc ? `(${an.occupation_desc})` : '')}
          ${field('Usure', an.usure, an.usure_desc ? `(${an.usure_desc})` : '')}
          ${an.salles_speciales?.length ? field('Salles spéciales', an.salles_speciales.join(', ')) : ''}
        </dl>
      </div>
      <div class="p-3 bg-gray-800 rounded-lg border border-gray-700">
        <p class="text-xs font-semibold text-amber-300 mb-2">⚔️ Gardiens (calculé)</p>
        <div class="grid grid-cols-2 gap-2">
          ${[['🔩 Pièges', eq.pieges], ['👾 Adversaires', eq.adversaires], ['🏆 Salle trésor', eq.salle], ['🏴‍☠️ Concurrent', eq.concurrent]].map(([k, v]) => `
            <div class="bg-gray-900/60 rounded p-2 border border-gray-700">
              <p class="text-xs text-gray-400">${k}</p>
              <p class="text-xs font-medium text-gray-200 mt-0.5">${v}</p>
            </div>`).join('')}
        </div>
      </div>
      <div class="p-3 bg-amber-900/20 rounded-lg border border-amber-800/40">
        <p class="text-xs font-semibold text-amber-300 mb-2">Récapitulatif</p>
        <div class="text-sm text-gray-300 space-y-1">
          <p><span class="text-gray-400">Nom :</span> ${escHtml(wizardBuf.nom)}</p>
          <p><span class="text-gray-400">Carte :</span> ${escHtml(wizardBuf.carte?.forme ?? '—')} (${escHtml(wizardBuf.carte?.origine ?? '')}) → ${escHtml(wizardBuf.carte?.localisation ?? '—')}</p>
          <p><span class="text-gray-400">Trésor :</span> ${escHtml(tr.valeur_label ?? '—')} · ${escHtml(tr.celebrite ?? '')}${tr.gloire > 0 ? ` ★${tr.gloire}` : ''}</p>
          <p><span class="text-gray-400">Antre :</span> ${escHtml(an.taille ?? '—')} · ${escHtml(an.nature ?? '')} (${escHtml(an.origine ?? '')})</p>
        </div>
      </div>
    </div>
    <div class="flex justify-between mt-6">
      <button onclick="wizardPrev()" class="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200">← Retour</button>
      <button id="btn-wiz-save" onclick="wizardSave()" class="px-4 py-2 text-sm rounded btn-primary font-medium">✓ Enregistrer</button>
    </div>`;
}

// keep renderTabGardiens for potential future use; it's now superseded by inline wizard/view rendering
function renderTabGardiens_unused(c) {
}

function renderTabGardiens(c) {
  const tr = c.tresor || {};
  if (!tr.px_max) return `<p class="text-center py-10 text-gray-500">Définissez d'abord la valeur du trésor (onglet Trésor).</p>`;
  const idx = equilibrageIndex(tr.px_max);
  const eq = T_EQUILIBRAGE[idx];

  return `
    <div class="mb-4 p-3 bg-gray-800 rounded-lg">
      <p class="text-xs text-gray-400 mb-1">Valeur du trésor</p>
      <p class="font-semibold text-amber-300">${eq.label}</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${[['🔩 Pièges',     eq.pieges],
         ['👾 Adversaires', eq.adversaires],
         ['🏆 Salle trésor', eq.salle],
         ['🏴‍☠️ Concurrent', eq.concurrent]].map(([k, v]) => `
        <div class="p-3 bg-gray-800 rounded-lg">
          <p class="text-xs text-gray-400">${k}</p>
          <p class="text-sm font-medium text-gray-100 mt-0.5">${v}</p>
        </div>`).join('')}
    </div>
    <div class="mt-4 text-xs text-gray-500">
      NO=Normal · EL=Élite · HE=Héros · BO=Boss · BB=Big Boss<br>
      Modificateurs possibles : plusieurs tentatives → lisez une ligne plus bas ; environnement dangereux → une ligne plus haut.
    </div>`;
}

function renderMFPoolBar() {
  const bar = document.getElementById('mf-bar');
  if (!bar) return;
  const mjPct = mfPool.mj_pool * 2;
  bar.innerHTML = `
    <div class="flex justify-between text-xs text-gray-400 mb-1">
      <span>Pool PJ : <b class="text-blue-300">${mfPool.pj_pool}d</b></span>
      <span>Pool MJ : <b class="text-amber-300">${mfPool.mj_pool}d</b></span>
    </div>
    <div class="h-2 rounded-full bg-gray-700 overflow-hidden">
      <div class="h-full bg-amber-500 mf-pool-bar-fill" style="width:${mjPct}%;margin-left:${100 - mjPct}%"></div>
    </div>`;
}

function renderTabRetours(c, withBar = true) {
  const gloire = c.tresor?.gloire ?? 0;
  return `
    ${withBar ? '<div id="mf-bar" class="mb-4 p-3 bg-gray-800 rounded-lg"></div>' : ''}
    ${RETOURS_TDM.map(r => renderRetourCard(r, gloire)).join('')}
    <p class="text-xs text-gray-500 mt-4">Ces retours de flamme sont spécifiques au supplément TdM et s'utilisent avec le pool MF de la table.</p>
  `;
}

function renderRetourCard(r, gloire) {
  const modIds = r.modificateurs.map((m, i) => `mod_${r.id}_${i}`);
  return `
    <div class="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-semibold text-gray-100">${r.nom}</h3>
          <p class="text-xs text-gray-400 mt-0.5">${r.description}</p>
        </div>
        <span id="badge_${r.id}" class="text-lg font-mono font-bold text-amber-300">${r.cout_base}d MF</span>
      </div>
      ${r.modificateurs.length > 0 ? `
        <div class="mt-3 space-y-1">
          ${r.modificateurs.map((m, i) => `
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" id="${modIds[i]}" class="retour-mod"
                data-retour="${r.id}" data-delta="${m.delta}" data-base="${r.cout_base}"
                onchange="updateRetourBadge('${r.id}')"
                ${m.label.includes('Gloire') && gloire >= 7 ? 'checked' : ''}>
              <span class="${m.delta < 0 ? 'text-green-400' : 'text-red-400'}">${m.delta > 0 ? '+' : ''}${m.delta}d</span>
              <span class="text-gray-300">${m.label}</span>
            </label>`).join('')}
        </div>` : ''}
      ${isMJ() ? `
        <div class="mt-3">
          <button onclick="triggerRetour('${r.id}')" class="text-xs px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-white font-medium">
            Déclencher (débit MJ → PJ)
          </button>
        </div>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIONS GLOBALES
// ═══════════════════════════════════════════════════════════════════════════════

window.selectChasse = function(id) {
  currentId  = id;
  viewMode   = 'view';
  wizardBuf  = null;
  renderList();
  renderRightPanel();
  if (id) {
    document.body.classList.add('detail-open');
    renderMFPoolBar();
  }
};

window.closeDetail = function() {
  currentId  = null;
  viewMode   = 'view';
  wizardBuf  = null;
  wizardStep = 0;
  document.body.classList.remove('detail-open');
  renderList();
  renderRightPanel();
};

window.toggleSection = function(name) {
  const body    = document.getElementById(`sec-${name}`);
  if (!body) return;
  const chevron = body.previousElementSibling?.querySelector('.section-chevron');
  if (body.style.display === 'none') {
    body.style.display = '';
    if (chevron) chevron.style.transform = '';
    if (name === 'retours') renderMFPoolBar();
  } else {
    body.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  }
};

window.regenViewSection = async function(section) {
  if (!currentId) return;
  const c = chasses.find(x => x.id === currentId);
  if (!c) return;
  let patch = {};
  if (section === 'carte')  patch.carte  = generateCarte();
  if (section === 'tresor') patch.tresor = generateTresor();
  if (section === 'antre')  patch.antre  = generateAntre(c.tresor?.origine || '');
  try {
    const updated = await apiUpdate(currentId, patch);
    Object.assign(c, updated);
    renderView(c);
    renderMFPoolBar();
  } catch (e) {
    showError(e.message);
  }
};

window.confirmDeleteChasse = function(id) {
  if (!confirm('Supprimer cette chasse au trésor ? Cette action est irréversible.')) return;
  deleteChasse(id);
};

async function deleteChasse(id) {
  try {
    await apiDelete(id);
    chasses = chasses.filter(c => c.id !== id);
    if (currentId === id) {
      currentId  = null;
      viewMode   = 'view';
      wizardBuf  = null;
      wizardStep = 0;
    }
    renderList();
    renderRightPanel();
  } catch (e) {
    showError(e.message);
  }
}

window.updateRetourBadge = function(retourId) {
  const r = RETOURS_TDM.find(x => x.id === retourId);
  if (!r) return;
  const mods = document.querySelectorAll(`[data-retour="${retourId}"]`);
  let total = r.cout_base;
  mods.forEach(cb => { if (cb.checked) total += Number(cb.dataset.delta); });
  total = Math.max(1, total);
  const badge = document.getElementById(`badge_${retourId}`);
  if (badge) badge.textContent = `${total}d MF`;
};

window.triggerRetour = async function(retourId) {
  const r = RETOURS_TDM.find(x => x.id === retourId);
  if (!r) return;
  let total = r.cout_base;
  const mods = document.querySelectorAll(`[data-retour="${retourId}"]`);
  mods.forEach(cb => { if (cb.checked) total += Number(cb.dataset.delta); });
  total = Math.max(1, total);

  if (!confirm(`Déclencher "${r.nom}" — débiter ${total}d MF du pool MJ vers les PJ ?`)) return;
  try {
    await doMFTransfer(total, 'mj_to_pj');
    renderMFPoolBar();
  } catch (e) {
    showError(e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WIZARD — CRÉATION / ÉDITION DE CHASSE
// ═══════════════════════════════════════════════════════════════════════════════

window.startWizard = function(chasse) {
  viewMode   = 'wizard';
  wizardStep = 0;
  if (chasse) {
    wizardBuf = {
      _editId:    chasse.id,
      nom:        chasse.nom,
      difficulte: chasse.difficulte,
      nb_seances: chasse.nb_seances,
      statut:     chasse.statut,
      notes:      chasse.notes || '',
      carte:      chasse.carte  ? { ...chasse.carte }  : null,
      tresor:     chasse.tresor ? { ...chasse.tresor } : null,
      antre:      chasse.antre  ? { ...chasse.antre }  : null,
    };
    currentId = chasse.id;
  } else {
    wizardBuf = {
      _editId: null, nom: '', difficulte: null, nb_seances: null,
      statut: 'en_cours', notes: '', carte: null, tresor: null, antre: null,
    };
  }
  renderList();
  renderRightPanel();
};

window.wizardCancel = function() {
  viewMode   = 'view';
  wizardBuf  = null;
  wizardStep = 0;
  if (!currentId) document.body.classList.remove('detail-open');
  renderList();
  renderRightPanel();
};

function wizardSaveStep() {
  if (wizardStep === 0) {
    wizardBuf.nom        = document.getElementById('wiz-nom')?.value.trim() || '';
    wizardBuf.difficulte = document.getElementById('wiz-diff')?.value || null;
    wizardBuf.nb_seances = document.getElementById('wiz-seances')?.value || null;
    wizardBuf.statut     = document.getElementById('wiz-statut')?.value || 'en_cours';
    wizardBuf.notes      = document.getElementById('wiz-notes')?.value || '';
  }
  if (wizardStep === 2 && wizardBuf.tresor) {
    wizardBuf.tresor.proprietaire = document.getElementById('wiz-tresor-proprio')?.value || '';
    wizardBuf.tresor.secret       = document.getElementById('wiz-tresor-secret')?.value || '';
  }
}

window.wizardNext = function() {
  wizardSaveStep();
  if (wizardStep === 0 && !wizardBuf.nom) { alert('Le nom est requis.'); return; }
  wizardStep++;
  renderWizard();
};

window.wizardPrev = function() {
  wizardSaveStep();
  wizardStep--;
  renderWizard();
};

window.wizardRollCarte  = function() { wizardBuf.carte  = generateCarte();                              renderWizard(); };
window.wizardRollTresor = function() { wizardBuf.tresor = generateTresor();                             renderWizard(); };
window.wizardRollAntre  = function() { wizardBuf.antre  = generateAntre(wizardBuf.tresor?.origine || ''); renderWizard(); };

window.wizardSave = async function() {
  wizardSaveStep();
  const btn = document.getElementById('btn-wiz-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  try {
    const payload = {
      nom:        wizardBuf.nom,
      difficulte: wizardBuf.difficulte || null,
      nb_seances: wizardBuf.nb_seances || null,
      statut:     wizardBuf.statut,
      notes:      wizardBuf.notes || null,
      carte:      wizardBuf.carte,
      tresor:     wizardBuf.tresor,
      antre:      wizardBuf.antre,
    };
    if (wizardBuf._editId) {
      const updated = await apiUpdate(wizardBuf._editId, payload);
      const idx = chasses.findIndex(x => x.id === updated.id);
      if (idx >= 0) chasses[idx] = updated;
      currentId = updated.id;
    } else {
      const chasse = await apiCreate(payload);
      chasses.unshift(chasse);
      currentId = chasse.id;
    }
    viewMode   = 'view';
    wizardBuf  = null;
    wizardStep = 0;
    renderList();
    renderRightPanel();
    renderMFPoolBar();
  } catch (e) {
    showError(e.message);
    if (btn) { btn.disabled = false; btn.textContent = '✓ Enregistrer'; }
  }
};
// ═══════════════════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════════════════

function showError(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-lg bg-red-800 text-white text-sm shadow-lg z-50';
  setTimeout(() => { t.className = 'hidden'; }, 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  initHeader();

  document.getElementById('btn-new-chasse')?.addEventListener('click', () => startWizard(null));

  const tableId = getActiveTableId();
  if (!tableId) {
    document.getElementById('chasse-list').innerHTML =
      `<p class="text-gray-500 text-sm text-center py-8">Sélectionnez une table de jeu pour accéder aux chasses.</p>`;
    return;
  }

  [chasses] = await Promise.all([apiList(), fetchMFPool()]);
  renderList();
  renderRightPanel();
}

init();
