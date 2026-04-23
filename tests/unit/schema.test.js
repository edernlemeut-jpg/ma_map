import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXPECTED_TABLES = [
  'users', 'game_tables', 'table_members', 'systems', 'factions',
  'ship_models', 'ships', 'peril_data', 'custom_peril_tables',
  'peril_assignments', 'trip_history', 'table_state',
  'travel_routes', 'route_waypoints', 'route_perils',
  'visibility_rules', 'table_visibility_overrides', 'npcs', 'notes'
];

describe('Database schema', () => {
  let db;

  before(() => {
    // Run migration SQL on an in-memory DB to validate schema
    db = Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Extract the SQL from migrate.js by running the migration directly
    // We re-execute the same DDL statements here
    const migrateFile = readFileSync(resolve(__dirname, '../../scripts/migrate.js'), 'utf-8');
    // Extract all SQL from db.exec() calls in migrate.js
    const sqlMatches = [...migrateFile.matchAll(/db\.exec\(`([\s\S]*?)`\)/g)];
    if (sqlMatches.length === 0) throw new Error('Could not extract SQL from migrate.js');
    for (const match of sqlMatches) {
      db.exec(match[1]);
    }
  });

  it('should create all expected tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);

    for (const expected of EXPECTED_TABLES) {
      assert.ok(tables.includes(expected), `Missing table: ${expected}`);
    }
    assert.equal(tables.length, EXPECTED_TABLES.length, `Expected ${EXPECTED_TABLES.length} tables, got ${tables.length}`);
  });

  it('users table should have is_admin column (not role)', () => {
    const cols = db.prepare("PRAGMA table_info('users')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('is_admin'), 'users should have is_admin column');
    assert.ok(!colNames.includes('role'), 'users should NOT have role column');
  });

  it('table_members should have role column', () => {
    const cols = db.prepare("PRAGMA table_info('table_members')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('role'), 'table_members should have role column');
  });

  it('table_state should have sync_version column', () => {
    const cols = db.prepare("PRAGMA table_info('table_state')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('sync_version'), 'table_state should have sync_version');
  });

  it('game_tables should have invite_code column', () => {
    const cols = db.prepare("PRAGMA table_info('game_tables')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('invite_code'), 'game_tables should have invite_code column');
  });
});
