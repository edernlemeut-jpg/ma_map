import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_search_int_';

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

describe('Search API — integration', () => {
  let app;
  let mjCookie, playerCookie;
  let tableId;
  const smVisId = `${TEST_PREFIX}sm_vis`;
  const smHidId = `${TEST_PREFIX}sm_hid`;

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
    const s1 = db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run('Alpha', `${TEST_PREFIX}sys_visible`);
    const sysVisId = Number(s1.lastInsertRowid);
    db.prepare('INSERT INTO systems (quadrant, nom) VALUES (?, ?)').run('Beta', `${TEST_PREFIX}sys_hidden`);

    db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}faction_a`, 'FA', 'Alliance', '🔴', '#f00');

    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smVisId, `${TEST_PREFIX}vaisseau_a`, 'Croiseur');
    db.prepare('INSERT INTO ship_models (id, nom, classe) VALUES (?, ?, ?)').run(smHidId, `${TEST_PREFIX}vaisseau_b`, 'Cargo');

    // Set visibility
    const h = { 'X-Table-Id': String(tableId) };
    // Make quadrant visible first (systems cascade requires quadrant visibility)
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/quadrants/Alpha`, body: { visible: true }, cookies: mjCookie, headers: h });
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/systems/${sysVisId}`, body: { visible: true }, cookies: mjCookie, headers: h });
    await httpRequest(app, { method: 'PATCH', path: `/api/visibility/ship_models/${smVisId}`, body: { visible: true }, cookies: mjCookie, headers: h });
  });

  after(() => {
    cleanTestData();
  });

  it('MJ gets results with visible field', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 4);
    for (const r of res.body.data) {
      assert.ok('visible' in r, 'MJ results should have visible field');
      assert.ok('type' in r, 'Results should have type field');
    }
  });

  it('joueur gets results without visible field', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}`,
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    for (const r of res.body.data) {
      assert.ok(!('visible' in r), 'Joueur results should NOT have visible field');
    }
  });

  it('joueur does not see hidden entities (plausible deniability)', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}sys`,
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const names = res.body.data.map(r => r.nom);
    assert.ok(names.includes(`${TEST_PREFIX}sys_visible`));
    assert.ok(!names.includes(`${TEST_PREFIX}sys_hidden`));
  });

  it('returns empty array when q is missing', async () => {
    const res = await httpRequest(app, {
      path: '/api/search',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });

  it('returns empty array when q is too short (1 char)', async () => {
    const res = await httpRequest(app, {
      path: '/api/search?q=a',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });

  it('filters by types parameter', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}&types=systems`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    for (const r of res.body.data) {
      assert.equal(r.type, 'systems');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}`,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 without table context', async () => {
    const res = await httpRequest(app, {
      path: `/api/search?q=${TEST_PREFIX}`,
      cookies: mjCookie
    });
    assert.equal(res.status, 400);
  });
});
