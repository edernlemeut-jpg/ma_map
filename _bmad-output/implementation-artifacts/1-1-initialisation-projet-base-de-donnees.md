# Story 1.1 : Initialisation projet & base de données

Status: review

## Story

As a developer,
I want the project skeleton with Express server, SQLite database, migration/seed scripts, and standardized API contracts,
So that all future stories have a working foundation to build upon.

## Acceptance Criteria (BDD)

1. **Given** le dépôt est vide **When** `npm install && npm run migrate && npm run seed` sont exécutés **Then** le serveur démarre sur le port configuré (défaut 3000), la DB `db/ma.db` existe en WAL mode
2. **And** les tables initiales sont créées : users, game_tables, table_members, systems, factions, ship_models, ships, peril_data, custom_peril_tables, peril_assignments, trip_history, table_state, visibility_rules, table_visibility_overrides, npcs, notes
3. **And** le script migrate.js est idempotent (re-run safe) via `PRAGMA user_version`
4. **And** les données de `quadrants_MA.json`, `donnee_base/galactic_events.json`, `perils_data.json` sont importées via seed.js
5. **And** `.env.example` documente les variables requises : DB_PATH, JWT_SECRET, PORT, NODE_ENV
6. **And** le Dockerfile produit une image fonctionnelle (Node 22-alpine, volume ./db)
7. **And** Helmet est monté avec X-Frame-Options et CSP basique
8. **And** express.static sert `public/`, express.json() et cookie-parser sont montés
9. **And** les slots middleware pour auth et tableContext sont en place (pass-through initiaux)
10. **And** le pipeline respecte l'ordre : express.static → json → cookie → helmet → auth → tableContext → routes → errorHandler
11. **And** un helper de réponse API standardisé existe (`src/utils/response.js`)
12. **And** une route `GET /api/health` retourne `{ "data": { "status": "ok" } }` et utilise le helper
13. **And** Tailwind CLI compile `public/css/tailwind.css` via `npm run build:css`
14. **And** `node --test tests/` passe avec au moins un test smoke vérifiant le health check et le schéma DB

## Tasks / Subtasks

