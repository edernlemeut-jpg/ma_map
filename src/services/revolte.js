/**
 * revolte.js — Service métier pour les sessions de révolte par table.
 */
import db from '../database.js';
import { randomUUID } from 'crypto';

const VALID_TYPES = ['emeute', 'festive', 'mutinerie', 'revolution'];
const VALID_STATUSES = ['en_cours', 'reussie', 'echouee', 'archivee'];

// ── List ──────────────────────────────────────────────────────────────────────
export function listSessions(tableId, { status } = {}) {
  let sql = `SELECT id, name, type, scope, location_ref, status, created_by, created_at, updated_at
             FROM revolte_sessions WHERE table_id = ?`;
  const params = [tableId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(...params);
}

// ── Get one (with state_json) ─────────────────────────────────────────────────
export function getSession(id, tableId) {
  const row = db.prepare('SELECT * FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) return null;
  try { row.state = JSON.parse(row.state_json); } catch { row.state = {}; }
  delete row.state_json;
  return row;
}

// ── Create ────────────────────────────────────────────────────────────────────
export function createSession(tableId, userId, { name, type, scope, location_ref, state }) {
  if (!name?.trim()) throw Object.assign(new Error('Nom requis'), { status: 400 });
  if (!VALID_TYPES.includes(type)) throw Object.assign(new Error('Type invalide'), { status: 400 });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO revolte_sessions (id, table_id, name, type, scope, location_ref, state_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tableId, name.trim(), type, scope || null, location_ref || null,
         JSON.stringify(state || {}), userId);

  return getSession(id, tableId);
}

// ── Update (full state or metadata) ──────────────────────────────────────────
export function updateSession(id, tableId, { name, type, scope, location_ref, status, state }) {
  const row = db.prepare('SELECT id FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) throw Object.assign(new Error('Session introuvable'), { status: 404 });
  if (type && !VALID_TYPES.includes(type)) throw Object.assign(new Error('Type invalide'), { status: 400 });
  if (status && !VALID_STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide'), { status: 400 });

  db.prepare(`
    UPDATE revolte_sessions SET
      name         = COALESCE(?, name),
      type         = COALESCE(?, type),
      scope        = COALESCE(?, scope),
      location_ref = COALESCE(?, location_ref),
      status       = COALESCE(?, status),
      state_json   = COALESCE(?, state_json),
      updated_at   = datetime('now')
    WHERE id = ?
  `).run(
    name?.trim() || null,
    type || null,
    scope !== undefined ? (scope || null) : null,
    location_ref !== undefined ? (location_ref || null) : null,
    status || null,
    state !== undefined ? JSON.stringify(state) : null,
    id
  );

  return getSession(id, tableId);
}

// ── Delete ────────────────────────────────────────────────────────────────────
export function deleteSession(id, tableId) {
  const row = db.prepare('SELECT id FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) throw Object.assign(new Error('Session introuvable'), { status: 404 });
  db.prepare('DELETE FROM revolte_sessions WHERE id = ?').run(id);
}
