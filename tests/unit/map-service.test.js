import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Tests will use DOM APIs so we mock minimal canvas/system data
// These are unit tests for map logic (not integration via browser)

import { parseQuadrantCoords, getSystemPosition, getFactionColor, loadSystems, loadQuadrants } from '../../public/js/map/map-service.js';

describe('GalaxyMap Service', () => {
  describe('parseQuadrantCoords', () => {
    it('parses single letter quadrant', () => {
      const [col, row] = parseQuadrantCoords('Α-1');
      assert.equal(col, 0);
      assert.equal(row, 39); // 40 - 1
    });

    it('parses multi-letter quadrant', () => {
      const [col, row] = parseQuadrantCoords('Β-3');
      assert.equal(col, 1);
      assert.equal(row, 37); // 40 - 3
    });

    it('parses double-letter quadrant', () => {
      const [col, row] = parseQuadrantCoords('Α′-5');
      assert.equal(col, 24); // index of Α′ in _LETTRES_MA
      assert.equal(row, 35); // 40 - 5
    });

    it('returns [0,0] for invalid format', () => {
      const [col, row] = parseQuadrantCoords('INVALID');
      assert.equal(col, 0);
      assert.equal(row, 0);
    });
  });

  describe('getSystemPosition', () => {
    it('returns deterministic position for same system', () => {
      const sys = { nom: 'Sol', id: 's1' };
      const pos1 = getSystemPosition(sys, [0, 0], 200);
      const pos2 = getSystemPosition(sys, [0, 0], 200);
      assert.equal(pos1.x, pos2.x);
      assert.equal(pos1.y, pos2.y);
    });

    it('position is within quadrant cell', () => {
      const sys = { nom: 'Alpha', id: 's2' };
      const pos = getSystemPosition(sys, [1, 2], 200);
      const cellX = 1 * 200;
      const cellY = 2 * 200;
      const centerX = cellX + 100;
      const centerY = cellY + 100;
      
      const dist = Math.sqrt((pos.x - centerX) ** 2 + (pos.y - centerY) ** 2);
      assert.ok(dist < 100, 'System should be within cell');
    });

    it('different systems have different positions', () => {
      const sys1 = { nom: 'Alpha', id: 's1' };
      const sys2 = { nom: 'Beta', id: 's2' };
      const pos1 = getSystemPosition(sys1, [0, 0], 200);
      const pos2 = getSystemPosition(sys2, [0, 0], 200);
      
      const isSame = pos1.x === pos2.x && pos1.y === pos2.y;
      assert.ok(!isSame, 'Different systems should have different positions');
    });
  });

  describe('getFactionColor', () => {
    it('returns red for Empire', () => {
      const color = getFactionColor('Empire');
      assert.equal(color, '#ef4444');
    });

    it('returns blue for Alliance', () => {
      const color = getFactionColor('Alliance');
      assert.equal(color, '#3b82f6');
    });

    it('returns gray for null faction', () => {
      const color = getFactionColor(null);
      assert.equal(color, '#666666');
    });

    it('returns default gray for unknown faction', () => {
      const color = getFactionColor('UnknownFaction');
      assert.equal(color, '#9ca3af');
    });
  });
});
