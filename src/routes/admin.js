import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { success, validationError, forbidden, notFound, error } from '../utils/response.js';
import { requireAdmin } from '../middleware/auth.js';
import db from '../database.js';

const router = Router();
router.use(requireAdmin);

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(
    `SELECT id, username, display_name, is_admin, avatar, created_at,
            (SELECT COUNT(*) FROM game_tables WHERE mj_id = u.id) AS tables_count
     FROM users u ORDER BY created_at DESC`
  ).all();
  success(res, users);
});

// POST /api/admin/users — create a user without touching the current session
router.post('/users', (req, res) => {
  const { username, display_name, password, is_admin: isAdmin } = req.body;

  if (!username || !password) return validationError(res, 'Pseudo et mot de passe requis');
  const un = String(username).trim();
  if (un.length < 3) return validationError(res, 'Pseudo trop court (min 3 caractères)');
  if (String(password).length < 8) return validationError(res, 'Mot de passe trop court (min 8 caractères)');

  const conflict = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(un);
  if (conflict) return validationError(res, 'Ce pseudo est déjà pris');

  const passwordHash = bcrypt.hashSync(String(password), 12);
  const dn = String(display_name || un).trim();
  const result = db.prepare(
    'INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)'
  ).run(un, dn, passwordHash, isAdmin ? 1 : 0);

  const created = db.prepare(
    'SELECT id, username, display_name, is_admin, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);
  success(res, created, 201);
});

// PATCH /api/admin/users/:id  — update name / password / avatar / is_admin
router.patch('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return notFound(res, 'Utilisateur introuvable');

  // Prevent self-downgrade (keep at least one admin)
  if (userId === req.user.id && req.body.is_admin === false) {
    return validationError(res, 'Vous ne pouvez pas retirer vos propres droits admin');
  }

  const sets = [];
  const vals = [];

  if (req.body.display_name !== undefined) {
    const dn = String(req.body.display_name).trim();
    if (!dn) return validationError(res, 'Le nom ne peut pas être vide');
    sets.push('display_name = ?'); vals.push(dn);
  }
  if (req.body.username !== undefined) {
    const un = String(req.body.username).trim();
    if (un.length < 3) return validationError(res, 'Pseudo trop court (min 3 car.)');
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(un, userId);
    if (conflict) return validationError(res, 'Ce pseudo est déjà pris');
    sets.push('username = ?'); vals.push(un);
  }
  if (req.body.password !== undefined) {
    const pwd = String(req.body.password);
    if (pwd.length < 8) return validationError(res, 'Mot de passe trop court (min 8)');
    sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(pwd, 12));
  }
  if (req.body.avatar !== undefined) {
    sets.push('avatar = ?'); vals.push(String(req.body.avatar || ''));
  }
  if (req.body.is_admin !== undefined) {
    sets.push('is_admin = ?'); vals.push(req.body.is_admin ? 1 : 0);
  }

  if (sets.length === 0) return validationError(res, 'Aucun champ à modifier');
  vals.push(userId);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT id, username, display_name, is_admin, avatar FROM users WHERE id = ?').get(userId);
  success(res, updated);
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id) return validationError(res, 'Impossible de supprimer son propre compte depuis l\'admin');
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return notFound(res, 'Utilisateur introuvable');

  // Cascade: delete tables where user is MJ (which cascades members + state + visibility)
  const mjTables = db.prepare('SELECT id FROM game_tables WHERE mj_id = ?').all(userId);
  for (const t of mjTables) {
    db.prepare('DELETE FROM game_tables WHERE id = ?').run(t.id);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  success(res, { deleted: userId });
});

// ── Tables ────────────────────────────────────────────────────────────────────

// GET /api/admin/tables
router.get('/tables', (req, res) => {
  const tables = db.prepare(
    `SELECT gt.id, gt.name, gt.description, gt.mj_id, gt.invite_code, gt.created_at,
            u.username AS mj_username, u.display_name AS mj_display_name,
            (SELECT COUNT(*) FROM table_members WHERE table_id = gt.id) AS members_count
     FROM game_tables gt
     JOIN users u ON u.id = gt.mj_id
     ORDER BY gt.created_at DESC`
  ).all();
  success(res, tables);
});

