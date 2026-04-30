/**
 * combat-spatial.js — API Combat Spatial
 *
 * Mounts under /api/combat-spatial
 *
 * GET    /                        — liste les combats de la table
 * POST   /                        — crée un combat (MJ uniquement)
 * GET    /:id                     — détail complet + vaisseaux
 * PATCH  /:id                     — met à jour phase/config/champ/notes/statut (MJ)
 * PATCH  /:id/ships/:shipId       — déplace / met à jour un vaisseau (MJ)
 * POST   /:id/ships               — ajoute un vaisseau (MJ)
 * DELETE /:id/ships/:shipId       — retire un vaisseau (MJ)
 * DELETE /:id                     — supprime le combat (MJ)
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../database.js';
import { success, notFound, forbidden, validationError } from '../utils/response.js';

const router = Router();

// ── Constantes ────────────────────────────────────────────────────────────────

const VALID_PHASES = ['approche', 'tournoyant', 'poursuite', 'abordage'];
const VALID_STATUTS = ['en_cours', 'termine', 'abandonne'];
const VALID_CONFIGURATIONS = [
  'face-a-face', 'filature', 'interception-reussie',
  'interception-ratee', 'accostage', 'combat-orbital',
  'combat-hyperspatial', 'combat-monstrueux',
];
const VALID_CHAMPS = ['espace-profond', 'orbite', 'asteroides', 'hyperespace'];
const VALID_CAMPS = ['joueurs', 'ennemis', 'neutres'];
const VALID_TRAJECTOIRES = ['attaque', 'interception'];
const VALID_ORIENTATIONS = ['vers0', 'vers500'];
const VALID_CLASSES = ['chasseur', 'frégate', 'croiseur', 'inconnu'];

// Transition de phase : ordre imposé, irréversible
const PHASE_ORDER = { approche: 0, tournoyant: 1, poursuite: 2, abordage: 3 };

// Positions initiales selon configuration (paires [trajectoire, position_k])
const INITIAL_POSITIONS = {
  'face-a-face':          [['attaque', 200], ['attaque', -200]],
  'filature':             [['attaque', 100], ['attaque', 225]],
  'interception-reussie': [['attaque', 0],   ['interception', 0]],
  'interception-ratee':   [['attaque', 200], ['interception', 200]],
  'accostage':            [['attaque', 0],   ['attaque', 0]],
  'combat-orbital':       [['attaque', 150], ['interception', 150]],
  'combat-hyperspatial':  [['attaque', 300], ['attaque', -300]],
  'combat-monstrueux':    [['attaque', 100], ['attaque', -100]],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function parseCombat(row, ships = []) {
  let combat = {}, journal = [], crew = {};
  try { combat  = row.combat_json  ? JSON.parse(row.combat_json)  : {}; } catch { /* keep */ }
  try { journal = row.journal_json ? JSON.parse(row.journal_json) : []; } catch { /* keep */ }
  try { crew    = row.crew_json    ? JSON.parse(row.crew_json)    : {}; } catch { /* keep */ }
  return {
    id:            row.id,
    table_id:      row.table_id,
    nom:           row.nom,
    statut:        row.statut,
    phase:         row.phase,
    configuration: row.configuration,
    champ_bataille: row.champ_bataille,
    combat,
    journal,
    crew,
    notes:         row.notes ?? null,
    created_by:    row.created_by,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
    vaisseaux:     ships.map(parseShip),
  };
}

function parseShip(row) {
  return {
    id:                row.id,
    combat_id:         row.combat_id,
    ship_model_id:     row.ship_model_id ?? null,
    nom:               row.nom,
    camp:              row.camp,
    trajectoire:       row.trajectoire,
    position_k:        row.position_k,
    orientation:       row.orientation,
    classe:            row.classe,
    avantage:          row.avantage ?? null,
    contact_visuel:    Boolean(row.contact_visuel),
    structure_actuelle: row.structure_actuelle,
    structure_max:     row.structure_max,
    destroyed:         Boolean(row.destroyed),
    sort_order:        row.sort_order,
  };
}

