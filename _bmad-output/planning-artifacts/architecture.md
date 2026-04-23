---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/project-context.md', 'docs/index.md', 'docs/project-overview.md', 'docs/architecture.md', 'docs/source-tree-analysis.md']
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-04-20'
project_name: 'Metal Adventures'
user_name: 'Crepe'
date: '2026-04-20'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 39 FRs en 9 domaines — gestion utilisateurs (4), tables de jeu (4), visibilité/révélation (6), compendium (4), carte interactive (5), dashboard MJ (4), itinéraire (4), migration/import (2), synchronisation (4), onboarding (2).

**Non-Functional Requirements:** 17 NFRs — performance (5), sécurité (5), fiabilité (4), maintenabilité (3). Les NFRs de sécurité (protect-by-default serveur, JWT httpOnly, bcrypt, validation rôle+table) et de performance (FMP < 2s, action MJ < 3s, polling < 500ms) sont les plus structurants pour l'architecture.

**Scale & Complexity:**

- Domaine principal : Full-stack web (MPA + REST API)
- Complexité : Medium (risque exécution élevé : solo dev, migration brownfield 160K)
- Utilisateurs simultanés : 5 max (1 MJ + 4 joueurs)
- Volume de données : ~200 entités, quelques Ko par poll
- Temps réel : Polling full-state 3-5s (pas de WebSocket)

### Technical Constraints & Dependencies

- **Brownfield → migration** : monolithe itineraire.html (160K, inline JS, localStorage) à restructurer en 5 phases
- **Hébergement** : NAS personnel Docker + DuckDNS, HTTPS Let's Encrypt
- **Stack cible** : Node.js, Express, SQLite (better-sqlite3), vanilla JS ES modules, Tailwind CLI local
- **Zéro framework front** : pas de React/Vue — vanilla JS uniquement
- **Navigateurs** : modernes uniquement (2 dernières versions)
- **Rupture brownfield** : 6 anti-patterns du project-context explicitement invalidés par le PRD (inline JS → ES modules, Tailwind CDN → local, pas de serveur → Express, localStorage → SQLite API, etc.)
- **Filet de sécurité** : pages existantes fonctionnelles pendant toute la migration

### Cross-Cutting Concerns

1. **Auth & autorisation** — Middleware global, JWT cookies, protect-by-default. Affecte chaque route.
2. **Système de visibilité** — Filtrage serveur whitelist + cascade descendante. Affecte chaque endpoint de données. Middleware dédié (pas dans les contrôleurs, jamais côté client). C'est la contrainte pervasive #1 — chaque query de données est filtrée.
3. **Contexte de table** — Toute donnée est scopée par table active. Affecte chaque requête.
4. **Polling/synchronisation** — Endpoint dédié, indicateur connexion, resync automatique. Affecte toutes les pages joueur. Contrainte mobile : réduire le rythme quand l'app est en arrière-plan (batterie).
5. **Couche partagée js/shared** — Auth-ui, header, fetch-client, table-selector, poller. Extraction du monolithe.
6. **Migration progressive** — Strangler Fig, chaque phase = état viable, backup avant chaque phase.
7. **Hiérarchie de tests** — Unit (logique visibilité isolée) → Integration (API + auth + visibilité) → E2E (Playwright, flux complets). À définir dans l'architecture.

### Architectural Constraints (Party Mode Insights)

**SQLite concurrency :**
- better-sqlite3 est synchrone, single-writer. Avec 5 utilisateurs max et polling 3-5s, la contention est faible mais documentée.
- WAL mode obligatoire pour lectures concurrentes sans bloquer les écritures.
- Stratégie de retry avec backoff (SQLITE_BUSY) à implémenter côté serveur.

**Visibilité = middleware serveur dédié :**
- La logique de visibilité ne vit ni dans les contrôleurs ni côté client. C'est un middleware/service dédié qui filtre les réponses API.
- Plausible deniability : le serveur ne retourne jamais de données cachées, même partielles. Le client ne sait pas ce qu'il ne voit pas.
- La matrice de visibilité formelle (qui voit quoi, selon quel rôle, à quel moment) sera définie dans les décisions d'architecture.

**Mobile = contexte hostile :**
- Joueurs en séance sur téléphone, lumière tamisée, écran 5-6 pouces.
- Polling impacte la batterie — l'architecture doit supporter une réduction d'intervalle (ou pause) quand l'app est en arrière-plan.
- Feedback immédiat obligatoire : optimistic UI côté MJ = retour visuel instantané avant confirmation serveur.

**WebSocket :**
- Non-goal pour PRD#1. L'architecture ne doit pas bloquer une migration future vers WebSocket, mais ne doit pas la préparer activement (YAGNI).

## Starter Template Evaluation

### Primary Technology Domain

Backend Express + front MPA vanilla JS. Aucun framework front-end.

### Starters évalués et rejetés

| Starter | Verdict | Raison |
|---|---|---|
| `express-generator` | ❌ Rejeté | Abandonné (v4.16.1, publié 2019), structure obsolète, views server-side, pas d'ES modules |
| `create-next-app` / Vite / SvelteKit | ❌ Hors scope | Frameworks front — le PRD impose vanilla JS |
| `create-t3-app` / RedwoodJS | ❌ Hors scope | Full-stack opinionated, TypeScript, ORM |
| Starters Express custom GitHub | ⚠️ Rejetés | Imposent des opinions à défaire (ORM, TypeScript, view engine) — overhead négatif |

### Décision : Custom structure (pas de starter)

**Rationale :**
1. **Brownfield** — le code existe, on restructure, pas de greenfield
2. **Stack très spécifique** — Express + better-sqlite3 + vanilla JS ES modules + Tailwind CLI. Aucun starter ne combine ça
3. **Structure dictée par le PRD** — `js/shared/*`, pages MPA autonomes, REST API avec middleware visibilité
4. **Overhead négatif** — un starter imposerait des choix à démonter plutôt qu'à garder

### Project Structure

