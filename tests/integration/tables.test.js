import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_tables_';

function cleanTestData() {
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Tables routes — integration', () => {
  let app;
  let authCookie;
  let adminCookie;
  let playerCookie;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register admin user and force is_admin=1 (db may already have users from other suites)
    const adminRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}admin`, password: 'password123' }
    });
    adminCookie = adminRes.cookies[0]?.split(';')[0];
    db.prepare(`UPDATE users SET is_admin = 1 WHERE username = ?`).run(`${TEST_PREFIX}admin`);

    // Register MJ user
    const mjRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    authCookie = mjRes.cookies[0]?.split(';')[0];

    // Register player user
    const playerRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];
  });

  after(() => {
    cleanTestData();
  });

  // --- COUNT (non-regression from story 1.3) ---

  it('GET /api/game_tables/count — returns count', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/count',
      cookies: authCookie
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.count >= 0);
  });

  it('GET /api/game_tables/count — returns 401 without auth', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables/count'
    });
    assert.equal(res.status, 401);
  });

  // --- CREATE TABLE ---

  it('POST /api/game_tables — creates table with invite_code (201)', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Table de Test' },
      cookies: authCookie
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.name, 'Table de Test');
    assert.ok(res.body.data.invite_code);
    assert.equal(res.body.data.invite_code.length, 6);
  });

  it('POST /api/game_tables — returns 400 without name', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: {},
      cookies: authCookie
    });
    assert.equal(res.status, 400);
  });

  // --- LIST TABLES ---

  it('GET /api/game_tables — returns user tables', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables',
      cookies: authCookie
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
    // MJ should see invite_code
    const table = res.body.data[0];
    assert.ok(table.invite_code);
    assert.equal(table.role, 'mj');
  });

  // --- JOIN TABLE ---

  it('POST /api/game_tables/:id/join — player joins with valid code (200)', async () => {
    // Create a table first
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Join Test Table' },
      cookies: authCookie
    });
    const inviteCode = createRes.body.data.invite_code;

    const res = await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${createRes.body.data.id}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.table_id);
  });

  it('POST /api/game_tables/:id/join — invalid code returns 404', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables/999/join',
      body: { invite_code: 'ZZZZZZ' },
      cookies: playerCookie
    });
    assert.equal(res.status, 404);
  });

  it('POST /api/game_tables/:id/join — duplicate returns 409', async () => {
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Dup Join Table' },
      cookies: authCookie
    });
    const inviteCode = createRes.body.data.invite_code;

    // First join
    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${createRes.body.data.id}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });

    // Second join — duplicate
    const res = await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${createRes.body.data.id}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });
    assert.equal(res.status, 409);
  });

  // --- UPDATE MEMBER ROLE ---

  it('PATCH /:id/members/:userId — admin changes role (200)', async () => {
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Role Test Table' },
      cookies: authCookie
    });
    const tableId = createRes.body.data.id;
    const inviteCode = createRes.body.data.invite_code;

    // Player joins
    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });

    // Get player user id
    const player = db.prepare(`SELECT id FROM users WHERE username = '${TEST_PREFIX}player'`).get();

    const res = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/game_tables/${tableId}/members/${player.id}`,
      body: { role: 'mj' },
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'mj');
  });

  it('PATCH /:id/members/:userId — refuses MJ creator modification (400)', async () => {
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Creator Test Table' },
      cookies: authCookie
    });
    const tableId = createRes.body.data.id;
    const mj = db.prepare(`SELECT id FROM users WHERE username = '${TEST_PREFIX}mj'`).get();

    const res = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/game_tables/${tableId}/members/${mj.id}`,
      body: { role: 'joueur' },
      cookies: adminCookie
    });

    assert.equal(res.status, 400);
  });

  it('PATCH /:id/members/:userId — non-admin returns 403', async () => {
    const createRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: 'Forbidden Test Table' },
      cookies: authCookie
    });
    const tableId = createRes.body.data.id;
    const inviteCode = createRes.body.data.invite_code;

    await httpRequest(app, {
      method: 'POST',
      path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: playerCookie
    });

    const player = db.prepare(`SELECT id FROM users WHERE username = '${TEST_PREFIX}player'`).get();

    const res = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/game_tables/${tableId}/members/${player.id}`,
      body: { role: 'mj' },
      cookies: authCookie  // MJ but not admin
    });

    assert.equal(res.status, 403);
  });

  // --- PLAYER LIST (invite_code hidden) ---

  it('GET /api/game_tables — player does not see invite_code', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/game_tables',
      cookies: playerCookie
    });

    assert.equal(res.status, 200);
    const playerTables = res.body.data.filter(t => t.role === 'joueur');
    if (playerTables.length > 0) {
      assert.equal(playerTables[0].invite_code, undefined);
    }
  });
});
