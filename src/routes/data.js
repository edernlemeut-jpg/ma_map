const router = require('express').Router();
const { getDB, getQuadrantsMap, systemObjToRow, shipRowToObj, shipObjToRow, shipModelRowToObj, shipModelObjToRow, safeJSON, getHiddenEntities } = require('../database');
const { requireAuth, requireMJ, requireTableAccess } = require('../auth');

// ═══════════════════════════════════════════
// BULK LOAD — charge toutes les données pour une table
// GET /api/data/t/:tid/all
// ═══════════════════════════════════════════
router.get('/t/:tid/all', requireAuth, requireTableAccess, (req, res) => {
  const d = getDB();
  const tid = req.tableId;

  // Visibilité: un joueur ne voit pas les entités cachées
  let hidden = null;
  if (!req.isMJ) hidden = getHiddenEntities(tid);
  const hiddenSystems = hidden?.systems || new Set();

  // Quadrants / systèmes
  const quadrants = getQuadrantsMap(hiddenSystems.size > 0 ? hiddenSystems : null);

  // Factions
  let factions = d.prepare('SELECT * FROM factions ORDER BY name').all()
    .map(f => ({ name: f.name, color: f.color, short: f.short }));
  if (hidden?.factions?.size) factions = factions.filter(f => !hidden.factions.has(f.name));

  // Ship models (globaux)
  const shipModels = d.prepare('SELECT * FROM ship_models ORDER BY nom').all().map(shipModelRowToObj);

  // Ships (de cette table)
  const ships = d.prepare('SELECT * FROM ships WHERE table_id = ? ORDER BY nom').all(tid).map(shipRowToObj);

  // État table
  const state = d.prepare('SELECT * FROM table_state WHERE table_id = ?').get(tid);
  const activeShipId = state?.active_ship_id || '';

  // Peril data
  const perilRows = d.prepare('SELECT * FROM peril_data').all();
  const perilsData = {};
  perilRows.forEach(r => { perilsData[r.type] = safeJSON(r.data_json, {}); });

  // Custom peril tables (de cette table)
  const customTables = d.prepare('SELECT * FROM custom_peril_tables WHERE table_id = ?').all(tid)
    .map(r => safeJSON(r.data_json, null)).filter(Boolean);

  // Peril assignments (de cette table)
  const assignRows = d.prepare('SELECT * FROM peril_assignments WHERE table_id = ?').all(tid);
  const perilAssignments = { systems: {}, quadrants: {} };
  assignRows.forEach(r => {
    if (r.assign_type === 'system') perilAssignments.systems[r.key] = r.peril_table_id;
    else if (r.assign_type === 'quadrant') perilAssignments.quadrants[r.key] = r.peril_table_id;
  });

  // History
  const history = d.prepare('SELECT * FROM trip_history WHERE table_id = ? ORDER BY created_at DESC').all(tid)
    .map(r => ({ id: r.id, ...safeJSON(r.data_json, {}), shipName: r.ship_name, createdAt: r.created_at }));

  res.json({ quadrants, factions, shipModels, ships, activeShipId, perilsData, customTables, perilAssignments, history });
});

// ═══════════════════════════════════════════
// SYSTÈMES / QUADRANTS
// ═══════════════════════════════════════════

// GET /api/data/systems — Tous les systèmes
router.get('/systems', requireAuth, (req, res) => {
  const quadrants = getQuadrantsMap();
  res.json(quadrants);
});

// PUT /api/data/systems/:coord — Remplacer tous les systèmes d'un quadrant
router.put('/systems/:coord', requireAuth, requireMJ, (req, res) => {
  const { systems } = req.body;
  if (!Array.isArray(systems)) return res.status(400).json({ error: 'Format invalide' });

  const d = getDB();
  const coord = req.params.coord;
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM systems WHERE quadrant = ?').run(coord);
    const stmt = d.prepare(`INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)
      VALUES (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description, @soleil_json, @corps_celestes_json, @patrouilles_json)`);
    for (const sys of systems) stmt.run(systemObjToRow(coord, sys));
  });
  tx();
  res.json({ ok: true });
});

