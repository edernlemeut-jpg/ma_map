/**
 * named-npcs.js — CRUD PNJ Nommés (MJ only pour mutations)
 *
 * Mounts under /api/named-npcs
 * Epic 9 — Stories 9.1, 9.3, 9.4, 9.5
 */

import { Router } from 'express';
import db from '../database.js';
import { success, notFound, forbidden, validationError } from '../utils/response.js';
import { computeHealthTemplate, computeEnergyXMax, setHealthCase } from '../services/health-service.js';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTableId(req) {
  return req.table?.id ?? null;
}

function isMJ(req) {
  return req.table?.role === 'mj' || req.user?.is_admin;
}

/**
 * Serialize a named_npc row — full payload for MJ, restricted for joueur.
 */
function parseNpc(row, fullPayload = true) {
  let stats = null;
  try { stats = row.stats_json ? JSON.parse(row.stats_json) : null; } catch { /* ignore */ }
  let competences = null;
  try { competences = row.competences_json ? JSON.parse(row.competences_json) : null; } catch { /* ignore */ }
  let sante = null;
  try { sante = row.sante_json ? JSON.parse(row.sante_json) : null; } catch { /* ignore */ }
  let qualites = null;
  try { qualites = row.qualites_json ? JSON.parse(row.qualites_json) : null; } catch { /* ignore */ }
  let defauts = null;
  try { defauts = row.defauts_json ? JSON.parse(row.defauts_json) : null; } catch { /* ignore */ }

  const base = {
    id:               row.id,
    table_id:         row.table_id,
    nom:              row.nom,
    role_type:        row.role_type,
    archetype:        row.archetype ?? null,
    faction:          row.faction ?? null,
    motivation:       row.motivation ?? null,
    overdrive_trigger: row.overdrive_trigger ?? null,
    visible:          row.visible === 1,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };

  if (!fullPayload) return base;

  return {
    ...base,
    is_mutant:    row.is_mutant === 1,
    energie_x:    row.energie_x,
    aptitude:     row.aptitude ?? null,
    pp:           row.pp,
    stats,
    competences,
    sante,
    qualites,
    defauts,
    notes:        row.notes ?? null,
  };
}

/**
 * Construire le payload d'un PNJ selon le rôle (MJ = complet, joueur = restreint).
 * Retourne null si le PNJ n'est pas visible pour le joueur.
 *
 * @param {number} tableId
 * @param {number} id
 * @param {'mj'|'joueur'} role
 * @returns {{ data: object }|null}
 */
export function getForRole(tableId, id, role) {
  const row = db.prepare('SELECT * FROM named_npcs WHERE id = ? AND table_id = ?').get(id, tableId);
  if (!row) return null;
  if (role !== 'mj' && !row.visible) return null;
  return parseNpc(row, role === 'mj');
}

// ── GET /api/named-npcs ───────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const mj = isMJ(req);
  const { faction, role_type, q } = req.query;

  let sql = 'SELECT * FROM named_npcs WHERE table_id = ?';
  const params = [tableId];

  if (!mj) {
    sql += ' AND visible = 1';
  }
  if (faction) {
    sql += ' AND faction = ?';
    params.push(faction);
  }
  if (role_type) {
    sql += ' AND role_type = ?';
    params.push(role_type);
  }
  if (q) {
    sql += ' AND nom LIKE ?';
    params.push(`%${q}%`);
  }

  sql += ' ORDER BY nom LIMIT 50';

  const rows = db.prepare(sql).all(...params);
  success(res, rows.map(r => parseNpc(r, mj)));
});

// ── GET /api/named-npcs/:id ───────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM named_npcs WHERE id = ? AND table_id = ?')
    .get(req.params.id, tableId);
  if (!row) return notFound(res, 'PNJ introuvable');

  const mj = isMJ(req);
  if (!mj && !row.visible) return forbidden(res, 'PNJ non visible');

  success(res, parseNpc(row, mj));
});

// ── POST /api/named-npcs ─────────────────────────────────────────────────────

