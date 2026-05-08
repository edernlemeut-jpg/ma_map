import db from '../database.js';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { DB_PATH } from '../config/index.js';

const BACKUP_KEEP = 10;

/**
 * Backup the database before import, then prune old backups (keep BACKUP_KEEP most recent).
 * Returns the backup file path.
 */
export async function backupDatabase() {
  const backupDir = resolve(dirname(DB_PATH), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `ma_backup_${Date.now()}.db`);
  await db.backup(backupPath);

  // Rotate: keep only the BACKUP_KEEP most recent backups
  const files = readdirSync(backupDir)
    .filter(f => f.startsWith('ma_backup_') && f.endsWith('.db'))
    .sort()
    .reverse(); // newest first (timestamp in name)
  for (const old of files.slice(BACKUP_KEEP)) {
    try { unlinkSync(resolve(backupDir, old)); } catch { /* ignore */ }
  }

  return backupPath;
}

/**
 * Detect the JSON format by structure.
 * Returns 'quadrants' | 'perils' | 'events' | null
 */
export function detectFormat(data) {
  if (data == null || typeof data !== 'object') return null;

  // galactic_events: array of objects with title + dateStart
  if (Array.isArray(data)) {
    if (data.length > 0 && data[0].title !== undefined && data[0].dateStart !== undefined) {
      return 'events';
    }
    return null;
  }

  // perils_data: object with keys whose values have "categories" arrays
  const values = Object.values(data);
  if (values.length > 0 && values.every(v => v && typeof v === 'object' && Array.isArray(v.categories))) {
    return 'perils';
  }

  // quadrants_MA: object with keys whose values are arrays (of systems)
  if (values.length > 0 && values.every(v => Array.isArray(v))) {
    return 'quadrants';
  }

  return null;
}

/**
 * Import quadrants_MA.json data → systems + factions tables.
 */
export function importQuadrants(data) {
  const report = { imported: 0, skipped: 0, errors: [] };
  const factionNames = new Set();

  const insertSystem = db.prepare(`
    INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)
    VALUES (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description, @soleil_json, @corps_celestes_json, @patrouilles_json)
  `);

  const insertFaction = db.prepare('INSERT OR IGNORE INTO factions (name) VALUES (?)');

  const run = db.transaction(() => {
    let spIdx = 0;
    for (const [quadrant, systems] of Object.entries(data)) {
      if (!Array.isArray(systems)) continue;
      for (const sys of systems) {
        if (!sys.nom) {
          report.errors.push({ entity: `${quadrant}/?`, reason: 'Nom manquant' });
          report.skipped++;
          continue;
        }

        if (sys.faction) factionNames.add(sys.faction);

        const sp = `sp_${spIdx++}`;
        db.exec(`SAVEPOINT ${sp}`);
        try {
          insertSystem.run({
            quadrant,
            nom: sys.nom,
            faction: sys.faction || '',
            is_frontiere: sys.isFrontiere ? 1 : 0,
            route: sys.route || '',
            gouvernement: sys.gouvernement || '',
            description: sys.description || '',
            soleil_json: JSON.stringify(sys.soleil || {}),
            corps_celestes_json: JSON.stringify(sys.corpsCelestes || []),
            patrouilles_json: JSON.stringify(sys.patrouilles || [])
          });
          report.imported++;
          db.exec(`RELEASE ${sp}`);
        } catch (err) {
          db.exec(`ROLLBACK TO ${sp}`);
          db.exec(`RELEASE ${sp}`);
          const reason = err.message.includes('UNIQUE') ? 'Doublon (quadrant, nom)' : err.message;
          report.errors.push({ entity: `${quadrant}/${sys.nom}`, reason });
          report.skipped++;
        }
      }
    }

    // Insert extracted factions
    for (const name of factionNames) {
      insertFaction.run(name);
    }
  });

  run();
  return report;
}

/**
 * Import perils_data.json → peril_data table.
 */
export function importPerils(data) {
  const report = { imported: 0, skipped: 0, errors: [] };

  const upsert = db.prepare('INSERT OR REPLACE INTO peril_data (type, data_json) VALUES (?, ?)');

  const run = db.transaction(() => {
    let spIdx = 0;
    for (const [type, value] of Object.entries(data)) {
      const sp = `sp_peril_${spIdx++}`;
      db.exec(`SAVEPOINT ${sp}`);
      try {
        upsert.run(type, JSON.stringify(value));
        report.imported++;
        db.exec(`RELEASE ${sp}`);
      } catch (err) {
        db.exec(`ROLLBACK TO ${sp}`);
        db.exec(`RELEASE ${sp}`);
        report.errors.push({ entity: `peril:${type}`, reason: err.message });
        report.skipped++;
      }
    }
  });

  run();
  return report;
}

/**
 * Import galactic_events.json — no DB table, log only.
 */
export function importGalacticEvents(data) {
  return {
    imported: 0,
    skipped: data.length,
    errors: [{ entity: 'galactic_events', reason: 'Pas de table DB dédiée — import non supporté pour le moment' }]
  };
}

/**
 * Orchestrate import: backup → detect → import → return report.
 */
export async function runImport(data) {
  const format = detectFormat(data);
  if (!format) {
    return { format: null, backupPath: null, imported: 0, skipped: 0, errors: [{ entity: 'fichier', reason: 'Format JSON non reconnu' }] };
  }

  let backupPath;
  try {
    backupPath = await backupDatabase();
  } catch (err) {
    return { format, backupPath: null, imported: 0, skipped: 0, errors: [{ entity: 'backup', reason: `Backup échoué : ${err.message}` }] };
  }

  let report;
  switch (format) {
    case 'quadrants':
      report = importQuadrants(data);
      break;
    case 'perils':
      report = importPerils(data);
      break;
    case 'events':
      report = importGalacticEvents(data);
      break;
  }

  return { format, backupPath, ...report };
}
