/**
 * secondary-systems.js — CRUD catalogue Systèmes Secondaires (admin pour mutations)
 *
 * Mounts under /api/secondary-systems
 * Lecture accessible à tous les utilisateurs authentifiés.
 * Création / modification / suppression réservées aux admins.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { success, notFound, forbidden, validationError } from '../utils/response.js';
import { getSecondarySystems } from '../services/compendium.js';
import db from '../database.js';

const router = Router();

const ALL_FIELDS = [
  'nom', 'categorie', 'localisation', 'installation',
  'disponibilite', 'prix_10t', 'prix_100t', 'prix_1000t', 'prix_10000t',
  'description', 'source_livre', 'faction_id', 'stat_modifiers_json'
];

// GET /api/secondary-systems — catalogue complet (tous les utilisateurs authentifiés)
router.get('/', (req, res) => {
  // Admin without table: return all, no visibility filter
  if (req.user?.is_admin && !req.table) {
    const rows = db.prepare(
      `SELECT id, nom, categorie, localisation, installation,
              disponibilite, prix_10t, prix_100t, prix_1000t, prix_10000t,
              description, source_livre, faction_id, stat_modifiers_json, created_at
         FROM secondary_systems
        ORDER BY lower(nom)`
    ).all();
    return success(res, rows);
  }
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  return success(res, getSecondarySystems(req.table.id, req.table.role));
});

// GET /api/secondary-systems/:id — détail d'un système
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT *, faction_id FROM secondary_systems WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return success(res, row);
});

// POST /api/secondary-systems — création (admin uniquement)
router.post('/', (req, res) => {
  if (!req.user?.is_admin) return forbidden(res, 'Seul un admin peut créer des systèmes secondaires');

  const nom = req.body.nom ? String(req.body.nom).trim() : '';
  if (!nom) return validationError(res, 'Le nom du système est requis');

  const id = randomUUID();
  const fields = { nom };

  for (const f of ALL_FIELDS) {
    if (f === 'nom') continue;
    if (req.body[f] !== undefined) {
      fields[f] = req.body[f] === '' ? null : req.body[f];
    }
  }

  // Coerce numeric fields
  for (const nf of ['installation', 'prix_10t', 'prix_100t', 'prix_1000t', 'prix_10000t']) {
    if (fields[nf] !== undefined && fields[nf] !== null) {
      const n = Number(fields[nf]);
      if (isNaN(n)) return validationError(res, `Le champ "${nf}" doit être numérique`);
      fields[nf] = n;
    }
  }

  const keys = ['id', ...Object.keys(fields)];
  const vals = [id, ...Object.values(fields)];
  db.prepare(`INSERT INTO secondary_systems (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...vals);

  const created = db.prepare('SELECT * FROM secondary_systems WHERE id = ?').get(id);
  return success(res, created, 201);
});

// PATCH /api/secondary-systems/:id — mise à jour (admin uniquement)
router.patch('/:id', (req, res) => {
  if (!req.user?.is_admin) return forbidden(res, 'Seul un admin peut modifier les systèmes secondaires');

  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM secondary_systems WHERE id = ?').get(id);
  if (!existing) return notFound(res);

  const body = req.body;
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }
  if (body.nom !== undefined && !String(body.nom).trim()) {
    return validationError(res, 'Le champ "nom" ne peut pas être vide');
  }

  const updates = {};
  for (const f of ALL_FIELDS) {
    if (body[f] !== undefined) {
      updates[f] = body[f] === '' ? null : body[f];
    }
  }

  // Coerce numeric fields
  for (const nf of ['installation', 'prix_10t', 'prix_100t', 'prix_1000t', 'prix_10000t']) {
    if (updates[nf] !== undefined && updates[nf] !== null) {
      const n = Number(updates[nf]);
      if (isNaN(n)) return validationError(res, `Le champ "${nf}" doit être numérique`);
      updates[nf] = n;
    }
  }

  if (Object.keys(updates).length === 0) return validationError(res, 'Aucun champ valide fourni');

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE secondary_systems SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);

  const updated = db.prepare('SELECT * FROM secondary_systems WHERE id = ?').get(id);
  return success(res, updated);
});

// DELETE /api/secondary-systems/:id — suppression (admin uniquement)
router.delete('/:id', (req, res) => {
  if (!req.user?.is_admin) return forbidden(res, 'Seul un admin peut supprimer des systèmes secondaires');

  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM secondary_systems WHERE id = ?').get(id);
  if (!existing) return notFound(res);

  db.prepare('DELETE FROM secondary_systems WHERE id = ?').run(id);
  return success(res, { deleted: id });
});

export default router;
