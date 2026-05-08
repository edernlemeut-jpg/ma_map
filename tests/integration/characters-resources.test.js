import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_chr_res_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM characters WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('characters — ressources PP / Gloire / Énergie X', () => {
  let app;
  let mjCookie, joueur1Cookie, joueur2Cookie;
  let tableId;
  let joueur1Id, joueur2Id;
  let pjId, mutantId;

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

    const j1Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j1`, password: 'password123' }
    });
    joueur1Cookie = j1Res.cookies[0]?.split(';')[0];
    joueur1Id = j1Res.body.data.id;

    const j2Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j2`, password: 'password123' }
    });
    joueur2Cookie = j2Res.cookies[0]?.split(';')[0];
    joueur2Id = j2Res.body.data.id;

    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur1Id, 'joueur');
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur2Id, 'joueur');

    // PJ normal (non-mutant) — pp=3 par défaut
    const pjRes = await httpRequest(app, {
      method: 'POST', path: '/api/characters',
      body: { name: 'Res Tester', type: 'pj', user_id: joueur1Id, stats_json: JSON.stringify({ car: 3, sf: 2 }) },
      cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
    });
    pjId = pjRes.body.data.id;

    // PJ mutant — per=4, int=3 → energie_x_max=7
    const mutRes = await httpRequest(app, {
      method: 'POST', path: '/api/characters',
      body: {
        name: 'Mutant Tester', type: 'pj', user_id: joueur1Id, is_mutant: 1,
        stats_json: JSON.stringify({ car: 3, sf: 2, per: 4, int: 3 }),
      },
      cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
    });
    mutantId = mutRes.body.data.id;
    // Initialiser energie_x_cur à son max via PATCH MJ direct
    await httpRequest(app, {
      method: 'PATCH', path: `/api/characters/${mutantId}`,
      body: { energie_x_cur: 7 },
      cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
    });
  });

  after(() => cleanTestData());

  // ── PATCH /:id (MJ direct) ─────────────────────────────────────────────────

  describe('PATCH /api/characters/:id — MJ direct', () => {
    it('MJ met à jour pp, gloire → valeurs sauvegardées', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}`,
        body: { pp: 5, gloire: 10 },
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.pp, 5);
      assert.equal(res.body.data.gloire, 10);
    });

    it('pp minimum 0 (valeur négative corrigée)', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}`,
        body: { pp: -5 },
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.pp, 0);
    });

    it('energie_x_cur plafonnée à energie_x_max', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${mutantId}`,
        body: { energie_x_cur: 999 },
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.energie_x_cur, 7, 'plafonné à energie_x_max=7');
    });

    it('joueur ne peut pas utiliser PATCH /:id → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}`,
        body: { pp: 5 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 403);
    });

    it('sans champ → 400', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}`,
        body: {},
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 400);
    });
  });

  // ── PATCH /:id/resources (joueur delta) ───────────────────────────────────

  describe('PATCH /api/characters/:id/resources', () => {
    before(async () => {
      // Remettre pp=3 pour les tests suivants
      await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}`,
        body: { pp: 3 },
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
    });

    it('joueur owner dépense 1 PP (delta_pp=-1) → pp décrémenté', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: -1 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.pp, 2);
    });

    it('joueur owner : pp minimum 0 (ne passe pas en négatif)', async () => {
      // dépense plus que disponible
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: -99 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.pp, 0);
    });

    it('joueur owner peut augmenter PP (delta_pp > 0) → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: 1 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.pp >= 0);
    });

    it('MJ peut augmenter PP (delta_pp > 0) → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: 2 },
        cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.pp >= 0);
    });

    it('joueur mutant owner dépense énergie X (delta_energie_x=-2) → diminue', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${mutantId}/resources`,
        body: { delta_energie_x: -2 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.energie_x_cur, 5, '7 - 2 = 5');
    });

    it('energie_x_cur minimum 0 (ne passe pas en négatif)', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${mutantId}/resources`,
        body: { delta_energie_x: -999 },
        cookies: joueur1Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.energie_x_cur, 0);
    });

    it('joueur non-owner ne peut pas accéder → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: -1 },
        cookies: joueur2Cookie, headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 403);
    });

    it('sans auth → 401', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjId}/resources`,
        body: { delta_pp: -1 },
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 401);
    });
  });
});