// PATCH /api/admin/tables/:id
router.patch('/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const table = db.prepare('SELECT id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) return notFound(res, 'Table introuvable');

  const sets = [];
  const vals = [];
  if (req.body.name !== undefined) {
    const n = String(req.body.name).trim();
    if (!n) return validationError(res, 'Le nom ne peut pas être vide');
    sets.push('name = ?'); vals.push(n);
  }
  if (req.body.description !== undefined) {
    sets.push('description = ?'); vals.push(String(req.body.description || ''));
  }
  if (sets.length === 0) return validationError(res, 'Aucun champ à modifier');
  vals.push(tableId);
  db.prepare(`UPDATE game_tables SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  success(res, db.prepare('SELECT id, name, description FROM game_tables WHERE id = ?').get(tableId));
});

// DELETE /api/admin/tables/:id
router.delete('/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const table = db.prepare('SELECT id FROM game_tables WHERE id = ?').get(tableId);
  if (!table) return notFound(res, 'Table introuvable');
  db.prepare('DELETE FROM game_tables WHERE id = ?').run(tableId);
  success(res, { deleted: tableId });
});

// GET /api/admin/tables/:id/members
router.get('/tables/:id/members', (req, res) => {
  const tableId = Number(req.params.id);
  const members = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar, tm.role
     FROM table_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.table_id = ? ORDER BY tm.role, u.username`
  ).all(tableId);
  success(res, members);
});

// ── Legacy import (kept for backward compat if used) ─────────────────────────
import { runImport } from '../services/import.js';

// GET /api/admin/quadrant-names
router.get('/quadrant-names', (req, res) => {
  try {
    const raw = readFileSync(join(process.cwd(), 'quadrants_MA.json'), 'utf8');
    const data = JSON.parse(raw);
    success(res, Object.keys(data).sort((a, b) => a.localeCompare(b, 'fr')));
  } catch {
    success(res, []);
  }
});

// ── Admin systems (global templates) ─────────────────────────────────────────

// GET /api/admin/systems
router.get('/systems', (req, res) => {
  const rows = db.prepare('SELECT id, quadrant, nom, data_json FROM admin_systems ORDER BY quadrant, nom').all();
  const data = rows.map(r => {
    let d = {};
    try { d = JSON.parse(r.data_json || '{}'); } catch {}
    return { id: r.id, quadrant: r.quadrant, nom: r.nom, ...d };
  });
  success(res, data);
});

// POST /api/admin/systems
router.post('/systems', (req, res) => {
  const { quadrant, nom, ...rest } = req.body;
  if (!quadrant || !nom) return validationError(res, 'quadrant et nom requis');
  const data_json = JSON.stringify(rest || {});
  const result = db.prepare(
    'INSERT INTO admin_systems (quadrant, nom, data_json) VALUES (?, ?, ?)'
  ).run(String(quadrant).trim(), String(nom).trim(), data_json);
  success(res, { id: Number(result.lastInsertRowid), quadrant, nom, ...rest }, 201);
});

// PATCH /api/admin/systems/:id
router.patch('/systems/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, quadrant, nom, data_json FROM admin_systems WHERE id = ?').get(id);
  if (!row) return notFound(res, 'Système introuvable');

  let d = {};
  try { d = JSON.parse(row.data_json || '{}'); } catch {}

  const { quadrant, nom, ...rest } = req.body;
  const newQuadrant = quadrant !== undefined ? String(quadrant).trim() : row.quadrant;
  const newNom = nom !== undefined ? String(nom).trim() : row.nom;
  Object.assign(d, rest);

  db.prepare('UPDATE admin_systems SET quadrant = ?, nom = ?, data_json = ? WHERE id = ?').run(newQuadrant, newNom, JSON.stringify(d), id);
  success(res, { id, quadrant: newQuadrant, nom: newNom, ...d });
});

// DELETE /api/admin/systems/:id
router.delete('/systems/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM admin_systems WHERE id = ?').get(id);
  if (!row) return notFound(res, 'Système introuvable');
  db.prepare('DELETE FROM admin_systems WHERE id = ?').run(id);
  success(res, { deleted: id });
});

router.post('/import', async (req, res) => {
  const data = req.body;
  if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
    return validationError(res, 'Corps JSON invalide');
  }
  try {
    const report = await runImport(data);
    success(res, report);
  } catch (err) {
    console.error('Import error:', err);
    validationError(res, 'Erreur lors de l\'import');
  }
});

export default router;

