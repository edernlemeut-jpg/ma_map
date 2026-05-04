import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getSystems, createSystem, createSystemsBulk, updateSystem, deleteSystem } from '../services/compendium.js';

const router = Router();
const MAX_BULK = 500;

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

router.post('/bulk', (req, res) => {
  if (!req.table || req.table.role !== 'mj') {
    return forbidden(res);
  }
  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return validationError(res, 'Un tableau de systèmes non vide est requis');
  }
  if (items.length > MAX_BULK) {
    return validationError(res, `L'import est limité à ${MAX_BULK} systèmes à la fois`);
  }
  const JSON_FIELDS = ['soleil_json', 'corps_celestes_json', 'patrouilles_json'];
  const safeItems = [];
  for (const fields of items) {
    if (!fields.nom || !String(fields.nom).trim()) continue;
    if (!fields.quadrant || !String(fields.quadrant).trim()) continue;
    const safe = { ...fields };
    delete safe.id;
    delete safe.visible;
    for (const f of JSON_FIELDS) {
      if (safe[f] !== undefined && typeof safe[f] !== 'string') safe[f] = JSON.stringify(safe[f]);
    }
    safeItems.push(safe);
  }
  try {
    const results = createSystemsBulk(safeItems);
    success(res, results);
  } catch (err) {
    return validationError(res, err.message || 'Erreur lors de l\'import');
  }
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
