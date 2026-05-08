import Database from 'better-sqlite3';
import { DB_PATH } from './config/index.js';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure db directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
// Wait briefly when the DB is temporarily locked (parallel test files)
db.pragma('busy_timeout = 5000');
// Enable foreign key enforcement
db.pragma('foreign_keys = ON');
// Checkpoint WAL on startup to prevent unbounded growth
db.pragma('wal_checkpoint(TRUNCATE)');

// Lightweight runtime schema backfill for legacy DBs.
function ensureGameTableSessionColumns() {
	const gameTablesExists = db
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'game_tables' LIMIT 1")
		.get();

	if (!gameTablesExists) {
		return;
	}

	const cols = db.prepare("PRAGMA table_info('game_tables')").all();
	const names = new Set(cols.map(c => c.name));

	if (!names.has('session_active')) {
		db.exec('ALTER TABLE game_tables ADD COLUMN session_active INTEGER NOT NULL DEFAULT 0');
	}
	if (!names.has('session_last_activity')) {
		db.exec('ALTER TABLE game_tables ADD COLUMN session_last_activity TEXT');
	}
}

ensureGameTableSessionColumns();

function ensureTravelRouteTables() {
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

ensureTravelRouteTables();

function ensureRoutePerilsTable() {
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

ensureRoutePerilsTable();

// ── Seed admin_peril_tables from perils_data.json if empty ────────────────────
function seedAdminPerilTemplates() {
  // Guard: table may not exist yet when called during migrate.js bootstrap
  const tableExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_peril_tables' LIMIT 1"
  ).get();
  if (!tableExists) return;

  const cnt = db.prepare('SELECT COUNT(*) as c FROM admin_peril_tables').get();
  if (cnt.c > 0) return; // already seeded

  const perilsPath = resolve(__dirname, '../perils_data.json');
  if (!existsSync(perilsPath)) return;

  try {
    const raw = JSON.parse(readFileSync(perilsPath, 'utf8'));
    // Keys are the types: 'interplanetaire', 'hyperspatial'
    const typeOrder = { interplanetaire: 0, hyperspatial: 1 };
    const insert = db.prepare(
      'INSERT OR IGNORE INTO admin_peril_tables (id, name, type, data_json) VALUES (?, ?, ?, ?)'
    );
    const seed = db.transaction(() => {
      for (const [typeKey, entry] of Object.entries(raw)) {
        if (!['interplanetaire', 'hyperspatial'].includes(typeKey)) continue;
        const id = `apt_default_${typeKey}`;
        const name = entry.name || (typeKey === 'interplanetaire' ? 'Périls Interplanétaires' : 'Périls Hyperspatiaux');
        const cats = entry.categories || [];
        insert.run(id, name, typeKey, JSON.stringify({ categories: cats }));
      }
    });
    seed();
  } catch (e) {
    console.error('[DB] Seed admin_peril_tables failed:', e.message);
  }
}

seedAdminPerilTemplates();

function ensureUserProfileRole() {
  const cols = db.prepare("PRAGMA table_info('users')").all();
  if (cols.find(c => c.name === 'profile_role')) return;

  db.exec("ALTER TABLE users ADD COLUMN profile_role TEXT");

  // Backfill from existing memberships:
  //   - MJ of any table → 'mj'
  //   - Only joueur memberships → 'joueur'
  db.exec(`UPDATE users SET profile_role = 'mj'
    WHERE id IN (SELECT mj_id FROM game_tables)`);
  db.exec(`UPDATE users SET profile_role = 'joueur'
    WHERE profile_role IS NULL
      AND id IN (SELECT user_id FROM table_members WHERE role = 'joueur')`);
}

ensureUserProfileRole();

// ── Rules Entries (Compendium de règles) ─────────────────────────────────────
function ensureRulesEntriesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules_entries (
      id         TEXT PRIMARY KEY,
      category   TEXT NOT NULL,
      name       TEXT NOT NULL,
      description TEXT,
      extra      TEXT,
      table_id   TEXT REFERENCES game_tables(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rules_category ON rules_entries(category);
    CREATE INDEX IF NOT EXISTS idx_rules_table    ON rules_entries(table_id);
  `);
}

ensureRulesEntriesTable();

function seedRulesEntries() {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM rules_entries WHERE table_id IS NULL').get();
  if (cnt.c > 0) return;

  const seedPath = resolve(__dirname, 'seeds/rules-data.json');
  if (!existsSync(seedPath)) return;

  try {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    const insert = db.prepare(
      `INSERT OR IGNORE INTO rules_entries (id, category, name, description, extra, table_id, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, 'system')`
    );
    const now = Math.floor(Date.now() / 1000);
    const seed = db.transaction(() => {
      for (const [cat, entries] of Object.entries(raw)) {
        for (const e of entries) {
          const desc = e.description || e.effect || null;
          const extra = JSON.stringify(e);
          insert.run(e.id, cat, e.name, desc, extra);
        }
      }
    });
    seed();
    console.log('[DB] Rules entries seeded.');
  } catch (err) {
    console.error('[DB] Seed rules_entries failed:', err.message);
  }
}

seedRulesEntries();

function upsertMutationsFromSeed() {
  const seedPath = resolve(__dirname, 'seeds/rules-data.json');
  if (!existsSync(seedPath)) return;
  try {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    const mutations = raw.mutations || [];
    const upsert = db.prepare(
      `INSERT OR REPLACE INTO rules_entries (id, category, name, description, extra, table_id, created_by)
       VALUES (?, 'mutations', ?, ?, ?, NULL, 'system')`
    );
    const run = db.transaction(() => {
      for (const m of mutations) {
        const desc = m.effect || null;
        upsert.run(m.id, m.name, desc, JSON.stringify(m));
      }
    });
    run();
    console.log('[DB] Mutations upserted.');
  } catch (err) {
    console.error('[DB] Upsert mutations failed:', err.message);
  }
}

upsertMutationsFromSeed();

function upsertTraitsFromSeed() {
  const seedPath = resolve(__dirname, 'seeds/rules-data.json');
  if (!existsSync(seedPath)) return;
  try {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    const upsert = db.prepare(
      `INSERT OR REPLACE INTO rules_entries (id, category, name, description, extra, table_id, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, 'system')`
    );
    const run = db.transaction(() => {
      // Supprimer les entrées obsolètes (doublons supprimés)
      const obsoleteIds = ['qualite-contact-boss', 'qualite-contact-heros', 'qualite-contact-elite'];
      const del = db.prepare('DELETE FROM rules_entries WHERE id = ? AND table_id IS NULL');
      for (const id of obsoleteIds) del.run(id);

      for (const cat of ['qualites', 'defauts', 'competences']) {
        for (const e of (raw[cat] || [])) {
          const desc = e.description || null;
          upsert.run(e.id, cat, e.name, desc, JSON.stringify(e));
        }
      }
    });
    run();
    console.log('[DB] Traits upserted.');
  } catch (err) {
    console.error('[DB] Upsert traits failed:', err.message);
  }
}

upsertTraitsFromSeed();

// ── Calendar feature ──────────────────────────────────────────────────────────
function ensureCalendarTables() {
  // Add campaign_date / campaign_year to game_tables if missing
  const gtCols = new Set(db.prepare("PRAGMA table_info('game_tables')").all().map(c => c.name));
  if (!gtCols.has('campaign_date'))  db.exec("ALTER TABLE game_tables ADD COLUMN campaign_date TEXT");
  if (!gtCols.has('campaign_year'))  db.exec("ALTER TABLE game_tables ADD COLUMN campaign_year INTEGER DEFAULT 50429");

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id  INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      color     TEXT NOT NULL DEFAULT '#8b5cf6',
      is_system INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cal_cat_table ON calendar_categories(table_id);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id           TEXT PRIMARY KEY,
      table_id     INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      category_id  INTEGER REFERENCES calendar_categories(id) ON DELETE SET NULL,
      color        TEXT,
      date_start   TEXT NOT NULL,
      date_end     TEXT,
      galactic_year INTEGER NOT NULL,
      is_public    INTEGER NOT NULL DEFAULT 1,
      created_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cal_evt_table ON calendar_events(table_id, galactic_year);
  `);
  // Add color column to events if missing (migration for tables created before this version)
  const evtCols = new Set(db.prepare("PRAGMA table_info('calendar_events')").all().map(c => c.name));
  if (!evtCols.has('color')) db.exec("ALTER TABLE calendar_events ADD COLUMN color TEXT");
}

ensureCalendarTables();

function ensureRevolteTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS revolte_sessions (
      id           TEXT PRIMARY KEY,
      table_id     INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'emeute',
      scope        TEXT,
      location_ref TEXT,
      status       TEXT NOT NULL DEFAULT 'en_cours',
      state_json   TEXT NOT NULL DEFAULT '{}',
      created_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_revolte_table ON revolte_sessions(table_id, status);
  `);
}

ensureRevolteTables();

// ── Migrations factions ───────────────────────────────────────────────────────
function ensureFactionsMigrations() {
  const cols = new Set(db.prepare("PRAGMA table_info('factions')").all().map(c => c.name));
  if (!cols.has('origin_nation_id')) {
    db.exec("ALTER TABLE factions ADD COLUMN origin_nation_id TEXT DEFAULT NULL");
  }
}

ensureFactionsMigrations();

// ── Characters (feuilles de personnage) ───────────────────────────────────────
function ensureCharactersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id          TEXT PRIMARY KEY,
      table_id    INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      created_by  INTEGER NOT NULL REFERENCES users(id),
      type        TEXT NOT NULL DEFAULT 'pj',
      name        TEXT NOT NULL,
      data_json   TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_characters_table ON characters(table_id, type);
    CREATE INDEX IF NOT EXISTS idx_characters_user  ON characters(created_by);
  `);
}

