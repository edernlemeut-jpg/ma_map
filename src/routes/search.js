import { Router } from 'express';
import { success, validationError } from '../utils/response.js';
import { searchEntities } from '../services/search.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }

  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return success(res, []);
  }

  const rawTypes = Array.isArray(req.query.types) ? req.query.types.join(',') : String(req.query.types || '');
  const types = rawTypes
    ? rawTypes.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  const data = searchEntities(q, types, req.table.id, req.table.role);
  success(res, data);
});

export default router;
