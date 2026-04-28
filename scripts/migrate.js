import db from '../src/database.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_VERSION = 11;

function migrate() {
  const currentVersion = db.pragma('user_version', { simple: true });
  console.log(`📦 DB schema version: ${currentVersion}`);

  if (currentVersion >= SCHEMA_VERSION) {
    console.log('✅ Schema is up to date');
    return;
  }

  if (currentVersion < 1) migrateV1();
  if (currentVersion < 2) migrateV2();
  if (currentVersion < 3) migrateV3();
  if (currentVersion < 4) migrateV4();
  if (currentVersion < 5) migrateV5();
  if (currentVersion < 6) migrateV6();
  if (currentVersion < 7) migrateV7();
  if (currentVersion < 8) migrateV8();
  if (currentVersion < 9) migrateV9();
  if (currentVersion < 10) migrateV10();
  if (currentVersion < 11) migrateV11();

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  console.log(`✅ Migrated to schema version ${SCHEMA_VERSION}`);
}

function migrateV1() {
  console.log('🔧 Applying migration v1...');
  db.exec(`
    -- users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    -- game_tables
    CREATE TABLE IF NOT EXISTS game_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mj_id INTEGER NOT NULL REFERENCES users(id),
      session_active INTEGER NOT NULL DEFAULT 0,
      session_last_activity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- table_members
    CREATE TABLE IF NOT EXISTS table_members (
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'joueur' CHECK(role IN ('mj','joueur')),
      PRIMARY KEY(table_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_table_members_table ON table_members(table_id);

    -- systems
    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quadrant TEXT NOT NULL,
      nom TEXT NOT NULL,
      faction TEXT DEFAULT '',
      is_frontiere INTEGER DEFAULT 0,
      route TEXT DEFAULT '',
      gouvernement TEXT DEFAULT '',
      description TEXT DEFAULT '',
      soleil_json TEXT DEFAULT '{}',
      corps_celestes_json TEXT DEFAULT '[]',
      patrouilles_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(quadrant, nom)
    );
    CREATE INDEX IF NOT EXISTS idx_systems_nom ON systems(nom);

    -- factions
    CREATE TABLE IF NOT EXISTS factions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      short TEXT DEFAULT '',
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      color TEXT DEFAULT '#888888',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_factions_name ON factions(name);

    -- ship_models
    CREATE TABLE IF NOT EXISTS ship_models (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      classe TEXT DEFAULT '',
      vitesse_croisiere REAL DEFAULT 0,
      vitesse_hyperspatiale REAL DEFAULT 0,
      autonomie REAL DEFAULT 0,
      manoeuvrabilite TEXT DEFAULT '',
      vitesse_tactique TEXT DEFAULT '',
      blindage INTEGER DEFAULT 0,
      coque INTEGER DEFAULT 0,
      senseurs TEXT DEFAULT '',
      equipage TEXT DEFAULT '',
      passagers TEXT DEFAULT '',
      soute REAL DEFAULT 0,
      prix REAL DEFAULT 0,
      origine TEXT DEFAULT '',
      image TEXT DEFAULT '',
      armement_json TEXT DEFAULT '[]',
      systemes_secondaires_json TEXT DEFAULT '[]'
    );

    -- ships
    CREATE TABLE IF NOT EXISTS ships (
      id TEXT PRIMARY KEY,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      nom TEXT NOT NULL,
      model_id TEXT REFERENCES ship_models(id),
      hull INTEGER DEFAULT 0,
      crew INTEGER DEFAULT 0,
      cargo_capacity REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- peril_data
    CREATE TABLE IF NOT EXISTS peril_data (
      type TEXT PRIMARY KEY,
      data_json TEXT NOT NULL
    );

    -- custom_peril_tables
    CREATE TABLE IF NOT EXISTS custom_peril_tables (
      id TEXT PRIMARY KEY,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL
    );

    -- peril_assignments
    CREATE TABLE IF NOT EXISTS peril_assignments (
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      assign_type TEXT NOT NULL,
      key TEXT NOT NULL,
      peril_table_id TEXT DEFAULT '',
      PRIMARY KEY(table_id, assign_type, key)
    );

    -- trip_history
    CREATE TABLE IF NOT EXISTS trip_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      ship_name TEXT DEFAULT '',
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- table_state
    CREATE TABLE IF NOT EXISTS table_state (
      table_id INTEGER PRIMARY KEY REFERENCES game_tables(id) ON DELETE CASCADE,
      active_ship_id TEXT DEFAULT '',
      sync_version INTEGER NOT NULL DEFAULT 0
    );

    -- visibility_rules
    CREATE TABLE IF NOT EXISTS visibility_rules (
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(table_id, entity_type, entity_id)
    );

    -- table_visibility_overrides
    CREATE TABLE IF NOT EXISTS table_visibility_overrides (
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(table_id, entity_type, entity_id)
    );

    -- npcs
    CREATE TABLE IF NOT EXISTS npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- notes
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function migrateV2() {
  console.log('🔧 Applying migration v2...');
  db.exec(`ALTER TABLE game_tables ADD COLUMN invite_code TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_tables_invite_code ON game_tables(invite_code)`);
}

function migrateV3() {
  console.log('🔧 Applying migration v3...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_routes (
      id TEXT PRIMARY KEY,
      table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_travel_routes_table ON travel_routes(table_id);

    CREATE TABLE IF NOT EXISTS route_waypoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id TEXT NOT NULL REFERENCES travel_routes(id) ON DELETE CASCADE,
      system_id INTEGER NOT NULL REFERENCES systems(id),
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_route_waypoints_route ON route_waypoints(route_id, position);
  `);
}

