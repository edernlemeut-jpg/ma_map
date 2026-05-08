/**
 * named-npcs-visibility.test.js — Visibilité et payload restreint (Story 9.3)
 * + Filtrage par faction/role_type/q (Story 9.4)
 * + entity_links protect-by-default pour named_npc (Story 9.5)
 *
 * Couvre : FR9.5, FR9.6, FR9.7, FR9.8, FR9.9, NFR-NPC1
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';
import { getForRole } from '../../src/routes/named-npcs.js';

const TEST_PREFIX = '__test_npc_vis_';

function cleanTestData() {
  // Nettoyer les systèmes de test (table globale, pas de table_id)
  const testSystems = db.prepare(`SELECT id FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).all();
  for (const s of testSystems) {
    db.prepare('DELETE FROM entity_links WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)').run('system', s.id, 'system', s.id);
    db.prepare('DELETE FROM systems WHERE id = ?').run(s.id);
  }
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM entity_links WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM named_npcs WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('PNJ Nommés — Visibilité, filtres et entity_links (Stories 9.3/9.4/9.5)', () => {
  let app;
  let mjCookie, joueurCookie;
  let tableId;
  let npcVisibleId, npcHiddenId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

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

    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' },
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const joueurId = joueurRes.body.data.id;
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueurId, 'joueur');

    const h = { 'X-Table-Id': String(tableId) };

    // PNJ visible — avec stats, faction EG, premier_role
    const vis = await httpRequest(app, {
      method: 'POST', path: '/api/named-npcs',
      body: {
        nom: 'Blood Dawn', role_type: 'premier_role',
        faction: 'EG', archetype: 'Pirate',
        motivation: 'Devenir immortel',
        overdrive_trigger: 'Quand blessé',
        stats_json: JSON.stringify({ car: 5, sf: 3 }),
      },
      cookies: mjCookie, headers: h,
    });
    npcVisibleId = vis.body.data.id;

    // Rendre visible
    await httpRequest(app, {
      method: 'PATCH', path: `/api/named-npcs/${npcVisibleId}`,
      body: { visible: 1 },
      cookies: mjCookie, headers: h,
    });

    // PNJ caché — faction Sol, second_role
    const hid = await httpRequest(app, {
      method: 'POST', path: '/api/named-npcs',
      body: { nom: 'Inquisiteur Kayen', role_type: 'second_role', faction: 'Sol' },
      cookies: mjCookie, headers: h,
    });
    npcHiddenId = hid.body.data.id;

    // PNJ supplémentaire pour test de filtrage
    await httpRequest(app, {
      method: 'POST', path: '/api/named-npcs',
      body: { nom: 'Marchande EG', role_type: 'second_role', faction: 'EG' },
      cookies: mjCookie, headers: h,
    });
  });

  after(() => cleanTestData());

  const h = () => ({ 'X-Table-Id': String(tableId) });

  // ── Story 9.3 — Visibilité et payload restreint ───────────────────────────

  describe('Visibilité — GET liste', () => {
    it('MJ voit PNJ visibles ET cachés', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const ids = res.body.data.map(n => n.id);
      assert.ok(ids.includes(npcVisibleId));
      assert.ok(ids.includes(npcHiddenId));
    });

    it('Joueur ne voit que les PNJ visible=1', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs',
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const ids = res.body.data.map(n => n.id);
      assert.ok(ids.includes(npcVisibleId), 'PNJ visible doit apparaître');
      assert.ok(!ids.includes(npcHiddenId), 'PNJ caché ne doit pas apparaître');
    });
  });

  describe('Visibilité — GET /:id payload restreint', () => {
    it('Joueur sur PNJ visible → payload restreint (sans stats/santé/pp/energie_x)', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${npcVisibleId}`,
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 200, `body: ${JSON.stringify(res.body)}`);
      const d = res.body.data;
      // Champs présents
      assert.ok(d.nom, 'nom présent');
      assert.ok(d.role_type, 'role_type présent');
      assert.ok(d.archetype, 'archetype présent');
      assert.ok(d.motivation, 'motivation présente');
      assert.ok(d.overdrive_trigger, 'overdrive_trigger présent');
      // Champs ABSENTS du payload restreint
      assert.equal(d.pp,            undefined, 'pp absent');
      assert.equal(d.energie_x,     undefined, 'energie_x absent');
      assert.equal(d.stats,         undefined, 'stats absent');
      assert.equal(d.sante,         undefined, 'sante absent');
      assert.equal(d.competences,   undefined, 'competences absent');
    });

    it('MJ sur PNJ visible → payload complet (pp, stats, sante présents)', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: `/api/named-npcs/${npcVisibleId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const d = res.body.data;
      assert.ok('pp' in d, 'pp présent pour MJ');
      assert.ok('energie_x' in d, 'energie_x présent pour MJ');
    });
  });

  describe('getForRole() — helper service', () => {
    it('getForRole(tableId, id, "mj") → payload complet', () => {
      const npc = getForRole(tableId, npcVisibleId, 'mj');
      assert.ok(npc, 'doit retourner le PNJ');
      assert.ok('pp' in npc, 'payload complet pour MJ');
      assert.equal(npc.nom, 'Blood Dawn');
    });

    it('getForRole(tableId, id, "joueur") PNJ visible → payload restreint', () => {
      const npc = getForRole(tableId, npcVisibleId, 'joueur');
      assert.ok(npc, 'doit retourner le PNJ visible');
      assert.equal(npc.pp, undefined, 'pp absent dans payload restreint');
    });

    it('getForRole(tableId, id, "joueur") PNJ caché → null', () => {
      const npc = getForRole(tableId, npcHiddenId, 'joueur');
      assert.equal(npc, null, 'PNJ caché → null pour joueur');
    });

    it('getForRole(tableId, 99999, "mj") → null', () => {
      const npc = getForRole(tableId, 99999, 'mj');
      assert.equal(npc, null);
    });
  });

  // ── Story 9.4 — Filtres faction / role_type / q ───────────────────────────

  describe('Filtres GET /api/named-npcs (Story 9.4)', () => {
    it('?faction=EG → uniquement PNJ de faction EG', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs?faction=EG',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(n => n.faction === 'EG'), 'Tous doivent être faction EG');
      assert.ok(res.body.data.length >= 2, 'Au moins 2 PNJ EG');
    });

    it('?faction=Sol → uniquement PNJ Sol', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs?faction=Sol',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(n => n.faction === 'Sol'));
      assert.ok(res.body.data.length >= 1);
    });

    it('?role_type=premier_role → uniquement premier_role', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs?role_type=premier_role',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(n => n.role_type === 'premier_role'));
    });

    it('?q=Blood → PNJ dont le nom contient Blood', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs?q=Blood',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.every(n => n.nom.toLowerCase().includes('blood')));
    });

    it('?faction=EG&role_type=second_role → filtres combinés', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs?faction=EG&role_type=second_role',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(n => n.faction === 'EG' && n.role_type === 'second_role'));
    });

    it('Liste limitée à 50 entrées maximum', async () => {
      const res = await httpRequest(app, {
        method: 'GET', path: '/api/named-npcs',
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length <= 50);
    });
  });

  // ── Story 9.5 — entity_links protect-by-default pour named_npc ───────────

  describe('entity_links — named_npc visibility (Story 9.5)', () => {
    let systemId, linkVisibleId, linkHiddenId;

    before(async () => {
      // Créer un système directement (table globale, pas de table_id)
      // Utiliser UNIQUE ON CONFLICT IGNORE pour idempotence
      const existing = db.prepare('SELECT id FROM systems WHERE nom = ?').get(`${TEST_PREFIX}Sys`);
      if (existing) {
        systemId = existing.id;
      } else {
        const info = db.prepare(
          "INSERT INTO systems (quadrant, nom) VALUES ('havanais', ?)"
        ).run(`${TEST_PREFIX}Sys`);
        systemId = info.lastInsertRowid;
      }

      // Les entity_links pour les systèmes référencent le system.id, mais le
      // lien lui-même est dans la table de la campagne (table_id du MJ)
      const lv = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: systemId, target_type: 'named_npc', target_id: npcVisibleId },
        cookies: mjCookie, headers: h(),
      });
      linkVisibleId = lv.body.data?.id;

      const lh = await httpRequest(app, {
        method: 'POST', path: '/api/entity-links',
        body: { source_type: 'system', source_id: systemId, target_type: 'named_npc', target_id: npcHiddenId },
        cookies: mjCookie, headers: h(),
      });
      linkHiddenId = lh.body.data?.id;
    });

    it('MJ voit les deux liens (PNJ visible + PNJ caché)', async () => {
      const res = await httpRequest(app, {
        method: 'GET',
        path: `/api/entity-links?source_type=system&source_id=${systemId}`,
        cookies: mjCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const ids = res.body.data.map(l => l.id);
      assert.ok(ids.includes(linkVisibleId), 'Lien PNJ visible présent pour MJ');
      assert.ok(ids.includes(linkHiddenId), 'Lien PNJ caché présent pour MJ');
    });

    it('Joueur ne voit QUE le lien vers le PNJ visible', async () => {
      const res = await httpRequest(app, {
        method: 'GET',
        path: `/api/entity-links?source_type=system&source_id=${systemId}`,
        cookies: joueurCookie, headers: h(),
      });
      assert.equal(res.status, 200);
      const ids = res.body.data.map(l => l.id);
      assert.ok(ids.includes(linkVisibleId), 'Lien PNJ visible doit apparaître pour joueur');
      assert.ok(!ids.includes(linkHiddenId), 'Lien PNJ caché ne doit PAS apparaître pour joueur');
    });

    it('Après visible=1, le lien apparaît pour joueur', async () => {
      // Rendre le PNJ caché visible
      await httpRequest(app, {
        method: 'PATCH', path: `/api/named-npcs/${npcHiddenId}`,
        body: { visible: 1 },
        cookies: mjCookie, headers: h(),
      });

      const res = await httpRequest(app, {
        method: 'GET',
        path: `/api/entity-links?source_type=system&source_id=${systemId}`,
        cookies: joueurCookie, headers: h(),
      });
      const ids = res.body.data.map(l => l.id);
      assert.ok(ids.includes(linkHiddenId), 'Lien PNJ maintenant visible apparaît pour joueur');
    });
  });
});
