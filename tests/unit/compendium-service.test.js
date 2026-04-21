import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSystems, getFactions, getShipModels } from '../../src/services/compendium.js';
import { toggleVisibility } from '../../src/services/visibility.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_comp_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE entity_id LIKE '${TEST_PREFIX}%' OR entity_id IN (SELECT CAST(id AS TEXT) FROM systems WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE entity_id IN (SELECT CAST(id AS TEXT) FROM factions WHERE name LIKE '${TEST_PREFIX}%') OR entity_id IN (SELECT id FROM ship_models WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM visibility_rules WHERE entity_type = 'quadrants' AND entity_id = '${TEST_PREFIX}quad'`).run();
  db.prepare(`DELETE FROM table_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).run();
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
  const r = db.prepare('INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)').run(`${TEST_PREFIX}table`, mjId, `${TEST_PREFIX}INV`);
  const tableId = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, mjId, 'mj');
  return tableId;
}

describe('Compendium service', () => {
  let tableId;
  let sysVisible, sysHidden;
  let factionDefault, factionHidden;
  let smVisible, smHidden;

  before(() => {
    cleanTestData();
    const mjId = createTestUser(`${TEST_PREFIX}mj`);
    tableId = createTestTable(mjId);

    // Systems — in quadrant TEST_PREFIX+'quad'
    const s1 = db.prepare('INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys_vis`, 'Empire', 0, 'route1', 'gov1', 'desc1');
    sysVisible = Number(s1.lastInsertRowid);
    const s2 = db.prepare('INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys_hid`, 'Rébellion', 1, 'route2', 'gov2', 'desc2');
    sysHidden = Number(s2.lastInsertRowid);

    // Make quadrant visible first, then make one system visible
    toggleVisibility('quadrants', `${TEST_PREFIX}quad`, tableId, true);
    toggleVisibility('systems', sysVisible, tableId, true);
    // sysHidden remains hidden (default = 0)

    // Factions — visible by default
    const f1 = db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac_def`, 'FD', 'desc_f1', 'icon1', '#111');
    factionDefault = Number(f1.lastInsertRowid);
    const f2 = db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac_hid`, 'FH', 'desc_f2', 'icon2', '#222');
    factionHidden = Number(f2.lastInsertRowid);

    // Explicitly hide one faction
    toggleVisibility('factions', factionHidden, tableId, false);

    // Ship models — hidden by default
    smVisible = `${TEST_PREFIX}sm_vis`;
    smHidden = `${TEST_PREFIX}sm_hid`;
    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smVisible, `${TEST_PREFIX}vaisseau_vis`, 'Croiseur');
    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smHidden, `${TEST_PREFIX}vaisseau_hid`, 'Cargo');

    // Make one ship_model visible
    toggleVisibility('ship_models', smVisible, tableId, true);
    // smHidden remains hidden (default = 0)
  });

  after(() => {
    cleanTestData();
  });

  // === JOUEUR — filtrage ===

  describe('joueur — systems', () => {
    it('returns only visible systems', () => {
      const result = getSystems(tableId, 'joueur');
      const testSystems = result.filter(s => s.nom.startsWith(TEST_PREFIX));
      assert.equal(testSystems.length, 1);
      assert.equal(testSystems[0].id, sysVisible);
    });

    it('does not include visible field', () => {
      const result = getSystems(tableId, 'joueur');
      for (const s of result) {
        assert.equal('visible' in s, false, `system ${s.id} should not have visible field`);
      }
    });
  });

  describe('joueur — factions', () => {
    it('returns visible factions (visible by default)', () => {
      const result = getFactions(tableId, 'joueur');
      const testFactions = result.filter(f => f.name.startsWith(TEST_PREFIX));
      assert.equal(testFactions.length, 1);
      assert.equal(testFactions[0].id, factionDefault);
    });

    it('does not include visible field', () => {
      const result = getFactions(tableId, 'joueur');
      for (const f of result) {
        assert.equal('visible' in f, false, `faction ${f.id} should not have visible field`);
      }
    });
  });

  describe('joueur — ship_models', () => {
    it('returns only visible ship models', () => {
      const result = getShipModels(tableId, 'joueur');
      const testModels = result.filter(m => m.nom.startsWith(TEST_PREFIX));
      assert.equal(testModels.length, 1);
      assert.equal(testModels[0].id, smVisible);
    });

    it('does not include visible field', () => {
      const result = getShipModels(tableId, 'joueur');
      for (const m of result) {
        assert.equal('visible' in m, false, `ship_model ${m.id} should not have visible field`);
      }
    });
  });

  // === MJ — tous + champ visible ===

  describe('mj — systems', () => {
    it('returns ALL systems with visible boolean', () => {
      const result = getSystems(tableId, 'mj');
      const testSystems = result.filter(s => s.nom.startsWith(TEST_PREFIX));
      assert.equal(testSystems.length, 2);
      for (const s of testSystems) {
        assert.equal(typeof s.visible, 'boolean', `system ${s.id} should have visible boolean`);
      }
    });

    it('visible field reflects joueur visibility', () => {
      const result = getSystems(tableId, 'mj');
      const vis = result.find(s => s.id === sysVisible);
      const hid = result.find(s => s.id === sysHidden);
      assert.equal(vis.visible, true);
      assert.equal(hid.visible, false);
    });
  });

  describe('mj — factions', () => {
    it('returns ALL factions with visible boolean', () => {
      const result = getFactions(tableId, 'mj');
      const testFactions = result.filter(f => f.name.startsWith(TEST_PREFIX));
      assert.equal(testFactions.length, 2);
      for (const f of testFactions) {
        assert.equal(typeof f.visible, 'boolean', `faction ${f.id} should have visible boolean`);
      }
    });

    it('visible field reflects joueur visibility', () => {
      const result = getFactions(tableId, 'mj');
      const def = result.find(f => f.id === factionDefault);
      const hid = result.find(f => f.id === factionHidden);
      assert.equal(def.visible, true);
      assert.equal(hid.visible, false);
    });
  });

  describe('mj — ship_models', () => {
    it('returns ALL ship models with visible boolean', () => {
      const result = getShipModels(tableId, 'mj');
      const testModels = result.filter(m => m.nom.startsWith(TEST_PREFIX));
      assert.equal(testModels.length, 2);
      for (const m of testModels) {
        assert.equal(typeof m.visible, 'boolean', `ship_model ${m.id} should have visible boolean`);
      }
    });

    it('visible field reflects joueur visibility', () => {
      const result = getShipModels(tableId, 'mj');
      const vis = result.find(m => m.id === smVisible);
      const hid = result.find(m => m.id === smHidden);
      assert.equal(vis.visible, true);
      assert.equal(hid.visible, false);
    });
  });

  // === CASCADE — quadrant hidden hides systems ===

  describe('cascade — quadrant hidden', () => {
    let sysCascade;

    before(() => {
      const s = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run(`${TEST_PREFIX}quad_hidden`, `${TEST_PREFIX}sys_cascade`);
      sysCascade = Number(s.lastInsertRowid);
      // quadrant not made visible → hidden by default
      // system explicitly made visible, but parent quadrant is hidden
      toggleVisibility('systems', sysCascade, tableId, true);
    });

    after(() => {
      db.prepare(`DELETE FROM visibility_rules WHERE entity_id = '${sysCascade}'`).run();
      db.prepare(`DELETE FROM systems WHERE id = ?`).run(sysCascade);
    });

    it('joueur does not see system in hidden quadrant', () => {
      const result = getSystems(tableId, 'joueur');
      const cascaded = result.find(s => s.id === sysCascade);
      assert.equal(cascaded, undefined);
    });

    it('mj sees system in hidden quadrant with visible: false', () => {
      const result = getSystems(tableId, 'mj');
      const cascaded = result.find(s => s.id === sysCascade);
      assert.ok(cascaded, 'MJ should see the system');
      assert.equal(cascaded.visible, false);
    });
  });

  // === COLUMNS — verify shape ===

  describe('column contract', () => {
    it('systems returns correct columns without internal ones', () => {
      const result = getSystems(tableId, 'joueur');
      if (result.length > 0) {
        const keys = Object.keys(result[0]);
        assert.ok(keys.includes('id'));
        assert.ok(keys.includes('quadrant'));
        assert.ok(keys.includes('nom'));
        assert.ok(keys.includes('faction'));
        assert.ok(keys.includes('is_frontiere'));
        assert.ok(keys.includes('route'));
        assert.ok(keys.includes('gouvernement'));
        assert.ok(keys.includes('description'));
        // JSON columns are intentionally included (needed by itineraire.js for system reconstruction)
        assert.ok(keys.includes('soleil_json'));
        assert.ok(keys.includes('corps_celestes_json'));
        assert.ok(keys.includes('patrouilles_json'));
        // Internal audit columns must not leak
        assert.ok(!keys.includes('created_at'));
        assert.ok(!keys.includes('updated_at'));
        assert.ok(!keys.includes('visible'));
      }
    });

    it('factions returns correct columns', () => {
      const result = getFactions(tableId, 'joueur');
      if (result.length > 0) {
        const keys = Object.keys(result[0]);
        assert.ok(keys.includes('id'));
        assert.ok(keys.includes('name'));
        assert.ok(keys.includes('short'));
        assert.ok(keys.includes('description'));
        assert.ok(keys.includes('icon'));
        assert.ok(keys.includes('color'));
        assert.ok(!keys.includes('created_at'));
        assert.ok(!keys.includes('updated_at'));
        assert.ok(!keys.includes('visible'));
      }
    });

    it('ship_models returns correct columns', () => {
      const result = getShipModels(tableId, 'mj');
      if (result.length > 0) {
        const keys = Object.keys(result[0]);
        assert.ok(keys.includes('id'));
        assert.ok(keys.includes('nom'));
        assert.ok(keys.includes('classe'));
        assert.ok(keys.includes('armement_json'));
        assert.ok(keys.includes('systemes_secondaires_json'));
        assert.ok(!keys.includes('created_at'));
        assert.ok(!keys.includes('updated_at'));
        // MJ has visible field
        assert.ok(keys.includes('visible'));
      }
    });
  });
});
