import { Router } from 'express';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getFactions, updateFaction, createFaction } from '../services/compendium.js';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table && !req.user?.is_admin) {
    return validationError(res, 'Aucune table sélectionnée');
  }

  if (req.user?.is_admin && !req.table) {
    // Admin without table → return all factions with visible marker
    const all = db.prepare("SELECT id, name, short, description, icon, icon_url, color FROM factions ORDER BY name").all();
    return success(res, all.map(f => ({ ...f, visible: true })));
  }

  const data = getFactions(req.table.id, req.table.role);
  success(res, data);
});

router.post('/', (req, res) => {
  // Allow admin OR MJ in their table
  if (!req.user?.is_admin && (!req.table || req.table.role !== 'mj')) return forbidden(res);

  const { name, short, description, icon, icon_url, color } = req.body;
  if (!name || !String(name).trim()) return validationError(res, 'Le nom est requis');

  const result = createFaction({ name, short, description, icon, icon_url, color });
  if (!result) return validationError(res, 'Erreur lors de la création');
  success(res, result, 201);
});

router.patch('/:id', (req, res) => {
  if (!req.user?.is_admin && (!req.table || req.table.role !== 'mj')) return forbidden(res);

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);

  const fields = req.body;
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }
  if (fields.name !== undefined && (!fields.name || !String(fields.name).trim())) {
    return validationError(res, 'Le champ "name" ne peut pas être vide');
  }

  const result = updateFaction(id, fields);
  if (!result) return notFound(res);
  if (result.error) return validationError(res, result.error);
  success(res, result);
});

router.delete('/:id', (req, res) => {
  if (!req.user?.is_admin && (!req.table || req.table.role !== 'mj')) return forbidden(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return notFound(res);
  const row = db.prepare('SELECT id FROM factions WHERE id = ?').get(id);
  if (!row) return notFound(res);
  db.prepare('DELETE FROM factions WHERE id = ?').run(id);
  success(res, { deleted: id });
});

export default router;
