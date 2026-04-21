import db from '../database.js';
import { isVisible } from './visibility.js';

const VALID_TYPES = ['systems', 'factions', 'ship_models'];

const SEARCH_CONFIG = {
  systems: {
    columns: ['nom', 'quadrant', 'faction', 'gouvernement', 'description'],
    select: 'id, quadrant, nom, faction, is_frontiere, route, gouvernement, description'
  },
  factions: {
    columns: ['name', 'short', 'description'],
    select: 'id, name, short, description, icon, color'
  },
  ship_models: {
    columns: ['nom', 'classe', 'origine'],
    select: 'id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json'
  }
};

function escapeLike(str) {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function searchEntities(query, types, tableId, role) {
  if (!query || query.length < 2) return [];

  const requestedTypes = (types && types.length > 0)
    ? types.filter(t => VALID_TYPES.includes(t))
    : [...VALID_TYPES];

  if (requestedTypes.length === 0) return [];

  const pattern = `%${escapeLike(query)}%`;
  const results = [];

  for (const type of requestedTypes) {
    const config = SEARCH_CONFIG[type];
    const whereClauses = config.columns.map(col => `${col} LIKE ? ESCAPE '\\'`);
    const sql = `SELECT ${config.select} FROM ${type} WHERE ${whereClauses.join(' OR ')}`;
    const params = config.columns.map(() => pattern);
    const rows = db.prepare(sql).all(...params);

    for (const row of rows) {
      if (role === 'mj') {
        results.push({ type, ...row, visible: isVisible(type, row.id, tableId, 'joueur') });
      } else {
        if (isVisible(type, row.id, tableId, 'joueur')) {
          results.push({ type, ...row });
        }
      }
    }
  }

  return results;
}