router.post('/', (req, res) => {
  if (!isMJ(req)) return forbidden(res, 'Seul le MJ peut créer un PNJ nommé');

  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const {
    nom, role_type, archetype, faction, stats_json, competences_json,
    is_mutant, motivation, overdrive_trigger, aptitude,
    qualites_json, defauts_json, pp, notes, visible,
    sante_niveaux,
  } = req.body;

  if (!nom || !nom.trim()) return validationError(res, 'Le champ nom est requis');
  const validRoles = ['premier_role', 'second_role'];
  if (!role_type || !validRoles.includes(role_type)) {
    return validationError(res, `role_type doit être l'un de : ${validRoles.join(', ')}`);
  }

  // Compute sante_json from stats
  let santeJson = null;
  let energieX = 0;
  try {
    const stats = stats_json ? JSON.parse(stats_json) : {};
    const car = Number(stats.car ?? 3);
    const sf  = Number(stats.sf  ?? 2);
    const niv = Number(sante_niveaux ?? 3);
    santeJson = JSON.stringify(computeHealthTemplate({ car, sf, niveaux: niv }));

    if (is_mutant) {
      const per = Number(stats.per ?? 0);
      const int_ = Number(stats.int ?? 0);
      energieX = computeEnergyXMax({ per, int: int_ });
    }
  } catch {
    return validationError(res, 'stats_json invalide');
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO named_npcs
      (table_id, nom, role_type, archetype, faction, stats_json, competences_json, is_mutant, energie_x,
       motivation, overdrive_trigger, aptitude, qualites_json, defauts_json, pp, sante_json,
       notes, visible, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const info = stmt.run(
    tableId, nom.trim(), role_type, archetype ?? null, faction ?? null, stats_json ?? null,
    competences_json ?? null, is_mutant ? 1 : 0, energieX,
    motivation ?? null, overdrive_trigger ?? null, aptitude ?? null,
    qualites_json ?? null, defauts_json ?? null,
    pp !== undefined ? Number(pp) : 3,
    santeJson, notes ?? null, visible ? 1 : 0, now, now
  );

  const created = db.prepare('SELECT * FROM named_npcs WHERE id = ?').get(info.lastInsertRowid);
  success(res, parseNpc(created, true), 201);
});

// ── PATCH /api/named-npcs/:id ─────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  if (!isMJ(req)) return forbidden(res, 'Seul le MJ peut modifier un PNJ nommé');

  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM named_npcs WHERE id = ? AND table_id = ?')
    .get(req.params.id, tableId);
  if (!row) return notFound(res, 'PNJ introuvable');

  const allowed = [
    'nom', 'role_type', 'archetype', 'faction', 'stats_json', 'competences_json', 'is_mutant',
    'energie_x', 'motivation', 'overdrive_trigger', 'aptitude', 'qualites_json',
    'defauts_json', 'pp', 'sante_json', 'notes', 'visible',
  ];

  const updates = [];
  const params  = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      let val = req.body[field];
      if (field === 'is_mutant' || field === 'visible') val = val ? 1 : 0;
      params.push(val);
    }
  }

  if (updates.length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, row.id);

  db.prepare(`UPDATE named_npcs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM named_npcs WHERE id = ?').get(row.id);
  success(res, parseNpc(updated, true));
});

// ── PATCH /api/named-npcs/:id/health ─────────────────────────────────────────

router.patch('/:id/health', (req, res) => {
  if (!isMJ(req)) return forbidden(res, 'Seul le MJ peut modifier la santé d\'un PNJ');

  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM named_npcs WHERE id = ? AND table_id = ?')
    .get(req.params.id, tableId);
  if (!row) return notFound(res, 'PNJ introuvable');

  const { niveau_index, case_index, etat } = req.body;
  const result = setHealthCase(row.sante_json, Number(niveau_index), Number(case_index), etat);
  if (!result.ok) return validationError(res, result.error);

  const now = new Date().toISOString();
  db.prepare('UPDATE named_npcs SET sante_json = ?, updated_at = ? WHERE id = ?')
    .run(result.updated, now, row.id);

  success(res, parseNpc(db.prepare('SELECT * FROM named_npcs WHERE id = ?').get(row.id), true));
});

// ── DELETE /api/named-npcs/:id ────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  if (!isMJ(req)) return forbidden(res, 'Seul le MJ peut supprimer un PNJ nommé');

  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM named_npcs WHERE id = ? AND table_id = ?')
    .get(req.params.id, tableId);
  if (!row) return notFound(res, 'PNJ introuvable');

  db.prepare('DELETE FROM named_npcs WHERE id = ?').run(row.id);
  success(res, { deleted: true });
});

export default router;
