/**
 * Story 4.3 — Bulk visibility (POST /api/visibility/bulk)
 * Integration tests — T7.1 through T7.6
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_bulk_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Bulk Visibility API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;
  let quadrantName;
  let systemIds;

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

    // Pick a real quadrant name from DB
    const quad = db.prepare('SELECT quadrant FROM systems WHERE quadrant IS NOT NULL LIMIT 1').get();
    if (!quad) throw new Error('No systems with quadrant found in DB — seed data required');
    quadrantName = quad.quadrant;

    // Collect all system IDs in this quadrant
    systemIds = db.prepare('SELECT id FROM systems WHERE quadrant = ?').all(quadrantName).map(r => r.id);
  });

  after(() => {
    cleanTestData();
  });

  // T7.1 — MJ bulk-reveals all systems in a quadrant
  it('T7.1 MJ bulk-reveals systems in a quadrant — 200 with affected count and version', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'systems', filter: { quadrant: quadrantName }, visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data, 'body.data should exist');
    assert.equal(typeof res.body.data.affected, 'number', 'affected should be number');
    assert.ok(res.body.data.affected > 0, 'affected should be > 0');
    assert.equal(typeof res.body.data.version, 'number', 'version should be number');

    // Verify DB: each system in quadrant should now have visible=1
    for (const id of systemIds) {
      const rule = db.prepare(
        'SELECT visible FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?'
      ).get(tableId, 'systems', String(id));
      assert.ok(rule, `visibility rule should exist for system ${id}`);
      assert.equal(rule.visible, 1);
    }
  });

  // T7.2 — Joueur gets 403
  it('T7.2 player gets 403 on bulk endpoint', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'systems', filter: { quadrant: quadrantName }, visible: true },
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
  });

  // T7.3 — No table header → 400
  it('T7.3 missing table context returns 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'systems', filter: { quadrant: quadrantName }, visible: true },
      cookies: mjCookie
    });
    assert.equal(res.status, 400);
  });

  // T7.4 — Invalid entityType → 400
  it('T7.4 invalid entityType returns 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'unknown_type', filter: { quadrant: quadrantName }, visible: true },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 400);
  });

  // T7.5 — visible not boolean → 400
  it('T7.5 visible not boolean returns 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'systems', filter: { quadrant: quadrantName }, visible: 'yes' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 400);
  });

  // T7.6 — No filter → bulk applies to ALL systems
  it('T7.6 empty filter bulk-hides ALL systems of type', async () => {
    const totalSystems = db.prepare('SELECT COUNT(*) as n FROM systems').get().n;
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/visibility/bulk',
      body: { entityType: 'systems', filter: {}, visible: false },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.affected, totalSystems, 'should affect all systems');
  });
});
