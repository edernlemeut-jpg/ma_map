/**
 * mf-pool.js — Service Metal Faktor Pool (atomique)
 *
 * - getPool(tableId, db)      → { pj_pool, mj_pool } — crée la ligne si absente
 * - transfer(tableId, delta, direction, db)  → { pj_pool, mj_pool } — atomique
 * - reset(tableId, db)        → { pj_pool: 50, mj_pool: 0 }
 *
 * Epic 11 — Story 11.2
 */

export const MF_TOTAL = 50;

/**
 * Retourne l'état du pool (crée la ligne si nécessaire).
 */
export function getPool(tableId, db) {
  db.prepare(
    'INSERT OR IGNORE INTO mf_pool (table_id, pj_pool, mj_pool) VALUES (?, ?, ?)'
  ).run(tableId, MF_TOTAL, 0);
  return db.prepare('SELECT pj_pool, mj_pool, updated_at FROM mf_pool WHERE table_id = ?').get(tableId);
}

/**
 * Transfère delta dés entre pj_pool et mj_pool, atomiquement.
 *
 * direction: 'pj_to_mj' | 'mj_to_pj'
 * Retourne { pj_pool, mj_pool } mis à jour.
 * Lance une Error avec code 'MF_INSUFFICIENT' si le résultat serait < 0.
 */
export function transfer(tableId, delta, direction, db) {
  if (!Number.isInteger(delta) || delta < 0) {
    const e = new Error('delta must be a non-negative integer');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }

  // Double validation applicative avant transaction
  const current = getPool(tableId, db);
  const { pj_pool, mj_pool } = current;

  let newPj, newMj;
  if (direction === 'pj_to_mj') {
    newPj = pj_pool - delta;
    newMj = mj_pool + delta;
  } else if (direction === 'mj_to_pj') {
    newPj = pj_pool + delta;
    newMj = mj_pool - delta;
  } else {
    const e = new Error('direction doit être pj_to_mj ou mj_to_pj');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }

  if (newPj < 0 || newMj < 0) {
    const e = new Error('Fonds MF insuffisants pour ce transfert');
    e.code = 'MF_INSUFFICIENT';
    throw e;
  }

  // Transaction atomique
  const txn = db.transaction(() => {
    db.prepare(
      'UPDATE mf_pool SET pj_pool = ?, mj_pool = ?, updated_at = datetime(\'now\') WHERE table_id = ?'
    ).run(newPj, newMj, tableId);
  });
  txn();

  return db.prepare('SELECT pj_pool, mj_pool, updated_at FROM mf_pool WHERE table_id = ?').get(tableId);
}

/**
 * Remet le pool à l'état initial (pj=50, mj=0), atomiquement.
 */
export function reset(tableId, db) {
  const txn = db.transaction(() => {
    db.prepare(
      'UPDATE mf_pool SET pj_pool = ?, mj_pool = 0, updated_at = datetime(\'now\') WHERE table_id = ?'
    ).run(MF_TOTAL, tableId);
  });
  txn();

  return db.prepare('SELECT pj_pool, mj_pool, updated_at FROM mf_pool WHERE table_id = ?').get(tableId);
}
