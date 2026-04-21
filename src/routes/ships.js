import { Router } from 'express';
import { forbidden, notFound, success, validationError } from '../utils/response.js';
import { createShip, getShipById, listShips, softDeleteShip, updateShip } from '../services/ships.js';

const router = Router();

function validateNumericFields(body) {
  const numericFields = ['hull', 'crew', 'cargo_capacity'];
  for (const field of numericFields) {
    if (body[field] !== undefined && body[field] !== null && Number.isNaN(Number(body[field]))) {
      return `Le champ "${field}" doit être numérique`;
    }
  }
  return null;
}

router.get('/', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  success(res, listShips(req.table.id, req.table.role));
});

router.get('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  const ship = getShipById(req.params.id, req.table.id, req.table.role);
  if (!ship) return notFound(res, 'Vaisseau introuvable');
  success(res, ship);
});

router.post('/', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object') return validationError(res, 'Corps de requête manquant');

  const numericError = validateNumericFields(req.body);
  if (numericError) return validationError(res, numericError);

  const result = createShip(req.table.id, req.body);
  if (result?.error) return validationError(res, result.error);
  success(res, result, 201);
});

router.patch('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }

  const numericError = validateNumericFields(req.body);
  if (numericError) return validationError(res, numericError);

  const result = updateShip(req.params.id, req.table.id, req.body);
  if (!result) return notFound(res, 'Vaisseau introuvable');
  if (result?.error) return validationError(res, result.error);
  success(res, result);
});

router.delete('/:id', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  if (req.table.role !== 'mj') return forbidden(res, 'Accès MJ requis');
  const ok = softDeleteShip(req.params.id, req.table.id);
  if (!ok) return notFound(res, 'Vaisseau introuvable');
  success(res, { id: req.params.id, deleted: true });
});

export default router;