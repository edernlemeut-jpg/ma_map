import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_preview_sync_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Preview Sync API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    const mjRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    const tableRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;

    const playerRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];

    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: tableRes.body.data.invite_code },
      cookies: playerCookie
    });
  });

  after(() => {
    cleanTestData();
  });

  it('MJ can call GET /api/preview/sync and receive joueur-style payload', async () => {
    const res = await httpRequest(app, {
      path: '/api/preview/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.data.version, 'number');
    assert.equal(typeof res.body.data.entities, 'object');
    assert.ok(Array.isArray(res.body.data.entities.systems.revealed));
    assert.ok(Array.isArray(res.body.data.entities.systems.updated));
    // Joueur-style payload => updated should stay empty
    assert.equal(res.body.data.entities.systems.updated.length, 0);
  });

  it('Player gets 403 on GET /api/preview/sync', async () => {
    const res = await httpRequest(app, {
      path: '/api/preview/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 403);
  });
});
