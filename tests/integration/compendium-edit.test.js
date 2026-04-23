import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_edit_int_';

function cleanTestData() {
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM factions WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM ship_models WHERE id LIKE '${TEST_PREFIX}%'`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Compendium edit API — PATCH integration', () => {
  let app;
  let mjCookie, playerCookie;
  let tableId;
  let sysId, facId;
  const smId = `${TEST_PREFIX}sm1`;

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

    // Register player + join
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

    // Create test entities
    const s = db.prepare('INSERT INTO systems (quadrant, nom, faction, description) VALUES (?, ?, ?, ?)').run('Alpha', `${TEST_PREFIX}sys1`, 'Empire', 'Desc');
    sysId = Number(s.lastInsertRowid);

    const f = db.prepare('INSERT INTO factions (name, short, description) VALUES (?, ?, ?)').run(`${TEST_PREFIX}fac1`, 'TF', 'Desc faction');
    facId = Number(f.lastInsertRowid);

    db.prepare('INSERT INTO ship_models (id, nom, classe, prix) VALUES (?, ?, ?, ?)').run(smId, `${TEST_PREFIX}vaisseau`, 'Croiseur', 50000);
  });

  after(() => {
    cleanTestData();
  });

  const h = () => ({ 'X-Table-Id': String(tableId) });

  // --- Systems ---

  it('MJ PATCH system → 200 + updated entity', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: { description: 'Nouvelle description' },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.description, 'Nouvelle description');
    assert.equal(res.body.data.nom, `${TEST_PREFIX}sys1`);
    assert.equal(res.body.data.id, sysId);
  });

  // --- Factions ---

  it('MJ PATCH faction → 200 + updated entity', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/factions/${facId}`,
      body: { description: 'Nouvelle desc faction' },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.description, 'Nouvelle desc faction');
    assert.equal(res.body.data.name, `${TEST_PREFIX}fac1`);
  });

  // --- Ship Models ---

  it('MJ PATCH ship_model → 200 + updated entity', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/ship-models/${smId}`,
      body: { prix: 75000 },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.prix, 75000);
    assert.equal(res.body.data.nom, `${TEST_PREFIX}vaisseau`);
  });

  // --- Authorization ---

  it('joueur PATCH → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: { description: 'should fail' },
      cookies: playerCookie, headers: h()
    });
    assert.equal(res.status, 403);
  });

  // --- Not found ---

  it('PATCH non-existent system → 404', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/systems/999999',
      body: { nom: 'test' },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 404);
  });

  // --- Validation ---

  it('PATCH with empty body → 400', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: {},
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 400);
  });

  it('PATCH with empty nom → 400', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: { nom: '' },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 400);
  });

  // --- No auth ---

  it('PATCH without auth → 401', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: { nom: 'test' },
      headers: h()
    });
    assert.equal(res.status, 401);
  });

  // --- No table ---

  it('PATCH without table context → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/systems/${sysId}`,
      body: { nom: 'test' },
      cookies: mjCookie
    });
    assert.equal(res.status, 403);
  });
});
