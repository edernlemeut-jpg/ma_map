# Story 1.4 : Gestion des tables de jeu & invitation

Status: done

## Story

As a MJ,
I want to create a game table and invite players by sharing a simple code,
So that my group can join and start playing together.

## Acceptance Criteria (BDD)

1. **Given** je suis connecté en tant que MJ **When** je crée une table avec un nom **Then** elle est persistée et je suis automatiquement membre avec le rôle `mj` **And** un code d'invitation unique (6 chars alphanumériques, lisible dans le noir sur mobile) est généré pour cette table
2. **Given** je suis un joueur et j'ai reçu un code d'invitation **When** je saisis le code sur la page de rejoindre une table **Then** je deviens membre de cette table avec le rôle `joueur` **And** si le code est invalide, un message d'erreur clair s'affiche
3. **Given** je suis admin **When** je modifie le rôle d'un membre d'une table **Then** il devient MJ ou joueur selon mon choix **And** le MJ créateur d'une table ne peut pas être retiré
4. **And** les routes `src/routes/tables.js` exposent : POST (create), GET (list mine), POST /:id/join, PATCH /:id/members/:userId
5. **And** un joueur ne peut pas accéder aux tables dont il n'est pas membre (403)
6. **And** toutes les réponses utilisent le helper de réponse API standardisé

Couvre : FR4, FR5, FR6

## Tasks / Subtasks

