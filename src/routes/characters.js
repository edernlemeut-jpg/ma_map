import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { success, notFound, forbidden, validationError } from '../utils/response.js';
import authMiddleware from '../middleware/auth.js';
import db from '../database.js';
import { isVisible } from '../services/visibility.js';
import { computeHealthTemplate, computeEnergyXMax, setHealthCase } from '../services/health-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAR_DATA_PATH = join(__dirname, '../../characters_data.json');

const router = Router();

// ── Données de référence ──────────────────────────────────────────────────────
// GET /api/characters/ref-data
// Retourne les données statiques (origines, motivations, archétypes, etc.)
// + les compétences, qualités, défauts et mutations depuis rules_entries.
// + les nations enrichies avec données faction (icône, couleur) filtrées par visibilité.
// Auth requise afin que req.table soit disponible pour le filtrage.
// Règle de visibilité des origines :
//   - Si une faction a origin_nation_id = nation.id ET est visible → la nation est visible
//   - Si une faction a origin_nation_id = nation.id ET est CACHÉE → la nation est cachée
//   - Si aucune faction n'est liée → la nation est cachée par défaut (protect-by-default)
router.get('/ref-data', (req, res) => {
  let staticData = {};
  if (existsSync(CHAR_DATA_PATH)) {
    try { staticData = JSON.parse(readFileSync(CHAR_DATA_PATH, 'utf8')); } catch { /* ignore */ }
  }

  const tableId = req.table?.id ?? null;
  const role    = req.table?.role ?? (req.user?.is_admin ? 'mj' : null);
  const isJoueur = tableId && role === 'joueur';

  // Construire une map nation_id → { icon_url, color, visible }
  // en se basant sur origin_nation_id côté factions (DB)
  const allFactions = db.prepare(
    'SELECT id, icon_url, color, origin_nation_id FROM factions WHERE origin_nation_id IS NOT NULL AND origin_nation_id != \'\''
  ).all();

  const nationFactionMap = new Map();
  for (const f of allFactions) {
    const visible = tableId
      ? isVisible('factions', f.id, tableId, 'joueur')
      : true; // Sans table (admin) : tout est visible
    nationFactionMap.set(f.origin_nation_id, {
      icon_url: f.icon_url ?? null,
      color:    f.color ?? null,
      visible,
    });
  }

  // Enrichir les nations et filtrer selon visibilité
  const nationsRaw = staticData.nations ?? [];
  const nations = nationsRaw
    .map(n => {
      const fData  = nationFactionMap.get(n.id) ?? null;
      const visible = fData?.visible ?? false; // Aucun lien → caché par défaut
      return {
        ...n,
        faction_icon_url: fData?.icon_url ?? null,
        faction_color:    fData?.color    ?? null,
        visible,          // visible pour les joueurs (utile pour le MJ)
      };
    })
    .filter(n => isJoueur ? n.visible : true); // Joueur ne voit pas les nations cachées

  // Filtrer les origines selon les nations visibles pour les joueurs
  const visibleNationIds = new Set(nations.map(n => n.id));
  const origines = (staticData.origines ?? []).filter(o =>
    !isJoueur || visibleNationIds.has(o.nation)
  );

  const cats = ['competences', 'qualites', 'defauts', 'mutations', 'sorcelleries'];
  const rulesData = {};
  for (const cat of cats) {
    const rows = db.prepare(
      'SELECT id, name, description, extra FROM rules_entries WHERE category = ? AND (table_id IS NULL) ORDER BY name COLLATE NOCASE'
    ).all(cat);
    rulesData[cat] = rows.map(r => {
      let extra = {};
      try { extra = JSON.parse(r.extra || '{}'); } catch { /* ignore */ }
      return { id: r.id, name: r.name, description: r.description, ...extra };
    });
  }

  success(res, { ...staticData, nations, origines, ...rulesData });
});

// ── Toutes les routes suivantes nécessitent une authentification ──────────────
router.use(authMiddleware);

function getTableId(req) { return req.table?.id ?? req.tableContext?.tableId ?? null; }
function isMJ(req)       { return req.table?.role === 'mj' || req.tableContext?.role === 'mj'; }

