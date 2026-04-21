/**
 * Compendium service — universe data filtered by visibility.
 * Systems, factions, and ship_models are global (no table_id column).
 * Filtering is done in-memory via the visibility service.
 */
import db from '../database.js';
import { isVisible } from './visibility.js';

const SYSTEMS_COLS = 'id, quadrant, nom, faction, is_frontiere, route, gouvernement, description';
const FACTIONS_COLS = 'id, name, short, description, icon, color';
const SHIP_MODELS_COLS = 'id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json';

export function getSystems(tableId, role) {
  const all = db.prepare(`SELECT ${SYSTEMS_COLS} FROM systems`).all();

  if (role === 'mj') {
    return all.map(s => ({ ...s, visible: isVisible('systems', s.id, tableId, 'joueur') }));
  }

  return all.filter(s => isVisible('systems', s.id, tableId, 'joueur'));
}

export function getFactions(tableId, role) {
  const all = db.prepare(`SELECT ${FACTIONS_COLS} FROM factions`).all();

  if (role === 'mj') {
    return all.map(f => ({ ...f, visible: isVisible('factions', f.id, tableId, 'joueur') }));
  }

  return all.filter(f => isVisible('factions', f.id, tableId, 'joueur'));
}

export function getShipModels(tableId, role) {
  const all = db.prepare(`SELECT ${SHIP_MODELS_COLS} FROM ship_models`).all();

  if (role === 'mj') {
    return all.map(m => ({ ...m, visible: isVisible('ship_models', m.id, tableId, 'joueur') }));
  }

  return all.filter(m => isVisible('ship_models', m.id, tableId, 'joueur'));
}

// --- Edit functions (MJ only) ---

const SYSTEM_EDITABLE = ['nom', 'quadrant', 'faction', 'is_frontiere', 'route', 'gouvernement', 'description'];
const FACTION_EDITABLE = ['name', 'short', 'description', 'icon', 'color'];
const SHIP_MODEL_EDITABLE = ['nom', 'classe', 'origine', 'vitesse_croisiere', 'vitesse_hyperspatiale', 'autonomie', 'manoeuvrabilite', 'vitesse_tactique', 'blindage', 'coque', 'senseurs', 'equipage', 'passagers', 'soute', 'prix', 'image'];

function applyUpdate(table, selectCols, allowedFields, id, fields, hasUpdatedAt = true) {
  const entries = Object.entries(fields).filter(([k]) => allowedFields.includes(k));
  if (entries.length === 0) return { error: 'Aucun champ valide à mettre à jour' };

  const setClauses = entries.map(([k]) => `${k} = ?`);
  if (hasUpdatedAt) setClauses.push("updated_at = datetime('now')");
  const values = entries.map(([, v]) => v);
  values.push(id);

  try {
    db.prepare(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return { error: 'Une entrée avec ces valeurs existe déjà' };
    }
    throw err;
  }
  return db.prepare(`SELECT ${selectCols} FROM ${table} WHERE id = ?`).get(id);
}

export function getSystem(id) {
  return db.prepare(`SELECT ${SYSTEMS_COLS} FROM systems WHERE id = ?`).get(id);
}

export function getFaction(id) {
  return db.prepare(`SELECT ${FACTIONS_COLS} FROM factions WHERE id = ?`).get(id);
}

export function getShipModel(id) {
  return db.prepare(`SELECT ${SHIP_MODELS_COLS} FROM ship_models WHERE id = ?`).get(id);
}

export function updateSystem(id, fields) {
  if (!getSystem(id)) return null;
  return applyUpdate('systems', SYSTEMS_COLS, SYSTEM_EDITABLE, id, fields);
}

export function updateFaction(id, fields) {
  if (!getFaction(id)) return null;
  return applyUpdate('factions', FACTIONS_COLS, FACTION_EDITABLE, id, fields);
}

export function updateShipModel(id, fields) {
  if (!getShipModel(id)) return null;
  return applyUpdate('ship_models', SHIP_MODELS_COLS, SHIP_MODEL_EDITABLE, id, fields, false);
}
