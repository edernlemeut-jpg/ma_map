import db from '../src/database.js';

const SCHEMA_VERSION = 4;

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

migrate();
