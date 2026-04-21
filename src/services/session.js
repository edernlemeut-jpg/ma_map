import db from '../database.js';

const SESSION_TIMEOUT_MINUTES = 30;

function normalizeSessionRow(row) {
  return {
    active: !!row?.session_active,
    lastActivity: row?.session_last_activity || null
  };
}

/**
 * Return current session state for a table and auto-disable if stale.
 */
export function getSessionState(tableId) {
  const row = db.prepare(
    'SELECT session_active, session_last_activity FROM game_tables WHERE id = ?'
  ).get(tableId);

  const state = normalizeSessionRow(row);
  if (!state.active) {
    return { sessionActive: false, timedOut: false, lastActivity: state.lastActivity };
  }

  const stillActive = db.prepare(
    `SELECT CASE
      WHEN session_last_activity IS NULL THEN 0
      WHEN datetime(session_last_activity) > datetime('now', '-${SESSION_TIMEOUT_MINUTES} minutes') THEN 1
      ELSE 0
    END AS active
    FROM game_tables
    WHERE id = ?`
  ).get(tableId).active === 1;

  if (stillActive) {
    return { sessionActive: true, timedOut: false, lastActivity: state.lastActivity };
  }

  db.prepare('UPDATE game_tables SET session_active = 0 WHERE id = ?').run(tableId);
  return { sessionActive: false, timedOut: true, lastActivity: state.lastActivity };
}

/**
 * Toggle session-active mode for a table.
 */
export function setSessionActive(tableId, active) {
  const activeInt = active ? 1 : 0;
  if (activeInt) {
    db.prepare(
      "UPDATE game_tables SET session_active = 1, session_last_activity = datetime('now') WHERE id = ?"
    ).run(tableId);
  } else {
    db.prepare('UPDATE game_tables SET session_active = 0 WHERE id = ?').run(tableId);
  }

  return getSessionState(tableId);
}

/**
 * Heartbeat: mark MJ activity timestamp.
 */
export function touchMjActivity(tableId) {
  db.prepare("UPDATE game_tables SET session_last_activity = datetime('now') WHERE id = ?").run(tableId);
}
