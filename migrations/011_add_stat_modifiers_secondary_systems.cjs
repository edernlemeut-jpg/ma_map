/**
 * Migration 011 – Add stat_modifiers_json to secondary_systems
 *
 * Stores structured stat modifiers for each secondary system so the app can
 * automatically apply / revert them when a system is installed / uninstalled on a ship.
 *
 * Modifier format (array of objects):
 *   { stat, op, value }
 *   op: "add"        – numeric addition           (blindage, vitesse_croisiere, autonomie)
 *       "add_kt"     – parse "X K/t" string, add, reformat  (vitesse_tactique)
 *       "multiply"   – multiply base by value      (autonomie ×2)
 *       "pct_add"    – add N% of cargo_capacity    (soute)
 *
 * Systems with stat modifiers (identified from descriptions):
 *   c87216df  Blindage supplémentaire  → blindage +1
 *   8adc8a60  Convertisseurs HF        → vitesse_tactique +25 K/t, vitesse_croisiere +0.1
 *   747cc7e1  Module double dose       → autonomie ×2
 *   79468fbe  Soute auxiliaire         → cargo_capacity +25%
 */

'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/ma.db');
const db = new Database(DB_PATH);

const run = db.transaction(() => {
  // 1. Add column (idempotent)
  const cols = db.prepare("PRAGMA table_info(secondary_systems)").all().map(c => c.name);
  if (!cols.includes('stat_modifiers_json')) {
    db.prepare("ALTER TABLE secondary_systems ADD COLUMN stat_modifiers_json TEXT NOT NULL DEFAULT '[]'").run();
    console.log('[011] Column stat_modifiers_json added.');
  } else {
    console.log('[011] Column stat_modifiers_json already exists – skipping ALTER.');
  }

  // 2. Populate known modifiers
  const updates = [
    {
      id: 'c87216df-81e8-49e2-93e8-c8272ed3cb41', // Blindage supplémentaire
      mods: [{ stat: 'blindage', op: 'add', value: 1 }],
    },
    {
      id: '8adc8a60-e52f-4814-8f16-8f927a1f3a36', // Convertisseurs haute fiabilité
      mods: [
        { stat: 'vitesse_tactique', op: 'add_kt', value: 25 },
        { stat: 'vitesse_croisiere', op: 'add', value: 0.1 },
      ],
    },
    {
      id: '747cc7e1-5d12-4b35-9c16-2c1a4fc90156', // Module double dose
      mods: [{ stat: 'autonomie', op: 'multiply', value: 2 }],
    },
    {
      id: '79468fbe-65cd-4cba-9a21-d4b23c697c05', // Soute auxiliaire
      mods: [{ stat: 'cargo_capacity', op: 'pct_add', value: 25 }],
    },
  ];

  const stmt = db.prepare('UPDATE secondary_systems SET stat_modifiers_json = ? WHERE id = ?');
  for (const { id, mods } of updates) {
    const result = stmt.run(JSON.stringify(mods), id);
    const sys = db.prepare('SELECT nom FROM secondary_systems WHERE id = ?').get(id);
    if (result.changes > 0) {
      console.log(`[011] Set modifiers for "${sys?.nom ?? id}": ${JSON.stringify(mods)}`);
    } else {
      console.warn(`[011] System not found: ${id}`);
    }
  }
});

try {
  run();
  console.log('[011] Migration completed successfully.');
} catch (err) {
  console.error('[011] Migration failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
