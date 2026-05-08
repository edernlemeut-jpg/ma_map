/**
 * characters-auth.test.js — Matrice d'autorisation exhaustive pour l'API PJ
 *
 * Couvre : NFR-PJ1 (toutes méthodes HTTP), AR7 — Story 8.6
 *
 * Matrice :
 * ┌────────────────────────────────────────────────┬───────────────┬──────────┐
 * │ Appel                                          │ Rôle          │ Résultat │
 * ├────────────────────────────────────────────────┼───────────────┼──────────┤
 * │ GET /api/characters/:own_id                    │ joueur owner  │ 200      │
 * │ GET /api/characters/:other_id                  │ joueur non-own│ 403      │
 * │ GET /api/characters/:any_id                    │ MJ            │ 200      │
 * │ PATCH /api/characters/:own_id/resources        │ joueur owner  │ 200      │
 * │ PATCH /api/characters/:other_id/resources      │ joueur non-own│ 403      │
 * │ PATCH /api/characters/:any_id (direct)         │ MJ            │ 200      │
 * │ DELETE /api/characters/:own_id                 │ joueur        │ 403      │
 * │ DELETE /api/characters/:any_id                 │ MJ            │ 200      │
 * │ PATCH delta_pp > 0                             │ joueur        │ 403      │
 * │ PATCH etat='noircie' /health                   │ joueur        │ 403      │
 * └────────────────────────────────────────────────┴───────────────┴──────────┘
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_chr_auth_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM characters WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('characters — matrice autorisation exhaustive (NFR-PJ1)', () => {
  let app;
  let mjCookie, joueur1Cookie, joueur2Cookie;
  let tableId;
  let joueur1Id, joueur2Id;
  /** PJ appartenant à joueur1 */
  let pjJ1Id;
  /** PJ muant appartenant à joueur1 (pour les tests /health et /resources Énergie X) */
  let pjMutantId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // MJ + table
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

    // Joueur 1
    const j1Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j1`, password: 'password123' }
    });
    joueur1Cookie = j1Res.cookies[0]?.split(';')[0];
    joueur1Id = j1Res.body.data.id;

    // Joueur 2
    const j2Res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}j2`, password: 'password123' }
    });
    joueur2Cookie = j2Res.cookies[0]?.split(';')[0];
    joueur2Id = j2Res.body.data.id;

    // Inscrire les deux joueurs à la table
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur1Id, 'joueur');
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur2Id, 'joueur');

    // Créer un PJ assigné à joueur1
    const pjRes = await httpRequest(app, {
      method: 'POST', path: '/api/characters',
      body: {
        name: 'Auth Matrix PJ',
        type: 'pj',
        user_id: joueur1Id,
        stats_json: JSON.stringify({ car: 4, sf: 3 }),
        sante_niveaux: 3,
      },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    pjJ1Id = pjRes.body.data.id;

    // Créer un PJ mutant assigné à joueur1
    const mutRes = await httpRequest(app, {
      method: 'POST', path: '/api/characters',
      body: {
        name: 'Auth Mutant PJ',
        type: 'pj',
        user_id: joueur1Id,
        is_mutant: 1,
        stats_json: JSON.stringify({ car: 3, sf: 2, per: 3, int: 3 }),
        sante_niveaux: 3,
      },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    pjMutantId = mutRes.body.data.id;
    // Mettre l'énergie X max
    await httpRequest(app, {
      method: 'PATCH', path: `/api/characters/${pjMutantId}`,
      body: { energie_x_cur: 6 },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
  });

  after(() => cleanTestData());

  const h = (id) => ({ 'X-Table-Id': String(tableId) });

  // ── GET /:id ───────────────────────────────────────────────────────────────

  describe('GET /api/characters/:id', () => {
    it('joueur owner → 200', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: joueur1Cookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.id, pjJ1Id);
    });

    it('joueur non-owner → 403', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: joueur2Cookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('MJ → 200 (n\'importe quel PJ)', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjJ1Id}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
    });
  });

  // ── PATCH /:id/resources (joueur) ──────────────────────────────────────────

  describe('PATCH /api/characters/:id/resources', () => {
    it('joueur owner (delta_pp=-1) → 200', async () => {
      // S'assurer que pp > 0
      await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}`,
        body: { pp: 3 },
        cookies: mjCookie, headers: h(),
      });
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}/resources`,
        body: { delta_pp: -1 },
        cookies: joueur1Cookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.pp, 2);
    });

    it('joueur non-owner → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}/resources`,
        body: { delta_pp: -1 },
        cookies: joueur2Cookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('MJ PATCH direct → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}`,
        body: { pp: 3 },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.pp, 3);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────────

  describe('DELETE /api/characters/:id', () => {
    let tempPjId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: {
          name: 'Temp Delete PJ',
          type: 'pj',
          user_id: joueur1Id,
          stats_json: JSON.stringify({ car: 2, sf: 2 }),
        },
        cookies: mjCookie, headers: h(),
      });
      tempPjId = res.body.data.id;
    });

    it('joueur owner ne peut pas DELETE son propre PJ → 403', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${tempPjId}`,
        cookies: joueur1Cookie, headers: h(),
      });
      assert.equal(res.status, 403, `body: ${JSON.stringify(res.body)}`);
    });

    it('joueur non-owner ne peut pas DELETE → 403', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${tempPjId}`,
        cookies: joueur2Cookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('MJ peut DELETE → 200', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${tempPjId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
    });
  });

  // ── Règles spécialisées ────────────────────────────────────────────────────

  describe('PATCH delta_pp > 0 par joueur owner → 200', () => {
    it('joueur owner peut augmenter PP → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}/resources`,
        body: { delta_pp: 2 },
        cookies: joueur1Cookie, headers: h(),
      });
      assert.equal(res.status, 200);
    });
  });

  describe('PATCH etat=\'noircie\' par joueur → 403', () => {
    it('joueur owner tente de noircir une case → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'noircie' },
        cookies: joueur1Cookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('joueur non-owner ne peut pas accéder à /health → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/characters/${pjJ1Id}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
        cookies: joueur2Cookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });
  });

  // ── Compléments délétion (suppression = MJ only — vérification symétrique) ─

  describe('Isolation cross-table', () => {
    let tableBId, mjBCookie, pjBId;

    before(async () => {
      const mjBRes = await httpRequest(app, {
        method: 'POST', path: '/api/auth/register',
        body: { username: `${TEST_PREFIX}mjB`, password: 'password123' }
      });
      mjBCookie = mjBRes.cookies[0]?.split(';')[0];

      const tableBRes = await httpRequest(app, {
        method: 'POST', path: '/api/game_tables',
        body: { name: `${TEST_PREFIX}tableB` },
        cookies: mjBCookie,
      });
      tableBId = tableBRes.body.data.id;

      const pjBRes = await httpRequest(app, {
        method: 'POST', path: '/api/characters',
        body: { name: 'Table B PJ', type: 'pj', stats_json: JSON.stringify({ car: 3, sf: 2 }) },
        cookies: mjBCookie,
        headers: { 'X-Table-Id': String(tableBId) },
      });
      pjBId = pjBRes.body.data.id;
    });

    it('MJ table A ne peut pas GET le PJ de table B → 404', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/characters/${pjBId}`,
        cookies: mjCookie, headers: h(),
      });
      // table_id filter garantit 404 cross-table
      assert.equal(res.status, 404);
    });

    it('MJ table A ne peut pas DELETE le PJ de table B → 404', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/characters/${pjBId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 404);
    });
  });
});