ensureCharactersTable();

// ── Characters extensions (colonnes PJ — Story 8.1) ───────────────────────────
function ensureCharactersExtensions() {
  const cols = new Set(db.prepare("PRAGMA table_info('characters')").all().map(c => c.name));

  const additions = [
    "ALTER TABLE characters ADD COLUMN user_id INTEGER",
    "ALTER TABLE characters ADD COLUMN archetype TEXT",
    "ALTER TABLE characters ADD COLUMN is_mutant INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN stats_json TEXT",
    "ALTER TABLE characters ADD COLUMN competences_json TEXT",
    "ALTER TABLE characters ADD COLUMN sante_json TEXT",
    "ALTER TABLE characters ADD COLUMN sante_niveaux INTEGER NOT NULL DEFAULT 3",
    "ALTER TABLE characters ADD COLUMN pp INTEGER NOT NULL DEFAULT 3",
    "ALTER TABLE characters ADD COLUMN gloire INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN energie_x_max INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN energie_x_cur INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN motivation TEXT",
    "ALTER TABLE characters ADD COLUMN overdrive_trigger TEXT",
    "ALTER TABLE characters ADD COLUMN qualites_json TEXT",
    "ALTER TABLE characters ADD COLUMN defauts_json TEXT",
  ];

  // Map column name extracted from ALTER statement
  const colName = sql => sql.match(/ADD COLUMN (\w+)/)[1];

  for (const sql of additions) {
    if (!cols.has(colName(sql))) db.exec(sql);
  }
}

