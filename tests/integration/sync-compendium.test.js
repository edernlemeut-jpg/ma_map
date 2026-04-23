import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_sync_comp_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE entity_id LIKE '${TEST_PREFIX}%' OR entity_id IN (SELECT CAST(id AS TEXT) FROM systems WHERE nom LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE entity_id IN (SELECT CAST(id AS TEXT) FROM factions WHERE name LIKE '${TEST_PREFIX}%') OR entity_id IN (SELECT id FROM ship_models WHERE id LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM visibility_rules WHERE entity_type = 'quadrants' AND entity_id LIKE '${TEST_PREFIX}%'`).run();
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

describe('Sync API — compendium counts integration', () => {
  let app;
  let mjCookie, joueurCookie;
  let tableId;

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
    const inviteCode = tableRes.body.data.invite_code;

    // Register joueur and join table
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' }
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];

    await httpRequest(app, {
      method: 'POST', path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: joueurCookie
    });

    // Insert test entities
    db.prepare('INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${TEST_PREFIX}quad`, `${TEST_PREFIX}sys1`, 'Empire', 0, 'r1', 'g1', 'd1');
    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac1`, 'F1', 'd1', 'i1', '#111');
    db.prepare('INSERT INTO ship_models (id, nom, classe, origine) VALUES (?, ?, ?, ?)').run(`${TEST_PREFIX}sm1`, `${TEST_PREFIX}sm1`, 'corvette', 'Empire');
  });

  after(() => {
    cleanTestData();
  });

  it('GET /api/sync returns entities with counts', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const { entities } = res.body.data;
    for (const type of ['systems', 'factions', 'ship_models']) {
      assert.ok(type in entities, `entities should contain ${type}`);
      assert.equal(typeof entities[type].count, 'number');
    }
  });

  it('MJ sync counts include all entities', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.ok(res.body.data.entities.systems.count >= 1);
    assert.ok(res.body.data.entities.factions.count >= 1);
    assert.ok(res.body.data.entities.ship_models.count >= 1);
  });

  it('joueur sync counts reflect only visible entities', async () => {
    const mjRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(mjRes.status, 200, 'MJ sync should be 200');
    const joueurRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(joueurRes.status, 200);
    // systems default hidden, factions default visible, ship_models default hidden
    // joueur should see fewer or equal systems/ship_models than MJ
    assert.ok(joueurRes.body.data.entities.systems.count <= mjRes.body.data.entities.systems.count);
    assert.ok(joueurRes.body.data.entities.ship_models.count <= mjRes.body.data.entities.ship_models.count);
  });

  it('visibility toggle changes joueur sync count', async () => {
    const sysId = db.prepare(`SELECT id FROM systems WHERE nom = '${TEST_PREFIX}sys1'`).get().id;

    // Make quadrant visible first, then system
    await httpRequest(app, {
      method: 'PATCH',
      path: `/api/visibility/quadrants/${TEST_PREFIX}quad`,
      body: { visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    const before = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    const countBefore = before.body.data.entities.systems.count;

    // Reveal system
    await httpRequest(app, {
      method: 'PATCH',
      path: `/api/visibility/systems/${sysId}`,
      body: { visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    const afterReveal = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(afterReveal.body.data.entities.systems.count, countBefore + 1);

    // Hide again
    await httpRequest(app, {
      method: 'PATCH',
      path: `/api/visibility/systems/${sysId}`,
      body: { visible: false },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    const afterHide = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(afterHide.body.data.entities.systems.count, countBefore);
  });
});
