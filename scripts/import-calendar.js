import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2] || resolve(__dirname, '../calendar_export.sql');
const dbFile  = resolve(__dirname, '../db/ma.db');

const sql = readFileSync(sqlFile, 'utf8');
const db  = Database(dbFile);

// Split sur les ; en ignorant les lignes PRAGMA/BEGIN/COMMIT séparées
const statements = sql
  .split('\n')
  .filter(l => !l.startsWith('--') && l.trim())
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

let cats = 0, evts = 0, errors = 0;

db.transaction(() => {
  for (const stmt of statements) {
    try {
      db.prepare(stmt).run();
      if (stmt.includes('calendar_categories')) cats++;
      if (stmt.includes('calendar_events')) evts++;
    } catch (err) {
      if (!stmt.startsWith('PRAGMA') && !stmt.startsWith('BEGIN') && !stmt.startsWith('COMMIT')) {
        console.error(`⚠️  Erreur sur: ${stmt.slice(0, 80)}...`);
        console.error(`   ${err.message}`);
        errors++;
      }
    }
  }
})();

db.close();
console.log(`✅ Import terminé : ${cats} catégories, ${evts} événements, ${errors} erreur(s)`);
