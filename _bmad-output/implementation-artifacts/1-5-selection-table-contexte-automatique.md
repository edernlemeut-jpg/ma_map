# Story 1.5 : Sélection de table & contexte automatique

Status: done

## Story

As a utilisateur connecté appartenant à une ou plusieurs tables,
I want to select my active game table and have all pages reflect that context,
So that I see only the data relevant to my current game.

## Acceptance Criteria (BDD)

1. **Given** j'appartiens à plusieurs tables **When** j'ouvre le sélecteur de table **Then** je vois la liste de mes tables et je peux en choisir une
2. **Given** j'ai sélectionné une table **When** je navigue sur n'importe quelle page **Then** le middleware `src/middleware/table-context.js` injecte `req.table` avec mon rôle dans cette table **And** le header affiche le nom de la table active et mon rôle (MJ/joueur)
3. **Given** ma table sélectionnée a été supprimée côté serveur **When** je navigue **Then** le middleware détecte l'incohérence, efface la sélection locale et me redirige vers le sélecteur
4. **And** le composant `public/js/shared/table-selector.js` persiste le choix via localStorage et l'envoie via header `X-Table-Id`
5. **And** le composant `public/js/shared/header.js` affiche table active + rôle + bouton déconnexion
6. **And** sans table sélectionnée, les pages de contenu affichent un message invitant à en choisir une

Couvre : FR7, FR8

## Tasks / Subtasks

