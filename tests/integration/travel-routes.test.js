import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_routes_';

function cleanTestData() {
  db.prepare(`DELETE FROM route_waypoints WHERE route_id IN (SELECT id FROM travel_routes WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'))`).run();
  db.prepare(`DELETE FROM travel_routes WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Travel Routes API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;
  let systemIds;

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

    systemIds = db.prepare('SELECT id FROM systems LIMIT 4').all().map(r => r.id);
  });

  after(() => {
    cleanTestData();
  });

  it('MJ can create route with ordered waypoints', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Convoyage', active: true, waypoint_ids: systemIds.slice(0, 3) }
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.name, 'Convoyage');
    assert.equal(res.body.data.active, true);
    assert.deepEqual(res.body.data.waypoint_ids, systemIds.slice(0, 3));
  });

  it('only one route can stay active per table', async () => {
    const first = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Alpha', active: true, waypoint_ids: systemIds.slice(0, 2) }
    });
    const second = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Beta', active: true, waypoint_ids: systemIds.slice(1, 3) }
    });

    assert.equal(second.status, 201, JSON.stringify(second.body));

    const firstRow = db.prepare('SELECT active FROM travel_routes WHERE id = ?').get(first.body.data.id);
    const secondRow = db.prepare('SELECT active FROM travel_routes WHERE id = ?').get(second.body.data.id);
    assert.equal(firstRow.active, 0);
    assert.equal(secondRow.active, 1);
  });

  it('MJ can patch route waypoints and deactivate route', async () => {
    const create = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Patchable', active: true, waypoint_ids: systemIds.slice(0, 2) }
    });

    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/travel-routes/${create.body.data.id}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { waypoint_ids: systemIds.slice(0, 4), active: false }
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.active, false);
    assert.deepEqual(res.body.data.waypoint_ids, systemIds.slice(0, 4));
  });

  it('rejects route create when a system_id does not exist', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Invalid', active: false, waypoint_ids: [999999] }
    });

    assert.equal(res.status, 400);
  });

  it('player can list routes but cannot create them', async () => {
    const create = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Visible route', active: false, waypoint_ids: systemIds.slice(0, 2) }
    });
    assert.equal(create.status, 201);

    const list = await httpRequest(app, {
      path: '/api/travel-routes',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data));

    const createAsPlayer = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Forbidden', active: false, waypoint_ids: systemIds.slice(0, 2) }
    });
    assert.equal(createAsPlayer.status, 403);
  });

  it('MJ can delete a route', async () => {
    const create = await httpRequest(app, {
      method: 'POST', path: '/api/travel-routes',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Delete me', active: false, waypoint_ids: systemIds.slice(0, 2) }
    });

    const del = await httpRequest(app, {
      method: 'DELETE', path: `/api/travel-routes/${create.body.data.id}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(del.status, 200);

    const row = db.prepare('SELECT id FROM travel_routes WHERE id = ?').get(create.body.data.id);
    assert.equal(row, undefined);
  });
});
