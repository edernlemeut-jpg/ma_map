/**
 * seed-systems.js
 * Purge la table systems + visibility associée, puis réimporte
 * depuis quadrants_MA.json à la racine du projet.
 *
 * Usage :  node scripts/seed-systems.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../src/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, '..', 'quadrants_MA.json');
const raw = readFileSync(jsonPath, 'utf-8');
const quadrants = JSON.parse(raw);

// ── Purge ─────────────────────────────────────────────────────────────────────
console.log('🗑️  Purge de la table systems et visibility associée…');
db.prepare("DELETE FROM visibility_rules WHERE entity_type = 'systems'").run();
db.prepare("DELETE FROM table_visibility_overrides WHERE entity_type = 'systems'").run();
db.prepare("DELETE FROM systems").run();
console.log('   Done.');

// ── Collecte des systèmes ────────────────────────────────────────────────────
const systems = [];
for (const [quadrant, arr] of Object.entries(quadrants)) {
  if (!Array.isArray(arr)) continue;
  for (const s of arr) {
    if (!s || !s.nom) continue;

    // Étoile / soleil
    const soleil = s.soleil || null;
    const soleil_json = soleil ? JSON.stringify(soleil) : null;

    // Corps célestes
    const corps = Array.isArray(s.corpsCelestes) ? s.corpsCelestes : [];
    const corps_celestes_json = corps.length ? JSON.stringify(corps) : null;

    // Patrouilles
    const patr = Array.isArray(s.patrouilles) ? s.patrouilles : [];
    const patrouilles_json = patr.length ? JSON.stringify(patr) : null;

    systems.push({
      quadrant,
      nom: s.nom,
      faction: s.faction || null,
      is_frontiere: s.isFrontiere ? 1 : 0,
      route: s.route || null,
      gouvernement: s.gouvernement || null,
      description: s.description || null,
      soleil_json,
      corps_celestes_json,
      patrouilles_json,
    });
  }
}

// ── Insertion ─────────────────────────────────────────────────────────────────
console.log(`🚀 Import de ${systems.length} système(s)…`);
const stmt = db.prepare(`
  INSERT INTO systems
    (quadrant, nom, faction, is_frontiere, route, gouvernement, description,
     soleil_json, corps_celestes_json, patrouilles_json)
  VALUES
    (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description,
     @soleil_json, @corps_celestes_json, @patrouilles_json)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) stmt.run(row);
});
insertMany(systems);

console.log(`✅ ${systems.length} systèmes insérés avec succès.`);

// Recap par faction
const byfaction = {};
for (const s of systems) {
  const f = s.faction || '(aucune)';
  byfaction[f] = (byfaction[f] || 0) + 1;
}
for (const [f, n] of Object.entries(byfaction).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${n} × ${f}`);
}
