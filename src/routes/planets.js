/**
 * planets.js — CRUD pour les planètes/astres d'un système stellaire.
 * GET  /api/planets?system_id=X   → liste des planètes du système
 * GET  /api/planets/:id           → détail
 * POST /api/planets               → créer (MJ only)
 * PATCH  /api/planets/:id         → modifier (MJ only)
 * DELETE /api/planets/:id         → supprimer (MJ only)
 */
import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import authMiddleware from '../middleware/auth.js';
import db from '../database.js';

const COLS = 'id, system_id, nom, type, ordre_orbital, taille, atmosphere, gouvernement, population, ressources, description, notes_mj, orbit_period_days, position_initiale, created_at, updated_at';

const EDITABLE = ['nom','type','ordre_orbital','taille','atmosphere','gouvernement','population','ressources','description','notes_mj','orbit_period_days','position_initiale'];

const router = Router();
router.use(authMiddleware);

// Helper: check MJ or admin
function isMJorAdmin(req) {
  if (req.user?.is_admin) return true;
  return req.table?.role === 'mj';
}

// GET /api/planets?system_id=X
router.get('/', (req, res) => {
  const systemId = req.query.system_id ? Number(req.query.system_id) : null;
  if (systemId) {
    const planets = db.prepare(`SELECT ${COLS} FROM planets WHERE system_id = ? ORDER BY ordre_orbital, nom`).all(systemId);
    return success(res, planets);
  }
  // Admin or MJ can get all
  if (!isMJorAdmin(req)) return forbidden(res);
  const planets = db.prepare(`SELECT ${COLS} FROM planets ORDER BY system_id, ordre_orbital, nom`).all();
  success(res, planets);
});

// GET /api/planets/:id
router.get('/:id', (req, res) => {
  const planet = db.prepare(`SELECT ${COLS} FROM planets WHERE id = ?`).get(Number(req.params.id));
  if (!planet) return notFound(res, 'Planète introuvable');
  success(res, planet);
});

// POST /api/planets
router.post('/', (req, res) => {
  if (!isMJorAdmin(req)) return forbidden(res);

  const { system_id, nom, ...rest } = req.body;
  if (!system_id || !nom?.toString().trim()) {
    return validationError(res, 'Les champs system_id et nom sont requis');
  }
  const sys = db.prepare('SELECT id FROM systems WHERE id = ?').get(Number(system_id));
  if (!sys) return validationError(res, 'Système introuvable');

  const fields = { system_id: Number(system_id), nom: String(nom).trim() };
  for (const k of EDITABLE) {
    if (k !== 'nom' && rest[k] !== undefined) fields[k] = rest[k];
  }

  const keys = Object.keys(fields);
  const result = db.prepare(
    `INSERT INTO planets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...Object.values(fields));

  const created = db.prepare(`SELECT ${COLS} FROM planets WHERE id = ?`).get(result.lastInsertRowid);
  success(res, created, 201);
});

// PATCH /api/planets/:id
router.patch('/:id', (req, res) => {
  if (!isMJorAdmin(req)) return forbidden(res);

  const id = Number(req.params.id);
  const planet = db.prepare('SELECT id FROM planets WHERE id = ?').get(id);
  if (!planet) return notFound(res, 'Planète introuvable');

  const entries = Object.entries(req.body).filter(([k]) => EDITABLE.includes(k));
  if (!entries.length) return validationError(res, 'Aucun champ valide à modifier');

  if (req.body.nom !== undefined && !String(req.body.nom).trim()) {
    return validationError(res, 'Le nom ne peut pas être vide');
  }

  const sets = entries.map(([k]) => `${k} = ?`);
  sets.push("updated_at = datetime('now')");
  const vals = [...entries.map(([, v]) => v), id];
  db.prepare(`UPDATE planets SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  success(res, db.prepare(`SELECT ${COLS} FROM planets WHERE id = ?`).get(id));
});

// DELETE /api/planets/:id
router.delete('/:id', (req, res) => {
  if (!isMJorAdmin(req)) return forbidden(res);
  const id = Number(req.params.id);
  const planet = db.prepare('SELECT id FROM planets WHERE id = ?').get(id);
  if (!planet) return notFound(res, 'Planète introuvable');
  db.prepare('DELETE FROM planets WHERE id = ?').run(id);
  success(res, { deleted: id });
});

export default router;
