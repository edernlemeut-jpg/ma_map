# Story 5.2a : Route planning — CRUD & API

## Metadata
- story_id: 5.2a
- epic: 5 — Itinéraire & Vaisseaux
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Ajouter le CRUD moderne des itinéraires de voyage par table avec validation des systèmes, unicité de la route active et une UI MJ dans `public/itineraire.html` pour composer les waypoints par tap séquentiel.

## Tasks
- [x] T1: Schéma `travel_routes` + `route_waypoints` (migration + runtime backfill)
- [x] T2: Service backend `travel-routes` avec validation et route active unique
- [x] T3: Route `src/routes/travel-routes.js` + montage serveur/tests
- [x] T4: Tests d'intégration API `travel-routes` + mise à jour du test de schéma
- [x] T5: Section itinéraires dans `public/itineraire.html` avec CTA vide, ordre numéroté, tap séquentiel et suppression de waypoint avec undo différé
- [x] T6: Régression ciblée

## Dev Agent Record

### File List
- `scripts/migrate.js`
- `src/database.js`
- `src/services/travel-routes.js`
- `src/routes/travel-routes.js`
- `server.js`
- `tests/setup.js`
- `tests/integration/travel-routes.test.js`
- `tests/unit/schema.test.js`
- `public/itineraire.html`

### Change Log
- Added schema v3 with `travel_routes` and `route_waypoints`, plus runtime creation in `src/database.js` for legacy databases.
- Added `src/services/travel-routes.js` with list/get/create/update/delete logic, ordered waypoint persistence, system existence validation, and single active route enforcement per table.
- Added `src/routes/travel-routes.js` and mounted it in `server.js` and `tests/setup.js`.
- Added integration coverage in `tests/integration/travel-routes.test.js` for create, update, delete, active-route exclusivity, validation, and player read-only access.
- Updated `tests/unit/schema.test.js` to include the new tables.
- Extended `public/itineraire.html` with a new routes section featuring:
  - empty-state CTA
  - MJ route form
  - sequential tap system picker
  - numbered waypoint list
  - deferred undo for waypoint removal
  - route activation/deactivation and deletion

### Completion Notes
- Story 5.2a implemented and validated.
- Targeted regression result: 28/28 passing.
