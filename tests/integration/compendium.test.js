import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_comp_int_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
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

describe('Compendium API — integration', () => {
  let app;
  let mjCookie, playerCookie;
  let tableId;
  let sysVisibleId, sysHiddenId;
  let facDefaultId, facHiddenId;
  const smVisibleId = `${TEST_PREFIX}sm_vis`;
  const smHiddenId = `${TEST_PREFIX}sm_hid`;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register MJ
    const mjRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    // Create table
    const tableRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;

    // Register player + join
    const playerRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];
    const inviteCode = tableRes.body.data.invite_code;
    await httpRequest(app, {
      method: 'POST', path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });

    // Create test entities
    const s1 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys_vis`);
    sysVisibleId = Number(s1.lastInsertRowid);
    const s2 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys_hid`);
    sysHiddenId = Number(s2.lastInsertRowid);

    const f1 = db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac_def`, 'FD', 'desc', 'icon', '#111');
    facDefaultId = Number(f1.lastInsertRowid);
    const f2 = db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac_hid`, 'FH', 'desc', 'icon', '#222');
    facHiddenId = Number(f2.lastInsertRowid);

    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smVisibleId, `${TEST_PREFIX}vaisseau_vis`, 'Croiseur');
    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smHiddenId, `${TEST_PREFIX}vaisseau_hid`, 'Cargo');

    // Set visibility via API (MJ)
    const h = { 'X-Table-Id': String(tableId) };
    // Make quadrant visible
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/quadrants/${TEST_PREFIX}quad`, body: { visible: true }, cookies: mjCookie, headers: h });
    // Make one system visible
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/systems/${sysVisibleId}`, body: { visible: true }, cookies: mjCookie, headers: h });
    // Hide one faction
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/factions/${facHiddenId}`, body: { visible: false }, cookies: mjCookie, headers: h });
    // Make one ship_model visible
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/ship_models/${smVisibleId}`, body: { visible: true }, cookies: mjCookie, headers: h });
  });

  after(() => {
    cleanTestData();
  });

  // === SYSTEMS ROUTE ===

  describe('GET /api/systems', () => {
    it('MJ sees all test systems with visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/systems', cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testSystems = data.filter(s => s.nom.startsWith(TEST_PREFIX));
      assert.equal(testSystems.length, 2);
      for (const s of testSystems) {
        assert.equal(typeof s.visible, 'boolean');
      }
    });

    it('joueur sees only visible systems without visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/systems', cookies: playerCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testSystems = data.filter(s => s.nom.startsWith(TEST_PREFIX));
      assert.equal(testSystems.length, 1);
      assert.equal(testSystems[0].id, sysVisibleId);
      for (const s of data) {
        assert.equal('visible' in s, false);
      }
    });

    it('returns 400 without table context', async () => {
      const res = await httpRequest(app, {
        path: '/api/systems', cookies: mjCookie
      });
      assert.equal(res.status, 400);
    });

    it('returns 401 without auth', async () => {
      const res = await httpRequest(app, {
        path: '/api/systems',
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 401);
    });
  });

  // === FACTIONS ROUTE ===

  describe('GET /api/factions', () => {
    it('MJ sees all test factions with visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/factions', cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testFactions = data.filter(f => f.name.startsWith(TEST_PREFIX));
      assert.equal(testFactions.length, 2);
      for (const f of testFactions) {
        assert.equal(typeof f.visible, 'boolean');
      }
      const def = testFactions.find(f => f.id === facDefaultId);
      const hid = testFactions.find(f => f.id === facHiddenId);
      assert.equal(def.visible, true);
      assert.equal(hid.visible, false);
    });

    it('joueur sees only visible factions without visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/factions', cookies: playerCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testFactions = data.filter(f => f.name.startsWith(TEST_PREFIX));
      assert.equal(testFactions.length, 1);
      assert.equal(testFactions[0].id, facDefaultId);
      for (const f of data) {
        assert.equal('visible' in f, false);
      }
    });

    it('returns 400 without table context', async () => {
      const res = await httpRequest(app, {
        path: '/api/factions', cookies: mjCookie
      });
      assert.equal(res.status, 400);
    });

    it('returns 401 without auth', async () => {
      const res = await httpRequest(app, {
        path: '/api/factions',
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 401);
    });
  });

  // === SHIP-MODELS ROUTE ===

  describe('GET /api/ship-models', () => {
    it('MJ sees all test ship models with visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/ship-models', cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testModels = data.filter(m => m.nom.startsWith(TEST_PREFIX));
      assert.equal(testModels.length, 2);
      for (const m of testModels) {
        assert.equal(typeof m.visible, 'boolean');
      }
      const vis = testModels.find(m => m.id === smVisibleId);
      const hid = testModels.find(m => m.id === smHiddenId);
      assert.equal(vis.visible, true);
      assert.equal(hid.visible, false);
    });

    it('joueur sees only visible ship models without visible field', async () => {
      const res = await httpRequest(app, {
        path: '/api/ship-models', cookies: playerCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const data = res.body.data;
      const testModels = data.filter(m => m.nom.startsWith(TEST_PREFIX));
      assert.equal(testModels.length, 1);
      assert.equal(testModels[0].id, smVisibleId);
      for (const m of data) {
        assert.equal('visible' in m, false);
      }
    });

    it('returns 400 without table context', async () => {
      const res = await httpRequest(app, {
        path: '/api/ship-models', cookies: mjCookie
      });
      assert.equal(res.status, 400);
    });

    it('returns 401 without auth', async () => {
      const res = await httpRequest(app, {
        path: '/api/ship-models',
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 401);
    });
  });

  // === PLAUSIBLE DENIABILITY ===

  describe('plausible deniability', () => {
    it('joueur response has no count metadata', async () => {
      const res = await httpRequest(app, {
        path: '/api/systems', cookies: playerCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
      const body = res.body;
      assert.equal('total_count' in body, false);
      assert.equal('has_more' in body, false);
      assert.equal('page' in body, false);
      assert.equal('limit' in body, false);
      // Only data key
      assert.deepEqual(Object.keys(body), ['data']);
    });
  });

  // === NON-REGRESSION ===

  describe('non-regression — existing routes', () => {
    it('health route still works', async () => {
      const res = await httpRequest(app, { path: '/api/health' });
      assert.equal(res.status, 200);
    });

    it('auth route still works', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/auth/login',
        body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
      });
      assert.equal(res.status, 200);
    });

    it('sync route still works', async () => {
      const res = await httpRequest(app, {
        path: '/api/sync', cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
    });

    it('visibility route still works', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/visibility/systems/${sysVisibleId}`,
        body: { visible: true },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) }
      });
      assert.equal(res.status, 200);
    });
  });
});