- [x] **Task 1 : Middleware table-context.js — remplacer le stub** (AC: #2, #3)
  - [x] 1.1 Implémenter `tableContextMiddleware` dans `src/middleware/table-context.js` :
    - Extraire `X-Table-Id` du header de la requête
    - Si absent → `req.table = null`, passer au next()
    - Si présent → valider que l'utilisateur (`req.user.id`) est membre de cette table via `table_members`
    - Si membre → `req.table = { id: Number(tableId), role: member.role }`
    - Si non-membre → retourner `forbidden(res, 'Pas membre de cette table')`
  - [x] 1.2 Ajouter un endpoint `GET /api/game_tables/active` dans `src/routes/tables.js` qui retourne les détails de la table active (nom, rôle, id) basé sur le header `X-Table-Id` (utilise `req.table` injecté par le middleware)

- [x] **Task 2 : Tests unitaires middleware table-context** (AC: #2, #3)
  - [x] 2.1 Créer `tests/unit/table-context.test.js` :
    - Sans header X-Table-Id → req.table = null, next() appelé
    - Avec X-Table-Id valide et user membre → req.table = { id, role }
    - Avec X-Table-Id et user non-membre → 403
    - Avec X-Table-Id d'une table inexistante → 403
    - Sans req.user (whitelist route) → req.table = null, next()

- [x] **Task 3 : Composant table-selector.js — sélection côté client** (AC: #1, #4, #6)
  - [x] 3.1 Créer `public/js/shared/table-selector.js` avec :
    - `getActiveTableId()` — lit `localStorage.getItem('active_table_id')`
    - `setActiveTable(tableId)` — écrit dans localStorage
    - `clearActiveTable()` — supprime de localStorage
    - `fetchWithTable(url, options)` — wrapper de fetch() qui ajoute automatiquement le header `X-Table-Id` depuis localStorage
    - `renderTableSelector(containerId)` — charge GET /api/game_tables, affiche la liste, gère le clic de sélection
  - [x] 3.2 Afficher un message "Aucune table sélectionnée — choisissez une table" quand active_table_id est absent

- [x] **Task 4 : Composant header.js — header partagé** (AC: #2, #5)
  - [x] 4.1 Créer `public/js/shared/header.js` qui remplace/étend la logique actuelle de `auth-ui.js` :
    - Affiche le nom de la table active et le rôle (MJ/joueur) dans le header
    - Bouton pour changer de table (redirige vers le sélecteur ou affiche un dropdown)
    - Bouton déconnexion existant conservé
    - Appel `GET /api/game_tables/active` avec le header X-Table-Id pour récupérer nom + rôle
  - [x] 4.2 Mettre à jour `public/index.html` pour utiliser le nouveau header

- [x] **Task 5 : Mise à jour dashboard.js — intégration sélecteur** (AC: #1, #6)
  - [x] 5.1 Modifier `public/js/dashboard.js` pour :
    - Après auth, vérifier si une table est sélectionnée (localStorage)
    - Si non → afficher le sélecteur de table
    - Si oui → vérifier que la table est toujours valide via `GET /api/game_tables/active`
    - Si table invalide → clearActiveTable() + afficher sélecteur
    - Si valide → afficher le dashboard avec le contexte de la table

- [x] **Task 6 : Tests intégration** (AC: #1-#6)
  - [x] 6.1 Créer/étendre `tests/integration/table-context.test.js` :
    - GET /api/game_tables/active avec X-Table-Id valide → 200 + nom + rôle
    - GET /api/game_tables/active sans header → 200 + data: null
    - GET /api/game_tables/active avec table non-membre → 403
    - Requête API quelconque avec X-Table-Id valide → req.table injecté correctement
    - Requête API sans X-Table-Id → req.table null, pas d'erreur
  - [x] 6.2 Mettre à jour `package.json` script test

### Review Findings

- [x] [Review][Patch] dashboard.js catch réseau montre le dashboard avec table invalide — corrigé: clear + selector [dashboard.js]
- [x] [Review][Patch] header.js ne clear pas localStorage quand data est null — corrigé: ajout clearActiveTable() [header.js]
- [x] [Review][Defer] Double appel GET /active par page (header.js + dashboard.js) — deferé, optimisation future
- [x] [Review][Defer] AC #6 garde table-context uniquement sur dashboard (une seule page actuellement) — deferé, pré-existant
- [x] [Review][Defer] Pas de try/catch autour de db.prepare() synchrone — deferé, pattern pré-existant avec Express error handler

### Architecture — ce que fait cette story

Cette story implémente le **pivot multi-table** de l'application. Le middleware `table-context.js` (actuellement un stub pass-through) est remplacé par un vrai middleware qui résout la table active et le rôle de l'utilisateur à chaque requête API. Côté client, un composant de sélection persiste le choix en localStorage et l'envoie via le header HTTP `X-Table-Id`.

### Pipeline middleware — positionnement

Le middleware `tableContextMiddleware` est déjà monté dans `src/middleware/index.js` (position 6, après auth). **Ne pas modifier l'ordre du pipeline** — le middleware reçoit déjà `req.user` peuplé par `authMiddleware`.

```
1. express.static('public')    ← Pas d'auth
2. express.json()
3. cookieParser()
4. helmet()
5. authMiddleware()            ← Peuple req.user
6. tableContextMiddleware()    ← *** CETTE STORY *** → Peuple req.table
7. [Routes API]
8. errorHandler
```

### Schéma middleware table-context.js attendu

```javascript
// src/middleware/table-context.js
import db from '../database.js';
import { forbidden } from '../utils/response.js';

export default function tableContextMiddleware(req, res, next) {
  const tableId = req.headers['x-table-id'];

  // Pas de table sélectionnée — OK, certaines routes n'en ont pas besoin
  if (!tableId) {
    req.table = null;
    return next();
  }

  // Pas d'utilisateur authentifié — les routes whitelistées passent
  if (!req.user) {
    req.table = null;
    return next();
  }

  const member = db.prepare(
    'SELECT role FROM table_members WHERE table_id = ? AND user_id = ?'
  ).get(Number(tableId), req.user.id);

  if (!member) {
    return forbidden(res, 'Pas membre de cette table');
  }

  req.table = {
    id: Number(tableId),
    role: member.role  // 'mj' ou 'joueur'
  };
  next();
}
```

### Composant table-selector.js — pattern

```javascript
// public/js/shared/table-selector.js
const STORAGE_KEY = 'active_table_id';

export function getActiveTableId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveTable(tableId) {
  localStorage.setItem(STORAGE_KEY, String(tableId));
}

export function clearActiveTable() {
  localStorage.removeItem(STORAGE_KEY);
}

// Wrapper fetch qui ajoute X-Table-Id
export function fetchWithTable(url, options = {}) {
  const tableId = getActiveTableId();
  const headers = { ...options.headers };
  if (tableId) {
    headers['X-Table-Id'] = tableId;
  }
  return fetch(url, { ...options, headers });
}
```

### Endpoint GET /api/game_tables/active

Nouveau endpoint dans `src/routes/tables.js` qui utilise `req.table` (injecté par le middleware) pour retourner les détails de la table active :

```javascript
router.get('/active', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const table = db.prepare('SELECT id, name, mj_id FROM game_tables WHERE id = ?').get(req.table.id);
  if (!table) {
    return notFound(res, 'Table introuvable');
  }
  success(res, {
    id: table.id,
    name: table.name,
    role: req.table.role,
    is_mj: req.table.role === 'mj'
  });
});
```

**IMPORTANT** : Placer cette route AVANT `router.get('/')` pour éviter un conflit de pattern matching Express (`:id` capturerait "active").

Non — il n'y a pas de `router.get('/:id')` actuellement. `GET /` et `GET /active` ne sont pas en conflit. Mais par sécurité, placer `/active` avant `/` dans le fichier.

### Gestion de l'incohérence (table supprimée)

Le middleware retourne `403 Forbidden` si l'utilisateur n'est plus membre. Côté client :
1. `fetchWithTable()` reçoit un 403
2. Le dashboard détecte le 403 sur `/api/game_tables/active`
3. Appelle `clearActiveTable()` et redirige vers le sélecteur

### Intégration avec auth-ui.js

`auth-ui.js` reste inchangé — il gère l'authentification. Le nouveau `header.js` étend les infos affichées dans le header (nom table + rôle). Il peut importer `auth-ui.js` pour réutiliser `initAuthUI()`.

### Fichiers existants à NE PAS TOUCHER

- `src/middleware/auth.js` — pas de changement
- `src/middleware/index.js` — le stub est déjà monté, pas besoin de modifier
- `src/services/auth.js`, `src/routes/auth.js` — inchangés
- `src/services/tables.js` — inchangé (listUserTables est déjà disponible et utilisable)
- `src/database.js` — inchangé
- `scripts/migrate.js` — pas de migration nécessaire
- Legacy HTML en racine

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `src/middleware/table-context.js` | **MODIFIER** — remplacer stub par vrai middleware |
| `src/routes/tables.js` | **MODIFIER** — ajouter GET /active (avant GET /) |
| `public/js/shared/table-selector.js` | **CRÉER** — sélection + persistance localStorage + fetchWithTable |
| `public/js/shared/header.js` | **CRÉER** — header partagé avec table active + rôle |
| `public/js/dashboard.js` | **MODIFIER** — intégrer sélecteur + validation table active |
| `public/index.html` | **MODIFIER** — header mis à jour pour afficher table+rôle |
| `tests/unit/table-context.test.js` | **CRÉER** — tests middleware |
| `tests/integration/table-context.test.js` | **CRÉER** — tests endpoint + intégration |
| `package.json` | **MODIFIER** — ajouter nouveaux fichiers test au script |

### Learnings Stories précédentes

- **ESM modules** : tout le projet est `"type": "module"`, pas de require()
- **Tests** : `node --test` avec chemins explicites (pas de globs sur Windows)
- **Config** : tout passe par `src/config/index.js`, jamais `process.env` directement
- **Response helpers** : `src/utils/response.js` — success(), error(), validationError(), forbidden(), notFound(), authRequired()
- **httpRequest helper** dans `tests/setup.js` — supporte method, path, body, cookies. **À étendre avec headers** pour envoyer X-Table-Id dans les tests intégration
- **createTestApp** dans `tests/setup.js` inclut health + auth + tables routes + middleware pipeline complet (y compris tableContextMiddleware)
- **server.js** : `isMainModule` guard — ne pas toucher
- **Colonnes BigInt** : caster `Number(lastInsertRowid)` pour better-sqlite3
- **UNIQUE constraint** : utiliser `err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'` (pas string matching)
- **Nettoyage tests** : utiliser TEST_PREFIX + before/after cleanup
- **Schéma real DB** : `mj_id` (pas `created_by`)
- **55 tests existants** : 5 schema + 8 auth-service + 5 auth-middleware + 12 tables-service + 1 health + 12 auth-integration + 12 tables-integration — **NE PAS CASSER**
- **httpRequest() supporte cookies** mais ne supporte PAS encore les headers custom — **il faudra l'étendre pour ajouter X-Table-Id** dans les tests d'intégration

### Pattern de test httpRequest avec headers

Le helper `httpRequest()` dans `tests/setup.js` utilise `options.headers`. Le cookie est passé séparément. Pour ajouter `X-Table-Id`, étendre le helper ou passer le header directement :

```javascript
// Option 1 : Modifier httpRequest pour accepter un paramètre headers
export function httpRequest(app, { method = 'GET', path, body, cookies, headers = {} } = {}) {
  // ...
  const options = {
    headers: { ...headers }
  };
  if (body) options.headers['Content-Type'] = 'application/json';
  if (cookies) options.headers['Cookie'] = cookies;
  // ...
}
```

### Project Structure Notes

```
src/
├── middleware/
│   ├── index.js          ← Pipeline déjà monté (positions 1-6)
│   ├── auth.js           ← Ne pas toucher
│   ├── table-context.js  ← *** REMPLACER LE STUB ***
│   └── error-handler.js  ← Ne pas toucher
├── routes/
│   └── tables.js         ← Ajouter GET /active
├── services/
│   └── tables.js         ← listUserTables() déjà disponible
├── utils/
│   └── response.js       ← forbidden(), validationError() etc.
public/
├── js/
│   ├── shared/
│   │   ├── auth-ui.js    ← Existant, ne pas toucher
│   │   ├── table-selector.js  ← *** CRÉER ***
│   │   └── header.js     ← *** CRÉER ***
│   ├── dashboard.js      ← *** MODIFIER ***
│   └── onboarding.js     ← Ne pas toucher
├── index.html            ← *** MODIFIER HEADER ***
tests/
├── setup.js              ← *** MODIFIER *** (ajouter support headers à httpRequest)
├── unit/
│   └── table-context.test.js  ← *** CRÉER ***
├── integration/
│   └── table-context.test.js  ← *** CRÉER ***
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Pipeline Middleware, Table Context Middleware]
- [Source: _bmad-output/planning-artifacts/prd.md — FR7, FR8, NFR8, NFR10]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.5]
- [Source: _bmad-output/implementation-artifacts/1-4-gestion-tables-de-jeu-invitation.md — Dev Record, Review Findings]

## Dev Agent Record

### Agent Model Used

Claude

### Completion Notes List

- Middleware table-context.js remplacé : stub → implémentation complète avec résolution X-Table-Id, vérification membership, injection `req.table = { id, role }`
- Endpoint `GET /api/game_tables/active` ajouté avant `GET /` dans routes/tables.js — retourne nom + rôle + is_mj de la table active
- Composant `table-selector.js` créé : getActiveTableId(), setActiveTable(), clearActiveTable(), fetchWithTable() wrapper, renderTableSelector()
- Composant `header.js` créé : affiche nom de table active + rôle + bouton changement + déconnexion, appel GET /active au chargement
- Dashboard.js modifié : vérifie table sélectionnée → valide via GET /active → fallback sélecteur si invalide
- index.html mis à jour avec nouveau header partagé
- 7 tests unitaires table-context (sans header, membre, non-membre, table inexistante, sans user)
- 10 tests intégration table-context (GET /active valide, sans header, non-membre, injection middleware, non-régression)
- Code review : 2 patches appliqués (dashboard.js catch réseau + header.js clearActiveTable sur data null), 3 items différés

### Change Log

- 2026-04-20 : Story 1.5 implémentée — middleware table-context, composants sélecteur/header, intégration dashboard, 17 tests

### File List

**Created:**
- `public/js/shared/table-selector.js`
- `public/js/shared/header.js`
- `tests/unit/table-context.test.js`
- `tests/integration/table-context.test.js`

**Modified:**
- `src/middleware/table-context.js` — stub remplacé par implémentation complète
- `src/routes/tables.js` — ajout GET /active avant GET /
- `public/js/dashboard.js` — intégration sélecteur + validation table active
- `public/index.html` — mise à jour header partagé
- `tests/setup.js` — extension httpRequest avec support headers
- `package.json` — ajout fichiers test table-context
