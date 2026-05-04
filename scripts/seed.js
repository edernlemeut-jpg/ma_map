import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../src/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), 'utf-8'));
}

function seed() {
  console.log('🌱 Seeding database...');

  seedSystems();
  seedPerils();
  seedGalacticEvents();
  seedShipModels();
  seedAdminSystems();
  seedSecondarySystems();
  upsertSystems();

  console.log('✅ Seed complete');
}

function seedSystems() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM systems').get().c;
  if (existing > 0) {
    console.log(`  ⏭️  systems: ${existing} rows already exist — skipping`);
    return;
  }

  const data = loadJSON('quadrants_MA.json');
  const factions = new Set();

  const insertSystem = db.prepare(`
    INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)
    VALUES (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description, @soleil_json, @corps_celestes_json, @patrouilles_json)
  `);

  const insertMany = db.transaction(() => {
    let count = 0;
    for (const [quadrant, systems] of Object.entries(data)) {
      for (const sys of systems) {
        if (sys.faction) factions.add(sys.faction);
        insertSystem.run({
          quadrant,
          nom: sys.nom || '',
          faction: sys.faction || '',
          is_frontiere: sys.isFrontiere ? 1 : 0,
          route: sys.route || '',
          gouvernement: sys.gouvernement || '',
          description: sys.description || '',
          soleil_json: JSON.stringify(sys.soleil || {}),
          corps_celestes_json: JSON.stringify(sys.corpsCelestes || []),
          patrouilles_json: JSON.stringify(sys.patrouilles || [])
        });
        count++;
      }
    }
    console.log(`  ✅ systems: ${count} rows inserted`);
  });

  insertMany();

  // Seed factions extracted from systems
  const existingFactions = db.prepare('SELECT COUNT(*) AS c FROM factions').get().c;
  if (existingFactions === 0 && factions.size > 0) {
    const insertFaction = db.prepare('INSERT INTO factions (name) VALUES (?)');
    const insertFactions = db.transaction(() => {
      for (const name of factions) {
        insertFaction.run(name);
      }
      console.log(`  ✅ factions: ${factions.size} rows inserted`);
    });
    insertFactions();
  }
}

function seedPerils() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM peril_data').get().c;
  if (existing > 0) {
    console.log(`  ⏭️  peril_data: ${existing} rows already exist — skipping`);
    return;
  }

  const data = loadJSON('perils_data.json');

  const insert = db.prepare('INSERT INTO peril_data (type, data_json) VALUES (?, ?)');
  const insertMany = db.transaction(() => {
    let count = 0;
    for (const [type, value] of Object.entries(data)) {
      insert.run(type, JSON.stringify(value));
      count++;
    }
    console.log(`  ✅ peril_data: ${count} rows inserted`);
  });

  insertMany();
}

function seedGalacticEvents() {
  // galactic_events stored as notes for now (global reference data)
  // Will be properly integrated when calendar feature is built
  try {
    const data = loadJSON('donnee_base/galactic_events.json');
    console.log(`  ℹ️  galactic_events: ${data.length} events found (will be used by calendar feature)`);
  } catch {
    console.log('  ⏭️  donnee_base/galactic_events.json not found — skipping');
  }
}

