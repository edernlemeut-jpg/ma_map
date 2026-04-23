/**
 * seed.js — Importe les données des fichiers JSON existants dans la BDD SQLite.
 * Usage: node seed.js
 * 
 * Lit quadrants_MA.json, perils_data.json, et les modèles de vaisseaux
 * depuis le code source de itineraire.html (INITIAL_SHIP_MODELS).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initDB, getDB, systemObjToRow, shipModelObjToRow } = require('./src/database');

initDB();
const d = getDB();

// ── 1. Importer les quadrants (systèmes stellaires) ──
const qPath = path.join(__dirname, 'quadrants_MA.json');
if (fs.existsSync(qPath)) {
  const data = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const existing = d.prepare('SELECT COUNT(*) as c FROM systems').get().c;
  if (existing > 0) {
    console.log(`⚠️  systèmes: ${existing} déjà en BDD, skip (--force pour écraser)`);
  } else {
    const stmt = d.prepare(`INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)
      VALUES (@quadrant, @nom, @faction, @is_frontiere, @route, @gouvernement, @description, @soleil_json, @corps_celestes_json, @patrouilles_json)`);
    let count = 0;
    const tx = d.transaction(() => {
      for (const [coord, systems] of Object.entries(data)) {
        if (!Array.isArray(systems)) continue;
        for (const sys of systems) {
          stmt.run(systemObjToRow(coord, sys));
          count++;
        }
      }
    });
    tx();
    console.log(`✅ ${count} systèmes importés depuis quadrants_MA.json`);
  }
} else {
  console.log('⚠️  quadrants_MA.json introuvable, skip');
}

// ── 2. Importer les données de périls ──
const pPath = path.join(__dirname, 'perils_data.json');
if (fs.existsSync(pPath)) {
  const data = JSON.parse(fs.readFileSync(pPath, 'utf8'));
  const existing = d.prepare('SELECT COUNT(*) as c FROM peril_data').get().c;
  if (existing > 0) {
    console.log(`⚠️  périls: ${existing} types déjà en BDD, skip`);
  } else {
    const stmt = d.prepare('INSERT INTO peril_data (type, data_json) VALUES (?, ?)');
    let count = 0;
    for (const [type, obj] of Object.entries(data)) {
      stmt.run(type, JSON.stringify(obj));
      count++;
    }
    console.log(`✅ ${count} types de périls importés depuis perils_data.json`);
  }
} else {
  console.log('⚠️  perils_data.json introuvable, skip');
}

// ── 3. Importer les modèles de vaisseaux depuis itineraire.html ──
const iPath = path.join(__dirname, 'public', 'itineraire.html');
if (fs.existsSync(iPath)) {
  const existing = d.prepare('SELECT COUNT(*) as c FROM ship_models').get().c;
  if (existing > 0) {
    console.log(`⚠️  modèles vaisseaux: ${existing} déjà en BDD, skip`);
  } else {
    const html = fs.readFileSync(iPath, 'utf8');
    // Extract INITIAL_SHIP_MODELS array
    const match = html.match(/const INITIAL_SHIP_MODELS\s*=\s*\[([\s\S]*?)\];\s*\n/);
    if (match) {
      try {
        // Safe eval of the array literal
        const models = Function(`'use strict'; return [${match[1]}];`)();
        const stmt = d.prepare(`INSERT INTO ship_models (id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie,
          manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json)
          VALUES (@id, @nom, @classe, @vitesse_croisiere, @vitesse_hyperspatiale, @autonomie,
          @manoeuvrabilite, @vitesse_tactique, @blindage, @coque, @senseurs, @equipage, @passagers, @soute, @prix, @origine, @image, @armement_json, @systemes_secondaires_json)`);
        const tx = d.transaction(() => {
          for (const m of models) stmt.run(shipModelObjToRow(m));
        });
        tx();
        console.log(`✅ ${models.length} modèles de vaisseaux importés`);
      } catch (e) {
        console.error('❌ Erreur parsing modèles vaisseaux:', e.message);
      }
    } else {
      console.log('⚠️  INITIAL_SHIP_MODELS non trouvé dans itineraire.html');
    }
  }
} else {
  console.log('⚠️  itineraire.html introuvable');
}

// ── 4. Importer les factions depuis itineraire.html ──
// (les factions sont dans localStorage mais les noms sont dans les systèmes et modèles)
{
  const existing = d.prepare('SELECT COUNT(*) as c FROM factions').get().c;
  if (existing > 0) {
    console.log(`⚠️  factions: ${existing} déjà en BDD, skip`);
  } else {
    // Extraire les factions uniques depuis les systèmes
    const factionNames = new Set();
    const systems = d.prepare("SELECT DISTINCT faction FROM systems WHERE faction != ''").all();
    systems.forEach(s => factionNames.add(s.faction));
    const models = d.prepare("SELECT DISTINCT origine FROM ship_models WHERE origine != ''").all();
    models.forEach(m => factionNames.add(m.origine));

    if (factionNames.size > 0) {
      const stmt = d.prepare('INSERT OR IGNORE INTO factions (name) VALUES (?)');
      const tx = d.transaction(() => {
        for (const name of factionNames) stmt.run(name);
      });
      tx();
      console.log(`✅ ${factionNames.size} factions extraites et importées`);
    } else {
      console.log('⚠️  Aucune faction trouvée');
    }
  }
}

console.log('\n🏁 Seed terminé. La BDD est prête:', path.join(__dirname, 'db', 'ma.db'));
console.log('   Pour démarrer le serveur: npm start');
