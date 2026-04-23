# Story 5.2b : Visualisation des routes sur la carte

## Metadata
- story_id: 5.2b
- epic: 5 — Itinéraire & Vaisseaux
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Afficher l’itinéraire actif de la table sur la carte interactive via un overlay SVG numéroté, synchronisé par polling et conditionné par la visibilité côté joueur.

## Tasks
- [x] T1: Étendre le service de visibilité pour `travel_routes`
- [x] T2: Étendre le payload `/api/sync` avec `entities.travel_routes.active`
- [x] T3: Ajouter les tests d’intégration sync pour route active visible/masquée
- [x] T4: Ajouter l’overlay SVG sur `public/carte_interactive.html`
- [x] T5: Rendu polyline + points numérotés + event `route:updated`
- [x] T6: Régression ciblée

## Dev Agent Record

### File List
- `src/services/visibility.js`
- `src/services/sync.js`
- `src/routes/visibility.js`
- `tests/integration/sync.test.js`
- `public/carte_interactive.html`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log
- Added `travel_routes` support in visibility defaults and source table mapping.
- Added `travel_routes` to valid entity types in visibility route toggles.
- Extended sync payload with `entities.travel_routes.active` containing active route id/name and ordered `waypoint_ids`.
- Added sync integration tests ensuring:
  - MJ and player receive active route when visible,
  - player route payload is `null` when route visibility is hidden.
- Added SVG overlay layer in `public/carte_interactive.html`:
  - `<g class="route-overlay">` injected in a dedicated SVG above canvas,
  - polyline drawn in waypoint order,
  - numbered intermediate waypoint markers,
  - route refresh on sync updates and custom `route:updated` event.

### Completion Notes
- Story 5.2b implemented and validated.
- Targeted regression result: 39/39 passing.
