import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import * as rev from '../services/revolte.js';
import * as cal from '../services/calendar.js';

const router = Router();

function getTableId(req) { return req.table?.id ?? null; }
function isMJOrAdmin(req) {
  if (!req.user) return false;
  if (req.user.is_admin) return true;
  return req.table?.role === 'mj';
}

// GET /api/revolte?status=&parent_id=  (parent_id=null → racines uniquement)
router.get('/', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const tableId = getTableId(req);
  if (!tableId) return success(res, []);
  const opts = { status: req.query.status };
  if ('parent_id' in req.query) {
    opts.parentId = req.query.parent_id === 'null' || req.query.parent_id === '' ? null : req.query.parent_id;
  }
  const sessions = rev.listSessions(Number(tableId), opts);
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

// POST /api/revolte/:id/calendar-event
// Crée un événement de calendrier lié à cette révolte. Le frontend appelle cet
// endpoint pour notifier le calendrier d'un jet de tentative ou d'un événement
// significatif (Appel réussi, Police déclenchée, mois passé sans résultat...).
router.post('/:id/calendar-event', (req, res) => {
  if (!isMJOrAdmin(req)) return forbidden(res);
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table active');
  const session = rev.getSession(req.params.id, Number(tableId));
  if (!session) return notFound(res, 'Session de révolte introuvable');
  const { title, description, date_start, date_end, galactic_year, color, is_public } = req.body || {};
  if (!title || !date_start || !galactic_year) {
    return validationError(res, 'title, date_start et galactic_year sont requis');
  }
  try {
    const evt = cal.createEvent(
      Number(tableId),
      req.user.id,
      {
        title: String(title).slice(0, 200),
        description: (description ? `${description}\n\n— ` : '') + `Révolte : ${session.name}`,
        category_id: null,
        color: color || '#c89c3a',
        date_start,
        date_end: date_end || date_start,
        galactic_year: Number(galactic_year),
        is_public: is_public === true || is_public === 1 ? 1 : 0,
      },
      true, // isMJ déjà vérifié
      req.user.username || ''
    );
    success(res, evt, 201);
  } catch (e) {
    validationError(res, e.message);
  }
});

export default router;
