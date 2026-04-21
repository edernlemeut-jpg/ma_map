import { Router } from 'express';
import { forbidden, notFound, success, validationError } from '../utils/response.js';
import {
  createTravelRoute,
  deleteTravelRoute,
  getTravelRoute,
  listTravelRoutes,
  updateTravelRoute
} from '../services/travel-routes.js';
import {
  addManualRoutePeril,
  deleteRoutePeril,
  generateRoutePerils,
  listRoutePerils,
  updateRoutePeril
} from '../services/route-perils.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  success(res, listTravelRoutes(req.table.id));
});

router.get('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  const route = getTravelRoute(req.params.id, req.table.id);
  if (!route) return notFound(res, 'Itinéraire introuvable');
  success(res, route);
});

router.post('/', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object') return validationError(res, 'Corps de requête manquant');

  const result = createTravelRoute(req.table.id, req.body);
  if (result?.error) return validationError(res, result.error);
  success(res, result, 201);
});

router.patch('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }

  const result = updateTravelRoute(req.params.id, req.table.id, req.body);
  if (!result) return notFound(res, 'Itinéraire introuvable');
  if (result?.error) return validationError(res, result.error);
  success(res, result);
});

router.delete('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  const ok = deleteTravelRoute(req.params.id, req.table.id);
  if (!ok) return notFound(res, 'Itinéraire introuvable');
  success(res, { id: req.params.id, deleted: true });
});

router.post('/:id/perils/generate', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');

  const generated = generateRoutePerils(req.params.id, req.table.id, req.body || {});
  if (!generated) return notFound(res, 'Itinéraire introuvable');
  if (generated?.error) return validationError(res, generated.error);
  success(res, { route_id: req.params.id, perils: generated });
});

router.get('/:id/perils', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  const perils = listRoutePerils(req.params.id, req.table.id, req.table.role);
  if (!perils) return notFound(res, 'Itinéraire introuvable');
  success(res, perils);
});

router.post('/:id/perils', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object') return validationError(res, 'Corps de requête manquant');

  const peril = addManualRoutePeril(req.params.id, req.table.id, req.body);
  if (!peril) return notFound(res, 'Itinéraire introuvable');
  if (peril?.error) return validationError(res, peril.error);
  success(res, peril, 201);
});

router.patch('/:id/perils/:perilId', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object') return validationError(res, 'Corps de requête manquant');

  const updated = updateRoutePeril(req.params.id, req.params.perilId, req.table.id, req.body);
  if (!updated) return notFound(res, 'Péril introuvable');
  if (updated?.error) return validationError(res, updated.error);
  success(res, updated);
});

router.delete('/:id/perils/:perilId', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');

  const deleted = deleteRoutePeril(req.params.id, req.params.perilId, req.table.id);
  if (!deleted) return notFound(res, 'Péril introuvable');
  success(res, { id: Number(req.params.perilId), deleted: true });
});

export default router;