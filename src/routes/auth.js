import { Router } from 'express';
import * as authService from '../services/auth.js';
import { success, error as errorResponse } from '../utils/response.js';
import { NODE_ENV } from '../config/index.js';

const router = Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  const result = authService.register(username, password);

  if (result.error) {
    return errorResponse(res, result.error);
  }

  const message = result.data.is_first_admin
    ? 'Compte créé avec succès — vous êtes le premier administrateur !'
    : 'Compte créé avec succès';

  // Auto-login after register: generate token directly (no double-hash)
  const token = authService.generateToken({ id: result.data.id, is_admin: result.data.is_admin });
  setCookie(req, res, token);

  const { is_first_admin, ...userData } = result.data;
  success(res, { ...userData, message }, 201);
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = authService.login(username, password);

  if (result.error) {
    return errorResponse(res, result.error);
  }

  setCookie(req, res, result.data.token);

  const { token, ...userData } = result.data;
  success(res, userData);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const secure = isHttpsRequest(req);
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/'
  });
  success(res, { message: 'Déconnexion réussie' });
});

// GET /api/auth/me — protected by auth middleware (not whitelisted)
router.get('/me', (req, res) => {
  const user = req.user;
  success(res, {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: user.is_admin
  });
});

function setCookie(req, res, token) {
  const secure = isHttpsRequest(req);

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function isHttpsRequest(req) {
  if (NODE_ENV !== 'production') {
    return false;
  }

  if (req.secure) {
    return true;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  if (!forwardedProto) {
    return false;
  }

  return forwardedProto.split(',').map((v) => v.trim()).includes('https');
}

export default router;
