import { Router } from 'express';
import { toggleVisibility, bulkVisibility } from '../services/visibility.js';
import { success, forbidden, validationError } from '../utils/response.js';

const router = Router();

const VALID_ENTITY_TYPES = ['systems', 'factions', 'ship_models', 'ships', 'npcs', 'quadrants', 'travel_routes', 'route_perils', 'secondary_systems'];
// Entity types that support bulk operations
const BULK_ENTITY_TYPES = ['systems', 'factions', 'ship_models', 'secondary_systems'];

/**
 * POST /bulk — Bulk set visibility for all entities of a type (MJ only)
 * Body: { entityType, filter: { quadrant? }, visible }
 */
router.post('/bulk', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res, 'Accès MJ requis');
  }

  if (!req.body || typeof req.body !== 'object') {
    return validationError(res, 'Corps de requête manquant');
  }

  const { entityType, filter, visible } = req.body;

  if (!BULK_ENTITY_TYPES.includes(entityType)) {
    return validationError(res, `Type d'entité invalide pour bulk : ${entityType}`);
  }
  if (typeof visible !== 'boolean') {
    return validationError(res, 'Le champ "visible" doit être un booléen');
  }

  const safeFilter = (filter && typeof filter === 'object') ? filter : {};

  const result = bulkVisibility(entityType, safeFilter, req.table.id, visible);
  success(res, result);
});

/**
 * PATCH /:entityType/:entityId — Toggle visibility (MJ only)
 */
router.patch('/:entityType/:entityId', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res, 'Accès MJ requis');
  }

  const { entityType, entityId } = req.params;

  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return validationError(res, `Type d'entité invalide : ${entityType}`);
  }

  if (!req.body || typeof req.body !== 'object') {
    return validationError(res, 'Corps de requête manquant');
  }

  const { visible } = req.body;
  if (typeof visible !== 'boolean') {
    return validationError(res, 'Le champ "visible" doit être un booléen');
  }

  const result = toggleVisibility(entityType, entityId, req.table.id, visible);
  success(res, result);
});

export default router;
