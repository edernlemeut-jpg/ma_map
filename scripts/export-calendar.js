import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = Database(resolve(__dirname, '../db/ma.db'));

const esc = (s) => (s ?? '').replace(/'/g, "''");
const str = (s) => s != null ? `'${esc(s)}'` : 'NULL';
const num = (n) => n != null ? n : 'NULL';

const lines = [
  `-- Calendar export -- ${new Date().toISOString()}`,
  'PRAGMA foreign_keys = OFF;',
  'BEGIN TRANSACTION;',
];

// calendar_categories
const cats = db.prepare('SELECT * FROM calendar_categories').all();
for (const r of cats) {
  lines.push(
    `INSERT OR IGNORE INTO calendar_categories (id,table_id,name,color,is_system) VALUES (${r.id},${r.table_id},${str(r.name)},${str(r.color)},${num(r.is_system)});`
  );
}

// calendar_events
const evts = db.prepare('SELECT * FROM calendar_events').all();
for (const r of evts) {
  lines.push(
    `INSERT OR IGNORE INTO calendar_events (id,table_id,title,description,category_id,color,date_start,date_end,galactic_year,is_public,created_by) VALUES (${str(r.id)},${r.table_id},${str(r.title)},${str(r.description)},${num(r.category_id)},${str(r.color)},${str(r.date_start)},${str(r.date_end)},${r.galactic_year},${r.is_public},${r.created_by});`
  );
}

lines.push('COMMIT;');
lines.push('PRAGMA foreign_keys = ON;');

const outPath = resolve(__dirname, '../calendar_export.sql');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`✅ Exporté : ${cats.length} catégories, ${evts.length} événements → calendar_export.sql`);
db.close();
