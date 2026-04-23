import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { GalaxyMap } from '../../public/js/map/galaxy-map.js';
import { getConnectionState, handleVersionJump } from '../../public/js/map/map-service.js';

function createMapFixture() {
  const canvas = {
    width: 800,
    height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
    addEventListener() {},
    removeEventListener() {}
  };

  const ctx = {
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    font: 'sans-serif',
    textAlign: 'start',
    textBaseline: 'baseline',
    save() {},
    restore() {},
    translate() {},
    scale() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    fillText() {}
  };

  const systems = [
    { id: 's1', nom: 'Sol', quadrant: 'A-1', faction: 'Empire', is_frontiere: false }
  ];

  return new GalaxyMap(canvas, ctx, systems, ['A-1']);
}

describe('Story 3.3 - Map polling & deltas', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.navigator;
  });

  it('T7.1 revealed systems are added with animation queue', () => {
    const map = createMapFixture();

    const added = [];
    const originalAddSystem = map.addSystem.bind(map);
    map.addSystem = (system, delay) => {
      added.push({ id: system.id, delay });
      originalAddSystem(system, delay);
    };

    map.applyDeltas(
      [
        { id: 's2', nom: 'Alpha', quadrant: 'A-2', faction: 'Alliance', is_frontiere: false },
        { id: 's3', nom: 'Beta', quadrant: 'A-3', faction: 'Empire', is_frontiere: false }
      ],
      [],
      []
    );

    assert.equal(added.length, 2);
    assert.equal(added[0].delay, 0);
    assert.equal(added[1].delay, 200);
    assert.ok(map.systemPositions.has('s2'));
    assert.ok(map.systemPositions.has('s3'));
  });

  it('T7.2 hidden systems are removed surgically', () => {
    const map = createMapFixture();
    map.addSystem({ id: 's2', nom: 'Alpha', quadrant: 'A-2', faction: 'Alliance', is_frontiere: false }, 0);
    assert.ok(map.systemPositions.has('s2'));

    map.applyDeltas([], ['s2'], []);

    assert.ok(!map.systemPositions.has('s2'));
    assert.ok(map.systemPositions.has('s1'));
  });

  it('T7.3 updated systems patch existing node data', () => {
    const map = createMapFixture();
    map.applyDeltas([], [], [{ id: 's1', nom: 'Sol Prime', quadrant: 'A-1', faction: 'Alliance', is_frontiere: false }]);

    assert.equal(map.systemPositions.get('s1').system.nom, 'Sol Prime');
    assert.equal(map.systemPositions.get('s1').system.faction, 'Alliance');
  });

  it('T7.4 version jump triggers full refresh callback', async () => {
    let refreshCalls = 0;
    const refreshFn = async () => {
      refreshCalls++;
      return [{ id: 'sx', nom: 'Refresh', quadrant: 'A-1' }];
    };

    const result = await handleVersionJump(40, 45, refreshFn);

    assert.equal(refreshCalls, 1);
    assert.equal(result.jumped, true);
    assert.equal(result.refreshed, true);
    assert.equal(result.version, 45);
    assert.equal(result.systems.length, 1);
  });

  it('T7.5 version jump retries with exponential backoff', async () => {
    let attempts = 0;
    const delays = [];

    const refreshFn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('temporary failure');
      return [];
    };

    const result = await handleVersionJump(10, 15, refreshFn, {
      sleepFn: async (ms) => { delays.push(ms); },
      maxAttempts: 5
    });

    assert.equal(result.refreshed, true);
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [1000, 2000]);
  });

  it('T7.6 reduced-motion removes reveal staggering', () => {
    globalThis.window = {
      matchMedia: () => ({ matches: true })
    };

    const map = createMapFixture();
    const delays = [];
    map.addSystem = (_system, delay) => {
      delays.push(delay);
    };

    map.applyDeltas(
      [
        { id: 's2', nom: 'Alpha', quadrant: 'A-2', faction: 'Alliance', is_frontiere: false },
        { id: 's3', nom: 'Beta', quadrant: 'A-3', faction: 'Empire', is_frontiere: false },
        { id: 's4', nom: 'Gamma', quadrant: 'A-4', faction: 'Empire', is_frontiere: false }
      ],
      [],
      []
    );

    assert.deepEqual(delays, [0, 0, 0]);
  });

  it('T7.7 connection indicator state transitions are correct', () => {
    const now = Date.now();

    assert.equal(
      getConnectionState({ lastPollTime: now, pollFailureCount: 0, syncing: false, now }),
      'connected'
    );
    assert.equal(
      getConnectionState({ lastPollTime: now, pollFailureCount: 0, syncing: true, now }),
      'syncing'
    );
    assert.equal(
      getConnectionState({ lastPollTime: now, pollFailureCount: 2, syncing: false, now }),
      'offline'
    );
    assert.equal(
      getConnectionState({ lastPollTime: now - 16000, pollFailureCount: 0, syncing: false, now }),
      'offline'
    );
  });
});
