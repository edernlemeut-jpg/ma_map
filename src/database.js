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

export default db;