```
MA/
├── server.js                    # Express entry point
├── package.json                 # "type": "module", scripts test/dev
├── .env.example                 # Variables d'environnement documentées
├── .gitignore                   # db/*.db, node_modules/, .env, coverage/
├── Dockerfile
├── tailwind.config.js
├── db/
│   └── ma.db                    # SQLite database (gitignored en prod)
├── src/
│   ├── config/                  # Env vars, constants, logger
│   │   └── index.js
│   ├── routes/                  # Express route handlers
│   ├── middleware/               # Auth, visibility, table-context
│   │   └── index.js             # Ordre middleware centralisé
│   ├── services/                 # Business logic (visibility cascade, etc.)
│   └── database.js              # better-sqlite3 + WAL mode + migrations
├── public/                      # Static files served by Express
│   ├── index.html               # Hub page
│   ├── compendium.html
│   ├── carte.html
│   ├── dashboard.html
│   ├── itineraire.html
│   ├── js/
│   │   └── shared/              # ES modules client (auth-ui, header, fetch-client, poller, table-selector)
│   └── css/
│       └── tailwind.css         # Compiled Tailwind output
├── scripts/
│   └── migrate.js               # DB seed + migration runner
└── tests/
    ├── setup.js                 # Test DB isolation, fixtures, teardown
    ├── unit/                    # Visibility logic, services
    ├── integration/             # API + auth + visibility
    └── e2e/                     # Playwright
```

### Architectural Decisions Established

| Décision | Choix | Rationale |
|---|---|---|
| **Langage** | JavaScript (pas TypeScript) | Cohérent compétences existantes + PRD. Pas de build step supplémentaire. |
| **Modules** | ES modules (`"type": "module"` dans package.json) | Rupture assumée avec le brownfield inline. Import/export natif navigateur + Node. |
| **Styling** | Tailwind CLI → `css/tailwind.css` commité | Zéro CDN, zéro dépendance internet en runtime. Build local. |
| **Test runner** | `node --test` (natif Node.js) | Zéro dépendance test, ES modules natif, suffisant pour solo dev. |
| **E2E** | Playwright | Mentionné dans le PRD pour smoke tests. |
| **Organisation** | `src/` (serveur) + `public/` (client) + `tests/` | Séparation claire backend/frontend/tests. |
| **DB migrations** | `pragma user_version` + scripts idempotents | NFR16, versionné, rollback possible. |
| **Dev workflow** | Nodemon pour hot reload serveur | Productivité solo dev. |
| **Config** | `src/config/` + `.env` | Variables centralisées, secrets hors du repo. |
| **SQLite** | WAL mode activé dans `database.js` | Lectures concurrentes sans bloquer les écritures (5 users). |

**Note :** La première story d'implémentation sera l'initialisation de cette structure (npm init, package.json, server.js minimal, Dockerfile).

## Core Architectural Decisions

### Decision Priority Analysis