function getShips(combatId) {
  return db.prepare(
    `SELECT * FROM combat_ships WHERE combat_id = ? ORDER BY sort_order, id`
  ).all(combatId);
}

// ── GET / — liste des combats de la table ────────────────────────────────────
router.get('/', (req, res) => {
  if (!requireTable(req, res)) return;
  const rows = db.prepare(
    `SELECT id, table_id, nom, statut, phase, configuration, champ_bataille,
            notes, created_by, created_at, updated_at
     FROM combats_spatiaux
     WHERE table_id = ?
     ORDER BY created_at DESC`
  ).all(req.table.id);
  // Lightweight list — no combat_json or ships
  success(res, rows.map(row => parseCombat(row, [])));
});

// ── GET /:id — détail complet ────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  const row = db.prepare(
    `SELECT * FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!row) return notFound(res);
  const ships = getShips(row.id);
  success(res, parseCombat(row, ships));
});

// ── POST / — créer un combat ──────────────────────────────────────────────────
router.post('/', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const { nom, configuration, champ_bataille, vaisseaux, notes } = req.body;

  if (!nom || !String(nom).trim()) return validationError(res, 'Le nom est requis');
  if (configuration !== undefined && !VALID_CONFIGURATIONS.includes(configuration)) {
    return validationError(res, `Configuration invalide : ${configuration}`);
  }

  const config = VALID_CONFIGURATIONS.includes(configuration) ? configuration : 'face-a-face';
  const champ  = VALID_CHAMPS.includes(champ_bataille) ? champ_bataille : 'espace-profond';

  const id = randomUUID();
  db.prepare(`
    INSERT INTO combats_spatiaux
      (id, table_id, nom, statut, phase, configuration, champ_bataille,
       combat_json, journal_json, crew_json, notes, created_by)
    VALUES (?, ?, ?, 'en_cours', 'approche', ?, ?, '{}', '[]', '{}', ?, ?)
  `).run(id, req.table.id, String(nom).trim(), config, champ,
         notes ? String(notes).trim() : null, req.user.id);

  // Ajouter les vaisseaux fournis OU créer des positions par défaut
  const targetPositions = INITIAL_POSITIONS[config] ?? [['attaque', 200], ['attaque', -200]];
  const shipList = Array.isArray(vaisseaux) ? vaisseaux : [];

  if (shipList.length === 0 && targetPositions.length > 0) {
    // Créer des vaisseaux placeholder (pour que le radar ait quelque chose à afficher)
    targetPositions.forEach(([traj, pos], i) => {
      db.prepare(`
        INSERT INTO combat_ships
          (id, combat_id, nom, camp, trajectoire, position_k, orientation,
           classe, structure_actuelle, structure_max, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, 'vers500', 'inconnu', 100, 100, ?)
      `).run(
        randomUUID(), id,
        i === 0 ? 'Vaisseau A' : 'Vaisseau B',
        i === 0 ? 'joueurs' : 'ennemis',
        traj, pos, i,
      );
    });
  } else {
    shipList.forEach((s, i) => {
      const [defaultTraj, defaultPos] = targetPositions[i] ?? ['attaque', 200];
      const pos_k = Number.isInteger(s.position_k) && s.position_k % 25 === 0
        ? s.position_k
        : defaultPos;
      db.prepare(`
        INSERT INTO combat_ships
          (id, combat_id, ship_model_id, nom, camp, trajectoire, position_k,
           orientation, classe, structure_actuelle, structure_max, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'vers500', ?, ?, ?, ?)
      `).run(
        randomUUID(), id,
        s.ship_model_id ?? null,
        String(s.nom ?? `Vaisseau ${i + 1}`).trim(),
        VALID_CAMPS.includes(s.camp) ? s.camp : (i === 0 ? 'joueurs' : 'ennemis'),
        VALID_TRAJECTOIRES.includes(s.trajectoire) ? s.trajectoire : defaultTraj,
        pos_k,
        VALID_CLASSES.includes(s.classe) ? s.classe : 'inconnu',
        Number.isInteger(s.structure_max) ? s.structure_max : 100,
        Number.isInteger(s.structure_max) ? s.structure_max : 100,
        i,
      );
    });
  }

  const row = db.prepare('SELECT * FROM combats_spatiaux WHERE id = ?').get(id);
  const ships = getShips(id);
  res.status(201).json({ success: true, data: parseCombat(row, ships) });
});

// ── PATCH /:id — mettre à jour l'état global ──────────────────────────────────
router.patch('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const existing = db.prepare(
    `SELECT * FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!existing) return notFound(res);

  const updates = {};
  const { phase, statut, configuration, champ_bataille, notes, combat_json, crew_json } = req.body;

  if (phase !== undefined) {
    if (!VALID_PHASES.includes(phase)) return validationError(res, `Phase invalide : ${phase}`);
    // Transition irréversible
    if (PHASE_ORDER[phase] < PHASE_ORDER[existing.phase]) {
      return validationError(res, `Impossible de revenir à la phase "${phase}" depuis "${existing.phase}"`);
    }
    updates.phase = phase;
  }
  if (statut !== undefined) {
    if (!VALID_STATUTS.includes(statut)) return validationError(res, `Statut invalide : ${statut}`);
    updates.statut = statut;
  }
  if (configuration !== undefined) {
    if (!VALID_CONFIGURATIONS.includes(configuration)) return validationError(res, `Configuration invalide`);
    updates.configuration = configuration;
  }
  if (champ_bataille !== undefined) {
    if (!VALID_CHAMPS.includes(champ_bataille)) return validationError(res, `Champ de bataille invalide`);
    updates.champ_bataille = champ_bataille;
  }
  if (notes !== undefined) updates.notes = notes ? String(notes).trim() : null;
  if (combat_json !== undefined) {
    try { JSON.parse(typeof combat_json === 'string' ? combat_json : JSON.stringify(combat_json)); }
    catch { return validationError(res, 'combat_json invalide'); }
    updates.combat_json = typeof combat_json === 'string' ? combat_json : JSON.stringify(combat_json);
  }
  if (crew_json !== undefined) {
    try { JSON.parse(typeof crew_json === 'string' ? crew_json : JSON.stringify(crew_json)); }
    catch { return validationError(res, 'crew_json invalide'); }
    updates.crew_json = typeof crew_json === 'string' ? crew_json : JSON.stringify(crew_json);
  }

  if (Object.keys(updates).length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(
    `UPDATE combats_spatiaux SET ${sets}, updated_at = datetime('now') WHERE id = ?`
  ).run(...Object.values(updates), existing.id);

  const row = db.prepare('SELECT * FROM combats_spatiaux WHERE id = ?').get(existing.id);
  const ships = getShips(existing.id);
  success(res, parseCombat(row, ships));
});

