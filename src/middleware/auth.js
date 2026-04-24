import { verifyToken } from '../services/auth.js';
import { authRequired, forbidden } from '../utils/response.js';
import db from '../database.js';

const WHITELIST = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
  // Rules compendium — public read access
  { method: 'GET', path: '/api/rules', prefix: true },
  // Legacy redirect pages — accessible sans auth (bookmarks anciens)
  { method: 'GET', path: '/compendium.html' },
  { method: 'GET', path: '/peril.html' },
  { method: 'GET', path: '/personnage.html' },
  { method: 'GET', path: '/revolte.html' },
  { method: 'GET', path: '/calendrier.html' },
  // Characters ref-data — requiert une auth pour filtrer la visibilité des origines par faction
  // { method: 'GET', path: '/api/characters/ref-data' },  ← supprimé intentionnellement
];

export default function authMiddleware(req, res, next) {
  if (WHITELIST.some(w => w.method === req.method && (w.prefix ? req.path.startsWith(w.path) : req.path === w.path))) {
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
  const user = db.prepare('SELECT id, username, display_name, is_admin, avatar, profile_role FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    return authRequired(res, 'Utilisateur introuvable');
  }

  req.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: user.is_admin === 1,
    avatar: user.avatar || null,
    profile_role: user.profile_role || null
  };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return forbidden(res);
  }
  next();
}