- [x] **Task 1 : Migration DB — ajouter invite_code** (AC: #1)
  - [x] 1.1 Ajouter migration v2 dans `scripts/migrate.js` : `ALTER TABLE game_tables ADD COLUMN invite_code TEXT UNIQUE`
  - [x] 1.2 Incrémenter `SCHEMA_VERSION` à 2
  - [x] 1.3 Mettre à jour `tests/unit/schema.test.js` pour vérifier la colonne invite_code

- [x] **Task 2 : Service tables — logique métier** (AC: #1, #2, #3)
  - [x] 2.1 Créer `src/services/tables.js`
  - [x] 2.2 Fonction `generateInviteCode()` — 6 chars parmi `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, retry si collision UNIQUE

- [x] **Task 3 : Routes tables — endpoints API** (AC: #1-#6)
  - [x] 3.1 Étendre `src/routes/tables.js` avec POST, GET, POST /:id/join, PATCH /:id/members/:userId
  - [x] 3.2 POST / requiert un nom non-vide (validation 400)
  - [x] 3.3 POST /:id/join requiert invite_code non-vide (validation 400)
  - [x] 3.4 PATCH /:id/members/:userId requiert role valide et admin (403 sinon)
  - [x] 3.5 Toutes les réponses utilisent les helpers de `src/utils/response.js`

- [x] **Task 4 : Tests unitaires service** (AC: #1, #2, #3)
  - [x] 4.1 Créer `tests/unit/tables-service.test.js` (12 tests)

- [x] **Task 5 : Tests intégration routes** (AC: #1-#6)
  - [x] 5.1 Étendre `tests/integration/tables.test.js` (12 tests)

- [x] **Task 6 : Exécuter migration et valider** (AC: all)
  - [x] 6.1 Exécuter `node scripts/migrate.js` pour appliquer la v2
  - [x] 6.2 Mettre à jour le script test dans package.json (ajouter tables-service.test.js)

## Dev Notes

### Architecture — ce que fait cette story

C'est la story la plus substantielle de l'Epic 1. Elle ajoute la gestion complète des tables de jeu : création, invitation par code, et gestion des rôles. C'est le **cœur du multi-table** de l'application.

### Schéma DB existant — game_tables

```sql
CREATE TABLE IF NOT EXISTS game_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mj_id INTEGER NOT NULL REFERENCES users(id),
  session_active INTEGER NOT NULL DEFAULT 0,
  session_last_activity TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Colonne manquante** : `invite_code TEXT UNIQUE` — à ajouter via migration v2.

### Schéma DB existant — table_members

```sql
CREATE TABLE IF NOT EXISTS table_members (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'joueur' CHECK(role IN ('mj','joueur')),
  PRIMARY KEY(table_id, user_id)
);
```

### Pattern migration v2

```javascript
function migrateV2() {
  console.log('🔧 Applying migration v2...');
  db.exec(`ALTER TABLE game_tables ADD COLUMN invite_code TEXT UNIQUE`);
}
```
Et dans migrate() : `if (currentVersion < 2) migrateV2();`

### Pattern invite_code

- 6 caractères uppercase alphanumériques **sans ambigüité** : charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (exclut 0/O, 1/I/L)
- Généré aléatoirement, retry si collision UNIQUE sur INSERT
- `crypto.randomInt()` pour génération sécurisée

### Pattern service — cohérent avec auth.js

```javascript
// src/services/tables.js
import db from '../database.js';
import { randomInt } from 'node:crypto';

const INVITE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_LENGTH = 6;

export function generateInviteCode() {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_CHARSET[randomInt(INVITE_CHARSET.length)];
  }
  return code;
}
```

### Pattern routes — cohérent avec auth.js

```javascript
// src/routes/tables.js — extend existing file
import { Router } from 'express';
import { success, validationError, notFound, forbidden, error } from '../utils/response.js';
import * as tablesService from '../services/tables.js';

router.post('/', (req, res) => { ... });
router.get('/', (req, res) => { ... });
router.post('/:id/join', (req, res) => { ... });
router.patch('/:id/members/:userId', (req, res) => { ... });
```

### Règles métier importantes

1. **Tout utilisateur connecté peut créer une table** — il devient automatiquement MJ de cette table
2. **Le code d'invitation est visible uniquement par le MJ** de la table (pas les joueurs)
3. **Admin peut changer les rôles** dans n'importe quelle table (PATCH)
4. **Le MJ créateur (mj_id) ne peut pas être retiré** ni avoir son rôle changé
5. **Un joueur ne rejoint que par invite_code** — pas d'accès direct par table_id
6. **Doublon membership → 409 CONFLICT** (déjà membre)

### Fichiers existants à NE PAS TOUCHER

- `src/middleware/auth.js` — pas de nouvelles routes whitelistées
- `src/middleware/table-context.js` — reste stub (sera implémenté dans une future story)
- `src/services/auth.js`, `src/routes/auth.js`
- `src/database.js`
- Legacy HTML en racine
- `public/index.html`, `public/js/dashboard.js`, `public/js/onboarding.js` — story 1.3, pas de changement

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `scripts/migrate.js` | **MODIFIER** — ajouter migrateV2 + SCHEMA_VERSION=2 |
| `src/services/tables.js` | **CRÉER** — logique métier tables |
| `src/routes/tables.js` | **MODIFIER** — ajouter POST, GET, POST /:id/join, PATCH |
| `tests/unit/schema.test.js` | **MODIFIER** — test colonne invite_code |
| `tests/unit/tables-service.test.js` | **CRÉER** — tests service |
| `tests/integration/tables.test.js` | **MODIFIER** — étendre avec nouveaux tests |
| `package.json` | **MODIFIER** — ajouter tables-service.test.js au script test |

### Learnings Stories précédentes

- **ESM modules** : tout le projet est `"type": "module"`, pas de require()
- **Tests** : `node --test` avec chemins explicites (pas de globs sur Windows)
- **Config** : tout passe par `src/config/index.js`, jamais `process.env` directement
- **Response helpers** : `src/utils/response.js` — success(), error(), validationError(), forbidden(), notFound(), authRequired()
- **httpRequest helper** dans `tests/setup.js` pour tests intégration HTTP
- **createTestApp** dans `tests/setup.js` inclut health + auth + tables routes
- **server.js** : `isMainModule` guard
- **Colonnes BigInt** : caster `Number(lastInsertRowid)` pour better-sqlite3
- **UNIQUE constraint** : toujours protéger avec try/catch en defense-in-depth
- **Nettoyage tests** : utiliser TEST_PREFIX + before/after cleanup
- **Schéma real DB** : `mj_id` (pas `created_by`)

### Project Structure Notes

```
src/
├── services/tables.js   ← CRUD tables + invite code (nouveau)
├── routes/tables.js     ← GET /count + POST + GET + POST /:id/join + PATCH (modifié)
scripts/
├── migrate.js           ← migration v2 invite_code (modifié)
tests/
├── unit/tables-service.test.js    ← tests service (nouveau)
├── unit/schema.test.js            ← test invite_code column (modifié)
├── integration/tables.test.js     ← tests routes étendus (modifié)
```

### Review Findings

- [x] [Review][Patch] String matching fragile pour détection UNIQUE constraint — `err.message.includes('UNIQUE')` → `err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'` [src/services/tables.js:joinTable] — **CORRIGÉ**
- [x] [Review][Defer] Migration sans error handling — pattern pré-existant v1, `PRAGMA user_version` empêche ré-exécution — deferred
- [x] [Review][Defer] Generic error swallowing dans routes — infrastructure logging story future — deferred
- [x] [Review][Defer] Regex extraction dans schema tests — pattern pré-existant story 1.1 — deferred
- [x] [Review][Defer] DB dir permissions — pré-existant, pas cette story — deferred
- [x] [Review][Defer] verifyToken null sub — pré-existant, pas cette story — deferred

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1 : Migration v2 — ALTER TABLE + CREATE UNIQUE INDEX (SQLite ne supporte pas ADD COLUMN UNIQUE directement). Schema test mis à jour pour extraire tous les db.exec() du fichier migrate.js.
- Task 2 : Service tables.js créé — createTable (transaction table+member), generateInviteCode (charset sans ambigüité, crypto.randomInt), joinTable (case-insensitive, défense-in-depth UNIQUE), updateMemberRole (admin-only, protection MJ créateur).
- Task 3 : Routes étendues — POST /, GET /, POST /:id/join, PATCH /:id/members/:userId. Toutes les réponses via helpers standardisés.
- Task 4 : 12 tests unitaires service (generateInviteCode, createTable, joinTable, updateMemberRole + cas d'erreur).
- Task 5 : 12 tests intégration routes (create, list, join, role update, auth, erreurs, non-régression count).
- Task 6 : Migration v2 appliquée, package.json mis à jour.
- 55/55 tests passent (33 existants + 22 nouveaux).

### Change Log
- 2026-04-20 : Story 1.4 implémentée — gestion complète des tables de jeu

### File List
- `scripts/migrate.js` — MODIFIÉ (SCHEMA_VERSION=2, migrateV2 pour invite_code)
- `src/services/tables.js` — CRÉÉ (createTable, listUserTables, joinTable, updateMemberRole, generateInviteCode)
- `src/routes/tables.js` — MODIFIÉ (POST, GET, POST /:id/join, PATCH /:id/members/:userId)
- `tests/unit/schema.test.js` — MODIFIÉ (extractAll db.exec, test invite_code)
- `tests/unit/tables-service.test.js` — CRÉÉ (12 tests)
- `tests/integration/tables.test.js` — MODIFIÉ (12 tests, 3 users)
- `package.json` — MODIFIÉ (ajout tables-service.test.js)
