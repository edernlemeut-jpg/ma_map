import { Router } from 'express';
import { success, validationError, forbidden, notFound, error } from '../utils/response.js';
import { createLink, getLinks, deleteLink } from '../services/entity-links.js';

const router = Router();

// GET /api/entity-links?source_type=X&source_id=Y  (auth + table requis)
router.get('/', (req, res) => {
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');

  const { source_type, source_id, target_type, target_id } = req.query;
  const filters = {};
  if (source_type !== undefined) filters.source_type = source_type;
  if (source_id !== undefined)   filters.source_id = source_id;
  if (target_type !== undefined) filters.target_type = target_type;
  if (target_id !== undefined)   filters.target_id = target_id;

  const links = getLinks(req.table.id, filters, req.table.role);
  return success(res, links);
});

// POST /api/entity-links  (MJ requis)
router.post('/', (req, res) => {
  if (!req.table || req.table.role !== 'mj') return forbidden(res);

  const { source_type, source_id, target_type, target_id, relation_type, notes } = req.body;

  if (source_id === undefined || source_id === null) return validationError(res, 'source_id est requis');
  if (target_id === undefined || target_id === null) return validationError(res, 'target_id est requis');

  try {
    const link = createLink(req.table.id, { source_type, source_id, target_type, target_id, relation_type, notes });
    return success(res, link, 201);
  } catch (err) {
    if (err && err.code === 'INVALID_ENTITY_TYPE') {
      return error(res, { code: 'INVALID_ENTITY_TYPE', message: err.message, status: 400 });
    }
    return error(res, { code: 'SERVER_ERROR', message: 'Erreur interne', status: 500 });
  }
});

// DELETE /api/entity-links/:id  (MJ requis)
router.delete('/:id', (req, res) => {
  if (!req.table || req.table.role !== 'mj') return forbidden(res);

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);

  const result = deleteLink(req.table.id, id);
  if (result === null) return notFound(res);
  if (result === 'forbidden') return forbidden(res);

  return res.status(204).end();
});

export default router;
