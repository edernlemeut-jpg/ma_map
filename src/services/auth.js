import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database.js';
import { JWT_SECRET } from '../config/index.js';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

export function register(username, password) {
  // Validation
  if (!username || typeof username !== 'string') {
    return { error: { code: 'VALIDATION_ERROR', message: 'Le pseudo est requis', status: 400 } };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Le pseudo doit contenir entre 3 et 30 caractères', status: 400 } };
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return { error: { code: 'VALIDATION_ERROR', message: 'Le mot de passe doit contenir au moins 8 caractères', status: 400 } };
  }

  // Check duplicate
  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(trimmed);
  if (existing) {
    return { error: { code: 'CONFLICT', message: 'Ce pseudo est déjà pris', status: 409 } };
  }

  // First user = admin
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const isAdmin = userCount === 0 ? 1 : 0;

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);

  let result;
  try {
    result = db.prepare(
      'INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)'
    ).run(trimmed, trimmed, passwordHash, isAdmin);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return { error: { code: 'CONFLICT', message: 'Ce pseudo est déjà pris', status: 409 } };
    }
    throw err;
  }

  return {
    data: {
      id: Number(result.lastInsertRowid),
      username: trimmed,
      display_name: trimmed,
      is_admin: isAdmin === 1,
      is_first_admin: isAdmin === 1
    }
  };
}

export function login(username, password) {
  if (!username || !password) {
    return { error: { code: 'INVALID_CREDENTIALS', message: 'Identifiants invalides', status: 401 } };
  }

  const user = db.prepare('SELECT id, username, display_name, password_hash, is_admin FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (!user) {
    return { error: { code: 'INVALID_CREDENTIALS', message: 'Identifiants invalides', status: 401 } };
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return { error: { code: 'INVALID_CREDENTIALS', message: 'Identifiants invalides', status: 401 } };
  }

  const token = generateToken(user);
  return {
    data: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      is_admin: user.is_admin === 1,
      token
    }
  };
}

export function generateToken(user) {
  return jwt.sign(
    { sub: user.id, is_admin: user.is_admin === 1 || user.is_admin === true },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
