/**
 * combat-spatial.test.js — API Combat Spatial
 *
 * Couvre :
 *   GET    /                             — liste (table active requise)
 *   POST   /                             — créer (MJ uniquement)
 *   GET    /:id                          — détail + vaisseaux
 *   PATCH  /:id                          — changer phase (irréversible)
 *   POST   /:id/ships                    — ajouter vaisseau
 *   PATCH  /:id/ships/:shipId            — déplacer (validation position_k)
 *   DELETE /:id/ships/:shipId            — retirer vaisseau
 *   POST   /:id/journal                  — inscrire entrée journal (Phase B)
 *   DELETE /:id                          — supprimer combat
 * Droits : MJ → tout ; joueur → lecture ; hors-table → 403/400
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_cs_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    // combat_ships supprimés en cascade
    db.prepare('DELETE FROM combats_spatiaux WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Combat Spatial — API HTTP', () => {
  let app;
  let mjCookie, joueurCookie, tableId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // Créer MJ + table
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

    // Créer joueur + l'inscrire
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' },
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const joueurId = joueurRes.body.data.id;
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)')
      .run(tableId, joueurId, 'joueur');
  });

  after(() => cleanTestData());

  const mjH   = () => ({ 'X-Table-Id': String(tableId) });
  const jH    = () => ({ 'X-Table-Id': String(tableId) });

  // ── Liste ──────────────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('retourne une liste vide initialement (MJ)', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(res.body.data.length, 0);
    });

    it('retourne 400 sans X-Table-Id', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/combat-spatial',
        cookies: mjCookie,
      });
      assert.equal(res.status, 400);
    });
  });

  // ── Créer ──────────────────────────────────────────────────────────────────
  describe('POST /', () => {
    it('crée un combat valide (201)', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}Combat Alpha`, configuration: 'face-a-face', champ_bataille: 'espace-profond' },
      });
      assert.equal(res.status, 201);
      const d = res.body.data;
      assert.ok(d.id);
      assert.equal(d.nom, `${TEST_PREFIX}Combat Alpha`);
      assert.equal(d.phase, 'approche');
      assert.equal(d.configuration, 'face-a-face');
      assert.ok(Array.isArray(d.vaisseaux));
      assert.equal(d.vaisseaux.length, 2, 'deux vaisseaux placeholder créés automatiquement');
      // face-a-face : A à +200K, B à -200K (positions opposées)
      const posA = d.vaisseaux[0].position_k;
      const posB = d.vaisseaux[1].position_k;
      assert.ok(posA !== posB, `Les vaisseaux doivent avoir des positions différentes (got ${posA} et ${posB})`);
    });

    it('retourne 400 si configuration invalide', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}BadConfig`, configuration: 'config-inexistante' },
      });
      assert.equal(res.status, 400);
    });

    it('retourne 400 si nom vide', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: '', configuration: 'face-a-face' },
      });
      assert.equal(res.status, 400);
    });

    it('retourne 403 si joueur essaie de créer', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: joueurCookie, headers: jH(),
        body: { nom: `${TEST_PREFIX}Interdit`, configuration: 'face-a-face' },
      });
      assert.equal(res.status, 403);
    });
  });

  // ── Détail + phases + vaisseaux ────────────────────────────────────────────
  describe('GET /:id + PATCH + ships', () => {
    let combatId;
    let shipId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}Combat Beta`, configuration: 'filature' },
      });
      combatId = res.body.data.id;
      shipId   = res.body.data.vaisseaux[0]?.id;
    });

    it('GET /:id retourne le détail avec vaisseaux', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/combat-spatial/${combatId}`,
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.id, combatId);
      assert.ok(Array.isArray(res.body.data.vaisseaux));
    });

    it('GET /:id retourne 404 pour un ID inconnu', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/combat-spatial/id-qui-nexiste-pas',
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(res.status, 404);
    });

    it('PATCH /:id avance la phase (approche → tournoyant)', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/combat-spatial/${combatId}`,
        cookies: mjCookie, headers: mjH(),
        body: { phase: 'tournoyant' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.phase, 'tournoyant');
    });

    it('PATCH /:id interdit de revenir à approche (irréversible)', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/combat-spatial/${combatId}`,
        cookies: mjCookie, headers: mjH(),
        body: { phase: 'approche' },
      });
      assert.equal(res.status, 400);
    });

    it('PATCH /:id retourne 403 si joueur', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH', path: `/api/combat-spatial/${combatId}`,
        cookies: joueurCookie, headers: jH(),
        body: { phase: 'poursuite' },
      });
      assert.equal(res.status, 403);
    });

    it('PATCH /ships/:id refuse position_k non-multiple de 25', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH',
        path: `/api/combat-spatial/${combatId}/ships/${shipId}`,
        cookies: mjCookie, headers: mjH(),
        body: { position_k: 133 },
      });
      assert.equal(res.status, 400);
    });

    it('PATCH /ships/:id accepte position_k multiple de 25', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH',
        path: `/api/combat-spatial/${combatId}/ships/${shipId}`,
        cookies: mjCookie, headers: mjH(),
        body: { position_k: 175 },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.position_k, 175);
    });

    it('PATCH /ships/:id retourne 403 si joueur', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH',
        path: `/api/combat-spatial/${combatId}/ships/${shipId}`,
        cookies: joueurCookie, headers: jH(),
        body: { position_k: 100 },
      });
      assert.equal(res.status, 403);
    });

    it('PATCH /ships/:id retourne 404 pour shipId inconnu', async () => {
      const res = await httpRequest(app, {
        method: 'PATCH',
        path: `/api/combat-spatial/${combatId}/ships/ship-inconnu`,
        cookies: mjCookie, headers: mjH(),
        body: { position_k: 100 },
      });
      assert.equal(res.status, 404);
    });

    it('POST /:id/ships ajoute un vaisseau', async () => {
      const res = await httpRequest(app, {
        method: 'POST',
        path: `/api/combat-spatial/${combatId}/ships`,
        cookies: mjCookie, headers: mjH(),
        body: { nom: 'Vaisseau Bonus', camp: 'neutres', classe: 'croiseur', position_k: 75, trajectoire: 'interception' },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.nom, 'Vaisseau Bonus');
      assert.equal(res.body.data.camp, 'neutres');
      assert.equal(res.body.data.position_k, 75);
    });

    it('DELETE /:id/ships/:shipId retire le vaisseau', async () => {
      const res = await httpRequest(app, {
        method: 'DELETE',
        path: `/api/combat-spatial/${combatId}/ships/${shipId}`,
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.deleted, true);
    });
  });

  // ── Journal ────────────────────────────────────────────────────────────────
  describe('POST /:id/journal', () => {
    let combatId;

    before(async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}Combat Journal`, configuration: 'face-a-face' },
      });
      combatId = res.body.data.id;
    });

    it('MJ peut inscrire une entrée valide (200 + journal retourné)', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: `/api/combat-spatial/${combatId}/journal`,
        cookies: mjCookie, headers: mjH(),
        body: {
          action: 'Tirer',
          acteur: 'Hawk',
          pool: 3, diff: 'standard', modif: 'SC',
          resultats: [2, 5, 3], relances: [null, null, 4],
          succes: 3,
          note: '+1d de Viser',
        },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.journal));
      assert.equal(res.body.data.journal[0].action, 'Tirer');
      assert.equal(res.body.data.journal[0].succes, 3);
      assert.equal(res.body.data.journal[0].diff, 'standard');
    });

    it('joueur ne peut pas inscrire (403)', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: `/api/combat-spatial/${combatId}/journal`,
        cookies: joueurCookie, headers: jH(),
        body: { action: 'Tirer' },
      });
      assert.equal(res.status, 403);
    });

    it('retourne 400 si action manquante', async () => {
      const res = await httpRequest(app, {
        method: 'POST', path: `/api/combat-spatial/${combatId}/journal`,
        cookies: mjCookie, headers: mjH(),
        body: { acteur: 'Hawk', succes: 2 },
      });
      assert.equal(res.status, 400);
    });
  });

  // ── Suppression combat ─────────────────────────────────────────────────────
  describe('DELETE /:id', () => {
    it('retourne 403 si joueur', async () => {
      const create = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}ToDelete`, configuration: 'accostage' },
      });
      const cid = create.body.data.id;

      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/combat-spatial/${cid}`,
        cookies: joueurCookie, headers: jH(),
      });
      assert.equal(res.status, 403);
    });

    it('supprime un combat (MJ)', async () => {
      const create = await httpRequest(app, {
        method: 'POST', path: '/api/combat-spatial',
        cookies: mjCookie, headers: mjH(),
        body: { nom: `${TEST_PREFIX}ToDelete2`, configuration: 'accostage' },
      });
      const cid = create.body.data.id;

      const res = await httpRequest(app, {
        method: 'DELETE', path: `/api/combat-spatial/${cid}`,
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(res.status, 200);

      const get = await httpRequest(app, {
        method: 'GET', path: `/api/combat-spatial/${cid}`,
        cookies: mjCookie, headers: mjH(),
      });
      assert.equal(get.status, 404);
    });
  });
});