// ── POST /:id/ships — ajouter un vaisseau ────────────────────────────────────
router.post('/:id/ships', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const combat = db.prepare(
    `SELECT id FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!combat) return notFound(res);

  const { nom, camp, trajectoire, position_k, orientation, classe,
          ship_model_id, structure_actuelle, structure_max } = req.body;

  if (!nom || !String(nom).trim()) return validationError(res, 'Le nom est requis');

  const pos = (Number.isInteger(Number(position_k)) && Number(position_k) % 25 === 0)
    ? Number(position_k) : 200;
  if (pos < -600 || pos > 600) return validationError(res, 'position_k doit être entre -600 et 600');

  const maxSort = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM combat_ships WHERE combat_id = ?`
  ).get(req.params.id).m;

  const shipId = randomUUID();
  db.prepare(`
    INSERT INTO combat_ships
      (id, combat_id, ship_model_id, nom, camp, trajectoire, position_k,
       orientation, classe, structure_actuelle, structure_max, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    shipId, req.params.id,
    ship_model_id ?? null,
    String(nom).trim(),
    VALID_CAMPS.includes(camp) ? camp : 'neutres',
    VALID_TRAJECTOIRES.includes(trajectoire) ? trajectoire : 'attaque',
    pos,
    VALID_ORIENTATIONS.includes(orientation) ? orientation : 'vers500',
    VALID_CLASSES.includes(classe) ? classe : 'inconnu',
    Number.isInteger(Number(structure_actuelle)) ? Number(structure_actuelle)
      : (Number.isInteger(Number(structure_max)) ? Number(structure_max) : 100),
    Number.isInteger(Number(structure_max)) ? Number(structure_max) : 100,
    maxSort + 1,
  );

  db.prepare(
    `UPDATE combats_spatiaux SET updated_at = datetime('now') WHERE id = ?`
  ).run(req.params.id);

  const row = db.prepare('SELECT * FROM combat_ships WHERE id = ?').get(shipId);
  res.status(201).json({ success: true, data: parseShip(row) });
});

// ── PATCH /:id/ships/:shipId — déplacer / mettre à jour un vaisseau ──────────
router.patch('/:id/ships/:shipId', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const combat = db.prepare(
    `SELECT id FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!combat) return notFound(res);

  const ship = db.prepare(
    `SELECT * FROM combat_ships WHERE id = ? AND combat_id = ?`
  ).get(req.params.shipId, req.params.id);
  if (!ship) return notFound(res);

  const updates = {};
  const { position_k, trajectoire, orientation, avantage, contact_visuel,
          structure_actuelle, destroyed, nom, camp, classe } = req.body;

  if (position_k !== undefined) {
    const pos = Number(position_k);
    if (!Number.isInteger(pos) || pos % 25 !== 0) {
      return validationError(res, 'position_k doit être un multiple de 25');
    }
    if (pos < -600 || pos > 600) {
      return validationError(res, 'position_k doit être entre -600 et 600');
    }
    updates.position_k = pos;
  }
  if (trajectoire !== undefined) {
    if (!VALID_TRAJECTOIRES.includes(trajectoire)) return validationError(res, 'trajectoire invalide');
    updates.trajectoire = trajectoire;
  }
  if (orientation !== undefined) {
    if (!VALID_ORIENTATIONS.includes(orientation)) return validationError(res, 'orientation invalide');
    updates.orientation = orientation;
  }
  if (avantage !== undefined) {
    if (avantage !== null) {
      const a = Number(avantage);
      if (!Number.isFinite(a)) return validationError(res, 'avantage doit être un nombre');
      updates.avantage = a;
    } else {
      updates.avantage = null;
    }
  }
  if (contact_visuel !== undefined) updates.contact_visuel = contact_visuel ? 1 : 0;
  if (structure_actuelle !== undefined) {
    const s = Number(structure_actuelle);
    if (!Number.isFinite(s)) return validationError(res, 'structure_actuelle doit être un nombre');
    updates.structure_actuelle = s;
  }
  if (destroyed !== undefined) updates.destroyed = destroyed ? 1 : 0;
  if (nom !== undefined) {
    const trimmedNom = String(nom).trim();
    if (!trimmedNom) return validationError(res, 'Le nom ne peut pas être vide');
    updates.nom = trimmedNom;
  }
  if (camp !== undefined) {
    if (!VALID_CAMPS.includes(camp)) return validationError(res, 'camp invalide');
    updates.camp = camp;
  }
  if (classe !== undefined) {
    if (!VALID_CLASSES.includes(classe)) return validationError(res, 'classe invalide');
    updates.classe = classe;
  }

  if (Object.keys(updates).length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE combat_ships SET ${sets} WHERE id = ?`).run(...Object.values(updates), ship.id);

  db.prepare(
    `UPDATE combats_spatiaux SET updated_at = datetime('now') WHERE id = ?`
  ).run(req.params.id);

  const updated = db.prepare('SELECT * FROM combat_ships WHERE id = ?').get(ship.id);
  success(res, parseShip(updated));
});

// ── DELETE /:id/ships/:shipId — retirer un vaisseau ──────────────────────────
router.delete('/:id/ships/:shipId', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const combat = db.prepare(
    `SELECT id FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!combat) return notFound(res);

  const result = db.prepare(
    `DELETE FROM combat_ships WHERE id = ? AND combat_id = ?`
  ).run(req.params.shipId, req.params.id);

  if (result.changes === 0) return notFound(res);

  db.prepare(
    `UPDATE combats_spatiaux SET updated_at = datetime('now') WHERE id = ?`
  ).run(req.params.id);

  success(res, { deleted: true });
});