**Décisions critiques (bloquent l'implémentation) :**

1. Hiérarchie d'entités & modèle de visibilité (univers vs campagne)
2. JWT auth en cookies httpOnly, rôle par table résolu à chaque requête
3. Ordre du pipeline middleware (auth → table context → routes)
4. Protect-by-default (whitelist, pas blacklist)
5. Conventions REST API & format d'erreur uniforme

**Décisions importantes (structurent l'architecture) :**

6. Validation manuelle + contraintes SQLite (pas de Joi/Zod)
7. Pas de cache applicatif (SQLite WAL suffisant)
8. Polling avec réduction en arrière-plan (batterie mobile)
9. State management vanilla JS (modules ES isolés)
10. Docker single-container avec volume SQLite

**Décisions différées (post-MVP) :**

- WebSocket (non-goal PRD#1, architecture ne bloque pas)
- Rate limiting (5 utilisateurs connus, réseau privé)
- CI/CD pipeline (déploiement manuel Docker pour l'instant)
- Monitoring avancé (console.log structuré suffit)

---

### Catégorie 1 : Data Architecture

#### 1a. Hiérarchie d'entités & modèle de visibilité

**Données univers** (partagées entre tables) :

| Entité | Visibilité par défaut | Contrôle | Mécanisme |
|---|---|---|---|
| `factions` | Visible | MJ peut cacher (ex: Daemon) | `table_visibility_overrides` par table |
| `ship_models` | Caché | MJ révèle au cas par cas | `table_visibility_overrides` par table |

**Données campagne** (scopées par table) :

| Entité | Visibilité par défaut | Cascade | Contrôle |
|---|---|---|---|
| `systems` | Caché | Oui → enfants | `visibility_rules` direct |
| `planets`, `stations`, `points_of_interest` | Caché | Hérite du parent si caché | `visibility_rules` direct |
| `ships` (instances joueur/PNJ) | Caché | Non | `visibility_rules` direct |
| `npcs` | Caché | Non | `visibility_rules` direct |
| `notes` | MJ uniquement | N/A | Jamais exposé via API joueur |

**Cascade descendante :** Si un système est caché → tous ses enfants (planètes, stations, POI) sont cachés. Si un système est visible → seule sa position est montrée ; les enfants restent cachés jusqu'à révélation individuelle.

**Tables SQL impliquées :**

- `table_visibility_overrides(table_id, entity_type, entity_id, visible)` — pour données univers
- `visibility_rules(table_id, entity_type, entity_id, visible)` — pour données campagne
- Les notes n'ont pas de colonne visible : elles ne transitent que par des routes MJ

#### 1b. Stratégie de validation

| Couche | Mécanisme | Exemple |
|---|---|---|
| **SQLite** | `NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY` | email unique, password not null |
| **Route handlers** | Validation manuelle (if/throw) | Vérifier champs requis, types, longueurs |
| **Middleware auth** | JWT decode + vérification expiration | Token invalide → 401 |
| **Middleware table** | Vérification appartenance `table_members` | Pas membre → 403 |

**Pas de bibliothèque de validation** (Joi, Zod, express-validator). Raisons :
- 39 endpoints max, validation simple (champs requis, types primitifs)
- Les contraintes SQLite attrapent les cas limites
- YAGNI pour 5 utilisateurs connus

#### 1c. Stratégie de cache

**Pas de cache applicatif.** Raisons :
- better-sqlite3 est synchrone — les lectures retournent en <1ms
- WAL mode permet lectures concurrentes sans bloquer
- 5 utilisateurs, ~200 entités — aucun goulot de lecture
- `Cache-Control` HTTP uniquement sur les assets statiques (`public/css/`, `public/js/`)
- Le polling 3-5s est déjà un "cache" naturel côté client

---

### Catégorie 2 : Authentication & Security

#### 2a. JWT — Structure du payload

```json
{
  "sub": 1,
  "is_admin": true,
  "iat": 1745100000,
  "exp": 1745186400
}
```

| Champ | Rôle |
|---|---|
| `sub` | `user_id` — clé primaire utilisateur |
| `is_admin` | Flag admin (gestion des comptes) |
| `iat` | Date de création du token |
| `exp` | Expiration à 24h |

**Le rôle par table (MJ/joueur) n'est PAS dans le JWT.** Il est résolu à chaque requête via `table_members` en fonction de la table active (un utilisateur peut être MJ sur une table et joueur sur une autre).

**Secret :** `JWT_SECRET` dans `.env`, généré aléatoirement (32+ caractères).

#### 2b. Pipeline middleware — Ordre d'exécution

```
1. express.static('public')         ← Assets statiques (pas d'auth)
2. express.json()                   ← Parse body JSON
3. cookieParser()                   ← Parse cookies
4. authMiddleware()                 ← JWT → req.user = { id, is_admin }
   └── Whitelist: POST /api/auth/login, POST /api/auth/register
5. tableContextMiddleware()         ← Table active → req.table = { id, role }
   └── Lit header X-Table-Id ou cookie
   └── Vérifie appartenance via table_members
6. [Routes API]                     ← Handlers spécifiques
   └── visibilityService.filter()   ← Service, pas middleware global
```

**La visibilité n'est pas un middleware global** — c'est un service (`src/services/visibility.js`) appelé par les routes de données uniquement. Les routes auth/tables/admin n'ont pas besoin de filtrage visibilité.

#### 2c. Protect-by-default

- `authMiddleware` rejette toute requête sans JWT valide sauf whitelist explicite
- Routes données campagne appellent systématiquement `visibilityService.filter(data, req.table, req.user)`
- Routes notes accessibles uniquement si `req.table.role === 'mj'`
- Aucune donnée cachée ne transite — plausible deniability côté client

#### 2d. Chiffrement & sécurité des données

| Donnée | Protection |
|---|---|
| Mots de passe | bcrypt (cost factor 12) |
| JWT | Signé HMAC-SHA256, cookie httpOnly + SameSite=Strict |
| SQLite | Fichier sur disque, permissions OS (chmod 600 en prod) |
| HTTPS | Let's Encrypt via reverse proxy (pas Express direct) |

#### 2e. Rate limiting

**Différé (post-MVP).** Usage privé, 5 utilisateurs connus, réseau local/DuckDNS. À implémenter si usage s'ouvre.

---

### Catégorie 3 : API & Communication Patterns

#### 3a. Conventions REST

| Méthode | Pattern | Exemple | Usage |
|---|---|---|---|
| `GET` | `/api/{resource}` | `/api/systems` | Liste filtrée par visibilité |
| `GET` | `/api/{resource}/:id` | `/api/systems/42` | Détail (si visible) |
| `POST` | `/api/{resource}` | `/api/npcs` | Création (MJ only) |
| `PUT` | `/api/{resource}/:id` | `/api/npcs/7` | Mise à jour complète |
| `DELETE` | `/api/{resource}/:id` | `/api/systems/42` | Suppression (MJ only) |
| `PATCH` | `/api/{resource}/:id/visibility` | `/api/systems/42/visibility` | Toggle visibilité (MJ) |

**Conventions :**
- Noms de ressources au pluriel, en anglais
- Pas de nesting profond (`/api/systems/42/planets` OK, pas plus)
- Toutes les routes sous `/api/` — les pages HTML sont servies par `express.static`

#### 3b. Format d'erreur uniforme

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ 'name' est requis",
    "status": 400
  }
}
```

| Code HTTP | Code erreur | Usage |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Champs manquants/invalides |
| 401 | `AUTH_REQUIRED` | Pas de JWT ou expiré |
| 403 | `FORBIDDEN` | Pas le rôle requis (MJ) ou pas membre de la table |
| 404 | `NOT_FOUND` | Ressource inexistante **ou cachée** (pas de distinction) |
| 409 | `CONFLICT` | Doublon (ex: email existant) |
| 500 | `INTERNAL_ERROR` | Erreur serveur non gérée |

**Point sécurité :** Une ressource cachée retourne 404 (pas 403) — le joueur ne sait pas si elle existe.

#### 3c. Endpoint de synchronisation (polling)

```
GET /api/sync?since={timestamp}
```

Retourne toutes les données visibles pour le joueur (selon table active) modifiées depuis `since`. Le MJ reçoit tout.

- Polling côté client : `setInterval` 3-5 secondes
- Réduction à 15-30s quand `document.hidden === true` (Page Visibility API)
- Reprise au rythme normal sur `visibilitychange`
- Indicateur de connexion dans le header partagé

#### 3d. Documentation API

**Pas de documentation formelle** (Swagger, OpenAPI). Raisons :
- 5 utilisateurs, solo dev, pas d'API publique
- Les routes sont auto-documentées par les noms RESTful
- Les tests d'intégration servent de documentation vivante
- Différé si ouverture future de l'API

---

### Catégorie 4 : Frontend Architecture

#### 4a. State management

**Modules ES isolés avec state local.** Pas de store centralisé (Redux, Zustand, etc.).

| Pattern | Implémentation |
|---|---|
| State par page | Variable module-level dans le script principal de la page |
| State partagé | `js/shared/auth-state.js` exporte `getUser()`, `isAuthenticated()` |
| Table active | `js/shared/table-selector.js` exporte `getActiveTable()` |
| Données polling | Le poller met à jour le state local de la page, re-render les composants |

**Raison :** MPA = chaque page est indépendante. Pas de routing client, pas de state cross-page. Le navigateur recharge tout à la navigation.

#### 4b. Composants partagés (`js/shared/`)

| Module | Responsabilité |
|---|---|
| `auth-ui.js` | Overlay login/register, gestion token |
| `header.js` | Header commun (user info, table selector, indicateur connexion) |
| `fetch-client.js` | Wrapper fetch avec auth cookie automatique, gestion erreurs JSON |
| `table-selector.js` | Sélecteur table active, stocke en cookie ou header |
| `poller.js` | Polling configurable, réduction en background, retry |

Chaque module est un ES module importable via `<script type="module">`.

#### 4c. Optimistic UI (côté MJ)

Pour les actions MJ (toggle visibilité, création PNJ, etc.) :
1. Mise à jour immédiate du DOM
2. Requête API en arrière-plan
3. En cas d'échec : rollback DOM + notification d'erreur

Implémenté dans chaque page MJ, pas dans un framework générique.

#### 4d. Dark mode

- **Tailwind** : classe `dark:` sur les éléments
- **Détection** : `prefers-color-scheme: dark` (media query système)
- **Toggle manuel** : différé post-MVP (suit le thème OS par défaut)
- **CSS custom properties** pour les couleurs de base si besoin de surcharge hors Tailwind

#### 4e. Performance front-end

| Stratégie | Implémentation |
|---|---|
| Pas de bundler JS | ES modules natifs, HTTP/2 sur le reverse proxy |
| Tailwind CSS purgé | `tailwind.config.js` → content: `./public/**/*.html` |
| Images | Lazy loading natif (`loading="lazy"`) |
| Fonts | System font stack (pas de Google Fonts) |

---

### Catégorie 5 : Infrastructure & Deployment

#### 5a. Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tailwindcss -i ./public/css/input.css -o ./public/css/tailwind.css --minify
EXPOSE 3000
CMD ["node", "server.js"]
```

- **Single container** (Node.js + SQLite fichier)
- **Volume :** `./db:/app/db` pour persister la base SQLite
- **Pas de multi-stage** — image Alpine suffit (~150MB)

#### 5b. HTTPS & réseau

```
Internet → DuckDNS → NAS (reverse proxy) → HTTPS Let's Encrypt → Docker :3000
```

- Express ne gère pas HTTPS directement — le reverse proxy s'en charge
- `SameSite=Strict` sur les cookies JWT (pas de CSRF nécessaire)
- `helmet` middleware Express pour les headers de sécurité (X-Frame-Options, CSP basique, etc.)

#### 5c. Configuration environnement

`.env.example` documenté :

```bash
PORT=3000
JWT_SECRET=your-random-secret-here-32-chars-min
DB_PATH=./db/ma.db
NODE_ENV=production
```

- `src/config/index.js` lit `.env` via `process.env` (pas de dotenv en prod — Docker injecte les env vars)
- En dev : `dotenv` chargé dans server.js si `NODE_ENV !== 'production'`

#### 5d. Logging

| Environnement | Méthode | Format |
|---|---|---|
| Dev | `console.log/warn/error` | Texte libre |
| Prod | `console.log/warn/error` | JSON structuré (timestamp, level, message) |

**Pas de bibliothèque de logging** (winston, pino). Raisons :
- Console.log suffit pour Docker (`docker logs`)
- Un wrapper `src/config/logger.js` formate en JSON en prod, texte en dev
- Différé si besoin de rotation/agrégation plus tard

#### 5e. Backup & résilience

- **Backup SQLite :** script cron sur le NAS, copie `ma.db` quotidienne (SQLite = un fichier)
- **Rollback migration :** `pragma user_version` permet de savoir quelle version est appliquée
- **Pas de réplication/HA** — single instance, 5 utilisateurs, downtime acceptable

---

### Decision Impact Analysis

**Séquence d'implémentation (ordre des décisions) :**

1. Structure projet + `server.js` + `database.js` (WAL mode) + `.env`
2. Auth middleware + JWT + bcrypt + routes login/register
3. Table context middleware + `table_members`
4. Visibility service + `visibility_rules` + `table_visibility_overrides`
5. API REST routes (CRUD systems, factions, etc.)
6. Frontend shared modules (auth-ui, header, fetch-client, poller, table-selector)
7. Pages individuelles (migration progressive du brownfield)
8. Docker + déploiement

**Dépendances croisées :**

| Décision | Impacte |
|---|---|
| JWT sans rôle table | → tableContextMiddleware obligatoire sur chaque requête |
| Visibilité = service (pas middleware) | → chaque route données doit appeler explicitement le service |
| Pas de cache | → le polling charge la DB à chaque tick (acceptable avec SQLite WAL) |
| Pas de bundler JS | → modules ES doivent être servis individuellement (HTTP/2 recommandé) |
| Docker single-container | → la DB vit dans un volume, pas de séparation app/DB |
| Notes MJ-only | → routes séparées `/api/notes`, jamais dans les endpoints joueur |

## Implementation Patterns & Consistency Rules

_Ces conventions garantissent que tout agent AI implémentant une story produit du code compatible avec le reste du projet._

### Naming Patterns

#### Base de données (SQLite)

| Élément | Convention | Exemple |
|---|---|---|
| Tables | `snake_case` pluriel | `users`, `game_tables`, `table_members`, `ship_models` |
| Colonnes | `snake_case` | `password_hash`, `display_name`, `created_at`, `mj_id` |
| Colonnes JSON | Suffixe `_json` | `corps_celestes_json`, `armement_json` |
| Clés étrangères | `{table_singulier}_id` | `user_id`, `table_id`, `system_id` |
| Index | `idx_{table}_{colonne}` | `idx_users_email`, `idx_table_members_table_id` |
| Timestamps | `created_at`, `updated_at` | Format ISO 8601 (`datetime('now')`) |

**Langue des colonnes :** les colonnes métier du jeu sont en français (`vitesse_croisiere`, `is_frontiere`). Les colonnes techniques sont en anglais (`created_at`, `password_hash`). Conserver cette convention existante.

#### API REST

| Élément | Convention | Exemple |
|---|---|---|
| Endpoints | `/api/{ressource_pluriel}` snake_case | `/api/ship_models`, `/api/game_tables` |
| Paramètres route | `:id` (Express standard) | `/api/systems/:id` |
| Query params | `snake_case` | `?table_id=5&since=2026-04-20T00:00:00Z` |
| Headers custom | `X-{Nom}` Pascal-Case | `X-Table-Id` |
| Body JSON | `snake_case` (cohérent avec la DB) | `{ "display_name": "Crepe", "table_id": 5 }` |

#### JavaScript

| Élément | Convention | Exemple |
|---|---|---|
| Variables | `camelCase` | `activeShipId`, `perilsData`, `tripState` |
| Constantes | `UPPER_SNAKE_CASE` | `LETTRES`, `POLL_INTERVAL_MS`, `MAX_RETRY` |
| Fonctions | `camelCase` verbe + nom | `getVisibleSystems()`, `toggleVisibility()` |
| Classes/constructors | `PascalCase` | `VisibilityService`, `DatabaseManager` |
| Fichiers modules serveur | `kebab-case.js` | `auth-middleware.js`, `visibility-service.js` |
| Fichiers modules client | `kebab-case.js` | `fetch-client.js`, `table-selector.js`, `auth-ui.js` |
| Fichiers HTML | `snake_case.html` (existant) | `carte_interactive.html`, `itineraire.html` |
| Variables privées | Préfixe `_` | `_isOnline`, `_pickingShipQuadrant` |

### Structure Patterns

#### Organisation des fichiers serveur (`src/`)

```
src/
├── config/
│   └── index.js             # Exporte: { PORT, JWT_SECRET, DB_PATH, NODE_ENV, logger }
├── database.js              # Exporte: db (instance better-sqlite3, WAL activé)
├── middleware/
│   ├── index.js             # Exporte middleware dans l'ordre d'application
│   ├── auth.js              # authMiddleware: JWT → req.user
│   └── table-context.js     # tableContextMiddleware: → req.table
├── services/
│   ├── visibility.js        # filter(data, table, user) — logique cascade
│   ├── auth.js              # hashPassword, verifyPassword, generateToken
│   └── sync.js              # getChangedData(tableId, since, role)
└── routes/
    ├── auth.js              # POST /api/auth/login, /api/auth/register
    ├── tables.js            # CRUD /api/game_tables
    ├── systems.js           # CRUD /api/systems + /api/systems/:id/visibility
    ├── factions.js          # GET /api/factions (filtrées par visibilité)
    ├── ships.js             # CRUD /api/ships, /api/ship_models
    ├── npcs.js              # CRUD /api/npcs (MJ only pour write)
    ├── notes.js             # CRUD /api/notes (MJ only, jamais exposé aux joueurs)
    └── sync.js              # GET /api/sync?since=...
```

**Règle :** Un fichier route par ressource. Pas de mega-fichier `routes/index.js` avec toutes les routes.

#### Organisation des fichiers client (`public/js/`)

```
public/js/
├── shared/
│   ├── fetch-client.js      # Wrapper fetch: auto-cookie, JSON parse, error handling
│   ├── auth-ui.js           # Overlay login/register, événements auth
│   ├── header.js            # Header commun: user, table selector, connexion indicator
│   ├── table-selector.js    # Gestion table active (cookie + header X-Table-Id)
│   └── poller.js            # Polling configurable, réduction background, retry
├── itineraire/              # Modules spécifiques à la carte
│   ├── map-renderer.js
│   ├── system-panel.js
│   └── trip-planner.js
├── compendium/
│   └── compendium-app.js
└── dashboard/
    └── dashboard-app.js
```

**Règle :** Les modules partagés vivent dans `js/shared/`. Les modules spécifiques à une page vivent dans `js/{page}/`.

#### Organisation des tests

```
tests/
├── setup.js                 # DB en mémoire, fixtures, helpers assert
├── unit/
│   ├── visibility.test.js   # Logique cascade, filtrage, edge cases
│   ├── auth-service.test.js # Hash, verify, token generation
│   └── sync-service.test.js # Delta calculation
├── integration/
│   ├── auth-api.test.js     # Login/register flows via supertest
│   ├── systems-api.test.js  # CRUD + visibility filtering
│   └── sync-api.test.js     # Polling endpoint responses
└── e2e/
    └── login-flow.spec.js   # Playwright: full browser flow
```

**Règles :**
- Tests unitaires : suffixe `.test.js`, dans `tests/unit/`
- Tests intégration : suffixe `.test.js`, dans `tests/integration/`
- Tests E2E : suffixe `.spec.js`, dans `tests/e2e/`
- Jamais de tests co-localisés (pas de `src/services/visibility.test.js`)

### Format Patterns

#### Réponses API — succès

```json
// Liste
{ "data": [{ "id": 1, "name": "Orion" }, { "id": 2, "name": "Centauri" }] }

// Détail
{ "data": { "id": 1, "name": "Orion", "corps_celestes_json": "[...]" } }

// Création/mise à jour
{ "data": { "id": 42, "name": "New System" } }

// Suppression
{ "success": true }
```

**Toute réponse données est wrappée dans `{ "data": ... }`.** Cela laisse de la place pour ajouter `meta`, `pagination` etc. sans breaking change.

#### Réponses API — erreurs

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ 'name' est requis",
    "status": 400
  }
}
```

Codes définis dans step-04 (section 3b). **Jamais de stack trace en production.**

#### Dates

| Contexte | Format | Exemple |
|---|---|---|
| API JSON | ISO 8601 UTC | `"2026-04-20T14:30:00.000Z"` |
| SQLite | `datetime('now')` | `2026-04-20 14:30:00` |
| Affichage UI | Format français | `20 avril 2026` |

#### Valeurs nulles & booléens

- SQLite : `NULL` pour absence, `0/1` pour booléens
- JSON API : `null` pour absence, `true/false` pour booléens
- Un champ absent du JSON ≠ `null`. Si un champ est optionnel et absent, ne pas l'inclure dans la réponse

### Process Patterns

#### Pattern de route API (template pour chaque endpoint)

```javascript
// src/routes/systems.js
import { Router } from 'express';
import { db } from '../database.js';
import { visibilityService } from '../services/visibility.js';

