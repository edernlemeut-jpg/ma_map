/**
 * named-npcs-crud.test.js — CRUD PNJ Nommés + isolation joueur
 *
 * Couvre : FR9.1, FR9.2, FR9.3, NFR-NPC1 — Story 9.1
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_npc_crud_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM named_npcs WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('PNJ Nommés — CRUD (Story 9.1)', () => {
  let app;
  let mjCookie, joueurCookie;
  let tableId;
  let npcId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // MJ + table
    const mjRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj`, password: 'password123' },
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    const tableRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table` },
      cookies: mjCookie,
    });
    tableId = tableRes.body.data.id;

    // Joueur inscrit à la table
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' },
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const joueurId = joueurRes.body.data.id;
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueurId, 'joueur');
  });

  after(() => cleanTestData());

  const h = () => ({ 'X-Table-Id': String(tableId) });

  // ── POST ────────────────────────────────────────────────────────────────────

  describe('POST /api/named-npcs', () => {
    it('MJ crée un PNJ minimal → 201 avec visible=false', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'Capitaine Ramirez', role_type: 'premier_role' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 201, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.nom, 'Capitaine Ramirez');
      assert.equal(res.body.data.visible, false);
      assert.equal(res.body.data.role_type, 'premier_role');
      npcId = res.body.data.id;
    });

    it('MJ crée un PNJ avec stats → sante_json initialisé', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: {
          nom: 'Sergent Kova',
          role_type: 'second_role',
          stats_json: JSON.stringify({ car: 4, sf: 3 }),
          sante_niveaux: 3,
        },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.sante, 'sante_json doit être parsé');
      assert.ok(Array.isArray(res.body.data.sante.niveaux));
      // CAR+SF = 7 cases par niveau
      assert.equal(res.body.data.sante.niveaux[0].cases.length, 7);
    });

    it('MJ crée un PNJ mutant → energie_x calculé', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: {
          nom: 'Mutante Sera',
          role_type: 'premier_role',
          is_mutant: 1,
          stats_json: JSON.stringify({ car: 3, sf: 2, per: 4, int: 3 }),
        },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.is_mutant, true);
      assert.equal(res.body.data.energie_x, 7); // per(4)+int(3)
    });

    it('Champ nom manquant → 400', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { role_type: 'premier_role' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 400);
    });

    it('role_type invalide → 400', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'Test', role_type: 'boss_final' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 400);
    });

    it('Joueur ne peut pas créer → 403', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'Pirate', role_type: 'second_role' },
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('Sans auth → 401', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'Ghost', role_type: 'second_role' },
        headers: h(),
      });
      assert.equal(res.status, 401);
    });
  });

  // ── GET liste ────────────────────────────────────────────────────────────────

  describe('GET /api/named-npcs', () => {
    it('MJ voit tous les PNJ (visibles + cachés)', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      // MJ reçoit le payload complet (stats présentes si renseignées)
      const ramirez = res.body.data.find(n => n.nom === 'Capitaine Ramirez');
      assert.ok(ramirez, 'Doit contenir Capitaine Ramirez');
      assert.ok('pp' in ramirez, 'MJ reçoit payload complet');
    });

    it('Joueur ne voit que les PNJ visibles', async () => {
      // Ramirez est visible=false → ne doit pas apparaître
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs',
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const ramirez = res.body.data.find(n => n.nom === 'Capitaine Ramirez');
      assert.equal(ramirez, undefined, 'PNJ non visible ne doit pas apparaître pour un joueur');
    });
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────────

  describe('GET /api/named-npcs/:id', () => {
    it('MJ peut lire un PNJ non visible → 200 complet', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${npcId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.id, npcId);
      assert.ok('pp' in res.body.data);
    });

    it('Joueur sur PNJ non visible → 403', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${npcId}`,
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('ID inconnu → 404', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs/99999',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 404);
    });
  });

  // ── PATCH ────────────────────────────────────────────────────────────────────

  describe('PATCH /api/named-npcs/:id', () => {
    it('MJ peut modifier un PNJ → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcId}`,
        body: { motivation: 'Devenir riche', visible: 1 },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.motivation, 'Devenir riche');
      assert.equal(res.body.data.visible, true);
    });

    it('Joueur ne peut pas modifier → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcId}`,
        body: { motivation: 'Tricher' },
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('Aucun champ → 400', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcId}`,
        body: {},
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 400);
    });
  });

  // ── PATCH /health ─────────────────────────────────────────────────────────────

  describe('PATCH /api/named-npcs/:id/health', () => {
    let npcWithStatsId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: {
          nom: 'Test Health NPC',
          role_type: 'second_role',
          stats_json: JSON.stringify({ car: 3, sf: 2 }),
        },
        cookies: mjCookie, headers: h(),
      });
      npcWithStatsId = res.body.data.id;
    });

    it('MJ peut cocher une case → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcWithStatsId}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.sante.niveaux[0].cases[0].etat, 'cochée');
    });

    it('MJ peut noircir une case → 200', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcWithStatsId}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'noircie' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.sante.niveaux[0].cases[0].etat, 'noircie');
    });

    it('Joueur ne peut pas modifier la santé → 403', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcWithStatsId}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('État invalide → 400', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcWithStatsId}/health`,
        body: { niveau_index: 0, case_index: 0, etat: 'blessé' },
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 400);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────────

  describe('DELETE /api/named-npcs/:id', () => {
    let tempId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'À Supprimer', role_type: 'second_role' },
        cookies: mjCookie, headers: h(),
      });
      tempId = res.body.data.id;
    });

    it('Joueur ne peut pas supprimer → 403', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/named-npcs/${tempId}`,
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 403);
    });

    it('MJ peut supprimer → 200', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/named-npcs/${tempId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.deleted, true);
    });

    it('PNJ supprimé → 404', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${tempId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 404);
    });
  });

  // ── Isolation cross-table ─────────────────────────────────────────────────────

  describe('Isolation cross-table', () => {
    let mjBCookie, tableBId, npcBId;

    before(async () => {
      const mjBRes = await httpRequest(app, {
        method: 'POST', path: '/api/auth/register',
        body: { username: `${TEST_PREFIX}mjB`, password: 'password123' },
      });
      mjBCookie = mjBRes.cookies[0]?.split(';')[0];
      const tableBRes = await httpRequest(app, {
        method: 'POST', path: '/api/game_tables',
        body: { name: `${TEST_PREFIX}tableB` },
        cookies: mjBCookie,
      });
      tableBId = tableBRes.body.data.id;
      const npcRes = await httpRequest(app, {
        method: 'POST', path: '/api/named-npcs',
        body: { nom: 'Cross Table NPC', role_type: 'second_role' },
        cookies: mjBCookie,
        headers: { 'X-Table-Id': String(tableBId) },
      });
      npcBId = npcRes.body.data.id;
    });

    it('MJ table A ne voit pas les PNJ de table B', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${npcBId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 404);
    });
  });
});
