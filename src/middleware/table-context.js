import db from '../database.js';
import { forbidden } from '../utils/response.js';
import { touchMjActivity } from '../services/session.js';

export default function tableContextMiddleware(req, res, next) {
  const tableId = req.headers['x-table-id'];

  // No table selected — OK, some routes don't need it
  if (!tableId) {
    req.table = null;
    return next();
  }

  // No authenticated user (whitelisted routes pass through auth without req.user)
  if (!req.user) {
    req.table = null;
    return next();
  }

  const numericId = Number(tableId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    req.table = null;
    return next();
  }

  const member = db.prepare(
    'SELECT role FROM table_members WHERE table_id = ? AND user_id = ?'
  ).get(numericId, req.user.id);

  if (!member) {
    return forbidden(res, 'Pas membre de cette table');
  }

  req.table = {
    id: numericId,
    role: member.role
  };

  // Heartbeat for session-active timeout tracking.
  if (member.role === 'mj') {
    touchMjActivity(numericId);
  }

  next();
}
