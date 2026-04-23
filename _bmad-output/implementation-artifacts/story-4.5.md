# Story 4.5 : Mode session active

## Metadata
- story_id: 4.5
- epic: 4 — Dashboard MJ & Visibilité avancée
- status: done
- created: 2026-04-20
- author: dev-agent

## Goal
Permettre au MJ d’activer/désactiver un mode session persisté serveur, exposé via sync aux joueurs, avec adaptation immédiate du polling côté client et auto-timeout après inactivité MJ.

## Acceptance Criteria Coverage
- **AC1:** Toggle MJ sur dashboard persiste un flag serveur (`session_active`) ✅
- **AC2:** `GET /api/sync` inclut `sessionActive` ✅
- **AC3:** Polling joueur agressif si actif (4s), réduit si inactif (30s) ✅
- **AC4:** Ajustement d’intervalle immédiat à la détection du changement de flag ✅
- **AC5:** MJ peut désactiver manuellement à tout moment ✅
- **AC6:** Auto-désactivation après 30 min sans activité MJ ✅
- **AC7:** Fermer l’onglet MJ coupe le heartbeat (plus de requêtes), timeout appliqué côté serveur lors des sync suivants ✅

## Tasks
- [x] T1: Backend session state (service + route toggle)
- [x] T2: Sync payload enrichi avec `sessionActive`
- [x] T3: Heartbeat MJ + auto-timeout serveur
- [x] T4: UI dashboard pour toggle session
- [x] T5: UI joueur carte pour indicateur session + poller dynamique
- [x] T6: Tests integration/unit + régression

## Dev Agent Record

### File List
- `src/services/session.js` — created
- `src/middleware/table-context.js` — modified
- `src/services/sync.js` — modified
- `src/routes/dashboard.js` — modified
- `src/database.js` — modified
- `public/js/shared/poller.js` — modified
- `public/dashboard.html` — modified
- `public/carte_interactive.html` — modified
- `tests/integration/sync.test.js` — modified
- `tests/integration/dashboard.test.js` — modified
- `tests/unit/poller.test.js` — modified

### Change Log
- Ajout du service `session.js` pour lecture/écriture du mode session + timeout auto 30 min.
- Heartbeat MJ branché dans le middleware de contexte de table.
- Endpoint `PATCH /api/dashboard/session-active` ajouté (MJ only).
- Dashboard GET retourne aussi `session_active`.
- Sync payload inclut `sessionActive`.
- Poller supporte `setIntervals()` pour changement live d’intervalle.
- Carte interactive adapte immédiatement le polling et affiche un badge session active/inactive.
- Ajout d’un fallback runtime dans `database.js` pour créer les colonnes session si DB legacy.

### Completion Notes
- Tous les tests impactés sont passés.
- Régression ciblée finale: 97/97 pass.
