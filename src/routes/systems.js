import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getSystems, createSystem, updateSystem, deleteSystem } from '../services/compendium.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const data = getSystems(req.table.id, req.table.role);
  success(res, data);
});

router.post('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }

  const fields = req.body;
  if (!fields || typeof fields !== 'object') {
    return validationError(res, 'Données invalides');
  }

  if (!fields.nom || !String(fields.nom).trim()) {
    return validationError(res, 'Le nom du système est requis');
  }

  if (!fields.quadrant || !String(fields.quadrant).trim()) {
    return validationError(res, 'Le quadrant est requis');
  }

  const result = createSystem(fields);
  if (!result) return validationError(res, 'Erreur lors de la création');
  success(res, result);
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

  if (fields.nom !== undefined && (!fields.nom || !String(fields.nom).trim())) {
    return validationError(res, 'Le champ "nom" ne peut pas être vide');
  }

  const result = updateSystem(id, fields);
  if (!result) return notFound(res);
  if (result.error) return validationError(res, result.error);
  success(res, result);
});

router.delete('/:id', (req, res) => {
  if (!req.table || req.table.role !== 'mj') {
    return forbidden(res);
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return notFound(res);
  }
  const result = deleteSystem(id);
  if (!result) return notFound(res);
  success(res, result);
});

export default router;
