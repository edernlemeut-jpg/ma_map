import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_ships_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM ships WHERE table_id IN (SELECT id FROM game_tables WHERE mj_id = ?)').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Ships API — integration', () => {
  let app;
  let mjCookie;
  let playerCookie;
  let tableId;
  let shipModelId;

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

    const model = db.prepare('SELECT id FROM ship_models LIMIT 1').get();
    shipModelId = model?.id;
  });

  after(() => {
    cleanTestData();
  });

  it('MJ can create a ship associated to the active table', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Atlas', notes: 'Vaisseau amiral' }
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.name, 'Atlas');
    assert.equal(res.body.data.table_id, tableId);
  });

  it('create with model_id pre-fills hull/crew/cargo_capacity when omitted', async () => {
    if (!shipModelId) return;

    const model = db.prepare('SELECT coque, equipage, soute FROM ship_models WHERE id = ?').get(shipModelId);
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Hoplite', model_id: shipModelId }
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.hull, Number(model.coque || 0));
    assert.equal(res.body.data.cargo_capacity, Number(model.soute || 0));
  });

  it('MJ can update and soft-delete a ship', async () => {
    const create = await httpRequest(app, {
      method: 'POST',
      path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Nomad', hull: 12, crew: 4, cargo_capacity: 90 }
    });
    const shipId = create.body.data.id;

    const patch = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/ships/${shipId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { notes: 'Refit', crew: 5 }
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.data.crew, 5);
    assert.equal(patch.body.data.notes, 'Refit');

    const del = await httpRequest(app, {
      method: 'DELETE',
      path: `/api/ships/${shipId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(del.status, 200);

    const row = db.prepare('SELECT deleted_at FROM ships WHERE id = ?').get(shipId);
    assert.ok(row.deleted_at, 'deleted_at should be set');
  });

  it('GET /api/ships excludes soft-deleted ships', async () => {
    const create = await httpRequest(app, {
      method: 'POST',
      path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { name: 'Ghost' }
    });
    const shipId = create.body.data.id;

    await httpRequest(app, {
      method: 'DELETE',
      path: `/api/ships/${shipId}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    const res = await httpRequest(app, {
      path: '/api/ships',
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200);
    assert.ok(!res.body.data.some(ship => ship.id === shipId));
  });

  it('player GET /api/ships returns only visible ships sorted alphabetically', async () => {
    const alpha = await httpRequest(app, {
      method: 'POST', path: '/api/ships', cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }, body: { name: 'Zeta' }
    });
    const beta = await httpRequest(app, {
      method: 'POST', path: '/api/ships', cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) }, body: { name: 'Alpha' }
    });

    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/ships/${alpha.body.data.id}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: true }
    });
    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/ships/${beta.body.data.id}`,
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
      body: { visible: true }
    });

    const res = await httpRequest(app, {
      path: '/api/ships',
      cookies: playerCookie,
      headers: { 'X-Table-Id': String(tableId) }
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const names = res.body.data.map(ship => ship.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'fr')));
  });
});