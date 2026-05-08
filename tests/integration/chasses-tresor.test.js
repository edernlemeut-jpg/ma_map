/**
 * chasses-tresor.test.js — CRUD des chasses au trésor (supplément TdM)
 *
 * Couvre : GET /, POST /, GET /:id, PUT /:id, DELETE /:id
 * Droits : MJ peut tout faire ; joueur peut lire ; non-membre → 403/400
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_ct_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM chasses_tresor WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('Chasses au Trésor — API HTTP', () => {
  let app;
  let mjCookie, joueurCookie, tableId;
  const CARTE  = { origine: 'Conquête', forme: 'Parchemin', localisation: 'Kyers' };
  const TRESOR = { valeur_label: '5–10 000 PX', px_max: 10000, gloire: 0 };
  const ANTRE  = { origine: 'Âge des Conquêtes', taille: 'Moyenne' };

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

    // Créer joueur et l'inscrire à la table
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' },
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const joueurId = joueurRes.body.data.id;
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueurId, 'joueur');
  });

  after(() => cleanTestData());

  const mjH   = () => ({ 'X-Table-Id': String(tableId) });
  const jH    = () => ({ 'X-Table-Id': String(tableId) });

  // ── Lecture liste vide ────────────────────────────────────────────────────────
  it('GET / sans chasse → tableau vide', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/chasses-tresor',
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 0);
  });

  // ── Création par MJ ───────────────────────────────────────────────────────────
  let chasseId;

  it('POST / (MJ) crée une chasse avec nom + JSON sections', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/chasses-tresor',
      cookies: mjCookie, headers: mjH(),
      body: {
        nom: 'La carte du capitaine Ibañez',
        difficulte: 3,
        nb_seances: 2,
        carte: CARTE,
        tresor: TRESOR,
        antre: ANTRE,
        notes: 'Pirate légendaire des Havanes',
      },
    });
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.equal(d.nom, 'La carte du capitaine Ibañez');
    assert.equal(d.statut, 'en_cours');
    assert.equal(d.difficulte, 3);
    assert.equal(d.carte.origine, 'Conquête');
    assert.equal(d.tresor.px_max, 10000);
    assert.equal(d.antre.taille, 'Moyenne');
    assert.equal(d.notes, 'Pirate légendaire des Havanes');
    chasseId = d.id;
  });

  it('POST / sans nom → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/chasses-tresor',
      cookies: mjCookie, headers: mjH(),
      body: { nom: '' },
    });
    assert.equal(res.status, 400);
  });

  it('POST / sans X-Table-Id → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/chasses-tresor',
      cookies: mjCookie,
      body: { nom: 'Test sans table' },
    });
    assert.equal(res.status, 400);
  });

  // ── Lecture par joueur ────────────────────────────────────────────────────────
  it('GET / (joueur) peut lire la liste', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/chasses-tresor',
      cookies: joueurCookie, headers: jH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  it('GET /:id (joueur) peut lire une chasse', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: `/api/chasses-tresor/${chasseId}`,
      cookies: joueurCookie, headers: jH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, chasseId);
  });

  it('GET /:id inexistant → 404', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/chasses-tresor/nonexistent-id',
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 404);
  });

  // ── Modification par MJ ───────────────────────────────────────────────────────
  it('PUT /:id (MJ) met à jour le statut et les notes', async () => {
    const res = await httpRequest(app, {
      method: 'PUT', path: `/api/chasses-tresor/${chasseId}`,
      cookies: mjCookie, headers: mjH(),
      body: { statut: 'terminee', notes: 'Trésor récupéré !' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.statut, 'terminee');
    assert.equal(res.body.data.notes, 'Trésor récupéré !');
  });

  it('PUT /:id (MJ) met à jour les sections JSON', async () => {
    const nouveauTresor = { valeur_label: '15–25 000 PX', px_max: 25000, gloire: 3 };
    const res = await httpRequest(app, {
      method: 'PUT', path: `/api/chasses-tresor/${chasseId}`,
      cookies: mjCookie, headers: mjH(),
      body: { tresor: nouveauTresor },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tresor.px_max, 25000);
    assert.equal(res.body.data.tresor.gloire, 3);
  });

  it('PUT /:id (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PUT', path: `/api/chasses-tresor/${chasseId}`,
      cookies: joueurCookie, headers: jH(),
      body: { statut: 'abandonnee' },
    });
    assert.equal(res.status, 403);
  });

  // ── Suppression ───────────────────────────────────────────────────────────────
  it('DELETE /:id (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/chasses-tresor/${chasseId}`,
      cookies: joueurCookie, headers: jH(),
    });
    assert.equal(res.status, 403);
  });

  it('DELETE /:id (MJ) supprime la chasse', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/chasses-tresor/${chasseId}`,
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.deleted, chasseId);
  });

  it('DELETE /:id inexistant → 404', async () => {
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/chasses-tresor/${chasseId}`,
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 404);
  });

  it('GET / après suppression → liste vide', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/chasses-tresor',
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });
});
