import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import authMiddleware, { requireAdmin } from '../middleware/auth.js';
import db from '../database.js';
import { randomUUID } from 'node:crypto';

const router = Router();
router.use(authMiddleware);

// GET /api/perils/quadrant-names — liste tous les quadrants de la carte (accessible MJ + admin)
router.get('/quadrant-names', (req, res) => {
  try {
    const raw = readFileSync(join(process.cwd(), 'quadrants_MA.json'), 'utf8');
    const data = JSON.parse(raw);
    success(res, Object.keys(data).sort((a, b) => a.localeCompare(b, 'fr')));
  } catch {
    success(res, []);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTableId(req) {
  return req.table?.id ?? null;
}

function isMJ(req) {
  return req.table?.role === 'mj';
}

function parseData(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

// ── Per-table custom peril tables ─────────────────────────────────────────────

// GET /api/perils/tables  →  [{id, name, type, categories:[…]}, …]
router.get('/tables', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const rows = db.prepare(
    'SELECT id, data_json FROM custom_peril_tables WHERE table_id = ? ORDER BY rowid'
  ).all(tableId);

  const data = rows.map(r => ({ id: r.id, ...parseData(r.data_json) }));
  success(res, data);
});

// POST /api/perils/tables  →  create
router.post('/tables', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  const { name, type, categories } = req.body;
  if (!name || !String(name).trim()) return validationError(res, 'Le nom est requis');
  if (!['interplanetaire', 'hyperspatial'].includes(type)) {
    return validationError(res, 'Type invalide');
  }

  const id = 'ct_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const data_json = JSON.stringify({ name: String(name).trim(), type, categories: categories || [] });
  db.prepare('INSERT INTO custom_peril_tables (id, table_id, data_json) VALUES (?, ?, ?)').run(id, tableId, data_json);

  success(res, { id, name: String(name).trim(), type, categories: categories || [] }, 201);
});

// PATCH /api/perils/tables/:id  →  update data_json
router.patch('/tables/:id', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  const row = db.prepare('SELECT id, data_json FROM custom_peril_tables WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res);

  const current = parseData(row.data_json);
  const { name, type, categories } = req.body;
  if (name !== undefined) current.name = String(name).trim();
  if (type !== undefined) current.type = type;
  if (categories !== undefined) current.categories = categories;

  db.prepare('UPDATE custom_peril_tables SET data_json = ? WHERE id = ? AND table_id = ?').run(
    JSON.stringify(current), row.id, tableId
  );
  success(res, { id: row.id, ...current });
});

// DELETE /api/perils/tables/:id
router.delete('/tables/:id', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  const row = db.prepare('SELECT id FROM custom_peril_tables WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res);

  db.transaction(() => {
    db.prepare('DELETE FROM peril_assignments WHERE table_id = ? AND peril_table_id = ?').run(tableId, row.id);
    db.prepare('DELETE FROM custom_peril_tables WHERE id = ? AND table_id = ?').run(row.id, tableId);
  })();

  success(res, { deleted: row.id });
});

// POST /api/perils/tables/:id/duplicate
router.post('/tables/:id/duplicate', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  const row = db.prepare('SELECT id, data_json FROM custom_peril_tables WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res);

  const d = parseData(row.data_json);
  const newName = (d.name || row.id) + ' (copie)';
  const newId = 'cpt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const newData = JSON.stringify({ ...d, name: newName });
  db.prepare('INSERT INTO custom_peril_tables (id, table_id, data_json) VALUES (?, ?, ?)').run(newId, tableId, newData);
  success(res, { id: newId, name: newName, type: d.type, categories: d.categories || [] }, 201);
});

// ── Per-table assignments ─────────────────────────────────────────────────────

// GET /api/perils/assignments  →  {systems:{coord:id,…}, quadrants:{q:id,…}}
router.get('/assignments', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const rows = db.prepare(
    'SELECT assign_type, key, peril_table_id FROM peril_assignments WHERE table_id = ?'
  ).all(tableId);

  const result = { systems: {}, quadrants: {} };
  for (const r of rows) {
    if (r.assign_type === 'interplanetaire') result.systems[r.key] = r.peril_table_id;
    else result.quadrants[r.key] = r.peril_table_id;
  }
  success(res, result);
});

// PATCH /api/perils/assignments  →  upsert or delete one assignment
// Body: { assign_type: 'interplanetaire'|'hyperspatial', key: string, peril_table_id: string }
router.patch('/assignments', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  const { assign_type, key, peril_table_id } = req.body;
  if (!assign_type || !key) return validationError(res, 'assign_type et key requis');

  if (!peril_table_id) {
    db.prepare(
      'DELETE FROM peril_assignments WHERE table_id = ? AND assign_type = ? AND key = ?'
    ).run(tableId, assign_type, key);
  } else {
    db.prepare(`
      INSERT INTO peril_assignments (table_id, assign_type, key, peril_table_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(table_id, assign_type, key) DO UPDATE SET peril_table_id = excluded.peril_table_id
    `).run(tableId, assign_type, key, peril_table_id);
  }
  success(res, { ok: true });
});