const router = Router();

// GET /api/systems — liste filtrée par visibilité
router.get('/', (req, res) => {
  const systems = db.prepare('SELECT * FROM systems WHERE table_id = ?').all(req.table.id);
  const visible = visibilityService.filter(systems, req.table, req.user);
  res.json({ data: visible });
});

// PATCH /api/systems/:id/visibility — MJ only
router.patch('/:id/visibility', (req, res) => {
  if (req.table.role !== 'mj') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Accès MJ requis', status: 403 } });
  const { visible } = req.body;
  // ... toggle visibility
  res.json({ data: { id: req.params.id, visible } });
});

export default router;
```

**Invariants :**
- Chaque fichier route exporte un `Router()`
- Toute lecture de données campagne appelle `visibilityService.filter()`
- Les vérifications de rôle MJ se font au début du handler
- Les erreurs retournent le format uniforme `{ error: { code, message, status } }`

#### Pattern d'erreur global (middleware Express)

```javascript
// Dernier middleware dans server.js
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: NODE_ENV === 'production' ? 'Erreur serveur' : err.message,
      status
    }
  });
});
```

#### Pattern de chargement frontend

```javascript
// Dans chaque page
async function init() {
  showLoading();       // Skeleton ou spinner
  try {
    const { data } = await fetchClient.get('/api/systems');
    renderSystems(data);
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
  }
}
```

**Pas de state `isLoading` global.** Chaque page gère son propre état de chargement.

#### Pattern polling (client)

```javascript
// js/shared/poller.js — usage
import { createPoller } from './poller.js';

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