// GET /api/characters — liste les personnages de la table active
// MJ : voit tous les personnages (filtrable par ?type=pj|pnj).
// Joueur : voit uniquement ses propres PJs (user_id = req.user.id).
router.get('/', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const { type } = req.query;
  const typeFilter = type ? ` AND c.type = '${type === 'pj' ? 'pj' : 'pnj'}'` : '';

  let rows;
  if (isMJ(req) || req.user?.is_admin) {
    rows = db.prepare(
      `SELECT c.*, u.display_name AS creator_name
       FROM characters c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.table_id = ?${typeFilter} ORDER BY c.type, c.name COLLATE NOCASE`
    ).all(tableId);
  } else {
    // Joueurs voient uniquement leurs propres PJs
    rows = db.prepare(
      `SELECT c.*, NULL AS creator_name
       FROM characters c
       WHERE c.table_id = ? AND (c.user_id = ? OR (c.user_id IS NULL AND c.created_by = ?))${typeFilter}
       ORDER BY c.type, c.name COLLATE NOCASE`
    ).all(tableId, req.user.id, req.user.id);
  }

  success(res, rows.map(r => parseCharacter(r)));
});

// GET /api/characters/:id
router.get('/:id', (req, res) => {
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  if (!isMJ(req) && !req.user?.is_admin) {
    if (row.type === 'pnj') return forbidden(res, 'Accès réservé au MJ');
    // Joueur : accès uniquement à sa propre fiche
    const isOwner = row.user_id === req.user.id
      || (row.user_id == null && row.created_by === req.user.id);
    if (!isOwner) return forbidden(res, 'Accès refusé');
  }

  success(res, parseCharacter(row));
});

// POST /api/characters — créer un personnage
router.post('/', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const {
    type = 'pj', name, data,
    // Champs PJ dédiés (Story 8.2)
    user_id, archetype, is_mutant,
    stats_json, competences_json, sante_niveaux,
    motivation, overdrive_trigger, qualites_json, defauts_json,
  } = req.body;

  if (!['pj', 'pnj'].includes(type)) return validationError(res, 'Type invalide (pj ou pnj)');
  if (type === 'pnj' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut créer des PNJs');
  }
  if (!name?.trim()) return validationError(res, 'Le nom est requis');

  // Calcul sante_json à partir des stats (CAR + SF)
  let statsObj = {};
  try { statsObj = JSON.parse(stats_json || '{}'); } catch { /* ignore */ }
  const car    = parseInt(statsObj.car ?? 3, 10);
  const sf     = parseInt(statsObj.sf  ?? 2, 10);
  const niveaux = parseInt(sante_niveaux ?? 3, 10);
  const santeJson = JSON.stringify(computeHealthTemplate({ car, sf, niveaux }));

  // Calcul energie_x_max pour les mutants
  let energieXMax = 0;
  if (is_mutant) {
    const per  = parseInt(statsObj.per ?? 0, 10);
    const intel = parseInt(statsObj.int ?? 0, 10);
    energieXMax = computeEnergyXMax({ per, int: intel });
  }

  const id  = 'chr_' + randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO characters (
      id, table_id, created_by, type, name, data_json,
      user_id, archetype, is_mutant, stats_json, competences_json,
      sante_json, sante_niveaux, motivation, overdrive_trigger,
      qualites_json, defauts_json, energie_x_max,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tableId, req.user.id, type, String(name).trim(), JSON.stringify(data || {}),
    user_id ?? null, archetype ?? null, is_mutant ? 1 : 0,
    stats_json ?? null, competences_json ?? null,
    santeJson, niveaux, motivation ?? null, overdrive_trigger ?? null,
    qualites_json ?? null, defauts_json ?? null, energieXMax,
    now, now
  );

  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  success(res, parseCharacter(row), 201);
});