// ── POST /:id/journal — ajouter une entrée au journal ────────────────────────
router.post('/:id/journal', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const row = db.prepare(
    `SELECT * FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).get(req.params.id, req.table.id);
  if (!row) return notFound(res);

  if (row.statut !== 'en_cours') {
    return validationError(res, 'Le journal ne peut être modifié que pour un combat en cours');
  }

  const { action, acteur, pool, diff, modif, bonus_diff, resultats, relances, succes, note } = req.body;

  if (!action || !String(action).trim()) {
    return validationError(res, 'Le champ action est requis');
  }
  if (String(action).trim().length > 200) {
    return validationError(res, 'Le champ action ne peut pas dépasser 200 caractères');
  }
  if (acteur && String(acteur).trim().length > 100) {
    return validationError(res, 'Le champ acteur ne peut pas dépasser 100 caractères');
  }
  if (note && String(note).trim().length > 1000) {
    return validationError(res, 'Le champ note ne peut pas dépasser 1000 caractères');
  }

  let journal = [];
  try { journal = row.journal_json ? JSON.parse(row.journal_json) : []; } catch { /* garder vide */ }

  if (journal.length >= 500) {
    return validationError(res, 'Le journal de ce combat a atteint la limite de 500 entrées');
  }

  const poolNum   = Number.isFinite(Number(pool))       ? Number(pool)       : null;
  const succesNum = Number.isFinite(Number(succes))      ? Number(succes)     : null;
  const bonusDiffNum = Number.isFinite(Number(bonus_diff)) ? Number(bonus_diff) : null;

  const VALID_DIFF  = ['standard', 'TD', 'TF'];
  const VALID_MODIF = ['E2F', 'e2f', 'SC', 'sc', 'PMF', 'pmf', 'aucun'];

  const entry = {
    id:         Date.now(),
    ts:         new Date().toISOString(),
    action:     String(action).trim(),
    acteur:     acteur ? String(acteur).trim() : null,
    pool:       (poolNum !== null && poolNum >= 1 && poolNum <= 20) ? poolNum : null,
    diff:       VALID_DIFF.includes(diff) ? diff : null,
    modif:      VALID_MODIF.includes(modif) ? modif : null,
    bonus_diff: (bonusDiffNum !== null && bonusDiffNum >= 0) ? bonusDiffNum : null,
    resultats:  (Array.isArray(resultats) &&
                 resultats.length >= 1 && resultats.length <= 20 &&
                 resultats.every(r => Number.isInteger(r) && r >= 1 && r <= 6))
                ? resultats : null,
    relances:   (Array.isArray(relances) &&
                 relances.length >= 1 && relances.length <= 20 &&
                 relances.every(r => r === null || (Number.isInteger(r) && r >= 1 && r <= 6)))
                ? relances : null,
    succes:     (succesNum !== null && succesNum >= 0) ? succesNum : null,
    note:       note ? String(note).trim() : null,
  };

  // Prépend (ordre chronologique inversé : le plus récent en premier)
  journal.unshift(entry);

  db.prepare(
    `UPDATE combats_spatiaux SET journal_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(journal), row.id);

  success(res, { journal });
});

// ── DELETE /:id — supprimer le combat ────────────────────────────────────────
router.delete('/:id', (req, res) => {
  if (!requireTable(req, res)) return;
  if (!isMJ(req)) return forbidden(res);

  const result = db.prepare(
    `DELETE FROM combats_spatiaux WHERE id = ? AND table_id = ?`
  ).run(req.params.id, req.table.id);

  if (result.changes === 0) return notFound(res);
  success(res, { deleted: true });
});

export default router;
