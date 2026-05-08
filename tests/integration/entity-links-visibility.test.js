import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_el_vis_';

function cleanTestData() {
  db.prepare(`DELETE FROM visibility_rules WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM table_visibility_overrides WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  db.prepare(`DELETE FROM entity_links WHERE table_id IN (SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%')`).run();
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
}

describe('entity-links — protect-by-default (Story 7.3)', () => {
  let app;
  let mjCookie, joueurCookie;
  let tableId;
  let sysVisibleId, sysHiddenId, sysSourceId;

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

    // Créer joueur + rejoindre
    const joueurRes = await httpRequest(app, {
      method: 'POST', path: '/api/auth/register',
      body: { username: `${TEST_PREFIX}joueur`, password: 'password123' }
    });
    joueurCookie = joueurRes.cookies[0]?.split(';')[0];
    const inviteCode = tableRes.body.data.invite_code;
    await httpRequest(app, {
      method: 'POST', path: `/api/game_tables/${tableId}/join`,
      body: { invite_code: inviteCode },
      cookies: joueurCookie
    });

    // Insérer 3 systèmes
    sysSourceId  = Number(db.prepare("INSERT INTO systems (quadrant, nom) VALUES (?, ?)").run(`${TEST_PREFIX}q`, `${TEST_PREFIX}source`).lastInsertRowid);
    sysVisibleId = Number(db.prepare("INSERT INTO systems (quadrant, nom) VALUES (?, ?)").run(`${TEST_PREFIX}q`, `${TEST_PREFIX}visible`).lastInsertRowid);
    sysHiddenId  = Number(db.prepare("INSERT INTO systems (quadrant, nom) VALUES (?, ?)").run(`${TEST_PREFIX}q`, `${TEST_PREFIX}hidden`).lastInsertRowid);

    const h = { 'X-Table-Id': String(tableId) };

    // Rendre le quadrant visible (pour que sysSourceId + sysVisibleId soient vus en cas de query)
    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/systems/${sysSourceId}`,
      body: { visible: true }, cookies: mjCookie, headers: h
    });
    await httpRequest(app, {
      method: 'PATCH', path: `/api/visibility/systems/${sysVisibleId}`,
      body: { visible: true }, cookies: mjCookie, headers: h
    });
    // sysHiddenId reste visible=false (protect-by-default)

    // Créer 2 liens depuis sysSourceId : un vers système visible, un vers système caché
    await httpRequest(app, {
      method: 'POST', path: '/api/entity-links',
      body: { source_type: 'system', source_id: sysSourceId, target_type: 'system', target_id: sysVisibleId, relation_type: 'voisin' },
      cookies: mjCookie, headers: h
    });
    await httpRequest(app, {
      method: 'POST', path: '/api/entity-links',
      body: { source_type: 'system', source_id: sysSourceId, target_type: 'system', target_id: sysHiddenId, relation_type: 'secret' },
      cookies: mjCookie, headers: h
    });
  });

  after(() => {
    cleanTestData();
  });

  // ── Joueur ne voit jamais les liens vers entités cachées ──────────────────────

  it('joueur ne voit pas le lien vers le système caché', async () => {
    const res = await httpRequest(app, {
      path: `/api/entity-links?source_type=system&source_id=${sysSourceId}`,
      cookies: joueurCookie, headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const links = res.body.data;
    const ids = links.map(l => l.target_id);
    assert.ok(!ids.includes(sysHiddenId), `Le lien vers le système caché (id=${sysHiddenId}) ne doit pas être retourné au joueur`);
  });

  it('joueur voit le lien vers le système visible', async () => {
    const res = await httpRequest(app, {
      path: `/api/entity-links?source_type=system&source_id=${sysSourceId}`,
      cookies: joueurCookie, headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const ids = res.body.data.map(l => l.target_id);
    assert.ok(ids.includes(sysVisibleId), `Le lien vers le système visible (id=${sysVisibleId}) doit être retourné au joueur`);
  });

  // ── MJ voit tout + annotation target_hidden ───────────────────────────────────

  it('MJ voit TOUS les liens (y compris vers entités cachées)', async () => {
    const res = await httpRequest(app, {
      path: `/api/entity-links?source_type=system&source_id=${sysSourceId}`,
      cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const links = res.body.data;
    assert.equal(links.length, 2, 'Le MJ doit voir les 2 liens');
    const ids = links.map(l => l.target_id);
    assert.ok(ids.includes(sysVisibleId),  'MJ voit lien vers système visible');
    assert.ok(ids.includes(sysHiddenId),   'MJ voit lien vers système caché');
  });

  it('MJ reçoit target_hidden=true sur le lien vers le système caché', async () => {
    const res = await httpRequest(app, {
      path: `/api/entity-links?source_type=system&source_id=${sysSourceId}`,
      cookies: mjCookie, headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    const hidden = res.body.data.find(l => l.target_id === sysHiddenId);
    const visible = res.body.data.find(l => l.target_id === sysVisibleId);
    assert.ok(hidden, 'Lien vers système caché introuvable');
    assert.equal(hidden.target_hidden, true,  'target_hidden doit être true pour système caché');
    assert.equal(visible.target_hidden, false, 'target_hidden doit être false pour système visible');
  });

  // ── Robustesse : joueur ne peut pas contourner avec target_id direct ──────────

  it('joueur ne peut pas voir lien caché même en spécifiant target_id', async () => {
    const res = await httpRequest(app, {
      path: `/api/entity-links?source_type=system&source_id=${sysSourceId}&target_id=${sysHiddenId}`,
      cookies: joueurCookie, headers: { 'X-Table-Id': String(tableId) }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0, 'Filtrer par target_id ne doit pas contourner la visibilité');
  });
});
