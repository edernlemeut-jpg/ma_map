import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_sync_delta_';

function cleanTestData() {
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Sync API - system deltas', () => {
  let app;
  let mjCookie;
  let joueurCookie;
  let tableId;
  let inviteCode;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    const mjRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    const joueurRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' }
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];

    const tableRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;
    inviteCode = tableRes.body.data.invite_code;

    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: joueurCookie
    });
  });

  after(() => {
    cleanTestData();
  });

  it('GET /api/sync as joueur returns systems delta arrays', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.version, 'number');
    assert.ok(res.body.data.version >= 1);
    assert.equal(typeof res.body.data.timestamp, 'string');

    const systems = res.body.data.entities.systems;
    assert.ok(Array.isArray(systems.revealed));
    assert.ok(Array.isArray(systems.hidden));
    assert.ok(Array.isArray(systems.updated));

    for (const sys of systems.revealed) {
      assert.ok(sys.id, 'revealed system should contain id');
      assert.ok('quadrant' in sys, 'revealed system should contain quadrant');
      assert.ok('nom' in sys, 'revealed system should contain nom');
    }
  });

  it('GET /api/sync as MJ returns updated array for systems', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    const systems = res.body.data.entities.systems;
    assert.ok(Array.isArray(systems.revealed));
    assert.ok(Array.isArray(systems.hidden));
    assert.ok(Array.isArray(systems.updated));
  });

  it('GET /api/sync without X-Table-Id returns 400', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: joueurCookie
    });
    assert.equal(res.status, 400);
  });

  it('GET /api/sync without auth returns 401', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 401);
  });
});
