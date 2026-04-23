import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isVisible, getVisibleIds, toggleVisibility } from '../../src/services/visibility.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_vis_';

// Helpers
function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE entity_id LIKE '${TEST_PREFIX}%' OR entity_id IN (SELECT CAST(id AS TEXT) FROM systems WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE entity_id IN (SELECT CAST(id AS TEXT) FROM factions WHERE name LIKE '${TEST_PREFIX}%') OR entity_id IN (SELECT id FROM ship_models WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM visibility_rules WHERE entity_id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE entity_id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM table_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM game_tables WHERE mj_id IN (SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM factions WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM ship_models WHERE id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

function createTestUser(username) {
  const r = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)').run(username, 'fakehash');
  return Number(r.lastInsertRowid);
}

function createTestTable(mjId) {
  const r = db.prepare('INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)').run(`${TEST_PREFIX}table`, mjId, 'ZZZTST');
  const tableId = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, mjId, 'mj');
  return tableId;
}

describe('Visibility service', () => {
  let tableId;
  let systemId1, systemId2;
  let factionId;
  let shipModelId;

  before(() => {
    cleanTestData();
    const mjId = createTestUser(`${TEST_PREFIX}mj`);
    tableId = createTestTable(mjId);

    // Insert test systems in quadrant "Alpha"
    const s1 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run('Alpha', `${TEST_PREFIX}sys1`);
    systemId1 = Number(s1.lastInsertRowid);
    const s2 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run('Alpha', `${TEST_PREFIX}sys2`);
    systemId2 = Number(s2.lastInsertRowid);

    // Insert test faction
    const f = db.prepare('INSERT INTO factions (name) VALUES (?)').run(`${TEST_PREFIX}faction`);
    factionId = Number(f.lastInsertRowid);

    // Insert test ship_model (TEXT id)
    shipModelId = `${TEST_PREFIX}ship1`;
    db.prepare('INSERT INTO ship_models (id, nom) VALUES (?, ?)').run(shipModelId, `${TEST_PREFIX}vaisseau`);
  });

  after(() => {
    cleanTestData();
  });

  // === Protect-by-default ===

  it('systems are hidden by default for joueur', () => {
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), false);
  });

  it('ship_models are hidden by default for joueur', () => {
    assert.equal(isVisible('ship_models', shipModelId, tableId, 'joueur'), false);
  });

  it('factions are visible by default for joueur', () => {
    assert.equal(isVisible('factions', factionId, tableId, 'joueur'), true);
  });

  // === MJ role ===

  it('MJ sees everything regardless of rules', () => {
    assert.equal(isVisible('systems', systemId1, tableId, 'mj'), true);
    assert.equal(isVisible('ship_models', shipModelId, tableId, 'mj'), true);
    assert.equal(isVisible('factions', factionId, tableId, 'mj'), true);
  });

  it('getVisibleIds returns ALL IDs for MJ', () => {
    const ids = getVisibleIds('systems', tableId, 'mj');
    assert.ok(ids.includes(systemId1));
    assert.ok(ids.includes(systemId2));
  });

  // === Toggle ===

  it('toggleVisibility makes hidden system visible (with visible quadrant)', () => {
    // Quadrant must be visible first for system to be visible (cascade rule)
    toggleVisibility('quadrants', 'Alpha', tableId, true);
    const result = toggleVisibility('systems', systemId1, tableId, true);
    assert.deepStrictEqual(result, { entityType: 'systems', entityId: String(systemId1), visible: true });
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), true);
    // Cleanup
    toggleVisibility('systems', systemId1, tableId, false);
    db.prepare('DELETE FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .run(tableId, 'quadrants', 'Alpha');
  });

  it('toggleVisibility can hide a visible system', () => {
    toggleVisibility('systems', systemId1, tableId, false);
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), false);
  });

  it('toggle persists in visibility_rules for campaign entities', () => {
    toggleVisibility('systems', systemId1, tableId, true);
    const rule = db.prepare('SELECT visible FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .get(tableId, 'systems', String(systemId1));
    assert.ok(rule);
    assert.equal(rule.visible, 1);
    // Cleanup
    toggleVisibility('systems', systemId1, tableId, false);
  });

  it('toggle persists in table_visibility_overrides for universe entities', () => {
    toggleVisibility('factions', factionId, tableId, false);
    const rule = db.prepare('SELECT visible FROM table_visibility_overrides WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .get(tableId, 'factions', String(factionId));
    assert.ok(rule);
    assert.equal(rule.visible, 0);
    // Restore default
    db.prepare('DELETE FROM table_visibility_overrides WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .run(tableId, 'factions', String(factionId));
  });

  // === Cascade ===

  it('hidden quadrant makes all its systems invisible even if individually visible', () => {
    // First make quadrant visible, then system1 individually visible
    toggleVisibility('quadrants', 'Alpha', tableId, true);
    toggleVisibility('systems', systemId1, tableId, true);
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), true);

    // Hide the quadrant
    toggleVisibility('quadrants', 'Alpha', tableId, false);
    // Now system1 should be hidden (cascade)
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), false);
    assert.equal(isVisible('systems', systemId2, tableId, 'joueur'), false);
  });

  it('visible quadrant lets systems use their individual visibility', () => {
    // Make quadrant visible
    toggleVisibility('quadrants', 'Alpha', tableId, true);
    // system1 was individually visible
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), true);
    // system2 has no rule → default hidden
    assert.equal(isVisible('systems', systemId2, tableId, 'joueur'), false);
  });

  it('removing quadrant rule restores default (hidden) cascade', () => {
    // Remove quadrant rule — default is hidden
    db.prepare('DELETE FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .run(tableId, 'quadrants', 'Alpha');
    // Quadrant default = hidden → system1 hidden despite individual rule
    assert.equal(isVisible('systems', systemId1, tableId, 'joueur'), false);
    // Cleanup
    toggleVisibility('systems', systemId1, tableId, false);
  });

  // === getVisibleIds ===

  it('getVisibleIds returns only visible IDs for joueur', () => {
    // Make system1 visible + quadrant visible
    toggleVisibility('quadrants', 'Alpha', tableId, true);
    toggleVisibility('systems', systemId1, tableId, true);

    const ids = getVisibleIds('systems', tableId, 'joueur');
    assert.ok(ids.includes(systemId1), 'system1 should be visible');
    assert.ok(!ids.includes(systemId2), 'system2 should be hidden');

    // Cleanup
    toggleVisibility('quadrants', 'Alpha', tableId, false);
    toggleVisibility('systems', systemId1, tableId, false);
  });

  it('getVisibleIds respects cascade for joueur', () => {
    // system1 individually visible but quadrant hidden
    toggleVisibility('systems', systemId1, tableId, true);
    toggleVisibility('quadrants', 'Alpha', tableId, false);

    const ids = getVisibleIds('systems', tableId, 'joueur');
    assert.ok(!ids.includes(systemId1), 'system1 hidden by cascade');

    // Cleanup
    toggleVisibility('systems', systemId1, tableId, false);
    db.prepare('DELETE FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?')
      .run(tableId, 'quadrants', 'Alpha');
  });
});