// PUT /api/characters/:id — mettre à jour un personnage
router.put('/:id', (req, res) => {
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  // Joueurs ne peuvent modifier que leurs propres PJs
  if (row.type === 'pnj' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut modifier les PNJs');
  }
  if (row.type === 'pj' && row.created_by !== req.user.id && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Vous ne pouvez modifier que vos propres personnages');
  }

  const { name, data } = req.body;
  const newName = name?.trim() ? String(name).trim() : row.name;
  const newData = data !== undefined ? JSON.stringify(data) : row.data_json;
  const now = new Date().toISOString();

  db.prepare('UPDATE characters SET name = ?, data_json = ?, updated_at = ? WHERE id = ?')
    .run(newName, newData, now, row.id);

  success(res, parseCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(row.id)));
});

// PATCH /api/characters/:id/awards — MJ modifie gloire / panache / px d'un personnage
router.patch('/:id/awards', (req, res) => {
  if (!isMJ(req) && !req.user?.is_admin) return forbidden(res, 'Seul le MJ peut modifier ces valeurs');
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');
  if (row.type !== 'pj') return validationError(res, 'Réservé aux PJs');

  let d = {};
  try { d = JSON.parse(row.data_json); } catch { /* ignore */ }

  const { gloire_delta, panache_delta, px_spend, px_delta } = req.body;
  if (gloire_delta !== undefined)  d.gloire   = Math.max(0, (d.gloire  ?? 0) + parseInt(gloire_delta  ?? 0));
  if (panache_delta !== undefined) d.panache  = Math.max(1, (d.panache ?? 3) + parseInt(panache_delta ?? 0));
  if (px_spend !== undefined) {
    const spend = parseInt(px_spend ?? 0);
    if (spend < 0) return validationError(res, 'px_spend doit être positif');
    d.px_actuel = Math.max(0, (d.px_actuel ?? 0) - spend);
    d.px_depense = (d.px_depense ?? 0) + spend;
  }
  if (px_delta !== undefined) {
    const amt = parseInt(px_delta ?? 0);
    d.px_actuel = (d.px_actuel ?? 0) + amt;
    if (amt > 0) d.px_total = (d.px_total ?? 0) + amt;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE characters SET data_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(d), now, row.id);
  success(res, parseCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(row.id)));
});

// PATCH /api/characters/:id — MJ : set direct de pp, gloire, energie_x_cur
router.patch('/:id', (req, res) => {
  if (!isMJ(req) && !req.user?.is_admin) return forbidden(res, 'Seul le MJ peut modifier ces valeurs directement');
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  const { pp, gloire, energie_x_cur } = req.body;
  const updates = [];
  const params  = [];

  if (pp !== undefined) {
    updates.push('pp = ?');
    params.push(Math.max(0, parseInt(pp, 10) || 0));
  }
  if (gloire !== undefined) {
    updates.push('gloire = ?');
    params.push(Math.max(0, parseInt(gloire, 10) || 0));
  }
  if (energie_x_cur !== undefined) {
    const max = row.energie_x_max ?? 0;
    updates.push('energie_x_cur = ?');
    params.push(Math.min(max, Math.max(0, parseInt(energie_x_cur, 10) || 0)));
  }

  if (updates.length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, row.id);
  db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  success(res, parseCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(row.id)));
});

// PATCH /api/characters/:id/resources — joueur/MJ : delta pp et énergie X
//   MJ et owner : delta_pp et delta_energie_x librement (positif ou négatif)
router.patch('/:id/resources', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  // Vérification accès : MJ ou owner
  if (!isMJ(req) && !req.user?.is_admin) {
    const isOwner = row.user_id === req.user.id
      || (row.user_id == null && row.created_by === req.user.id);
    if (!isOwner) return forbidden(res, 'Accès refusé');
  }

  const { delta_pp, delta_energie_x } = req.body;
  const updates = [];
  const params  = [];

  if (delta_pp !== undefined) {
    const delta = parseInt(delta_pp, 10) || 0;
    const newPP = Math.max(0, (row.pp ?? 3) + delta);
    updates.push('pp = ?');
    params.push(newPP);
  }

  if (delta_energie_x !== undefined) {
    const delta = parseInt(delta_energie_x, 10) || 0;
    const max    = row.energie_x_max ?? 0;
    const newVal = Math.min(max, Math.max(0, (row.energie_x_cur ?? 0) + delta));
    updates.push('energie_x_cur = ?');
    params.push(newVal);
  }

  if (updates.length === 0) return validationError(res, 'Aucun champ à mettre à jour');

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, row.id);
  db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  success(res, parseCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(row.id)));
});

