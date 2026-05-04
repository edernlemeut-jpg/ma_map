import db from '../database.js';
import { isVisible } from './visibility.js';

const VALID_ENTITY_TYPES = ['system', 'faction', 'ship', 'named_npc', 'character', 'event'];

/**
 * Mapping entity_links target_type → visibility service type.
 * Types not listed here have no visibility rule → protect-by-default (hidden for joueur).
 */
const VISIBILITY_TYPE_MAP = {
  system:  'systems',
  faction: 'factions',
  ship:    'ships',
};

/**
 * Check if a target entity is visible for the given role.
 * - MJ : always true (but we still compute to fill target_hidden)
 * - joueur : uses the visibility service or named_npc.visible; protect-by-default for unknown types
 *
 * @param {string} targetType
 * @param {number} targetId
 * @param {number} tableId
 * @param {string} role  'mj'|'joueur'
 * @returns {boolean}
 */
function isTargetVisible(targetType, targetId, tableId, role) {
  // Visibility-system types (system, faction, ship)
  const visType = VISIBILITY_TYPE_MAP[targetType];
  if (visType) return isVisible(visType, targetId, tableId, role);

  // named_npc: check named_npcs.visible once the table exists (Epic 9)
  if (targetType === 'named_npc') {
    try {
      const row = db.prepare('SELECT visible FROM named_npcs WHERE id = ?').get(Number(targetId));
      // Table not found (no rows) → protect-by-default
      return row != null ? !!row.visible : false;
    } catch {
      return false; // table doesn't exist yet → protect-by-default
    }
  }

  // character, event — no visibility system yet → protect-by-default for joueur
  if (role === 'mj') return true;
  return false;
}

/**
 * Validate that a type is an allowed entity type.
 * @param {*} type
 * @returns {boolean}
 */
function isValidEntityType(type) {
  return typeof type === 'string' && type.length > 0 && VALID_ENTITY_TYPES.includes(type);
}

/**
 * Create a link between two entities within a table.
 * @param {number} tableId
 * @param {{ source_type, source_id, target_type, target_id, relation_type?, notes? }} params
 * @returns {{ id, table_id, source_type, source_id, target_type, target_id, relation_type, notes, created_at }}
 * @throws {{ code: 'INVALID_ENTITY_TYPE', message: string }} if types are invalid
 */
export function createLink(tableId, { source_type, source_id, target_type, target_id, relation_type = null, notes = null }) {
  if (!isValidEntityType(source_type)) {
    throw { code: 'INVALID_ENTITY_TYPE', message: `source_type invalide : "${source_type}". Types autorisés : ${VALID_ENTITY_TYPES.join(', ')}` };
  }
  if (!isValidEntityType(target_type)) {
    throw { code: 'INVALID_ENTITY_TYPE', message: `target_type invalide : "${target_type}". Types autorisés : ${VALID_ENTITY_TYPES.join(', ')}` };
  }

  const result = db.prepare(`
    INSERT INTO entity_links (table_id, source_type, source_id, target_type, target_id, relation_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tableId, source_type, Number(source_id), target_type, Number(target_id), relation_type, notes);

  return db.prepare('SELECT * FROM entity_links WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get links for a given source entity within a table.
 * - MJ  : all links returned, each annotated with { target_hidden: boolean }
 * - joueur : links to hidden target entities are removed client cannot see them
 *
 * @param {number} tableId
 * @param {{ source_type?: string, source_id?: number, target_type?: string, target_id?: number }} filters
 * @param {string} [role='mj']  'mj'|'joueur'
 * @returns {Array}
 */
export function getLinks(tableId, { source_type, source_id, target_type, target_id } = {}, role = 'mj') {
  let sql = 'SELECT * FROM entity_links WHERE table_id = ?';
  const params = [tableId];

  if (source_type !== undefined) { sql += ' AND source_type = ?'; params.push(source_type); }
  if (source_id !== undefined)   { sql += ' AND source_id = ?';   params.push(Number(source_id)); }
  if (target_type !== undefined) { sql += ' AND target_type = ?'; params.push(target_type); }
  if (target_id !== undefined)   { sql += ' AND target_id = ?';   params.push(Number(target_id)); }

  sql += ' ORDER BY created_at';
  const rows = db.prepare(sql).all(...params);

  if (role === 'mj') {
    // Annotate each link with target_hidden so MJ can render a lock icon
    return rows.map(link => ({
      ...link,
      target_hidden: !isTargetVisible(link.target_type, link.target_id, tableId, 'joueur'),
    }));
  }

  // joueur: filter out links to hidden entities (protect-by-default)
  return rows.filter(link => isTargetVisible(link.target_type, link.target_id, tableId, 'joueur'));
}

/**
 * Delete a link by id, scoped to the given table.
 * Returns null if the link does not exist or belongs to another table.
 * @param {number} tableId
 * @param {number} linkId
 * @returns {{ deleted: number }|null|'forbidden'}
 */
export function deleteLink(tableId, linkId) {
  const link = db.prepare('SELECT id, table_id FROM entity_links WHERE id = ?').get(Number(linkId));
  if (!link) return null;
  if (link.table_id !== tableId) return 'forbidden';

  db.prepare('DELETE FROM entity_links WHERE id = ?').run(Number(linkId));
  return { deleted: Number(linkId) };
}
