import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_admin_imp_';

function cleanTestData() {
  db.prepare('DELETE FROM systems WHERE nom LIKE ?').run(TEST_PREFIX + '%');
  db.prepare('DELETE FROM factions WHERE name LIKE ?').run(TEST_PREFIX + '%');
  db.prepare('DELETE FROM peril_data WHERE type LIKE ?').run(TEST_PREFIX + '%');
  const testUsers = db.prepare('SELECT id FROM users WHERE username LIKE ?').all(TEST_PREFIX + '%');
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare('DELETE FROM users WHERE username LIKE ?').run(TEST_PREFIX + '%');
}

describe('Admin import API — POST /api/admin/import', () => {
  let app;
  let adminCookie, playerCookie;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register admin (force is_admin=1 — DB may already have users from other test suites)
    const adminRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}admin`, password: 'password123' }
    });
    adminCookie = adminRes.cookies[0]?.split(';')[0];
    db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?').run(`${TEST_PREFIX}admin`);

    // Register normal user
    const playerRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];
  });

  after(() => {
    cleanTestData();
  });

  it('admin imports quadrants data — 200 with report', async () => {
    const quadrants = {
      'TESTQ-1': [
        { nom: `${TEST_PREFIX}Sol`, faction: `${TEST_PREFIX}Faction1`, isFrontiere: true, description: 'Test system' }
      ]
    };

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: quadrants,
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.imported, 1);
    assert.equal(res.body.data.skipped, 0);
    assert.equal(res.body.data.format, 'quadrants');
  });

  it('admin imports perils data — 200 with report', async () => {
    const perils = {
      [`${TEST_PREFIX}peril_type`]: { name: 'Test Peril', categories: [{ seuilMin: 1, seuilMax: 3 }] }
    };

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: perils,
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.imported, 1);
    assert.equal(res.body.data.format, 'perils');
  });

  it('non-admin user — 403', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: { 'Q-1': [] },
      cookies: playerCookie
    });

    assert.equal(res.status, 403);
  });

  it('no auth — 401', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: { 'Q-1': [] }
    });

    assert.equal(res.status, 401);
  });

  it('invalid JSON format — 200 with error in report', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: { not_a_valid_format: 'string_value' },
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.imported, 0);
    assert.ok(res.body.data.errors.length > 0);
  });

  it('import with duplicate handles error gracefully', async () => {
    // Import same data twice
    const quadrants = {
      'TESTQ-1': [
        { nom: `${TEST_PREFIX}Sol`, faction: `${TEST_PREFIX}Faction1` }
      ]
    };

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: quadrants,
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    // Should be skipped as duplicate
    assert.equal(res.body.data.skipped, 1);
    assert.ok(res.body.data.errors[0].reason.includes('Doublon'));
  });

  it('galactic events — 200 with skipped report', async () => {
    const events = [{ title: 'Test Event', dateStart: '0101.01', dateEnd: '0101.01' }];

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/admin/import',
      body: events,
      cookies: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.imported, 0);
    assert.equal(res.body.data.skipped, 1);
    assert.equal(res.body.data.format, 'events');
  });
});
