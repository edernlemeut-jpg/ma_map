/**
 * mf-faktor-app.js — Page des dépenses Metal Faktor (MJ uniquement)
 *
 * Affiche les "retours de flamme" disponibles selon la réserve mj_pool.
 * Données tirées du Guide du Meneur v1.5 pp. 94-114.
 */
import { initHeader } from '/js/shared/header.js';
import { isMJ, getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';

// ── Catalogue des dépenses MF ─────────────────────────────────────────────────
// cost: nombre fixe de dés OU null si variable/spécial
// costMin / costMax: pour les coûts variables
// category: 'retour' | 'combat' | 'voyage'
// condition: texte décrivant la condition requise
// description: texte de l'effet

const MF_SPENDINGS = [
  // ── Retours de flamme génériques ──────────────────────────────────────────
  {
    id: 'alerte-pillards',
    nom: 'Alerte ! (camp de pillards)',
    category: 'retour',
    cost: 15,
    condition: 'Les PJ s\'introduisent dans un camp de pillards et ratent un test de Discrétion (avec au moins 1 succès).',
    description: 'Une sirène retentit : alerte ! Confrontez immédiatement les PJ à 6 occupants du lieu. Tant que l\'alerte est en cours, vous pouvez repayer le coût pour confronter les PJ à 6 nouveaux occupants. Si les PJ fuient : (D+1) aux tests de Discrétion pendant 24h, et le coût futur est réduit de 5d MF.',
    tags: ['discrétion', 'infiltration'],
  },
  {
    id: 'alerte-base-militaire',
    nom: 'Alerte ! (base militaire)',
    category: 'retour',
    cost: 10,
    condition: 'Les PJ s\'introduisent dans une base militaire et ratent un test de Discrétion (avec au moins 1 succès).',
    description: 'Identique à l\'Alerte camp de pillards. Le coût supplémentaire +10d MF si l\'alerte se déclenche à l\'extérieur du lieu.',
    tags: ['discrétion', 'infiltration'],
  },
  {
    id: 'alerte-gratuite',
    nom: 'Alerte ! (échec total)',
    category: 'retour',
    cost: 0,
    condition: 'Les PJ ratent un test de Discrétion sans aucun succès, ou devaient faire un test et ne l\'ont pas fait.',
    description: 'Gratuit ! L\'alerte se déclenche sans dépense de dés MF. Mêmes effets que l\'Alerte standard.',
    tags: ['discrétion', 'infiltration'],
  },
  {
    id: 'baston',
    nom: 'Baston !',
    category: 'retour',
    cost: 10,
    condition: 'Les PJ ratent un test ou une opposition d\'Intimidation dans un bar louche, ou insultent un hors-la-loi.',
    description: 'Une bagarre d\'auberge éclate. Chaque PJ affronte un adversaire (profil au choix). Adversaires sans armes (chaises, chopines, L de dégâts). Si un PJ tire une arme : vous prenez 3d MF par tir d\'arme dans la réserve des PJ. En fin de tour : dépensez jusqu\'à 10d MF pour des coups perdus (opposition vs Mêlée, succès exc. → 1L/succès). Pour 3d MF : un PJ frappe accidentellement un civil qui rejoint la mêlée.',
    tags: ['combat', 'social'],
  },
  {
    id: 'controle-douanes',
    nom: 'Contrôle de douanes',
    category: 'retour',
    costFormula: '(10 − Sécurité de la planète)d MF',
    costMin: 1,
    costMax: 9,
    condition: 'Les PJ ratent un test de Baratin auprès d\'un officier de capitainerie, ou ont une conduite suspecte (vaisseau militaire, remorquage).',
    description: 'Un vaisseau des douanes exige une mise en panne. Si les PJ refusent : combat orbital. Si les PJ se laissent aborder : inspecteur (profil officier capitainerie) + 6 mercenaires fouillent tout. Test de Recherche pour contrebande/possessions illégales. Corruption possible mais tous les tests sont (TD). Si la situation dégénère : déclenchez Police !',
    tags: ['voyage', 'social'],
  },
  {
    id: 'dommages-collatéraux',
    nom: 'Dommages collatéraux',
    category: 'retour',
    costFormula: 'Spécial (indiqué sur le champ de bataille)',
    costMin: 5,
    costMax: 50,
    condition: 'Un objet se trouve dans le champ de tir, un personnage chute, ou un véhicule est impliqué dans un accident.',
    description: 'Générez un dommage collatéral : casser un objet de décor (fun), causer des pertes civiles, ou infliger des dégâts à un objet explosif (explosion en fin de tour). Pour déclencher l\'explosion d\'un véhicule/vaisseau : celui-ci doit d\'abord être "Détruit ?". Vous pouvez déclencher à l\'instant du dommage ou en fin de tour.',
    tags: ['combat', 'explosions'],
  },
  {
    id: 'douleur-fantome',
    nom: 'Douleur fantôme',
    category: 'retour',
    cost: 10,
    condition: 'Un PJ est Gravement blessé, ou sa prothèse cybernétique est endommagée / ne fonctionne plus.',
    description: 'Le PJ doit réussir un test de Détermination (3). Réussite : (D+1) avec ce membre jusqu\'à fin de scène. Échec : le personnage est Confus et subit (D+1) à tous ses tests. Dans les deux cas, peut dissiper en Reprenant ses esprits.',
    tags: ['blessure', 'prothèse'],
  },
  {
    id: 'monstre-errant',
    nom: 'Monstre errant',
    category: 'retour',
    cost: 25,
    condition: 'Les PJ sont à la surface ou en orbite d\'une planète dont la Sécurité est inférieure à 3.',
    description: 'Au sol : mauvaise rencontre (hors-la-loi, pillards, vrai monstre). Nombre = taille du groupe, profil Figurant Normal ou Élite. En orbite : vaisseau agressif du même tonnage (ou inférieur + 3 chasseurs). Adversaires pas très déterminés : ratent automatiquement les tests de moral.',
    tags: ['planète', 'rencontre'],
  },
  {
    id: 'patrouille-interplanetaire',
    nom: 'Patrouille interplanétaire',
    category: 'retour',
    costFormula: 'Selon le système stellaire',
    costMin: 10,
    costMax: 30,
    condition: 'Un péril "Beauté de l\'espace" intervient, une tentative de piraterie aboutit à "Rien à l\'horizon", ou un SOS est envoyé pendant un acte de piraterie.',
    description: 'Une patrouille (au moins 1 frégate) apparaît à portée courte des senseurs. Test d\'initiative basé sur Navigation (TD si senseurs inférieurs). Peut faire des sommations avant de tirer. Pour 10d MF supplémentaires : la frégate est escortée de 3 chasseurs. Si mise à mal : la patrouille bat en retraite en appelant des renforts.',
    tags: ['espace', 'combat spatial'],
  },
  {
    id: 'police-patrouille',
    nom: 'Police ! (simple patrouille)',
    category: 'retour',
    costFormula: '(15 − Sécurité de la planète)d MF',
    costMin: 1,
    costMax: 14,
    condition: 'Les PJ participent à un combat dans l\'orbite/surface d\'une planète habitée, voyagent en vaisseau orbital, ou portent des armes visibles.',
    description: 'Une patrouille tente de mettre fin au combat avec le moins de dégâts. Mentir : un personnage sans arme peut se faire passer pour un témoin. Au sol : 6 Figurants normaux. En atmosphère : Atmo 412 de patrouille. En orbite : 1 Corvette + 3 Chasseurs.',
    tags: ['police', 'combat', 'planète'],
  },
  {
    id: 'police-intervention',
    nom: 'Police ! (équipe d\'intervention)',
    category: 'retour',
    costFormula: '(25 − Sécurité de la planète)d MF',
    costMin: 1,
    costMax: 24,
    condition: 'Identique à la patrouille, mais la situation est plus grave (alerte préalable, crime flagrant).',
    description: 'Équipe d\'intervention : neutralise tous les participants armés ou non, avec brutalité et efficacité. Au sol : 6 Figurants d\'élite. En atmosphère : véhicule aérien de patrouille. En orbite : 1 Corvette + 3 Chasseurs. Ces gars-là ne rigolent pas !',
    tags: ['police', 'combat', 'planète'],
  },
  {
    id: 'pourchasse-ganera',
    nom: 'Pourchassé par Ganera',
    category: 'retour',
    cost: 25,
    condition: 'Le délai d\'enquête galactique est écoulé (1 semaine même système, 1 mois même nation, 3 mois sinon).',
    description: 'Ganera a localisé les PJ. Ne dites rien et gérez discrètement : Test de Recherche (Difficulté = 10 – Gloire du PJ le plus glorieux). Si réussi : Ganera prépare une embuscade le lendemain (filature puis embuscade à 100 m avec 6 mercenaires). Coût affecté par les effets du retour de flamme "Vendetta".',
    tags: ['chasseur de primes', 'traque'],
  },
  {
    id: 'vaisseau-maudit-cosmetique',
    nom: 'Vaisseau maudit (dysfonctionnement cosmétique)',
    category: 'retour',
    cost: 1,
    condition: 'Le vaisseau des PJ n\'a pas été baptisé au rhum de Havana.',
    description: 'Dysfonctionnements cosmétiques : portes s\'ouvrant seules, lampes qui clignotent, radio avec parasites. Ambiance mais aucun effet mécanique.',
    tags: ['vaisseau', 'malchance'],
  },
  {
    id: 'vaisseau-maudit-mineur',
    nom: 'Vaisseau maudit (dysfonctionnement mineur)',
    category: 'retour',
    cost: 5,
    condition: 'Le vaisseau des PJ n\'a pas été baptisé au rhum de Havana.',
    description: 'Dysfonctionnement mineur : (e2f) sur un test utilisant les systèmes du vaisseau.',
    tags: ['vaisseau', 'malchance'],
  },
  {
    id: 'vaisseau-maudit-majeur',
    nom: 'Vaisseau maudit (dysfonctionnement majeur)',
    category: 'retour',
    cost: 10,
    condition: 'Le vaisseau des PJ n\'a pas été baptisé au rhum de Havana.',
    description: 'Dysfonctionnement majeur : (E2F) — malus élevé sur un test utilisant les systèmes du vaisseau.',
    tags: ['vaisseau', 'malchance'],
  },
  {
    id: 'vaisseau-maudit-critique',
    nom: 'Vaisseau maudit (dysfonctionnement critique)',
    category: 'retour',
    cost: 25,
    condition: 'Le vaisseau des PJ n\'a pas été baptisé au rhum de Havana.',
    description: 'Dysfonctionnement critique : (TD) — test pratiquement impossible sur les systèmes du vaisseau.',
    tags: ['vaisseau', 'malchance'],
  },
  {
    id: 'vendetta-defaut-5',
    nom: 'Vendetta (défaut score 5)',
    category: 'retour',
    cost: 10,
    condition: 'Le PJ a été reconnu sur cette planète ou est dans la zone d\'influence de son défaut "Wanted" ou "Vengeance" (score 5).',
    description: 'Un ennemi ou poursuivant se manifeste. Wanted : tentative de capture pour la récompense. Vengeance : le PJ repère l\'objet de sa vengeance (peut être entouré d\'une escorte ou d\'une armée).',
    tags: ['défaut', 'ennemi personnel'],
  },
  {
    id: 'vendetta-defaut-3',
    nom: 'Vendetta (défaut score 3)',
    category: 'retour',
    cost: 15,
    condition: 'Le PJ a été reconnu sur cette planète ou est dans la zone d\'influence de son défaut "Wanted" ou "Vengeance" (score 3).',
    description: 'Identique à la Vendetta score 5, mais l\'ennemi est plus déterminé. Un PNJ nommé retors tente de suivre le PJ sans se faire remarquer et l\'agresse lorsqu\'il est seul.',
    tags: ['défaut', 'ennemi personnel'],
  },
  {
    id: 'vendetta-defaut-1',
    nom: 'Vendetta (défaut score 1)',
    category: 'retour',
    cost: 25,
    condition: 'Le PJ a été reconnu sur cette planète ou est dans la zone d\'influence de son défaut "Wanted" ou "Vengeance" (score 1).',
    description: 'Vendetta la plus coûteuse — l\'ennemi est le moins développé mais le retour de flamme reste disponible même aux scores faibles.',
    tags: ['défaut', 'ennemi personnel'],
  },

  // ── Dommages collatéraux combat pirate ────────────────────────────────────
  {
    id: 'dc-console',
    nom: 'Dommage collatéral : Console / Panneau de contrôle',
    category: 'combat',
    cost: 5,
    condition: 'Une console ou un panneau de contrôle se trouve dans le champ de tir ou de combat.',
    description: 'La console subit des dommages : (e2f) aux tests qui la concernent. Peut être réparée en réparant un coup critique simple. Effet identique à un Sabotage réussi pour le panneau de contrôle.',
    tags: ['combat pirate', 'vaisseau'],
  },
  {
    id: 'dc-caisse-container',
    nom: 'Dommage collatéral : Caisse / Container',
    category: 'combat',
    cost: 10,
    condition: 'Des caisses ou containers se trouvent à 5 m ou moins des combattants (Panique à bord / Délire industriel).',
    description: 'L\'arrimage cède et le chargement vire. Personnages à 5 m ou moins : test d\'Acrobaties (3), chaque succès manquant inflige 1L.',
    tags: ['combat pirate', 'chargement'],
  },
  {
    id: 'dc-cable',
    nom: 'Dommage collatéral : Câble',
    category: 'combat',
    cost: 10,
    condition: 'Un câble est présent (duel sur la coque, combat suspendu).',
    description: '1er dommage : câble effiloché, (E2F) aux tests le concernant. 2e dommage : câble lâche, tout ce qu\'il tenait chute de la hauteur de la grue.',
    tags: ['combat pirate', 'duel coque'],
  },
  {
    id: 'dc-debris-tir-perdu',
    nom: 'Dommage collatéral : Débris / Tir perdu',
    category: 'combat',
    cost: 10,
    condition: 'Le vaisseau évolue dans un environnement encombré (champ d\'astéroïdes, cimetière d\'épaves, orbite planétaire) ou participe à un combat spatial.',
    description: 'Confrontez un combattant à un débris ou un tir perdu. Il doit réussir un test d\'Acrobaties (3) ou subir 1L par succès manquant.',
    tags: ['combat pirate', 'espace'],
  },
  {
    id: 'dc-hyperpropulsion',
    nom: 'Dommage collatéral : Hyperpropulsion',
    category: 'combat',
    cost: 25,
    condition: 'L\'hyperpropulsion du vaisseau est exposée aux dommages collatéraux.',
    description: '1er dommage : panne de l\'hyperpropulsion. 2e dommage : hyperpropulsion détruite. Si le vaisseau est en hyperespace lors du 2e dommage : il est désintégré.',
    tags: ['combat pirate', 'vaisseau'],
  },
  {
    id: 'dc-collision-majeure',
    nom: 'Dommage collatéral : Collision majeure',
    category: 'combat',
    cost: 25,
    condition: 'Le vaisseau spatial est impliqué dans un combat spatial non piloté par un PJ, ou est éperonné.',
    description: 'Un vaisseau percute et s\'enfonce dans la coque. L\'élément mobile débute à (Engagement) mètres des PJ et avance de (Engagement) mètres par tour. Aire d\'effet 3 m : test Acrobaties (5) ou 1L/succès manquant (une seule fois). Pour +10d MF : la collision affecte un élément de décor supplémentaire. Chaque collision inflige 3G au vaisseau.',
    tags: ['combat pirate', 'espace', 'explosions'],
  },
  {
    id: 'dc-grue',
    nom: 'Dommage collatéral : Grue',
    category: 'combat',
    cost: 25,
    condition: 'Une grue industrielle est présente dans le combat (combat suspendu).',
    description: '1er dommage : la grue penche, (D+1) à toutes les actions qui y sont effectuées. 2e dommage : la grue s\'effondre. Plusieurs grues impliquées peuvent provoquer une collision majeure.',
    tags: ['combat pirate', 'industriel'],
  },
  {
    id: 'dc-verriere',
    nom: 'Dommage collatéral : Verrière',
    category: 'combat',
    cost: 25,
    condition: 'Une verrière est présente (traitée comme la coque du vaisseau pour les dommages).',
    description: 'Traitez cet élément comme la coque. 1er dommage : dépressurisation (II). Chaque nouveau dommage augmente d\'un niveau la dépressurisation.\nNote : en zone dépressurisée (IV-V), obtenir un cessez-le-feu est plus facile (TF).',
    tags: ['combat pirate', 'vaisseau'],
  },
  {
    id: 'dc-pile-containers',
    nom: 'Dommage collatéral : Pile de containers',
    category: 'combat',
    cost: 25,
    condition: 'Une pile de containers est présente (Délire industriel).',
    description: 'La pile s\'effondre et déclenche un Domino industriel. Pour 5d MF : faire chuter un combattant d\'1 étage. Pour 10d MF : le faire tomber en bas de la pile. Domino industriel : aire d\'effet = hauteur de la pile, avance de (Engagement) mètres/tour. Pour +25d MF supplémentaires : toutes les piles s\'effondrent simultanément.',
    tags: ['combat pirate', 'industriel'],
  },
  {
    id: 'dc-coque',
    nom: 'Dommage collatéral : Coque du vaisseau',
    category: 'combat',
    cost: 50,
    condition: 'La coque du vaisseau est exposée aux dommages collatéraux (Panique à bord / Duel sur la coque).',
    description: '1er dommage : dépressurisation (II). Chaque nouveau dommage augmente d\'un niveau. Zone dépressurisée (IV-V) : test Négociation/Trempe pour cessez-le-feu bénéficie de (TF). Rappel : les attaques localisées peuvent blesser les personnages à bord.',
    tags: ['combat pirate', 'vaisseau', 'dépressurisation'],
  },
  {
    id: 'dc-generateur',
    nom: 'Dommage collatéral : Générateur atomique',
    category: 'combat',
    cost: 50,
    condition: 'Le générateur atomique du vaisseau est exposé aux dommages collatéraux.',
    description: '1er dommage : fuite de Radix. Après le combat : irradiation de 250 Rads pour tous les protagonistes présents. 2e dommage : le générateur explose, détruisant le vaisseau et tuant tous les personnages à bord.\nNote : si le générateur est touché, obtenir un cessez-le-feu est plus facile (TF) pour tous à bord.',
    tags: ['combat pirate', 'vaisseau', 'radiation'],
  },

  // ── Dépenses voyage planétaire ────────────────────────────────────────────
  {
    id: 'alimentation-defectueuse',
    nom: 'Alimentation défectueuse : éteindre un appareil',
    category: 'voyage',
    cost: 10,
    condition: 'Le générateur ou les systèmes de raccordement sont défectueux (statut "Défectueuse").',
    description: 'Dépensez 10d MF pour éteindre momentanément un appareil que vous êtes en train d\'utiliser. L\'utilisation des appareils subit déjà (D+1) en régime défectueux.',
    tags: ['vaisseau', 'alimentation'],
  },
];

// ── Numéros de page (Guide du Meneur v1.5) ────────────────────────────────────

const MF_PAGES = {
  'alerte-pillards':           95,
  'alerte-base-militaire':     95,
  'alerte-gratuite':           95,
  'baston':                    95,
  'controle-douanes':          95,
  'dommages-collatéraux':      96,
  'douleur-fantome':           96,
  'monstre-errant':            96,
  'patrouille-interplanetaire':97,
  'police-patrouille':         97,
  'police-intervention':       97,
  'pourchasse-ganera':         97,
  'vaisseau-maudit-cosmetique':97,
  'vaisseau-maudit-mineur':    97,
  'vaisseau-maudit-majeur':    97,
  'vaisseau-maudit-critique':  97,
  'vendetta-defaut-5':         98,
  'vendetta-defaut-3':         98,
  'vendetta-defaut-1':         98,
  'dc-console':                99,
  'dc-caisse-container':       99,
  'dc-cable':                  101,
  'dc-debris-tir-perdu':       100,
  'dc-hyperpropulsion':        99,
  'dc-collision-majeure':      100,
  'dc-grue':                   101,
  'dc-verriere':               99,
  'dc-pile-containers':        101,
  'dc-coque':                  99,
  'dc-generateur':             99,
  'alimentation-defectueuse':  94,
};

// ── Modal state ───────────────────────────────────────────────────────────────

let modalSpending  = null;
let modalDirection = 'mj_to_pj';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCostForCard(spending) {
  if (spending.cost !== undefined) return spending.cost;
  if (spending.costMin !== undefined) return spending.costMin;
  return 0;
}

function isAffordable(spending, mjPool) {
  const cost = getCostForCard(spending);
  return cost <= mjPool;
}

const CATEGORY_LABELS = {
  retour: 'Retour de flamme',
  combat: 'Combat pirate',
  voyage: 'Voyage',
};

const CATEGORY_COLORS = {
  retour: 'bg-red-900 text-red-200',
  combat: 'bg-blue-900 text-blue-200',
  voyage: 'bg-purple-900 text-purple-200',
};

function formatCost(spending) {
  if (spending.cost === 0) return '0d MF <span class="text-xs font-normal text-green-400">(gratuit)</span>';
  if (spending.cost !== undefined) return `${spending.cost}d MF`;
  if (spending.costFormula) return `${esc(spending.costFormula)}`;
  return '?d MF';
}

function renderCard(spending, mjPool) {
  const affordable = isAffordable(spending, mjPool);
  const costStr = formatCost(spending);
  const catLabel = CATEGORY_LABELS[spending.category] || spending.category;
  const catColor = CATEGORY_COLORS[spending.category] || 'bg-gray-700 text-gray-200';
  const costClass = affordable ? 'affordable' : 'unaffordable';
  const cardClass = affordable ? 'available' : 'unavailable';
  const page = MF_PAGES[spending.id];
  const pageLabel = page ? `<span class="text-xs text-gray-600">p. ${page}</span>` : '';

  return `
  <div class="mf-card ${cardClass} cursor-pointer" data-spending-id="${esc(spending.id)}">
    <div class="flex items-start justify-between gap-2 mb-2">
      <h3 class="font-semibold text-sm leading-tight">${esc(spending.nom)}</h3>
      <div class="flex flex-col items-end gap-0.5 shrink-0">
        <span class="mf-cost ${costClass}">${costStr}</span>
        ${pageLabel}
      </div>
    </div>
    <div class="flex items-center gap-2 mb-3">
      <span class="mf-category-badge ${catColor}">${esc(catLabel)}</span>
      ${spending.tags.slice(0,2).map(t => `<span class="text-xs text-gray-500">#${esc(t)}</span>`).join('')}
    </div>
    <div class="mb-2">
      <p class="text-xs text-gray-400 font-semibold mb-1">Condition</p>
      <p class="text-xs text-gray-300 leading-relaxed">${esc(spending.condition)}</p>
    </div>
    <div>
      <p class="text-xs text-gray-400 font-semibold mb-1">Effet</p>
      <p class="text-xs text-gray-300 leading-relaxed whitespace-pre-line">${esc(spending.description)}</p>
    </div>
  </div>`;
}

// ── Pool bar ──────────────────────────────────────────────────────────────────

function updatePoolBar(mjPool) {
  const pct = Math.round((mjPool / 50) * 100);
  const bar = document.getElementById('mf-pool-bar');
  const val = document.getElementById('mj-pool-value');
  const lbl = document.getElementById('mf-tension-label');
  if (!bar) return;

  val.textContent = mjPool;
  bar.style.width = `${pct}%`;

  if (mjPool >= 30) {
    bar.className = 'mf-pool-bar-fill h-3 rounded-full bg-red-600';
    lbl.textContent = 'DANGER';
    lbl.className = 'font-medium text-red-400';
  } else if (mjPool >= 20) {
    bar.className = 'mf-pool-bar-fill h-3 rounded-full bg-orange-500';
    lbl.textContent = 'Haute';
    lbl.className = 'font-medium text-orange-400';
  } else if (mjPool >= 10) {
    bar.className = 'mf-pool-bar-fill h-3 rounded-full bg-yellow-500';
    lbl.textContent = 'Modérée';
    lbl.className = 'font-medium text-yellow-400';
  } else {
    bar.className = 'mf-pool-bar-fill h-3 rounded-full bg-green-600';
    lbl.textContent = 'Basse';
    lbl.className = 'font-medium text-green-400';
  }
}

// ── Render cards ──────────────────────────────────────────────────────────────

function renderCards(mjPool) {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'available';
  const catFilter = document.getElementById('filter-category')?.value || '';

  let filtered = MF_SPENDINGS;
  if (catFilter) filtered = filtered.filter(s => s.category === catFilter);

  const available  = filtered.filter(s => isAffordable(s, mjPool));
  const unavailable = filtered.filter(s => !isAffordable(s, mjPool));

  document.getElementById('count-available').textContent   = available.length;
  document.getElementById('count-unavailable').textContent = unavailable.length;

  const shown = activeTab === 'available' ? available : unavailable;
  document.getElementById('cards-container').innerHTML = shown.length
    ? shown.map(s => renderCard(s, mjPool)).join('')
    : `<p class="text-gray-500 text-sm col-span-2 py-8 text-center">Aucune dépense dans cette catégorie.</p>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openSpendModal(spendingId) {
  const spending = MF_SPENDINGS.find(s => s.id === spendingId);
  if (!spending) return;

  modalSpending  = spending;
  modalDirection = 'mj_to_pj';

  // Reset error
  const errEl = document.getElementById('modal-error');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

  renderModalContent();
  document.getElementById('spend-modal').classList.remove('hidden');
}

function closeSpendModal() {
  document.getElementById('spend-modal').classList.add('hidden');
  // Reset button state for next opening
  const btn = document.getElementById('modal-confirm-btn');
  const lbl = document.getElementById('modal-confirm-label');
  if (btn) btn.disabled = false;
  if (lbl) lbl.textContent = 'Confirmer';
  modalSpending = null;
}

function selectModalDirection(dir) {
  modalDirection = dir;
  const mjBtn = document.getElementById('modal-btn-mj');
  const pjBtn = document.getElementById('modal-btn-pj');
  if (mjBtn) mjBtn.className = `flex-1 py-2 rounded text-sm font-medium border transition-colors ${dir === 'mj_to_pj' ? 'border-yellow-600 text-yellow-300 bg-yellow-900/30' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`;
  if (pjBtn) pjBtn.className = `flex-1 py-2 rounded text-sm font-medium border transition-colors ${dir === 'pj_to_mj' ? 'border-blue-600 text-blue-300 bg-blue-900/30'   : 'border-gray-600 text-gray-400 hover:border-gray-400'}`;
  updateModalSummary();
}

function getModalCost() {
  if (!modalSpending) return 0;
  if (modalSpending.cost !== undefined) return modalSpending.cost;
  const input = document.getElementById('modal-cost-input');
  return input ? (parseInt(input.value, 10) || 0) : 0;
}

function updateModalSummary() {
  const summary = document.getElementById('modal-summary');
  if (!summary || !modalSpending) return;

  const cost = getModalCost();
  if (cost === 0 && modalSpending.cost === 0) {
    summary.innerHTML = '<span class="text-green-400">Gratuit — aucun transfert.</span>';
    return;
  }

  const pjPool = 50 - currentMjPool;
  const affordable = modalDirection === 'mj_to_pj' ? cost <= currentMjPool : cost <= pjPool;
  const from  = modalDirection === 'mj_to_pj' ? `Réserve MJ (${currentMjPool}d)` : `Réserve PJ (${pjPool}d)`;
  const to    = modalDirection === 'mj_to_pj' ? 'Réserve PJ' : 'Réserve MJ';
  const color = affordable ? 'text-yellow-300' : 'text-red-400';
  summary.innerHTML = `<span class="${color}">${cost}d MF : ${from} → ${to}${affordable ? '' : ' — réserve insuffisante !'}</span>`;
}

function renderModalContent() {
  const s = modalSpending;
  const page = MF_PAGES[s.id];

  document.getElementById('modal-title').textContent = s.nom;
  document.getElementById('modal-page').textContent  = page ? `Guide du Meneur, p. ${page}` : '';

  let html = '';

  // Variable cost input
  const hasVariable = s.cost === undefined;
  if (hasVariable) {
    const def = s.costMin ?? 1;
    const min = s.costMin ?? 0;
    const max = s.costMax ?? 50;
    html += `
      <div class="mb-4">
        <label class="text-sm text-gray-400 block mb-1">Coût exact</label>
        <div class="flex items-center gap-2">
          <input id="modal-cost-input" type="number" min="${min}" max="${max}" value="${def}"
            class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm w-24 text-gray-100 focus:outline-none focus:border-yellow-500">
          <span class="text-sm text-gray-400">d MF</span>
          <span class="text-xs text-gray-500">(${min}–${max})</span>
        </div>
        <p class="text-xs text-gray-600 mt-1">${esc(s.costFormula || '')}</p>
      </div>`;
  }

  // Source choice for non-retour
  if (s.category !== 'retour') {
    html += `
      <div class="mb-4">
        <p class="text-sm text-gray-400 mb-2">Qui dépense ?</p>
        <div class="flex gap-3">
          <button id="modal-btn-mj" class="flex-1 py-2 rounded text-sm font-medium border transition-colors border-yellow-600 text-yellow-300 bg-yellow-900/30">🎲 MJ</button>
          <button id="modal-btn-pj" class="flex-1 py-2 rounded text-sm font-medium border transition-colors border-gray-600 text-gray-400 hover:border-gray-400">🎮 PJ</button>
        </div>
      </div>`;
  }

  document.getElementById('modal-body').innerHTML = html;

  // Wire dynamic listeners
  document.getElementById('modal-cost-input')?.addEventListener('input', updateModalSummary);
  document.getElementById('modal-btn-mj')?.addEventListener('click', () => selectModalDirection('mj_to_pj'));
  document.getElementById('modal-btn-pj')?.addEventListener('click', () => selectModalDirection('pj_to_mj'));

  updateModalSummary();
}

async function confirmSpend() {
  if (!modalSpending) return;

  const cost = getModalCost();
  // Free spending: just close
  if (cost === 0 && modalSpending.cost === 0) { closeSpendModal(); return; }

  const btn = document.getElementById('modal-confirm-btn');
  const lbl = document.getElementById('modal-confirm-label');
  if (btn) btn.disabled = true;
  if (lbl) lbl.textContent = '…';

  const errEl = document.getElementById('modal-error');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

  try {
    const res = await fetchWithTable('/api/mf-pool/transfer', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: cost, direction: modalDirection }),
    });
    const json = await res.json();

    if (!res.ok) {
      const msg = json.error?.message || 'Réserve insuffisante.';
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = 'Confirmer';
      return;
    }

    currentMjPool = json.data.mj_pool;
    updatePoolBar(currentMjPool);
    renderCards(currentMjPool);
    closeSpendModal();
  } catch {
    if (errEl) { errEl.textContent = 'Erreur de connexion.'; errEl.classList.remove('hidden'); }
    if (btn) btn.disabled = false;
    if (lbl) lbl.textContent = 'Confirmer';
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let currentMjPool = 0;

async function init() {
  await initHeader();

  // Check MJ access
  if (!isMJ()) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('access-denied').classList.remove('hidden');
    return;
  }

  const tableId = getActiveTableId();
  if (!tableId) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('access-denied').classList.remove('hidden');
    return;
  }

  // Fetch MF pool
  try {
    const res = await fetchWithTable('/api/mf-pool', { credentials: 'include' });
    if (!res.ok) throw new Error('fetch failed');
    const { data } = await res.json();
    currentMjPool = data.mj_pool ?? 0;
  } catch {
    currentMjPool = 0;
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  updatePoolBar(currentMjPool);
  renderCards(currentMjPool);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCards(currentMjPool);
    });
  });

  // Category filter
  document.getElementById('filter-category').addEventListener('change', () => {
    renderCards(currentMjPool);
  });

  // Card click → open spend modal (event delegation)
  document.getElementById('cards-container').addEventListener('click', (e) => {
    const card = e.target.closest('[data-spending-id]');
    if (!card) return;
    openSpendModal(card.dataset.spendingId);
  });

  // Modal buttons
  document.getElementById('modal-cancel-btn').addEventListener('click', closeSpendModal);
  document.getElementById('modal-cancel-btn-bottom').addEventListener('click', closeSpendModal);
  document.getElementById('modal-confirm-btn').addEventListener('click', confirmSpend);
  document.getElementById('spend-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('spend-modal')) closeSpendModal();
  });

  // Poll MF pool every 5s to stay in sync
  setInterval(async () => {
    try {
      const res = await fetchWithTable('/api/mf-pool', { credentials: 'include' });
      if (!res.ok) return;
      const { data } = await res.json();
      const newPool = data.mj_pool ?? 0;
      if (newPool !== currentMjPool) {
        currentMjPool = newPool;
        updatePoolBar(currentMjPool);
        renderCards(currentMjPool);
      }
    } catch { /* ignore */ }
  }, 5000);
}

init();
