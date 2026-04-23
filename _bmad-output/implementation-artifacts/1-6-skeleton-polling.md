# Story 1.6 : Skeleton polling

Status: done

## Story

As a developer,
I want the polling infrastructure ready,
So that future epics can enrich the sync payload without rebuilding the polling mechanism.

## Acceptance Criteria (BDD)

1. **Given** un utilisateur est connecté avec une table sélectionnée **When** la page est active (`document.hidden === false`) **Then** `public/js/shared/poller.js` requête `GET /api/sync` toutes les 3-5 secondes
2. **Given** la page est en arrière-plan (`document.hidden === true`) **When** un cycle de polling arrive **Then** l'intervalle est réduit à 15-30 secondes
3. **Given** aucune table n'est sélectionnée **When** la page se charge **Then** le poller ne démarre PAS
4. **And** le endpoint `GET /api/sync` retourne un payload structuré : `{ "data": { "version": <number>, "timestamp": <ISO8601>, "entities": {} } }`
5. **And** le poller expose un callback `onUpdate(data)` utilisable par les pages futures
6. **And** les tests unitaires couvrent le poller avec fake timers et mock de `document.hidden`

Couvre : AR10 (poller skeleton), NFR3 (intervalle 3-5s, réponse <500ms)

## Tasks / Subtasks

