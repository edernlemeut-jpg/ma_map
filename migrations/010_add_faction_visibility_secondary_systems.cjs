// Migration 010 — Add faction_id column + fix source_livre for new secondary systems
// Also creates table_visibility_overrides entries for secondary_systems entity type

const Database = require('better-sqlite3');
const db = new Database('db/ma.db');

// 1. Add faction_id column if missing
const cols = db.prepare('PRAGMA table_info(secondary_systems)').all().map(r => r.name);
if (!cols.includes('faction_id')) {
  db.prepare('ALTER TABLE secondary_systems ADD COLUMN faction_id INTEGER REFERENCES factions(id)').run();
  console.log('Added column: faction_id');
} else {
  console.log('Column faction_id already exists, skipping.');
}

// 2. Faction IDs (from SELECT id, name FROM factions)
//    1 = Barrens, 2 = Ligue des Planètes Libres, 3 = Empire Galactique
//    4 = Omni-Cartel Galactique, 5 = Empire de Sol, 6 = Pirates
//    637 = Shava, 638 = Daemon, 639 = Insoumis

const factions = db.prepare('SELECT id, name FROM factions').all();
const fMap = {};
factions.forEach(f => { fMap[f.name] = f.id; });

// 3. Set source_livre for newly inserted systems (currently null)
//    and assign faction_id based on the supplement they came from

const updates = [
  // MA07 — Empire de Sol faction supplement
  { nom: 'Armurie',                 source_livre: 'MA07 p.70', faction_id: fMap['Empire de Sol'] },
  { nom: "Fronture d'armes",        source_livre: 'MA07 p.70', faction_id: fMap['Empire de Sol'] },
  { nom: 'Salle de réception',      source_livre: 'MA07 p.70', faction_id: fMap['Empire de Sol'] },
  { nom: 'Torpilles additionnelles',source_livre: 'MA07 p.70', faction_id: fMap['Empire de Sol'] },

  // MA08 — Ligue des Planètes Libres supplement
  { nom: 'Laboratoire',             source_livre: 'MA08 p.74', faction_id: fMap['Ligue des Planètes Libres'] },
  { nom: 'Visiosuite',              source_livre: 'MA08 p.74', faction_id: fMap['Ligue des Planètes Libres'] },

  // MA09 — Empire Galactique supplement
  { nom: 'Blindage renforcé',       source_livre: 'MA09 p.71', faction_id: fMap['Empire Galactique'] },
  { nom: 'Calculateur de tir',      source_livre: 'MA09 p.71', faction_id: fMap['Empire Galactique'] },
  { nom: 'Centre de commandement',  source_livre: 'MA09 p.72', faction_id: fMap['Empire Galactique'] },
  { nom: 'Micro-senseurs',          source_livre: 'MA09 p.71', faction_id: fMap['Empire Galactique'] },

  // MA11 — Pirates supplement (Havana)
  { nom: 'Nitro',                   source_livre: 'MA11 (Havana) p.172', faction_id: fMap['Pirates'] },

  // MA12 — Alien / AdD / AdC (cross-faction, no specific faction)
  { nom: 'Canon psychique',         source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: 'Démontage rapide',        source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: "Esprit guérisseur",       source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: 'Module de guerre cognitique', source_livre: 'MA12 p.111 (AdC)', faction_id: null },
  { nom: "Monture d'arme",          source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: 'Multicockpit',            source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: 'Sas morphique',           source_livre: 'MA12 p.95 (Alien)', faction_id: null },
  { nom: 'Senseurs hyperspatiaux',  source_livre: 'MA12 p.101 (AdD)', faction_id: null },
  { nom: 'Senseurs planétaires',    source_livre: 'MA12 p.101 (AdD)', faction_id: null },
  { nom: 'Visioscope',              source_livre: 'MA12 p.111 (AdC)', faction_id: null },

  // MA05 / P&P — general (Infernal Trader, no specific faction)
  { nom: 'Haillon amélioré',        source_livre: 'MA05 (P&P) p.68', faction_id: null },
];

const stmt = db.prepare('UPDATE secondary_systems SET source_livre = ?, faction_id = ? WHERE nom = ?');
let updated = 0;
for (const u of updates) {
  const r = stmt.run(u.source_livre, u.faction_id, u.nom);
  if (r.changes > 0) {
    console.log(`Updated: ${u.nom} → source: ${u.source_livre}, faction_id: ${u.faction_id}`);
    updated++;
  } else {
    console.log(`Not found (skip): ${u.nom}`);
  }
}

// 4. Also update existing MA11 systems with Pirates faction
const ma11Pirates = [
  'Cambuse', 'Pavillon mécanique', 'Accumulateur "Gil de Lynx"', 'Ancre gravitationnelle',
  'Contrôles personnalisés', 'Sas sécurisé', 'Soute auxiliaire', 'Soute secrète',
  'Système d\'évacuation', 'Lanseur de sondes', 'Module double dose',
  'Cabines de luxe', 'Console mémorielle', 'Salle des cartes', 'Lanceur de sondes'
];
const stmtFaction = db.prepare("UPDATE secondary_systems SET faction_id = ? WHERE nom = ? AND source_livre LIKE 'MA11%' AND faction_id IS NULL");
for (const nom of ma11Pirates) {
  const r = stmtFaction.run(fMap['Pirates'], nom);
  if (r.changes > 0) console.log(`Set Pirates faction: ${nom}`);
}

// Fer & Sang → Empire Galactique
const ferSangNames = ['Coordinateur de tir', 'Module anti-torpilles', 'Sas de débarquement', 'Senseurs CCME', 'Blindage supplémentaire'];
const stmtFS = db.prepare("UPDATE secondary_systems SET faction_id = ? WHERE nom = ? AND source_livre LIKE 'Fer & Sang%'");
for (const nom of ferSangNames) {
  const r = stmtFS.run(fMap['Empire Galactique'], nom);
  if (r.changes > 0) console.log(`Set Empire Galactique faction (Fer & Sang): ${nom}`);
}

// Guerres & Donjons → Empire Galactique
db.prepare("UPDATE secondary_systems SET faction_id = ? WHERE source_livre LIKE 'Guerres & Donjons%'")
  .run(fMap['Empire Galactique']);
console.log('Set Empire Galactique faction for Guerres & Donjons systems');

// Sciences & Infini → OCC (Omni-Cartel Galactique)
db.prepare("UPDATE secondary_systems SET faction_id = ? WHERE source_livre LIKE 'Sciences & Infini%'")
  .run(fMap['Omni-Cartel Galactique']);
console.log('Set OCC faction for Sciences & Infini systems');

console.log(`\nMigration 010 done. ${updated} new system sources updated.`);
console.log('Final state:');
db.prepare('SELECT nom, source_livre, faction_id FROM secondary_systems ORDER BY faction_id NULLS LAST, nom')
  .all().forEach(r => console.log(`  ${String(r.faction_id ?? 'null').padStart(4)} | ${(r.source_livre || '').padEnd(35)} | ${r.nom}`));

db.close();
