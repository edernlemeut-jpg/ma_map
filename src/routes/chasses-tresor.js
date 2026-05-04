/**
 * chasses-tresor.js — API Chasses au Trésor (supplément TdM)
 *
 * Mounts under /api/chasses-tresor
 *
 * GET    /               — liste les chasses de la table (MJ + joueurs)
 * POST   /               — crée une chasse (MJ uniquement)
 * GET    /:id            — détail complet d'une chasse
 * PUT    /:id            — met à jour (MJ uniquement)
 * DELETE /:id            — supprime (MJ uniquement)
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../database.js';
import { success, notFound, forbidden, validationError } from '../utils/response.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMJ(req) {
  return req.table?.role === 'mj' || req.user?.is_admin;
}

function requireTable(req, res) {
  if (!req.table) {
    validationError(res, 'X-Table-Id requis');
    return false;
  }
  return true;
}

function parseChasse(row) {
  let carte = {}, tresor = {}, antre = {};
  try { carte  = row.carte_json  ? JSON.parse(row.carte_json)  : {}; } catch { /* keep empty */ }
  try { tresor = row.tresor_json ? JSON.parse(row.tresor_json) : {}; } catch { /* keep empty */ }
  try { antre  = row.antre_json  ? JSON.parse(row.antre_json)  : {}; } catch { /* keep empty */ }
  return {
    id:         row.id,
    table_id:   row.table_id,
    nom:        row.nom,
    statut:     row.statut,
    difficulte: row.difficulte ?? null,
    nb_seances: row.nb_seances ?? null,
    carte,
    tresor,
    antre,
    notes:      row.notes ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── GET / — liste des chasses de la table ────────────────────────────────────
router.get('/', (req, res) => {
  if (!requireTable(req, res)) return;
  const rows = db.prepare(
    `SELECT * FROM chasses_tresor WHERE table_id = ? ORDER BY created_at DESC`
  ).all(req.table.id);
  success(res, rows.map(parseChasse));
});

// ── GET /:id — détail complet ────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  const row = db.prepare(
    `SELECT * FROM chasses_tresor WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!row) return notFound(res);
  success(res, parseChasse(row));
});

// ── POST / — créer une chasse ─────────────────────────────────────────────────
router.post('/', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const { nom, statut, difficulte, nb_seances, carte, tresor, antre, notes } = req.body;
  if (!nom || !String(nom).trim()) return validationError(res, 'Le nom est requis');

  const validStatuts = ['en_cours', 'terminee', 'abandonnee'];
  const statut_ = validStatuts.includes(statut) ? statut : 'en_cours';

  const id = randomUUID();
  db.prepare(`
    INSERT INTO chasses_tresor
      (id, table_id, nom, statut, difficulte, nb_seances, carte_json, tresor_json, antre_json, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.table.id,
    String(nom).trim(),
    statut_,
    difficulte != null ? Number(difficulte) : null,
    nb_seances != null ? Number(nb_seances) : null,
    carte  ? JSON.stringify(carte)  : '{}',
    tresor ? JSON.stringify(tresor) : '{}',
    antre  ? JSON.stringify(antre)  : '{}',
    notes  ? String(notes).trim()   : null,
    req.user.id,
  );

  const row = db.prepare('SELECT * FROM chasses_tresor WHERE id = ?').get(id);
  success(res, parseChasse(row));
});

// ── PUT /:id — mettre à jour ──────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const existing = db.prepare(
    `SELECT id FROM chasses_tresor WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!existing) return notFound(res);

  const { nom, statut, difficulte, nb_seances, carte, tresor, antre, notes } = req.body;
  const validStatuts = ['en_cours', 'terminee', 'abandonnee'];

  const fields = [];
  const params = [];

  if (nom !== undefined) { fields.push('nom = ?'); params.push(String(nom).trim()); }
  if (statut !== undefined && validStatuts.includes(statut)) { fields.push('statut = ?'); params.push(statut); }
  if (difficulte !== undefined) { fields.push('difficulte = ?'); params.push(difficulte != null ? Number(difficulte) : null); }
  if (nb_seances !== undefined) { fields.push('nb_seances = ?'); params.push(nb_seances != null ? Number(nb_seances) : null); }
  if (carte  !== undefined) { fields.push('carte_json = ?');  params.push(JSON.stringify(carte)); }
  if (tresor !== undefined) { fields.push('tresor_json = ?'); params.push(JSON.stringify(tresor)); }
  if (antre  !== undefined) { fields.push('antre_json = ?');  params.push(JSON.stringify(antre)); }
  if (notes  !== undefined) { fields.push('notes = ?'); params.push(notes != null ? String(notes).trim() : null); }

  if (fields.length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  fields.push("updated_at = datetime('now')");
  params.push(req.params.id, req.table.id);

  db.prepare(`UPDATE chasses_tresor SET ${fields.join(', ')} WHERE id = ? AND table_id = ?`).run(...params);

  const row = db.prepare('SELECT * FROM chasses_tresor WHERE id = ?').get(req.params.id);
  success(res, parseChasse(row));
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const result = db.prepare(
    `DELETE FROM chasses_tresor WHERE id = ? AND table_id = ?`
  ).run(req.params.id, req.table.id);

  if (result.changes === 0) return notFound(res);
  success(res, { deleted: req.params.id });
});

export default router;
