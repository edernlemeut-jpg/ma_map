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

// PATCH /api/tables/:id/px — MJ attribue des PX à la table, les personnages PJ l'accumulent
router.patch('/:id/px', (req, res) => {
  const tableId = Number(req.params.id);
  // Vérifier que l'utilisateur est bien MJ de cette table
  const membership = db.prepare(
    "SELECT role FROM table_members WHERE table_id = ? AND user_id = ?"
  ).get(tableId, req.user.id);
  const tableRow = db.prepare("SELECT mj_id FROM game_tables WHERE id = ?").get(tableId);
  const isMJRole = membership?.role === 'mj' || tableRow?.mj_id === req.user.id || req.user?.is_admin;
  if (!isMJRole) return error(res, { code: 'FORBIDDEN', message: 'Seul le MJ peut attribuer des PX', status: 403 });

  const delta = parseInt(req.body.delta ?? 0);
  if (!Number.isFinite(delta) || delta === 0) return error(res, { code: 'VALIDATION', message: 'delta doit être un entier non nul', status: 400 });

  db.prepare("UPDATE game_tables SET px_table = MAX(0, px_table + ?) WHERE id = ?").run(delta, tableId);
  const { px_table } = db.prepare("SELECT px_table FROM game_tables WHERE id = ?").get(tableId);

  // Créditer / débiter chaque PJ de la table
  const pjRows = db.prepare("SELECT id, data_json FROM characters WHERE table_id = ? AND type = 'pj'").all(tableId);
  const stmt = db.prepare("UPDATE characters SET data_json = ?, updated_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  for (const row of pjRows) {
    let d = {};
    try { d = JSON.parse(row.data_json); } catch { /* ignore */ }
    d.px_actuel = Math.max(0, (d.px_actuel ?? 0) + delta);
    if (delta > 0) d.px_total = (d.px_total ?? 0) + delta;
    stmt.run(JSON.stringify(d), now, row.id);
  }

  success(res, { px_table, credited_count: pjRows.length });
});

// GET /api/tables/:id/px — retourne le total PX de la table
router.get('/:id/px', (req, res) => {
  const tableId = Number(req.params.id);
  const row = db.prepare("SELECT px_table FROM game_tables WHERE id = ?").get(tableId);
  if (!row) return error(res, { code: 'NOT_FOUND', message: 'Table introuvable', status: 404 });
  success(res, { px_table: row.px_table ?? 0 });
});

export default router;