### Enforcement Guidelines

**Tout agent AI DOIT :**

1. Utiliser `snake_case` pour les tables/colonnes SQLite et les champs JSON API
2. Utiliser `camelCase` pour les variables JS, `UPPER_SNAKE_CASE` pour les constantes
3. Wrapper toute réponse données dans `{ "data": ... }`
4. Appeler `visibilityService.filter()` sur toute route retournant des données campagne
5. Retourner 404 (pas 403) pour les ressources cachées
6. Ne jamais exposer les notes via des endpoints accessibles aux joueurs
7. Placer les tests dans `tests/{unit|integration|e2e}/`, jamais co-localisés
8. Utiliser le format d'erreur `{ "error": { "code", "message", "status" } }`
9. Importer depuis `../config/index.js` pour les constantes, jamais `process.env` directement dans les routes
10. Nommer les fichiers modules en `kebab-case.js`

**Anti-patterns interdits :**

- ❌ `res.json(systems)` — toujours `res.json({ data: systems })`
- ❌ `if (!visible) res.status(403)` — retourner 404 pour les caches
- ❌ `process.env.JWT_SECRET` dans un route handler — utiliser `config.JWT_SECRET`
- ❌ Tests dans `src/` — toujours dans `tests/`
- ❌ Visibilité vérifiée côté client — toujours côté serveur
- ❌ Fichier route avec logique métier complexe — extraire dans `services/`

