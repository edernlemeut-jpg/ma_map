/**
 * revolte.js — Service métier pour les sessions de révolte par table.
 *
 * Une session peut avoir un `parent_id` pointant vers une autre session de la
 * même table. Convention : la session parent porte la portée stellaire/locale
 * et agrège des sessions enfants planétaires.
 */
import db from '../database.js';
import { randomUUID } from 'crypto';

const VALID_TYPES = ['emeute', 'festive', 'mutinerie', 'revolution'];
const VALID_STATUSES = ['en_cours', 'reussie', 'echouee', 'archivee'];

// ── List ─────────────────────────────────────────────────────────────────────────
export function listSessions(tableId, { status, parentId } = {}) {
  let sql = `SELECT id, parent_id, name, type, scope, location_ref, status, created_by, created_at, updated_at
             FROM revolte_sessions WHERE table_id = ?`;
  const params = [tableId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (parentId === null) { sql += ' AND parent_id IS NULL'; }
  else if (parentId !== undefined) { sql += ' AND parent_id = ?'; params.push(parentId); }
  sql += ' ORDER BY updated_at DESC';
  const rows = db.prepare(sql).all(...params);
  // Attach child count for navigation.
  const childCountByParent = new Map();
  for (const r of db.prepare(`SELECT parent_id, COUNT(*) AS n FROM revolte_sessions WHERE table_id = ? AND parent_id IS NOT NULL GROUP BY parent_id`).all(tableId)) {
    childCountByParent.set(r.parent_id, r.n);
  }
  return rows.map(r => ({ ...r, child_count: childCountByParent.get(r.id) || 0 }));
}

// ── Get one (with state_json + direct children) ──────────────────────────────
export function getSession(id, tableId) {
  const row = db.prepare('SELECT * FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) return null;
  try { row.state = JSON.parse(row.state_json); } catch { row.state = {}; }
  delete row.state_json;
  row.children = db.prepare(`SELECT id, parent_id, name, type, scope, location_ref, status, updated_at
                              FROM revolte_sessions WHERE parent_id = ? ORDER BY created_at ASC`).all(id);
  return row;
}

// ── Create ────────────────────────────────────────────────────────────────────
export function createSession(tableId, userId, { name, type, scope, location_ref, state, parent_id }) {
  if (!name?.trim()) throw Object.assign(new Error('Nom requis'), { status: 400 });
  if (!VALID_TYPES.includes(type)) throw Object.assign(new Error('Type invalide'), { status: 400 });
  if (parent_id) {
    const parent = db.prepare('SELECT id, table_id FROM revolte_sessions WHERE id = ?').get(parent_id);
    if (!parent || parent.table_id !== tableId) {
      throw Object.assign(new Error('Session parente introuvable'), { status: 400 });
    }
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO revolte_sessions (id, table_id, parent_id, name, type, scope, location_ref, state_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tableId, parent_id || null, name.trim(), type, scope || null, location_ref || null,
         JSON.stringify(state || {}), userId);

  return getSession(id, tableId);
}

// ── Update (full state or metadata) ──────────────────────────────────────────
export function updateSession(id, tableId, { name, type, scope, location_ref, status, state, parent_id }) {
  const row = db.prepare('SELECT id FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) throw Object.assign(new Error('Session introuvable'), { status: 404 });
  if (type && !VALID_TYPES.includes(type)) throw Object.assign(new Error('Type invalide'), { status: 400 });
  if (status && !VALID_STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide'), { status: 400 });

  // scope peut être explicitement null (effacement) ou absent (conserver) — on distingue les deux.
  const scopeClause = scope !== undefined ? '?' : 'COALESCE(?, scope)';
  const scopeParam  = scope !== undefined ? (scope || null) : null;

  let parentClause = '';
  const params = [
    name?.trim() || null,
    type || null,
    scopeParam,
    location_ref !== undefined ? (location_ref || null) : null,
    status || null,
    state !== undefined ? JSON.stringify(state) : null,
  ];
  if (parent_id !== undefined) {
    if (parent_id) {
      if (parent_id === id) throw Object.assign(new Error('Cycle interdit'), { status: 400 });
      const p = db.prepare('SELECT id, table_id FROM revolte_sessions WHERE id = ?').get(parent_id);
      if (!p || p.table_id !== tableId) throw Object.assign(new Error('Session parente introuvable'), { status: 400 });
    }
    parentClause = ', parent_id = ?';
    params.push(parent_id || null);
  }
  params.push(id);

  db.prepare(`
    UPDATE revolte_sessions SET
      name         = COALESCE(?, name),
      type         = COALESCE(?, type),
      scope        = ${scopeClause},
      location_ref = COALESCE(?, location_ref),
      status       = COALESCE(?, status),
      state_json   = COALESCE(?, state_json)${parentClause},
      updated_at   = datetime('now')
    WHERE id = ?
  `).run(...params);

  return getSession(id, tableId);
}

// ── Delete ────────────────────────────────────────────────────────────────────
export function deleteSession(id, tableId) {
  const row = db.prepare('SELECT id FROM revolte_sessions WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) throw Object.assign(new Error('Session introuvable'), { status: 404 });
  db.prepare('DELETE FROM revolte_sessions WHERE id = ?').run(id);
}
