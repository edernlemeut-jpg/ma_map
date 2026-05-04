import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { success, validationError, forbidden, notFound } from '../utils/response.js';
import { getShipModels, updateShipModel } from '../services/compendium.js';
import db from '../database.js';

const router = Router();

const ALL_FIELDS = [
  'nom','classe','origine','tonnage','longueur',
  'vitesse_croisiere','vitesse_hyperspatiale','vitesse_tactique','autonomie',
  'blindage','coque','senseurs','senseurs_k','senseurs_us',
  'manoeuvrabilite','equipage','passagers','soute','prix',
  'image','armement_json','systemes_secondaires_json',
  'description','history','mj_notes','special_features'
];

// GET /api/ship-models  — all (admin needs no table; MJ/joueur needs table context)
router.get('/', (req, res) => {
  if (req.user.is_admin && !req.table) {
    // Admin without table: return all models (no visibility filter)
    const all = db.prepare(`SELECT ${ALL_FIELDS.map(f=>`sm.${f}`).join(', ')}, sm.id FROM ship_models sm ORDER BY lower(sm.nom)`).all();
    return success(res, all);
  }
  if (!req.table) return validationError(res, 'Aucune table sélectionnée');
  success(res, getShipModels(req.table.id, req.table.role));
});

// POST /api/ship-models  — admin only (global model creation)
router.post('/', (req, res) => {
  if (!req.user.is_admin) return forbidden(res, 'Seul un admin peut créer des modèles globaux');
  const nom = req.body.nom ? String(req.body.nom).trim() : '';
  if (!nom) return validationError(res, 'Le nom du modèle est requis');

  const id = randomUUID();
  const fields = { nom };
  for (const f of ALL_FIELDS) {
    if (f === 'nom') continue;
    if (req.body[f] !== undefined) fields[f] = req.body[f];
  }
  // Ensure JSON fields are strings
  for (const jf of ['armement_json', 'systemes_secondaires_json']) {
    if (fields[jf] !== undefined && typeof fields[jf] !== 'string') {
      fields[jf] = JSON.stringify(fields[jf]);
    }
    if (fields[jf] === undefined) fields[jf] = '[]';
  }

  const keys = ['id', ...Object.keys(fields)];
  const vals = [id, ...Object.values(fields)];
  db.prepare(`INSERT INTO ship_models (${keys.join(', ')}) VALUES (${keys.map(()=>'?').join(', ')})`).run(...vals);
  success(res, db.prepare('SELECT * FROM ship_models WHERE id = ?').get(id), 201);
});

// PATCH /api/ship-models/:id  — admin or MJ
router.patch('/:id', (req, res) => {
  if (!req.user.is_admin && (!req.table || req.table.role !== 'mj')) return forbidden(res);

  const id = req.params.id;
  const fields = req.body;
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return validationError(res, 'Aucun champ fourni');
  }
  if (fields.nom !== undefined && (!fields.nom || !String(fields.nom).trim())) {
    return validationError(res, 'Le champ "nom" ne peut pas être vide');
  }

  const numericFields = ['prix','blindage','coque','vitesse_croisiere','vitesse_hyperspatiale','autonomie'];
  for (const f of numericFields) {
    if (fields[f] !== undefined && fields[f] !== null && isNaN(Number(fields[f]))) {
      return validationError(res, `Le champ "${f}" doit être numérique`);
    }
  }

  const result = updateShipModel(id, fields);
  if (!result) return notFound(res);
  if (result.error) return validationError(res, result.error);
  success(res, result);
});

// DELETE /api/ship-models/:id  — admin only
router.delete('/:id', (req, res) => {
  if (!req.user.is_admin) return forbidden(res, 'Seul un admin peut supprimer un modèle global');
  const model = db.prepare('SELECT id FROM ship_models WHERE id = ?').get(req.params.id);
  if (!model) return notFound(res);
  db.prepare('DELETE FROM ship_models WHERE id = ?').run(req.params.id);
  success(res, { deleted: req.params.id });
});

export default router;

