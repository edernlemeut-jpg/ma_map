const router = require('express').Router();
const { getDB, getQuadrantsMap, systemObjToRow, shipRowToObj, shipObjToRow, shipModelRowToObj, shipModelObjToRow, safeJSON } = require('../database');
const { requireAuth, requireMJ, requireTableAccess } = require('../auth');

// ═══════════════════════════════════════════
// BACKUP / RESTORE / RESET
// ═══════════════════════════════════════════

// GET /api/backup/full — Export complet de la BDD (MJ only)
router.get('/full', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const backup = {
    _meta: { version: 1, date: new Date().toISOString(), type: 'full' },
    systems: d.prepare('SELECT * FROM systems ORDER BY quadrant, id').all(),
    factions: d.prepare('SELECT * FROM factions ORDER BY name').all(),
    shipModels: d.prepare('SELECT * FROM ship_models ORDER BY nom').all(),
    users: d.prepare('SELECT id, username, display_name, role, created_at FROM users').all(),
    gameTables: d.prepare('SELECT * FROM game_tables').all(),
    tableMembers: d.prepare('SELECT * FROM table_members').all(),
    tableState: d.prepare('SELECT * FROM table_state').all(),
    ships: d.prepare('SELECT * FROM ships').all(),
    perilData: d.prepare('SELECT * FROM peril_data').all(),
    customPerilTables: d.prepare('SELECT * FROM custom_peril_tables').all(),
    perilAssignments: d.prepare('SELECT * FROM peril_assignments').all(),
    tripHistory: d.prepare('SELECT * FROM trip_history').all(),
    visibilityRules: d.prepare('SELECT * FROM visibility_rules').all()
  };
  res.setHeader('Content-Disposition', `attachment; filename="ma-backup-full-${Date.now()}.json"`);
  res.json(backup);
});

// GET /api/backup/table/:tid — Export d'une table de jeu
router.get('/table/:tid', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const tid = req.tableId;
  const t = d.prepare('SELECT * FROM game_tables WHERE id = ?').get(tid);
  const backup = {
    _meta: { version: 1, date: new Date().toISOString(), type: 'table', tableName: t.name },
    // Données globales (incluses pour portabilité)
    systems: d.prepare('SELECT * FROM systems ORDER BY quadrant, id').all(),
    factions: d.prepare('SELECT * FROM factions ORDER BY name').all(),
    shipModels: d.prepare('SELECT * FROM ship_models ORDER BY nom').all(),
    perilData: d.prepare('SELECT * FROM peril_data').all(),
    // Données spécifiques à la table
    tableState: d.prepare('SELECT * FROM table_state WHERE table_id = ?').get(tid),
    ships: d.prepare('SELECT * FROM ships WHERE table_id = ?').all(tid),
    customPerilTables: d.prepare('SELECT * FROM custom_peril_tables WHERE table_id = ?').all(tid),
    perilAssignments: d.prepare('SELECT * FROM peril_assignments WHERE table_id = ?').all(tid),
    tripHistory: d.prepare('SELECT * FROM trip_history WHERE table_id = ?').all(tid),
    visibilityRules: d.prepare('SELECT * FROM visibility_rules WHERE table_id = ?').all(tid)
  };
  res.setHeader('Content-Disposition', `attachment; filename="ma-backup-table-${t.name.replace(/\s+/g,'-')}-${Date.now()}.json"`);
  res.json(backup);
});