ensureCharactersExtensions();

// ── Expérience de la table de jeu ─────────────────────────────────────────────
function ensureXpColumns() {
  const gtCols = new Set(db.prepare("PRAGMA table_info('game_tables')").all().map(c => c.name));
  if (!gtCols.has('px_table')) {
    db.exec("ALTER TABLE game_tables ADD COLUMN px_table INTEGER NOT NULL DEFAULT 0");
  }
}
ensureXpColumns();

// ── Systems texte_ambiance migration ─────────────────────────────────────────────
function ensureSystemsTextAmbiance() {
  const cols = new Set(db.prepare("PRAGMA table_info('systems')").all().map(c => c.name));
  if (!cols.has('texte_ambiance')) {
    db.exec('ALTER TABLE systems ADD COLUMN texte_ambiance TEXT');
  }
}
ensureSystemsTextAmbiance();

// ── Entity Links (graphe d'entités campagne) ──────────────────────────────────
function ensureEntityLinks() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_links (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id      INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      source_type   TEXT NOT NULL,
      source_id     INTEGER NOT NULL,
      target_type   TEXT NOT NULL,
      target_id     INTEGER NOT NULL,
      relation_type TEXT,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_el_source ON entity_links(table_id, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_el_target ON entity_links(table_id, target_type, target_id);
  `);
}
ensureEntityLinks();

// ── PNJ Nommés ────────────────────────────────────────────────────────────────
function ensureNamedNpcs() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS named_npcs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id          INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      nom               TEXT NOT NULL,
      role_type         TEXT NOT NULL CHECK(role_type IN ('premier_role','second_role')),
      archetype         TEXT,
      stats_json        TEXT,
      competences_json  TEXT,
      is_mutant         INTEGER NOT NULL DEFAULT 0,
      energie_x         INTEGER NOT NULL DEFAULT 0,
      motivation        TEXT,
      overdrive_trigger TEXT,
      aptitude          TEXT,
      qualites_json     TEXT,
      defauts_json      TEXT,
      pp                INTEGER NOT NULL DEFAULT 3,
      sante_json        TEXT,
      notes             TEXT,
      visible           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_named_npcs_table ON named_npcs(table_id);
  `);
}
ensureNamedNpcs();

