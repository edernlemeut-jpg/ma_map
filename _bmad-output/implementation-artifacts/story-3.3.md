---
story_id: 3-3-polling-actif
story_title: Polling actif, reveal animation & indicateur de connexion
epic: epic-3
created: 2026-04-20T00:55:00
status: done
---

# Story 3.3: Polling actif, reveal animation & indicateur de connexion

## Context

**Epic:** Epic 3 — Carte interactive & Révélation en session
**Story Points:** 13 (High complexity: Polling integration + DOM diffing + animations)
**Related Stories:** 1.6 (polling infrastructure), 3.1 (map rendering), 3.2 (system details)

## Acceptance Criteria

### AC1: Reveal Animation

**Given** MJ révèle un système (via visibilité toggle)
**When** le prochain polling du joueur fetch les deltas
**Then**
- Système apparaît sur la carte avec glow animation (luminous halo, pulsing 2-3x, 800-1200ms)
- Si `prefers-reduced-motion: reduce` → pas d'animation, apparition immédiate (vibration kept)
- Vibration haptique courte via `navigator.vibrate([50])`
- Animation décalée de 200ms entre systèmes si multiples reveals en même temps

### AC2: Hiding & Removal

**Given** MJ cache un système précédemment visible
**When** delta sync le signale dans `"hidden"` array
**Then** SVG node est supprimé immédiatement (chirurgical via Map lookup)

### AC3: Connection Indicator

**Given** polling est actif
**When** joueur regarde la carte
**Then** header montre indicator: 
- 🟢 connecté (last poll successful < 5s)
- 🔄 syncing (poll in progress)
- 🔴 offline (2+ consecutive failures OR last poll > 15s)

### AC4: Sync Endpoint Enrichment

**Given** `GET /api/sync` endpoint exists (Epic 1.6)
**When** joueur polls
**Then** response includes system deltas:
```json
{
  "version": 47,
  "timestamp": "2026-04-20T00:55:00Z",
  "entities": {
    "systems": {
      "revealed": [{ "id": 12, "nom": "...", "quadrant": "A1", ... }],
      "hidden": [12],
      "updated": [{ "id": 8, "nom": "NewName" }]
    }
  }
}
```
- `revealed`: full system objects (new visible systems)
- `hidden`: array of system IDs (no longer visible)
- `updated`: modified systems that stay visible

### AC5: Version Jump Handling

**Given** polling skips versions (e.g., 40 → 45, msgs lost)
**When** delta version jump > 1 detected
**Then**
- Client does full refresh via `GET /api/compendium/systems`
- On full refresh failure → retry with backoff (1s, 2s, 4s, max 30s)
- Display connection indicator 🔴 during retry
- On success, continue normal polling from new version

### AC6: Surgical DOM Updates

**Given** Map is rendered
**When** polled deltas arrive
**Then**
- No full re-render of SVG
- Use `Map<systemId, SVGElement>` for O(1) lookup
- Operations:
  - **Add:** Create new SVG node (circle {systemId}), append to group, apply glow
  - **Remove:** Remove node from Map and DOM
  - **Update:** Patch existing node's text/attributes only
- All DOM operations complete in <50ms for ≤30 systems

### AC7: Poller Integration

**Given** poller (Epic 1.6, `public/js/sync/poller.js`) is running
**When** poller calls `onUpdate(syncData)`
**Then** 
- Map listener is registered: `poller.on('update', (data) => { handleSyncDelta(data) })`
- Synchronous call to update map based on `data.entities.systems` deltas
- No race conditions between polling cycles

### AC8: Animation Timing (Multi-reveal)

**Given** MJ reveal multiple systems in same polling cycle
**When** delta contains 3+ systems in `revealed` array
**Then**
- System 1 animation starts immediately (t=0)
- System 2 animation starts at t=200ms
- System 3 animation starts at t=400ms
- Use `requestAnimationFrame` scheduling (not setTimeout)

### AC9: Reduced Motion Respect

**Given** browser has `prefers-reduced-motion: reduce`
**When** system is revealed
**Then**
- Glow animation skipped
- System appears immediately (no transition)
- Vibration still fires (`navigator.vibrate([50])`)
- `window.matchMedia('(prefers-reduced-motion: reduce)').matches` checked

### AC10: State Management

**Given** Polling is running and map is displayed
**When** various events occur
**Then** state is consistent:
- `lastPollTime`: timestamp of last successful poll
- `pollFailureCount`: reset to 0 on success, increment on failure
- `currentVersion`: updated after each successful poll
- `systemsMap`: Map<systemId, SVGElement> kept in sync with DOM

## Tasks

### T1: Extend /api/sync endpoint (20 min)

**File:** `src/poller-service.js` (Epic 1.6) or create `src/sync-service.js`

**Changes:**
- Modify `/api/sync` response to include system deltas:
  - `revealed`: systems newly visible to this joueur (query visibility table)
  - `hidden`: systems that were visible but no longer are
  - `updated`: systems already visible that changed
- Query visibility state changes since last version
- Return full system objects (not just IDs) for revealed systems
- Tests: 3 tests for endpoints (T1.1, T1.2, T1.3)

### T2: Map polling listener (15 min)

**File:** `public/carte_interactive.html` script tag

