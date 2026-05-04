/**
 * figurants.js — Catalogue de templates de figurants (PNJ anonymes)
 *
 * Mounts under /api/figurants
 * Epic 10 — Stories 10.1, 10.2
 *
 * Données globales (pas de table_id).
 * GET : requiert auth uniquement (pas de X-Table-Id obligatoire).
 * POST / PATCH / DELETE : requiert rôle MJ (via table context) ou is_admin.
 */

import { Router } from 'express';
import db from '../database.js';
import { success, notFound, forbidden, validationError, error } from '../utils/response.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMJ(req) {
  return req.table?.role === 'mj' || req.user?.is_admin;
}

function parseFigurant(row) {
  let competences = null;
  try { competences = row.competences_json ? JSON.parse(row.competences_json) : null; } catch { /* ignore */ }
  return {
    id:                 row.id,
    nom:                row.nom,
    faction:            row.faction ?? null,
    categorie:          row.categorie ?? null,
    structure:          row.structure,
    blindage:           row.blindage,
    degats:             row.degats ?? null,
    mf_disponible:      row.mf_disponible,
    competences,
    notes:              row.notes ?? null,
    is_system_template: row.is_system_template === 1,
    created_at:         row.created_at,
  };
}

// ── GET /api/figurants — liste tous les templates, filtres optionnels ──────────
router.get('/', (req, res) => {
  const { faction, categorie, q } = req.query;
  let sql = 'SELECT * FROM figurant_templates WHERE 1=1';
  const params = [];
  if (faction)   { sql += ' AND faction = ?';      params.push(faction); }
  if (categorie) { sql += ' AND categorie = ?';    params.push(categorie); }
  if (q)         { sql += ' AND nom LIKE ?';       params.push(`%${q}%`); }
  sql += ' ORDER BY is_system_template DESC, nom ASC LIMIT 100';
  const rows = db.prepare(sql).all(...params);
  success(res, rows.map(parseFigurant));
});

// ── GET /api/figurants/:id — stats-bloc complet ───────────────────────────────
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);
  const row = db.prepare('SELECT * FROM figurant_templates WHERE id = ?').get(id);
  if (!row) return notFound(res);
  success(res, parseFigurant(row));
});

// ── POST /api/figurants — MJ : crée un template personnalisé ─────────────────
router.post('/', (req, res) => {
  if (!isMJ(req)) return forbidden(res);
  const { nom, faction, categorie, structure, blindage, degats, mf_disponible, competences_json, notes } = req.body;
  if (!nom || !String(nom).trim()) return validationError(res, 'Le nom est requis');

  const compJson = competences_json
    ? (typeof competences_json === 'string' ? competences_json : JSON.stringify(competences_json))
    : null;

  const result = db.prepare(`
    INSERT INTO figurant_templates (nom, faction, categorie, structure, blindage, degats, mf_disponible, competences_json, notes, is_system_template)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    String(nom).trim(),
    faction ?? null,
    categorie ?? null,
    Number.isInteger(Number(structure)) ? Number(structure) : 3,
    Number.isInteger(Number(blindage)) ? Number(blindage) : 0,
    degats ?? null,
    Number.isInteger(Number(mf_disponible)) ? Number(mf_disponible) : 0,
    compJson,
    notes ?? null,
  );

  const created = db.prepare('SELECT * FROM figurant_templates WHERE id = ?').get(result.lastInsertRowid);
  success(res, parseFigurant(created), 201);
});

// ── PATCH /api/figurants/:id — MJ : modifie un template personnalisé ──────────
router.patch('/:id', (req, res) => {
  if (!isMJ(req)) return forbidden(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);

  const row = db.prepare('SELECT id, is_system_template FROM figurant_templates WHERE id = ?').get(id);
  if (!row) return notFound(res);
  if (row.is_system_template) {
    return error(res, { code: 'SYSTEM_TEMPLATE_IMMUTABLE', message: 'Ce template système ne peut pas être modifié', status: 403 });
  }

  const allowed = ['nom', 'faction', 'categorie', 'structure', 'blindage', 'degats', 'mf_disponible', 'competences_json', 'notes'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const values = fields.map(f => {
    const v = req.body[f];
    if (f === 'competences_json' && v && typeof v === 'object') return JSON.stringify(v);
    return v ?? null;
  });
  const set = fields.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE figurant_templates SET ${set} WHERE id = ?`).run(...values, id);

  const updated = db.prepare('SELECT * FROM figurant_templates WHERE id = ?').get(id);
  success(res, parseFigurant(updated));
});

// ── DELETE /api/figurants/:id — MJ : supprime un template personnalisé ────────
router.delete('/:id', (req, res) => {
  if (!isMJ(req)) return forbidden(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);

  const row = db.prepare('SELECT id, is_system_template FROM figurant_templates WHERE id = ?').get(id);
  if (!row) return notFound(res);
  if (row.is_system_template) {
    return error(res, { code: 'SYSTEM_TEMPLATE_IMMUTABLE', message: 'Ce template système ne peut pas être supprimé', status: 403 });
  }

  db.prepare('DELETE FROM figurant_templates WHERE id = ?').run(id);
  success(res, { id });
});

export default router;
