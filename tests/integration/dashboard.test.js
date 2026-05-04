import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_dashboard_';

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

describe('Dashboard API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register MJ (premier inscrit = admin + MJ)
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

  // T6.1 — MJ peut appeler GET /api/dashboard
  it('T6.1 MJ can call GET /api/dashboard — 200 with stats and recent_changes', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data, 'body.data should exist');
    assert.ok(res.body.data.stats, 'stats should exist');
    assert.ok(typeof res.body.data.stats.systems_visible === 'number', 'systems_visible should be a number');
    assert.ok(typeof res.body.data.stats.systems_total === 'number', 'systems_total should be a number');
    assert.ok(typeof res.body.data.stats.players_total === 'number', 'players_total should be a number');
    assert.ok(Array.isArray(res.body.data.recent_changes), 'recent_changes should be an array');
  });

  // T6.2 — Joueur reçoit 403
  it('T6.2 player gets 403 when accessing dashboard', async () => {
    // First select the table for the player
    await httpRequest(app, {
      method: 'GET', path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  // T6.3 — Stats systèmes cohérents
  it('T6.3 stats.systems counts are consistent with actual visibility', async () => {
    // Get total systems count
    const total = db.prepare('SELECT COUNT(*) as count FROM systems').get().count;

    // Set 2 systems visible for our table — also set their quadrants visible (cascade requirement)
    const systems = db.prepare('SELECT id, quadrant FROM systems LIMIT 2').all();
    for (const s of systems) {
      // Make parent quadrant visible first
      db.prepare(`
        INSERT OR REPLACE INTO visibility_rules (table_id, entity_type, entity_id, visible)
        VALUES (?, 'quadrants', ?, 1)
      `).run(tableId, s.quadrant);
      // Then make the system visible
      db.prepare(`
        INSERT OR REPLACE INTO visibility_rules (table_id, entity_type, entity_id, visible)
        VALUES (?, 'systems', ?, 1)
      `).run(tableId, String(s.id));
    }

    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.stats.systems_total, total);
    assert.ok(res.body.data.stats.systems_visible >= 2, 'at least 2 systems visible');
  });

  // T6.4 — recent_changes limité à 10
  it('T6.4 recent_changes is limited to 10 entries', async () => {
    // Insert 15 visibility changes for systems
    const systemIds = db.prepare('SELECT id FROM systems LIMIT 15').all();
    for (const s of systemIds) {
      db.prepare(`
        INSERT OR REPLACE INTO visibility_rules (table_id, entity_type, entity_id, visible)
        VALUES (?, 'systems', ?, 1)
      `).run(tableId, String(s.id));
    }

    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.recent_changes.length <= 10, 'should return at most 10 recent changes');
  });

  // T6.5 — players_total count
  it('T6.5 stats.players_total reflects table member count (joueurs only)', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.stats.players_total, 1, 'should count 1 joueur member');
  });

  // T6.6 — Sans table sélectionnée → erreur
  it('T6.6 without table context returns error', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/dashboard',
      cookies: mjCookie
    });
    // Should return 400 (no table) consistent with sync.js pattern
    assert.ok(res.status === 400 || res.status === 403, 'should reject request without table');
  });
});
