import { Router } from 'express';
import { success, forbidden, validationError } from '../utils/response.js';
import { getSyncPayload } from '../services/sync.js';

const router = Router();

/**
 * GET /sync — MJ-only preview payload as if role=joueur.
 */
router.get('/sync', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res, 'Accès réservé au MJ');
  }

  const payload = getSyncPayload(req.table.id, 'joueur');
  success(res, payload);
});

export default router;
