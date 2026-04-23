# Story 5.3 : Génération de la liste des périls

## Metadata
- story_id: 5.3
- epic: 5 — Itinéraire & Vaisseaux
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Permettre au MJ de générer, consulter et éditer une liste de périls par segment d’itinéraire sans résolution automatique, avec stockage dédié et ajout manuel.

## Tasks
- [x] T1: Schéma `route_perils` (migration + runtime backfill)
- [x] T2: Service backend de génération pondérée et CRUD des périls de route
- [x] T3: Endpoints `/api/travel-routes/:id/perils*`
- [x] T4: Tests d’intégration `route-perils` + update schéma
- [x] T5: UI itinéraire pour générer/lister/éditer/supprimer/ajouter un péril manuel
- [x] T6: Régression ciblée

## Dev Agent Record

### File List
- `scripts/migrate.js`
- `src/database.js`
- `src/services/route-perils.js`
- `src/routes/travel-routes.js`
- `tests/integration/route-perils.test.js`
- `tests/unit/schema.test.js`
- `public/itineraire.html`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log
- Added schema migration v4 creating `route_perils` (`id`, `route_id`, `peril_id`, `segment_index`, `custom_text`, `is_manual`) and runtime table/index provisioning.
- Added `src/services/route-perils.js`:
  - peril pool flattening from seeded `peril_data`
  - non-deterministic weighted generation per route segment
  - route peril listing with normalized `type`, `difficulty`, `description`
  - manual peril add, inline text edit, delete
- Extended `src/routes/travel-routes.js` with:
  - `POST /:id/perils/generate`
  - `GET /:id/perils`
  - `POST /:id/perils`
  - `PATCH /:id/perils/:perilId`
  - `DELETE /:id/perils/:perilId`
- Added integration suite `tests/integration/route-perils.test.js` covering generate/list/edit/delete/manual add and role access.
- Extended `public/itineraire.html` with a dedicated perils panel:
  - generate button
  - list with segment/type/difficulty/description
  - MJ inline edit/delete
  - MJ manual peril add form

### Completion Notes
- Story 5.3 implemented and validated.
- Broad targeted regression (serial run): 54/54 passing.
- Note: parallel Node test workers may produce transient SQLite lock flakiness; serial mode removes this contention.
