import { Router } from 'express';
import { success, notFound, forbidden, validationError } from '../utils/response.js';
import * as rules from '../services/rules-service.js';

const router = Router();

const CATEGORIES = ['competences', 'qualites', 'defauts', 'mutations', 'actions', 'sorcelleries'];

// GET /api/rules  — list all visible entries
// Query: ?category=competences&table_id=...
router.get('/', (req, res) => {
  const { category } = req.query;
  if (category && !CATEGORIES.includes(category)) {
    return validationError(res, `Catégorie invalide. (${CATEGORIES.join(', ')})`);
  }

  // Active table from middleware (may be null for anonymous / no active table)
  const tableId = req.tableContext?.tableId ?? null;
  const entries = rules.listRules({ tableId, category: category || null });
  success(res, entries);
});

// GET /api/rules/:id
router.get('/:id', (req, res) => {
  const entry = rules.getRule(req.params.id);
  if (!entry) return notFound(res, 'Entrée introuvable');

  // Table-scoped entries are only visible to table members
  if (entry.table_id && entry.table_id !== (req.tableContext?.tableId ?? null) && !req.user?.is_admin) {
    return forbidden(res, 'Accès refusé');
  }
  success(res, entry);
});

// POST /api/rules  — create (MJ for table-scoped, admin for global)
router.post('/', (req, res) => {
  const user = req.user;
  if (!user) return forbidden(res, 'Authentification requise');
  if (!user.is_admin && user.profile_role !== 'mj') {
    return forbidden(res, 'Seuls les MJ et administrateurs peuvent créer des entrées.');
  }

  const { category, name, description, extra } = req.body;
  if (!category || !CATEGORIES.includes(category)) return validationError(res, 'Catégorie invalide');
  if (!name?.trim()) return validationError(res, 'Le nom est requis');

  // Admin creates global entries; MJ creates table-scoped
  const tableId = user.is_admin ? null : (req.tableContext?.tableId ?? null);
  if (!user.is_admin && !tableId) {
    return validationError(res, 'Sélectionnez une table pour créer une entrée maison.');
  }

  const entry = rules.createRule({ category, name: name.trim(), description, extra, tableId, createdBy: user.id });
  success(res, entry, 201);
});

// PUT /api/rules/:id  — update
router.put('/:id', (req, res) => {
  const user = req.user;
  if (!user) return forbidden(res, 'Authentification requise');
  if (!user.is_admin && user.profile_role !== 'mj') return forbidden(res, 'Permission refusée');

  const { name, description, extra } = req.body;
  const updated = rules.updateRule(req.params.id, { name, description, extra }, user);
  if (updated === null) return forbidden(res, 'Entrée introuvable ou permission refusée');
  success(res, updated);
});

// DELETE /api/rules/:id
router.delete('/:id', (req, res) => {
  const user = req.user;
  if (!user) return forbidden(res, 'Authentification requise');
  if (!user.is_admin && user.profile_role !== 'mj') return forbidden(res, 'Permission refusée');

  const ok = rules.deleteRule(req.params.id, user);
  if (!ok) return forbidden(res, 'Entrée introuvable ou permission refusée');
  success(res, { deleted: true });
});

export default router;