// ── Admin global peril templates ──────────────────────────────────────────────
// These routes require admin privilege

// GET /api/perils/admin-templates
router.get('/admin-templates', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables ORDER BY rowid').all();
  const data = rows.map(r => ({ id: r.id, name: r.name, type: r.type, ...parseData(r.data_json) }));
  success(res, data);
});

// POST /api/perils/admin-templates
router.post('/admin-templates', requireAdmin, (req, res) => {
  const { name, type, categories } = req.body;
  if (!name || !String(name).trim()) return validationError(res, 'Le nom est requis');
  if (!['interplanetaire', 'hyperspatial'].includes(type)) return validationError(res, 'Type invalide');

  const id = 'apt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const data_json = JSON.stringify({ categories: categories || [] });
  db.prepare('INSERT INTO admin_peril_tables (id, name, type, data_json) VALUES (?, ?, ?, ?)').run(id, String(name).trim(), type, data_json);
  success(res, { id, name: String(name).trim(), type, categories: categories || [] }, 201);
});

// PATCH /api/perils/admin-templates/:id
router.patch('/admin-templates/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);

  const fields = req.body;
  const name = fields.name !== undefined ? String(fields.name).trim() : row.name;
  const type = fields.type !== undefined ? fields.type : row.type;
  const current = parseData(row.data_json);
  if (fields.categories !== undefined) current.categories = fields.categories;

  db.prepare('UPDATE admin_peril_tables SET name = ?, type = ?, data_json = ? WHERE id = ?').run(name, type, JSON.stringify(current), row.id);
  success(res, { id: row.id, name, type, ...current });
});

// DELETE /api/perils/admin-templates/:id
router.delete('/admin-templates/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM admin_peril_tables WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  db.prepare('DELETE FROM admin_peril_tables WHERE id = ?').run(row.id);
  // Also clear quadrant defaults pointing to this template
  db.prepare("DELETE FROM admin_quadrant_defaults WHERE peril_list_id = ?").run(row.id);
  success(res, { deleted: row.id });
});

// POST /api/perils/admin-templates/:id/duplicate
router.post('/admin-templates/:id/duplicate', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const newId = 'apt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const newName = row.name + ' (copie)';
  db.prepare('INSERT INTO admin_peril_tables (id, name, type, data_json) VALUES (?, ?, ?, ?)').run(newId, newName, row.type, row.data_json);
  const d = parseData(row.data_json);
  success(res, { id: newId, name: newName, type: row.type, ...d }, 201);
});

// ── Admin global quadrant defaults ────────────────────────────────────────────

// GET /api/perils/admin-quadrants  →  [{quadrant, peril_list_id}, …]
router.get('/admin-quadrants', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT quadrant, peril_list_id FROM admin_quadrant_defaults ORDER BY quadrant').all();
  success(res, rows);
});

// PATCH /api/perils/admin-quadrants  →  body: {quadrant, peril_list_id}
router.patch('/admin-quadrants', requireAdmin, (req, res) => {
  const { quadrant, peril_list_id } = req.body;
  if (!quadrant) return validationError(res, 'quadrant requis');
  if (!peril_list_id) {
    db.prepare('DELETE FROM admin_quadrant_defaults WHERE quadrant = ?').run(quadrant);
  } else {
    db.prepare(`
      INSERT INTO admin_quadrant_defaults (quadrant, peril_list_id) VALUES (?, ?)
      ON CONFLICT(quadrant) DO UPDATE SET peril_list_id = excluded.peril_list_id
    `).run(quadrant, peril_list_id);
  }
  success(res, { ok: true });
});

