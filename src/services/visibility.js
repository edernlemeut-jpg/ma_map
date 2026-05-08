/**
 * Visibility service — centralized protect-by-default with cascade rules.
 * Every data route calls this service to filter responses by role.
 *
 * Tables used:
 * - visibility_rules (campaign data: systems, ships, npcs)
 * - table_visibility_overrides (universe data: factions, ship_models)
 */
import db from '../database.js';

/** Entity types stored in table_visibility_overrides (universe data) */
const UNIVERSE_TYPES = new Set(['factions', 'ship_models', 'secondary_systems']);

/** Default visibility when no rule exists */
const DEFAULT_VISIBLE = {
  factions: 1,     // visible by default
  ship_models: 0,
  secondary_systems: 1, // visible by default (reference catalogue)
  systems: 0,
  ships: 0,
  npcs: 0,
  quadrants: 0,
  travel_routes: 1,
  route_perils: 0
};

/**
 * Determine which table stores visibility for a given entity type.
 */
function getVisibilityTable(entityType) {
  return UNIVERSE_TYPES.has(entityType) ? 'table_visibility_overrides' : 'visibility_rules';
}

/**
 * Get the default visibility for an entity type.
 * Returns 1 (visible) or 0 (hidden).
 */
function getDefault(entityType) {
  return DEFAULT_VISIBLE[entityType] ?? 0;
}

/**
 * Check if a single entity is visible for the given role.
 * MJ always sees everything.
 */
export function isVisible(entityType, entityId, tableId, role) {
  if (role === 'mj') return true;

  // For systems: quadrant visibility cascades — a hidden quadrant hides all its systems
  // even if the system has an individual visible=true rule.
  if (entityType === 'systems') {
    // Step 1: cascade — check the system's quadrant
    const sys = db.prepare('SELECT quadrant FROM systems WHERE id = ?').get(entityId);
    if (sys) {
      const quadrantRule = db.prepare(
        'SELECT visible FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?'
      ).get(tableId, 'quadrants', String(sys.quadrant));
      const quadrantVisible = quadrantRule !== undefined ? !!quadrantRule.visible : !!getDefault('quadrants');
      if (!quadrantVisible) return false;
    }

    // Step 2: quadrant is visible — check system's own rule
    const explicitRule = db.prepare(
      'SELECT visible FROM visibility_rules WHERE table_id = ? AND entity_type = ? AND entity_id = ?'
    ).get(tableId, 'systems', String(entityId));

    if (explicitRule !== undefined) return !!explicitRule.visible;

    return !!getDefault('systems'); // 0 — hidden by default
  }

  const table = getVisibilityTable(entityType);
  const rule = db.prepare(
    `SELECT visible FROM ${table} WHERE table_id = ? AND entity_type = ? AND entity_id = ?`
  ).get(tableId, entityType, String(entityId));

  return rule ? !!rule.visible : !!getDefault(entityType);
}

/**
 * Get all visible entity IDs for a given type and role.
 * MJ gets all IDs.
 */
export function getVisibleIds(entityType, tableId, role) {
  const sourceTable = getSourceTable(entityType);
  if (!sourceTable) return [];

  // MJ sees everything
  if (role === 'mj') {
    const idCol = sourceTable.idCol;
    const rows = db.prepare(`SELECT ${idCol} AS id FROM ${sourceTable.table}`).all();
    return rows.map(r => r.id);
  }

  const idCol = sourceTable.idCol;
  const allRows = db.prepare(`SELECT ${idCol} AS id FROM ${sourceTable.table}`).all();

  return allRows
    .filter(row => isVisible(entityType, row.id, tableId, role))
    .map(row => row.id);
}

/**
 * Toggle visibility for an entity. Persists the rule and handles cascade.
 * Returns { entityType, entityId, visible }.
 */
export const toggleVisibility = db.transaction((entityType, entityId, tableId, visible) => {
  const visTable = getVisibilityTable(entityType);
  const visibleInt = visible ? 1 : 0;

  db.prepare(
    `INSERT OR REPLACE INTO ${visTable} (table_id, entity_type, entity_id, visible) VALUES (?, ?, ?, ?)`
  ).run(tableId, entityType, String(entityId), visibleInt);

  return { entityType, entityId: String(entityId), visible: !!visibleInt };
});

/**
 * Bulk-set visibility for all entities of a type, optionally filtered.
 * filter: { quadrant?: string, quadrant_id?: string|number }
 * Only 'systems' supports quadrant filter for now.
 * Returns { affected: N, version: V }
 */
export const bulkVisibility = db.transaction((entityType, filter, tableId, visible) => {
  const visTable = getVisibilityTable(entityType);
  const visibleInt = visible ? 1 : 0;
  const sourceTable = getSourceTable(entityType);
  if (!sourceTable) return { affected: 0, version: Date.now() };

  const quadrantFilter = filter?.quadrant ?? filter?.quadrant_id;

  let ids;
  if (entityType === 'systems' && quadrantFilter != null && quadrantFilter !== '') {
    ids = db.prepare('SELECT id FROM systems WHERE quadrant = ?').all(String(quadrantFilter)).map(r => r.id);
  } else {
    ids = db.prepare(`SELECT ${sourceTable.idCol} AS id FROM ${sourceTable.table}`).all().map(r => r.id);
  }

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${visTable} (table_id, entity_type, entity_id, visible) VALUES (?, ?, ?, ?)`
  );
  for (const id of ids) {
    stmt.run(tableId, entityType, String(id), visibleInt);
  }

  return { affected: ids.length, version: Date.now() };
});

/**
 * Map entity types to their source database table and ID column.
 */
function getSourceTable(entityType) {
  const map = {
    systems: { table: 'systems', idCol: 'id' },
    factions: { table: 'factions', idCol: 'id' },
    ship_models: { table: 'ship_models', idCol: 'id' },
    secondary_systems: { table: 'secondary_systems', idCol: 'id' },
    ships: { table: 'ships', idCol: 'id' },
    npcs: { table: 'npcs', idCol: 'id' },
    travel_routes: { table: 'travel_routes', idCol: 'id' }
  };
  return map[entityType] || null;
}
