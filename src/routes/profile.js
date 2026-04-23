import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { success, validationError, notFound } from '../utils/response.js';
import db from '../database.js';
import * as tablesService from '../services/tables.js';

const router = Router();

// GET /api/profile  — current user + their tables
router.get('/', (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, is_admin, avatar, created_at, profile_role FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return notFound(res, 'Utilisateur introuvable');

  const tables = tablesService.listUserTables(req.user.id);
  success(res, { ...user, tables });
});

// PATCH /api/profile  — update display_name, password, avatar
router.patch('/', (req, res) => {
  const sets = [];
  const vals = [];

  if (req.body.display_name !== undefined) {
    const dn = String(req.body.display_name).trim();
    if (!dn) return validationError(res, 'Le nom ne peut pas être vide');
    sets.push('display_name = ?'); vals.push(dn);
  }
  if (req.body.password !== undefined) {
    const pwd = String(req.body.password);
    if (pwd.length < 8) return validationError(res, 'Mot de passe trop court (min 8 caractères)');
    sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(pwd, 12));
  }
  if (req.body.avatar !== undefined) {
    sets.push('avatar = ?'); vals.push(String(req.body.avatar || ''));
  }

  if (sets.length === 0) return validationError(res, 'Aucun champ à modifier');
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT id, username, display_name, is_admin, avatar FROM users WHERE id = ?').get(req.user.id);
  success(res, updated);
});

// DELETE /api/profile  — delete own account + MJ tables cascade
router.delete('/', (req, res) => {
  // Prevent the last admin from deleting itself
  if (req.user.is_admin) {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1").get().c;
    if (adminCount <= 1) {
      return validationError(res, 'Impossible de supprimer le dernier compte administrateur');
    }
  }

  // Cascade: delete tables where user is MJ
  const mjTables = db.prepare('SELECT id FROM game_tables WHERE mj_id = ?').all(req.user.id);
  for (const t of mjTables) {
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

  // Clear auth cookie
  res.clearCookie('token');
  success(res, { deleted: req.user.id });
});

// DELETE /api/profile/tables/:id  — leave (player) or delete (MJ)
router.delete('/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const member = db.prepare(
    'SELECT tm.role, gt.mj_id FROM table_members tm JOIN game_tables gt ON gt.id = tm.table_id WHERE tm.table_id = ? AND tm.user_id = ?'
  ).get(tableId, req.user.id);

  if (!member) return notFound(res, 'Table introuvable ou non accessible');

  if (member.role === 'mj') {
    // MJ deletes the whole table
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(tableId);
    success(res, { action: 'deleted', tableId });
  } else {
    // Player leaves
    db.prepare('DELETE FROM table_members WHERE table_id = ? AND user_id = ?').run(tableId, req.user.id);
    success(res, { action: 'left', tableId });
  }
});

// PATCH /api/profile/tables/:id  — rename table (MJ only)
router.patch('/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const member = db.prepare(
    'SELECT tm.role FROM table_members tm WHERE tm.table_id = ? AND tm.user_id = ?'
  ).get(tableId, req.user.id);

  if (!member || member.role !== 'mj') return notFound(res, 'Table introuvable ou droits insuffisants');

  const name = req.body.name ? String(req.body.name).trim() : null;
  const desc = req.body.description !== undefined ? String(req.body.description || '') : null;

  const sets = [];
  const vals = [];
  if (name) { sets.push('name = ?'); vals.push(name); }
  if (desc !== null) { sets.push('description = ?'); vals.push(desc); }
  if (!sets.length) return validationError(res, 'Aucun champ à modifier');
  vals.push(tableId);
  db.prepare(`UPDATE game_tables SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  success(res, db.prepare('SELECT id, name, description FROM game_tables WHERE id = ?').get(tableId));
});

export default router;