// POST /api/perils/admin-quadrants/fill-all  →  body: {peril_list_id}
// Assigns the same HS template to all 1600 quadrants at once
router.post('/admin-quadrants/fill-all', requireAdmin, (req, res) => {
  const { peril_list_id } = req.body;
  const tpl = peril_list_id ? db.prepare('SELECT id FROM admin_peril_tables WHERE id = ?').get(peril_list_id) : null;
  if (peril_list_id && !tpl) return notFound(res, 'Modèle introuvable');

  const COLS = ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω','Α′','Β′','Γ′','Δ′','Ε′','Ζ′','Η′','Θ′','Ι′','Κ′','Λ′','Μ′','Ν′','Ξ′','Ο′','Π′'];
  const upsert = db.prepare(`
    INSERT INTO admin_quadrant_defaults (quadrant, peril_list_id) VALUES (?, ?)
    ON CONFLICT(quadrant) DO UPDATE SET peril_list_id = excluded.peril_list_id
  `);
  const del = db.prepare('DELETE FROM admin_quadrant_defaults WHERE quadrant = ?');

  let count = 0;
  const fillAll = db.transaction(() => {
    for (const col of COLS) {
      for (let row = 1; row <= 40; row++) {
        const q = `${col}-${row}`;
        if (peril_list_id) { upsert.run(q, peril_list_id); }
        else { del.run(q); }
        count++;
      }
    }
  });
  fillAll();
  success(res, { updated: count });
});

// POST /api/perils/import-admin-defaults  →  import admin templates + quadrant defaults into current campaign
// Requires MJ in the active table. Creates campaign peril tables matching admin templates, then imports assignments.
router.post('/import-admin-defaults', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId || !isMJ(req)) return forbidden(res);

  // 1. Load admin templates
  const adminTemplates = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables ORDER BY rowid').all();
  if (!adminTemplates.length) return success(res, { tables: 0, quadrants: 0, systems: 0 });

  // 2. Load or create matching campaign peril tables
  const existingRows = db.prepare('SELECT id, data_json FROM custom_peril_tables WHERE table_id = ?').all(tableId);
  const existingByName = {};
  existingRows.forEach(r => {
    try { const d = JSON.parse(r.data_json || '{}'); if (d.name) existingByName[d.name] = r.id; } catch {}
  });

  const adminIdToCampaignId = {};
  let tablesCreated = 0;

  const createTpl = db.prepare('INSERT INTO custom_peril_tables (id, table_id, data_json) VALUES (?, ?, ?)');
  const importTables = db.transaction(() => {
    for (const tpl of adminTemplates) {
      const d = parseData(tpl.data_json);
      const fullName = tpl.name;
      if (existingByName[fullName]) {
        adminIdToCampaignId[tpl.id] = existingByName[fullName];
      } else {
        const newId = 'ct_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + tablesCreated;
        const newJson = JSON.stringify({ name: fullName, type: tpl.type, categories: d.categories || [] });
        createTpl.run(newId, tableId, newJson);
        adminIdToCampaignId[tpl.id] = newId;
        existingByName[fullName] = newId;
        tablesCreated++;
      }
    }
  });
  importTables();

  // 3. Import quadrant defaults
  const adminDefaults = db.prepare('SELECT quadrant, peril_list_id FROM admin_quadrant_defaults').all();
  const upsertAssign = db.prepare(`
    INSERT INTO peril_assignments (table_id, assign_type, key, peril_table_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(table_id, assign_type, key) DO UPDATE SET peril_table_id = excluded.peril_table_id
  `);
  let quadrantsImported = 0;
  const importQuadrants = db.transaction(() => {
    for (const def of adminDefaults) {
      const campaignId = adminIdToCampaignId[def.peril_list_id];
      if (!campaignId) continue;
      upsertAssign.run(tableId, 'hyperspatial', def.quadrant, campaignId);
      quadrantsImported++;
    }
  });
  importQuadrants();

  // 4. Assign first IP campaign table to all systems
  const allSystems = db.prepare('SELECT id FROM systems').all();
  const firstIpCampaign = (() => {
    for (const tpl of adminTemplates) {
      if (tpl.type === 'interplanetaire') return adminIdToCampaignId[tpl.id];
    }
    return null;
  })();
  let systemsImported = 0;
  if (firstIpCampaign && allSystems.length) {
    const importSystems = db.transaction(() => {
      for (const sys of allSystems) {
        upsertAssign.run(tableId, 'interplanetaire', String(sys.id), firstIpCampaign);
        systemsImported++;
      }
    });
    importSystems();
  }

  success(res, { tables: tablesCreated, quadrants: quadrantsImported, systems: systemsImported });
});

export default router;
