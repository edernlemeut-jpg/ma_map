import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_sync_int_';

function cleanTestData() {
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Sync API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let outsiderCookie;
  let tableId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Register MJ user
    const mjRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' }
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    // Register outsider (not a member)
    const outsiderRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}outsider`, password: 'password123' }
    });
    outsiderCookie = outsiderRes.cookies[0]?.split(';')[0];

    // Create a table as MJ
    const tableRes = await httpRequest(app, {
      method: 'POST',
      path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie
    });
    tableId = tableRes.body.data.id;

    // Register player and join table
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

  it('GET /api/sync with auth + valid X-Table-Id → 200 + structured payload', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.version, 'number');
    assert.ok(Number.isInteger(res.body.data.version));
    assert.ok(res.body.data.version >= 1);
    assert.equal(typeof res.body.data.timestamp, 'string');
    // Validate ISO 8601
    const parsed = new Date(res.body.data.timestamp);
    assert.ok(!isNaN(parsed.getTime()));
    const entities = res.body.data.entities;
    for (const type of ['systems', 'factions', 'ship_models']) {
      assert.ok(type in entities, `entities should contain ${type}`);
      assert.equal(typeof entities[type].count, 'number');
    }
  });

  it('GET /api/sync with auth but WITHOUT X-Table-Id → 400', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('GET /api/sync without auth → 401', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/sync with X-Table-Id for non-member → 403', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: outsiderCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 403);
  });

  it('payload data contains version (number), timestamp (string), entities (object)', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const { version, timestamp, entities } = res.body.data;
    assert.equal(typeof version, 'number');
    assert.equal(typeof timestamp, 'string');
    assert.equal(typeof entities, 'object');
    assert.ok(entities !== null);
  });

  it('GET /api/sync includes sessionActive boolean', async () => {
    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.sessionActive, 'boolean');
  });

  it('GET /api/sync auto-disables sessionActive after 30 minutes of MJ inactivity', async () => {
    db.prepare(
      "UPDATE game_tables SET session_active = 1, session_last_activity = datetime('now', '-31 minutes') WHERE id = ?"
    ).run(tableId);

    const res = await httpRequest(app, {
      path: '/api/sync',
      cookies: outsiderCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    // outsider is forbidden; use MJ for actual payload check
    assert.equal(res.status, 403);

    const playerRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(playerRes.status, 200);
    assert.equal(playerRes.body.data.sessionActive, false);

    const row = db.prepare('SELECT session_active FROM game_tables WHERE id = ?').get(tableId);
    assert.equal(row.session_active, 0);
  });

  it('GET /api/sync includes active route for MJ and players when visible', async () => {
    const systems = db.prepare('SELECT id FROM systems LIMIT 3').all();
    const routeId = `route_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE travel_routes SET active = 0 WHERE table_id = ?').run(tableId);

    db.prepare(
      'INSERT INTO travel_routes (id, table_id, name, active) VALUES (?, ?, ?, 1)'
    ).run(routeId, tableId, 'Route active test');

    const insertWaypoint = db.prepare(
      'INSERT INTO route_waypoints (route_id, system_id, position) VALUES (?, ?, ?)'
    );
    systems.forEach((row, index) => insertWaypoint.run(routeId, row.id, index));

    const mjRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(mjRes.status, 200);
    assert.equal(mjRes.body.data.entities.travel_routes.active.id, routeId);
    assert.deepEqual(
      mjRes.body.data.entities.travel_routes.active.waypoint_ids,
      systems.map(s => s.id)
    );

    const playerRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(playerRes.status, 200);
    assert.equal(playerRes.body.data.entities.travel_routes.active.id, routeId);
  });

  it('GET /api/sync hides active route for players when visibility rule is false', async () => {
    const systems = db.prepare('SELECT id FROM systems LIMIT 2').all();
    const routeId = `route_hidden_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE travel_routes SET active = 0 WHERE table_id = ?').run(tableId);

    db.prepare(
      'INSERT INTO travel_routes (id, table_id, name, active) VALUES (?, ?, ?, 1)'
    ).run(routeId, tableId, 'Route masquee test');

    const insertWaypoint = db.prepare(
      'INSERT INTO route_waypoints (route_id, system_id, position) VALUES (?, ?, ?)'
    );
    systems.forEach((row, index) => insertWaypoint.run(routeId, row.id, index));

    const hideRes = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/visibility/travel_routes/${routeId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: false }
    });
    assert.equal(hideRes.status, 200, JSON.stringify(hideRes.body));

    const playerRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(playerRes.status, 200);
    assert.equal(playerRes.body.data.entities.travel_routes.active, null);
  });

  it('GET /api/sync includes itinerary section with bounded active route + ships + perils', async () => {
    const systems = db.prepare('SELECT id FROM systems LIMIT 3').all();
    const routeId = `route_itin_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE travel_routes SET active = 0 WHERE table_id = ?').run(tableId);
    db.prepare(
      'INSERT INTO travel_routes (id, table_id, name, active) VALUES (?, ?, ?, 1)'
    ).run(routeId, tableId, 'Route itinéraire sync');

    const insertWaypoint = db.prepare(
      'INSERT INTO route_waypoints (route_id, system_id, position) VALUES (?, ?, ?)'
    );
    systems.forEach((row, index) => insertWaypoint.run(routeId, row.id, index));

    db.prepare(
      'INSERT INTO route_perils (route_id, peril_id, segment_index, custom_text, is_manual) VALUES (?, ?, ?, ?, 1)'
    ).run(routeId, `manual:${routeId}:1`, 1, 'Péril sync visible');

    const createShip = await httpRequest(app, {
      method: 'POST', path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Navire Sync', notes: 'Visible in itinerary payload' }
    });
    assert.equal(createShip.status, 201);

    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/ships/${createShip.body.data.id}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: true }
    });
    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/route_perils/${routeId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: true }
    });

    const playerRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(playerRes.status, 200, JSON.stringify(playerRes.body));
    const itinerary = playerRes.body.data.itinerary;
    assert.ok(itinerary);
    assert.equal(itinerary.active_route.id, routeId);
    assert.ok(Array.isArray(itinerary.active_route.waypoint_ids));
    assert.ok(Array.isArray(itinerary.ships));
    assert.ok(Array.isArray(itinerary.perils));
    assert.equal(itinerary.ships.length >= 1, true);
    assert.equal(itinerary.perils.length >= 1, true);
  });

  it('GET /api/sync hides itinerary perils for players when route_perils visibility is false', async () => {
    const systems = db.prepare('SELECT id FROM systems LIMIT 2').all();
    const routeId = `route_itin_hidden_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE travel_routes SET active = 0 WHERE table_id = ?').run(tableId);
    db.prepare(
      'INSERT INTO travel_routes (id, table_id, name, active) VALUES (?, ?, ?, 1)'
    ).run(routeId, tableId, 'Route périls masqués');

    const insertWaypoint = db.prepare(
      'INSERT INTO route_waypoints (route_id, system_id, position) VALUES (?, ?, ?)'
    );
    systems.forEach((row, index) => insertWaypoint.run(routeId, row.id, index));

    db.prepare(
      'INSERT INTO route_perils (route_id, peril_id, segment_index, custom_text, is_manual) VALUES (?, ?, ?, ?, 1)'
    ).run(routeId, `manual:${routeId}:1`, 1, 'Péril non visible');

    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/route_perils/${routeId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: false }
    });

    const playerRes = await httpRequest(app, {
      path: '/api/sync',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(playerRes.status, 200, JSON.stringify(playerRes.body));
    assert.ok(playerRes.body.data.itinerary);
    assert.equal(playerRes.body.data.itinerary.active_route.id, routeId);
    assert.deepEqual(playerRes.body.data.itinerary.perils, []);
  });
});
