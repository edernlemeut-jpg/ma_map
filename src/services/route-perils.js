import { randomUUID } from 'node:crypto';
import db from '../database.js';
import { isVisible } from './visibility.js';

function parsePerilRows() {
  const rows = db.prepare('SELECT type, data_json FROM peril_data').all();
  const pool = [];

  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.data_json);
    } catch {
      continue;
    }

    const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    categories.forEach((category, categoryIndex) => {
      const perils = Array.isArray(category?.perils) ? category.perils : [];
      perils.forEach((peril, perilIndex) => {
        const perilId = `${row.type}:${categoryIndex}:${perilIndex}`;
        const description = String(peril?.data?.description || peril?.nom || '').trim();
        const difficultyRange =
          Number.isFinite(peril?.seuilMin) && Number.isFinite(peril?.seuilMax)
            ? `${peril.seuilMin}-${peril.seuilMax}`
            : 'N/A';

        pool.push({
          peril_id: perilId,
          source_type: row.type,
          type: String(peril?.nom || category?.nom || row.type),
          difficulty: difficultyRange,
          description,
          weight: Number(peril?.weight || peril?.data?.weight || 1),
          quadrant_id: peril?.quadrant_id || peril?.data?.quadrant_id || null
        });
      });
    });
  }

  return pool;
}

function buildPerilLookup() {
  const lookup = new Map();
  const pool = parsePerilRows();
  pool.forEach(item => lookup.set(item.peril_id, item));
  return { pool, lookup };
}

function assertRouteForTable(routeId, tableId) {
  return db.prepare('SELECT id FROM travel_routes WHERE id = ? AND table_id = ?').get(routeId, tableId);
}

function getRouteWaypoints(routeId) {
  return db.prepare('SELECT system_id FROM route_waypoints WHERE route_id = ? ORDER BY position ASC').all(routeId).map(r => Number(r.system_id));
}

function weightedPick(items) {
  if (!items.length) return null;
  const totalWeight = items.reduce((sum, item) => sum + Math.max(1, Number(item.weight || 1)), 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= Math.max(1, Number(item.weight || 1));
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function listRowsForRoute(routeId) {
  return db.prepare(
    'SELECT id, route_id, peril_id, segment_index, custom_text, is_manual FROM route_perils WHERE route_id = ? ORDER BY segment_index ASC, id ASC'
  ).all(routeId);
}

function enrichPerilRows(rows) {
  const { lookup } = buildPerilLookup();

  return rows.map(row => {
    const source = lookup.get(row.peril_id);
    const customText = typeof row.custom_text === 'string' ? row.custom_text.trim() : '';
    const isManual = !!row.is_manual;

    return {
      id: row.id,
      route_id: row.route_id,
      peril_id: row.peril_id,
      segment_index: Number(row.segment_index),
      is_manual: isManual,
      custom_text: customText || null,
      type: isManual ? 'Manuel' : String(source?.type || 'Péril inconnu'),
      difficulty: isManual ? 'N/A' : String(source?.difficulty || 'N/A'),
      description: customText || String(source?.description || '')
    };
  });
}

export function listRoutePerils(routeId, tableId, role = 'mj') {
  if (!assertRouteForTable(routeId, tableId)) return null;
  if (role !== 'mj' && !isVisible('route_perils', routeId, tableId, role)) {
    return [];
  }
  const rows = listRowsForRoute(routeId);
  return enrichPerilRows(rows);
}

export const generateRoutePerils = db.transaction((routeId, tableId, options = {}) => {
  if (!assertRouteForTable(routeId, tableId)) return null;

  const waypointIds = getRouteWaypoints(routeId);
  if (waypointIds.length < 2) {
    return { error: 'La route doit contenir au moins 2 waypoints' };
  }

  const perilPool = parsePerilRows();
  if (!perilPool.length) {
    return { error: 'Aucun péril disponible en base' };
  }

  const minPerSegment = Math.max(1, Number(options.min_per_segment || 1));
  const maxPerSegment = Math.max(minPerSegment, Number(options.max_per_segment || 2));

  const insert = db.prepare(
    'INSERT INTO route_perils (route_id, peril_id, segment_index, custom_text, is_manual) VALUES (?, ?, ?, NULL, 0)'
  );

  db.prepare('DELETE FROM route_perils WHERE route_id = ? AND is_manual = 0').run(routeId);

  for (let segmentIndex = 1; segmentIndex < waypointIds.length; segmentIndex++) {
    const destinationSystemId = waypointIds[segmentIndex];
    const destination = db.prepare('SELECT quadrant FROM systems WHERE id = ?').get(destinationSystemId);
    const zone = destination?.quadrant || null;

    const zonePool = perilPool.filter(peril => !peril.quadrant_id || peril.quadrant_id === zone);
    const sourcePool = zonePool.length ? zonePool : perilPool;

    const count = Math.floor(Math.random() * (maxPerSegment - minPerSegment + 1)) + minPerSegment;
    for (let i = 0; i < count; i++) {
      const chosen = weightedPick(sourcePool);
      if (!chosen) continue;
      insert.run(routeId, chosen.peril_id, segmentIndex);
    }
  }

  const rows = listRowsForRoute(routeId);
  return enrichPerilRows(rows);
});

export function addManualRoutePeril(routeId, tableId, payload) {
  if (!assertRouteForTable(routeId, tableId)) return null;

  const segmentIndex = Number(payload.segment_index);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 1) {
    return { error: 'segment_index invalide' };
  }

  const customText = String(payload.custom_text || '').trim();
  if (!customText) {
    return { error: 'custom_text est requis pour un péril manuel' };
  }

  const perilId = payload.peril_id ? String(payload.peril_id) : `manual:${randomUUID()}`;
  const result = db.prepare(
    'INSERT INTO route_perils (route_id, peril_id, segment_index, custom_text, is_manual) VALUES (?, ?, ?, ?, 1)'
  ).run(routeId, perilId, segmentIndex, customText);

  const row = db.prepare(
    'SELECT id, route_id, peril_id, segment_index, custom_text, is_manual FROM route_perils WHERE id = ?'
  ).get(result.lastInsertRowid);

  return enrichPerilRows([row])[0];
}

export function updateRoutePeril(routeId, perilRowId, tableId, payload) {
  if (!assertRouteForTable(routeId, tableId)) return null;

  const perilId = Number(perilRowId);
  if (!Number.isInteger(perilId) || perilId <= 0) return null;

  const existing = db.prepare('SELECT id FROM route_perils WHERE id = ? AND route_id = ?').get(perilId, routeId);
  if (!existing) return null;

  if (payload.custom_text === undefined) {
    return { error: 'custom_text est requis' };
  }

  db.prepare('UPDATE route_perils SET custom_text = ? WHERE id = ? AND route_id = ?').run(
    String(payload.custom_text || '').trim() || null,
    perilId,
    routeId
  );

  const row = db.prepare(
    'SELECT id, route_id, peril_id, segment_index, custom_text, is_manual FROM route_perils WHERE id = ?'
  ).get(perilId);
  return enrichPerilRows([row])[0];
}

export function deleteRoutePeril(routeId, perilRowId, tableId) {
  if (!assertRouteForTable(routeId, tableId)) return false;
  const perilId = Number(perilRowId);
  if (!Number.isInteger(perilId) || perilId <= 0) return false;

  const result = db.prepare('DELETE FROM route_perils WHERE id = ? AND route_id = ?').run(perilId, routeId);
  return result.changes > 0;
}
