import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock document globally for poller.js visibility API
let visibilityHandler = null;
globalThis.document = {
  hidden: false,
  addEventListener(event, handler) {
    if (event === 'visibilitychange') visibilityHandler = handler;
  },
  removeEventListener(event, handler) {
    if (event === 'visibilitychange' && visibilityHandler === handler) {
      visibilityHandler = null;
    }
  }
};

const { createPoller } = await import('../../public/js/shared/poller.js');

describe('Poller', () => {
  let clock;
  let mockFetchCalls;
  let mockFetch;
  let mockGetTableId;
  let poller;

  beforeEach(() => {
    clock = { timers: [], now: 0 };
    mockFetchCalls = [];
    globalThis.document.hidden = false;
    visibilityHandler = null;

    mockFetch = (url) => {
      mockFetchCalls.push(url);
      return Promise.resolve({
        json: () => Promise.resolve({ data: { version: 1, timestamp: '2026-01-01T00:00:00.000Z', entities: {} } })
      });
    };

    mockGetTableId = () => '1';
  });

  afterEach(() => {
    if (poller && poller.isRunning()) {
      poller.stop();
    }
  });

  it('start() triggers an immediate fetch', async () => {
    const dataReceived = [];
    poller = createPoller({
      fetchFn: mockFetch,
      getTableIdFn: mockGetTableId,
      onData: (d) => dataReceived.push(d)
    });

    poller.start();
    // Wait for the initial async poll to complete
    await new Promise(r => setTimeout(r, 10));

    assert.equal(mockFetchCalls.length, 1);
    assert.equal(mockFetchCalls[0], '/api/sync');
    assert.equal(dataReceived.length, 1);
    assert.equal(dataReceived[0].version, 1);
  });

  it('start() does NOTHING if getActiveTableId() returns null', async () => {
    mockGetTableId = () => null;
    poller = createPoller({
      fetchFn: mockFetch,
      getTableIdFn: mockGetTableId,
      onData: () => assert.fail('should not be called')
    });

    poller.start();
    await new Promise(r => setTimeout(r, 10));

    assert.equal(mockFetchCalls.length, 0);
    assert.equal(poller.isRunning(), false);
  });

  it('isRunning() returns true after start, false after stop', async () => {
    poller = createPoller({
      fetchFn: mockFetch,
      getTableIdFn: mockGetTableId
    });

    assert.equal(poller.isRunning(), false);
    poller.start();
    assert.equal(poller.isRunning(), true);
    poller.stop();
    assert.equal(poller.isRunning(), false);
  });

  it('stop() removes the visibilitychange listener', async () => {
    poller = createPoller({
      fetchFn: mockFetch,
      getTableIdFn: mockGetTableId
    });

    poller.start();
    await new Promise(r => setTimeout(r, 10));
    assert.ok(visibilityHandler !== null, 'listener should be registered');

    poller.stop();
    assert.equal(visibilityHandler, null, 'listener should be removed');
  });

  it('onData callback is called with data from successful fetch', async () => {
    const received = [];
    poller = createPoller({
      fetchFn: mockFetch,
      getTableIdFn: mockGetTableId,
      onData: (d) => received.push(d)
    });

    poller.start();
    await new Promise(r => setTimeout(r, 10));

    assert.equal(received.length, 1);
    assert.deepStrictEqual(received[0].entities, {});
  });

  it('onError callback is called on network error', async () => {
    const errors = [];
    const failFetch = () => Promise.reject(new Error('network down'));

    poller = createPoller({
      fetchFn: failFetch,
      getTableIdFn: mockGetTableId,
      onError: (err) => errors.push(err)
    });

    poller.start();
    await new Promise(r => setTimeout(r, 10));

    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'network down');
  });

  it('onReconnect callback is called when fetch succeeds after an error', async () => {
    let callCount = 0;
    let reconnected = false;
    const errors = [];

    const sometimesFail = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('temporary failure'));
      }
      return Promise.resolve({
        json: () => Promise.resolve({ data: { version: 1, timestamp: '2026-01-01T00:00:00.000Z', entities: {} } })
      });
    };

    poller = createPoller({
      fetchFn: sometimesFail,
      getTableIdFn: mockGetTableId,
      intervalMs: 50,
      onError: (e) => errors.push(e),
      onReconnect: () => { reconnected = true; },
      onData: () => {}
    });

    poller.start();
    // First poll (fails)
    await new Promise(r => setTimeout(r, 20));
    assert.equal(errors.length, 1);
    assert.equal(reconnected, false);

    // Wait for second poll (succeeds)
    await new Promise(r => setTimeout(r, 100));
    assert.equal(reconnected, true);
  });

  it('switches to background interval when document.hidden = true', async () => {
    const calls = [];
    let resolveNext;

    const trackingFetch = (url) => {
      calls.push({ url, time: Date.now() });
      return Promise.resolve({
        json: () => Promise.resolve({ data: { version: 1, timestamp: '2026-01-01T00:00:00.000Z', entities: {} } })
      });
    };

    poller = createPoller({
      fetchFn: trackingFetch,
      getTableIdFn: mockGetTableId,
      intervalMs: 50,
      backgroundIntervalMs: 200,
      onData: () => {}
    });

    poller.start();
    await new Promise(r => setTimeout(r, 20)); // Initial fetch
    const initialCalls = calls.length;

    // Simulate going to background
    globalThis.document.hidden = true;
    if (visibilityHandler) visibilityHandler();

    // Wait for one background cycle — should be slower
    await new Promise(r => setTimeout(r, 120));
    const afterBackgroundCalls = calls.length;

    // In background at 200ms interval, only 0-1 additional calls expected in 120ms
    // (way fewer than foreground at 50ms would produce)
    assert.ok(afterBackgroundCalls - initialCalls <= 1,
      `Expected at most 1 background fetch, got ${afterBackgroundCalls - initialCalls}`);
  });

  it('returns to foreground interval + immediate fetch when document.hidden = false', async () => {
    const calls = [];

    const trackingFetch = () => {
      calls.push(Date.now());
      return Promise.resolve({
        json: () => Promise.resolve({ data: { version: 1, timestamp: '2026-01-01T00:00:00.000Z', entities: {} } })
      });
    };

    poller = createPoller({
      fetchFn: trackingFetch,
      getTableIdFn: mockGetTableId,
      intervalMs: 50,
      backgroundIntervalMs: 500,
      onData: () => {}
    });

    poller.start();
    await new Promise(r => setTimeout(r, 20)); // Initial fetch

    // Go to background
    globalThis.document.hidden = true;
    if (visibilityHandler) visibilityHandler();
    await new Promise(r => setTimeout(r, 20));
    const callsBeforeReturn = calls.length;

    // Return to foreground — should trigger immediate fetch
    globalThis.document.hidden = false;
    if (visibilityHandler) visibilityHandler();
    await new Promise(r => setTimeout(r, 20));

    assert.ok(calls.length > callsBeforeReturn,
      'Expected an immediate fetch on return to foreground');
  });

  it('setIntervals({ immediate: true }) triggers immediate refetch while running', async () => {
    const calls = [];

    const trackingFetch = () => {
      calls.push(Date.now());
      return Promise.resolve({
        json: () => Promise.resolve({ data: { version: 1, timestamp: '2026-01-01T00:00:00.000Z', entities: {} } })
      });
    };

    poller = createPoller({
      fetchFn: trackingFetch,
      getTableIdFn: mockGetTableId,
      intervalMs: 500,
      backgroundIntervalMs: 2000,
      onData: () => {}
    });

    poller.start();
    await new Promise(r => setTimeout(r, 20));
    const before = calls.length;

    poller.setIntervals({ intervalMs: 50, backgroundIntervalMs: 500, immediate: true });
    await new Promise(r => setTimeout(r, 30));

    assert.ok(calls.length > before, 'Expected an immediate fetch after setIntervals(immediate)');
  });
});
