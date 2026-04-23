# Story 5.1 : Gestion des vaisseaux de la table

## Metadata
- story_id: 5.1
- epic: 5 — Itinéraire & Vaisseaux
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Ajouter une API CRUD moderne pour les vaisseaux liés à une table et une page itinéraire servie depuis `public/` avec une section vaisseaux utilisable par MJ et joueurs.

## Tasks
- [x] T1: Service backend `ships` (CRUD + soft delete + prefill model)
- [x] T2: Route `src/routes/ships.js` + montage serveur/tests
- [x] T3: Tests d'intégration API `ships`
- [x] T4: Nouvelle page `public/itineraire.html` avec section vaisseaux
- [x] T5: Régression ciblée

## Dev Agent Record

### File List
- `src/services/ships.js`
- `src/routes/ships.js`
- `server.js`
- `tests/setup.js`
- `tests/integration/ships.test.js`
- `public/itineraire.html`

### Change Log
- Added `src/services/ships.js` with list/get/create/update/soft-delete logic, table scoping, visibility filtering, and model-based prefill.
- Added `src/routes/ships.js` with CRUD endpoints under `/api/ships`.
- Mounted ships routes in `server.js` and `tests/setup.js`.
- Added integration coverage in `tests/integration/ships.test.js` for CRUD, soft delete, visibility, and alphabetical player sorting.
- Added a modern `public/itineraire.html` page served by Express with:
	- active table handling
	- MJ ship form
	- player read-only list
	- deferred visibility toggle undo toast

### Completion Notes
- Story 5.1 implemented and validated.
- Targeted regression result: 44/44 passing.