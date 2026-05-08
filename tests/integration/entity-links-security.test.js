import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_el_sec_';

function cleanTestData() {
  db.prepare(`DELETE FROM entity_links WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('entity-links — sécurité & isolation', () => {
  let app;
  let mjCookieA, mjCookieB;
  let tableIdA, tableIdB;
  let sysIdA, sysIdB;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Créer MJ A + table A
    const mjARes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mjA`, password: 'password123' }
    });
    mjCookieA = mjARes.cookies[0]?.split(';')[0];

    const tableARes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}tableA` },
      cookies: mjCookieA
    });
    tableIdA = tableARes.body.data.id;

    // Créer MJ B + table B
    const mjBRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mjB`, password: 'password123' }
    });
    mjCookieB = mjBRes.cookies[0]?.split(';')[0];

    const tableBRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}tableB` },
      cookies: mjCookieB
    });
    tableIdB = tableBRes.body.data.id;

    // Insérer systèmes de test directement en DB
    sysIdA = Number(db.prepare("INSERT INTO systems (quadrant, nom) VALUES (?, ?)").run(`${TEST_PREFIX}q`, `${TEST_PREFIX}sysA`).lastInsertRowid);
    sysIdB = Number(db.prepare("INSERT INTO systems (quadrant, nom) VALUES (?, ?)").run(`${TEST_PREFIX}q`, `${TEST_PREFIX}sysB`).lastInsertRowid);
  });

  after(() => {
    cleanTestData();
    db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  });

  // ── Matrice validation source_type ───────────────────────────────────────────

  describe('POST /api/entity-links — validation source_type', () => {
    const validPayload = () => ({
      source_id: 1, target_type: 'faction', target_id: 2
    });

    it('source_type valide → 201', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', ...validPayload() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.ok(res.body.data.id);
    });

    it('source_type null → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: null, ...validPayload() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });

    it('source_type chaîne vide → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: '', ...validPayload() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });

    it('source_type valeur inconnue "monster" → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'monster', ...validPayload() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });

    it('source_type tentative injection SQL → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: "'; DROP TABLE entity_links; --", ...validPayload() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });
  });

  // ── Matrice validation target_type ───────────────────────────────────────────

  describe('POST /api/entity-links — validation target_type', () => {
    const validBase = () => ({ source_type: 'system', source_id: 1, target_id: 2 });

    it('target_type null → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { target_type: null, ...validBase() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });

    it('target_type chaîne vide → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { target_type: '', ...validBase() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });

    it('target_type valeur inconnue → 400 INVALID_ENTITY_TYPE', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { target_type: 'dungeon', ...validBase() },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ENTITY_TYPE');
    });
  });

  // ── Isolation cross-table ─────────────────────────────────────────────────────

  describe('GET /api/entity-links — isolation table_id', () => {
    it('le MJ de la table A ne voit pas les liens de la table B', async () => {
      // Créer un lien dans la table B
      const createRes = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: sysIdB, target_type: 'faction', target_id: 99 },
        cookies: mjCookieB, headers: { 'X-Table-Id': String(tableIdB) }
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

      // Le MJ A interroge avec l'id système de la table B
      const getRes = await httpRequest(app, {
        path: `/api/entity-links?source_type=system&source_id=${sysIdB}`,
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.data.length, 0, 'Aucun lien de la table B ne doit être visible depuis la table A');
    });
  });

  // ── DELETE isolation table_id ─────────────────────────────────────────────────

  describe('DELETE /api/entity-links/:id — isolation table_id', () => {
    it('supprimer un lien appartenant à une autre table → 403', async () => {
      // Créer un lien dans la table B
      const createRes = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: sysIdB, target_type: 'faction', target_id: 50 },
        cookies: mjCookieB, headers: { 'X-Table-Id': String(tableIdB) }
      });
      assert.equal(createRes.status, 201);
      const linkId = createRes.body.data.id;

      // Le MJ A tente de supprimer ce lien
      const delRes = await httpRequest(app, {
        method: 'DELETE', path: `/api/entity-links/${linkId}`,
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(delRes.status, 403);
    });

    it('supprimer un lien de sa propre table → 204', async () => {
      const createRes = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: sysIdA, target_type: 'faction', target_id: 10 },
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(createRes.status, 201);
      const linkId = createRes.body.data.id;

      const delRes = await httpRequest(app, {
        method: 'DELETE', path: `/api/entity-links/${linkId}`,
        cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(delRes.status, 204);
    });
  });

  // ── Auth + rôle ───────────────────────────────────────────────────────────────

  describe('Rôle et authentification', () => {
    it('GET sans X-Table-Id → 400', async () => {
      const res = await httpRequest(app, {
        path: '/api/entity-links',
        cookies: mjCookieA
      });
      assert.equal(res.status, 400);
    });

    it('GET sans cookie (non authentifié) → 401', async () => {
      const res = await httpRequest(app, {
        path: '/api/entity-links',
        headers: { 'X-Table-Id': String(tableIdA) }
        // pas de cookies
      });
      assert.equal(res.status, 401);
    });

    it('POST sans cookie (non authentifié) → 401', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: 1, target_type: 'faction', target_id: 2 },
        headers: { 'X-Table-Id': String(tableIdA) }
        // pas de cookies
      });
      assert.equal(res.status, 401);
    });

    it('DELETE sans cookie (non authentifié) → 401', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: '/api/entity-links/999',
        headers: { 'X-Table-Id': String(tableIdA) }
        // pas de cookies
      });
      assert.equal(res.status, 401);
    });

    it('POST par un joueur → 403', async () => {
      // Créer un joueur et le faire rejoindre la table A
      const joueurRes = await httpRequest(app, {
        method: 'POST', path: '/api/auth/register',
        body: { username: `${TEST_PREFIX}joueur`, password: 'password123' }
      });
      const joueurCookie = joueurRes.cookies[0]?.split(';')[0];

      // Récupérer le code d'invitation
      const tables = db.prepare("SELECT invite_code FROM game_tables WHERE id = ?").get(tableIdA);
      await httpRequest(app, {
        method: 'POST', path: `/api/game_tables/${tableIdA}/join`,
        body: { invite_code: tables.invite_code },
        cookies: joueurCookie
      });

      const res = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: 1, target_type: 'faction', target_id: 2 },
        cookies: joueurCookie, headers: { 'X-Table-Id': String(tableIdA) }
      });
      assert.equal(res.status, 403);
    });
  });

  // ── Isolation GET cross-table (MJ table A ne voit pas liens table B) ─────────
  // Note : ce test est aussi présent dans le describe ci-dessus, mais on le
  // maintient ici en tant que test nommé explicitement pour la couverture 7.4.

  describe('Couverture NFR-EL1 — synthèse', () => {
    it('tous les types valides acceptés en POST', async () => {
      const valid = ['system', 'faction', 'ship', 'named_npc', 'character', 'event'];
      for (const t of valid) {
        const res = await httpRequest(app, {
          method: 'POST', path: '/api/entity-links',
          body: { source_type: t, source_id: 1, target_type: t, target_id: 2 },
          cookies: mjCookieA, headers: { 'X-Table-Id': String(tableIdA) }
        });
        assert.equal(res.status, 201, `Type "${t}" devrait retourner 201, reçu ${res.status}`);
      }
    });
  });
});