// POST /api/data/systems/:coord — Ajouter un système à un quadrant
router.post('/systems/:coord', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const row = systemObjToRow(req.params.coord, req.body);
  try {
    d.prepare(`INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)
      VALUES (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description, @soleil_json, @corps_celestes_json, @patrouilles_json)`).run(row);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Système déjà existant dans ce quadrant' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/data/systems/:coord/:nom — Modifier un système
router.put('/systems/:coord/:nom', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const row = systemObjToRow(req.params.coord, req.body);
  d.prepare(`UPDATE systems SET faction=@faction, is_frontiere=@is_frontiere, route=@route, gouvernement=@gouvernement,
    description=@description, soleil_json=@soleil_json, corps_celestes_json=@corps_celestes_json, patrouilles_json=@patrouilles_json
    WHERE quadrant=@quadrant AND nom=@nom`).run(row);
  res.json({ ok: true });
});

// DELETE /api/data/systems/:coord/:nom — Supprimer un système
router.delete('/systems/:coord/:nom', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  d.prepare('DELETE FROM systems WHERE quadrant = ? AND nom = ?').run(req.params.coord, req.params.nom);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// FACTIONS
// ═══════════════════════════════════════════

router.get('/factions', requireAuth, (req, res) => {
  const d = getDB();
  res.json(d.prepare('SELECT * FROM factions ORDER BY name').all().map(f => ({ name: f.name, color: f.color, short: f.short })));
});

router.post('/factions', requireAuth, requireMJ, (req, res) => {
  const { name, color, short: sh } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const d = getDB();
  try {
    d.prepare('INSERT INTO factions (name, color, short) VALUES (?, ?, ?)').run(name, color || '#888888', sh || '');
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Faction déjà existante' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/factions/:name', requireAuth, requireMJ, (req, res) => {
  const { color, short: sh, newName } = req.body;
  const d = getDB();
  if (newName && newName !== req.params.name) {
    d.prepare('UPDATE factions SET name=?, color=?, short=? WHERE name=?').run(newName, color || '#888888', sh || '', req.params.name);
  } else {
    d.prepare('UPDATE factions SET color=?, short=? WHERE name=?').run(color || '#888888', sh || '', req.params.name);
  }
  res.json({ ok: true });
});

router.delete('/factions/:name', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  d.prepare('DELETE FROM factions WHERE name = ?').run(req.params.name);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// MODÈLES DE VAISSEAUX (globaux)
// ═══════════════════════════════════════════

router.get('/ship-models', requireAuth, (req, res) => {
  const d = getDB();
  res.json(d.prepare('SELECT * FROM ship_models ORDER BY nom').all().map(shipModelRowToObj));
});

router.post('/ship-models', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const row = shipModelObjToRow(req.body);
  try {
    d.prepare(`INSERT INTO ship_models (id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie,
      manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json)
      VALUES (@id, @nom, @classe, @vitesse_croisiere, @vitesse_hyperspatiale, @autonomie,
      @manoeuvrabilite, @vitesse_tactique, @blindage, @coque, @senseurs, @equipage, @passagers, @soute, @prix, @origine, @image, @armement_json, @systemes_secondaires_json)`).run(row);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/ship-models/:id', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  const row = shipModelObjToRow(req.body);
  row.id = req.params.id;
  d.prepare(`UPDATE ship_models SET nom=@nom, classe=@classe, vitesse_croisiere=@vitesse_croisiere,
    vitesse_hyperspatiale=@vitesse_hyperspatiale, autonomie=@autonomie, manoeuvrabilite=@manoeuvrabilite,
    vitesse_tactique=@vitesse_tactique, blindage=@blindage, coque=@coque, senseurs=@senseurs,
    equipage=@equipage, passagers=@passagers, soute=@soute, prix=@prix, origine=@origine, image=@image,
    armement_json=@armement_json, systemes_secondaires_json=@systemes_secondaires_json WHERE id=@id`).run(row);
  res.json({ ok: true });
});

router.delete('/ship-models/:id', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  d.prepare('DELETE FROM ship_models WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// VAISSEAUX (par table de jeu)
// ═══════════════════════════════════════════

router.get('/t/:tid/ships', requireAuth, requireTableAccess, (req, res) => {
  const d = getDB();
  res.json(d.prepare('SELECT * FROM ships WHERE table_id = ? ORDER BY nom').all(req.tableId).map(shipRowToObj));
});

router.post('/t/:tid/ships', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const row = shipObjToRow(req.body, req.tableId);
  try {
    d.prepare(`INSERT INTO ships (id, table_id, nom, modele, from_model, position, position_system, position_astre,
      classe, origine, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique,
      blindage, coque, senseurs, equipage, passagers, soute, prix, image, armement_json, systemes_secondaires_json)
      VALUES (@id, @table_id, @nom, @modele, @from_model, @position, @position_system, @position_astre,
      @classe, @origine, @vitesse_croisiere, @vitesse_hyperspatiale, @autonomie, @manoeuvrabilite, @vitesse_tactique,
      @blindage, @coque, @senseurs, @equipage, @passagers, @soute, @prix, @image, @armement_json, @systemes_secondaires_json)`).run(row);
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/t/:tid/ships/:id', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const row = shipObjToRow(req.body, req.tableId);
  row.id = req.params.id;
  d.prepare(`UPDATE ships SET nom=@nom, modele=@modele, from_model=@from_model, position=@position,
    position_system=@position_system, position_astre=@position_astre, classe=@classe, origine=@origine,
    vitesse_croisiere=@vitesse_croisiere, vitesse_hyperspatiale=@vitesse_hyperspatiale, autonomie=@autonomie,
    manoeuvrabilite=@manoeuvrabilite, vitesse_tactique=@vitesse_tactique, blindage=@blindage, coque=@coque,
    senseurs=@senseurs, equipage=@equipage, passagers=@passagers, soute=@soute, prix=@prix, image=@image,
    armement_json=@armement_json, systemes_secondaires_json=@systemes_secondaires_json
    WHERE id=@id AND table_id=@table_id`).run(row);
  res.json({ ok: true });
});

router.delete('/t/:tid/ships/:id', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  d.prepare('DELETE FROM ships WHERE id = ? AND table_id = ?').run(req.params.id, req.tableId);
  // Désactiver le vaisseau actif si c'est celui qu'on supprime
  d.prepare("UPDATE table_state SET active_ship_id = '' WHERE table_id = ? AND active_ship_id = ?").run(req.tableId, req.params.id);
  res.json({ ok: true });
});

// PUT /api/data/t/:tid/active-ship — Changer le vaisseau actif
router.put('/t/:tid/active-ship', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  d.prepare('INSERT OR REPLACE INTO table_state (table_id, active_ship_id) VALUES (?, ?)').run(req.tableId, req.body.shipId || '');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// PÉRILS
// ═══════════════════════════════════════════

// Base peril data (global, read-only for players)
router.get('/peril-data', requireAuth, (req, res) => {
  const d = getDB();
  const rows = d.prepare('SELECT * FROM peril_data').all();
  const data = {};
  rows.forEach(r => { data[r.type] = safeJSON(r.data_json, {}); });
  res.json(data);
});

// PUT /api/data/peril-data/:type — Modifier les données de base des périls (MJ)
router.put('/peril-data/:type', requireAuth, requireMJ, (req, res) => {
  const d = getDB();
  d.prepare('INSERT OR REPLACE INTO peril_data (type, data_json) VALUES (?, ?)').run(req.params.type, JSON.stringify(req.body));
  res.json({ ok: true });
});

// Custom peril tables (per table)
router.get('/t/:tid/peril-tables', requireAuth, requireTableAccess, (req, res) => {
  const d = getDB();
  res.json(d.prepare('SELECT * FROM custom_peril_tables WHERE table_id = ?').all(req.tableId)
    .map(r => safeJSON(r.data_json, null)).filter(Boolean));
});

router.post('/t/:tid/peril-tables', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const data = req.body;
  d.prepare('INSERT OR REPLACE INTO custom_peril_tables (id, table_id, data_json) VALUES (?, ?, ?)')
    .run(data.id, req.tableId, JSON.stringify(data));
  res.json({ ok: true });
});

router.delete('/t/:tid/peril-tables/:id', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  d.prepare('DELETE FROM custom_peril_tables WHERE id = ? AND table_id = ?').run(req.params.id, req.tableId);
  res.json({ ok: true });
});

// Peril assignments (per table)
router.get('/t/:tid/peril-assignments', requireAuth, requireTableAccess, (req, res) => {
  const d = getDB();
  const rows = d.prepare('SELECT * FROM peril_assignments WHERE table_id = ?').all(req.tableId);
  const result = { systems: {}, quadrants: {} };
  rows.forEach(r => {
    if (r.assign_type === 'system') result.systems[r.key] = r.peril_table_id;
    else result.quadrants[r.key] = r.peril_table_id;
  });
  res.json(result);
});

router.put('/t/:tid/peril-assignments', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const { type, key, perilTableId } = req.body;
  if (!type || !key) return res.status(400).json({ error: 'type et key requis' });
  if (perilTableId) {
    d.prepare('INSERT OR REPLACE INTO peril_assignments (table_id, assign_type, key, peril_table_id) VALUES (?, ?, ?, ?)')
      .run(req.tableId, type, key, perilTableId);
  } else {
    d.prepare('DELETE FROM peril_assignments WHERE table_id = ? AND assign_type = ? AND key = ?')
      .run(req.tableId, type, key);
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// HISTORIQUE DE VOYAGES
// ═══════════════════════════════════════════

router.get('/t/:tid/history', requireAuth, requireTableAccess, (req, res) => {
  const d = getDB();
  res.json(d.prepare('SELECT * FROM trip_history WHERE table_id = ? ORDER BY created_at DESC').all(req.tableId)
    .map(r => ({ id: r.id, ...safeJSON(r.data_json, {}), shipName: r.ship_name, createdAt: r.created_at })));
});

router.post('/t/:tid/history', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  const { shipName, ...data } = req.body;
  const info = d.prepare('INSERT INTO trip_history (table_id, ship_name, data_json) VALUES (?, ?, ?)')
    .run(req.tableId, shipName || '', JSON.stringify(data));
  res.json({ id: info.lastInsertRowid });
});

router.delete('/t/:tid/history/:hid', requireAuth, requireTableAccess, (req, res) => {
  if (!req.isMJ) return res.status(403).json({ error: 'Réservé au MJ' });
  const d = getDB();
  d.prepare('DELETE FROM trip_history WHERE id = ? AND table_id = ?').run(parseInt(req.params.hid), req.tableId);
  res.json({ ok: true });
});

module.exports = router;
