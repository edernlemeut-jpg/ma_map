import db from '../src/database.js';
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(r => {
  console.log(r.name, '->', db.prepare(`PRAGMA table_info("${r.name}")`).all().map(c=>c.name).join(', '));
});
process.exit(0);