## Project Structure & Boundaries

### Complete Project Directory Structure

```
MA/
├── server.js                          # Express entry point + middleware pipeline
├── package.json                       # "type": "module", scripts: test, dev, build:css
├── .env.example                       # PORT, JWT_SECRET, DB_PATH, NODE_ENV
├── .env                               # (gitignored) Variables locales
├── .gitignore                         # db/*.db, node_modules/, .env, coverage/, public/css/tailwind.css
├── Dockerfile                         # Node 22-alpine, single-container
├── tailwind.config.js                 # content: ['./public/**/*.html']
│
├── db/
│   └── ma.db                          # SQLite database (gitignored en prod, volume Docker)
│
├── src/
│   ├── config/
│   │   └── index.js                   # { PORT, JWT_SECRET, DB_PATH, NODE_ENV, logger }
│   ├── database.js                    # better-sqlite3 instance, WAL mode, pragma foreign_keys
│   │
│   ├── middleware/
│   │   ├── index.js                   # Pipeline ordonné: json → cookie → auth → tableContext
│   │   ├── auth.js                    # JWT decode → req.user = { id, is_admin }
│   │   └── table-context.js           # X-Table-Id → req.table = { id, role }
│   │
│   ├── services/
│   │   ├── visibility.js              # filter(entities, table, user) — cascade descendante
│   │   ├── auth.js                    # hashPassword(), verifyPassword(), generateToken()
│   │   └── sync.js                    # getChangedSince(tableId, since, role)
│   │
│   └── routes/
│       ├── auth.js                    # POST /api/auth/login, POST /api/auth/register
│       ├── tables.js                  # CRUD /api/game_tables, GET /api/game_tables/:id/members
│       ├── systems.js                 # CRUD /api/systems, PATCH .../visibility
│       ├── factions.js                # GET /api/factions (filtrées visibilité)
│       ├── ships.js                   # CRUD /api/ships, /api/ship_models
│       ├── npcs.js                    # CRUD /api/npcs
│       ├── notes.js                   # CRUD /api/notes (MJ only)
│       └── sync.js                    # GET /api/sync?since=...
│
├── public/
│   ├── index.html                     # Hub — post-login dashboard / landing
│   ├── compendium.html                # Encyclopédie règles
│   ├── carte.html                     # Carte interactive systèmes solaires
│   ├── itineraire.html                # Planificateur itinéraire + périls
│   ├── dashboard.html                 # Dashboard MJ (hub actions rapides)
│   │
│   ├── js/
│   │   ├── shared/
│   │   │   ├── fetch-client.js        # Wrapper fetch: cookies auto, JSON, errors
│   │   │   ├── auth-ui.js             # Overlay login/register, redirect post-auth
│   │   │   ├── header.js              # Header commun: user, table selector, connexion
│   │   │   ├── table-selector.js      # Table active: cookie + header X-Table-Id
│   │   │   └── poller.js              # Polling configurable, background throttle, retry
│   │   │
│   │   ├── compendium/
│   │   │   └── compendium-app.js       # Recherche, filtrage, affichage règles
│   │   │
│   │   ├── carte/
│   │   │   ├── map-renderer.js         # Canvas/SVG carte 40×40, zoom, pan
│   │   │   ├── system-panel.js         # Panel détail système (planètes, POI)
│   │   │   └── visibility-controls.js  # Toggles visibilité MJ sur la carte
│   │   │
│   │   ├── itineraire/
│   │   │   ├── trip-planner.js          # Calcul route, fuel, durée
│   │   │   └── peril-roller.js          # Générateur périls (tables interplanétaire/hyperspatial)
│   │   │
│   │   └── dashboard/
│   │       └── dashboard-app.js         # Hub MJ: raccourcis, session toggle, activité récente
│   │
│   └── css/
│       ├── input.css                    # @tailwind base/components/utilities + custom
│       └── tailwind.css                 # (généré) Output Tailwind CLI
│
├── scripts/
│   ├── migrate.js                       # DB migrations via pragma user_version
│   └── seed.js                          # Données initiales (factions, ship_models depuis JSON)
│
└── tests/
    ├── setup.js                         # DB :memory:, fixtures, helpers
    ├── unit/
    │   ├── visibility.test.js           # Cascade, filtrage, edge cases visibilité
    │   ├── auth-service.test.js         # Hash, verify, token generation
    │   └── sync-service.test.js         # Delta calculation, rôle-based filtering
    ├── integration/
    │   ├── auth-api.test.js             # Login/register/protected routes
    │   ├── systems-api.test.js          # CRUD + visibility filtering
    │   ├── tables-api.test.js           # CRUD tables + membership
    │   └── sync-api.test.js             # Polling responses par rôle
    └── e2e/
        ├── login-flow.spec.js           # Playwright: login → dashboard
        └── visibility-flow.spec.js      # Playwright: MJ révèle → joueur voit
```

