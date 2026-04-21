import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getFactions, updateFaction } from '../services/compendium.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const data = getFactions(req.table.id, req.table.role);
  success(res, data);
});

router.patch('/:id', (req, res) => {
  if (!req.table || req.table.role !== 'mj') {
    return forbidden(res);
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return notFound(res);
  }

  const fields = req.body;
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }

  if (fields.name !== undefined && (!fields.name || !String(fields.name).trim())) {
    return validationError(res, 'Le champ "name" ne peut pas être vide');
  }

  const result = updateFaction(id, fields);
  if (!result) return notFound(res);
  if (result.error) return validationError(res, result.error);
  success(res, result);
});

export default router;
