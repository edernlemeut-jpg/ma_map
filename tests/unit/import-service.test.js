import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_PREFIX = '__test_import_';

// We test detectFormat, importQuadrants, importPerils, importGalacticEvents
// backupDatabase is async and requires real file — tested in integration

let detectFormat, importQuadrants, importPerils, importGalacticEvents;
let db;

before(async () => {
  ({ detectFormat, importQuadrants, importPerils, importGalacticEvents } = await import('../../src/services/import.js'));
  db = (await import('../../src/database.js')).default;
});

after(() => {
  // Cleanup test data
  db.prepare('DELETE FROM systems WHERE nom LIKE ?').run(TEST_PREFIX + '%');
  db.prepare('DELETE FROM factions WHERE name LIKE ?').run(TEST_PREFIX + '%');
  db.prepare('DELETE FROM peril_data WHERE type LIKE ?').run(TEST_PREFIX + '%');
});

describe('detectFormat', () => {
  it('detects quadrants format (object with arrays)', () => {
    const data = { 'A-1': [{ nom: 'Sol' }], 'B-2': [] };
    assert.equal(detectFormat(data), 'quadrants');
  });

  it('detects perils format (object with categories)', () => {
    const data = { interplanetaire: { name: 'Perils', categories: [] } };
    assert.equal(detectFormat(data), 'perils');
  });

  it('detects events format (array with title+dateStart)', () => {
    const data = [{ title: 'Event 1', dateStart: '0101.01' }];
    assert.equal(detectFormat(data), 'events');
  });

  it('returns null for unrecognized format', () => {
    assert.equal(detectFormat({ foo: 'bar' }), null);
    assert.equal(detectFormat(null), null);
    assert.equal(detectFormat([{ random: true }]), null);
  });
});

describe('importQuadrants', () => {
  it('imports systems and extracts factions', () => {
    const data = {
      'TEST-Q1': [
        { nom: `${TEST_PREFIX}Sol`, faction: `${TEST_PREFIX}Empire`, isFrontiere: true, gouvernement: 'Impérial', route: 'Route +1', description: 'Un système', soleil: { nom: 'Helios' }, corpsCelestes: [], patrouilles: [] }
      ]
    };
    const report = importQuadrants(data);
    assert.equal(report.imported, 1);
    assert.equal(report.skipped, 0);
    assert.equal(report.errors.length, 0);

    // Verify system in DB
    const sys = db.prepare('SELECT * FROM systems WHERE nom = ?').get(`${TEST_PREFIX}Sol`);
    assert.ok(sys);
    assert.equal(sys.quadrant, 'TEST-Q1');
    assert.equal(sys.faction, `${TEST_PREFIX}Empire`);
    assert.equal(sys.is_frontiere, 1);

    // Verify faction extracted
    const fac = db.prepare('SELECT * FROM factions WHERE name = ?').get(`${TEST_PREFIX}Empire`);
    assert.ok(fac);
  });

  it('skips system without nom', () => {
    const data = { 'TEST-Q2': [{ faction: 'Unknown' }] };
    const report = importQuadrants(data);
    assert.equal(report.imported, 0);
    assert.equal(report.skipped, 1);
    assert.equal(report.errors.length, 1);
    assert.ok(report.errors[0].reason.includes('Nom manquant'));
  });

  it('handles UNIQUE constraint (duplicate quadrant+nom)', () => {
    // Insert first
    const data1 = { 'TEST-Q3': [{ nom: `${TEST_PREFIX}Dup` }] };
    importQuadrants(data1);

    // Duplicate
    const data2 = { 'TEST-Q3': [{ nom: `${TEST_PREFIX}Dup` }] };
    const report = importQuadrants(data2);
    assert.equal(report.imported, 0);
    assert.equal(report.skipped, 1);
    assert.ok(report.errors[0].reason.includes('Doublon'));
  });

  it('handles empty quadrant (no systems)', () => {
    const data = { 'EMPTY-Q': [] };
    const report = importQuadrants(data);
    assert.equal(report.imported, 0);
    assert.equal(report.skipped, 0);
    assert.equal(report.errors.length, 0);
  });
});

describe('importPerils', () => {
  it('imports peril data entries', () => {
    const data = {
      [`${TEST_PREFIX}type1`]: { name: 'Test Peril', categories: [{ seuilMin: 1, seuilMax: 3 }] }
    };
    const report = importPerils(data);
    assert.equal(report.imported, 1);
    assert.equal(report.skipped, 0);

    const row = db.prepare('SELECT * FROM peril_data WHERE type = ?').get(`${TEST_PREFIX}type1`);
    assert.ok(row);
    const parsed = JSON.parse(row.data_json);
    assert.equal(parsed.name, 'Test Peril');
  });

  it('replaces existing peril data (INSERT OR REPLACE)', () => {
    const data1 = { [`${TEST_PREFIX}type2`]: { name: 'V1', categories: [] } };
    importPerils(data1);

    const data2 = { [`${TEST_PREFIX}type2`]: { name: 'V2', categories: [] } };
    const report = importPerils(data2);
    assert.equal(report.imported, 1);

    const row = db.prepare('SELECT * FROM peril_data WHERE type = ?').get(`${TEST_PREFIX}type2`);
    const parsed = JSON.parse(row.data_json);
    assert.equal(parsed.name, 'V2');
  });
});

describe('importGalacticEvents', () => {
  it('returns skipped report (no DB table)', () => {
    const data = [{ title: 'Event', dateStart: '0101.01' }, { title: 'Event2', dateStart: '0102.01' }];
    const report = importGalacticEvents(data);
    assert.equal(report.imported, 0);
    assert.equal(report.skipped, 2);
    assert.equal(report.errors.length, 1);
    assert.ok(report.errors[0].reason.includes('non supporté'));
  });
});
