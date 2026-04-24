import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { success, notFound, forbidden, validationError } from '../utils/response.js';
import authMiddleware from '../middleware/auth.js';
import db from '../database.js';
import { isVisible } from '../services/visibility.js';

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

  const cats = ['competences', 'qualites', 'defauts', 'mutations'];
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
// MJ : voit tous les personnages.
// Joueur : voit ses propres PJs + les PJs des autres joueurs.
router.get('/', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  let rows;
  if (isMJ(req) || req.user?.is_admin) {
    rows = db.prepare(
      'SELECT id, type, name, created_by, created_at, updated_at, data_json FROM characters WHERE table_id = ? ORDER BY type, name COLLATE NOCASE'
    ).all(tableId);
  } else {
    // Joueurs voient leurs PJs + ceux des autres joueurs (pas les PNJs)
    rows = db.prepare(
      `SELECT id, type, name, created_by, created_at, updated_at, data_json
       FROM characters WHERE table_id = ? AND (type = 'pj' OR created_by = ?)
       ORDER BY name COLLATE NOCASE`
    ).all(tableId, req.user.id);
  }

  success(res, rows.map(r => parseCharacter(r)));
});

// GET /api/characters/:id
router.get('/:id', (req, res) => {
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  // Joueur ne peut voir les PNJs que si MJ
  if (row.type === 'pnj' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Accès réservé au MJ');
  }

  success(res, parseCharacter(row));
});

// POST /api/characters — créer un personnage
router.post('/', (req, res) => {
  const tableId = getTableId(req);
  if (!tableId) return validationError(res, 'Aucune table sélectionnée');

  const { type = 'pj', name, data } = req.body;

  if (!['pj', 'pnj'].includes(type)) return validationError(res, 'Type invalide (pj ou pnj)');
  if (type === 'pnj' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut créer des PNJs');
  }
  if (!name?.trim()) return validationError(res, 'Le nom est requis');

  const id = 'chr_' + randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO characters (id, table_id, created_by, type, name, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, tableId, req.user.id, type, String(name).trim(), JSON.stringify(data || {}), now, now);

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

// DELETE /api/characters/:id
router.delete('/:id', (req, res) => {
  const tableId = getTableId(req);
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND table_id = ?').get(req.params.id, tableId);
  if (!row) return notFound(res, 'Personnage introuvable');

  if (row.type === 'pnj' && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Seul le MJ peut supprimer des PNJs');
  }
  if (row.type === 'pj' && row.created_by !== req.user.id && !isMJ(req) && !req.user?.is_admin) {
    return forbidden(res, 'Vous ne pouvez supprimer que vos propres personnages');
  }

  db.prepare('DELETE FROM characters WHERE id = ?').run(row.id);
  success(res, { deleted: true });
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseCharacter(row) {
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch { /* ignore */ }
  return {
    id:         row.id,
    type:       row.type,
    name:       row.name,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data
  };
}

export default router;
