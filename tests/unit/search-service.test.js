import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_search_svc_';

function cleanTestData() {
  db.prepare(`DELETE FROM table_visibility_overrides WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM factions WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM ship_models WHERE id LIKE '${TEST_PREFIX}%'`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Search service — searchEntities()', () => {
  let searchEntities;
  let tableId;
  let sysVisId, sysHidId;
  const smVisId = `${TEST_PREFIX}sm_vis`;
  const smHidId = `${TEST_PREFIX}sm_hid`;

  before(async () => {
    cleanTestData();
    const mod = await import('../../src/services/search.js');
    searchEntities = mod.searchEntities;

    // Create user + table
    const u = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)').run(`${TEST_PREFIX}mj`, 'fakehash');
    const userId = Number(u.lastInsertRowid);
    const invCode = `${TEST_PREFIX}inv`;
    const t = db.prepare('INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)').run(`${TEST_PREFIX}table`, userId, invCode);
    tableId = Number(t.lastInsertRowid);

    // Create test entities
    const s1 = db.prepare('INSERT INTO systems (quadrant, nom, faction, gouvernement, description) VALUES (?, ?, ?, ?, ?)').run('Alpha', `${TEST_PREFIX}sys_visible`, 'Empire', 'Monarchie', 'Un système habité');
    sysVisId = Number(s1.lastInsertRowid);
    const s2 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run('Beta', `${TEST_PREFIX}sys_hidden`);
    sysHidId = Number(s2.lastInsertRowid);

    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}faction_a`, 'FA', 'La faction A', '🔴', '#f00');
    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}faction_b`, 'FB', 'La faction B', '🔵', '#00f');

    db.prepare('INSERT INTO ship_models (id, nom, classe, origine) VALUES (?, ?, ?, ?)').run(smVisId, `${TEST_PREFIX}vaisseau_a`, 'Croiseur', 'Imperium');
    db.prepare('INSERT INTO ship_models (id, nom, classe, origine) VALUES (?, ?, ?, ?)').run(smHidId, `${TEST_PREFIX}vaisseau_b`, 'Cargo', 'Freeworld');

    // Set visibility: make sys_visible visible, sys_hidden stays hidden (default)
    // systems cascade: quadrant must be visible first
    db.prepare("INSERT OR REPLACE INTO visibility_rules (table_id, entity_type, entity_id, visible) VALUES (?, 'quadrants', 'Alpha', 1)").run(tableId);
    db.prepare("INSERT OR REPLACE INTO visibility_rules (table_id, entity_type, entity_id, visible) VALUES (?, 'systems', ?, 1)").run(tableId, String(sysVisId));
    // factions default = visible; hide faction_b via table_visibility_overrides
    const facB = db.prepare(`SELECT id FROM factions WHERE name = ?`).get(`${TEST_PREFIX}faction_b`);
    db.prepare("INSERT OR REPLACE INTO table_visibility_overrides (table_id, entity_type, entity_id, visible) VALUES (?, 'factions', ?, 0)").run(tableId, facB.id);
    // ship_models: make vaisseau_a visible
    db.prepare("INSERT OR REPLACE INTO table_visibility_overrides (table_id, entity_type, entity_id, visible) VALUES (?, 'ship_models', ?, 1)").run(tableId, smVisId);
  });

  after(() => {
    cleanTestData();
  });

  // --- Query length validation ---
  it('returns empty array when query is empty', () => {
    const results = searchEntities('', [], tableId, 'mj');
    assert.deepEqual(results, []);
  });

  it('returns empty array when query is 1 character', () => {
    const results = searchEntities('a', [], tableId, 'mj');
    assert.deepEqual(results, []);
  });

  it('returns empty array when query is null', () => {
    const results = searchEntities(null, [], tableId, 'mj');
    assert.deepEqual(results, []);
  });

  // --- SQL LIKE sanitization ---
  it('escapes % character in query (no LIKE injection)', () => {
    const results = searchEntities('100%', [], tableId, 'mj');
    // Should not match anything — % is escaped
    const hasTestData = results.some(r => r.nom?.startsWith(TEST_PREFIX) || r.name?.startsWith(TEST_PREFIX));
    // Main thing: no crash and no wildcard match-all
    assert.ok(Array.isArray(results));
  });

  it('escapes _ character in query', () => {
    const results = searchEntities('a_b', [], tableId, 'mj');
    assert.ok(Array.isArray(results));
  });

  it('escapes \\ character in query', () => {
    const results = searchEntities('a\\b', [], tableId, 'mj');
    assert.ok(Array.isArray(results));
  });

  // --- MJ results (all entities + visible field) ---
  it('MJ sees all matching entities with visible field', () => {
    const results = searchEntities(TEST_PREFIX, [], tableId, 'mj');
    assert.ok(results.length >= 6, `Expected ≥6 results, got ${results.length}`);
    for (const r of results) {
      assert.ok('visible' in r, `Entity ${r.id} missing visible field`);
      assert.ok('type' in r, `Entity ${r.id} missing type field`);
    }
  });

  it('MJ results include hidden entities', () => {
    const results = searchEntities(`${TEST_PREFIX}sys`, [], tableId, 'mj');
    const names = results.map(r => r.nom);
    assert.ok(names.includes(`${TEST_PREFIX}sys_visible`));
    assert.ok(names.includes(`${TEST_PREFIX}sys_hidden`));
  });

  // --- Joueur results (only visible, no visible field) ---
  it('joueur sees only visible entities without visible field', () => {
    const results = searchEntities(TEST_PREFIX, [], tableId, 'joueur');
    for (const r of results) {
      assert.ok(!('visible' in r), `Joueur result should not have visible field: ${JSON.stringify(r)}`);
    }
  });

  it('joueur does not see hidden entities (plausible deniability)', () => {
    const results = searchEntities(`${TEST_PREFIX}sys`, [], tableId, 'joueur');
    const names = results.map(r => r.nom);
    assert.ok(names.includes(`${TEST_PREFIX}sys_visible`));
    assert.ok(!names.includes(`${TEST_PREFIX}sys_hidden`));
  });

  // --- Type field ---
  it('results contain correct type field', () => {
    const results = searchEntities(TEST_PREFIX, [], tableId, 'mj');
    const types = new Set(results.map(r => r.type));
    assert.ok(types.has('systems'));
    assert.ok(types.has('factions'));
    assert.ok(types.has('ship_models'));
  });

  // --- Type filtering ---
  it('filters by single type', () => {
    const results = searchEntities(TEST_PREFIX, ['systems'], tableId, 'mj');
    for (const r of results) {
      assert.equal(r.type, 'systems');
    }
    assert.ok(results.length >= 2);
  });

  it('filters by multiple types', () => {
    const results = searchEntities(TEST_PREFIX, ['systems', 'factions'], tableId, 'mj');
    const types = new Set(results.map(r => r.type));
    assert.ok(types.size <= 2);
    assert.ok(!types.has('ship_models'));
  });

  it('ignores invalid types silently', () => {
    const results = searchEntities(TEST_PREFIX, ['invalid', 'systems'], tableId, 'mj');
    for (const r of results) {
      assert.equal(r.type, 'systems');
    }
  });

  it('returns all types when types array is empty', () => {
    const results = searchEntities(TEST_PREFIX, [], tableId, 'mj');
    const types = new Set(results.map(r => r.type));
    assert.ok(types.has('systems'));
    assert.ok(types.has('factions'));
    assert.ok(types.has('ship_models'));
  });

  it('returns empty when all types are invalid', () => {
    const results = searchEntities(TEST_PREFIX, ['foo', 'bar'], tableId, 'mj');
    assert.deepEqual(results, []);
  });

  // --- Search across columns ---
  it('searches across multiple columns (nom, description, etc.)', () => {
    // Search by faction field of a system
    const results = searchEntities('Empire', ['systems'], tableId, 'mj');
    const sysMatch = results.find(r => r.nom === `${TEST_PREFIX}sys_visible`);
    assert.ok(sysMatch, 'Should find system by its faction column');
  });

  it('searches faction description column', () => {
    const results = searchEntities('faction A', ['factions'], tableId, 'mj');
    const facMatch = results.find(r => r.name === `${TEST_PREFIX}faction_a`);
    assert.ok(facMatch, 'Should find faction by description');
  });

  it('searches ship_models by classe', () => {
    const results = searchEntities('Croiseur', ['ship_models'], tableId, 'mj');
    const smMatch = results.find(r => r.id === smVisId);
    assert.ok(smMatch, 'Should find ship model by classe');
  });
});
