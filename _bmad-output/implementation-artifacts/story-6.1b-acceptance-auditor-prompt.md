# Story 6.1b Acceptance Auditor Review Prompt

Role: Acceptance auditor

Repository access: required

Required reading before review:
- `_bmad-output/implementation-artifacts/story-6.1b.md`
- `_bmad-output/implementation-artifacts/epic-6-context.md`
- `_bmad-output/project-context.md`

Changed files to inspect:
- `public/js/shared/deferred-commit.js`
- `public/dashboard.html`
- `public/itineraire.html`
- `tests/unit/deferred-commit.test.js`

Audit goals:
- Check compliance with Story 6.1b acceptance criteria and boundaries.
- Flag deviations from spec or context rules.
- Flag missing validation coverage for behavior promised by the story.
- Ignore unrelated pre-existing repo issues.

Acceptance targets:
- Pending supported MJ deferred actions survive reload.
- Restored entries remain pending and eligible for replay.
- Reconnect replays persisted entries in original order.
- UI resyncs from server after replay.
- Invalid persisted entries are purged with explicit feedback.
- Replay failure removes the bad entry, surfaces explicit feedback, and returns UI to server truth.
- Unsupported offline MJ writes remain blocked by 6.1a read-only behavior.
- Scope remains limited to already-deferred dashboard and itinerary actions.

Deliverable:
- List findings only.
- For each finding include: severity, impacted file(s), violated acceptance criterion or boundary, and concrete evidence.
- If no finding, say `No findings`.