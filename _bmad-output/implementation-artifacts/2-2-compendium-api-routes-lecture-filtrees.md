# Story 2.2 : Compendium API — routes de lecture filtrées

Status: done

## Story

As a developer,
I want API routes that serve universe data filtered by the visibility service,
So that the compendium frontend can display only what each user is allowed to see.

## Acceptance Criteria (BDD)

1. **Given** je suis joueur avec une table active **When** j'appelle `GET /api/systems` (ou `/api/factions`, `/api/ship-models`) **Then** seules les entités visibles sont retournées, format : `{ "data": [{ "id", "name", ... }] }` **And** aucune métadonnée ne trahit le nombre réel d'entités (pas de `total_count`, pas de `has_more`)
2. **Given** je suis MJ **When** j'appelle les mêmes routes **Then** toutes les entités sont retournées avec un champ supplémentaire `"visible": boolean` **And** le champ `visible` n'apparaît JAMAIS dans la réponse joueur
3. **And** les routes `src/routes/systems.js`, `src/routes/factions.js`, `src/routes/ship-models.js` appellent le visibility service avec le rôle issu de `req.table`
4. **And** pas de pagination (< 200 entités, payload complet acceptable)
5. **And** les réponses utilisent le helper API standardisé
6. **And** tests d'intégration : réponse joueur sans champ `visible`, réponse MJ avec champ `visible`, filtrage correct

Couvre : FR15 (partie API)

## Tasks / Subtasks

