/**
 * export-admin-perils.mjs
 * Exporte les admin_peril_tables de la DB vers perils_data.json.
 * Permet de capturer les modifications faites via l'UI admin et de les
 * versionner dans git pour déploiement sur Portainer via reseed-admin-perils.mjs.
 *
 * Usage : node scripts/export-admin-perils.mjs
 */

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath   = resolve(__dirname, '..', 'db', 'ma.db');
const jsonPath = resolve(__dirname, '..', 'perils_data.json');

const db   = new Database(dbPath);
const rows = db.prepare('SELECT id, name, type, data_json FROM admin_peril_tables ORDER BY rowid').all();

if (rows.length === 0) {
  console.error('Aucune admin_peril_tables trouvée en DB.');
  process.exit(1);
}

// Lire le fichier actuel pour conserver les clés non-gérées
const current = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};

// Construire le nouveau JSON indexé par type
const output = { ...current };
for (const row of rows) {
  const data = JSON.parse(row.data_json);
  output[row.type] = {
    name: row.name,
    categories: data.categories || [],
  };
  const catCount  = (data.categories || []).length;
  const perilCount = (data.categories || []).reduce((s, c) => s + (c.perils?.length || 0), 0);
  console.log(`  ✓ ${row.type} → "${row.name}" (${catCount} catégories, ${perilCount} périls)`);
}

// Backup
copyFileSync(jsonPath, jsonPath + '.bak');

writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nExport terminé → perils_data.json mis à jour (backup : perils_data.json.bak)\n`);
