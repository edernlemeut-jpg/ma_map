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
  const table = db.prepare('SELECT id, name, mj_id, invite_code FROM game_tables WHERE id = ?').get(req.table.id);
  if (!table) {
    return notFound(res, 'Table introuvable');
  }
  const is_mj = req.table.role === 'mj';
  success(res, {
    id: table.id,
    name: table.name,
    role: req.table.role,
    is_mj,
    invite_code: is_mj ? table.invite_code : undefined
  });
});

router.post('/', (req, res) => {
  if (req.user.profile_role === 'joueur') {
    return forbidden(res, 'Les joueurs ne peuvent pas créer de table. Créez un second compte si vous souhaitez être MJ.');
  }
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
  res.json({ data: tables, profile_role: req.user.profile_role || null });
});

// Join via invite code (no table id required — uses invite_code from body)
router.post('/join', (req, res) => {
  if (req.user.profile_role === 'mj') {
    return forbidden(res, 'Un MJ ne peut pas rejoindre une table comme joueur. Créez un second compte si vous souhaitez jouer.');
  }
  try {
    const result = tablesService.joinTable(req.body.invite_code, req.user.id);
    // Return table id and role so the client can set active table
    const tables = tablesService.listUserTables(req.user.id);
    const joined = tables.find(t => t.id === result.table_id);
    success(res, joined || result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.post('/:id/join', (req, res) => {
  if (req.user.profile_role === 'mj') {
    return forbidden(res, 'Un MJ ne peut pas rejoindre une table comme joueur. Créez un second compte si vous souhaitez jouer.');
  }
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

router.get('/:id/members', (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const members = tablesService.listMembers(tableId, req.user.id);
    success(res, members);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.post('/:id/regenerate-invite', (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const result = tablesService.regenerateInvite(tableId, req.user.id);
    success(res, result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.delete('/:id/members/:userId', (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const targetId = Number(req.params.userId);
    const result = tablesService.kickMember(tableId, targetId, req.user.id);
    success(res, result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

router.delete('/:id/leave', (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const result = tablesService.leaveTable(tableId, req.user.id);
    success(res, result);
  } catch (err) {
    if (err.status) return error(res, err);
    error(res, { code: 'SERVER_ERROR', message: 'Erreur serveur', status: 500 });
  }
});

export default router;