// PATCH /api/characters/:id/health — coche/noircit une case de santé
//   MJ   : vide / cochée / noircie
//   Joueur : vide / cochée uniquement (noircie → 403)
router.patch('/:id/health', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  // Vérification accès
  if (!isMJ(req) && !req.user?.is_admin) {
    const isOwner = row.user_id === req.user.id
      || (row.user_id == null && row.created_by === req.user.id);
    if (!isOwner) return forbidden(res, 'Accès refusé');
  }

  const { niveau_index, case_index, etat } = req.body;

  // Un joueur ne peut pas noircir une case
  if (etat === 'noircie' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut noircir une case');
  }

  // Initialise sante_json si absent (personnage créé avant la migration ou sans stats_json)
  let santeJson = row.sante_json;
  if (!santeJson) {
    // Les attributs sont stockés dans data_json.attributs (noms complets)
    let dataAttrs = {};
    try { dataAttrs = JSON.parse(row.data_json || '{}').attributs || {}; } catch { /* ignore */ }
    // Fallback sur stats_json (clés courtes) si data_json n'a pas les attributs
    let statsObj = {};
    try { statsObj = JSON.parse(row.stats_json || '{}'); } catch { /* ignore */ }
    const car = parseInt(dataAttrs.carrure ?? statsObj.car ?? 3, 10);
    const sf  = parseInt(dataAttrs.sang_froid ?? statsObj.sf ?? 2, 10);
    // L'UI affiche toujours 4 lignes (Indemne/Blessé léger/Blessé grave/Mort?)
    const niveaux = 4;
    santeJson = JSON.stringify(computeHealthTemplate({ car, sf, niveaux }));
  }

  const result = setHealthCase(santeJson, Number(niveau_index), Number(case_index), etat);
  if (!result.ok) return validationError(res, result.error);

  const now = new Date().toISOString();
  db.prepare('UPDATE characters SET sante_json = ?, updated_at = ? WHERE id = ?')
    .run(result.updated, now, row.id);

  success(res, parseCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(row.id)));
});

// DELETE /api/characters/:id
router.delete('/:id', (req, res) => {
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  // La suppression de tout personnage est réservée au MJ (NFR-PJ1)
  if (!isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut supprimer un personnage');
  }

  db.prepare('DELETE FROM characters WHERE id = ?').run(row.id);
  success(res, { deleted: true });
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseCharacter(row) {
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch { /* ignore */ }

  let stats = null;
  try { stats = row.stats_json ? JSON.parse(row.stats_json) : null; } catch { /* ignore */ }
  let competences = null;
  try { competences = row.competences_json ? JSON.parse(row.competences_json) : null; } catch { /* ignore */ }
  let sante = null;
  try { sante = row.sante_json ? JSON.parse(row.sante_json) : null; } catch { /* ignore */ }
  let qualites = null;
  try { qualites = row.qualites_json ? JSON.parse(row.qualites_json) : null; } catch { /* ignore */ }
  let defauts = null;
  try { defauts = row.defauts_json ? JSON.parse(row.defauts_json) : null; } catch { /* ignore */ }

  return {
    id:                row.id,
    type:              row.type,
    name:              row.name,
    created_by:        row.created_by,
    creator_name:      row.creator_name ?? null,
    user_id:           row.user_id        ?? null,
    archetype:         row.archetype      ?? null,
    is_mutant:         row.is_mutant      ?? 0,
    stats,
    competences,
    sante,
    sante_niveaux:     row.sante_niveaux  ?? 3,
    pp:                row.pp             ?? 3,
    gloire:            row.gloire         ?? 0,
    energie_x_max:     row.energie_x_max  ?? 0,
    energie_x_cur:     row.energie_x_cur  ?? 0,
    motivation:        row.motivation     ?? null,
    overdrive_trigger: row.overdrive_trigger ?? null,
    qualites,
    defauts,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    data,
  };
}

export default router;
