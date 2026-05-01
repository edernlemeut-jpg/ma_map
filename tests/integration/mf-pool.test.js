/**
 * mf-pool.test.js — MF Pool : atomicité, contrainte DB, API
 *
 * Couvre : NFR-MF1 (atomicité), NFR-MF2 (contrainte CHECK), FR11.1–FR11.6 — Stories 11.2 + 11.5
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, httpRequest } from '../setup.js';
import db from '../../src/database.js';
import { getPool, transfer, reset, MF_TOTAL } from '../../src/services/mf-pool.js';

const TEST_PREFIX = '__test_mf_';

function cleanTestData() {
  const tables = db.prepare(`SELECT id FROM game_tables WHERE name LIKE '${TEST_PREFIX}%'`).all();
  for (const t of tables) {
    db.prepare('DELETE FROM mf_pool WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM table_members WHERE table_id = ?').run(t.id);
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

// ── Story 11.5 — Tests service direct (in-memory DB) ──────────────────────────

describe('MF Pool — Service direct (Story 11.5)', () => {
  let testDb;
  let tableId;

  before(async () => {
    // in-memory DB isolée — schéma minimal pour mf_pool
    const Database = (await import('better-sqlite3')).default;
    testDb = Database(':memory:');
    testDb.pragma('foreign_keys = OFF'); // mf_pool sans FK pour tests isolés
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS mf_pool (
        id         INTEGER PRIMARY KEY,
        table_id   INTEGER NOT NULL UNIQUE,
        pj_pool    INTEGER NOT NULL DEFAULT 50,
        mj_pool    INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT,
        CHECK (pj_pool >= 0),
        CHECK (mj_pool >= 0),
        CHECK (pj_pool + mj_pool = 50)
      );
    `);
    tableId = 1; // tableau fictif
  });

  after(() => testDb?.close());

  it('getPool crée la ligne si absente et retourne pj=50, mj=0', () => {
    const pool = getPool(tableId, testDb);
    assert.equal(pool.pj_pool, 50);
    assert.equal(pool.mj_pool, 0);
  });

  it('getPool est idempotent (appel multiple = même résultat)', () => {
    getPool(tableId, testDb);
    const pool = getPool(tableId, testDb);
    assert.equal(pool.pj_pool, 50);
    assert.equal(pool.mj_pool, 0);
  });

  it('transfer pj_to_mj nominal : somme = 50 ✅', () => {
    const pool = transfer(tableId, 3, 'pj_to_mj', testDb);
    assert.equal(pool.pj_pool, 47);
    assert.equal(pool.mj_pool, 3);
    assert.equal(pool.pj_pool + pool.mj_pool, MF_TOTAL);
  });

  it('transfer mj_to_pj nominal : somme = 50 ✅', () => {
    const pool = transfer(tableId, 2, 'mj_to_pj', testDb);
    assert.equal(pool.pj_pool, 49);
    assert.equal(pool.mj_pool, 1);
    assert.equal(pool.pj_pool + pool.mj_pool, MF_TOTAL);
  });

  it('transfer delta=0 : accepté, DB inchangée', () => {
    const before = getPool(tableId, testDb);
    const after = transfer(tableId, 0, 'pj_to_mj', testDb);
    assert.equal(after.pj_pool, before.pj_pool);
    assert.equal(after.mj_pool, before.mj_pool);
  });

  it('transfer qui amènerait pj_pool < 0 : MF_INSUFFICIENT, DB non modifiée ✅', () => {
    const before = getPool(tableId, testDb);
    assert.throws(
      () => transfer(tableId, 100, 'pj_to_mj', testDb),
      (e) => e.code === 'MF_INSUFFICIENT'
    );
    const after = getPool(tableId, testDb);
    assert.equal(after.pj_pool, before.pj_pool);
    assert.equal(after.mj_pool, before.mj_pool);
  });

  it('reset : pj=50, mj=0', () => {
    transfer(tableId, 10, 'pj_to_mj', testDb);
    const pool = reset(tableId, testDb);
    assert.equal(pool.pj_pool, 50);
    assert.equal(pool.mj_pool, 0);
  });

  it('contrainte CHECK SQLite : insertion directe pj=30, mj=25 est rejetée ✅', () => {
    assert.throws(() => {
      testDb.prepare('INSERT INTO mf_pool (table_id, pj_pool, mj_pool) VALUES (?, 30, 25)').run(999);
    });
  });

  it('contrainte UNIQUE : deux lignes pour le même table_id est rejetée ✅', () => {
    testDb.prepare('INSERT INTO mf_pool (table_id, pj_pool, mj_pool) VALUES (?, 50, 0)').run(888);
    assert.throws(() => {
      testDb.prepare('INSERT INTO mf_pool (table_id, pj_pool, mj_pool) VALUES (?, 50, 0)').run(888);
    });
  });

  it('robustesse transaction : crash simulé avant commit → état inchangé', () => {
    const before = getPool(tableId, testDb);
    let crashed = false;

    const txn = testDb.transaction(() => {
      testDb.prepare('UPDATE mf_pool SET pj_pool = ?, mj_pool = ? WHERE table_id = ?')
        .run(before.pj_pool - 5, before.mj_pool + 5, tableId);
      crashed = true;
      throw new Error('simulated crash');
    });

    assert.throws(() => txn());
    assert.equal(crashed, true, 'le code avant le crash a bien été exécuté');

    // Transaction est rollback — état inchangé
    const after = getPool(tableId, testDb);
    assert.equal(after.pj_pool, before.pj_pool);
    assert.equal(after.mj_pool, before.mj_pool);
  });
});

// ── Story 11.2 — Tests API HTTP ────────────────────────────────────────────────

describe('MF Pool — API HTTP (Story 11.2)', () => {
  let app;
  let mjCookie, joueurCookie, tableId, mjTableId;

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
    mjTableId = tableId;

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

  const mjH = () => ({ 'X-Table-Id': String(tableId) });
  const joueurH = () => ({ 'X-Table-Id': String(tableId) });

  it('GET /api/mf-pool initialise la ligne → pj=50, mj=0', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/mf-pool',
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pj_pool, 50);
    assert.equal(res.body.data.mj_pool, 0);
  });

  it('GET /api/mf-pool est idempotent', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/mf-pool',
      cookies: joueurCookie, headers: joueurH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pj_pool + res.body.data.mj_pool, 50);
  });

  it('POST /api/mf-pool/transfer (MJ) pj→mj : somme reste 50', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: mjCookie, headers: mjH(),
      body: { delta: 5, direction: 'pj_to_mj' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pj_pool, 45);
    assert.equal(res.body.data.mj_pool, 5);
    assert.equal(res.body.data.pj_pool + res.body.data.mj_pool, 50);
  });

  it('POST /api/mf-pool/transfer (MJ) mj→pj : somme reste 50', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: mjCookie, headers: mjH(),
      body: { delta: 3, direction: 'mj_to_pj' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pj_pool, 48);
    assert.equal(res.body.data.mj_pool, 2);
  });

  it('POST /api/mf-pool/transfer delta trop grand → 400 MF_INSUFFICIENT', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: mjCookie, headers: mjH(),
      body: { delta: 100, direction: 'pj_to_mj' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'MF_INSUFFICIENT');
  });

  it('POST /api/mf-pool/transfer delta=0 : accepté', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: mjCookie, headers: mjH(),
      body: { delta: 0, direction: 'pj_to_mj' },
    });
    assert.equal(res.status, 200);
  });

  it('POST /api/mf-pool/reset (MJ) : pj=50, mj=0', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/reset',
      cookies: mjCookie, headers: mjH(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pj_pool, 50);
    assert.equal(res.body.data.mj_pool, 0);
  });

  it('POST /api/mf-pool/transfer (joueur) pj_to_mj → 200', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: joueurCookie, headers: joueurH(),
      body: { delta: 1, direction: 'pj_to_mj' },
    });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.data?.pj_pool === 'number');
  });

  it('POST /api/mf-pool/transfer (joueur) mj_to_pj → 403', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: joueurCookie, headers: joueurH(),
      body: { delta: 1, direction: 'mj_to_pj' },
    });
    assert.equal(res.status, 403);
  });

  it('POST /api/mf-pool/reset (joueur) → 403', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/reset',
      cookies: joueurCookie, headers: joueurH(),
    });
    assert.equal(res.status, 403);
  });

  it('GET /api/mf-pool sans X-Table-Id → 400', async () => {
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/mf-pool',
      cookies: mjCookie,
    });
    assert.equal(res.status, 400);
  });

  it('direction invalide → 400', async () => {
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/mf-pool/transfer',
      cookies: mjCookie, headers: mjH(),
      body: { delta: 1, direction: 'invalid' },
    });
    assert.equal(res.status, 400);
  });
});
