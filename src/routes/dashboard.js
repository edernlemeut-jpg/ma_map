import { Router } from 'express';
import { success, validationError, forbidden } from '../utils/response.js';
import db from '../database.js';

const router = Router();

/**
 * GET /api/dashboard
 * MJ only. Returns stats (systems_visible, systems_total, players_total)
 * and recent_changes (last 10 visibility mutations for this table).
 */
router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res);
  }

  const tableId = req.table.id;

  const systems_total = db.prepare('SELECT COUNT(*) AS c FROM systems').get().c;
  const systems_visible = db.prepare(
    `SELECT COUNT(*) AS c FROM visibility_rules
     WHERE table_id = ? AND entity_type = 'systems' AND visible = 1`
  ).get(tableId).c;

  const players_total = db.prepare(
    `SELECT COUNT(*) AS c FROM table_members
     WHERE table_id = ? AND role = 'joueur'`
  ).get(tableId).c;

  const recent_changes = db.prepare(
    `SELECT entity_type, entity_id, visible
     FROM visibility_rules
     WHERE table_id = ?
     ORDER BY rowid DESC
     LIMIT 10`
  ).all(tableId);

  success(res, {
    stats: { systems_total, systems_visible, players_total },
    recent_changes
  });
});

export default router;
