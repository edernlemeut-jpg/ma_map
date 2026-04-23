# Story 2.1 : Service de visibilité

Status: done

## Story

As a système,
I want a centralized visibility service that enforces protect-by-default and cascade rules,
So that every route can filter data consistently without duplicating logic.

## Acceptance Criteria (BDD)

1. **Given** une entité n'a pas de règle de visibilité **When** un joueur requête ses données **Then** elle est invisible (protect-by-default)
2. **Given** un MJ appelle `PATCH /api/visibility/:entityType/:entityId` avec `{ "visible": true }` **When** la requête est traitée **Then** la règle est persistée dans `visibility_rules` (ou `table_visibility_overrides` pour les entités univers) **And** la réponse retourne `{ "data": { "entityType", "entityId", "visible": true } }`
3. **Given** une entité parente (système d'un quadrant) est cachée **When** un joueur requête ses enfants **Then** ils sont tous invisibles, même ceux marqués visibles — un enfant ne peut JAMAIS être visible si son parent est masqué
4. **And** le service `src/services/visibility.js` expose :
   - `isVisible(entityType, entityId, tableId, role)` — le MJ voit toujours tout
   - `getVisibleIds(entityType, tableId, role)` — retourne les IDs filtrés selon le rôle
   - `toggleVisibility(entityType, entityId, tableId, visible)` — persiste + cascade transactionnelle
5. **And** le paramètre `role` évite de dupliquer la bifurcation MJ/joueur dans chaque route
6. **And** pas de cache mémoire — recalcul à chaque appel (acceptable à ~200 entités, <1ms sur SQLite)
7. **And** tests unitaires complets : protect-by-default, cascade top-down, toggle, invariante parent-enfant, rôle MJ vs joueur

Couvre : FR9, FR11, FR13, AR4

## Tasks / Subtasks

- [x] **Task 1 : Service visibility.js — logique métier** (AC: #1, #4, #5, #6)
  - [ ] 1.1 Créer `src/services/visibility.js` avec les imports : `db` depuis `../database.js`
  - [ ] 1.2 Implémenter `isVisible(entityType, entityId, tableId, role)` :
    - Si `role === 'mj'` → retourner `true` (MJ voit tout)
    - Déterminer la table de visibilité : `table_visibility_overrides` pour entités univers (`factions`, `ship_models`), `visibility_rules` pour entités campagne (tout le reste)
    - Requêter la règle : `SELECT visible FROM {table} WHERE table_id=? AND entity_type=? AND entity_id=?`
    - Si aucune règle → appliquer défaut : `factions` → visible (1), tout le reste → caché (0)
    - Si entité campagne et entité a un parent (système avec un quadrant) → vérifier la visibilité du parent. Si parent caché → retourner `false` (cascade)
  - [ ] 1.3 Implémenter `getVisibleIds(entityType, tableId, role)` :
    - Si `role === 'mj'` → retourner TOUS les IDs de l'entité-type (requête directe sur la table source)
    - Sinon → requêter les règles visibles + appliquer défauts + cascade parentale
    - Retourner un `Set` ou un `Array` d'IDs visibles
  - [ ] 1.4 Implémenter `toggleVisibility(entityType, entityId, tableId, visible)` :
    - Déterminer la table cible (même logique que isVisible)
    - UPSERT : `INSERT OR REPLACE INTO {table} (table_id, entity_type, entity_id, visible) VALUES (?, ?, ?, ?)`
    - Si cascade descendante applicable (toggle d'un quadrant) → update transactionnel des systèmes enfants via `db.transaction()`
    - Retourner `{ entityType, entityId, visible }`

- [x] **Task 2 : Route PATCH /api/visibility** (AC: #2)
  - [ ] 2.1 Créer `src/routes/visibility.js` avec un `Router()`
  - [ ] 2.2 Implémenter `PATCH /:entityType/:entityId` :
    - Vérifier `req.table` présent (sinon `validationError`)
    - Vérifier `req.table.role === 'mj'` (sinon `forbidden`)
    - Valider `entityType` dans une liste blanche : `['systems', 'factions', 'ship_models', 'ships', 'npcs']`
    - Valider `req.body.visible` est un booléen
    - Appeler `toggleVisibility(entityType, entityId, tableId, visible)`
    - Retourner `success(res, { entityType, entityId, visible })`
  - [ ] 2.3 Monter la route dans `server.js` : `app.use('/api/visibility', visibilityRoutes)`
  - [ ] 2.4 Monter la route dans `tests/setup.js` : ajouter dans `createTestApp()`

- [x] **Task 3 : Tests unitaires visibility service** (AC: #1, #3, #7)
  - [ ] 3.1 Créer `tests/unit/visibility.test.js`
  - [ ] 3.2 Tests protect-by-default :
    - `isVisible('systems', id, tableId, 'joueur')` sans règle → `false`
    - `isVisible('ship_models', id, tableId, 'joueur')` sans règle → `false`
    - `isVisible('factions', id, tableId, 'joueur')` sans règle → `true` (défaut visible)
  - [ ] 3.3 Tests rôle MJ :
    - `isVisible(*, *, *, 'mj')` → toujours `true`
    - `getVisibleIds('systems', tableId, 'mj')` → retourne TOUS les IDs
  - [ ] 3.4 Tests toggle :
    - Après `toggleVisibility('systems', id, tableId, true)` → `isVisible` retourne `true`
    - Toggle `false` → `isVisible` retourne `false`
    - Toggle persiste dans la bonne table (`visibility_rules` vs `table_visibility_overrides`)
  - [ ] 3.5 Tests cascade :
    - Système visible dans quadrant "Alpha" → joueur le voit
    - Toggle quadrant "Alpha" → caché → systèmes enfants deviennent cachés même si marqués visibles individuellement
    - Toggle quadrant "Alpha" → visible → systèmes retrouvent leur état individuel
  - [ ] 3.6 Tests getVisibleIds :
    - Retourne uniquement les IDs visibles pour un joueur
    - Retourne tous les IDs pour un MJ
    - Respect de la cascade dans le filtrage

- [x] **Task 4 : Tests intégration route visibility** (AC: #2)
  - [ ] 4.1 Créer `tests/integration/visibility.test.js`
  - [ ] 4.2 Tests route :
    - PATCH comme MJ → 200 + état après toggle
    - PATCH comme joueur → 403
    - PATCH sans table context → 400
    - PATCH entityType invalide → 400
    - PATCH sans auth → 401
  - [ ] 4.3 Tests non-régression : routes existantes (health, auth, tables, sync) toujours fonctionnelles

- [x] **Task 5 : Mise à jour package.json + vérification** (AC: tous)
  - [ ] 5.1 Ajouter `tests/unit/visibility.test.js tests/integration/visibility.test.js` au script test
  - [ ] 5.2 Lancer `npm test` — tous les tests existants (90) + nouveaux doivent passer

## Dev Notes

### Modèle de données visibilité

Deux tables SQL séparent les entités univers et campagne :

**Entités univers** (partagées entre tables, overrides par table) → `table_visibility_overrides` :
| Entité | Défaut | Cascade |
|---|---|---|
| `factions` | **Visible** | Non |
| `ship_models` | **Caché** | Non |

**Entités campagne** (scopées par table) → `visibility_rules` :
| Entité | Défaut | Cascade |
|---|---|---|
| `systems` | Caché | Oui — hérite du quadrant |
| `ships` | Caché | Non |
| `npcs` | Caché | Non |
| `notes` | MJ uniquement | N/A — jamais exposé via API joueur |

### Cascade descendante

**Il n'y a pas de table `quadrants`** — le quadrant est une colonne TEXT sur `systems`. La cascade s'applique donc comme suit :
- Le MJ toggle un "quadrant" (valeur text, e.g. "Alpha") → cela impacte tous les `systems` qui ont `quadrant = 'Alpha'`
- Pour modéliser ça : utiliser `entity_type = 'quadrants'` et `entity_id = 'Alpha'` dans `visibility_rules`
- Au toggle d'un quadrant caché → chaque système de ce quadrant a sa colonne `visible` forcée à 0 (même si individuellement marqué visible)
- Au toggle d'un quadrant visible → les systèmes retrouvent leurs règles individuelles (le quadrant ne force plus le masquage)

**Invariant cascade** : `isVisible('systems', id, tableId, 'joueur')` doit TOUJOURS vérifier la visibilité du quadrant parent avant de retourner `true`. Même si la règle individuelle dit visible, un parent caché fait que l'enfant est caché.

### Architecture — positionnement

```
Pipeline middleware                          Service visibilité
─────────────────                           ──────────────────
req → auth → tableContext → route ──────→   visibility.isVisible()
                                            visibility.getVisibleIds()
                                            visibility.toggleVisibility()
```

- Le service n'est PAS un middleware global. C'est un service appelé par les routes de données.
- Les routes auth/tables/admin n'appellent PAS le service de visibilité.
- Chaque route de données campagne appellera `getVisibleIds()` ou `isVisible()` pour filtrer ses réponses (dans les stories suivantes 2.2+).

### Réponses API — rappel format

```javascript
// Succès
import { success, notFound, forbidden, validationError } from '../utils/response.js';
success(res, { entityType, entityId, visible });  // → { data: { ... } }

// Ressource cachée → 404 (plausible deniability)
notFound(res, 'Ressource introuvable');

// Joueur tente un toggle → 403
forbidden(res, 'Accès MJ requis');
```

### Tables SQL — colonnes exactes

```sql
-- visibility_rules (campagne)
CREATE TABLE IF NOT EXISTS visibility_rules (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(table_id, entity_type, entity_id)
);

-- table_visibility_overrides (univers)
CREATE TABLE IF NOT EXISTS table_visibility_overrides (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(table_id, entity_type, entity_id)
);
```

**Notes :**
- `entity_id` est TEXT (pas INTEGER) — `ship_models.id` est TEXT, `systems.id` est INTEGER → toujours stocker en TEXT pour uniformité
- `visible` est INTEGER (0/1) — SQLite n'a pas de booléen natif
- Clé primaire composite → `INSERT OR REPLACE` pour l'upsert

### Pattern de test — rappel

```javascript
// Tests unitaires : accès direct à la DB en mémoire
import db from '../../src/database.js';
import { isVisible, getVisibleIds, toggleVisibility } from '../../src/services/visibility.js';

// Tests intégration : via createTestApp() + httpRequest()
import { createTestApp, httpRequest } from '../setup.js';
```

- Tests unitaires : instancier la DB en mémoire, insérer des fixtures, appeler les fonctions directement
- Tests intégration : HTTP via `httpRequest` de `tests/setup.js`, utiliser les helpers auth (créer user, login, récupérer cookie)
- **Ne pas oublier** : ajouter `visibilityRoutes` dans `createTestApp()` de `tests/setup.js`

### Project Structure Notes

- `src/services/visibility.js` — nouvelle création, conforme à la structure `src/services/`
- `src/routes/visibility.js` — nouvelle création, conforme à la structure `src/routes/`
- Pas de modification de schema (tables `visibility_rules` et `table_visibility_overrides` existent déjà en v1)
- Pas de migration nécessaire

### Entity type whitelist

La route PATCH doit valider `entityType` contre une liste blanche pour éviter l'injection :
```javascript
const VALID_ENTITY_TYPES = ['systems', 'factions', 'ship_models', 'ships', 'npcs'];
```

`notes` n'est PAS dans la liste — les notes ne sont jamais visibles par les joueurs et n'ont pas de toggle.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — §1a Hiérarchie d'entités & modèle de visibilité]
- [Source: _bmad-output/planning-artifacts/architecture.md — §2b Pipeline middleware]
- [Source: _bmad-output/planning-artifacts/architecture.md — AR4 Visibility service]
- [Source: _bmad-output/planning-artifacts/architecture.md — Pattern de route API template]
- [Source: _bmad-output/planning-artifacts/architecture.md — Enforcement Guidelines]
- [Source: scripts/migrate.js — CREATE TABLE visibility_rules, table_visibility_overrides]
- [Source: _bmad-output/implementation-artifacts/1-6-skeleton-polling.md — Dev Record, patterns établis]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-04-20.md — Items différés, patterns]

### Previous Story Intelligence (Story 1.6)

**Patterns établis à réutiliser :**
- Import `db` depuis `../database.js` (singleton, connexion WAL)
- Export de fonctions nommées (pas de classe, pas de default export pour les services)
- Routes : `Router()` export default, handlers utilisent `success()`, `forbidden()`, etc.
- Tests unitaires : accès direct DB + fonctions du service
- Tests intégration : `createTestApp()` + `httpRequest()` + auth helpers
- Montage route dans `server.js` : `import xxxRoutes from './src/routes/xxx.js'` + `app.use('/api/xxx', xxxRoutes)`
- Montage test dans `tests/setup.js` : même import + mount dans `createTestApp()`
- `package.json` : ajouter les chemins de test explicites (contrainte Windows)

**Leçons de l'Epic 1 (rétro) :**
- Remplir Completion Notes + Change Log AVANT passage en review
- Tester les cas d'erreur réseau/edge cases dans les tests unitaires
- Les `.catch()` manquants sur les promesses sont un piège courant (patches 1.6)

## Dev Agent Record

### Agent Model Used

### Completion Notes List

- 111 tests (14 suites), 0 failures — 21 nouveaux tests visibilité (14 unitaires + 7 intégration)
- La cascade est implémentée au read-time (isVisible vérifie le parent quadrant) et non au write-time
- `entity_id` toujours stocké en TEXT (uniformité systems.id INTEGER vs ship_models.id TEXT)
- Les tests cascade vérifient que le quadrant parent doit être visible AVANT de tester la visibilité individuelle d'un système
- Route inclut `quadrants` dans la whitelist en plus des 5 types de base (pour le toggle côté MJ)

### Review Findings

- [x] [Review][Patch] P1: Supprimer dead code — bloc `if (entityType === 'quadrants')` vide dans `toggleVisibility` [src/services/visibility.js:78]
- [x] [Review][Patch] P2: Ajouter guard `req.body` null avant destructuring pour éviter TypeError/500 [src/routes/visibility.js:24]
- [x] [Review][Defer] D1: Pas de validation d'existence de l'entité avant toggle — phantom rules possibles pour entités inexistantes — deferred, pre-existing design choice

### Change Log

- `src/services/visibility.js` — CREATED — Service visibility avec isVisible, getVisibleIds, toggleVisibility
- `src/routes/visibility.js` — CREATED — Route PATCH /:entityType/:entityId (MJ only)
- `server.js` — MODIFIED — Import + montage `/api/visibility`
- `tests/setup.js` — MODIFIED — Import + montage visibilityRoutes dans createTestApp()
- `tests/unit/visibility.test.js` — CREATED — 14 tests unitaires
- `tests/integration/visibility.test.js` — CREATED — 7 tests intégration
- `package.json` — MODIFIED — Ajout chemins tests visibility

### File List

- `src/services/visibility.js`
- `src/routes/visibility.js`
- `server.js`
- `tests/setup.js`
- `tests/unit/visibility.test.js`
- `tests/integration/visibility.test.js`
- `package.json`
