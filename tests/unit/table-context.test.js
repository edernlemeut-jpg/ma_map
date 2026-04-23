import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/database.js';
import tableContextMiddleware from '../../src/middleware/table-context.js';

const TEST_PREFIX = '__test_tctx_';

function cleanTestData() {
  const testUsers = db.prepare(`SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`).all();
  for (const u of testUsers) {
    db.prepare('DELETE FROM table_members WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM game_tables WHERE mj_id = ?').run(u.id);
  }
  db.prepare(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`).run();
}

function createTestUser(username, isAdmin = 0) {
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
  ).run(username, 'fakehash', isAdmin);
  return Number(result.lastInsertRowid);
}

function createTestTable(name, mjId) {
  const result = db.prepare(
    'INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)'
  ).run(name, mjId, 'T' + Math.random().toString(36).substring(2, 7).toUpperCase());
  const tableId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, mjId, 'mj');
  return tableId;
}

describe('Table context middleware', () => {
  let mjUserId;
  let playerUserId;
  let tableId;

  before(() => {
    cleanTestData();
    mjUserId = createTestUser(`${TEST_PREFIX}mj`);
    playerUserId = createTestUser(`${TEST_PREFIX}player`);
    tableId = createTestTable('Context Test', mjUserId);
    // Add player as joueur
    db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(tableId, playerUserId, 'joueur');
  });

  after(() => {
    cleanTestData();
  });

  it('should set req.table = null when no X-Table-Id header', (t, done) => {
    const req = { headers: {}, user: { id: mjUserId } };
    const res = {};
    tableContextMiddleware(req, res, () => {
      assert.equal(req.table, null);
      done();
    });
  });

  it('should set req.table with id and role when user is MJ member', (t, done) => {
    const req = { headers: { 'x-table-id': String(tableId) }, user: { id: mjUserId } };
    const res = {};
    tableContextMiddleware(req, res, () => {
      assert.deepStrictEqual(req.table, { id: tableId, role: 'mj' });
      done();
    });
  });

  it('should set req.table with joueur role for player member', (t, done) => {
    const req = { headers: { 'x-table-id': String(tableId) }, user: { id: playerUserId } };
    const res = {};
    tableContextMiddleware(req, res, () => {
      assert.deepStrictEqual(req.table, { id: tableId, role: 'joueur' });
      done();
    });
  });

  it('should return 403 when user is not a member', () => {
    const nonMemberId = createTestUser(`${TEST_PREFIX}outsider`);
    const req = { headers: { 'x-table-id': String(tableId) }, user: { id: nonMemberId } };
    let statusCode;
    let responseBody;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; }
    };
    tableContextMiddleware(req, res, () => {
      assert.fail('next() should not be called');
    });
    assert.equal(statusCode, 403);
    assert.equal(responseBody.error.code, 'FORBIDDEN');
  });

  it('should return 403 for non-existent table', () => {
    const req = { headers: { 'x-table-id': '999999' }, user: { id: mjUserId } };
    let statusCode;
    const res = {
      status(code) { statusCode = code; return this; },
      json() { return this; }
    };
    tableContextMiddleware(req, res, () => {
      assert.fail('next() should not be called');
    });
    assert.equal(statusCode, 403);
  });

  it('should set req.table = null when no req.user (whitelisted route)', (t, done) => {
    const req = { headers: { 'x-table-id': String(tableId) } };
    const res = {};
    tableContextMiddleware(req, res, () => {
      assert.equal(req.table, null);
      done();
    });
  });

  it('should set req.table = null for invalid non-numeric X-Table-Id', (t, done) => {
    const req = { headers: { 'x-table-id': 'abc' }, user: { id: mjUserId } };
    const res = {};
    tableContextMiddleware(req, res, () => {
      assert.equal(req.table, null);
      done();
    });
  });
});
