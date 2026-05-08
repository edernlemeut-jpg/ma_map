// Migration 009c — Insert newly discovered secondary systems
// Sources: MA05/P&P, MA07, MA08, MA09, MA11, MA12

const Database = require('better-sqlite3');
const db = new Database('db/ma.db');

const newSystems = [
  // --- MA07 (Sol faction, page 70) ---
  {
    nom: 'Armurie',
    categorie: 'Armement',
    localisation: 'Quartiers',
    installation: 1,
    description: 'Les armes de l\'équipage sont stockées dans des éléments stratégiques du vaisseau, avec diverses pièces forgées. Confère SC pour les tests de Commandement [armurie]. Nécessite 10% de mousses en plus.',
    source: 'MA07'
  },
  {
    nom: 'Fronture d\'armes',
    categorie: 'Armement',
    localisation: 'Coque',
    installation: 1,
    description: 'La coque est retravaillée pour permettre d\'ajouter une arme à chaque batterie. Permet d\'ajouter une arme par batterie. Réservé aux chasseurs.',
    source: 'MA07'
  },
  {
    nom: 'Salle de réception',
    categorie: 'Confort',
    localisation: 'Quartiers',
    installation: 2,
    description: 'Le réfectoire est réaménagé pour accueillir des invités autour de tables. Confère SC aux tests de Négociation. Nécessite 10% de mousses en plus.',
    source: 'MA07'
  },
  {
    nom: 'Torpilles additionnelles',
    categorie: 'Armement',
    localisation: 'Armement',
    installation: 1,
    description: 'Des emplacements supplémentaires sont prévus pour stocker 10 torpilles additionnelles.',
    source: 'MA07'
  },

  // --- MA08 (Ligue faction, page 74) ---
  {
    nom: 'Laboratoire',
    categorie: 'Sciences',
    localisation: 'Quartiers',
    installation: 1,
    description: 'Une partie des quartiers est cloisonnée pour constituer une salle stérile équipée d\'instruments scientifiques et d\'une armoire de réactifs. Confère SC pour les tests d\'Analyse, de Recherche et de Sciences stellaires.',
    source: 'MA08'
  },
  {
    nom: 'Visiosuite',
    categorie: 'Senseurs',
    localisation: 'Senseurs',
    installation: 1,
    description: 'Plusieurs capteurs sont installés dans la soute. Permet de voir vers l\'intérieur d\'un vaisseau ennemi.',
    source: 'MA08'
  },

  // --- MA09 (Empire galactique, pages 71-72) ---
  {
    nom: 'Blindage renforcé',
    categorie: 'Coque',
    localisation: 'Coque',
    installation: 3,
    description: 'Blindage renforcé conçu par des ingénieurs impériaux. Permet de rendre le blindage égal à celui du tonnage supérieur. Les armes plus légères ne font aucun dégât.',
    source: 'MA09'
  },
  {
    nom: 'Calculateur de tir',
    categorie: 'Armement',
    localisation: 'Armement',
    installation: 1,
    description: 'Envoie aux canonniers les informations des senseurs pour aider à viser. Confère SC aux tests de tir. Nécessite de préciser la cible pour la résolution.',
    source: 'MA09'
  },
  {
    nom: 'Centre de commandement',
    categorie: 'Commandement',
    localisation: 'Vigies',
    installation: 2,
    description: 'Confère SC aux tests de Stratégie en bataille spatiale. Le personnage peut se faire aider. Nécessite 10% de vigies en plus.',
    source: 'MA09'
  },
  {
    nom: 'Micro-senseurs',
    categorie: 'Senseurs',
    localisation: 'Senseurs',
    installation: 1,
    description: 'Permet à la vigie, lors d\'une Analyse radar, de détecter les systèmes secondaires d\'un système principal au titre d\'une information supplémentaire.',
    source: 'MA09'
  },

  // --- MA11 (Havana, page 172) ---
  {
    nom: 'Nitro',
    categorie: 'Propulsion',
    localisation: 'Propulsion',
    installation: 1,
    description: 'Injecteur de Radix directement raccordé aux propulseurs. Requiert une pile de 500 PC dimensionnée au tonnage. Action simple pour activer ; consomme 500 PC de Radix et ajoute 125 K/t à la vitesse tactique jusqu\'à la fin du tour.',
    source: 'MA11'
  },

  // --- MA12 (Aliens) ---
  {
    nom: 'Canon psychique',
    categorie: 'Armement',
    localisation: 'Armement',
    installation: 1,
    description: 'Cristaux énergétiques montés sur le projecteur d\'énergie du canon, reliés au générateur. L\'arme ignore un point de Blindage. Chaque tir consomme 25, 50 ou 100 PC d\'autonomie selon la catégorie du canon. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Démontage rapide',
    categorie: 'Propulsion',
    localisation: 'Générateur',
    installation: 1,
    description: 'Le châssis du cristal énergétique est modifié pour pouvoir être ouvert rapidement. Permet de changer le cristal en 1 h avec un test d\'Ingénierie (1) ; l\'autonomie du vaisseau devient égale à celle du nouveau cristal. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Esprit guérisseur',
    categorie: 'Coque',
    localisation: 'Coque',
    installation: 1,
    description: 'Un construct est enchâssé dans la coque. Au titre d\'une action complexe, s\'active et permet au vaisseau de regagner des PdS (1 pour 10 t, 2 pour 100 t, 3 pour 1000 t, etc.). Ne peut être réutilisé jusqu\'à la prochaine recharge. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Module de guerre cognitique',
    categorie: 'Électronique',
    localisation: 'Senseurs',
    installation: 1,
    description: 'L\'émetteur est remplacé par un module capable de moduler finement sa longueur d\'onde. Permet de mener des assauts cognitiques. Les programmes (I) de l\'AstroCog des senseurs peuvent prendre pour cible des vaisseaux à portée courte.',
    source: 'MA12'
  },
  {
    nom: 'Monture d\'arme',
    categorie: 'Armement',
    localisation: 'Armement',
    installation: 1,
    description: 'Le point de fixation de la batterie sur la coque est modifié pour recevoir une nouvelle arme. Permet d\'ajouter une arme à chaque batterie d\'un arc de tir. Réservé aux chasseurs. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Multicockpit',
    categorie: 'Pilotage',
    localisation: 'Poste de pilotage',
    installation: 1,
    description: 'Les consoles du poste de pilotage sont modifiées et reliées entre elles. Chaque poste peut désormais servir à la vigie ou au pilotage. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Sas morphique',
    categorie: 'Tactique',
    localisation: 'Coque',
    installation: 1,
    description: 'La porte extérieure du sas est équipée d\'un boyau rétractable en matériaux morphiques. Fonctionne comme un sas d\'abordage et peut s\'adapter à tous les standards de sas. Origine : Alien.',
    source: 'MA12'
  },
  {
    nom: 'Senseurs hyperspatiaux',
    categorie: 'Senseurs',
    localisation: 'Senseurs',
    installation: 3,
    description: 'Capteurs expérimentaux et nouveaux câblages intégrés aux senseurs. Confère SC pour détecter les périls hyperspatiaux et permet d\'effectuer des tests de Senseurs pour détecter et analyser ce qui se trouve de l\'autre côté d\'un tunnel hyperspatial. Origine : AdD.',
    source: 'MA12'
  },
  {
    nom: 'Senseurs planétaires',
    categorie: 'Senseurs',
    localisation: 'Senseurs',
    installation: 3,
    description: 'Capteurs expérimentaux et câblages intégrés aux senseurs. Confère SC pour scanner une planète en orbite ou effectuer une Reconnaissance aérienne. Origine : AdD.',
    source: 'MA12'
  },
  {
    nom: 'Visioscope',
    categorie: 'Communication',
    localisation: 'Senseurs',
    installation: 1,
    description: 'Une caméra et un projecteur holographique sont ajoutés à la console des senseurs. Les personnages dans le poste de pilotage peuvent voir et être vus lors d\'une conversation radio si les deux vaisseaux sont équipés d\'un visioscope. Origine : AdC.',
    source: 'MA12'
  },

  // --- MA05/P&P ---
  {
    nom: 'Haillon amélioré',
    categorie: 'Soute',
    localisation: 'Soute',
    installation: 1,
    description: 'Haillon de soute amélioré permettant un accès facilité aux marchandises et un chargement/déchargement optimisé.',
    source: 'MA05'
  },
];

