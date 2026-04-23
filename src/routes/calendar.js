import { Router } from 'express';
import { success, validationError, forbidden, notFound, error } from '../utils/response.js';
import * as cal from '../services/calendar.js';

const router = Router();

/** Helper: resolve tableId from request context (set by table-context middleware) */
function getTableId(req) {
  return req.table?.id ?? null;
}

/** Helper: is the requesting user MJ or admin for the active table */
function isMJOrAdmin(req) {
  if (!req.user) return false;
  if (req.user.is_admin) return true;
  return req.table?.role === 'mj';
}

// ── Campaign date ─────────────────────────────────────────────────────────────
// GET /api/calendar/state
router.get('/state', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return success(res, { date: '0101.01', year: 50429 });
  const state = cal.getCampaignDate(Number(tableId));
  success(res, state || { date: '0101.01', year: 50429 });
});

// PUT /api/calendar/state
router.put('/state', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const result = cal.setCampaignDate(Number(tableId), req.body.date, req.body.year);
    success(res, result);
  } catch (e) {
    validationError(res, e.message);
  }
});

// ── Categories ────────────────────────────────────────────────────────────────
// GET /api/calendar/categories
router.get('/categories', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return success(res, []);
  success(res, cal.getCategories(Number(tableId)));
});

// POST /api/calendar/categories
router.post('/categories', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const cat = cal.createCategory(Number(tableId), req.body.name, req.body.color);
    success(res, cat, 201);
  } catch (e) {
    validationError(res, e.message);
  }
});

// DELETE /api/calendar/categories/:id
router.delete('/categories/:id', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    cal.deleteCategory(Number(req.params.id), Number(tableId));
    success(res, { ok: true });
  } catch (e) {
    if (e.status === 404) return notFound(res, e.message);
    if (e.status === 403) return forbidden(res, e.message);
    error(res, { code: 'SERVER_ERROR', message: e.message });
  }
});

// ── Events ────────────────────────────────────────────────────────────────────
// GET /api/calendar/events?year=50429
router.get('/events', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return success(res, []);
  const year = Number(req.query.year) || 50429;
  const mj = isMJOrAdmin(req);
  success(res, cal.getEvents(Number(tableId), year, mj));
});

// POST /api/calendar/events
router.post('/events', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const ev = cal.createEvent(Number(tableId), req.user.id, req.body);
    success(res, ev, 201);
  } catch (e) {
    validationError(res, e.message);
  }
});

// PUT /api/calendar/events/:id
router.put('/events/:id', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    const ev = cal.updateEvent(req.params.id, Number(tableId), req.body);
    success(res, ev);
  } catch (e) {
    if (e.status === 404) return notFound(res, e.message);
    validationError(res, e.message);
  }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  try {
    cal.deleteEvent(req.params.id, Number(tableId));
    success(res, { ok: true });
  } catch (e) {
    if (e.status === 404) return notFound(res, e.message);
    error(res, { code: 'SERVER_ERROR', message: e.message });
  }
});

export default router;