**Changes:**
- Add poller listener: `poller.on('update', (syncData) => handleSyncDelta(syncData))`
- Function `handleSyncDelta(syncData)`:
  - Extract `syncData.entities.systems` deltas
  - Call `map.applyDeltas(revealed, hidden, updated)`
  - Update connection indicator
- Track `lastPollTime`, `pollFailureCount`, `currentVersion` state
- Tests: 1 test for listener setup (T2.1)

### T3: Map delta engine (cave map-service.js) (25 min)

**File:** `public/js/map/galaxy-map.js`

**Changes:**
- Add method `applyDeltas(revealed, hidden, updated)`:
  - For each in `hidden`: `systemsMap.delete(id)`, remove DOM node
  - For each in `revealed`: create node, add to map, schedule animation
  - For each in `updated`: query existing node, update text/attrs
- Method `scheduleGlowAnimation(systemId, delay)`:
  - If `prefers-reduced-motion`: skip, just show system
  - Else: apply glow CSS + animation, fire haptic
  - Use `requestAnimationFrame` for timing
- Ensure all operations O(1)/O(n) for n systems
- Tests: 4 tests (T3.1-T3.4)

### T4: Connection indicator UI (10 min)

**File:** `public/carte_interactive.html` (header area)

**Changes:**
- Add `<span id="connection-indicator">` to header:
  ```html
  <span id="connection-indicator" class="ml-2 px-3 py-1 rounded text-sm" title="connection-status">
    🟢 Connecté
  </span>
  ```
- Function `updateConnectionIndicator(lastPollTime, failureCount, syncing)`:
  - If syncing: `🔄 Synchronisation`
  - If failureCount >= 2: `🔴 Hors ligne`
  - If (now - lastPollTime) > 15s: `🔴 Hors ligne`
  - Else: `🟢 Connecté`
- Update on every poll (success/failure)
- CSS: green/yellow/red styling with classes
- Tests: 2 tests (T4.1-T4.2)

### T5: Version jump & full refresh (15 min)

**File:** `public/js/map/map-service.js`

**Changes:**
- Function `handleVersionJump(currentVersion, newVersion)`:
  - If newVersion - currentVersion > 1:
    - Fetch full systems list via `GET /api/compendium/systems`
    - Replace map with fresh data
    - Retry logic: backoff [1000ms, 2000ms, 4000ms, max 30s]
    - Display retry indicator during process
    - On success, update `currentVersion = newVersion`
    - On final failure, show user-facing error toast
- Tests: 2 tests (T5.1-T5.2)

### T6: Glow animation CSS (5 min)

**File:** `public/style.css`

**Changes:**
- Define `@keyframes glow`:
  ```css
  @keyframes glow {
    0% { filter: drop-shadow(0 0 2px rgba(100,150,255, 0.5)) }
    50% { filter: drop-shadow(0 0 8px rgba(100,150,255, 1)) }
    100% { filter: drop-shadow(0 0 2px rgba(100,150,255, 0.5)) }
  }
  ```
- Class `.glow-reveal`:
  - `animation: glow 1000ms ease-in-out 2` (pulse 2x)
  - `animation-fill-mode: forwards`
- Media query:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .glow-reveal { animation: none !important }
  }
  ```

### T7: Integration tests (20 min)

**File:** `tests/integration/map-polling.test.js`

**Tests:**
- T7.1: Polling delivers revealed systems → animation queued
- T7.2: Polling delivers hidden systems → nodes removed
- T7.3: Version jump triggers full refresh
- T7.4: Connection indicator state transitions (🟢→🔄→🟢/🔴)
- T7.5: Reduced motion: no animation, instant appear
- T7.6: Multiple reveals staggered by 200ms
- Minimum 6 tests

## Technical Notes

### API Contract

**Endpoint:** `GET /api/sync` (extend existing)

**Response:**
```json
{
  "data": {
    "version": 47,
    "timestamp": "2026-04-20T00:55:00Z",
    "entities": {
      "systems": {
        "revealed": [
          {
            "id": 12,
            "nom": "NewReveal",
            "quadrant": "A3",
            "faction": "Empire",
            "gouvernement": "Militaire",
            "route": "Route +2",
            "is_frontiere": 0
          }
        ],
        "hidden": [15, 18],
        "updated": [
          { "id": 8, "nom": "UpdatedName", "gouvernement": "Democratic" }
        ]
      }
    }
  }
}
```

### Polling State Variables

```javascript
let lastPollTime = Date.now();
let pollFailureCount = 0;
let currentVersion = 0;
const systemsMap = new Map(); // systemId → SVGElement
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

### Error Handling

- Network error during poll: increment `pollFailureCount`, show 🔴 after 2
- Version jump detected: trigger full refresh with retry logic
- Full refresh failure: retry with exponential backoff, max 30s
- API returns 401/403: user logged out, redirect to login (handled by existing auth middleware)

### Performance Targets

- Poll latency: <500ms API + <50ms DOM updates
- Animation: GPU-accelerated (filter/transform, not position/width)
- Memory: systemsMap grows only with visible systems count

## Definition of Done

✅ All 7 tasks completed
✅ All acceptance criteria met
✅ ≥6 integration tests passing (T7)
✅ No console errors or warnings
✅ Styling matches existing theme (dark, Tailwind)
✅ Code review passed (3 parallel agents, 0 critical issues)