// stmt defined later based on columns

// Check which columns exist
const cols = db.prepare("PRAGMA table_info(secondary_systems)").all().map(r => r.name);
console.log('Columns:', cols.join(', '));

// Check for 'source' column
const hasSource = cols.includes('source');
const hasDescription = cols.includes('description');

let inserted = 0;
let skipped = 0;

for (const sys of newSystems) {
  // Check if already exists
  const existing = db.prepare('SELECT id FROM secondary_systems WHERE nom = ?').get(sys.nom);
  if (existing) {
    console.log(`SKIP (already exists): ${sys.nom}`);
    skipped++;
    continue;
  }

  try {
    if (hasSource && hasDescription) {
      stmt.run(sys);
    } else if (hasDescription) {
      db.prepare('INSERT INTO secondary_systems (nom, categorie, localisation, installation, description) VALUES (?, ?, ?, ?, ?)')
        .run(sys.nom, sys.categorie, sys.localisation, sys.installation, sys.description);
    } else {
      db.prepare('INSERT INTO secondary_systems (nom, categorie, localisation, installation) VALUES (?, ?, ?, ?)')
        .run(sys.nom, sys.categorie, sys.localisation, sys.installation);
    }
    console.log(`INSERT: ${sys.nom}`);
    inserted++;
  } catch (e) {
    console.error(`ERROR inserting ${sys.nom}: ${e.message}`);
  }
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
console.log('Total:', db.prepare('SELECT COUNT(*) as c FROM secondary_systems').get().c);

db.close();
