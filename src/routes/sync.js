import { Router } from 'express';
import { success, validationError } from '../utils/response.js';
import { getSyncPayload } from '../services/sync.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }

  const payload = getSyncPayload(req.table.id, req.table.role);
  success(res, payload);
});

export default router;
