# Story 4.6 : Preview joueur (vue « comme joueur »)

## Metadata
- story_id: 4.6
- epic: 4 — Dashboard MJ & Visibilité avancée
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Permettre au MJ de basculer sur une vue preview strictement équivalente à la vue joueur, avec endpoint dédié, signal visuel fort, et sortie rapide.

## Acceptance Criteria Coverage
- **AC1:** Endpoint dédié `GET /api/preview/sync` implémenté ✅
- **AC2:** Endpoint preview accessible MJ uniquement (403 sinon) ✅
- **AC3:** Cadre coloré permanent sur les 4 côtés en mode preview ✅
- **AC4:** Contrôles MJ désactivés et visuellement grisés en preview ✅
- **AC5:** Bouton flottant fixe « Quitter Preview » toujours visible ✅
- **AC6:** Double-tap en preview pour quitter ✅
- **AC7:** Version tracking MJ préservé (version preview séparée de la version MJ) ✅

## Tasks
- [x] T1: Ajouter route preview API dédiée
- [x] T2: Monter route preview dans serveur + setup tests
- [x] T3: Intégrer mode preview sur carte interactive
- [x] T4: Ajouter tests d’intégration preview
- [x] T5: Régression suites impactées

## Dev Agent Record

### File List
- `src/routes/preview.js` — created
- `server.js` — modified
- `tests/setup.js` — modified
- `tests/integration/preview-sync.test.js` — created
- `public/carte_interactive.html` — modified

### Change Log
- Création de `GET /api/preview/sync` qui renvoie le payload sync en mode joueur pour un MJ.
- Ajout du montage route `/api/preview` sur serveur principal et app de tests.
- Ajout du mode preview côté carte:
  - bouton activation preview
  - cadre fixe 4 côtés
  - bouton flottant de sortie
  - sortie double-tap
  - désactivation visuelle des contrôles MJ
  - version preview séparée (`previewVersion`) pour ne pas polluer la version MJ
- Ajout tests intégration endpoint preview.

### Completion Notes
- Régression élargie validée: 99/99 tests pass.
