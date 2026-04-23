import db from '../database.js';
import { randomInt } from 'node:crypto';

const INVITE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_LENGTH = 6;

export function generateInviteCode() {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_CHARSET[randomInt(INVITE_CHARSET.length)];
  }
  return code;
}

export function createTable(name, userId) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw { code: 'VALIDATION_ERROR', message: 'Le nom de la table est requis', status: 400 };
  }

  const trimmedName = name.trim();

  // Generate unique invite code with retry on collision
  let inviteCode;
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  while (attempts < MAX_ATTEMPTS) {
    inviteCode = generateInviteCode();
    const existing = db.prepare('SELECT id FROM game_tables WHERE invite_code = ?').get(inviteCode);
    if (!existing) break;
    attempts++;
    if (attempts >= MAX_ATTEMPTS) {
      throw { code: 'SERVER_ERROR', message: 'Impossible de générer un code unique', status: 500 };
    }
  }

  const insertTable = db.prepare(
    'INSERT INTO game_tables (name, mj_id, invite_code) VALUES (?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)'
  );

  const createWithMember = db.transaction(() => {
    const result = insertTable.run(trimmedName, userId, inviteCode);
    const tableId = Number(result.lastInsertRowid);
    insertMember.run(tableId, userId, 'mj');

    // Assign MJ profile role (idempotent upgrade from null)
    db.prepare("UPDATE users SET profile_role = 'mj' WHERE id = ?").run(userId);

    // -- Seed admin peril templates -> custom_peril_tables --
    const adminTemplates = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables').all();
    const insertCPT = db.prepare(
      'INSERT OR IGNORE INTO custom_peril_tables (id, table_id, data_json) VALUES (?, ?, ?)'
    );
    for (const t of adminTemplates) {
      let d = {};
      try { d = JSON.parse(t.data_json || '{}'); } catch {}
      insertCPT.run(t.id + '_t' + tableId, tableId, JSON.stringify({ name: t.name, type: t.type, ...d }));
    }

    // ── Seed admin quadrant defaults → peril_assignments ──────────────────
    const adminQDefaults = db.prepare('SELECT quadrant, peril_list_id FROM admin_quadrant_defaults').all();
    const insertPA = db.prepare(
      'INSERT OR IGNORE INTO peril_assignments (table_id, assign_type, key, peril_table_id) VALUES (?, ?, ?, ?)'
    );
    for (const q of adminQDefaults) {
      if (!q.peril_list_id) continue;
      // Map original admin template id to the per-table copy id
      insertPA.run(tableId, 'hyperspatial', q.quadrant, q.peril_list_id + '_t' + tableId);
    }

    return tableId;
  });

  const tableId = createWithMember();

  return {
    id: tableId,
    name: trimmedName,
    mj_id: userId,
    invite_code: inviteCode
  };
}

export function listUserTables(userId) {
  return db.prepare(`
    SELECT gt.id, gt.name, gt.mj_id, gt.invite_code, gt.created_at,
           tm.role
    FROM game_tables gt
    JOIN table_members tm ON gt.id = tm.table_id
    WHERE tm.user_id = ?
    ORDER BY gt.created_at DESC
  `).all(userId).map(row => ({
    id: row.id,
    name: row.name,
    mj_id: row.mj_id,
    invite_code: row.role === 'mj' ? row.invite_code : undefined,
    role: row.role,
    created_at: row.created_at
  }));
}

export function joinTable(inviteCode, userId) {
  if (!inviteCode || typeof inviteCode !== 'string' || inviteCode.trim().length === 0) {
    throw { code: 'VALIDATION_ERROR', message: 'Le code d\'invitation est requis', status: 400 };
  }

  const table = db.prepare('SELECT id FROM game_tables WHERE invite_code = ?').get(inviteCode.trim().toUpperCase());
  if (!table) {
    throw { code: 'NOT_FOUND', message: 'Code d\'invitation invalide', status: 404 };
  }

  try {
    db.prepare('INSERT INTO table_members (table_id, user_id, role) VALUES (?, ?, ?)').run(table.id, userId, 'joueur');
    // Assign joueur profile role (only if not already set)
    db.prepare("UPDATE users SET profile_role = 'joueur' WHERE id = ? AND profile_role IS NULL").run(userId);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw { code: 'CONFLICT', message: 'Vous êtes déjà membre de cette table', status: 409 };
    }
    throw err;
  }

  return { table_id: table.id };
}

