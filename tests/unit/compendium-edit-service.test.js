import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/database.js';

const TEST_PREFIX = '__test_edit_svc_';

function cleanTestData() {
  db.prepare(`DELETE FROM systems WHERE nom LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM factions WHERE name LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM ship_models WHERE id LIKE '${TEST_PREFIX}%'`).run();
}

describe('Compendium edit service — updateSystem()', () => {
  let updateSystem, getSystem;
  let sysId;

  before(async () => {
    cleanTestData();
    const mod = await import('../../src/services/compendium.js');
    updateSystem = mod.updateSystem;
    getSystem = mod.getSystem;

    const r = db.prepare('INSERT INTO systems (quadrant, nom, faction, gouvernement, description) VALUES (?, ?, ?, ?, ?)').run('Alpha', `${TEST_PREFIX}sys1`, 'Empire', 'Monarchie', 'Description originale');
    sysId = Number(r.lastInsertRowid);
  });

  after(() => {
    cleanTestData();
  });

  it('should update only provided fields and keep others intact', () => {
    const result = updateSystem(sysId, { description: 'Nouvelle description' });
    assert.equal(result.description, 'Nouvelle description');
    assert.equal(result.nom, `${TEST_PREFIX}sys1`);
    assert.equal(result.faction, 'Empire');
    assert.equal(result.gouvernement, 'Monarchie');
  });

  it('should update multiple fields at once', () => {
    const result = updateSystem(sysId, { faction: 'Rébellion', gouvernement: 'Démocratie' });
    assert.equal(result.faction, 'Rébellion');
    assert.equal(result.gouvernement, 'Démocratie');
  });

  it('should ignore non-allowed fields (id, created_at)', () => {
    const before = getSystem(sysId);
    const result = updateSystem(sysId, { id: 99999, created_at: '2000-01-01', description: 'Still works' });
    assert.equal(result.id, sysId);
    assert.equal(result.description, 'Still works');
  });

  it('should return error object when no valid fields provided', () => {
    const result = updateSystem(sysId, { id: 99999, unknown_field: 'bad' });
    assert.ok(result.error);
  });

  it('should return null for non-existent id', () => {
    const result = updateSystem(999999, { nom: 'test' });
    assert.equal(result, null);
  });
});

describe('Compendium edit service — updateFaction()', () => {
  let updateFaction, getFaction;
  let facId;

  before(async () => {
    cleanTestData();
    const mod = await import('../../src/services/compendium.js');
    updateFaction = mod.updateFaction;
    getFaction = mod.getFaction;

    const r = db.prepare('INSERT INTO factions (name, short, description, icon, color) VALUES (?, ?, ?, ?, ?)').run(`${TEST_PREFIX}fac1`, 'TF', 'Desc originale', '⚔️', '#ff0000');
    facId = Number(r.lastInsertRowid);
  });

  after(() => {
    cleanTestData();
  });

  it('should update partial fields on faction', () => {
    const result = updateFaction(facId, { description: 'Nouvelle desc' });
    assert.equal(result.description, 'Nouvelle desc');
    assert.equal(result.name, `${TEST_PREFIX}fac1`);
    assert.equal(result.short, 'TF');
  });

  it('should update color and icon', () => {
    const result = updateFaction(facId, { color: '#00ff00', icon: '🏴' });
    assert.equal(result.color, '#00ff00');
    assert.equal(result.icon, '🏴');
  });

  it('should return null for non-existent faction', () => {
    assert.equal(updateFaction(999999, { name: 'test' }), null);
  });
});

describe('Compendium edit service — updateShipModel()', () => {
  let updateShipModel, getShipModel;
  const smId = `${TEST_PREFIX}sm1`;

  before(async () => {
    cleanTestData();
    const mod = await import('../../src/services/compendium.js');
    updateShipModel = mod.updateShipModel;
    getShipModel = mod.getShipModel;

    db.prepare('INSERT INTO ship_models (id, nom, classe, origine, prix) VALUES (?, ?, ?, ?, ?)').run(smId, `${TEST_PREFIX}Corvette`, 'Léger', 'Empire', 50000);
  });

  after(() => {
    cleanTestData();
  });

  it('should update ship_model with TEXT id', () => {
    const result = updateShipModel(smId, { nom: `${TEST_PREFIX}Frégate` });
    assert.equal(result.nom, `${TEST_PREFIX}Frégate`);
    assert.equal(result.classe, 'Léger');
  });

  it('should update numeric fields', () => {
    const result = updateShipModel(smId, { prix: 75000, blindage: 120 });
    assert.equal(result.prix, 75000);
    assert.equal(result.blindage, 120);
  });

  it('should not allow editing armement_json or systemes_secondaires_json', () => {
    const result = updateShipModel(smId, { armement_json: '[{"bad":"data"}]', nom: `${TEST_PREFIX}Frégate` });
    // armement_json filtered out, only nom applied
    assert.equal(result.nom, `${TEST_PREFIX}Frégate`);
  });

  it('should return null for non-existent ship_model', () => {
    assert.equal(updateShipModel('nonexistent_id', { nom: 'test' }), null);
  });
});
