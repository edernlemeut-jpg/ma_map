import { Router } from 'express';
import { success, validationError, forbidden } from '../utils/response.js';
import { requireAdmin } from '../middleware/auth.js';
import { runImport } from '../services/import.js';

const router = Router();

router.post('/import', requireAdmin, async (req, res) => {
  const data = req.body;
  if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
    return validationError(res, 'Corps JSON invalide');
  }

  try {
    const report = await runImport(data);
    success(res, report);
  } catch (err) {
    console.error('Import error:', err);
    validationError(res, 'Erreur lors de l\'import');
  }
});

export default router;
