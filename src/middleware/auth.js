import { verifyToken } from '../services/auth.js';
import { authRequired, forbidden } from '../utils/response.js';
import db from '../database.js';

const WHITELIST = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
];

export default function authMiddleware(req, res, next) {
  if (WHITELIST.some(w => w.method === req.method && req.path === w.path)) {
    return next();
  }

  const token = req.cookies?.token;
  if (!token) {
    return authRequired(res);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return authRequired(res, 'Token invalide ou expiré');
  }

  // Attach full user from DB for /me route and downstream use
  const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    return authRequired(res, 'Utilisateur introuvable');
  }

  req.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: user.is_admin === 1
  };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return forbidden(res);
  }
  next();
}