- [x] **Task 1 : Réstructuration projet** (AC: #1, #5, #8, #10)
  - [x] 1.1 Convertir `package.json` en ES modules (`"type": "module"`, version 2.0.0)
  - [x] 1.2 Ajouter dependencies : `helmet`
  - [x] 1.3 Ajouter devDependencies : `nodemon`, `tailwindcss`, `@playwright/test`
  - [x] 1.4 Ajouter scripts : `dev`, `build:css`, `build:css:watch`, `test`, `test:e2e`, `migrate`
  - [x] 1.5 Créer `.env.example` avec DB_PATH, JWT_SECRET, PORT, NODE_ENV
  - [x] 1.6 Créer `.gitignore` : db/*.db, node_modules/, .env, public/css/tailwind.css, coverage/
  - [x] 1.7 Créer la structure de dossiers : src/{config,middleware,routes,services,utils}, public/{css,js/shared}, scripts/, tests/{unit,integration,e2e}, db/
  - [x] 1.8 Créer `src/config/index.js` (lecture dotenv + export PORT, JWT_SECRET, DB_PATH, NODE_ENV)

- [x] **Task 2 : Base de données & migrations** (AC: #1, #2, #3)
  - [x] 2.1 Créer `src/database.js` : instance better-sqlite3, WAL mode, PRAGMA foreign_keys = ON
  - [x] 2.2 Créer `scripts/migrate.js` : schema version via PRAGMA user_version, idempotent
  - [x] 2.3 Migration v1 : créer les 16 tables (voir section Dev Notes pour schéma complet)

- [x] **Task 3 : Seed** (AC: #4)
  - [x] 3.1 Créer `scripts/seed.js` : import quadrants_MA.json → systems + factions
  - [x] 3.2 Import perils_data.json → peril_data
  - [x] 3.3 Import donnee_base/galactic_events.json (si applicable)
  - [x] 3.4 Idempotence : skip si données déjà présentes (`SELECT COUNT(*)`)
  - [x] 3.5 Transactions pour bulk inserts

- [x] **Task 4 : Serveur Express** (AC: #7, #8, #9, #10, #11, #12)
  - [x] 4.1 Créer `server.js` : import express, mount middleware pipeline
  - [x] 4.2 Créer `src/middleware/index.js` : exporte le pipeline ordonné
  - [x] 4.3 Créer `src/middleware/auth.js` : stub pass-through (next())
  - [x] 4.4 Créer `src/middleware/table-context.js` : stub pass-through (next())
  - [x] 4.5 Créer `src/utils/response.js` : helpers success(), error(), notFound()
  - [x] 4.6 Créer health route : GET /api/health → { data: { status: "ok" } }
  - [x] 4.7 Créer error handler middleware global

- [x] **Task 5 : Tailwind** (AC: #13)
  - [x] 5.1 Créer `tailwind.config.js` (content: ['./public/**/*.html'])
  - [x] 5.2 Créer `public/css/input.css` (@tailwind base/components/utilities)
  - [x] 5.3 Vérifier `npm run build:css` génère public/css/tailwind.css

- [x] **Task 6 : Docker** (AC: #6)
  - [x] 6.1 Créer Dockerfile : Node 22-alpine, npm ci --production, tailwind build, EXPOSE 3000
  - [x] 6.2 Créer docker-compose.yml avec volume db/ et restart policy

- [x] **Task 7 : Tests** (AC: #14)
  - [x] 7.1 Créer `tests/setup.js` : DB :memory:, helpers
  - [x] 7.2 Créer test smoke : GET /api/health → 200 + correct format
  - [x] 7.3 Créer test schema : vérifier les 16 tables existent dans la DB
  - [x] 7.4 Vérifier `npm test` passe

## Dev Notes

### État actuel du projet (brownfield)

Le projet a déjà :
- `package.json` (CommonJS, v1.0.0) — **doit être converti en ES modules**
- `server.js` (legacy) — **doit être réécrit from scratch**
- `seed.js` (racine, CommonJS) — **doit être déplacé dans scripts/ et converti en ESM**
- `perils_data.json` et `quadrants_MA.json` en racine — gardés comme source de seed
- `donnee_base/galactic_events.json` — source de seed (⚠️ pas en racine !)
- `style.css` — legacy, sera remplacé par Tailwind
- Plusieurs .html legacy en racine — NE PAS TOUCHER (décommissionnés dans Epic 6)

### Schéma DB complet (16 tables)

```sql
-- users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_username ON users(username);

-- game_tables (⚠️ NOM "game_tables" pas "tables" — mot réservé SQL)
CREATE TABLE game_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mj_id INTEGER NOT NULL REFERENCES users(id),
  session_active INTEGER NOT NULL DEFAULT 0,
  session_last_activity TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- table_members
CREATE TABLE table_members (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'joueur' CHECK(role IN ('mj','joueur')),
  PRIMARY KEY(table_id, user_id)
);
CREATE INDEX idx_table_members_table ON table_members(table_id);

-- systems (seedée depuis quadrants_MA.json)
CREATE TABLE systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quadrant TEXT NOT NULL,
  nom TEXT NOT NULL,
  faction TEXT DEFAULT '',
  is_frontiere INTEGER DEFAULT 0,
  route TEXT DEFAULT '',
  gouvernement TEXT DEFAULT '',
  description TEXT DEFAULT '',
  soleil_json TEXT DEFAULT '{}',
  corps_celestes_json TEXT DEFAULT '[]',
  patrouilles_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(quadrant, nom)
);
CREATE INDEX idx_systems_nom ON systems(nom);

-- factions (seedée/extraite)
CREATE TABLE factions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  short TEXT DEFAULT '',
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  color TEXT DEFAULT '#888888',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_factions_name ON factions(name);

-- ship_models (seedée)
CREATE TABLE ship_models (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  classe TEXT DEFAULT '',
  vitesse_croisiere REAL DEFAULT 0,
  vitesse_hyperspatiale REAL DEFAULT 0,
  autonomie REAL DEFAULT 0,
  manoeuvrabilite TEXT DEFAULT '',
  vitesse_tactique TEXT DEFAULT '',
  blindage INTEGER DEFAULT 0,
  coque INTEGER DEFAULT 0,
  senseurs TEXT DEFAULT '',
  equipage TEXT DEFAULT '',
  passagers TEXT DEFAULT '',
  soute REAL DEFAULT 0,
  prix REAL DEFAULT 0,
  origine TEXT DEFAULT '',
  image TEXT DEFAULT '',
  armement_json TEXT DEFAULT '[]',
  systemes_secondaires_json TEXT DEFAULT '[]'
);

-- ships (instances par table)
CREATE TABLE ships (
  id TEXT PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  model_id TEXT REFERENCES ship_models(id),
  hull INTEGER DEFAULT 0,
  crew INTEGER DEFAULT 0,
  cargo_capacity REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- peril_data
CREATE TABLE peril_data (
  type TEXT PRIMARY KEY,
  data_json TEXT NOT NULL
);

-- custom_peril_tables
CREATE TABLE custom_peril_tables (
  id TEXT PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL
);

-- peril_assignments
CREATE TABLE peril_assignments (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  assign_type TEXT NOT NULL,
  key TEXT NOT NULL,
  peril_table_id TEXT DEFAULT '',
  PRIMARY KEY(table_id, assign_type, key)
);

-- trip_history
CREATE TABLE trip_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  ship_name TEXT DEFAULT '',
  data_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- table_state
CREATE TABLE table_state (
  table_id INTEGER PRIMARY KEY REFERENCES game_tables(id) ON DELETE CASCADE,
  active_ship_id TEXT DEFAULT '',
  sync_version INTEGER NOT NULL DEFAULT 0
);

-- visibility_rules
CREATE TABLE visibility_rules (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(table_id, entity_type, entity_id)
);

-- table_visibility_overrides
CREATE TABLE table_visibility_overrides (
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(table_id, entity_type, entity_id)
);

-- npcs
CREATE TABLE npcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  data_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- notes
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Pipeline middleware — ordre exact dans server.js

```javascript
// 1. Static (pas d'auth nécessaire)
app.use(express.static('public'));
// 2. Body parser
app.use(express.json());
// 3. Cookie parser
app.use(cookieParser());
// 4. Security headers
app.use(helmet({ /* CSP basique */ }));
// 5. Auth (stub pass-through pour 1.1)
app.use(authMiddleware);
// 6. Table context (stub pass-through pour 1.1)
app.use(tableContextMiddleware);
// 7. Routes
app.use('/api', routes);
// 8. Error handler (global, dernier)
app.use(errorHandler);
```

### src/utils/response.js — Contrat API

```javascript
// Succès
export function success(res, data, status = 200) {
  res.status(status).json({ data });
}

// Erreur
export function error(res, { code, message, status = 500 }) {
  res.status(status).json({ error: { code, message, status } });
}

// Codes erreur standards
// 400 VALIDATION_ERROR | 401 AUTH_REQUIRED | 403 FORBIDDEN
// 404 NOT_FOUND | 409 CONFLICT | 500 INTERNAL_ERROR
```

### src/config/index.js — Pattern

```javascript
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') dotenv.config();

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET;
export const DB_PATH = process.env.DB_PATH || './db/ma.db';
export const NODE_ENV = process.env.NODE_ENV || 'development';
```

> **RÈGLE : Aucun fichier ne doit lire `process.env` directement — toujours importer depuis `src/config/index.js`.**

### Données de seed — fichiers sources

| Fichier | Localisation | Table(s) cible |
|---|---|---|
| `quadrants_MA.json` | racine | systems, factions (extraites) |
| `perils_data.json` | racine | peril_data |
| `donnee_base/galactic_events.json` | donnee_base/ | (événements — vérifier structure) |

⚠️ `galactic_events.json` est dans `donnee_base/`, pas en racine. Le story AC original disait racine — c'est faux.

### .gitignore

```
node_modules/
db/*.db
.env
public/css/tailwind.css
coverage/
```

### Delta par rapport à l'état actuel

| Aspect | Actuel | Cible |
|---|---|---|
| Module system | CommonJS | ES modules (`"type": "module"`) |
| Static serving | `express.static(__dirname)` (TOUT!) | `express.static('public')` (sûr) |
| users.role | TEXT CHECK('mj','joueur') | `is_admin INTEGER` (rôle par table dans table_members) |
| visibility_rules | entity_key, pas de `visible` | entity_id + visible INTEGER |
| Security headers | Aucun | Helmet |
| Tests | Aucun | node --test + smoke |
| Tailwind | Non configuré | CLI local |
| Docker | Aucun | Dockerfile + compose |

### Fichiers legacy à NE PAS TOUCHER

- `compendium.html`, `carte_interactive.html`, `itineraire.html`, `peril.html`, `personnage.html`, `revolte.html`, `calendrier.html`, `index.html` (ancien hub)
- `style.css` (ancien)
- `Classeur1.xlsm`
- `donnee_base/` (dossier legacy)

Ces fichiers seront décommissionnés dans l'Epic 6. Ne pas les supprimer, ne pas les modifier.

### Project Structure Notes

La structure cible pour cette story :

```
MA/
├── server.js                    # NOUVEAU — Express entry point
├── package.json                 # MODIFIÉ — ESM, scripts, deps
├── .env.example                 # NOUVEAU
├── .gitignore                   # NOUVEAU
├── Dockerfile                   # NOUVEAU
├── docker-compose.yml           # NOUVEAU
├── tailwind.config.js           # NOUVEAU
├── db/                          # NOUVEAU dossier
│   └── (ma.db créé au migrate)
├── src/
│   ├── config/index.js          # NOUVEAU
│   ├── database.js              # NOUVEAU
│   ├── middleware/
│   │   ├── index.js             # NOUVEAU
│   │   ├── auth.js              # NOUVEAU (stub)
│   │   └── table-context.js     # NOUVEAU (stub)
│   ├── routes/                  # NOUVEAU dossier
│   ├── services/                # NOUVEAU dossier
│   └── utils/
│       └── response.js          # NOUVEAU
├── public/
│   ├── css/
│   │   ├── input.css            # NOUVEAU
│   │   └── tailwind.css         # GÉNÉRÉ
│   └── js/shared/               # NOUVEAU dossier vide
├── scripts/
│   ├── migrate.js               # NOUVEAU
│   └── seed.js                  # MIGRÉ depuis racine (ESM)
├── tests/
│   ├── setup.js                 # NOUVEAU
│   ├── unit/                    # NOUVEAU dossier
│   ├── integration/
│   │   └── health.test.js       # NOUVEAU
│   └── e2e/                     # NOUVEAU dossier
└── [fichiers legacy non touchés]
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2a: Project layout]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2b: Middleware pipeline]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 3: Database schema]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 4: API conventions]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1-FR8, NFR6-NFR10, NFR15-NFR16]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Completion Notes List

- Converted project from CommonJS to ES modules (type: module in package.json)
- Legacy `src/database.js` backed up to `src/database.js.bak`, rewritten as clean ESM connection-only module
- Migration script uses `PRAGMA user_version` for idempotence — verified with re-runs
- Seed imports 27 systems, 6 factions, 2 peril types from JSON sources — idempotent via COUNT check
- `galactic_events.json` logged but not stored in DB yet (no dedicated table — will be used by calendar feature)
- Middleware pipeline follows exact specified order: static → json → cookie → helmet → auth → tableContext → routes → errorHandler
- Helmet configured with basic CSP (self-only, unsafe-inline for styles)
- Health endpoint returns `{ data: { status: "ok" } }` via standardized response helper
- 5 tests passing: 1 integration (health endpoint), 4 unit (schema validation)
- Tailwind CLI generates `public/css/tailwind.css` from `public/css/input.css`
- Docker files created (not tested locally — requires Docker runtime)
- Test script uses explicit file paths (Windows compatibility — glob patterns don't expand in npm scripts on Windows)

### Change Log

- 2025-07-17: Story 1.1 implemented — all 7 tasks, 22 subtasks complete

### File List

**New files:**
- `.env.example`
- `.gitignore`
- `Dockerfile`
- `docker-compose.yml`
- `tailwind.config.js`
- `src/config/index.js`
- `src/middleware/index.js`
- `src/middleware/auth.js`
- `src/middleware/table-context.js`
- `src/middleware/error-handler.js`
- `src/routes/health.js`
- `src/utils/response.js`
- `scripts/migrate.js`
- `scripts/seed.js`
- `public/css/input.css`
- `tests/setup.js`
- `tests/unit/schema.test.js`
- `tests/integration/health.test.js`

**Modified files:**
- `package.json` (ESM, v2.0.0, new scripts/deps)
- `server.js` (complete rewrite — ESM, new middleware pipeline)
- `src/database.js` (rewritten — connection-only ESM module)
- `.env` (added DB_PATH, NODE_ENV)

**Backup files (temporary):**
- `src/database.js.bak` (legacy CJS version)
