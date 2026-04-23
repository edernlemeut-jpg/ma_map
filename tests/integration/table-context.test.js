import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_tctx_int_';

function cleanTestData() {
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Table context — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let outsiderCookie;
  let tableId;
  let inviteCode;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register MJ user (first user = admin)
    const mjRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    // Register player user
    const playerRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];

    // Register outsider (not a member of any table)
    const outsiderRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}outsider`, password: 'password123' }
    });
    outsiderCookie = outsiderRes.cookies[0]?.split(';')[0];

    // MJ creates a table
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Table Contexte Test' },
      cookies: mjCookie
    });
    tableId = createRes.body.data.id;
    inviteCode = createRes.body.data.invite_code;

    // Player joins
    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });
  });

  after(() => {
    cleanTestData();
  });

  // --- GET /api/game_tables/active ---

  it('GET /active — returns table info with X-Table-Id for MJ', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, tableId);
    assert.equal(res.body.data.name, 'Table Contexte Test');
    assert.equal(res.body.data.role, 'mj');
    assert.equal(res.body.data.is_mj, true);
  });

  it('GET /active — returns joueur role for player', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'joueur');
    assert.equal(res.body.data.is_mj, false);
  });

  it('GET /active — returns null data without X-Table-Id', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      cookies: mjCookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data, null);
  });

  it('GET /active — returns 403 for non-member', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      cookies: outsiderCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
  });

  it('GET /active — returns 401 without auth', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 401);
  });

  // --- Middleware integration with other routes ---

  it('API request with valid X-Table-Id — middleware injects req.table', async () => {
    // GET /api/game_tables should still work with X-Table-Id header
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('API request without X-Table-Id — req.table is null, no error', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables',
      cookies: mjCookie
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('Non-member with X-Table-Id gets 403 on any API route', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/active',
      cookies: outsiderCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
  });

  // --- Non-regression: existing routes still work ---

  it('GET /api/game_tables/count — still works (non-regression)', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/count',
      cookies: mjCookie
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.count >= 0);
  });

  it('GET /api/health — still works without auth (non-regression)', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/health'
    });
    assert.equal(res.status, 200);
  });
});
