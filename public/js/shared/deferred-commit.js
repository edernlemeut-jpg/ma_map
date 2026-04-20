/**
 * Deferred commit queue with undo window.
 *
 * - enqueue(): apply optimistic UI now, commit later (after delay)
 * - undoLatest(): cancel latest pending action
 * - flushAll(): commit everything immediately (e.g. before navigation)
 */
export function createDeferredCommitQueue(options = {}) {
  const {
    delayMs = 8000,
    maxPending = 3,
    commitFn = async () => {},
    onStateChange = () => {},
    persistenceKey = '',
    storage = typeof localStorage === 'undefined'
      ? null
      : {
          getItem: key => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
          removeItem: key => localStorage.removeItem(key)
        },
    serializeEntry = (entry) => ({
      label: entry.label,
      payload: entry.payload,
      createdAt: entry.createdAt,
      retainCount: entry.retainCount || 0
    }),
    hydrateEntry = (record) => ({
      label: record.label,
      payload: record.payload,
      createdAt: record.createdAt,
      retainCount: record.retainCount || 0
    }),
    retainOnCommitError = () => false,
    canAttemptCommit = () => true,
    maxRetainCount = 5,
    maxEntryAgeMs = 72 * 60 * 60 * 1000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    nowFn = () => Date.now()
  } = options;

  let nextId = 1;
  /** @type {Array<any>} */
  const pending = [];

  function safeStorage(method, ...args) {
    if (!storage || typeof storage[method] !== 'function') return null;
    try {
      return storage[method](...args);
    } catch {
      return null;
    }
  }

  function hasPersistence() {
    return !!(storage && persistenceKey);
  }

  function persist() {
    if (!hasPersistence()) return;

    if (pending.length === 0) {
      safeStorage('removeItem', persistenceKey);
      return;
    }

    const entries = pending
      .map(entry => {
        try {
          return serializeEntry(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (entries.length === 0) {
      safeStorage('removeItem', persistenceKey);
      return;
    }

    safeStorage('setItem', persistenceKey, JSON.stringify({ version: 1, entries }));
  }

  function snapshot() {
    const latestEntry = pending.length > 0 ? pending[pending.length - 1] : null;
    return {
      pendingCount: pending.length,
      latest: latestEntry,
      collapsedCount: Math.max(0, pending.length - 1)
    };
  }

  function notify() {
    try {
      onStateChange(snapshot());
    } catch {
      // UI callback must never break queue behavior.
    }

    persist();
  }

  function createRuntimeEntry(entry, { preserveId = false } = {}) {
    return {
      id: preserveId && entry.id ? entry.id : nextId++,
      createdAt: entry.createdAt ?? nowFn(),
      label: entry.label || 'Action en attente',
      payload: entry.payload,
      onOptimisticApply: entry.onOptimisticApply,
      onOptimisticRollback: entry.onOptimisticRollback,
      onCommitted: entry.onCommitted,
      onCommitError: entry.onCommitError,
      retainCount: Number(entry.retainCount || 0),
      _committed: false,
      timerId: null
    };
  }

  function scheduleEntry(entry, customDelayMs = delayMs) {
    entry.timerId = setTimeoutFn(() => {
      void commitById(entry.id, { reason: 'timer' });
    }, customDelayMs);
  }

  function insertPendingEntry(entry, { customDelayMs = delayMs, notifyState = true } = {}) {
    pending.push(entry);
    scheduleEntry(entry, customDelayMs);
    if (notifyState) notify();
  }

  function requeueEntry(entry, { customDelayMs = delayMs, toFront = false } = {}) {
    entry._committed = false;
    entry.timerId = null;
    if (toFront) {
      pending.unshift(entry);
      scheduleEntry(entry, customDelayMs);
      notify();
      return;
    }
    insertPendingEntry(entry, { customDelayMs, notifyState: true });
  }

  async function attemptCommit(entry, commitOptions = {}) {
    if (!entry || entry._committed) {
      return { ok: true, retained: false };
    }

    entry._committed = true;

    try {
      await commitFn(entry, commitOptions);
      try {
        entry.onCommitted?.();
      } catch {
        // Ignore callback errors.
      }
      return { ok: true, retained: false };
    } catch (err) {
      if (retainOnCommitError(entry, err, commitOptions)) {
        const nextRetainCount = Number(entry.retainCount || 0) + 1;
        const tooManyRetries = maxRetainCount > 0 && nextRetainCount > maxRetainCount;
        const tooOld = maxEntryAgeMs > 0 && (nowFn() - Number(entry.createdAt || 0) > maxEntryAgeMs);
        if (tooManyRetries || tooOld) {
          try {
            entry.onCommitError?.(err);
          } catch {
            // Ignore callback errors.
          }
          return { ok: false, retained: false, error: err };
        }

        entry.retainCount = nextRetainCount;
        requeueEntry(entry, {
          customDelayMs: commitOptions.retryDelayMs || delayMs,
          toFront: commitOptions.retainAtFront !== false
        });
        return { ok: false, retained: true, error: err };
      }

      try {
        entry.onCommitError?.(err);
      } catch {
        // Ignore callback errors.
      }

      return { ok: false, retained: false, error: err };
    }
  }

  async function commitById(id, commitOptions = {}) {
    const idx = pending.findIndex(x => x.id === id);
    if (idx === -1) return false;

    const candidate = pending[idx];
    if (!canAttemptCommit(candidate, commitOptions)) {
      clearTimeoutFn(candidate.timerId);
      scheduleEntry(candidate, commitOptions.retryDelayMs || delayMs);
      return true;
    }

    const [entry] = pending.splice(idx, 1);
    clearTimeoutFn(entry.timerId);
    notify();

    await attemptCommit(entry, commitOptions);
    return true;
  }

  async function enqueue(entry) {
    const item = createRuntimeEntry(entry);

    try {
      item.onOptimisticApply?.();
    } catch {
      // Ignore optimistic callback errors.
    }

    // Keep at most maxPending pending operations.
    if (pending.length >= maxPending) {
      const oldest = pending.shift();
      clearTimeoutFn(oldest.timerId);
      notify();
      await attemptCommit(oldest, { reason: 'overflow' });
    }

    insertPendingEntry(item);

    return item.id;
  }

  function undoLatest() {
    if (pending.length === 0) return false;

    const item = pending.pop();
    clearTimeoutFn(item.timerId);

    try {
      item.onOptimisticRollback?.();
    } catch {
      // Ignore rollback callback errors.
    }

    notify();
    return true;
  }

  async function flushAll(commitOptions = {}) {
    const summary = await drainNow({ ...commitOptions, stopOnError: false, stopOnRetained: true });
    return summary.flushed;
  }

  function getPersistedSnapshot() {
    return pending
      .map(entry => {
        try {
          return serializeEntry(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function restorePersisted() {
    if (!hasPersistence()) {
      return { restored: 0, discarded: 0 };
    }

    const raw = safeStorage('getItem', persistenceKey);
    if (!raw) return { restored: 0, discarded: 0 };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      safeStorage('removeItem', persistenceKey);
      return { restored: 0, discarded: 1 };
    }

    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && parsed.version !== undefined && parsed.version !== 1) {
      safeStorage('removeItem', persistenceKey);
      return { restored: 0, discarded: 1 };
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : null;
    if (!records) {
      safeStorage('removeItem', persistenceKey);
      return { restored: 0, discarded: 1 };
    }

    let restored = 0;
    let discarded = 0;
    for (const record of records) {
      let hydrated;
      try {
        hydrated = hydrateEntry(record);
      } catch {
        hydrated = null;
      }
      if (!hydrated || hydrated.payload === undefined) {
        discarded += 1;
        continue;
      }

      const item = createRuntimeEntry(hydrated);
      insertPendingEntry(item, { notifyState: false });
      restored += 1;
    }

    if (restored === 0) {
      safeStorage('removeItem', persistenceKey);
    }

    notify();
    return { restored, discarded };
  }

  async function drainNow(commitOptions = {}) {
    const summary = {
      flushed: 0,
      failed: 0,
      retained: 0,
      stoppedOnError: false,
      error: null
    };

    while (pending.length > 0) {
      const [item] = pending.splice(0, 1);
      clearTimeoutFn(item.timerId);
      notify();

      const result = await attemptCommit(item, commitOptions);
      if (result.ok) {
        summary.flushed += 1;
        continue;
      }

      if (result.retained) {
        summary.retained += 1;
        if (commitOptions.stopOnRetained !== false) {
          break;
        }
        continue;
      }

      summary.failed += 1;
      summary.error = result.error || null;
      if (commitOptions.stopOnError) {
        summary.stoppedOnError = true;
        break;
      }
    }

    return summary;
  }

  function pendingCount() {
    return pending.length;
  }

  function collapsedCount() {
    return Math.max(0, pending.length - 1);
  }

  function latest() {
    return pending.length > 0 ? pending[pending.length - 1] : null;
  }

  return {
    enqueue,
    undoLatest,
    flushAll,
    drainNow,
    restorePersisted,
    getPersistedSnapshot,
    pendingCount,
    collapsedCount,
    latest
  };
}