- [x] **Task 1 : Service sync côté serveur** (AC: #4)
  - [x] 1.1 Créer `src/services/sync.js` avec :
    - `getSyncPayload(tableId, role)` — retourne le skeleton : `{ version: 1, timestamp: new Date().toISOString(), entities: {} }`
    - Le `version` est un entier incrémenté à chaque modification (pour l'instant fixe à 1, la v2 viendra avec le compendium)
    - Accepte `tableId` et `role` pour préparer l'extensibilité (visibilité future), mais ne les utilise pas encore
  - [x] 1.2 Créer `src/routes/sync.js` avec :
    - `GET /api/sync` — requiert auth + table context (`req.table` doit exister)
    - Si `!req.table` → `validationError(res, 'Aucune table sélectionnée')`
    - Sinon → appelle `getSyncPayload(req.table.id, req.table.role)` et retourne `success(res, payload)`
  - [x] 1.3 Monter la route dans `server.js` :
    - `import syncRoutes from './src/routes/sync.js'`
    - `app.use('/api/sync', syncRoutes)` — **AVANT** `app.use(errorHandler)`
  - [x] 1.4 Mettre à jour `tests/setup.js` :
    - Ajouter `import syncRoutes` et `app.use('/api/sync', syncRoutes)` dans `createTestApp()`

- [x] **Task 2 : Tests unitaires sync service** (AC: #4)
  - [x] 2.1 Créer `tests/unit/sync-service.test.js` :
    - `getSyncPayload` retourne un objet avec `version` (number), `timestamp` (ISO string), `entities` (objet vide)
    - `timestamp` est une date ISO 8601 valide
    - `version` est un entier ≥ 1

- [x] **Task 3 : Tests intégration sync API** (AC: #1, #3, #4)
  - [x] 3.1 Créer `tests/integration/sync.test.js` :
    - `GET /api/sync` avec auth + X-Table-Id valide → 200 + payload structuré
    - `GET /api/sync` avec auth mais SANS X-Table-Id → 400 (validation error)
    - `GET /api/sync` sans auth → 401
    - `GET /api/sync` avec X-Table-Id non-membre → 403
    - Payload contient `data.version` (number), `data.timestamp` (string), `data.entities` (objet)

- [x] **Task 4 : Composant poller.js côté client** (AC: #1, #2, #3, #5)
  - [x] 4.1 Créer `public/js/shared/poller.js` avec factory `createPoller(options)` :
    - `options.url` — URL à requêter (défaut: `/api/sync`)
    - `options.intervalMs` — intervalle foreground (défaut: 3000)
    - `options.backgroundIntervalMs` — intervalle background (défaut: 15000)
    - `options.onData(data)` — callback quand données reçues
    - `options.onError(err)` — callback sur erreur
    - `options.onReconnect()` — callback quand connexion rétablie après erreur
    - `options.fetchFn` — fonction fetch à utiliser (défaut: `fetchWithTable` de `table-selector.js`)
  - [x] 4.2 Méthodes retournées par `createPoller()` :
    - `start()` — démarre le polling (vérifie `getActiveTableId()` d'abord, ne démarre PAS si pas de table)
    - `stop()` — arrête le polling et retire le listener `visibilitychange`
    - `isRunning()` — retourne `true` si le poller tourne
  - [x] 4.3 Logique `visibilitychange` :
    - Écouter `document.addEventListener('visibilitychange', ...)`
    - Si `document.hidden === true` → passer à `backgroundIntervalMs`
    - Si `document.hidden === false` → repasser à `intervalMs` + fetch immédiat
  - [x] 4.4 Gestion d'erreur et reconnexion :
    - Sur erreur fetch → appeler `onError(err)`, continuer le polling
    - Si le fetch réussit après une erreur → appeler `onReconnect()`
    - Utiliser un flag `_hadError` pour tracker l'état

- [x] **Task 5 : Tests unitaires poller.js** (AC: #1, #2, #3, #5, #6)
  - [x] 5.1 Créer `tests/unit/poller.test.js` :
    - **IMPORTANT** : Ce sont des tests Node.js avec fake timers et mocks, PAS des tests navigateur
    - Mock `document.hidden`, `document.addEventListener`, `getActiveTableId`, `fetchWithTable`
    - Utiliser `{ useFakeTimers: true }` du test runner Node.js
    - Tests :
      - `start()` lance un fetch immédiat puis un setInterval
      - `stop()` arrête le polling et supprime le listener visibilitychange
      - `isRunning()` retourne true/false correctement
      - Callback `onData` appelé avec les données du fetch réussi
      - Callback `onError` appelé sur erreur réseau
      - Callback `onReconnect` appelé quand le fetch réussit après une erreur
      - `start()` ne fait RIEN si `getActiveTableId()` retourne null
      - Passage en background interval quand `document.hidden = true`
      - Retour en foreground interval + fetch immédiat quand `document.hidden = false`

- [x] **Task 6 : Mise à jour package.json + run complet** (AC: tous)
  - [x] 6.1 Ajouter les fichiers de test au script `test` de `package.json` :
    - `tests/unit/sync-service.test.js`
    - `tests/unit/poller.test.js`
    - `tests/integration/sync.test.js`
  - [x] 6.2 Run complet : tous les tests doivent passer (72 existants + nouveaux)
  - [x] 6.3 Marquer toutes les tasks [x], mettre le status à `review`

## Dev Notes

### Ce que fait cette story

C'est un **skeleton** : l'infrastructure de polling est posée mais le payload sync est vide (`entities: {}`). Les stories futures (epic 2+) enrichiront le payload avec les entités du compendium, de la carte, etc. Le poller lui-même ne changera pas.

### Architecture polling — décisions clés

- **Full state polling, pas de delta** — YAGNI pour le volume actuel (5 users, ~200 entités) [Source: architecture.md#Category-1c]
- **Pas de WebSocket** — non-goal PRD#1, ne pas préparer activement [Source: architecture.md#Architectural-Constraints]
- **Réponse serveur < 500ms** — NFR3 [Source: prd.md#NFR3]
- **Intervalle configurable** : 3s foreground, 15s background [Source: epics.md#Story-1.6]

### Pattern polling prévu dans l'architecture

```javascript
// Usage futur dans les pages :
import { createPoller } from '/js/shared/poller.js';

const poller = createPoller({
  url: '/api/sync',
  intervalMs: 3000,
  backgroundIntervalMs: 15000,
  onData: (data) => updateUI(data),
  onError: (err) => showConnectionLost(),
  onReconnect: () => showConnectionRestored()
});

poller.start();
```

### Endpoint `GET /api/sync`

```
GET /api/sync
Headers: Cookie (auth JWT), X-Table-Id (table active)
Auth: requis
Table context: requis (req.table doit exister)

Réponse 200 :
{
  "data": {
    "version": 1,
    "timestamp": "2026-04-20T18:30:00.000Z",
    "entities": {}
  }
}

Réponse 400 (pas de table) :
{ "error": { "code": "VALIDATION_ERROR", "message": "Aucune table sélectionnée" } }
```

### Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/services/sync.js` | Service sync — `getSyncPayload(tableId, role)` |
| `src/routes/sync.js` | Route `GET /` → sync payload |
| `public/js/shared/poller.js` | Client poller avec factory `createPoller()` |
| `tests/unit/sync-service.test.js` | Tests unitaires service |
| `tests/unit/poller.test.js` | Tests unitaires poller (fake timers + mocks) |
| `tests/integration/sync.test.js` | Tests intégration endpoint |

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `server.js` | Ajouter `import syncRoutes` + `app.use('/api/sync', syncRoutes)` |
| `tests/setup.js` | Ajouter `syncRoutes` dans `createTestApp()` |
| `package.json` | Ajouter 3 fichiers test au script `test` |

### Pipeline middleware — rappel

```
1. express.static('public')
2. express.json()
3. cookieParser()
4. helmet()
5. authMiddleware()         ← req.user
6. tableContextMiddleware() ← req.table (via X-Table-Id header)
7. [Routes API]             ← GET /api/sync ici
8. errorHandler
```

`GET /api/sync` passe par auth (pas whitelisté) ET par tableContextMiddleware. Si `X-Table-Id` est absent → `req.table = null`. La route DOIT vérifier `req.table` et retourner 400 si absent.

### Conventions du projet — rappel des stories précédentes

- **ESM** : `import/export`, pas de `require()`
- **Response helpers** : `success()`, `validationError()`, `forbidden()`, `error()` depuis `src/utils/response.js`
- **Tests** : `node --test` avec fake timers via `{ useFakeTimers: true }` dans `describe`/`it` options
- **Test cleanup** : prefix `__test_` + `before()`/`after()` cleanup
- **httpRequest** dans `tests/setup.js` : supporte `{ method, path, body, cookies, headers }` — envoyer `headers: { 'X-Table-Id': String(tableId) }` pour les tests sync
- **Nommage** : `kebab-case.js` pour les fichiers, `camelCase` pour les variables, `UPPER_SNAKE_CASE` pour les constantes
- **BigInt** : `Number(lastInsertRowid)` pour better-sqlite3
- **72 tests existants** : 9 suites, NE PAS CASSER

### Tests poller — stratégie de mock

Le poller.js est un module client (browser). Pour le tester en Node.js :

```javascript
// Mock globals avant import
globalThis.document = {
  hidden: false,
  addEventListener: (event, handler) => { /* capturer handler */ },
  removeEventListener: (event, handler) => { /* ... */ }
};

// Mock du module table-selector
// Option 1: Injecter fetchFn et getTableIdFn dans createPoller options
// Option 2: Mock via globalThis

// RECOMMANDÉ: Option 1 (injection de dépendances) car plus testable
// createPoller({ fetchFn: mockFetch, getTableIdFn: mockGetId, ... })
```

L'injection de dépendances via `options.fetchFn` et `options.getTableIdFn` est plus propre que le monkey-patching de `globalThis`. Le poller accepte ces fonctions en paramètres avec des défauts raisonnables pour l'usage réel.

### Discordance PRD / Architecture

Le PRD mentionne `/api/data/t/:tid/poll` mais l'architecture et les epics utilisent `GET /api/sync`. **Suivre l'architecture** : `GET /api/sync` est l'endpoint autoritatif. Le table ID passe par le header `X-Table-Id` (résolu par le middleware), pas par l'URL.

### Review findings story 1.5 à considérer

- **Deferred** : double appel GET /active par page — ne pas reproduire ce pattern avec le sync
- **Deferred** : pas de try/catch autour de db.prepare() — pattern pré-existant, ne pas changer

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (GitHub Copilot)

### Debug Log References
Aucun debug nécessaire — implémentation sans blocage.

### Completion Notes List
- Service sync créé avec `getSyncPayload(tableId, role)` retournant skeleton `{ version: 1, timestamp, entities: {} }`
- Route `GET /api/sync` montée, requiert auth + table context, retourne 400 sans table
- Poller client `createPoller()` factory avec injection de dépendances (`fetchFn`, `getTableIdFn`)
- Import dynamique avec try/catch pour compatibilité Node.js tests (pas de top-level static import browser)
- Visibility API : intervalle 3s foreground, 15s background, fetch immédiat au retour foreground
- Flag `hadError` pour callback `onReconnect` après erreur réseau
- 18 nouveaux tests (4 unit sync + 5 integration sync + 9 unit poller), 90 total, 0 fail

### File List

**Créés :**
- `src/services/sync.js`
- `src/routes/sync.js`
- `public/js/shared/poller.js`
- `tests/unit/sync-service.test.js`
- `tests/unit/poller.test.js`
- `tests/integration/sync.test.js`

**Modifiés :**
- `server.js` — import + mount syncRoutes
- `tests/setup.js` — import + mount syncRoutes dans createTestApp()
- `package.json` — 3 fichiers test ajoutés au script test

### Change Log
- Story 1.6 implémentée : infrastructure polling skeleton (service sync + route API + poller client + 18 tests)
