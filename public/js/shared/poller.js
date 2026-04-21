/**
 * Poller factory — periodic fetch for sync data with visibility-based throttling.
 *
 * Usage:
 *   import { createPoller } from '/js/shared/poller.js';
 *
 *   const poller = createPoller({
 *     onData: (data) => updateUI(data),
 *     onError: (err) => showConnectionLost(),
 *     onReconnect: () => showConnectionRestored()
 *   });
 *   poller.start();
 */

// Dynamic import with fallback — defaults work in browser, tests inject via options
let _fetchWithTable = null;
let _getActiveTableId = null;

try {
  const mod = await import('/js/shared/table-selector.js');
  _fetchWithTable = mod.fetchWithTable;
  _getActiveTableId = mod.getActiveTableId;
} catch {
  // Node.js test environment — must inject fetchFn & getTableIdFn via options
}

export function createPoller(options = {}) {
  const {
    url = '/api/sync',
    intervalMs = 3000,
    backgroundIntervalMs = 15000,
    onData = () => {},
    onPollStart = () => {},
    onError = () => {},
    onReconnect = () => {},
    enableErrorBackoff = false,
    retryBaseMs = 1000,
    retryMaxMs = 30000,
    fetchFn = _fetchWithTable,
    getTableIdFn = _getActiveTableId
  } = options;

  let timerId = null;
  let running = false;
  let hadError = false;
  let consecutiveErrors = 0;
  let activeIntervalMs = intervalMs;
  let activeBackgroundIntervalMs = backgroundIntervalMs;

  function currentInterval() {
    return document.hidden ? activeBackgroundIntervalMs : activeIntervalMs;
  }

  async function poll() {
    try {
      try {
        onPollStart();
      } catch {
        // UI callback errors must not break polling.
      }
      const res = await fetchFn(url);
      if (!res || res.ok === false) {
        throw new Error(`Polling HTTP ${res?.status ?? 'unknown'}`);
      }
      const json = await res.json();
      if (hadError) {
        hadError = false;
        consecutiveErrors = 0;
        try {
          onReconnect();
        } catch {
          // Ignore callback errors to keep poller alive.
        }
      }
      try {
        onData(json.data);
      } catch {
        // Ignore callback errors to keep poll loop alive.
      }
    } catch (err) {
      hadError = true;
      consecutiveErrors += 1;
      try {
        onError(err);
      } catch {
        // Ignore callback errors to keep poll loop alive.
      }
    }
  }

  function scheduleNext() {
    const retryDelay = enableErrorBackoff && hadError
      ? Math.min(retryBaseMs * (2 ** Math.max(0, consecutiveErrors - 1)), retryMaxMs)
      : null;
    const delayMs = retryDelay ?? currentInterval();

    timerId = setTimeout(async () => {
      await poll();
      if (running) {
        scheduleNext();
      }
    }, delayMs);
  }

  function onVisibilityChange() {
    if (!running) return;
    clearTimeout(timerId);
    if (!document.hidden) {
      // Returning to foreground: immediate fetch + resume at foreground interval
      poll().then(() => {
        if (running) scheduleNext();
      }).catch(() => {
        if (running) scheduleNext();
      });
    } else {
      // Going to background: just reschedule at background interval
      scheduleNext();
    }
  }

  function start() {
    if (running) return;
    if (typeof fetchFn !== 'function' || typeof getTableIdFn !== 'function') return;
    const tableId = getTableIdFn();
    if (!tableId) return;

    running = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Immediate first fetch, then schedule
    poll().then(() => {
      if (running) scheduleNext();
    }).catch(() => {
      if (running) scheduleNext();
    });
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(timerId);
    timerId = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function isRunning() {
    return running;
  }

  function setIntervals({ intervalMs: nextIntervalMs, backgroundIntervalMs: nextBackgroundMs, immediate = false } = {}) {
    if (typeof nextIntervalMs === 'number' && nextIntervalMs > 0) {
      activeIntervalMs = nextIntervalMs;
    }
    if (typeof nextBackgroundMs === 'number' && nextBackgroundMs > 0) {
      activeBackgroundIntervalMs = nextBackgroundMs;
    }

    if (!running) return;

    clearTimeout(timerId);
    if (immediate && !document.hidden) {
      poll().then(() => {
        if (running) scheduleNext();
      }).catch(() => {
        if (running) scheduleNext();
      });
    } else {
      scheduleNext();
    }
  }

  return { start, stop, isRunning, setIntervals };
}
