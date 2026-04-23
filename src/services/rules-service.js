import db from '../database.js';
import { randomUUID } from 'crypto';

/**
 * Visibility rules:
 *  - table_id IS NULL  → global (visible to all authenticated users)
 *  - table_id = X      → visible only to members of table X
 *
 * Edit / delete rules:
 *  - global entries: admin only
 *  - table-scoped entries: MJ of that table or admin
 */

/** Return all rules visible to the user (global + their active table). */
export function listRules({ tableId = null, category = null } = {}) {
  let sql = `SELECT * FROM rules_entries WHERE (table_id IS NULL`;
  const params = [];

  if (tableId) {
    sql += ` OR table_id = ?`;
    params.push(tableId);
  }
  sql += `)`;

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY category, name COLLATE NOCASE`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(parseExtra);
}

/** Get a single entry by id. */
export function getRule(id) {
  const row = db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(id);
  if (!row) return null;
  return parseExtra(row);
}

/** Create a new entry.
 *  Admin → global (table_id = null)
 *  MJ    → scoped to their active table
 */
export function createRule({ category, name, description, extra, tableId, createdBy }) {
  const id = `${category}-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO rules_entries (id, category, name, description, extra, table_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, category, name, description || null, extra ? JSON.stringify(extra) : null, tableId || null, createdBy, now, now);
  return getRule(id);
}

/** Update an existing entry. Returns null if not found or not authorised. */
export function updateRule(id, { name, description, extra }, user) {
  const entry = db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(id);
  if (!entry) return null;

  if (!canEdit(entry, user)) return null;

  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE rules_entries SET name=?, description=?, extra=?, updated_at=? WHERE id=?`
  ).run(name ?? entry.name, description ?? entry.description, extra ? JSON.stringify(extra) : entry.extra, now, id);
  return getRule(id);
}

/** Delete an entry. Returns false if not found or not authorised. */
export function deleteRule(id, user) {
  const entry = db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(id);
  if (!entry) return false;
  if (!canEdit(entry, user)) return false;

  db.prepare('DELETE FROM rules_entries WHERE id = ?').run(id);
  return true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseExtra(row) {
  let extra = null;
  if (row.extra) {
    try { extra = JSON.parse(row.extra); } catch { extra = null; }
  }
  return { ...row, extra };
}

function canEdit(entry, user) {
  if (user.is_admin) return true;

  // MJ can only edit table-scoped entries belonging to their table
  if (entry.table_id && user.profile_role === 'mj') {
    const isMJ = db.prepare('SELECT 1 FROM game_tables WHERE id = ? AND mj_id = ?').get(entry.table_id, user.id);
    return !!isMJ;
  }
  return false;
}