function ensureNamedNpcsExtensions() {
  const cols = new Set(db.prepare("PRAGMA table_info('named_npcs')").all().map(c => c.name));
  if (!cols.has('faction')) {
    db.exec('ALTER TABLE named_npcs ADD COLUMN faction TEXT');
  }
}
ensureNamedNpcsExtensions();

// ── Catalogue Figurants ───────────────────────────────────────────────────────
function ensureFigurantTemplates() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS figurant_templates (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      nom                TEXT NOT NULL,
      faction            TEXT,
      categorie          TEXT,
      structure          INTEGER NOT NULL DEFAULT 3,
      blindage           INTEGER NOT NULL DEFAULT 0,
      degats             TEXT,
      mf_disponible      INTEGER NOT NULL DEFAULT 0,
      competences_json   TEXT,
      notes              TEXT,
      is_system_template INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT DEFAULT (datetime('now'))
    );
  `);

  const TEMPLATES = [
    { nom: 'Marin havanais',          faction: 'Havane', categorie: 'pirate',      structure: 3, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Pirate Black Mamba',       faction: 'P',      categorie: 'pirate',      structure: 4, blindage: 0, degats: '1D6+1',  mf_disponible: 0 },
    { nom: 'Pirate Hijos de Havana',   faction: 'Havane', categorie: 'pirate',      structure: 3, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Soldat impérial',          faction: 'EG',     categorie: 'militaire',   structure: 4, blindage: 1, degats: '1D6+1',  mf_disponible: 0 },
    { nom: 'Marine impérial (armure)', faction: 'EG',     categorie: 'militaire',   structure: 5, blindage: 2, degats: '2D6',    mf_disponible: 0 },
    { nom: 'Citoyen Sol (noble)',      faction: 'Sol',    categorie: 'civil',       structure: 2, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Chevalier de Sol',         faction: 'Sol',    categorie: 'militaire',   structure: 5, blindage: 2, degats: '2D6',    mf_disponible: 1 },
    { nom: 'Cadre OCG',                faction: 'OCG',    categorie: 'corporatif',  structure: 3, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Agent OCG',                faction: 'OCG',    categorie: 'espion',      structure: 4, blindage: 1, degats: '1D6+1',  mf_disponible: 0 },
    { nom: 'Garde du corps OCG',       faction: 'OCG',    categorie: 'militaire',   structure: 5, blindage: 1, degats: '2D6',    mf_disponible: 0 },
    { nom: 'Citoyen LPL',              faction: 'LPL',    categorie: 'civil',       structure: 2, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Agent LPL (secret)',        faction: 'LPL',    categorie: 'espion',      structure: 4, blindage: 0, degats: '1D6+1',  mf_disponible: 0 },
    { nom: 'Esclave des Barrens',      faction: 'B',      categorie: 'civil',       structure: 2, blindage: 0, degats: '1D6',    mf_disponible: 0 },
    { nom: 'Pillard barren',           faction: 'B',      categorie: 'pirate',      structure: 4, blindage: 0, degats: '1D6+1',  mf_disponible: 0 },
    { nom: 'Mercenaire (neutre)',       faction: null,     categorie: 'militaire',   structure: 4, blindage: 1, degats: '1D6+1',  mf_disponible: 1 },
  ];

  const ins = db.prepare(`
    INSERT INTO figurant_templates (nom, faction, categorie, structure, blindage, degats, mf_disponible, is_system_template)
    SELECT ?, ?, ?, ?, ?, ?, ?, 1
    WHERE NOT EXISTS (SELECT 1 FROM figurant_templates WHERE nom = ?)
  `);
  for (const t of TEMPLATES) {
    ins.run(t.nom, t.faction ?? null, t.categorie, t.structure, t.blindage, t.degats, t.mf_disponible, t.nom);
  }
}
ensureFigurantTemplates();

// ── MF Pool ───────────────────────────────────────────────────────────────────
function ensureMFPool() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mf_pool (
      id         INTEGER PRIMARY KEY,
      table_id   INTEGER NOT NULL UNIQUE REFERENCES game_tables(id) ON DELETE CASCADE,
      pj_pool    INTEGER NOT NULL DEFAULT 50,
      mj_pool    INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      CHECK (pj_pool >= 0),
      CHECK (mj_pool >= 0),
      CHECK (pj_pool + mj_pool = 50)
    );
  `);
}
ensureMFPool();

