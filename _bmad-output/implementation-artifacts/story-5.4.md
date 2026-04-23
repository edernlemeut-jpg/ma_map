# Story 5.4 : Partage des données d'itinéraire avec les joueurs

## Metadata
- story_id: 5.4
- epic: 5 — Itinéraire & Vaisseaux
- status: done
- created: 2026-04-21
- author: dev-agent

## Goal
Exposer aux joueurs un journal de bord synchronisé (route active, vaisseaux visibles, périls révélés), filtré par visibilité, avec support du mode preview MJ sur la page itinéraire.

## Tasks
- [x] T1: Étendre le visibility service pour `route_perils` (granularité bloc par route)
- [x] T2: Enrichir `/api/sync` avec `itinerary: { active_route, ships, perils }`
- [x] T3: Appliquer le filtrage visibilité individuel (`travel_routes`, `ships`, `route_perils`) dans les payloads et la lecture périls
- [x] T4: Ajouter tests d’intégration sync pour section itinerary + masquage périls
- [x] T5: Ajouter poller auto-refresh sur `public/itineraire.html`
- [x] T6: Ajouter vue joueur narrative “journal de bord” + cas “Aucun itinéraire en cours”
- [x] T7: Ajouter mode preview MJ sur la page itinéraire (cadre coloré visible)
- [x] T8: Ajouter contrôles MJ révéler/masquer les périls d’une route
- [x] T9: Régression ciblée

## Dev Agent Record

### File List
- `src/services/visibility.js`
- `src/routes/visibility.js`
- `src/services/route-perils.js`
- `src/services/sync.js`
- `src/routes/travel-routes.js`
- `tests/integration/sync.test.js`
- `public/itineraire.html`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log
- Added `route_perils` visibility type and default policy in visibility service.
- Allowed visibility toggles for `route_perils` via `/api/visibility/:entityType/:entityId`.
- Updated route perils listing to enforce role-based visibility filtering (`route_perils` as block visibility keyed by route id).
- Extended sync payload with bounded itinerary section:
  - `itinerary.active_route` (active route only)
  - `itinerary.ships` (visible ships)
  - `itinerary.perils` (visible perils for active route)
- Added sync integration tests validating:
  - itinerary section presence and structure
  - perils hidden when `route_perils` visibility is false
- Extended itinerary page with:
  - player journal narrative timeline of waypoints and perils (icons + text)
  - auto updates via poller-based sync refresh
  - no-active-route state “Aucun itinéraire en cours”
  - MJ preview mode toggle with colored frame + exit action
  - MJ controls to reveal/hide perils block for selected route

### Completion Notes
- Story 5.4 implemented and validated.
- Serial targeted regression result: 56/56 passing.
- Epic 5 is now complete.
