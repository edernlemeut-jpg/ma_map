import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateInviteCode, createTable, joinTable, updateMemberRole } from '../../src/services/tables.js';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_tabsvc_';
const INVITE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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

describe('Tables service', () => {
  let mjUserId;
  let adminUserId;
  let playerUserId;

  before(() => {
    cleanTestData();
    mjUserId = createTestUser(`${TEST_PREFIX}mj`);
    adminUserId = createTestUser(`${TEST_PREFIX}admin`, 1);
    playerUserId = createTestUser(`${TEST_PREFIX}player`);
  });

  after(() => {
    cleanTestData();
  });

  it('generateInviteCode returns 6 chars from valid charset', () => {
    const code = generateInviteCode();
    assert.equal(code.length, 6);
    for (const char of code) {
      assert.ok(INVITE_CHARSET.includes(char), `Invalid char: ${char}`);
    }
  });

  it('generateInviteCode returns different codes', () => {
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      codes.add(generateInviteCode());
    }
    assert.ok(codes.size > 1, 'Should generate different codes');
  });

  it('createTable inserts table + MJ member + invite_code', () => {
    const table = createTable('Ma Table', mjUserId);
    assert.ok(table.id);
    assert.equal(table.name, 'Ma Table');
    assert.equal(table.mj_id, mjUserId);
    assert.equal(table.invite_code.length, 6);

    // Verify member was created with role 'mj'
    const member = db.prepare('SELECT role FROM table_members WHERE table_id = ? AND user_id = ?').get(table.id, mjUserId);
    assert.equal(member.role, 'mj');
  });

  it('createTable rejects empty name', () => {
    assert.throws(() => createTable('', mjUserId), (err) => err.status === 400);
    assert.throws(() => createTable('   ', mjUserId), (err) => err.status === 400);
  });

  it('joinTable adds player with joueur role', () => {
    const table = createTable('Join Test', mjUserId);
    const result = joinTable(table.invite_code, playerUserId);
    assert.equal(result.table_id, table.id);

    const member = db.prepare('SELECT role FROM table_members WHERE table_id = ? AND user_id = ?').get(table.id, playerUserId);
    assert.equal(member.role, 'joueur');
  });

  it('joinTable rejects invalid code', () => {
    assert.throws(() => joinTable('ZZZZZZ', playerUserId), (err) => err.status === 404);
  });

  it('joinTable rejects duplicate membership', () => {
    const table = createTable('Dup Test', mjUserId);
    joinTable(table.invite_code, playerUserId);
    assert.throws(() => joinTable(table.invite_code, playerUserId), (err) => err.status === 409);
  });

  it('joinTable is case-insensitive', () => {
    const table = createTable('Case Test', mjUserId);
    const result = joinTable(table.invite_code.toLowerCase(), playerUserId);
    assert.equal(result.table_id, table.id);
  });

  it('updateMemberRole changes role', () => {
    const table = createTable('Role Test', mjUserId);
    joinTable(table.invite_code, playerUserId);

    const result = updateMemberRole(table.id, playerUserId, 'mj', { id: adminUserId, is_admin: true });
    assert.equal(result.role, 'mj');

    const member = db.prepare('SELECT role FROM table_members WHERE table_id = ? AND user_id = ?').get(table.id, playerUserId);
    assert.equal(member.role, 'mj');
  });

  it('updateMemberRole refuses to modify MJ creator', () => {
    const table = createTable('Creator Test', mjUserId);
    assert.throws(
      () => updateMemberRole(table.id, mjUserId, 'joueur', { id: adminUserId, is_admin: true }),
      (err) => err.status === 400
    );
  });

  it('updateMemberRole refuses non-admin', () => {
    const table = createTable('NonAdmin Test', mjUserId);
    joinTable(table.invite_code, playerUserId);
    assert.throws(
      () => updateMemberRole(table.id, playerUserId, 'mj', { id: playerUserId, is_admin: false }),
      (err) => err.status === 403
    );
  });

  it('updateMemberRole rejects invalid role', () => {
    const table = createTable('BadRole Test', mjUserId);
    joinTable(table.invite_code, playerUserId);
    assert.throws(
      () => updateMemberRole(table.id, playerUserId, 'admin', { id: adminUserId, is_admin: true }),
      (err) => err.status === 400
    );
  });
});
