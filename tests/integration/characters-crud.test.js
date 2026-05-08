import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_chr_crud_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM characters WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('characters — CRUD PJ + isolation joueur', () => {
  let app;
  let mjCookie, joueur1Cookie, joueur2Cookie;
  let tableId;
  let joueur1Id, joueur2Id;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Créer MJ + table
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

    // Créer joueur 1
    const j1Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j1`, password: 'password123' }
    });
    joueur1Cookie = j1Res.cookies[0]?.split(';')[0];
    joueur1Id = j1Res.body.data.id;

    // Créer joueur 2
    const j2Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j2`, password: 'password123' }
    });
    joueur2Cookie = j2Res.cookies[0]?.split(';')[0];
    joueur2Id = j2Res.body.data.id;

    // Inscrire joueur1 et joueur2 à la table
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur1Id, 'joueur');
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur2Id, 'joueur');
  });

  after(() => cleanTestData());

  // ── POST : création PJ par MJ ──────────────────────────────────────────────

  describe('POST /api/characters — création PJ', () => {
    it('MJ crée un PJ → 201 + sante_json initialisé', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: {
          name: 'Zara Vex',
          type: 'pj',
          user_id: joueur1Id,
          archetype: 'Pilote',
          is_mutant: 0,
          stats_json: JSON.stringify({ car: 4, sf: 3, per: 2, int: 3 }),
          sante_niveaux: 3,
        },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.ok(res.body.data.id);
      assert.equal(res.body.data.name, 'Zara Vex');
      assert.equal(res.body.data.archetype, 'Pilote');
      assert.ok(res.body.data.sante, 'sante_json doit être initialisé');
      assert.equal(res.body.data.sante.niveaux.length, 3, '3 niveaux de santé');
      assert.equal(res.body.data.sante.niveaux[0].cases.length, 7, 'car(4)+sf(3)=7 cases par niveau');
      assert.equal(res.body.data.energie_x_max, 0, 'pas mutant → energie_x_max=0');
    });

    it('MJ crée un PJ mutant → energie_x_max = per+int', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: {
          name: 'Rex Mutant',
          type: 'pj',
          user_id: joueur2Id,
          is_mutant: 1,
          stats_json: JSON.stringify({ car: 3, sf: 2, per: 4, int: 3 }),
          sante_niveaux: 3,
        },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.is_mutant, 1);
      assert.equal(res.body.data.energie_x_max, 7, 'per(4)+int(3)=7');
    });

    it('POST sans nom → 400', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: { type: 'pj' },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 400);
    });
  });

  // ── GET liste : ?type=pj ───────────────────────────────────────────────────

  describe('GET /api/characters?type=pj', () => {
    it('MJ voit tous les PJs de sa table', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/characters?type=pj',
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 2, 'Au moins 2 PJs créés');
      for (const c of res.body.data) {
        assert.equal(c.type, 'pj');
      }
    });
  });

  // ── GET /:id : matrice isolation joueur ────────────────────────────────────

  describe('GET /api/characters/:id — isolation joueur', () => {
    let pjJ1Id;

    before(async () => {
      // Créer un PJ assigné à joueur1
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: { name: 'Iso Test PJ', type: 'pj', user_id: joueur1Id, stats_json: JSON.stringify({ car: 3, sf: 2 }) },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      pjJ1Id = res.body.data.id;
    });

    it('joueur1 (owner) peut voir son propre PJ → 200', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: joueur1Cookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.id, pjJ1Id);
    });

    it('joueur2 (non-owner) ne peut pas voir le PJ de joueur1 → 403', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: joueur2Cookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 403, JSON.stringify(res.body));
    });

    it('MJ peut voir le PJ de n\'importe quel joueur → 200', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    });

    it('ID inexistant pour la table → 404', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/characters/chr_nonexistent',
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 404);
    });
  });

  // ── DELETE : matrice isolation ─────────────────────────────────────────────

  describe('DELETE /api/characters/:id — matrice isolation', () => {
    let pjToDeleteId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: { name: 'Delete Test PJ', type: 'pj', user_id: joueur1Id, stats_json: JSON.stringify({ car: 2, sf: 2 }) },
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      pjToDeleteId = res.body.data.id;
    });

    it('joueur2 ne peut pas DELETE le PJ de joueur1 → 403', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${pjToDeleteId}`,
        cookies: joueur2Cookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 403, JSON.stringify(res.body));
    });

    it('MJ peut DELETE n\'importe quel PJ → 200', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${pjToDeleteId}`,
        cookies: mjCookie,
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    });
  });

  // ── Auth sans cookie ───────────────────────────────────────────────────────

  describe('Auth — accès sans cookie', () => {
    it('GET /api/characters sans auth → 401', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/characters',
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 401);
    });

    it('POST /api/characters sans auth → 401', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: { name: 'Ghost', type: 'pj' },
        headers: { 'X-Table-Id': String(tableId) },
      });
      assert.equal(res.status, 401);
    });
  });
});
