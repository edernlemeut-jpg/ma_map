import { Router } from 'express';
import { success, forbidden, validationError } from '../utils/response.js';
import { getVisibleIds } from '../services/visibility.js';
import { getSessionState, setSessionActive } from '../services/session.js';
import db from '../database.js';

const router = Router();

/**
 * GET / — Dashboard stats for MJ only.
 * Returns system counts, player counts, and recent visibility changes.
 */
router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res, 'Accès réservé au MJ');
  }

  const tableId = req.table.id;
  const sessionState = getSessionState(tableId);

  // Visible systems (to joueurs) and total
  const visibleIds = getVisibleIds('systems', tableId, 'joueur');
  const systemsVisible = visibleIds.length;
  const systemsTotal = db.prepare('SELECT COUNT(*) AS count FROM systems').get().count;

  // Player counts (joueurs only, exclude MJ)
  const playersTotal = db.prepare(
    "SELECT COUNT(*) AS count FROM table_members WHERE table_id = ? AND role = 'joueur'"
  ).get(tableId).count;

  // Recent changes (visibility toggles in last 24h)
  // visibility_rules doesn't have updated_at — use systems.updated_at for system changes
  // and fall back to an empty list for non-system entities (MVP)
  const recentChanges = db.prepare(`
    SELECT
      'systems' AS entity_type,
      vr.entity_id,
      s.nom AS entity_name,
      CASE WHEN vr.visible = 1 THEN 'revealed' ELSE 'hidden' END AS action,
      s.updated_at,
      vr.visible
    FROM visibility_rules vr
    JOIN systems s ON s.id = vr.entity_id
    WHERE vr.table_id = ?
      AND vr.entity_type = 'systems'
      AND s.updated_at > datetime('now', '-24 hours')
    ORDER BY s.updated_at DESC
    LIMIT 10
  `).all(tableId);

  // Distinct quadrant names for bulk reveal UI
  const quadrants = db.prepare(
    'SELECT DISTINCT quadrant FROM systems WHERE quadrant IS NOT NULL ORDER BY quadrant'
  ).all().map(r => r.quadrant);

  success(res, {
    stats: {
      systems_visible: systemsVisible,
      systems_total: systemsTotal,
      players_total: playersTotal
    },
    session_active: !!sessionState.sessionActive,
    recent_changes: recentChanges,
    quadrants
  });
});

/**
 * PATCH /session-active — Toggle session active flag (MJ only)
 * Body: { active: boolean }
 */
router.patch('/session-active', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  if (req.table.role !== 'mj') {
    return forbidden(res, 'Accès réservé au MJ');
  }
  if (!req.body || typeof req.body !== 'object') {
    return validationError(res, 'Corps de requête manquant');
  }

  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return validationError(res, 'Le champ "active" doit être un booléen');
  }

  const state = setSessionActive(req.table.id, active);
  success(res, {
    session_active: !!state.sessionActive,
    timed_out: !!state.timedOut
  });
});

export default router;
