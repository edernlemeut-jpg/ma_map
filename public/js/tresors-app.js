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
  2:  { label: 'Module-mémoire', solidite: 'Solide',  pds: '0', diff_fouille: 3 },
  3:  { label: 'Ordinateur',     solidite: 'Solide',  pds: '0', diff_fouille: 1 },
  4:  { label: 'Peinture',       solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  5:  { label: 'Tatouage',       solidite: 'Fragile', pds: '0', diff_fouille: 3 },
  6:  { label: 'Parchemin',      solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  7:  { label: 'Parchemin',      solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  8:  { label: 'Parchemin',      solidite: 'Fragile', pds: '0-1', diff_fouille: 3 },
  9:  { label: 'Objet enchanté', solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
  10: { label: 'Objet enchanté', solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
  11: { label: 'Talisman enchanté', solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
  12: { label: 'Talisman enchanté', solidite: 'Fragile', pds: '0-3', diff_fouille: 5 },
};

// 2d6 → Fonction + présentation (range 2-12)
const T_FONCTION = {
  2:  { label: 'Carte directe',       type: 'directe',   exploit_diff: 1 },
  3:  { label: 'Journal de bord',     type: 'directe',   exploit_diff: 1 },
  4:  { label: 'Journal de bord',     type: 'directe',   exploit_diff: 1 },
  5:  { label: 'Journal intime',      type: 'directe',   exploit_diff: 3 },
  6:  { label: 'Manifeste',           type: 'directe',   exploit_diff: 1 },
  7:  { label: 'Manifeste',           type: 'directe',   exploit_diff: 1 },
  8:  { label: 'Manifeste',           type: 'directe',   exploit_diff: 1 },
  9:  { label: 'News',                type: 'directe',   exploit_diff: 3 },
  10: { label: 'News',                type: 'directe',   exploit_diff: 3 },
  11: { label: "Œuvre d'art",         type: 'indirecte', exploit_diff: 5 },
  12: { label: 'Rapport colonisation',type: 'indirecte', exploit_diff: 8 },
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

let chasses = [];
let currentId = null;  // chasse sélectionnée
let editBuf = null;    // buffer de la chasse en cours d'édition
let activeSideTab = 'chasse';
let mfPool = { pj_pool: 50, mj_pool: 0 };

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
// RENDER — PANNEAU DROIT (ONGLETS)
// ═══════════════════════════════════════════════════════════════════════════════

function renderRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel) return;

  if (!currentId) {
    document.body.classList.remove('detail-open');
    panel.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-500 gap-4 py-20">
        <span class="text-5xl">🗺️</span>
        <p class="text-center">Sélectionnez une chasse dans la liste<br>ou créez-en une nouvelle.</p>
        ${isMJ() ? `<button onclick="openNewModal()" class="btn-primary px-4 py-2 rounded-lg text-sm">+ Nouvelle chasse</button>` : ''}
      </div>`;
    return;
  }

  const c = chasses.find(x => x.id === currentId);
  if (!c) return;

  panel.innerHTML = `
    <!-- Bouton retour mobile -->
    <button class="mobile-back mb-3 text-sm text-blue-400 hover:text-blue-300" onclick="closeDetail()">&#8592; Mes chasses</button>

    <!-- Titre + actions -->
    <div class="flex items-start justify-between gap-2 mb-4">
      <div>
        <h2 class="text-xl font-bold">${c.nom}</h2>
        <div class="flex items-center gap-2 mt-1">
          ${statutBadge(c.statut)}
          ${c.difficulte ? `<span class="text-xs text-gray-400">Diff. ${c.difficulte}</span>` : ''}
          ${c.nb_seances ? `<span class="text-xs text-gray-400">${c.nb_seances} séance${c.nb_seances > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      ${isMJ() ? `
        <div class="flex gap-2">
          <button onclick="openEditModal()" class="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Éditer</button>
          <button onclick="confirmDeleteChasse('${c.id}')" class="text-xs px-3 py-1.5 rounded bg-red-900/50 hover:bg-red-900 text-red-300">Supprimer</button>
        </div>` : ''}
    </div>

    <!-- Onglets -->
    <div class="tab-bar flex gap-1 mb-4 border-b border-gray-700 overflow-x-auto">
      ${['chasse','carte','tresor','antre','gardiens','retours'].map(tab => `
        <button onclick="setTab('${tab}')" class="tab-btn whitespace-nowrap ${activeSideTab === tab ? 'active' : ''}" data-tab="${tab}">
          ${{ chasse:'📋 Chasse', carte:'🗺️ Carte', tresor:'💎 Trésor', antre:'🏛️ Antre', gardiens:'⚔️ Gardiens', retours:'🎲 Retours MF' }[tab]}
        </button>`).join('')}
    </div>

    <!-- Contenu de l'onglet actif -->
    <div id="tab-content">${renderTabContent(c)}</div>`;
}

function renderTabContent(c) {
  switch (activeSideTab) {
    case 'chasse':   return renderTabChasse(c);
    case 'carte':    return renderTabCarte(c);
    case 'tresor':   return renderTabTresor(c);
    case 'antre':    return renderTabAntre(c);
    case 'gardiens': return renderTabGardiens(c);
    case 'retours':  return renderTabRetours(c);
    default: return '';
  }
}

function field(label, value, sub) {
  if (!value && value !== 0) return '';
  return `<div class="mb-3">
    <dt class="text-xs text-gray-400 uppercase tracking-wide">${label}</dt>
    <dd class="text-sm text-gray-100 mt-0.5">${value}${sub ? `<span class="text-gray-400 ml-1">${sub}</span>` : ''}</dd>
  </div>`;
}

function renderTabChasse(c) {
  return `
    <dl class="grid grid-cols-2 gap-x-6">
      ${field('Statut',     statutBadge(c.statut))}
      ${field('Difficulté', c.difficulte)}
      ${field('Séances',    c.nb_seances)}
      ${field('Créée le',   c.created_at?.slice(0,10))}
    </dl>
    ${c.notes ? `<div class="mt-4 p-3 bg-gray-800 rounded-lg text-sm text-gray-300 whitespace-pre-wrap">${c.notes}</div>` : ''}`;
}

function renderTabCarte(c) {
  const cr = c.carte || {};
  if (!Object.keys(cr).some(k => cr[k])) return emptyTab('Carte', 'carte');
  return `
    <dl class="grid grid-cols-2 gap-x-6">
      ${field('Origine',              cr.origine)}
      ${field('Langue',               cr.langue)}
      ${field('Forme',                cr.forme, cr.forme_solidite ? `(${cr.forme_solidite})` : '')}
      ${field('PdS / Diff. fouille',  `${cr.forme_pds ?? '—'} / ${cr.forme_diff_fouille ?? '—'}`)}
      ${field('Fonction',             cr.fonction, cr.fonction_type ? `(${cr.fonction_type})` : '')}
      ${field('Standard astro Diff.', cr.standard_diff)}
      ${field('Présentation',         cr.presentation, cr.presentation_diff ? `(Diff. ${cr.presentation_diff})` : '')}
      ${field('Exploit. total Diff.', (cr.fonction_diff_exploit || 0) + (cr.presentation_diff || 0))}
      ${field('Localisation',         cr.localisation, cr.localisation_ref ? `(${cr.localisation_ref})` : '')}
    </dl>
    ${isMJ() ? `<div class="mt-4"><button onclick="regenerateSection('carte')" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">↺ Re-générer la carte</button></div>` : ''}`;
}

function emptyTab(name, section) {
  return isMJ()
    ? `<div class="text-center py-10 text-gray-500">
         <p class="mb-3">La section ${name} n'a pas encore été générée.</p>
         <button onclick="regenerateSection('${section}')" class="btn-primary px-4 py-2 rounded">🎲 Générer ${name}</button>
       </div>`
    : `<p class="text-center py-10 text-gray-500">Section non renseignée.</p>`;
}

function renderTabTresor(c) {
  const tr = c.tresor || {};
  if (!tr.valeur_label) return emptyTab('Trésor', 'tresor');
  return `
    <dl class="grid grid-cols-2 gap-x-6">
      ${field('Origine',   tr.origine)}
      ${field('Valeur',    tr.valeur_label)}
      ${field('Crédits',   tr.credits_min ? `${formatCredits(tr.credits_min)} – ${formatCredits(tr.credits_max)}` : '—')}
      ${field('Célébrité', tr.celebrite)}
      ${field('Gloire',    tr.gloire > 0 ? `★ ${tr.gloire}` : 'Aucune')}
      ${field('Traits',    tr.traits?.length ? tr.traits.join(', ') : 'Aucun')}
      ${field('Propriétaire', tr.proprietaire || '—')}
    </dl>
    ${tr.secret ? `<div class="mt-3"><dt class="text-xs text-gray-400 uppercase tracking-wide">Secret du trésor</dt><dd class="text-sm text-gray-300 mt-1 whitespace-pre-wrap">${tr.secret}</dd></div>` : ''}
    ${tr.contenu ? `<div class="mt-3"><dt class="text-xs text-gray-400 uppercase tracking-wide">Contenu</dt><dd class="text-sm text-gray-300 mt-1 whitespace-pre-wrap">${tr.contenu}</dd></div>` : ''}
    ${isMJ() ? `<div class="mt-4"><button onclick="regenerateSection('tresor')" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">↺ Re-générer le trésor</button></div>` : ''}`;
}

function renderTabAntre(c) {
  const an = c.antre || {};
  if (!an.origine) return emptyTab('Antre', 'antre');
  return `
    <dl class="grid grid-cols-2 gap-x-6">
      ${field('Origine',    an.origine, an.tech ? `(${an.tech})` : '')}
      ${field('Nature',     an.nature)}
      ${field('Taille',     an.taille, an.taille_desc ? `— ${an.taille_desc}` : '')}
      ${field('Niveaux',    an.nb_niveaux)}
      ${field('Déplacement', an.deplacement)}
      ${field('Énergie',    an.energie, an.energie_lumino ? `— ${an.energie_lumino}` : '')}
      ${field('Occupation', an.occupation, an.occupation_desc ? `(${an.occupation_desc})` : '')}
      ${field('Usure',      an.usure, an.usure_desc ? `(${an.usure_desc})` : '')}
      ${field('Salles spéciales', an.salles_speciales?.length ? an.salles_speciales.join(', ') : 'Aucune')}
      ${field('Porte Prot.', an.porte_protect)}
      ${field('P. fortifiée Prot.', an.porte_fort_protect)}
      ${field('Sas Prot.',   an.sas_protect)}
    </dl>
    ${an.traits?.length ? `<p class="text-sm mt-2"><span class="text-gray-400">Traits : </span>${an.traits.join(', ')}</p>` : ''}
    ${isMJ() ? `<div class="mt-4"><button onclick="regenerateSection('antre')" class="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">↺ Re-générer l'antre</button></div>` : ''}`;
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

function renderTabRetours(c) {
  const gloire = c.tresor?.gloire ?? 0;
  return `
    <div id="mf-bar" class="mb-4 p-3 bg-gray-800 rounded-lg"></div>
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
  currentId = id;
  activeSideTab = 'chasse';
  renderList();
  renderRightPanel();
  renderMFPoolBar();
  if (id) document.body.classList.add('detail-open'); // mobile
};

window.closeDetail = function() {
  currentId = null;
  document.body.classList.remove('detail-open');
  renderList();
  renderRightPanel();
};

window.setTab = function(tab) {
  activeSideTab = tab;
  renderRightPanel();
  if (tab === 'retours') {
    renderMFPoolBar(); // mise à jour du bar MF
  }
};

window.regenerateSection = async function(section) {
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
    document.getElementById('tab-content').innerHTML = renderTabContent(c);
    if (activeSideTab === 'retours') renderMFPoolBar();
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
    if (currentId === id) currentId = null;
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
    // refresh the bar in the retours tab
    const bar = document.getElementById('mf-bar');
    if (bar) renderMFPoolBar();
  } catch (e) {
    showError(e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL — NOUVELLE CHASSE
// ═══════════════════════════════════════════════════════════════════════════════

window.openNewModal = function() {
  editBuf = null;
  const gen = generateAll();
  document.getElementById('modal-nom').value = '';
  document.getElementById('modal-difficulte').value = '';
  document.getElementById('modal-seances').value = '';
  document.getElementById('modal-statut').value = 'en_cours';
  document.getElementById('modal-notes').value = '';
  document.getElementById('modal-generate-preview').textContent =
    `Carte : ${gen.carte.forme} (${gen.carte.origine}) → ${gen.carte.localisation}\n`
    + `Trésor : ${gen.tresor.valeur_label}, ${gen.tresor.celebrite} (Gloire ${gen.tresor.gloire})\n`
    + `Antre : ${gen.antre.taille}, ${gen.antre.nature} (${gen.antre.origine})`;
  document.getElementById('modal-gen-cache').dataset.gen = JSON.stringify(gen);
  document.getElementById('new-chasse-modal').classList.remove('hidden');
  document.getElementById('modal-nom').focus();
};

window.openEditModal = function() {
  if (!currentId) return;
  const c = chasses.find(x => x.id === currentId);
  if (!c) return;
  editBuf = c;
  document.getElementById('modal-nom').value = c.nom;
  document.getElementById('modal-difficulte').value = c.difficulte ?? '';
  document.getElementById('modal-seances').value = c.nb_seances ?? '';
  document.getElementById('modal-statut').value = c.statut;
  document.getElementById('modal-notes').value = c.notes ?? '';
  document.getElementById('modal-generate-preview').textContent = '(modification d\'une chasse existante — la génération ne s\'applique pas)';
  document.getElementById('new-chasse-modal').classList.remove('hidden');
  document.getElementById('modal-nom').focus();
};

window.closeNewModal = function() {
  document.getElementById('new-chasse-modal').classList.add('hidden');
  editBuf = null;
};

window.rerollModal = function() {
  const gen = generateAll();
  document.getElementById('modal-generate-preview').textContent =
    `Carte : ${gen.carte.forme} (${gen.carte.origine}) → ${gen.carte.localisation}\n`
    + `Trésor : ${gen.tresor.valeur_label}, ${gen.tresor.celebrite} (Gloire ${gen.tresor.gloire})\n`
    + `Antre : ${gen.antre.taille}, ${gen.antre.nature} (${gen.antre.origine})`;
  document.getElementById('modal-gen-cache').dataset.gen = JSON.stringify(gen);
};

window.saveNewChasse = async function() {
  const nom = document.getElementById('modal-nom').value.trim();
  if (!nom) { alert('Le nom est requis.'); return; }

  const btn = document.getElementById('btn-save-chasse');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  try {
    if (editBuf) {
      // Mise à jour simple (pas de ré-génération)
      const updated = await apiUpdate(editBuf.id, {
        nom,
        difficulte:  document.getElementById('modal-difficulte').value || null,
        nb_seances:  document.getElementById('modal-seances').value || null,
        statut:      document.getElementById('modal-statut').value,
        notes:       document.getElementById('modal-notes').value || null,
      });
      const idx = chasses.findIndex(x => x.id === updated.id);
      if (idx >= 0) chasses[idx] = updated;
    } else {
      // Nouvelle chasse avec contenu généré
      const raw = document.getElementById('modal-gen-cache').dataset.gen;
      const gen = raw ? JSON.parse(raw) : generateAll();
      const chasse = await apiCreate({
        nom,
        difficulte: document.getElementById('modal-difficulte').value || null,
        nb_seances: document.getElementById('modal-seances').value || null,
        statut:     document.getElementById('modal-statut').value,
        notes:      document.getElementById('modal-notes').value || null,
        carte:      gen.carte,
        tresor:     gen.tresor,
        antre:      gen.antre,
      });
      chasses.unshift(chasse);
      currentId = chasse.id;
    }
    closeNewModal();
    renderList();
    renderRightPanel();
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
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

  // Bouton Nouvelle chasse (header hors-modal)
  document.getElementById('btn-new-chasse')?.addEventListener('click', openNewModal);

  // Modal keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeNewModal();
  });

  // Fermeture modal si clic sur overlay
  document.getElementById('new-chasse-modal')?.addEventListener('click', e => {
    if (e.target.id === 'new-chasse-modal') closeNewModal();
  });

  const tableId = getActiveTableId();
  if (!tableId) {
    document.getElementById('chasse-list').innerHTML =
      `<p class="text-gray-500 text-sm text-center py-8">Sélectionnez une table de jeu pour accéder aux chasses.</p>`;
    return;
  }

  // Charger données
  [chasses] = await Promise.all([apiList(), fetchMFPool()]);
  renderList();
  renderRightPanel();
}

init();