- [x] **Task 1 : Service compendium — logique métier** (AC: #1, #2, #3)
  - [x] 1.1 Créer `src/services/compendium.js` avec les fonctions :
    - `getSystems(tableId, role)` — retourne les systèmes filtrés par visibilité
    - `getFactions(tableId, role)` — retourne les factions filtrées
    - `getShipModels(tableId, role)` — retourne les modèles de vaisseaux filtrés
  - [x] 1.2 Pour chaque fonction :
    - SELECT toutes les entités (pas de `WHERE table_id` — données univers)
    - MJ : retourner toutes + ajouter `visible: isVisible(type, id, tableId, 'joueur')` — signifie "visible POUR un joueur"
    - Joueur : filtrer avec `isVisible(type, id, tableId, 'joueur')`, retourner seulement les visibles
    - JAMAIS de champ `visible` dans la réponse joueur
  - [x] 1.3 Colonnes à retourner (pas de `SELECT *` — SELECT explicite) :
    - `systems` : id, quadrant, nom, faction, is_frontiere, route, gouvernement, description
    - `factions` : id, name, short, description, icon, color
    - `ship_models` : id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json
  - [x] 1.4 Exclure les colonnes internes : `created_at`, `updated_at`, `soleil_json`, `corps_celestes_json`, `patrouilles_json` (systèmes) — réservées pour la fiche détail Story 3.2

- [x] **Task 2 : Routes GET /api/systems, /api/factions, /api/ship-models** (AC: #1, #2, #3, #5)
  - [x] 2.1 Créer `src/routes/systems.js` — `GET /` appelle `getSystems(req.table.id, req.table.role)`
  - [x] 2.2 Créer `src/routes/factions.js` — `GET /` appelle `getFactions(req.table.id, req.table.role)`
  - [x] 2.3 Créer `src/routes/ship-models.js` — `GET /` appelle `getShipModels(req.table.id, req.table.role)`
  - [x] 2.4 Chaque route : vérifier `req.table` présent (sinon `validationError`)
  - [x] 2.5 Retourner `success(res, entities)` — helper standardisé
  - [x] 2.6 Monter dans `server.js` :
    ```
    app.use('/api/systems', systemsRoutes);
    app.use('/api/factions', factionsRoutes);
    app.use('/api/ship-models', shipModelsRoutes);
    ```
  - [x] 2.7 Monter dans `tests/setup.js` : même chose dans `createTestApp()`

- [x] **Task 3 : Tests unitaires compendium service** (AC: #1, #2, #6)
  - [x] 3.1 Créer `tests/unit/compendium-service.test.js`
  - [x] 3.2 Tests filtrage joueur :
    - `getSystems()` retourne seulement les systèmes visibles
    - `getFactions()` retourne les factions visibles (toutes par défaut — `DEFAULT_VISIBLE.factions = 1`)
    - `getShipModels()` retourne seulement les ship_models visibles
    - Aucune entité retournée n'a de champ `visible`
  - [x] 3.3 Tests réponse MJ :
    - `getSystems()` retourne TOUS les systèmes avec champ `visible: boolean`
    - `getFactions()` retourne toutes les factions avec `visible: boolean`
    - `getShipModels()` retourne tous les ship_models avec `visible: boolean`
  - [x] 3.4 Tests cascade :
    - Systèmes dans un quadrant caché absents de la réponse joueur
    - Systèmes dans un quadrant caché présents avec `visible: false` pour MJ
  - [x] 3.5 Tests colonnes :
    - Vérifier que les colonnes retournées correspondent au contrat (pas de `created_at`, etc.)

- [x] **Task 4 : Tests intégration routes compendium** (AC: #1, #2, #4, #5, #6)
  - [x] 4.1 Créer `tests/integration/compendium.test.js`
  - [x] 4.2 Tests route systems :
    - GET /api/systems comme MJ → 200 + toutes les entités + champ `visible`
    - GET /api/systems comme joueur → 200 + seulement entités visibles + PAS de champ `visible`
    - GET /api/systems sans table → 400
    - GET /api/systems sans auth → 401
  - [x] 4.3 Tests route factions : mêmes patterns
  - [x] 4.4 Tests route ship-models : mêmes patterns
  - [x] 4.5 Test plausible deniability : réponse joueur n'a aucune métadonnée de comptage
  - [x] 4.6 Test non-régression : routes existantes (health, auth, tables, sync, visibility) toujours fonctionnelles

- [x] **Task 5 : Mise à jour package.json + vérification** (AC: tous)
  - [x] 5.1 Ajouter les chemins tests au script test dans `package.json`
  - [x] 5.2 Lancer `npm test` — tous les tests existants (111) + nouveaux doivent passer

### Review Findings

- [x] [Review][Defer] `armement_json`/`systemes_secondaires_json` retournés comme TEXT brut [src/services/compendium.js] — deferred, pre-existing (colonnes TEXT SQLite, double-encodage JSON; à traiter Story 3.2 fiche détail)
- [x] [Review][Defer] `is_frontiere` retourné comme integer 0/1 pas boolean [src/services/compendium.js] — deferred, cosmétique (à harmoniser Story 2.3 frontend si nécessaire)

## Dev Notes

### Modèle de données — CRITIQUE

**Les tables `systems`, `factions`, `ship_models` sont des données UNIVERS** — elles n'ont PAS de colonne `table_id`. Ce sont des données partagées entre toutes les tables de jeu. La visibilité est gérée par les tables `visibility_rules` et `table_visibility_overrides` qui, elles, sont scopées par `table_id`.

⚠️ **NE PAS** écrire `SELECT * FROM systems WHERE table_id = ?` — la colonne n'existe pas ! L'architecture.md contient un template erroné avec `WHERE table_id = ?` sur systems. C'est faux.

**Requêtes correctes :**
```javascript
// systems — TOUTES les lignes, filtrage par visibilité service
db.prepare('SELECT id, quadrant, nom, faction, is_frontiere, route, gouvernement, description FROM systems').all();

// factions — idem
db.prepare('SELECT id, name, short, description, icon, color FROM factions').all();

// ship_models — idem (id est TEXT, pas INTEGER)
db.prepare('SELECT id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json FROM ship_models').all();
```

### Stratégie de filtrage

**Approche unique** : `SELECT all` → filtre en mémoire via `isVisible()`. Simple, correct, et performant pour < 200 entités (N+1 accepté par design review 2.1). `getVisibleIds()` fait déjà la même chose internement — l'utiliser ajouterait un double scan inutile.

```javascript
export function getSystems(tableId, role) {
  const all = db.prepare('SELECT id, quadrant, nom, faction, is_frontiere, route, gouvernement, description FROM systems').all();

  if (role === 'mj') {
    // visible = ce qu'un JOUEUR verrait (pas le MJ — lui voit toujours tout)
    return all.map(s => ({ ...s, visible: isVisible('systems', s.id, tableId, 'joueur') }));
  }

  // Joueur : seulement les entités visibles, JAMAIS de champ visible
  return all.filter(s => isVisible('systems', s.id, tableId, 'joueur'));
}
```

### Champ `visible` pour le MJ — sémantique

Le champ `visible` dans la réponse MJ signifie **"visible pour les joueurs"**, pas "visible pour le MJ" (le MJ voit toujours tout). Il doit correspondre à ce que `isVisible(entityType, id, tableId, 'joueur')` retournerait.

```javascript
// Pour le MJ, calculer visible = ce qu'un joueur verrait
return all.map(s => ({
  ...s,
  visible: isVisible('systems', s.id, tableId, 'joueur')
}));
```

### Colonnes `_json` dans systems

Les colonnes `soleil_json`, `corps_celestes_json`, `patrouilles_json` sont exclues de la route liste (`GET /api/systems`). Elles seront exposées dans la fiche détail système (`GET /api/systems/:id`) en Story 3.2. Ne pas les inclure maintenant.

### Pattern de route — copier sync.js

```javascript
import { Router } from 'express';
import { success, validationError } from '../utils/response.js';
import { getSystems } from '../services/compendium.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const data = getSystems(req.table.id, req.table.role);
  success(res, data);
});

export default router;
```

### Plausible deniability — INVARIANT

**Jamais** de `total_count`, `has_more`, `page`, `limit` dans la réponse. Le joueur ne doit pas pouvoir déduire combien d'entités existent au total. La réponse est simplement `{ "data": [...] }`.

### Colonnes SQL exactes par table

**systems** (INTEGER id) :
| Colonne | Type | Inclure en liste ? |
|---|---|---|
| id | INTEGER PK | ✅ |
| quadrant | TEXT NOT NULL | ✅ |
| nom | TEXT NOT NULL | ✅ |
| faction | TEXT DEFAULT '' | ✅ |
| is_frontiere | INTEGER DEFAULT 0 | ✅ |
| route | TEXT DEFAULT '' | ✅ |
| gouvernement | TEXT DEFAULT '' | ✅ |
| description | TEXT DEFAULT '' | ✅ |
| soleil_json | TEXT | ❌ (Story 3.2) |
| corps_celestes_json | TEXT | ❌ (Story 3.2) |
| patrouilles_json | TEXT | ❌ (Story 3.2) |
| created_at | TEXT | ❌ |
| updated_at | TEXT | ❌ |

**factions** (INTEGER id) :
| Colonne | Type | Inclure ? |
|---|---|---|
| id | INTEGER PK | ✅ |
| name | TEXT UNIQUE | ✅ |
| short | TEXT | ✅ |
| description | TEXT | ✅ |
| icon | TEXT | ✅ |
| color | TEXT | ✅ |
| created_at | TEXT | ❌ |
| updated_at | TEXT | ❌ |

**ship_models** (TEXT id) :
| Colonne | Type | Inclure ? |
|---|---|---|
| id | TEXT PK | ✅ |
| nom | TEXT | ✅ |
| classe | TEXT | ✅ |
| vitesse_croisiere | REAL | ✅ |
| vitesse_hyperspatiale | REAL | ✅ |
| autonomie | REAL | ✅ |
| manoeuvrabilite | TEXT | ✅ |
| vitesse_tactique | TEXT | ✅ |
| blindage | INTEGER | ✅ |
| coque | INTEGER | ✅ |
| senseurs | TEXT | ✅ |
| equipage | TEXT | ✅ |
| passagers | TEXT | ✅ |
| soute | REAL | ✅ |
| prix | REAL | ✅ |
| origine | TEXT | ✅ |
| image | TEXT | ✅ |
| armement_json | TEXT | ✅ |
| systemes_secondaires_json | TEXT | ✅ |

### Architecture — positionnement des routes

```
server.js mount order:
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/game_tables', tablesRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/visibility', visibilityRoutes);
  app.use('/api/systems', systemsRoutes);       // NEW
  app.use('/api/factions', factionsRoutes);      // NEW
  app.use('/api/ship-models', shipModelsRoutes); // NEW
```

### Imports et exports — conventions projet

- Service : export de fonctions nommées (pas de classe, pas de default export)
- Routes : `Router()` export default
- Import db : `import db from '../database.js';`
- Response helpers : `import { success, validationError } from '../utils/response.js';`
- Visibility : `import { isVisible, getVisibleIds } from '../services/visibility.js';`

### Pattern de test — rappel

```javascript
// Tests unitaires : accès direct DB + fonctions du service
import db from '../../src/database.js';
import { getSystems, getFactions, getShipModels } from '../../src/services/compendium.js';

// Tests intégration : via createTestApp() + httpRequest()
import { createTestApp, httpRequest } from '../setup.js';
```

- Tests unitaires : instancier fixtures, appeler les fonctions directement, vérifier shape
- Tests intégration : HTTP via `httpRequest` de `tests/setup.js`
- Prefix test data : `__test_comp_` (unit), `__test_comp_int_` (integration)
- Cleanup : before/after avec DELETE par prefix
- Package.json : chemins explicites (contrainte Windows)

### Project Structure Notes

- `src/services/compendium.js` — nouvelle création
- `src/routes/systems.js` — nouvelle création
- `src/routes/factions.js` — nouvelle création
- `src/routes/ship-models.js` — nouvelle création
- `server.js` — modification (3 imports + 3 mounts)
- `tests/setup.js` — modification (3 imports + 3 mounts)
- Pas de modification de schema

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — §3a REST Conventions]
- [Source: _bmad-output/planning-artifacts/architecture.md — §3b Response Format]
- [Source: _bmad-output/planning-artifacts/architecture.md — §2b Pipeline middleware]
- [Source: _bmad-output/planning-artifacts/architecture.md — §1a Visibility Enforcement]
- [Source: scripts/migrate.js — CREATE TABLE systems, factions, ship_models]
- [Source: _bmad-output/implementation-artifacts/2-1-service-de-visibilite.md — Completion Notes, patterns]

### Previous Story Intelligence (Story 2.1)

**Patterns établis à réutiliser :**
- Import `db` depuis `../database.js` (singleton, connexion WAL)
- Export de fonctions nommées (pas de classe)
- Routes : `Router()` export default, handlers utilisent `success()`, `validationError()`
- Tests unitaires : accès direct DB + fonctions du service
- Tests intégration : `createTestApp()` + `httpRequest()` + auth helpers
- Montage route dans `server.js` et `tests/setup.js`
- Package.json : chemins explicites (contrainte Windows)
- Guard `req.body` : vérifier avant destructuring (patch P2 de la review 2.1)

**Leçons :**
- Remplir Completion Notes + Change Log AVANT passage en review
- Dead code supprimé lors de la review (ne pas laisser de blocs vides)
- Les tests cascade doivent rendre le quadrant parent visible AVANT de tester la visibilité individuelle

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Completion Notes List

- Service `compendium.js` : 3 fonctions (getSystems, getFactions, getShipModels) qui SELECT toutes les entités puis filtrent en mémoire via `isVisible()`. Le MJ reçoit toutes les entités + `visible: boolean` (signifiant "visible pour les joueurs"). Le joueur ne reçoit que les entités visibles, sans champ `visible`.
- 3 routes GET créées suivant le pattern de sync.js : guard `req.table`, appel service, `success(res, data)`
- SELECT explicites pour chaque table — pas de `SELECT *`, colonnes internes exclues
- Données univers confirmées : pas de `WHERE table_id` — les 3 tables sont globales
- Cascade quadrant→systems fonctionne : un quadrant caché masque ses systèmes même si le système est individuellement visible
- 17 tests unitaires (filtrage joueur, réponse MJ, cascade, contrat colonnes)
- 17 tests d'intégration (3 routes × 4 tests + plausible deniability + 4 non-régression)
- Total suite : 145 tests, 29 suites, 0 fail

### Change Log

- 2026-04-20 : Implémentation complète Story 2.2 — service compendium + 3 routes + 34 tests

### File List

- src/services/compendium.js (NEW)
- src/routes/systems.js (NEW)
- src/routes/factions.js (NEW)
- src/routes/ship-models.js (NEW)
- server.js (MODIFIED — 3 imports + 3 route mounts)
- tests/setup.js (MODIFIED — 3 imports + 3 route mounts in createTestApp)
- tests/unit/compendium-service.test.js (NEW)
- tests/integration/compendium.test.js (NEW)
- package.json (MODIFIED — 2 test paths added)
