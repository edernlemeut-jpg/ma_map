/**
 * reseed-admin-perils.mjs
 * Écrase les admin_peril_tables depuis perils_data.json (nouvelle structure).
 * À exécuter après chaque déploiement mettant à jour perils_data.json.
 * Idempotent : peut être relancé sans risque.
 *
 * Usage : node scripts/reseed-admin-perils.mjs
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath  = resolve(__dirname, '..', 'db', 'ma.db');
const jsonPath = resolve(__dirname, '..', 'perils_data.json');

const db  = new Database(dbPath);
const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));

const upsert = db.prepare(
  'INSERT INTO admin_peril_tables (id, name, type, data_json) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, data_json = excluded.data_json'
);

const reseed = db.transaction(() => {
  let count = 0;
  for (const [typeKey, entry] of Object.entries(raw)) {
    if (!['interplanetaire', 'hyperspatial'].includes(typeKey)) continue;
    const id   = `apt_default_${typeKey}`;
    const name = entry.name || (typeKey === 'interplanetaire' ? 'Périls Interplanétaires' : 'Périls Hyperspatiaux');
    const cats = entry.categories || [];
    upsert.run(id, name, typeKey, JSON.stringify({ categories: cats }));
    console.log(`  ✓ ${typeKey} → "${name}" (${cats.length} catégories)`);
    count++;
  }
  return count;
});

try {
  const n = reseed();
  console.log(`\nReseed terminé : ${n} table(s) admin mise(s) à jour.\n`);
} catch (e) {
  console.error('Erreur reseed :', e.message);
  process.exit(1);
}