export function listMembers(tableId, requestingUserId) {
  const table = db.prepare('SELECT id, mj_id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) throw { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 };
  if (table.mj_id !== requestingUserId) throw { code: 'FORBIDDEN', message: 'Réservé au MJ', status: 403 };

  return db.prepare(`
    SELECT tm.user_id AS id, u.username, u.display_name, tm.role
    FROM table_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.table_id = ?
    ORDER BY tm.role DESC, u.username ASC
  `).all(tableId).map(row => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    role: row.role,
    is_mj: row.id === table.mj_id
  }));
}

export function regenerateInvite(tableId, requestingUserId) {
  const table = db.prepare('SELECT id, mj_id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) throw { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 };
  if (table.mj_id !== requestingUserId) throw { code: 'FORBIDDEN', message: 'Réservé au MJ', status: 403 };

  let inviteCode;
  let attempts = 0;
  while (attempts < 10) {
    inviteCode = generateInviteCode();
    const existing = db.prepare('SELECT id FROM game_tables WHERE invite_code = ?').get(inviteCode);
    if (!existing) break;
    attempts++;
    if (attempts >= 10) throw { code: 'SERVER_ERROR', message: 'Impossible de générer un code unique', status: 500 };
  }

  db.prepare('UPDATE game_tables SET invite_code = ? WHERE id = ?').run(inviteCode, tableId);
  return { invite_code: inviteCode };
}

export function kickMember(tableId, targetUserId, requestingUserId) {
  const table = db.prepare('SELECT id, mj_id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) throw { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 };
  if (table.mj_id !== requestingUserId) throw { code: 'FORBIDDEN', message: 'Réservé au MJ', status: 403 };
  if (table.mj_id === targetUserId) throw { code: 'FORBIDDEN', message: 'Impossible d\'exclure le MJ de sa propre table', status: 403 };

  const result = db.prepare('DELETE FROM table_members WHERE table_id = ? AND user_id = ?').run(tableId, targetUserId);
  if (result.changes === 0) throw { code: 'NOT_FOUND', message: 'Membre introuvable', status: 404 };
  return { removed: true };
}

export function leaveTable(tableId, userId) {
  const table = db.prepare('SELECT id, mj_id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) throw { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 };
  if (table.mj_id === userId) throw { code: 'FORBIDDEN', message: 'Le MJ ne peut pas quitter sa propre table. Supprimez-la depuis l\'administration.', status: 403 };

  const result = db.prepare('DELETE FROM table_members WHERE table_id = ? AND user_id = ?').run(tableId, userId);
  if (result.changes === 0) throw { code: 'NOT_FOUND', message: 'Vous n\'êtes pas membre de cette table', status: 404 };
  return { left: true };
}

export function updateMemberRole(tableId, memberId, newRole, requestingUser) {
  if (!['mj', 'joueur'].includes(newRole)) {
    throw { code: 'VALIDATION_ERROR', message: 'Le rôle doit être "mj" ou "joueur"', status: 400 };
  }

  if (!requestingUser.is_admin) {
    throw { code: 'FORBIDDEN', message: 'Seul un admin peut modifier les rôles', status: 403 };
  }

  const table = db.prepare('SELECT mj_id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) {
    throw { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 };
  }

  if (memberId === table.mj_id) {
    throw { code: 'VALIDATION_ERROR', message: 'Le MJ créateur de la table ne peut pas être modifié', status: 400 };
  }

  const member = db.prepare('SELECT * FROM table_members WHERE table_id = ? AND user_id = ?').get(tableId, memberId);
  if (!member) {
    throw { code: 'NOT_FOUND', message: 'Membre introuvable dans cette table', status: 404 };
  }

  db.prepare('UPDATE table_members SET role = ? WHERE table_id = ? AND user_id = ?').run(newRole, tableId, memberId);

  return { table_id: tableId, user_id: memberId, role: newRole };
}
