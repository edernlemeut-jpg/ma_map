import { Router } from 'express';
import { success, validationError, notFound, forbidden, error } from '../utils/response.js';
import db from '../database.js';
import * as tablesService from '../services/tables.js';

const router = Router();

router.get('/count', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM game_tables').get();
  success(res, { count });
});

router.get('/active', (req, res) => {
  if (!req.table) {
    return success(res, null);
  }
  const table = db.prepare('SELECT id, name, mj_id FROM game_tables WHERE id = ?').get(req.table.id);
  if (!table) {
    return notFound(res, 'Table introuvable');
  }
  success(res, {
    id: table.id,
    name: table.name,
    role: req.table.role,
    is_mj: req.table.role === 'mj'
  });
});

router.post('/', (req, res) => {
  try {
    const table = tablesService.createTable(req.body.name, req.user.id);
    success(res, table, 201);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.get('/', (req, res) => {
  const tables = tablesService.listUserTables(req.user.id);
  success(res, tables);
});

router.post('/:id/join', (req, res) => {
  try {
    const result = tablesService.joinTable(req.body.invite_code, req.user.id);
    success(res, result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.patch('/:id/members/:userId', (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const memberId = Number(req.params.userId);
    const result = tablesService.updateMemberRole(tableId, memberId, req.body.role, req.user);
    success(res, result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

export default router;
