import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredCommitQueue } from '../../public/js/shared/deferred-commit.js';

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map();

  function setTimeoutFn(fn, ms) {
    const id = nextId++;
    timers.set(id, { fn, ms, cleared: false });
    return id;
  }

  function clearTimeoutFn(id) {
    const t = timers.get(id);
    if (t) t.cleared = true;
  }

  function runTimer(id) {
    const t = timers.get(id);
    if (!t || t.cleared) return;
    t.cleared = true;
    t.fn();
  }

  function runAllTimers() {
    for (const [id, t] of timers.entries()) {
      if (!t.cleared) {
        runTimer(id);
      }
    }
  }

  function pendingTimerCount() {
    let n = 0;
    for (const t of timers.values()) {
      if (!t.cleared) n++;
    }
    return n;
  }

  return { setTimeoutFn, clearTimeoutFn, runTimer, runAllTimers, pendingTimerCount, timers };
}

function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(data.entries());
    }
  };
}

describe('Deferred Commit Queue', () => {
  it('T4.4.1 enqueue does not commit before timeout', async () => {
    const fake = createFakeTimers();
    const commits = [];

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      commitFn: async (entry) => { commits.push(entry.payload); },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { k: 1 } });

    assert.equal(commits.length, 0);
    assert.equal(queue.pendingCount(), 1);
    assert.equal(fake.pendingTimerCount(), 1);
  });

  it('T4.4.2 undoLatest cancels pending commit and runs rollback callback', async () => {
    const fake = createFakeTimers();
    const commits = [];
    let rolledBack = false;

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      commitFn: async () => { commits.push('sent'); },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({
      label: 'op1',
      payload: { k: 1 },
      onOptimisticRollback: () => { rolledBack = true; }
    });

    const undone = queue.undoLatest();
    fake.runAllTimers();
    await Promise.resolve();

    assert.equal(undone, true);
    assert.equal(rolledBack, true);
    assert.equal(commits.length, 0);
    assert.equal(queue.pendingCount(), 0);
  });

  it('T4.4.3 timeout commits action automatically', async () => {
    const fake = createFakeTimers();
    const commits = [];

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      commitFn: async (entry) => { commits.push(entry.payload.id); },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 123 } });

    const timerId = [...fake.timers.keys()][0];
    fake.runTimer(timerId);
    await Promise.resolve();

    assert.deepEqual(commits, [123]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('T4.4.4 queue keeps max 3 pending and commits oldest on 4th enqueue', async () => {
    const fake = createFakeTimers();
    const commits = [];

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      maxPending: 3,
      commitFn: async (entry) => { commits.push(entry.label); },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });
    await queue.enqueue({ label: 'op2', payload: { id: 2 } });
    await queue.enqueue({ label: 'op3', payload: { id: 3 } });
    await queue.enqueue({ label: 'op4', payload: { id: 4 } });

    assert.equal(queue.pendingCount(), 3);
    assert.deepEqual(commits, ['op1']);
    assert.equal(queue.latest()?.label, 'op4');
    assert.equal(queue.collapsedCount(), 2);
  });

  it('T4.4.5 flushAll commits all pending immediately (navigation safety)', async () => {
    const fake = createFakeTimers();
    const commits = [];

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      maxPending: 3,
      commitFn: async (entry, opts) => {
        commits.push({ label: entry.label, keepalive: !!opts.keepalive });
      },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });
    await queue.enqueue({ label: 'op2', payload: { id: 2 } });

    const flushed = await queue.flushAll({ keepalive: true });

    assert.equal(flushed, 2);
    assert.equal(queue.pendingCount(), 0);
    assert.deepEqual(commits, [
      { label: 'op1', keepalive: true },
      { label: 'op2', keepalive: true }
    ]);
  });

  it('persists pending entries and restores them on reload', async () => {
    const fake = createFakeTimers();
    const storage = createFakeStorage();

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      persistenceKey: 'queue:test',
      storage,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { kind: 'bulk', id: 1 } });
    assert.ok(storage.getItem('queue:test'));

    const restoredQueue = createDeferredCommitQueue({
      delayMs: 8000,
      persistenceKey: 'queue:test',
      storage,
      hydrateEntry: (record) => ({ label: record.label, payload: record.payload, createdAt: record.createdAt }),
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    const restored = restoredQueue.restorePersisted();
    assert.deepEqual(restored, { restored: 1, discarded: 0 });
    assert.equal(restoredQueue.pendingCount(), 1);
    assert.equal(restoredQueue.latest()?.payload.kind, 'bulk');
  });

  it('drops invalid persisted payloads during restore', async () => {
    const fake = createFakeTimers();
    const storage = createFakeStorage({ 'queue:test': '{not-json' });

    const queue = createDeferredCommitQueue({
      persistenceKey: 'queue:test',
      storage,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    const restored = queue.restorePersisted();
    assert.deepEqual(restored, { restored: 0, discarded: 1 });
    assert.equal(storage.getItem('queue:test'), null);
  });

  it('retains pending entry on commit error when configured', async () => {
    const fake = createFakeTimers();
    const storage = createFakeStorage();
    const commits = [];

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      persistenceKey: 'queue:test',
      storage,
      commitFn: async (entry) => {
        commits.push(entry.label);
        throw new Error('offline');
      },
      retainOnCommitError: () => true,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });
    const timerId = [...fake.timers.keys()][0];
    fake.runTimer(timerId);
    await Promise.resolve();

    assert.deepEqual(commits, ['op1']);
    assert.equal(queue.pendingCount(), 1);
    assert.ok(storage.getItem('queue:test'));
  });

  it('drainNow stops on first error and leaves remaining entries pending', async () => {
    const fake = createFakeTimers();
    const commits = [];

    const queue = createDeferredCommitQueue({
      commitFn: async (entry) => {
        commits.push(entry.label);
        if (entry.label === 'op2') throw new Error('boom');
      },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });
    await queue.enqueue({ label: 'op2', payload: { id: 2 } });
    await queue.enqueue({ label: 'op3', payload: { id: 3 } });

    const summary = await queue.drainNow({ stopOnError: true });

    assert.deepEqual(commits, ['op1', 'op2']);
    assert.equal(summary.flushed, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.stoppedOnError, true);
    assert.equal(queue.pendingCount(), 1);
    assert.equal(queue.latest()?.label, 'op3');
  });

  it('drainNow with retained entries does not loop forever when stopOnError=false', async () => {
    const fake = createFakeTimers();
    let attempts = 0;

    const queue = createDeferredCommitQueue({
      commitFn: async () => {
        attempts += 1;
        throw new Error('offline');
      },
      retainOnCommitError: () => true,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });

    const summary = await queue.drainNow({ stopOnError: false });

    assert.equal(attempts, 1);
    assert.equal(summary.retained, 1);
    assert.equal(queue.pendingCount(), 1);
  });

  it('restorePersisted rejects unsupported persisted version', async () => {
    const fake = createFakeTimers();
    const storage = createFakeStorage({
      'queue:test': JSON.stringify({ version: 2, entries: [{ label: 'x', payload: { id: 1 } }] })
    });

    const queue = createDeferredCommitQueue({
      persistenceKey: 'queue:test',
      storage,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    const restored = queue.restorePersisted();
    assert.deepEqual(restored, { restored: 0, discarded: 1 });
    assert.equal(storage.getItem('queue:test'), null);
  });

  it('persist ignores storage write errors', async () => {
    const fake = createFakeTimers();
    const storage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('blocked');
      }
    };

    const queue = createDeferredCommitQueue({
      persistenceKey: 'queue:test',
      storage,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await assert.doesNotReject(queue.enqueue({ label: 'op1', payload: { id: 1 } }));
    assert.equal(queue.pendingCount(), 1);
  });

  it('restorePersisted ignores storage read errors', async () => {
    const fake = createFakeTimers();
    const storage = {
      getItem() {
        throw new Error('security');
      },
      setItem() {},
      removeItem() {}
    };

    const queue = createDeferredCommitQueue({
      persistenceKey: 'queue:test',
      storage,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    const restored = queue.restorePersisted();
    assert.deepEqual(restored, { restored: 0, discarded: 0 });
  });

  it('defers timer commit while canAttemptCommit returns false', async () => {
    const fake = createFakeTimers();
    const commits = [];
    let allowCommit = false;

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      canAttemptCommit: () => allowCommit,
      commitFn: async (entry) => {
        commits.push(entry.label);
      },
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({ label: 'op1', payload: { id: 1 } });

    const firstTimer = [...fake.timers.keys()][0];
    fake.runTimer(firstTimer);
    await Promise.resolve();

    assert.deepEqual(commits, []);
    assert.equal(queue.pendingCount(), 1);

    allowCommit = true;
    const secondTimer = [...fake.timers.keys()].find(id => id !== firstTimer);
    fake.runTimer(secondTimer);
    await Promise.resolve();

    assert.deepEqual(commits, ['op1']);
    assert.equal(queue.pendingCount(), 0);
  });

  it('drops retained entry after maxRetainCount is exceeded', async () => {
    const fake = createFakeTimers();
    let errorCalls = 0;

    const queue = createDeferredCommitQueue({
      delayMs: 8000,
      maxRetainCount: 1,
      commitFn: async () => {
        throw new Error('offline');
      },
      retainOnCommitError: () => true,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn
    });

    await queue.enqueue({
      label: 'op1',
      payload: { id: 1 },
      onCommitError: () => {
        errorCalls += 1;
      }
    });

    const firstTimer = [...fake.timers.keys()][0];
    fake.runTimer(firstTimer);
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 1);

    const secondTimer = [...fake.timers.keys()].find(id => id !== firstTimer);
    fake.runTimer(secondTimer);
    await Promise.resolve();

    assert.equal(queue.pendingCount(), 0);
    assert.equal(errorCalls, 1);
  });
});
