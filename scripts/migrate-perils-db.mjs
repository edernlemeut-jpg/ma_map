/**
 * migrate-perils-db.mjs
 * Migrates peril data in admin_peril_tables and custom_peril_tables
 * from old structure to new structure.
 *
 * Old peril data: { description (ambiance), definition (GM notes), protocole (string), resultat (string), ... }
 * New peril data: { texteAmbiance, description (GM notes), protocole [{role,action}], resultat [{seuil,effet}], ... }
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '..', 'db', 'ma.db');
const db = new Database(dbPath);

function parseProtocole(str) {
  if (!str || !str.trim()) return [];
  const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = [];
  const numberedPattern = /^\d+\s*:(.+)$/;
  for (const line of lines) {
    const m = line.match(numberedPattern);
    if (m) {
      const content = m[1].trim();
      const colonIdx = content.indexOf(':');
      if (colonIdx > -1) {
        result.push({ role: content.substring(0, colonIdx).trim(), action: content.substring(colonIdx + 1).trim() });
      } else {
        result.push({ role: '', action: content });
      }
    } else {
      if (result.length > 0) result[result.length - 1].action += '\n' + line;
      else result.push({ role: '', action: line });
    }
  }
  return result;
}

function parseResultat(str) {
  if (!str || !str.trim()) return [];
  const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = [];
  const thresholdPattern = /^(\d+(?:[+-]\d*)?|\d+\s*-\s*\d+)\s*:(.+)$/;
  for (const line of lines) {
    const m = line.match(thresholdPattern);
    if (m) {
      result.push({ seuil: m[1].trim(), effet: m[2].trim() });
    } else {
      if (result.length > 0) result[result.length - 1].effet += '\n' + line;
      else result.push({ seuil: '', effet: line });
    }
  }
  return result;
}

function migratePerilData(d) {
  if (!d || typeof d !== 'object') return d;
  if ('texteAmbiance' in d) return d; // already migrated
  return {
    texteAmbiance: d.description || '',
    mobile: d.mobile || false,
    senseurs: d.senseurs || 0,
    sciencesStellaires: d.sciencesStellaires || 0,
    description: d.definition || '',
    protocole: Array.isArray(d.protocole) ? d.protocole : parseProtocole(d.protocole || ''),
    resultat: Array.isArray(d.resultat) ? d.resultat : parseResultat(d.resultat || ''),
  };
}

function migrateCategories(cats) {
  return (cats || []).map(cat => ({
    ...cat,
    perils: (cat.perils || []).map(p => ({ ...p, data: migratePerilData(p.data || {}) })),
  }));
}

let adminMigrated = 0, customMigrated = 0;

// Migrate admin_peril_tables
const adminRows = db.prepare('SELECT id, data_json FROM admin_peril_tables').all();
const updateAdmin = db.prepare('UPDATE admin_peril_tables SET data_json = ? WHERE id = ?');
for (const row of adminRows) {
  try {
    const data = JSON.parse(row.data_json);
    const newCats = migrateCategories(data.categories);
    // Check if anything changed
    const newJson = JSON.stringify({ ...data, categories: newCats });
    if (newJson !== row.data_json) {
      updateAdmin.run(newJson, row.id);
      adminMigrated++;
    }
  } catch (e) {
    console.error(`admin_peril_tables row ${row.id}: ${e.message}`);
  }
}

// Migrate custom_peril_tables
const customRows = db.prepare('SELECT id, data_json FROM custom_peril_tables').all();
const updateCustom = db.prepare('UPDATE custom_peril_tables SET data_json = ? WHERE id = ?');
for (const row of customRows) {
  try {
    const data = JSON.parse(row.data_json);
    const newCats = migrateCategories(data.categories);
    const newJson = JSON.stringify({ ...data, categories: newCats });
    if (newJson !== row.data_json) {
      updateCustom.run(newJson, row.id);
      customMigrated++;
    }
  } catch (e) {
    console.error(`custom_peril_tables row ${row.id}: ${e.message}`);
  }
}

console.log(`Migration done:`);
console.log(`  admin_peril_tables: ${adminMigrated} / ${adminRows.length} updated`);
console.log(`  custom_peril_tables: ${customMigrated} / ${customRows.length} updated`);
db.close();
