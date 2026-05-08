/**
 * figurants-catalog.test.js — Catalogue Figurants
 *
 * Couvre : FR10.1–FR10.7, NFR-FIG1 — Stories 10.1 + 10.2
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_fig_';

function cleanTestData() {
  db.prepare(`DELETE FROM figurant_templates WHERE is_system_template = 0 AND nom LIKE '${TEST_PREFIX}%'`).run();
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Catalogue Figurants — Consultation (Story 10.1)', () => {
  let app;
  let authCookie;
  let mjCookie, tableId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // MJ + table (pour mutations en 10.2)
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
    authCookie = mjCookie; // MJ sert aussi à tester GET simple
  });

  after(() => cleanTestData());

  const mjH = () => ({ 'X-Table-Id': String(tableId) });

  it('GET /api/figurants retourne les 15 templates système sans X-Table-Id', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants',
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.ok(Array.isArray(data), 'data doit être un tableau');
    const systemTemplates = data.filter(t => t.is_system_template === true);
    assert.ok(systemTemplates.length >= 15, `Doit avoir au moins 15 templates système (got ${systemTemplates.length})`);
  });

  it('GET /api/figurants — chaque template a les champs requis', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants',
      cookies: authCookie,
    });
    const t = res.body.data[0];
    assert.ok('id' in t);
    assert.ok('nom' in t);
    assert.ok('structure' in t);
    assert.ok('blindage' in t);
    assert.ok('degats' in t);
    assert.ok('mf_disponible' in t);
    assert.ok('is_system_template' in t);
  });

  it('GET /api/figurants avec X-Table-Id retourne aussi les 15 templates', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants',
      cookies: authCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 15);
  });

  it('GET /api/figurants?faction=EG retourne uniquement les templates EG', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants?faction=EG',
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.ok(data.length >= 2, 'Doit avoir au moins 2 templates EG');
    data.forEach(t => assert.equal(t.faction, 'EG'));
  });

  it('GET /api/figurants?categorie=militaire retourne uniquement categorie militaire', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants?categorie=militaire',
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    res.body.data.forEach(t => assert.equal(t.categorie, 'militaire'));
  });

  it('GET /api/figurants?faction=EG&categorie=militaire retourne l\'intersection', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants?faction=EG&categorie=militaire',
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    res.body.data.forEach(t => {
      assert.equal(t.faction, 'EG');
      assert.equal(t.categorie, 'militaire');
    });
  });

  it('GET /api/figurants?q=soldat retourne les templates dont le nom contient "soldat"', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants?q=soldat',
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    res.body.data.forEach(t => assert.ok(t.nom.toLowerCase().includes('soldat')));
  });

  it('GET /api/figurants/:id retourne le stats-bloc complet', async () => {
    // Trouver l'ID du "Soldat impérial"
    const listRes = await httpRequest(app, {
      method: 'GET', path: '/api/figurants?faction=EG&categorie=militaire',
      cookies: authCookie,
    });
    const soldat = listRes.body.data.find(t => t.nom === 'Soldat impérial');
    assert.ok(soldat, 'Doit trouver le Soldat impérial');

    const res = await httpRequest(app, {
      method: 'GET', path: `/api/figurants/${soldat.id}`,
      cookies: authCookie,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.nom, 'Soldat impérial');
    assert.equal(res.body.data.faction, 'EG');
    assert.equal(res.body.data.structure, 4);
    assert.equal(res.body.data.blindage, 1);
    assert.equal(res.body.data.is_system_template, true);
  });

  it('GET /api/figurants/:id inconnu retourne 404', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/figurants/999999',
      cookies: authCookie,
    });
    assert.equal(res.status, 404);
  });
});

describe('Catalogue Figurants — CRUD personnalisés (Story 10.2)', () => {
  let app;
  let mjCookie, joueurCookie, tableId;
  let customId;
  let systemId;

  before(async () => {
    cleanTestData();
    app = await createTestApp();

    // MJ + table
    const mjRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}mj2`, password: 'password123' },
    });
    mjCookie = mjRes.cookies[0]?.split(';')[0];

    const tableRes = await httpRequest(app, {
      method: 'POST', path: '/api/game_tables',
      body: { name: `${TEST_PREFIX}table2` },
      cookies: mjCookie,
    });
    tableId = tableRes.body.data.id;

    // Joueur
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur2`, password: 'password123' },
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const joueurId = joueurRes.body.data.id;
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueurId, 'joueur');

    // Récupère l'ID d'un template système pour tester les protections
    const row = db.prepare("SELECT id FROM figurant_templates WHERE is_system_template = 1 LIMIT 1").get();
    systemId = row.id;
  });

  after(() => cleanTestData());

  const mjH = () => ({ 'X-Table-Id': String(tableId) });
  const joueurH = () => ({ 'X-Table-Id': String(tableId) });

  it('POST /api/figurants (MJ) crée un template personnalisé', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/figurants',
      cookies: mjCookie, headers: mjH(),
      body: {
        nom: `${TEST_PREFIX}Garde test`,
        faction: 'EG',
        categorie: 'militaire',
        structure: 4,
        blindage: 1,
        degats: '1D6+1',
        mf_disponible: 0,
      },
    });
    assert.equal(res.status, 201);
    const t = res.body.data;
    assert.equal(t.nom, `${TEST_PREFIX}Garde test`);
    assert.equal(t.is_system_template, false);
    assert.equal(t.faction, 'EG');
    customId = t.id;
  });

  it('PATCH /api/figurants/:id (MJ) sur template personnalisé : mis à jour', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/figurants/${customId}`,
      cookies: mjCookie, headers: mjH(),
      body: { notes: 'Note de test' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.notes, 'Note de test');
  });

  it('PATCH /api/figurants/:id (MJ) sur template système → 403 SYSTEM_TEMPLATE_IMMUTABLE', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/figurants/${systemId}`,
      cookies: mjCookie, headers: mjH(),
      body: { notes: 'tentative' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'SYSTEM_TEMPLATE_IMMUTABLE');
  });

  it('DELETE /api/figurants/:id (MJ) sur template système → 403', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/figurants/${systemId}`,
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'SYSTEM_TEMPLATE_IMMUTABLE');
  });

  it('POST /api/figurants (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/figurants',
      cookies: joueurCookie, headers: joueurH(),
      body: { nom: `${TEST_PREFIX}Joueur tentative`, structure: 3, blindage: 0 },
    });
    assert.equal(res.status, 403);
  });

  it('PATCH /api/figurants/:id (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/figurants/${customId}`,
      cookies: joueurCookie, headers: joueurH(),
      body: { notes: 'tentative joueur' },
    });
    assert.equal(res.status, 403);
  });

  it('DELETE /api/figurants/:id (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/figurants/${customId}`,
      cookies: joueurCookie, headers: joueurH(),
    });
    assert.equal(res.status, 403);
  });

  it('DELETE /api/figurants/:id (MJ) sur template personnalisé → 200', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/figurants/${customId}`,
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, customId);
    // Vérifier que le template a bien été supprimé
    const check = db.prepare('SELECT id FROM figurant_templates WHERE id = ?').get(customId);
    assert.equal(check, undefined);
  });

  it('POST /api/figurants : nom manquant → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/figurants',
      cookies: mjCookie, headers: mjH(),
      body: { faction: 'EG' },
    });
    assert.equal(res.status, 400);
  });
});
