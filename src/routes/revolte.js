import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import * as rev from '../services/revolte.js';

const router = Router();

function getTableId(req) { return req.table?.id ?? null; }
function isMJOrAdmin(req) {
  if (!req.user) return false;
  if (req.user.is_admin) return true;
  return req.table?.role === 'mj';
}

// GET /api/revolte
router.get('/', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return success(res, []);
  const sessions = rev.listSessions(Number(tableId), { status: req.query.status });
  success(res, sessions);
});

// GET /api/revolte/:id
router.get('/:id', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return notFound(res);
  const session = rev.getSession(req.params.id, Number(tableId));
  if (!session) return notFound(res, 'Session de révolte introuvable');
  success(res, session);
});

// POST /api/revolte
router.post('/', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const session = rev.createSession(Number(tableId), req.user.id, req.body);
    success(res, session, 201);
  } catch (e) {
    validationError(res, e.message);
  }
});

// PATCH /api/revolte/:id
router.patch('/:id', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const session = rev.updateSession(req.params.id, Number(tableId), req.body);
    success(res, session);
  } catch (e) {
    if (e.status === 404) return notFound(res, e.message);
    validationError(res, e.message);
  }
});

// DELETE /api/revolte/:id
router.delete('/:id', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    rev.deleteSession(req.params.id, Number(tableId));
    success(res, { deleted: true });
  } catch (e) {
    if (e.status === 404) return notFound(res, e.message);
    validationError(res, e.message);
  }
});

export default router;
