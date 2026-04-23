# Story 4.3 : Gestion de visibilité en masse (bulk reveal)

## Metadata
- story_id: 4.3
- epic: 4 — Dashboard MJ & Visibilité avancée
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Add `POST /api/visibility/bulk` to reveal or hide multiple entities at once by category or quadrant filter, and add a bulk reveal UI to the dashboard.

## Acceptance Criteria
- **AC1:** `POST /api/visibility/bulk` with body `{ "entityType": "systems", "filter": { "quadrant_id": 3 }, "visible": true }` sets all systems in that quadrant visible in a single atomic DB transaction.
- **AC2:** The response is `{ "data": { "affected": N, "version": V } }` where N is the number of rows upserted and V is a monotonic version (Date.now()).
- **AC3:** MJ only — joueurs get 403. No table selected → 400.
- **AC4:** Cascade: revealing a quadrant filter sets visibility on the systems rows directly (existing `toggleVisibility` pattern, applied in bulk).
- **AC5:** Invalid entityType → 400. `visible` not boolean → 400. Empty filter is allowed and applies to all entities of the selected type.
- **AC6:** Dashboard has a bulk reveal section: dropdown to pick entityType + optional quadrant, confirm button with inline micro-confirmation (no blocking modal).
- **AC7:** On success, `renderSearchResults` is hidden and the dashboard stats reload.

## Supported Filter Fields
- `quadrant_id: number` — filter systems by quadrant
- No filter fields → bulk applies to ALL entities of the given type

## Tasks
- [x] T1: Add `POST /bulk` to `src/routes/visibility.js` + `bulkVisibility()` transaction in `src/services/visibility.js`
- [x] T2: Add bulk reveal UI section to `public/dashboard.html`
- [x] T3: Write integration tests in `tests/integration/bulk-visibility.test.js`

## Technical Notes

### Existing Code
- `src/routes/visibility.js`: exports Router, has `PATCH /:entityType/:entityId`. Add `POST /bulk` here.
- `src/services/visibility.js`: has `toggleVisibility` db.transaction. Add `bulkVisibility(entityType, filter, tableId, visible)` that resolves IDs then upserts in one transaction.
- `tests/setup.js`: `createTestApp()` and `httpRequest()` helpers. The visibility route is already mounted at `/api/visibility`.
- `server.js`: visibility route already mounted — no server change needed.
- DB tables: `visibility_rules(table_id, entity_type, entity_id TEXT, visible)`, `systems(id, quadrant)`.

### Data Flow
```
POST /api/visibility/bulk
  body: { entityType: 'systems', filter: { quadrant_id: 3 }, visible: true }
  ↓
  validate entityType, visible, filter
  ↓
  bulkVisibility(entityType, filter, tableId, visible)
    → resolve IDs: SELECT id FROM systems WHERE quadrant = filter.quadrant_id
    → INSERT OR REPLACE INTO visibility_rules FOR EACH id (one transaction)
    → return { affected: N, version: Date.now() }
  ↓
  success(res, { affected, version })
```

### Test Strategy (T3)
Integration tests against real DB via `createTestApp()`:
- T7.1: MJ bulk-reveals all systems in a quadrant → 200, affected=N, version is number
- T7.2: Joueur gets 403
- T7.3: No table header → 400
- T7.4: Invalid entityType → 400
- T7.5: visible not boolean → 400
- T7.6: Empty filter (no filter fields) → bulk applies to ALL entities of type

## Dev Agent Record

### File List
- `src/routes/visibility.js` — modified: add POST /bulk route
- `src/services/visibility.js` — modified: add bulkVisibility() transaction
- `public/dashboard.html` — modified: add bulk reveal UI section
- `tests/integration/bulk-visibility.test.js` — created: 6 integration tests

### Change Log
- Added `POST /api/visibility/bulk` in `src/routes/visibility.js` with MJ-only access control and input validation.
- Added `bulkVisibility()` transaction in `src/services/visibility.js` with optional `filter.quadrant_id` or `filter.quadrant` support.
- Added quadrants list to dashboard API response (`src/routes/dashboard.js`) for bulk UI filtering.
- Added bulk reveal UI and inline micro-confirmation in `public/dashboard.html`.
- Added integration coverage in `tests/integration/bulk-visibility.test.js` (6 tests).
- Added SQLite busy timeout in `src/database.js` to stabilize parallel integration test runs.

### Completion Notes
- All Story 4.3 acceptance criteria implemented and validated.
- Test results: `82/82` passing on full regression suite.