function migrateV4() {
  console.log('🔧 Applying migration v4...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_perils (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id TEXT NOT NULL REFERENCES travel_routes(id) ON DELETE CASCADE,
      peril_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      custom_text TEXT,
      is_manual INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_route_perils_route ON route_perils(route_id, segment_index, id);
  `);
}

function migrateV5() {
  console.log('🔧 Applying migration v5...');

  // ── Nouveaux champs ship_models ────────────────────────────────────────────
  const smCols = db.prepare("PRAGMA table_info(ship_models)").all().map(c => c.name);
  if (!smCols.includes('tonnage'))    db.exec("ALTER TABLE ship_models ADD COLUMN tonnage TEXT DEFAULT ''");
  if (!smCols.includes('longueur'))   db.exec("ALTER TABLE ship_models ADD COLUMN longueur TEXT DEFAULT ''");
  if (!smCols.includes('senseurs_k')) db.exec("ALTER TABLE ship_models ADD COLUMN senseurs_k TEXT DEFAULT ''");
  if (!smCols.includes('senseurs_us'))db.exec("ALTER TABLE ship_models ADD COLUMN senseurs_us TEXT DEFAULT ''");

  // ── Avatar utilisateur + description table ─────────────────────────────────
  const uCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!uCols.includes('avatar')) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''");

  const gtCols = db.prepare("PRAGMA table_info(game_tables)").all().map(c => c.name);
  if (!gtCols.includes('description')) db.exec("ALTER TABLE game_tables ADD COLUMN description TEXT DEFAULT ''");

  // ── Compte admin Crêpe ────────────────────────────────────────────────────
  const ADMIN_USERNAME = 'Crepe';
  const ADMIN_DISPLAY  = 'Crêpe';
  const ADMIN_PASSWORD = 'MA56ElM@';
  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

  const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(ADMIN_USERNAME);
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, display_name = ?, is_admin = 1 WHERE id = ?")
      .run(passwordHash, ADMIN_DISPLAY, existing.id);
    console.log(`  ✅ Admin '${ADMIN_USERNAME}' mis à jour`);
  } else {
    db.prepare("INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 1)")
      .run(ADMIN_USERNAME, ADMIN_DISPLAY, passwordHash);
    console.log(`  ✅ Admin '${ADMIN_USERNAME}' créé`);
  }

  // ── Seed modèles de vaisseaux depuis MAmap.html ───────────────────────────
  const CLE_TO_POS = { P: 'Proue', Pr: 'Proue', Po: 'Poupe', V: 'Ventre', B: 'Bâbord', T: 'Tribord' };
  function parseArmement(arr) {
    if (!arr) return [];
    return arr.map(a => {
      const pos = CLE_TO_POS[a.cle] || CLE_TO_POS[a.cle?.replace(/\d+$/, '')] || 'Proue';
      const tourelle = (a.nom || '').toLowerCase().includes('tourelle');
      const clean = (a.nom || '').replace(/\(tourelle\)\s*/i, '').trim();
      const match = clean.match(/\(([^)]+)\)$/);
      let nomBase = clean.replace(/\([^)]+\)$/, '').trim();
      const codes = match ? match[1].split('/') : [];
      return {
        nom: nomBase || clean,
        position: pos,
        tourelle,
        degats: codes[0] || '',
        mode_tir: codes[1] || '',
        portee: codes[2] || '',
        canonnier: codes[3] || ''
      };
    });
  }

  const maMapPath = resolve(__dirname, '../donnee_base/MAmap.html');
  let maMapHtml;
  try { maMapHtml = readFileSync(maMapPath, 'utf8'); } catch { console.warn('  ⚠️  donnee_base/MAmap.html introuvable, modèles non seedés'); }

  if (maMapHtml) {
    // Extract initialShipModels array from HTML
    const match = maMapHtml.match(/const initialShipModels\s*=\s*(\[[\s\S]*?\]);\s*\n/);
    if (match) {
      try {
        // eslint-disable-next-line no-eval
        const models = eval(match[1].replace(/crypto\.randomUUID\(\)/g, '"__UUID__"'));
        const insertModel = db.prepare(`
          INSERT OR IGNORE INTO ship_models
            (id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie,
             manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, senseurs_k, senseurs_us,
             equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        let count = 0;
        for (const m of models) {
          const id = randomUUID();
          const senseurs = m.senseurs || '';
          // Split "350 K (3,5 US)" → k="350 K", us="3,5 US"
          const sMatch = senseurs.match(/^([^(]+)\(([^)]+)\)/);
          const sk = sMatch ? sMatch[1].trim() : senseurs;
          const sus = sMatch ? sMatch[2].trim() : '';
          insertModel.run(
            id, m.nom, m.classe || '',
            m.vitesseCroisiere || 0, m.vitesseHyperspatiale || 0, m.autonomie || 0,
            m.manoeuvrabilite || '', m.vitesseTactique || '',
            m.blindage || 0, m.coque || 0,
            senseurs, sk, sus,
            m.equipage || '', m.passagers || '',
            m.soute || 0, m.prix || 0, m.origine || '',
            m.image || '',
            JSON.stringify(parseArmement(m.armement)),
            JSON.stringify(m.systemesSecondaires || [])
          );
          count++;
        }
        console.log(`  ✅ ${count} modèles de vaisseaux seedés`);
      } catch (e) { console.warn('  ⚠️  Erreur parsing MAmap.html:', e.message); }
    }
  }

  // ── Seed systèmes depuis quadrants_MA.json (Archive) ──────────────────────
  const quadPath = resolve(__dirname, '../_archive/quadrants_MA.json');
  let quadData;
  try { quadData = JSON.parse(readFileSync(quadPath, 'utf8')); }
  catch {
    // fallback to root
    try { quadData = JSON.parse(readFileSync(resolve(__dirname, '../quadrants_MA.json'), 'utf8')); }
    catch { console.warn('  ⚠️  quadrants_MA.json introuvable, systèmes non seedés'); }
  }

  if (quadData) {
    const insertSystem = db.prepare(`
      INSERT OR IGNORE INTO systems
        (quadrant, nom, faction, is_frontiere, route, gouvernement, description,
         soleil_json, corps_celestes_json, patrouilles_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    let sysCount = 0;
    for (const [quadrant, systems] of Object.entries(quadData)) {
      if (!Array.isArray(systems)) continue;
      for (const s of systems) {
        if (!s.nom) continue;
        insertSystem.run(
          quadrant, s.nom, s.faction || '',
          s.isFrontiere ? 1 : 0,
          s.route || '', s.gouvernement || '', s.description || '',
          JSON.stringify(s.soleil || {}),
          JSON.stringify(s.corpsCelestes || []),
          JSON.stringify(s.patrouilles || [])
        );
        sysCount++;
      }
    }
    console.log(`  ✅ ${sysCount} systèmes seedés`);
  }
}

function migrateV6() {
  console.log('🔧 Applying migration v6...');
  // Add image column to ships (per-ship custom image URL)
  try { db.exec('ALTER TABLE ships ADD COLUMN image TEXT DEFAULT NULL'); } catch {}
  console.log('✅ v6: ships.image column added');
}

function migrateV7() {
  console.log('🔧 Applying migration v7...');

  // ── ship_models: description sub-fields ───────────────────────────────────
  const smCols = db.prepare('PRAGMA table_info(ship_models)').all().map(c => c.name);
  if (!smCols.includes('description'))      db.exec("ALTER TABLE ship_models ADD COLUMN description TEXT DEFAULT ''");
  if (!smCols.includes('history'))          db.exec("ALTER TABLE ship_models ADD COLUMN history TEXT DEFAULT ''");
  if (!smCols.includes('mj_notes'))         db.exec("ALTER TABLE ship_models ADD COLUMN mj_notes TEXT DEFAULT ''");
  if (!smCols.includes('special_features')) db.exec("ALTER TABLE ship_models ADD COLUMN special_features TEXT DEFAULT ''");

  // ── factions: image icon URL ───────────────────────────────────────────────
  const fCols = db.prepare('PRAGMA table_info(factions)').all().map(c => c.name);
  if (!fCols.includes('icon_url')) db.exec("ALTER TABLE factions ADD COLUMN icon_url TEXT DEFAULT ''");

  // ── ships: hull integrity state per system ─────────────────────────────────
  const sCols = db.prepare('PRAGMA table_info(ships)').all().map(c => c.name);
  if (!sCols.includes('hull_state_json')) db.exec("ALTER TABLE ships ADD COLUMN hull_state_json TEXT DEFAULT '{}'");

  // ── planets table ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS planets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
      nom TEXT NOT NULL,
      type TEXT DEFAULT '',
      ordre_orbital INTEGER DEFAULT 0,
      taille TEXT DEFAULT '',
      atmosphere TEXT DEFAULT '',
      gouvernement TEXT DEFAULT '',
      population TEXT DEFAULT '',
      ressources TEXT DEFAULT '',
      description TEXT DEFAULT '',
      notes_mj TEXT DEFAULT '',
      orbit_period_days REAL DEFAULT 0,
      position_initiale INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_planets_system ON planets(system_id);
  `);

  console.log('✅ v7: ship_models description fields, factions icon_url, ships hull_state_json, planets table');
}

