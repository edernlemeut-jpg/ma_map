import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_bulk_int_';

function cleanTestData() {
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('POST /api/systems/bulk — integration', () => {
  let app;
  let mjCookie, playerCookie;
  let tableId;

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
  });

  after(() => {
    cleanTestData();
  });

  const h = () => ({ 'X-Table-Id': String(tableId) });

  // --- Happy path ---

  it('MJ POST /bulk avec items valides → 200 + tableau de systèmes créés', async () => {
    const items = [
      { nom: `${TEST_PREFIX}sys_a`, quadrant: 'Alpha', gouvernement: 'Démocratie' },
      { nom: `${TEST_PREFIX}sys_b`, quadrant: 'Beta', description: 'Système test B' },
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.data), true);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data.every(s => typeof s.id === 'number'));
    assert.ok(res.body.data.find(s => s.nom === `${TEST_PREFIX}sys_a`));
    assert.ok(res.body.data.find(s => s.nom === `${TEST_PREFIX}sys_b`));
  });

  it('les systèmes créés par bulk sont en base', async () => {
    const row = db.prepare(`SELECT * FROM systems WHERE nom = '${TEST_PREFIX}sys_a'`).get();
    assert.ok(row);
    assert.equal(row.quadrant, 'Alpha');
    assert.equal(row.gouvernement, 'Démocratie');
  });

  it('bulk ignore les items sans nom', async () => {
    const items = [
      { nom: `${TEST_PREFIX}sys_valid`, quadrant: 'Gamma' },
      { quadrant: 'Gamma' },          // pas de nom → ignoré
      { nom: '', quadrant: 'Gamma' }, // nom vide → ignoré
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].nom, `${TEST_PREFIX}sys_valid`);
  });

  it('bulk ignore les items sans quadrant', async () => {
    const items = [
      { nom: `${TEST_PREFIX}sys_noq`, description: 'sans quadrant' }, // ignoré
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });

  it('bulk sérialise les champs *_json objets en string', async () => {
    const soleil = { nom: 'Solaris', classe: 'G' };
    const items = [
      { nom: `${TEST_PREFIX}sys_json`, quadrant: 'Delta', soleil_json: soleil }
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    const row = db.prepare(`SELECT soleil_json FROM systems WHERE nom = '${TEST_PREFIX}sys_json'`).get();
    // Doit être stocké comme string JSON
    assert.equal(typeof row.soleil_json, 'string');
    assert.deepEqual(JSON.parse(row.soleil_json), soleil);
  });

  it('bulk accepte les champs *_json déjà en string', async () => {
    const items = [
      {
        nom: `${TEST_PREFIX}sys_strjson`, quadrant: 'Epsilon',
        soleil_json: '{"nom":"Etoile"}',
        corps_celestes_json: '[{"nom":"Planete 1"}]'
      }
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  // --- Limite de taille ---

  it('bulk avec plus de 500 items → 400', async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({
      nom: `${TEST_PREFIX}overflow_${i}`, quadrant: 'Test'
    }));
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error?.message?.includes('500'));
  });

  // --- Tableau vide ---

  it('bulk avec tableau vide → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: [],
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 400);
  });

  it('bulk avec body non-tableau → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: { nom: 'not-array' },
      cookies: mjCookie, headers: h()
    });
    assert.equal(res.status, 400);
  });

  // --- Autorisation ---

  it('joueur POST /bulk → 403', async () => {
    const items = [{ nom: `${TEST_PREFIX}forbidden`, quadrant: 'Zeta' }];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: playerCookie, headers: h()
    });
    assert.equal(res.status, 403);
  });

  it('sans auth POST /bulk → 401', async () => {
    const items = [{ nom: `${TEST_PREFIX}noauth`, quadrant: 'Zeta' }];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      headers: h()
    });
    assert.equal(res.status, 401);
  });

  it('sans X-Table-Id POST /bulk → 400 ou 403', async () => {
    const items = [{ nom: `${TEST_PREFIX}notable`, quadrant: 'Zeta' }];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie
    });
    assert.ok([400, 403].includes(res.status));
  });

  // --- Transaction : échec atomique ---

  it('bulk avec item violant la contrainte UNIQUE → rollback complet', async () => {
    // Crée un système existant
    db.prepare('INSERT OR IGNORE INTO systems (quadrant, nom) VALUES (?, ?)').run('Omega', `${TEST_PREFIX}unique_existing`);

    const items = [
      { nom: `${TEST_PREFIX}unique_new_1`, quadrant: 'Omega' },
      { nom: `${TEST_PREFIX}unique_existing`, quadrant: 'Omega' }, // doublon → UNIQUE constraint
      { nom: `${TEST_PREFIX}unique_new_2`, quadrant: 'Omega' },
    ];
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/systems/bulk',
      body: items,
      cookies: mjCookie, headers: h()
    });
    // La transaction doit échouer → 400
    assert.equal(res.status, 400);
    // Aucun des nouveaux systèmes ne doit avoir été créé (rollback)
    const row1 = db.prepare(`SELECT id FROM systems WHERE nom = '${TEST_PREFIX}unique_new_1'`).get();
    const row2 = db.prepare(`SELECT id FROM systems WHERE nom = '${TEST_PREFIX}unique_new_2'`).get();
    assert.equal(row1, undefined, 'unique_new_1 ne doit pas exister après rollback');
    assert.equal(row2, undefined, 'unique_new_2 ne doit pas exister après rollback');
  });
});
