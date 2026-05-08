const db = require('../src/database.cjs');
const rows = db.prepare("SELECT id, name, extra FROM rules_entries WHERE category='origines'").all();
rows.forEach(r => {
  const e = JSON.parse(r.extra || '{}');
  console.log(r.name, '| nation:', e.nation, '| id:', r.id);
});
process.exit(0);
