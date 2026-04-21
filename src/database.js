import Database from 'better-sqlite3';
import { DB_PATH } from './config/index.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

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

export default db;
