# Story 6.1b Edge Case Hunter Review Prompt

Role: Edge case hunter

Repository access: required

Focus:
- Walk boundary conditions and branching paths introduced by Story 6.1b.
- Report only real unhandled edge cases in the changed behavior.
- Ignore style and broad refactor opinions.

Changed files to inspect:
- `public/js/shared/deferred-commit.js`
- `public/dashboard.html`
- `public/itineraire.html`
- `tests/unit/deferred-commit.test.js`
- `tests/unit/poller.test.js`
- `tests/integration/sync.test.js`

Story intent summary:
- Persist only already-supported MJ deferred actions.
- Restore pending deferred actions after reload.
- Replay them automatically on reconnect, in FIFO order.
- Stop replay on first failure, remove the bad entry, show explicit user feedback, and refresh from server truth.
- Do not expand to offline-first, unsupported writes, backend idempotence changes, or multi-tab coordination.

Edge cases to check aggressively:
- Corrupted or partial persisted queue payloads.
- Reload with pending queue while still offline.
- Reconnect with multiple queued entries where one replay fails mid-stream.
- Queue overflow behavior with persisted entries.
- Table switching and per-table queue isolation.
- Preview/player mode interactions on itinerary.
- Duplicate UI refreshes or replay side effects triggered both by commit callbacks and reconnect handlers.

Deliverable:
- List findings only.
- For each finding include: severity, impacted file(s), trigger path, and missing handling.
- If no finding, say `No findings`.