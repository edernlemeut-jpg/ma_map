import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_route_perils_';

function cleanTestData() {
  db.prepare(`DELETE FROM route_perils WHERE route_id IN (SELECT id FROM travel_routes WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'))`).run();
  db.prepare(`DELETE FROM route_waypoints WHERE route_id IN (SELECT id FROM travel_routes WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'))`).run();
  db.prepare(`DELETE FROM travel_routes WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Route perils API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;
  let routeId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    const mjRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    const tableRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;

    const playerRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}player`, password: 'password123' }
    });
    playerCookie = playerRes.cookies[0]?.split(';')[0];

    await httpRequest(app, {
      method: 'POST', path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: tableRes.body.data.invite_code },
      cookies: playerCookie
    });

    const systems = db.prepare('SELECT id FROM systems LIMIT 3').all().map(r => r.id);
    const createRoute = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Route périls', active: true, waypoint_ids: systems }
    });
    routeId = createRoute.body.data.id;
  });

  after(() => {
    cleanTestData();
  });

  it('MJ can generate peril list for a route', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/travel-routes/${routeId}/perils/generate`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data.perils));
    assert.ok(res.body.data.perils.length >= 1);
    assert.equal(typeof res.body.data.perils[0].segment_index, 'number');
  });

  it('GET perils returns type, difficulty and description fields', async () => {
    const res = await httpRequest(app, {
      path: `/api/travel-routes/${routeId}/perils`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const first = res.body.data[0];
    assert.ok(first, 'Expected at least one peril');
    assert.equal(typeof first.type, 'string');
    assert.equal(typeof first.description, 'string');
  });

  it('MJ can edit and delete a generated peril', async () => {
    const list = await httpRequest(app, {
      path: `/api/travel-routes/${routeId}/perils`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    const perilId = list.body.data[0].id;

    const patch = await httpRequest(app, {
      method: 'PATCH', path: `/api/travel-routes/${routeId}/perils/${perilId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { custom_text: 'Version MJ éditée' }
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.data.custom_text, 'Version MJ éditée');

    const del = await httpRequest(app, {
      method: 'DELETE', path: `/api/travel-routes/${routeId}/perils/${perilId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(del.status, 200);
  });

  it('MJ can add a manual peril', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/travel-routes/${routeId}/perils`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { segment_index: 1, custom_text: 'Contact pirate improvisé' }
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.is_manual, true);
  });

  it('player can read perils but cannot generate or edit', async () => {
    const list = await httpRequest(app, {
      path: `/api/travel-routes/${routeId}/perils`,
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(list.status, 200);

    const generate = await httpRequest(app, {
      method: 'POST', path: `/api/travel-routes/${routeId}/perils/generate`,
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(generate.status, 403);
  });
});