### Requirements to Structure Mapping

**FR Domaine → Fichiers impactés :**

| Domaine PRD | Routes | Services | Client | Tests |
|---|---|---|---|---|
| **Auth & utilisateurs** (FR1-4) | `routes/auth.js` | `services/auth.js`, `middleware/auth.js` | `js/shared/auth-ui.js` | `unit/auth-service`, `integration/auth-api` |
| **Tables de jeu** (FR5-8) | `routes/tables.js` | `middleware/table-context.js` | `js/shared/table-selector.js` | `integration/tables-api` |
| **Visibilité** (FR9-14) | Toutes routes données | `services/visibility.js` | `js/carte/visibility-controls.js` | `unit/visibility`, `e2e/visibility-flow` |
| **Compendium** (FR15-18) | `routes/factions.js`, `routes/ships.js` | `services/visibility.js` | `js/compendium/compendium-app.js` | `integration/` |
| **Carte interactive** (FR19-23) | `routes/systems.js` | `services/visibility.js` | `js/carte/*` | `integration/systems-api` |
| **Dashboard MJ** (FR24-27) | Agrège routes existantes | — | `js/dashboard/dashboard-app.js` | `e2e/` |
| **Itinéraire** (FR28-31) | `routes/systems.js`, `routes/ships.js` | — | `js/itineraire/*` | `integration/` |
| **Migration** (FR32-33) | — | — | — | `scripts/migrate.js`, `scripts/seed.js` |
| **Synchronisation** (FR34-37) | `routes/sync.js` | `services/sync.js` | `js/shared/poller.js` | `unit/sync-service`, `integration/sync-api` |
| **Onboarding** (FR38-39) | — | — | Toutes pages (état zéro) | `e2e/` |

### Architectural Boundaries

#### Boundary 1 : Client ↔ Serveur

```
public/js/**  ──HTTP/JSON──▶  src/routes/**
                              │
                              ▼
                          src/services/**
                              │
                              ▼
                          src/database.js ──▶ db/ma.db
```

- Le client ne fait **jamais** d'accès DB direct
- Toute donnée transite par l'API REST (`/api/*`)
- Le client ne connaît pas l'existence des entités cachées (plausible deniability)

#### Boundary 2 : Routes ↔ Services

- Les **routes** gèrent : parsing requête, validation input, appel service, formatage réponse
- Les **services** gèrent : logique métier, accès DB, calculs, cascade visibilité
- Un route handler ne contient jamais de requête SQL directe complexe (simples CRUDs OK, joins/cascades → service)

#### Boundary 3 : Middleware ↔ Handlers

- Le middleware enrichit `req` (`req.user`, `req.table`) mais ne retourne jamais de données métier
- Les handlers lisent `req.user` et `req.table` sans jamais les recalculer
- Le middleware auth est le **seul point** de vérification JWT

#### Boundary 4 : Données univers ↔ Données campagne

- **Univers** (factions, ship_models) : tables globales, visibilité via `table_visibility_overrides`
- **Campagne** (systems, planets, ships, npcs, notes) : scopées par `table_id`, visibilité via `visibility_rules`
- Les routes univers retournent des données filtrées par table (pas le jeu global)

#### Boundary 5 : MJ ↔ Joueur

- Routes `/api/notes` : accès uniquement si `req.table.role === 'mj'`
- Routes CRUD (POST/PUT/DELETE) sur données campagne : MJ only
- Routes GET : retournent les données filtrées par visibilité selon le rôle
- Le dashboard (`dashboard.html`) n'est affiché que pour le MJ

### Data Flow — Requête type

```
1. Client: GET /api/systems (cookie JWT + header X-Table-Id)
   │
2. express.static → pas un fichier statique, passe au middleware
   │
3. authMiddleware → decode JWT → req.user = { id: 1, is_admin: true }
   │
4. tableContextMiddleware → X-Table-Id: 5 → table_members lookup
   │                         → req.table = { id: 5, role: 'mj' }
   │
5. routes/systems.js → GET / handler
   │  → db.prepare('SELECT * FROM systems WHERE table_id = ?').all(5)
   │  → visibilityService.filter(systems, req.table, req.user)
   │  → res.json({ data: filteredSystems })
   │
6. Client: receives { data: [...] }, updates UI
```

### Development Workflow

| Commande | Action |
|---|---|
| `npm run dev` | `nodemon server.js` — hot reload serveur |
| `npm run build:css` | `tailwindcss -i public/css/input.css -o public/css/tailwind.css` |
| `npm run build:css:watch` | Idem + `--watch` pour le dev |
| `npm test` | `node --test tests/unit/ tests/integration/` |
| `npm run test:e2e` | `npx playwright test` |
| `npm run migrate` | `node scripts/migrate.js` |
| `npm run seed` | `node scripts/seed.js` |

## Architecture Validation Results

### Coherence Validation ✅

**Compatibilité des décisions :** Toutes les décisions technologiques sont cohérentes. Express + better-sqlite3 + vanilla JS + Tailwind CLI forment un stack sans conflit. Les patterns (visibility service, middleware pipeline, polling) s'intègrent logiquement.

**Cohérence des patterns :** Les conventions de nommage (snake_case DB/API, camelCase JS) sont cohérentes avec le codebase existant. Les patterns d'erreur, de réponse et de routing sont uniformes.

