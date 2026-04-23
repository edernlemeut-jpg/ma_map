/**
 * migrate-calendar.mjs
 * Lit la DB locale directement (better-sqlite3) et pousse vers la prod via API.
 * Usage : node scripts/migrate-calendar.mjs
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH  = path.resolve(__dirname, '../db/ma.db');
const PROD_URL = 'https://ma.zecrepe.duckdns.org';
const USERNAME = 'Crepe';
const PASSWORD = 'MA56ElM@';
const MODE     = 'merge'; // 'merge' | 'replace'

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractCookie(res) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : null;
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed on ${baseUrl}: ${res.status} ${txt}`);
  }
  const cookie = extractCookie(res);
  if (!cookie) throw new Error(`Pas de cookie token dans la réponse de ${baseUrl}`);
  console.log(`✓ Connecté sur ${baseUrl}`);
  return cookie;
}

async function listProdTables(cookie) {
  const res = await fetch(`${PROD_URL}/api/game_tables`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(`listTables failed: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

async function importCalendar(cookie, tableId, data) {
  const res = await fetch(`${PROD_URL}/api/calendar/import`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-Table-Id': String(tableId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data, mode: MODE }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`importCalendar failed (table ${tableId}): ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json.data;
}

// ── Lecture directe de la DB locale ──────────────────────────────────────────

function exportFromLocalDB(db, tableId) {
  const state      = db.prepare('SELECT * FROM table_state WHERE table_id = ?').get(tableId);
  const categories = db.prepare('SELECT * FROM calendar_categories WHERE table_id = ? ORDER BY id').all(tableId);
  const events     = db.prepare(
    'SELECT * FROM calendar_events WHERE table_id = ? ORDER BY galactic_year, date_start'
  ).all(tableId);

  let calDate = '0101.01', calYear = 50429;
  if (state) {
    try {
      const parsed = JSON.parse(state.state_json || '{}');
      if (parsed.date)  calDate = parsed.date;
      if (parsed.year)  calYear = parsed.year;
    } catch {}
  }

  return {
    _meta: { version: 1, exported_at: new Date().toISOString(), source: 'local-direct-read' },
    state: { date: calDate, year: calYear },
    categories,
    events,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Migration calendrier local → prod ===\n');

  // 1. Ouvrir la DB locale en lecture seule
  const db = new Database(DB_PATH, { readonly: true });
  console.log(`✓ DB locale ouverte : ${DB_PATH}`);

  // 2. Lister les tables locales
  const localTables = db.prepare('SELECT id, name FROM game_tables ORDER BY id').all();
  console.log(`  Tables locales : ${localTables.map(t => `#${t.id} "${t.name}"`).join(', ')}`);

  // 3. Auth prod + lister les tables prod
  const cookieProd = await login(PROD_URL);
  const prodTables = await listProdTables(cookieProd);
  console.log(`  Tables prod    : ${prodTables.map(t => `#${t.id} "${t.name}"`).join(', ')}\n`);

  let totalInserted = 0, totalSkipped = 0;

  // 4. Pour chaque table locale → export direct DB → import prod
  for (const localTable of localTables) {
    const prodTable = prodTables.find(t => t.name === localTable.name);
    if (!prodTable) {
      console.warn(`⚠  Table "${localTable.name}" introuvable sur la prod — ignorée.`);
      continue;
    }

    console.log(`── Table "${localTable.name}" (local #${localTable.id} → prod #${prodTable.id})`);

    const exported = exportFromLocalDB(db, localTable.id);
    const cats = exported.categories.length;
    const evts = exported.events.length;
    console.log(`   Export : ${cats} catégories, ${evts} événements, date campagne : ${exported.state.date} (an ${exported.state.year})`);

    if (evts === 0 && cats === 0) {
      console.log('   Rien à migrer.\n');
      continue;
    }

    const result = await importCalendar(cookieProd, prodTable.id, exported);
    const ins  = result?.inserted ?? '?';
    const skip = result?.skipped  ?? '?';
    console.log(`   Import : ${ins} insérés, ${skip} ignorés (déjà présents)\n`);
    totalInserted += Number(ins) || 0;
    totalSkipped  += Number(skip) || 0;
  }

  db.close();
  console.log(`=== Terminé : ${totalInserted} événements migrés, ${totalSkipped} déjà existants ===`);
}

main().catch(e => { console.error('ERREUR :', e.message); process.exit(1); });
