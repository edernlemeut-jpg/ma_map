/**
 * Sync service — provides sync payload for polling clients.
 * Includes visibility counters per entity type and system deltas for map updates.
 */

import db from '../database.js';
import { getVisibleIds, isVisible } from './visibility.js';
import { getSessionState } from './session.js';
import { listRoutePerils } from './route-perils.js';

const ENTITY_TYPES = ['systems', 'factions', 'ship_models', 'travel_routes'];

// In-memory version tracker (incremented on each poll cycle)
// In production, this would be persisted to DB
let globalVersion = 1;

/**
 * Increment and return the next version number.
 * Called at the end of each sync cycle to mark changes.
 */
export function incrementVersion() {
  return ++globalVersion;
}

/**
 * Get current version.
 */
export function getCurrentVersion() {
  return globalVersion;
}

/**
 * Get all systems visible to a role with full data.
 */
function getVisibleSystems(tableId, role) {
  const visibleIds = getVisibleIds('systems', tableId, role);
  
  return visibleIds.map(id => {
    const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
    return system;
  }).filter(Boolean);
}

function getActiveRoute(tableId, role) {
  const activeRoute = db.prepare(
    'SELECT id, table_id, name, active FROM travel_routes WHERE table_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1'
  ).get(tableId);

  if (!activeRoute) return null;
  if (role !== 'mj' && !isVisible('travel_routes', activeRoute.id, tableId, role)) {
    return null;
  }

  const waypointRows = db.prepare(
    'SELECT system_id FROM route_waypoints WHERE route_id = ? ORDER BY position ASC'
  ).all(activeRoute.id);

  return {
    id: activeRoute.id,
    table_id: activeRoute.table_id,
    name: activeRoute.name,
    active: true,
    waypoint_ids: waypointRows.map(row => Number(row.system_id))
  };
}

function getVisibleShips(tableId, role) {
  if (role === 'mj') {
    return db.prepare(
      'SELECT id, table_id, nom AS name, model_id, hull, crew, cargo_capacity, notes FROM ships WHERE table_id = ? AND deleted_at IS NULL ORDER BY nom COLLATE NOCASE'
    ).all(tableId);
  }

  const visibleShipIds = getVisibleIds('ships', tableId, role).map(id => String(id));
  if (!visibleShipIds.length) return [];

  const rows = db.prepare(
    'SELECT id, table_id, nom AS name, model_id, hull, crew, cargo_capacity, notes FROM ships WHERE table_id = ? AND deleted_at IS NULL ORDER BY nom COLLATE NOCASE'
  ).all(tableId);

  const visible = new Set(visibleShipIds);
  return rows.filter(ship => visible.has(String(ship.id)));
}

function getItineraryPayload(tableId, role) {
  const activeRoute = getActiveRoute(tableId, role);
  const ships = getVisibleShips(tableId, role);
  const perils = activeRoute ? (listRoutePerils(activeRoute.id, tableId, role) || []) : [];

  return {
    active_route: activeRoute,
    ships,
    perils
  };
}

/**
 * Calculate system deltas by comparing current visible systems to previous state.
 * Since we don't persist client state, we return all visible systems as potential updates.
 * The client is responsible for diffing against its Map.
 */
export function getSyncPayload(tableId, role) {
  const entities = {};
  const sessionState = getSessionState(tableId);
  
  // Entity counts for all types
  for (const type of ENTITY_TYPES) {
    const ids = getVisibleIds(type, tableId, role);
    entities[type] = { count: ids.length };
  }
  
  // For joueur, include full system objects for map rendering
  if (role === 'joueur') {
    const systems = getVisibleSystems(tableId, role);
    entities.systems.revealed = systems;
    entities.systems.hidden = [];
    entities.systems.updated = [];
  } else {
    // MJ gets all systems with visible flags
    const systems = db.prepare('SELECT * FROM systems').all();
    entities.systems.revealed = [];
    entities.systems.hidden = [];
    entities.systems.updated = systems;
  }

  entities.travel_routes.active = getActiveRoute(tableId, role);

  return {
    version: getCurrentVersion(),
    timestamp: new Date().toISOString(),
    sessionActive: !!sessionState.sessionActive,
    entities,
    itinerary: getItineraryPayload(tableId, role)
  };
}
