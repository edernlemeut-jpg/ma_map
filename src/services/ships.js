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
  s.image,
  s.ship_stats_json,
  s.position_json,
  s.owner_character_id,
  s.created_at,
  s.updated_at,
  chr.name AS owner_name,
  sm.nom AS model_name,
  sm.classe AS model_classe,
  sm.origine AS model_origine,
  sm.image AS model_image,
  sm.tonnage AS model_tonnage,
  sm.longueur AS model_longueur,
  sm.blindage AS model_blindage,
  sm.coque AS model_coque,
  sm.equipage AS model_equipage,
  sm.passagers AS model_passagers,
  sm.soute AS model_soute,
  sm.vitesse_croisiere AS model_vitesse_croisiere,
  sm.vitesse_hyperspatiale AS model_vitesse_hyperspatiale,
  sm.vitesse_tactique AS model_vitesse_tactique,
  sm.autonomie AS model_autonomie,
  sm.manoeuvrabilite AS model_manoeuvrabilite,
  sm.senseurs_k AS model_senseurs_k,
  sm.senseurs_us AS model_senseurs_us,
  sm.prix AS model_prix
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

  // Parse per-ship stat overrides
  let statsOverride = {};
  try { statsOverride = JSON.parse(row.ship_stats_json || 'null') || {}; } catch { statsOverride = {}; }

  const ship = {
    id: row.id,
    table_id: row.table_id,
    name: row.name,
    model_id: row.model_id,
    model_name: row.model_name || null,
    image: row.image || null,
    hull: Number(row.hull || 0),
    crew: Number(row.crew || 0),
    cargo_capacity: Number(row.cargo_capacity || 0),
    notes: row.notes || '',
    ship_stats_json: row.ship_stats_json || null,
    position: (() => { try { return JSON.parse(row.position_json || 'null'); } catch { return null; } })(),
    owner_character_id: row.owner_character_id || null,
    owner_name: row.owner_name || null,
    // Full model data for fleet card display, merged with per-ship overrides
    model: row.model_id ? {
      nom: row.model_name || null,
      classe: statsOverride.classe ?? row.model_classe ?? null,
      origine: statsOverride.origine ?? row.model_origine ?? null,
      image: row.model_image || null,
      tonnage: statsOverride.tonnage ?? row.model_tonnage ?? null,
      longueur: statsOverride.longueur ?? row.model_longueur ?? null,
      blindage: statsOverride.blindage ?? row.model_blindage ?? null,
      coque: statsOverride.coque ?? row.model_coque ?? null,
      equipage: statsOverride.equipage ?? row.model_equipage ?? null,
      passagers: statsOverride.passagers ?? row.model_passagers ?? null,
      soute: statsOverride.soute ?? row.model_soute ?? null,
      vitesse_croisiere: statsOverride.vitesse_croisiere ?? row.model_vitesse_croisiere ?? null,
      vitesse_hyperspatiale: statsOverride.vitesse_hyperspatiale ?? row.model_vitesse_hyperspatiale ?? null,
      vitesse_tactique: statsOverride.vitesse_tactique ?? row.model_vitesse_tactique ?? null,
      autonomie: statsOverride.autonomie ?? row.model_autonomie ?? null,
      manoeuvrabilite: statsOverride.manoeuvrabilite ?? row.model_manoeuvrabilite ?? null,
      senseurs_k: statsOverride.senseurs_k ?? row.model_senseurs_k ?? null,
      senseurs_us: statsOverride.senseurs_us ?? row.model_senseurs_us ?? null,
      prix: statsOverride.prix ?? row.model_prix ?? null,
      armement_json: statsOverride.armement_json ?? null,
      description: statsOverride.description ?? null,
    } : statsOverride.classe ? {
      // No model but has overrides (ship built from scratch)
      nom: null, ...statsOverride
    } : null,
    // Expose raw overrides for edit modal pre-fill
    statsOverride
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
     LEFT JOIN characters chr ON chr.id = s.owner_character_id
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
     LEFT JOIN characters chr ON chr.id = s.owner_character_id
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

  // Collect stat overrides (everything beyond the base ship fields)
  const statsOverride = extractStatsOverride(payload);

  const ship = {
    id: randomUUID(),
    table_id: tableId,
    name: String(payload.name || '').trim(),
    model_id: payload.model_id || null,
    hull: payload.hull !== undefined ? toNumberOrDefault(payload.hull) : toNumberOrDefault(model?.coque, 0),
    crew: payload.crew !== undefined ? toNumberOrDefault(payload.crew) : toNumberOrDefault(model?.equipage, 0),
    cargo_capacity: payload.cargo_capacity !== undefined ? toNumberOrDefault(payload.cargo_capacity) : toNumberOrDefault(model?.soute, 0),
    notes: String(payload.notes || '').trim(),
    image: payload.image !== undefined ? (payload.image || null) : null,
    ship_stats_json: Object.keys(statsOverride).length ? JSON.stringify(statsOverride) : null,
    position_json: payload.position_json !== undefined ? (payload.position_json || null) : null,
  };

  if (!ship.name) {
    return { error: 'Le champ "name" est requis' };
  }

  db.prepare(
    `INSERT INTO ships (id, table_id, nom, model_id, hull, crew, cargo_capacity, notes, image, ship_stats_json, position_json)
     VALUES (@id, @table_id, @name, @model_id, @hull, @crew, @cargo_capacity, @notes, @image, @ship_stats_json, @position_json)`
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
  const nextImage = payload.image !== undefined ? (payload.image || null) : existing.image;
  const nextPositionJson = payload.position_json !== undefined ? (payload.position_json || null) : (existing.position ? JSON.stringify(existing.position) : null);
  const nextOwnerCharacterId = 'owner_character_id' in payload ? (payload.owner_character_id || null) : existing.owner_character_id;

  // Merge stat overrides with existing
  const newOverrides = extractStatsOverride(payload);
  const existingOverrides = existing.statsOverride || {};
  const mergedOverrides = { ...existingOverrides, ...newOverrides };
  const nextStatsJson = Object.keys(mergedOverrides).length ? JSON.stringify(mergedOverrides) : null;

  db.prepare(
    `UPDATE ships
     SET nom = ?, model_id = ?, hull = ?, crew = ?, cargo_capacity = ?, notes = ?, image = ?, ship_stats_json = ?, position_json = ?, owner_character_id = ?, updated_at = datetime('now')
     WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
  ).run(nextName, nextModelId, nextHull, nextCrew, nextCargoCapacity, nextNotes, nextImage, nextStatsJson, nextPositionJson, nextOwnerCharacterId, id, tableId);

  return getShipById(id, tableId, 'mj');
}

// Extract overridable stat fields from a payload
function extractStatsOverride(payload) {
  const OVERRIDE_FIELDS = ['classe', 'origine', 'tonnage', 'longueur', 'blindage', 'coque',
    'vitesse_croisiere', 'vitesse_hyperspatiale', 'vitesse_tactique', 'autonomie',
    'manoeuvrabilite', 'senseurs_k', 'senseurs_us', 'passagers', 'soute',
    'armement_json', 'description', 'prix'];
  const result = {};
  for (const key of OVERRIDE_FIELDS) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      result[key] = payload[key];
    }
  }
  return result;
}

export function softDeleteShip(id, tableId) {
  const result = db.prepare(
    `UPDATE ships
     SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
  ).run(id, tableId);

  return result.changes > 0;
}
