import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_vis_int_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Visibility API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
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

    // Create a table
    const tableRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;

    // Register player and join table
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
  });

  after(() => {
    cleanTestData();
  });

  it('MJ can toggle visibility — 200 + result', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/systems/1',
      body: { visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.entityType, 'systems');
    assert.equal(res.body.data.entityId, '1');
    assert.equal(res.body.data.visible, true);
  });

  it('player gets 403 when trying to toggle', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/systems/1',
      body: { visible: true },
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('returns 400 without table context', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/systems/1',
      body: { visible: true },
      cookies: mjCookie
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid entityType', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/invalid_type/1',
      body: { visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('invalide'));
  });

  it('returns 401 without auth', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/systems/1',
      body: { visible: true },
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 when visible is not a boolean', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/systems/1',
      body: { visible: 'yes' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes('booléen'));
  });

  it('toggle persists and can be read back', async () => {
    // Toggle on
    await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/factions/1',
      body: { visible: false },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    // Toggle back
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/visibility/factions/1',
      body: { visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.visible, true);
  });
});