// POST /api/backup/restore-full — Restaurer un backup complet (MJ only, ÉCRASE tout)
router.post('/restore-full', requireAuth, requireMJ, (req, res) => {
  const data = req.body;
  if (!data?._meta || data._meta.type !== 'full') return res.status(400).json({ error: 'Format de backup invalide' });

  const d = getDB();
  const tx = d.transaction(() => {
    // Vider les tables dans l'ordre (foreign keys)
    d.exec('DELETE FROM visibility_rules; DELETE FROM trip_history; DELETE FROM peril_assignments; DELETE FROM custom_peril_tables;');
    d.exec('DELETE FROM ships; DELETE FROM table_state; DELETE FROM table_members; DELETE FROM game_tables;');
    d.exec('DELETE FROM peril_data; DELETE FROM ship_models; DELETE FROM factions; DELETE FROM systems;');

    // Restaurer dans l'ordre
    _bulkInsert(d, 'systems', data.systems || []);
    _bulkInsert(d, 'factions', data.factions || []);
    _bulkInsert(d, 'ship_models', data.shipModels || []);
    _bulkInsert(d, 'peril_data', data.perilData || []);
    _bulkInsert(d, 'game_tables', data.gameTables || []);
    _bulkInsert(d, 'table_members', data.tableMembers || []);
    _bulkInsert(d, 'table_state', data.tableState || []);
    _bulkInsert(d, 'ships', data.ships || []);
    _bulkInsert(d, 'custom_peril_tables', data.customPerilTables || []);
    _bulkInsert(d, 'peril_assignments', data.perilAssignments || []);
    _bulkInsert(d, 'trip_history', data.tripHistory || []);
    _bulkInsert(d, 'visibility_rules', data.visibilityRules || []);
  });
  tx();
  res.json({ ok: true, message: 'Backup restauré' });
});

// POST /api/backup/restore-table/:tid — Restaurer les données d'une table
router.post('/restore-table/:tid', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const data = req.body;
  if (!data?._meta || data._meta.type !== 'table') return res.status(400).json({ error: 'Format de backup invalide' });

  const d = getDB();
  const tid = req.tableId;
  const tx = d.transaction(() => {
    // Vider les données de cette table
    d.prepare('DELETE FROM visibility_rules WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM trip_history WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM peril_assignments WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM custom_peril_tables WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM ships WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM table_state WHERE table_id = ?').run(tid);

    // Restaurer les données de la table avec le bon table_id
    if (data.tableState) {
      const ts = Array.isArray(data.tableState) ? data.tableState[0] : data.tableState;
      if (ts) d.prepare('INSERT INTO table_state (table_id, active_ship_id) VALUES (?, ?)').run(tid, ts.active_ship_id || '');
    }
    (data.ships || []).forEach(s => { s.table_id = tid; });
    _bulkInsert(d, 'ships', data.ships || []);
    (data.customPerilTables || []).forEach(s => { s.table_id = tid; });
    _bulkInsert(d, 'custom_peril_tables', data.customPerilTables || []);
    (data.perilAssignments || []).forEach(s => { s.table_id = tid; });
    _bulkInsert(d, 'peril_assignments', data.perilAssignments || []);
    (data.tripHistory || []).forEach(s => { s.table_id = tid; });
    _bulkInsert(d, 'trip_history', data.tripHistory || []);
    (data.visibilityRules || []).forEach(s => { s.table_id = tid; });
    _bulkInsert(d, 'visibility_rules', data.visibilityRules || []);
  });
  tx();
  res.json({ ok: true, message: 'Données de la table restaurées' });
});

// POST /api/backup/reset-table/:tid — Réinitialiser une table (supprime toutes ses données)
router.post('/reset-table/:tid', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const tid = req.tableId;
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM visibility_rules WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM trip_history WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM peril_assignments WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM custom_peril_tables WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM ships WHERE table_id = ?').run(tid);
    d.prepare("UPDATE table_state SET active_ship_id = '' WHERE table_id = ?").run(tid);
  });
  tx();
  res.json({ ok: true, message: 'Table réinitialisée' });
});

// POST /api/backup/reset-global — Réinitialiser les données globales (MJ only)
router.post('/reset-global', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const tx = d.transaction(() => {
    d.exec('DELETE FROM systems; DELETE FROM factions; DELETE FROM ship_models; DELETE FROM peril_data;');
  });
  tx();
  res.json({ ok: true, message: 'Données globales réinitialisées' });
});

// ── Helpers ──
function _bulkInsert(d, table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(c => '@' + c).join(', ');
  const stmt = d.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
  for (const row of rows) stmt.run(row);
}

module.exports = router;
