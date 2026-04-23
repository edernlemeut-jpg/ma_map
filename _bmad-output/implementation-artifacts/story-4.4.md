# Story 4.4 : Undo reveal (délai de grâce) — deferred commit

## Metadata
- story_id: 4.4
- epic: 4 — Dashboard MJ & Visibilité avancée
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Ajouter un mécanisme de deferred commit côté client pour les actions de visibilité (bulk sur dashboard) avec fenêtre d’annulation de 8 secondes.

## Acceptance Criteria
- **AC1:** Une action de visibilité crée un toast d’annulation pendant 8s; aucune requête serveur n’est envoyée avant expiration.
- **AC2:** Si l’utilisateur clique Annuler dans la fenêtre, la requête n’est jamais envoyée.
- **AC3:** Si le délai expire, la requête est envoyée automatiquement.
- **AC4:** Toast fixe bas d’écran, contrasté, hauteur minimale >= 48px.
- **AC5:** Si plusieurs actions successives, la dernière est visible et les précédentes sont réduites en compteur (ex: `2 autres actions annulables`).
- **AC6:** Maximum 3 opérations en attente simultanément.
- **AC7:** Navigation hors page déclenche l’envoi immédiat des opérations en attente (pas de perte).
- **AC8:** Échec serveur après commit: rollback visuel + message d’erreur.

## Tasks
- [x] T1: Ajouter module `public/js/shared/deferred-commit.js` (queue deferred + undo + flush)
- [x] T2: Ajouter tests unitaires `tests/unit/deferred-commit.test.js`
- [x] T3: Intégrer le toast deferred commit dans `public/dashboard.html` (bulk reveal)
- [x] T4: Exécuter régression complète

## Dev Agent Record

### File List
- `public/js/shared/deferred-commit.js` — created
- `tests/unit/deferred-commit.test.js` — created
- `public/dashboard.html` — modified
- `_bmad-output/implementation-artifacts/story-4.4.md` — created + updated

### Change Log
- Created `public/js/shared/deferred-commit.js` with queue semantics: delay 8s, undo latest, max 3 pending, flush all.
- Added `tests/unit/deferred-commit.test.js` (5 tests) for defer/undo/timeout/maxPending/flush behavior.
- Integrated deferred commit UX into `public/dashboard.html`:
	- bottom fixed high-contrast toast
	- inline undo button
	- collapsed counter for older pending operations
	- `beforeunload` flush with keepalive
	- bulk requests now deferred, not sent immediately

### Completion Notes
- Deferred commit behavior implemented for dashboard bulk visibility actions.
- Server calls are delayed 8s unless undone; pending queue is capped to 3 and flushed on navigation.
- Full test suite result: 87/87 passing.
