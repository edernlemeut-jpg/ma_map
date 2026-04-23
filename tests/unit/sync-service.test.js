import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSyncPayload } from '../../src/services/sync.js';
import { toggleVisibility } from '../../src/services/visibility.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_sync_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE entity_id LIKE '${TEST_PREFIX}%' OR entity_id IN (SELECT CAST(id AS TEXT) FROM systems WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE entity_id IN (SELECT CAST(id AS TEXT) FROM factions WHERE name LIKE '${TEST_PREFIX}%') OR entity_id IN (SELECT id FROM ship_models WHERE id LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM visibility_rules WHERE entity_type = 'quadrants' AND entity_id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM table_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM factions WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM ship_models WHERE id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Sync service', () => {
  it('getSyncPayload returns object with version, timestamp, entities with counts', () => {
    const payload = getSyncPayload(1, 'mj');
    assert.equal(typeof payload.version, 'number');
    assert.equal(typeof payload.timestamp, 'string');
    assert.equal(typeof payload.entities, 'object');
    for (const type of ['systems', 'factions', 'ship_models']) {
      assert.ok(type in payload.entities, `entities should contain ${type}`);
      assert.equal(typeof payload.entities[type].count, 'number');
    }
  });

  it('version is an integer >= 1', () => {
    const payload = getSyncPayload(1, 'joueur');
    assert.ok(Number.isInteger(payload.version));
    assert.ok(payload.version >= 1);
  });

  it('timestamp is a valid ISO 8601 date', () => {
    const payload = getSyncPayload(1, 'mj');
    const parsed = new Date(payload.timestamp);
    assert.ok(!isNaN(parsed.getTime()), 'timestamp should parse to a valid Date');
    assert.equal(payload.timestamp, parsed.toISOString());
  });

  it('accepts tableId and role parameters without error', () => {
    assert.doesNotThrow(() => getSyncPayload(42, 'joueur'));
    assert.doesNotThrow(() => getSyncPayload(1, 'mj'));
  });
});

describe('Sync service — visibility counts', () => {
  let tableId;

  before(() => {
    cleanTestData();
    const mjId = Number(db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)').run(`${TEST_PREFIX}mj`, 'fakehash').lastInsertRowid);
    const r = db.prepare('INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)').run(`${TEST_PREFIX}table`, mjId, `${TEST_PREFIX}INV`);
    tableId = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, mjId, 'mj');

    // 2 systems in a visible quadrant, only 1 system made visible
    db.prepare('INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys1`, 'Empire', 0, 'r1', 'g1', 'd1');
    db.prepare('INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys2`, 'Reb', 1, 'r2', 'g2', 'd2');
    const sys1Id = db.prepare(`SELECT id FROM systems WHERE nom = '${TEST_PREFIX}sys1'`).get().id;
    toggleVisibility('quadrants', `${TEST_PREFIX}quad`, tableId, true);
    toggleVisibility('systems', sys1Id, tableId, true);
    // sys2 stays hidden (default=0)

    // 2 factions (visible by default), hide 1
    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac1`, 'F1', 'd1', 'i1', '#111');
    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac2`, 'F2', 'd2', 'i2', '#222');
    const fac2Id = db.prepare(`SELECT id FROM factions WHERE name = '${TEST_PREFIX}fac2'`).get().id;
    toggleVisibility('factions', fac2Id, tableId, false);

    // 1 ship_model, made visible
    db.prepare('INSERT INTO ship_models (id, nom, classe, origine, armement_json, systemes_secondaires_json) VALUES (?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}sm1`, `${TEST_PREFIX}sm1`, 'corvette', 'Empire', '[]', '[]');
    toggleVisibility('ship_models', `${TEST_PREFIX}sm1`, tableId, true);
  });

  after(() => {
    cleanTestData();
  });

  it('MJ counts = total entities per type', () => {
    const payload = getSyncPayload(tableId, 'mj');
    // MJ sees ALL — counts include test data + any pre-existing DB data
    assert.ok(payload.entities.systems.count >= 2, 'MJ should see at least 2 systems');
    assert.ok(payload.entities.factions.count >= 2, 'MJ should see at least 2 factions');
    assert.ok(payload.entities.ship_models.count >= 1, 'MJ should see at least 1 ship_model');
  });

  it('joueur counts = only visible entities', () => {
    const mjPayload = getSyncPayload(tableId, 'mj');
    const joueurPayload = getSyncPayload(tableId, 'joueur');

    // Joueur should see fewer than MJ (we hid 1 system and 1 faction)
    assert.ok(joueurPayload.entities.systems.count < mjPayload.entities.systems.count, 'joueur should see fewer systems than MJ');
    assert.ok(joueurPayload.entities.factions.count < mjPayload.entities.factions.count, 'joueur should see fewer factions than MJ');
  });

  it('visibility toggle changes joueur count', () => {
    const sys2Id = db.prepare(`SELECT id FROM systems WHERE nom = '${TEST_PREFIX}sys2'`).get().id;
    const before = getSyncPayload(tableId, 'joueur');
    const sysBefore = before.entities.systems.count;

    toggleVisibility('systems', sys2Id, tableId, true);
    const afterReveal = getSyncPayload(tableId, 'joueur');
    assert.equal(afterReveal.entities.systems.count, sysBefore + 1);

    // Restore
    toggleVisibility('systems', sys2Id, tableId, false);
    const afterHide = getSyncPayload(tableId, 'joueur');
    assert.equal(afterHide.entities.systems.count, sysBefore);
  });
});
