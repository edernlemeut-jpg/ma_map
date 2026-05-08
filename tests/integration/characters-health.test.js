import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_chr_health_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM characters WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

describe('characters — santé dynamique PATCH /health', () => {
  let app;
  let mjCookie, joueur1Cookie, joueur2Cookie;
  let tableId;
  let joueur1Id, joueur2Id;
  let pjId;

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

    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur1Id, 'joueur');
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, joueur2Id, 'joueur');

    // Créer un PJ assigné à joueur1 (car=4, sf=3 → 7 cases par niveau × 3 niveaux)
    const pjRes = await httpRequest(app, {
      method: 'POST', path: '/api/characters',
      body: {
        name: 'Health Tester',
        type: 'pj',
        user_id: joueur1Id,
        stats_json: JSON.stringify({ car: 4, sf: 3 }),
        sante_niveaux: 3,
      },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    pjId = pjRes.body.data.id;
  });

  after(() => cleanTestData());

  function healthPath(id) { return `/api/characters/${id}/health`; }

  // ── MJ : accès complet ──────────────────────────────────────────────────────

  it('MJ coche une case → 200, sante.niveaux[0].cases[0].etat = cochée', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.sante.niveaux[0].cases[0].etat, 'cochée');
  });

  it('MJ noircit une case → 200, etat = noircie', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 1, etat: 'noircie' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.sante.niveaux[0].cases[1].etat, 'noircie');
  });

  it('MJ remet une case à vide → 200, etat = vide', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 0, etat: 'vide' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.sante.niveaux[0].cases[0].etat, 'vide');
  });

  // ── Joueur owner : vide/cochée autorisés, noircie interdit ─────────────────

  it('joueur owner coche sa propre case → 200', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 1, case_index: 0, etat: 'cochée' },
      cookies: joueur1Cookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.sante.niveaux[1].cases[0].etat, 'cochée');
  });

  it('joueur owner tente de noircir → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 1, case_index: 2, etat: 'noircie' },
      cookies: joueur1Cookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  });

  // ── Joueur non-owner → 403 ─────────────────────────────────────────────────

  it('joueur2 (non-owner) ne peut pas modifier la santé du PJ de joueur1 → 403', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
      cookies: joueur2Cookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('état invalide → 400', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 0, etat: 'blessé' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('niveau hors-limites → 400', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 99, case_index: 0, etat: 'cochée' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('sans auth → 401', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: healthPath(pjId),
      body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 401);
  });

  it('ID inconnu → 404', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/characters/chr_unknown/health',
      body: { niveau_index: 0, case_index: 0, etat: 'cochée' },
      cookies: mjCookie,
      headers: { 'X-Table-Id': String(tableId) },
    });
    assert.equal(res.status, 404);
  });
});
