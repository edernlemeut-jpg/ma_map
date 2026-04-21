import { randomUUID } from 'node:crypto';
import db from '../database.js';

function routeRowToDto(row) {
  return {
    id: row.id,
    table_id: row.table_id,
    name: row.name,
    active: !!row.active,
    waypoint_ids: row.waypoint_ids ? JSON.parse(row.waypoint_ids) : []
  };
}

function validateWaypointIds(waypointIds) {
  if (!Array.isArray(waypointIds) || waypointIds.length < 2) {
    return 'Une route doit contenir au moins 2 systèmes';
  }

  for (const systemId of waypointIds) {
    if (!Number.isInteger(Number(systemId)) || Number(systemId) <= 0) {
      return 'Chaque system_id doit être un entier valide';
    }
    const found = db.prepare('SELECT id FROM systems WHERE id = ?').get(Number(systemId));
    if (!found) {
      return `Système introuvable: ${systemId}`;
    }
  }

  return null;
}

function buildRouteDto(routeId) {
  const row = db.prepare(`
    SELECT tr.id, tr.table_id, tr.name, tr.active,
           json_group_array(rw.system_id) AS waypoint_ids
    FROM travel_routes tr
    LEFT JOIN route_waypoints rw ON rw.route_id = tr.id
    WHERE tr.id = ?
    GROUP BY tr.id
  `).get(routeId);

  if (!row) return null;
  return routeRowToDto(row);
}

function replaceWaypoints(routeId, waypointIds) {
  db.prepare('DELETE FROM route_waypoints WHERE route_id = ?').run(routeId);
  const insert = db.prepare('INSERT INTO route_waypoints (route_id, system_id, position) VALUES (?, ?, ?)');
  waypointIds.forEach((systemId, index) => {
    insert.run(routeId, Number(systemId), index);
  });
}

export function listTravelRoutes(tableId) {
  const rows = db.prepare(`
    SELECT tr.id, tr.table_id, tr.name, tr.active,
           COALESCE(json_group_array(rw.system_id), '[]') AS waypoint_ids
    FROM travel_routes tr
    LEFT JOIN route_waypoints rw ON rw.route_id = tr.id
    WHERE tr.table_id = ?
    GROUP BY tr.id
    ORDER BY tr.updated_at DESC, tr.created_at DESC
  `).all(tableId);

  return rows.map(routeRowToDto);
}

export function getTravelRoute(routeId, tableId) {
  const route = buildRouteDto(routeId);
  if (!route || route.table_id !== tableId) return null;
  return route;
}

export const createTravelRoute = db.transaction((tableId, payload) => {
  const name = String(payload.name || '').trim();
  if (!name) return { error: 'Le champ "name" est requis' };

  const waypointError = validateWaypointIds(payload.waypoint_ids);
  if (waypointError) return { error: waypointError };

  const routeId = randomUUID();
  const activeInt = payload.active ? 1 : 0;

  if (activeInt) {
    db.prepare('UPDATE travel_routes SET active = 0, updated_at = datetime(\'now\') WHERE table_id = ?').run(tableId);
  }

  db.prepare(
    'INSERT INTO travel_routes (id, table_id, name, active) VALUES (?, ?, ?, ?)'
  ).run(routeId, tableId, name, activeInt);

  replaceWaypoints(routeId, payload.waypoint_ids.map(Number));

  return buildRouteDto(routeId);
});

export const updateTravelRoute = db.transaction((routeId, tableId, payload) => {
  const existing = getTravelRoute(routeId, tableId);
  if (!existing) return null;

  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : existing.name;
  if (!nextName) return { error: 'Le champ "name" est requis' };

  const nextWaypointIds = payload.waypoint_ids !== undefined ? payload.waypoint_ids.map(Number) : existing.waypoint_ids;
  const waypointError = validateWaypointIds(nextWaypointIds);
  if (waypointError) return { error: waypointError };

  const nextActive = payload.active !== undefined ? !!payload.active : existing.active;
  if (nextActive) {
    db.prepare('UPDATE travel_routes SET active = 0, updated_at = datetime(\'now\') WHERE table_id = ?').run(tableId);
  }

  db.prepare(
    'UPDATE travel_routes SET name = ?, active = ?, updated_at = datetime(\'now\') WHERE id = ? AND table_id = ?'
  ).run(nextName, nextActive ? 1 : 0, routeId, tableId);

  replaceWaypoints(routeId, nextWaypointIds);
  return buildRouteDto(routeId);
});

export function deleteTravelRoute(routeId, tableId) {
  const result = db.prepare('DELETE FROM travel_routes WHERE id = ? AND table_id = ?').run(routeId, tableId);
  return result.changes > 0;
}
