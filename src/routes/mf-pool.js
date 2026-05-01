/**
 * mf-pool.js — API Metal Faktor Pool par table
 *
 * Mounts under /api/mf-pool
 * Epic 11 — Story 11.2
 *
 * GET  /api/mf-pool         — auth + table (crée ligne si absente)
 * POST /api/mf-pool/transfer — MJ: { delta, direction }
 * POST /api/mf-pool/reset    — MJ: remet pj=50, mj=0
 */

import { Router } from 'express';
import db from '../database.js';
import { getPool, transfer, reset } from '../services/mf-pool.js';
import { success, forbidden, validationError, error } from '../utils/response.js';

const router = Router();

function isMJ(req) {
  return req.table?.role === 'mj' || req.user?.is_admin;
}

function requireTable(req, res) {
  if (!req.table) {
    validationError(res, 'X-Table-Id requis');
    return false;
  }
  return true;
}

// GET /api/mf-pool — état du pool (+ initialise si absent)
router.get('/', (req, res) => {
  if (!requireTable(req, res)) return;
  const pool = getPool(req.table.id, db);
  success(res, pool);
});

// POST /api/mf-pool/transfer — transfère delta dés (MJ requis pour mj_to_pj ; membre suffit pour pj_to_mj)
router.post('/transfer', (req, res) => {
  if (!requireTable(req, res)) return;

  const { delta, direction } = req.body;
  if (!Number.isInteger(Number(delta)) || Number(delta) < 0) {
    return validationError(res, 'delta doit être un entier positif ou nul');
  }
  if (!['pj_to_mj', 'mj_to_pj'].includes(direction)) {
    return validationError(res, 'direction doit être pj_to_mj ou mj_to_pj');
  }

  // Seul le MJ peut retransférer des dés vers les joueurs (mj_to_pj)
  if (direction === 'mj_to_pj' && !isMJ(req)) {
    return forbidden(res, 'Seul le MJ peut transférer des dés vers les joueurs');
  }

  try {
    const pool = transfer(req.table.id, Number(delta), direction, db);
    success(res, pool);
  } catch (e) {
    if (e.code === 'MF_INSUFFICIENT') {
      return error(res, { code: 'MF_INSUFFICIENT', message: e.message, status: 400 });
    }
    throw e;
  }
});

// POST /api/mf-pool/reset — MJ: remet pj=50, mj=0
router.post('/reset', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const pool = reset(req.table.id, db);
  success(res, pool);
});

export default router;
