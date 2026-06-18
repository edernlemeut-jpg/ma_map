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
    _meta: { version: 2, date: new Date().toISOString(), type: 'full' },
    // ── Données globales ────────────────────────────────────────────────────
    systems: d.prepare('SELECT * FROM systems ORDER BY quadrant, id').all(),
    factions: d.prepare('SELECT * FROM factions ORDER BY name').all(),
    shipModels: d.prepare('SELECT * FROM ship_models ORDER BY nom').all(),
    perilData: d.prepare('SELECT * FROM peril_data').all(),
    rulesEntries: d.prepare('SELECT * FROM rules_entries').all(),
    metaKv: d.prepare('SELECT * FROM meta_kv').all(),
    // ── Utilisateurs & tables ───────────────────────────────────────────────
    users: d.prepare('SELECT id, username, display_name, role, profile_role, created_at FROM users').all(),
    gameTables: d.prepare('SELECT * FROM game_tables').all(),
    tableMembers: d.prepare('SELECT * FROM table_members').all(),
    tableState: d.prepare('SELECT * FROM table_state').all(),
    // ── Données de table ────────────────────────────────────────────────────
    ships: d.prepare('SELECT * FROM ships').all(),
    customPerilTables: d.prepare('SELECT * FROM custom_peril_tables').all(),
    perilAssignments: d.prepare('SELECT * FROM peril_assignments').all(),
    tripHistory: d.prepare('SELECT * FROM trip_history').all(),
    travelRoutes: d.prepare('SELECT * FROM travel_routes').all(),
    routeWaypoints: d.prepare('SELECT * FROM route_waypoints').all(),
    routePerils: d.prepare('SELECT * FROM route_perils').all(),
    visibilityRules: d.prepare('SELECT * FROM visibility_rules').all(),
    calendarCategories: d.prepare('SELECT * FROM calendar_categories').all(),
    calendarEvents: d.prepare('SELECT * FROM calendar_events').all(),
    revolteSessions: d.prepare('SELECT * FROM revolte_sessions').all(),
    characters: d.prepare('SELECT * FROM characters').all(),
    entityLinks: d.prepare('SELECT * FROM entity_links').all(),
    namedNpcs: d.prepare('SELECT * FROM named_npcs').all(),
    figurantTemplates: d.prepare('SELECT * FROM figurant_templates').all(),
    mfPool: d.prepare('SELECT * FROM mf_pool').all(),
    chassesTresor: d.prepare('SELECT * FROM chasses_tresor').all(),
    combatsSpatialux: d.prepare('SELECT * FROM combats_spatiaux').all(),
    combatShips: d.prepare('SELECT * FROM combat_ships').all(),
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
    _meta: { version: 2, date: new Date().toISOString(), type: 'table', tableName: t.name },
    // Données globales (incluses pour portabilité)
    systems: d.prepare('SELECT * FROM systems ORDER BY quadrant, id').all(),
    factions: d.prepare('SELECT * FROM factions ORDER BY name').all(),
    shipModels: d.prepare('SELECT * FROM ship_models ORDER BY nom').all(),
    perilData: d.prepare('SELECT * FROM peril_data').all(),
    rulesEntries: d.prepare('SELECT * FROM rules_entries').all(),
    // Données spécifiques à la table
    tableState: d.prepare('SELECT * FROM table_state WHERE table_id = ?').get(tid),
    ships: d.prepare('SELECT * FROM ships WHERE table_id = ?').all(tid),
    customPerilTables: d.prepare('SELECT * FROM custom_peril_tables WHERE table_id = ?').all(tid),
    perilAssignments: d.prepare('SELECT * FROM peril_assignments WHERE table_id = ?').all(tid),
    tripHistory: d.prepare('SELECT * FROM trip_history WHERE table_id = ?').all(tid),
    travelRoutes: d.prepare('SELECT * FROM travel_routes WHERE table_id = ?').all(tid),
    routeWaypoints: d.prepare(`SELECT rw.* FROM route_waypoints rw
      JOIN travel_routes tr ON tr.id = rw.route_id WHERE tr.table_id = ?`).all(tid),
    routePerils: d.prepare(`SELECT rp.* FROM route_perils rp
      JOIN travel_routes tr ON tr.id = rp.route_id WHERE tr.table_id = ?`).all(tid),
    visibilityRules: d.prepare('SELECT * FROM visibility_rules WHERE table_id = ?').all(tid),
    calendarCategories: d.prepare('SELECT * FROM calendar_categories WHERE table_id = ?').all(tid),
    calendarEvents: d.prepare('SELECT * FROM calendar_events WHERE table_id = ?').all(tid),
    revolteSessions: d.prepare('SELECT * FROM revolte_sessions WHERE table_id = ?').all(tid),
    characters: d.prepare('SELECT * FROM characters WHERE table_id = ?').all(tid),
    entityLinks: d.prepare('SELECT * FROM entity_links WHERE table_id = ?').all(tid),
    namedNpcs: d.prepare('SELECT * FROM named_npcs WHERE table_id = ?').all(tid),
    figurantTemplates: d.prepare('SELECT * FROM figurant_templates WHERE table_id = ?').all(tid),
    mfPool: d.prepare('SELECT * FROM mf_pool WHERE table_id = ?').all(tid),
    chassesTresor: d.prepare('SELECT * FROM chasses_tresor WHERE table_id = ?').all(tid),
    combatsSpatialux: d.prepare('SELECT * FROM combats_spatiaux WHERE table_id = ?').all(tid),
    combatShips: d.prepare(`SELECT cs.* FROM combat_ships cs
      JOIN combats_spatiaux c ON c.id = cs.combat_id WHERE c.table_id = ?`).all(tid),
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
    // Vider dans l'ordre (dépendances)
    d.exec(`DELETE FROM combat_ships; DELETE FROM combats_spatiaux;`);
    d.exec(`DELETE FROM chasses_tresor; DELETE FROM mf_pool;`);
    d.exec(`DELETE FROM figurant_templates; DELETE FROM named_npcs; DELETE FROM entity_links;`);
    d.exec(`DELETE FROM characters;`);
    d.exec(`DELETE FROM revolte_sessions; DELETE FROM calendar_events; DELETE FROM calendar_categories;`);
    d.exec(`DELETE FROM route_perils; DELETE FROM route_waypoints; DELETE FROM travel_routes;`);
    d.exec(`DELETE FROM visibility_rules; DELETE FROM trip_history; DELETE FROM peril_assignments; DELETE FROM custom_peril_tables;`);
    d.exec(`DELETE FROM ships; DELETE FROM table_state; DELETE FROM table_members; DELETE FROM game_tables;`);
    d.exec(`DELETE FROM peril_data; DELETE FROM rules_entries; DELETE FROM meta_kv;`);
    d.exec(`DELETE FROM ship_models; DELETE FROM factions; DELETE FROM systems;`);

    // Restaurer
    _bulkInsert(d, 'systems', data.systems || []);
    _bulkInsert(d, 'factions', data.factions || []);
    _bulkInsert(d, 'ship_models', data.shipModels || []);
    _bulkInsert(d, 'peril_data', data.perilData || []);
    _bulkInsert(d, 'rules_entries', data.rulesEntries || []);
    _bulkInsert(d, 'meta_kv', data.metaKv || []);
    _bulkInsert(d, 'game_tables', data.gameTables || []);
    _bulkInsert(d, 'table_members', data.tableMembers || []);
    _bulkInsert(d, 'table_state', data.tableState || []);
    _bulkInsert(d, 'ships', data.ships || []);
    _bulkInsert(d, 'custom_peril_tables', data.customPerilTables || []);
    _bulkInsert(d, 'peril_assignments', data.perilAssignments || []);
    _bulkInsert(d, 'trip_history', data.tripHistory || []);
    _bulkInsert(d, 'travel_routes', data.travelRoutes || []);
    _bulkInsert(d, 'route_waypoints', data.routeWaypoints || []);
    _bulkInsert(d, 'route_perils', data.routePerils || []);
    _bulkInsert(d, 'visibility_rules', data.visibilityRules || []);
    _bulkInsert(d, 'calendar_categories', data.calendarCategories || []);
    _bulkInsert(d, 'calendar_events', data.calendarEvents || []);
    _bulkInsert(d, 'revolte_sessions', data.revolteSessions || []);
    _bulkInsert(d, 'characters', data.characters || []);
    _bulkInsert(d, 'entity_links', data.entityLinks || []);
    _bulkInsert(d, 'named_npcs', data.namedNpcs || []);
    _bulkInsert(d, 'figurant_templates', data.figurantTemplates || []);
    _bulkInsert(d, 'mf_pool', data.mfPool || []);
    _bulkInsert(d, 'chasses_tresor', data.chassesTresor || []);
    _bulkInsert(d, 'combats_spatiaux', data.combatsSpatialux || []);
    _bulkInsert(d, 'combat_ships', data.combatShips || []);
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
    // Vider dans l'ordre
    d.prepare(`DELETE FROM combat_ships WHERE combat_id IN (SELECT id FROM combats_spatiaux WHERE table_id = ?)`).run(tid);
    d.prepare('DELETE FROM combats_spatiaux WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM chasses_tresor WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM mf_pool WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM figurant_templates WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM named_npcs WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM entity_links WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM characters WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM revolte_sessions WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM calendar_events WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM calendar_categories WHERE table_id = ?').run(tid);
    d.prepare(`DELETE FROM route_perils WHERE route_id IN (SELECT id FROM travel_routes WHERE table_id = ?)`).run(tid);
    d.prepare(`DELETE FROM route_waypoints WHERE route_id IN (SELECT id FROM travel_routes WHERE table_id = ?)`).run(tid);
    d.prepare('DELETE FROM travel_routes WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM visibility_rules WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM trip_history WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM peril_assignments WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM custom_peril_tables WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM ships WHERE table_id = ?').run(tid);
    d.prepare('DELETE FROM table_state WHERE table_id = ?').run(tid);

    // Restaurer tableState
    if (data.tableState) {
      const ts = Array.isArray(data.tableState) ? data.tableState[0] : data.tableState;
      if (ts) d.prepare('INSERT INTO table_state (table_id, active_ship_id) VALUES (?, ?)').run(tid, ts.active_ship_id || '');
    }

    const withTable = (rows) => (rows || []).map(r => ({ ...r, table_id: tid }));
    _bulkInsert(d, 'ships', withTable(data.ships));
    _bulkInsert(d, 'custom_peril_tables', withTable(data.customPerilTables));
    _bulkInsert(d, 'peril_assignments', withTable(data.perilAssignments));
    _bulkInsert(d, 'trip_history', withTable(data.tripHistory));
    _bulkInsert(d, 'travel_routes', withTable(data.travelRoutes));
    _bulkInsert(d, 'route_waypoints', data.routeWaypoints || []);
    _bulkInsert(d, 'route_perils', data.routePerils || []);
    _bulkInsert(d, 'visibility_rules', withTable(data.visibilityRules));
    _bulkInsert(d, 'calendar_categories', withTable(data.calendarCategories));
    _bulkInsert(d, 'calendar_events', withTable(data.calendarEvents));
    _bulkInsert(d, 'revolte_sessions', withTable(data.revolteSessions));
    _bulkInsert(d, 'characters', withTable(data.characters));
    _bulkInsert(d, 'entity_links', withTable(data.entityLinks));
    _bulkInsert(d, 'named_npcs', withTable(data.namedNpcs));
    _bulkInsert(d, 'figurant_templates', withTable(data.figurantTemplates));
    _bulkInsert(d, 'mf_pool', withTable(data.mfPool));
    _bulkInsert(d, 'chasses_tresor', withTable(data.chassesTresor));
    _bulkInsert(d, 'combats_spatiaux', withTable(data.combatsSpatialux));
    _bulkInsert(d, 'combat_ships', data.combatShips || []);
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