**Alignement de la structure :** La structure de fichiers supporte toutes les décisions. Chaque service, middleware et route a un emplacement défini.

### Requirements Coverage Validation

**Couverture globale : 39 FRs — 35 entièrement couverts, 4 avec gaps corrigés ci-dessous**

| Domaine | FRs | Couverture | Notes |
|---|---|---|---|
| Auth & utilisateurs | FR1-4 | ✅ 100% | *FR3/FR4 complétés (voir corrections ci-dessous)* |
| Tables de jeu | FR5-8 | ✅ 100% | — |
| Visibilité | FR9-14 | ✅ 100% | *FR10/FR12/FR14 complétés ci-dessous* |
| Compendium | FR15-18 | ✅ 100% | *FR16 search endpoint ajouté* |
| Carte interactive | FR19-23 | ✅ 100% | FR23 animation = détail UX, pas archi |
| Dashboard MJ | FR24-27 | ✅ 100% | Consomme les endpoints définis |
| Itinéraire | FR28-31 | ✅ 100% | — |
| Migration | FR32-33 | ✅ 100% | *FR32 import API ajouté* |
| Synchronisation | FR34-37 | ✅ 100% | — |
| Onboarding | FR38-39 | ✅ 100% | FR38/39 = logique front, pas archi server |

**NFRs : 17/17 couverts — 100%** (Performance, Sécurité, Fiabilité, Maintenabilité)

### Gap Corrections — Endpoints ajoutés

La validation a révélé des endpoints manquants dans la section Routes. Ces ajouts complètent la couverture :

#### Routes ajoutées à `routes/auth.js`

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `POST` | `/api/auth/logout` | FR3 | Clear cookie JWT |

#### Routes ajoutées à `routes/tables.js`

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `PATCH` | `/api/game_tables/:id/members/:member_id` | FR4 | Admin assigne rôle MJ/joueur |

#### Routes ajoutées à `routes/systems.js` (et routes similaires)

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `PATCH` | `/api/{resource}/bulk/visibility` | FR10 | Toggle visibilité en masse (body: `{ ids: [...], visible: true }`) |

#### Route ajoutée à `routes/sync.js`

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `GET` | `/api/sync?since=...&as_player=true` | FR14 | MJ prévisualise en mode joueur (filtre comme si `role = 'joueur'`) |

#### Route ajoutée : Search (`routes/search.js` — nouveau fichier)

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `GET` | `/api/search?q=X&types=systems,factions,npcs` | FR16/FR25 | Recherche cross-entités, filtrée par visibilité |

**Implémentation :** SQL `LIKE` sur colonnes `name`/`display_name` de chaque type demandé. 200 entités max = pas besoin de full-text search. Index `idx_{table}_name` pour NFR4 (<1s).

#### Route ajoutée : Import (`routes/admin.js` — nouveau fichier)

| Méthode | Endpoint | FR | Description |
|---|---|---|---|
| `POST` | `/api/admin/import` | FR32/FR33 | Upload JSON, import tolérant aux erreurs |

**Réponse :** `{ "data": { "imported": 42, "skipped": 3, "errors": [{ "row": 5, "reason": "..." }] } }`

#### FR12 — Undo reveal (grace period)

**Décision :** Pas de versioning/audit log. Solution simple : l'undo est **côté client uniquement**.

- Le MJ toggle la visibilité → mise à jour immédiate (optimistic UI)
- Un toast "Annuler" apparaît pendant 5 secondes
- Si le MJ clique "Annuler" avant 5s → PATCH inverse envoyé avant que le polling joueur ne capte le changement (polling = 3-5s, donc la fenêtre est suffisante)
- Si le MJ ne clique pas → c'est déjà envoyé

Pas de nouveau endpoint nécessaire. Le même `PATCH /:id/visibility` est utilisé pour l'undo.

### Architecture Completeness Checklist

**✅ Analyse des requirements**

- [x] Contexte projet analysé en profondeur
- [x] Échelle et complexité évaluées
- [x] Contraintes techniques identifiées
- [x] Préoccupations transversales mappées

**✅ Décisions architecturales**

- [x] Décisions critiques documentées avec rationale
- [x] Stack technique entièrement spécifiée
- [x] Patterns d'intégration définis
- [x] Considérations de performance traitées

**✅ Patterns d'implémentation**

- [x] Conventions de nommage établies
- [x] Patterns de structure définis
- [x] Patterns de communication spécifiés
- [x] Patterns de process documentés

**✅ Structure projet**

- [x] Structure complète de répertoires définie
- [x] Frontières de composants établies
- [x] Points d'intégration mappés
- [x] Mapping requirements → structure complet

### Architecture Readiness Assessment

**Statut global : ✅ PRÊT POUR L'IMPLÉMENTATION**

**Niveau de confiance : ÉLEVÉ**

**Points forts :**
- Visibility service centralisé et testable (zéro bypass possible)
- Pipeline middleware ordonné (auth → table context), séparation nette
- Protect-by-default (404 pour ressources cachées = plausible deniability)
- MPA + REST = complexité maîtrisée pour solo dev brownfield
- Polling avec throttle mobile + resync reconnexion
- Format d'erreur uniforme + réponse wrappée `{ data: ... }`
- Conventions de nommage alignées sur le codebase existant
- Test hierarchy claire (unit → integration → e2e)

**Améliorations futures (post-PRD #1) :**
- WebSocket pour remplacer le polling
- Rate limiting si ouverture à plus d'utilisateurs
- Full-text search SQLite (FTS5) si le volume de données augmente
- CI/CD pipeline (GitHub Actions ou similaire)
- Monitoring avancé (pino + agrégation logs)

### Implementation Handoff

**Directives pour les agents AI :**

1. Suivre toutes les décisions architecturales exactement comme documentées
2. Utiliser les patterns d'implémentation de manière cohérente sur tous les composants
3. Respecter la structure projet et les frontières
4. Consulter ce document pour toute question architecturale

**Première priorité d'implémentation :**

1. `npm init`, `package.json` ("type": "module"), installer dépendances
2. `server.js` minimal + `src/config/` + `src/database.js` (WAL)
3. `scripts/migrate.js` pour créer le schéma
4. Pipeline middleware (auth + table context)
5. Première route (`/api/auth/login`) + tests