// ── Chasses au Trésor (TdM supplement) ───────────────────────────────────────
function ensureChassesAuTresor() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chasses_tresor (
      id          TEXT PRIMARY KEY,
      table_id    INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      nom         TEXT NOT NULL,
      statut      TEXT NOT NULL DEFAULT 'en_cours',
      difficulte  INTEGER,
      nb_seances  INTEGER,
      carte_json  TEXT NOT NULL DEFAULT '{}',
      tresor_json TEXT NOT NULL DEFAULT '{}',
      antre_json  TEXT NOT NULL DEFAULT '{}',
      notes       TEXT,
      created_by  INTEGER NOT NULL REFERENCES users(id),
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chasses_tresor_table ON chasses_tresor(table_id, statut);
  `);
}
ensureChassesAuTresor();

// ── Combat Spatial ────────────────────────────────────────────────────────────
function ensureCombatSpatial() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS combats_spatiaux (
      id              TEXT PRIMARY KEY,
      table_id        INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
      nom             TEXT NOT NULL,
      statut          TEXT NOT NULL DEFAULT 'en_cours'
                        CHECK (statut IN ('en_cours','termine','abandonne')),
      phase           TEXT NOT NULL DEFAULT 'approche'
                        CHECK (phase IN ('approche','tournoyant','poursuite','abordage')),
      configuration   TEXT NOT NULL DEFAULT 'face-a-face',
      champ_bataille  TEXT NOT NULL DEFAULT 'espace-profond',
      combat_json     TEXT NOT NULL DEFAULT '{}',
      journal_json    TEXT NOT NULL DEFAULT '[]',
      crew_json       TEXT NOT NULL DEFAULT '{}',
      notes           TEXT,
      created_by      INTEGER NOT NULL REFERENCES users(id),
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_combats_spatiaux_table
      ON combats_spatiaux(table_id, statut);

    CREATE TABLE IF NOT EXISTS combat_ships (
      id                TEXT PRIMARY KEY,
      combat_id         TEXT NOT NULL REFERENCES combats_spatiaux(id) ON DELETE CASCADE,
      ship_model_id     TEXT,
      nom               TEXT NOT NULL,
      camp              TEXT NOT NULL DEFAULT 'joueurs'
                          CHECK (camp IN ('joueurs','ennemis','neutres')),
      trajectoire       TEXT NOT NULL DEFAULT 'attaque'
                          CHECK (trajectoire IN ('attaque','interception')),
      position_k        INTEGER NOT NULL DEFAULT 200
                          CHECK (position_k % 25 = 0),
      orientation       TEXT NOT NULL DEFAULT 'vers500'
                          CHECK (orientation IN ('vers0','vers500')),
      classe            TEXT NOT NULL DEFAULT 'frégate',
      avantage          INTEGER,
      contact_visuel    INTEGER NOT NULL DEFAULT 0,
      structure_actuelle INTEGER NOT NULL DEFAULT 100,
      structure_max     INTEGER NOT NULL DEFAULT 100,
      destroyed         INTEGER NOT NULL DEFAULT 0,
      sort_order        INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_combat_ships_combat
      ON combat_ships(combat_id);
  `);
}
ensureCombatSpatial();

// Migrations incrémentales combat_ships
try { db.exec("ALTER TABLE combat_ships ADD COLUMN senseurs_k INTEGER DEFAULT NULL"); } catch {}

export default db;
