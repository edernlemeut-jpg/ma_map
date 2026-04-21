const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Vérifie le JWT dans le cookie "token"
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// Vérifie que l'utilisateur est MJ
function requireMJ(req, res, next) {
  if (req.user?.role !== 'mj') return res.status(403).json({ error: 'Accès réservé au MJ' });
  next();
}

// Vérifie que l'utilisateur est membre de la table (ou MJ propriétaire)
function requireTableAccess(req, res, next) {
  const { getDB } = require('./database');
  const d = getDB();
  const tableId = parseInt(req.params.tid || req.params.id);
  if (!tableId) return res.status(400).json({ error: 'Table ID manquant' });

  const table = d.prepare('SELECT * FROM game_tables WHERE id = ?').get(tableId);
  if (!table) return res.status(404).json({ error: 'Table introuvable' });

  const userId = req.user.id;
  const isMJ = table.mj_id === userId;
  const isMember = d.prepare('SELECT 1 FROM table_members WHERE table_id = ? AND user_id = ?').get(tableId, userId);

  if (!isMJ && !isMember) return res.status(403).json({ error: 'Pas membre de cette table' });

  req.gameTable = table;
  req.isMJ = isMJ;
  req.tableId = tableId;
  next();
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, displayName: user.display_name }, SECRET, { expiresIn: '30d' });
}

module.exports = { requireAuth, requireMJ, requireTableAccess, signToken };
