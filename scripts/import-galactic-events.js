/**
 * import-galactic-events.js
 * Importe les événements du fichier galactic_events.json dans la table "El barco del Sol" (id=1630).
 *
 * Usage : node scripts/import-galactic-events.js
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../db/ma.db');
const JSON_PATH = resolve(__dirname, '../../Archive/Nouveau dossier/MA/galactic_events.json');

const TABLE_ID = 1630;           // "El barco del Sol"
const CREATOR_ID = 2354;         // Crepe (MJ)

const db = Database(DB_PATH);

// S'assurer que la colonne color existe
const evtCols = new Set(db.prepare("PRAGMA table_info('calendar_events')").all().map(c => c.name));
if (!evtCols.has('color')) {
  db.exec("ALTER TABLE calendar_events ADD COLUMN color TEXT");
  console.log('✅ Colonne color ajoutée à calendar_events');
}

// Lire le JSON
const events = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
console.log(`📖 ${events.length} événements trouvés dans le JSON`);

const insertStmt = db.prepare(
  `INSERT INTO calendar_events
     (id, table_id, title, description, category_id, color, date_start, date_end, galactic_year, is_public, created_by, created_at)
   VALUES
     (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 1, ?, ?)`
);

let inserted = 0;
let skipped = 0;

const importAll = db.transaction(() => {
  for (const ev of events) {
    // Vérification basique du format de date
    const dateRe = /^\d{4}\.\d{2}$/;
    if (!dateRe.test(ev.dateStart)) {
      console.warn(`  ⚠ Date invalide pour "${ev.title}" : ${ev.dateStart} — ignoré`);
      skipped++;
      continue;
    }

    const dateEnd = ev.dateEnd && dateRe.test(ev.dateEnd) && ev.dateEnd !== ev.dateStart
      ? ev.dateEnd
      : null;

    insertStmt.run(
      randomUUID(),
      TABLE_ID,
      ev.title,
      ev.color || null,
      ev.dateStart,
      dateEnd,
      ev.galacticYear,
      CREATOR_ID,
      ev.createdAt || new Date().toISOString()
    );
    inserted++;
  }
});

importAll();

console.log(`\n✅ Import terminé : ${inserted} événements importés, ${skipped} ignorés.`);
db.close();