function seedShipModels() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM ship_models').get().c;
  if (existing > 0) {
    console.log(`  ⏭️  ship_models: ${existing} rows already exist — skipping`);
    return;
  }

  const data = loadJSON('src/seeds/ship-models.json');

  const ALL_FIELDS = [
    'id', 'nom', 'classe', 'origine', 'tonnage', 'longueur',
    'vitesse_croisiere', 'vitesse_hyperspatiale', 'vitesse_tactique', 'autonomie',
    'blindage', 'coque', 'senseurs', 'senseurs_k', 'senseurs_us',
    'manoeuvrabilite', 'equipage', 'passagers', 'soute', 'prix',
    'image', 'armement_json', 'systemes_secondaires_json', 'description',
  ];

  const cols = db.prepare('PRAGMA table_info(ship_models)').all().map(c => c.name);
  const insertFields = ALL_FIELDS.filter(f => cols.includes(f));
  const placeholders = insertFields.map(() => '?').join(', ');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ship_models (${insertFields.join(', ')}) VALUES (${placeholders})`
  );

  const insertMany = db.transaction(() => {
    let count = 0;
    for (const m of data) {
      insert.run(...insertFields.map(f => m[f] ?? null));
      count++;
    }
    console.log(`  ✅ ship_models: ${count} rows inserted`);
  });

  insertMany();
}

function seedAdminSystems() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM admin_systems').get().c;
  if (existing > 0) {
    console.log(`  ⏭️  admin_systems: ${existing} rows already exist — skipping`);
    return;
  }

  const data = loadJSON('quadrants_MA.json');

  const insert = db.prepare(
    'INSERT INTO admin_systems (quadrant, nom, data_json) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    let count = 0;
    for (const [quadrant, systems] of Object.entries(data)) {
      for (const sys of systems) {
        const d = {
          faction: sys.faction || '',
          is_frontiere: sys.isFrontiere ? 1 : 0,
          route: sys.route || '',
          gouvernement: sys.gouvernement || '',
          description: sys.description || '',
          soleil: sys.soleil || {},
          corpsCelestes: sys.corpsCelestes || [],
          patrouilles: sys.patrouilles || [],
        };
        insert.run(quadrant, sys.nom || '', JSON.stringify(d));
        count++;
      }
    }
    console.log(`  ✅ admin_systems: ${count} rows inserted`);
  });

  insertMany();
}

function seedSecondarySystems() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM secondary_systems').get().c;
  if (existing > 0) {
    console.log(`  ⏭️  secondary_systems: ${existing} rows already exist — skipping`);
    return;
  }

  let data;
  try {
    data = loadJSON('secondary_systems_data.json');
  } catch {
    console.log('  ⏭️  secondary_systems_data.json not found — skipping');
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO secondary_systems
      (id, nom, categorie, localisation, installation, disponibilite,
       prix_10t, prix_100t, prix_1000t, prix_10000t, description, source_livre,
       faction_id, stat_modifiers_json)
    VALUES
      (@id, @nom, @categorie, @localisation, @installation, @disponibilite,
       @prix_10t, @prix_100t, @prix_1000t, @prix_10000t, @description, @source_livre,
       @faction_id, @stat_modifiers_json)
  `);

  const insertMany = db.transaction(() => {
    let count = 0;
    for (const row of data) {
      insert.run({
        id:                 row.id,
        nom:               row.nom,
        categorie:         row.categorie ?? null,
        localisation:      row.localisation ?? null,
        installation:      row.installation ?? null,
        disponibilite:     row.disponibilite ?? null,
        prix_10t:          row.prix_10t ?? null,
        prix_100t:         row.prix_100t ?? null,
        prix_1000t:        row.prix_1000t ?? null,
        prix_10000t:       row.prix_10000t ?? null,
        description:       row.description ?? null,
        source_livre:      row.source_livre ?? null,
        faction_id:        row.faction_id ?? null,
        stat_modifiers_json: row.stat_modifiers_json ?? '[]',
      });
      count++;
    }
    console.log(`  ✅ secondary_systems: ${count} rows inserted`);
  });

  insertMany();
}

function upsertSystems() {
  let data;
  try {
    data = loadJSON('systems_data.json');
  } catch {
    console.log('  ⏭️  systems_data.json not found — skipping upsert');
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO systems
      (id, quadrant, nom, faction, is_frontiere, route, gouvernement, description,
       soleil_json, corps_celestes_json, patrouilles_json, texte_ambiance, peril_list_id)
    VALUES
      (@id, @quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description,
       @soleil_json, @corps_celestes_json, @patrouilles_json, @texte_ambiance, @peril_list_id)
    ON CONFLICT(id) DO UPDATE SET
      quadrant         = excluded.quadrant,
      nom              = excluded.nom,
      faction          = excluded.faction,
      is_frontiere     = excluded.is_frontiere,
      route            = excluded.route,
      gouvernement     = excluded.gouvernement,
      description      = excluded.description,
      soleil_json      = excluded.soleil_json,
      corps_celestes_json = excluded.corps_celestes_json,
      patrouilles_json = excluded.patrouilles_json,
      texte_ambiance   = excluded.texte_ambiance,
      peril_list_id    = excluded.peril_list_id
  `);

  const run = db.transaction(() => {
    let inserted = 0, updated = 0;
    const existing = new Set(
      db.prepare('SELECT id FROM systems').all().map(r => r.id)
    );
    for (const row of data) {
      const wasNew = !existing.has(row.id);
      upsert.run({
        id:                  row.id,
        quadrant:            row.quadrant ?? '',
        nom:                 row.nom ?? '',
        faction:             row.faction ?? '',
        is_frontiere:        row.is_frontiere ?? 0,
        route:               row.route ?? '',
        gouvernement:        row.gouvernement ?? '',
        description:         row.description ?? '',
        soleil_json:         row.soleil_json ?? '{}',
        corps_celestes_json: row.corps_celestes_json ?? '[]',
        patrouilles_json:    row.patrouilles_json ?? '[]',
        texte_ambiance:      row.texte_ambiance ?? null,
        peril_list_id:       row.peril_list_id ?? '',
      });
      if (wasNew) inserted++; else updated++;
    }
    console.log(`  ✅ systems upsert: ${inserted} inserts, ${updated} updates`);
  });

  run();
}

seed();