function migrateV8() {
  console.log('🔧 Applying migration v8...');
  const sCols = db.prepare('PRAGMA table_info(ships)').all().map(c => c.name);
  if (!sCols.includes('ship_stats_json')) {
    db.exec("ALTER TABLE ships ADD COLUMN ship_stats_json TEXT DEFAULT NULL");
  }
  console.log('✅ v8: ships.ship_stats_json column added');
}

function migrateV9() {
  console.log('🔧 Applying migration v9...');
  const sCols = db.prepare('PRAGMA table_info(ships)').all().map(c => c.name);
  if (!sCols.includes('position_json')) {
    db.exec("ALTER TABLE ships ADD COLUMN position_json TEXT DEFAULT NULL");
  }
  console.log('✅ v9: ships.position_json column added');
}

function migrateV11() {
  console.log('🔧 Applying migration v11...');
  const shipCols = db.prepare('PRAGMA table_info(ships)').all().map(c => c.name);
  if (!shipCols.includes('owner_character_id')) {
    db.exec("ALTER TABLE ships ADD COLUMN owner_character_id TEXT DEFAULT NULL");
  }
  console.log('✅ v11: ships.owner_character_id column added');
}

function migrateV10() {
  console.log('🔧 Applying migration v10...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_peril_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS admin_quadrant_defaults (
      quadrant TEXT PRIMARY KEY,
      peril_list_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS admin_systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quadrant TEXT NOT NULL,
      nom TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  // Add peril_list_id to systems if absent
  const sysCols = db.prepare('PRAGMA table_info(systems)').all().map(c => c.name);
  if (!sysCols.includes('peril_list_id')) {
    db.exec("ALTER TABLE systems ADD COLUMN peril_list_id TEXT DEFAULT ''");
  }
  console.log('✅ v10: admin_peril_tables, admin_quadrant_defaults, admin_systems, systems.peril_list_id');
}

migrate();

