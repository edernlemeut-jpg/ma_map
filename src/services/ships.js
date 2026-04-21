import { randomUUID } from 'node:crypto';
import db from '../database.js';
import { isVisible } from './visibility.js';

const SHIP_SELECT = `
  s.id,
  s.table_id,
  s.nom AS name,
  s.model_id,
  s.hull,
  s.crew,
  s.cargo_capacity,
  s.notes,
  s.created_at,
  s.updated_at,
  sm.nom AS model_name
`;

function toNumberOrDefault(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getModelDefaults(modelId) {
  if (!modelId) return null;
  return db.prepare(
    'SELECT id, nom, coque, equipage, soute FROM ship_models WHERE id = ?'
  ).get(modelId) || null;
}

function mapShipRow(row, tableId, role) {
  if (!row) return null;
  const ship = {
    id: row.id,
    table_id: row.table_id,
    name: row.name,
    model_id: row.model_id,
    model_name: row.model_name || null,
    hull: Number(row.hull || 0),
    crew: Number(row.crew || 0),
    cargo_capacity: Number(row.cargo_capacity || 0),
    notes: row.notes || ''
  };

  if (role === 'mj') {
    ship.visible = isVisible('ships', row.id, tableId, 'joueur');
  }

  return ship;
}

export function listShips(tableId, role) {
  const rows = db.prepare(
    `SELECT ${SHIP_SELECT}
     FROM ships s
     LEFT JOIN ship_models sm ON sm.id = s.model_id
     WHERE s.table_id = ? AND s.deleted_at IS NULL
     ORDER BY lower(s.nom) ASC`
  ).all(tableId);

  if (role === 'mj') {
    return rows.map(row => mapShipRow(row, tableId, role));
  }

  return rows
    .filter(row => isVisible('ships', row.id, tableId, 'joueur'))
    .map(row => mapShipRow(row, tableId, role));
}

export function getShipById(id, tableId, role) {
  const row = db.prepare(
    `SELECT ${SHIP_SELECT}
     FROM ships s
     LEFT JOIN ship_models sm ON sm.id = s.model_id
     WHERE s.id = ? AND s.table_id = ? AND s.deleted_at IS NULL`
  ).get(id, tableId);

  if (!row) return null;
  if (role !== 'mj' && !isVisible('ships', row.id, tableId, 'joueur')) return null;
  return mapShipRow(row, tableId, role);
}

export function createShip(tableId, payload) {
  const model = payload.model_id ? getModelDefaults(payload.model_id) : null;
  if (payload.model_id && !model) {
    return { error: 'Modèle de vaisseau introuvable' };
  }

  const ship = {
    id: randomUUID(),
    table_id: tableId,
    name: String(payload.name || '').trim(),
    model_id: payload.model_id || null,
    hull: payload.hull !== undefined ? toNumberOrDefault(payload.hull) : toNumberOrDefault(model?.coque, 0),
    crew: payload.crew !== undefined ? toNumberOrDefault(payload.crew) : toNumberOrDefault(model?.equipage, 0),
    cargo_capacity: payload.cargo_capacity !== undefined ? toNumberOrDefault(payload.cargo_capacity) : toNumberOrDefault(model?.soute, 0),
    notes: String(payload.notes || '').trim()
  };

  if (!ship.name) {
    return { error: 'Le champ "name" est requis' };
  }

  db.prepare(
    `INSERT INTO ships (id, table_id, nom, model_id, hull, crew, cargo_capacity, notes)
     VALUES (@id, @table_id, @name, @model_id, @hull, @crew, @cargo_capacity, @notes)`
  ).run(ship);

  return getShipById(ship.id, tableId, 'mj');
}

export function updateShip(id, tableId, payload) {
  const existing = getShipById(id, tableId, 'mj');
  if (!existing) return null;

  let modelDefaults = null;
  if (payload.model_id !== undefined && payload.model_id !== null && payload.model_id !== '') {
    modelDefaults = getModelDefaults(payload.model_id);
    if (!modelDefaults) return { error: 'Modèle de vaisseau introuvable' };
  }

  const nextName = payload.name !== undefined ? String(payload.name).trim() : existing.name;
  if (!nextName) return { error: 'Le champ "name" est requis' };

  const nextModelId = payload.model_id !== undefined
    ? (payload.model_id || null)
    : existing.model_id;

  const nextHull = payload.hull !== undefined
    ? toNumberOrDefault(payload.hull)
    : (modelDefaults ? toNumberOrDefault(modelDefaults.coque, existing.hull) : existing.hull);

  const nextCrew = payload.crew !== undefined
    ? toNumberOrDefault(payload.crew)
    : (modelDefaults ? toNumberOrDefault(modelDefaults.equipage, existing.crew) : existing.crew);

  const nextCargoCapacity = payload.cargo_capacity !== undefined
    ? toNumberOrDefault(payload.cargo_capacity)
    : (modelDefaults ? toNumberOrDefault(modelDefaults.soute, existing.cargo_capacity) : existing.cargo_capacity);

  const nextNotes = payload.notes !== undefined ? String(payload.notes || '').trim() : existing.notes;

  db.prepare(
    `UPDATE ships
     SET nom = ?, model_id = ?, hull = ?, crew = ?, cargo_capacity = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
  ).run(nextName, nextModelId, nextHull, nextCrew, nextCargoCapacity, nextNotes, id, tableId);

  return getShipById(id, tableId, 'mj');
}

export function softDeleteShip(id, tableId) {
  const result = db.prepare(
    `UPDATE ships
     SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
  ).run(id, tableId);

  return result.changes > 0;
}
