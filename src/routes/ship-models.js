import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getShipModels, updateShipModel } from '../services/compendium.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const data = getShipModels(req.table.id, req.table.role);
  success(res, data);
});

router.patch('/:id', (req, res) => {
  if (!req.table || req.table.role !== 'mj') {
    return forbidden(res);
  }

  const id = req.params.id; // ship_models.id is TEXT

  const fields = req.body;
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }

  if (fields.nom !== undefined && (!fields.nom || !String(fields.nom).trim())) {
    return validationError(res, 'Le champ "nom" ne peut pas être vide');
  }

  const numericFields = ['prix', 'blindage', 'coque', 'vitesse_croisiere', 'vitesse_hyperspatiale', 'autonomie', 'soute'];
  for (const f of numericFields) {
    if (fields[f] !== undefined && fields[f] !== null && isNaN(Number(fields[f]))) {
      return validationError(res, `Le champ "${f}" doit être numérique`);
    }
  }

  const result = updateShipModel(id, fields);
  if (!result) return notFound(res);
  if (result.error) return validationError(res, result.error);
  success(res, result);
});

export default router;
