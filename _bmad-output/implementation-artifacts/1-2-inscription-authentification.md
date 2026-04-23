# Story 1.2 : Inscription & Authentification

Status: done

## Story

As a visiteur,
I want to create an account and log in securely,
So that I can access the application and be recognized across sessions.

## Acceptance Criteria (BDD)

1. **Given** aucun utilisateur n'existe **When** je m'inscris avec pseudo (3-30 chars) + mot de passe (8+ chars) **Then** mon compte est créé avec `is_admin = true` (premier inscrit = admin + MJ) **And** un message confirme que je suis le premier admin
2. **Given** des utilisateurs existent déjà **When** je m'inscris **Then** mon compte est créé avec `is_admin = false`
3. **Given** je suis inscrit **When** je me connecte avec des identifiants valides **Then** un JWT est stocké dans un cookie httpOnly + Secure + SameSite=Strict **And** le JWT contient `{ sub, is_admin, iat, exp }` avec expiration de 7 jours **And** je suis redirigé vers la page d'accueil
4. **Given** je me connecte avec des identifiants invalides **When** je soumets le formulaire **Then** je reçois une erreur 401 au format `{ "error": { code: "INVALID_CREDENTIALS", message, status: 401 } }` sans révéler si c'est le pseudo ou le mot de passe qui est faux
5. **Given** je suis connecté **When** je clique « Déconnexion » **Then** le cookie est supprimé et je suis redirigé vers la page de login
6. **And** le middleware `src/middleware/auth.js` décode le JWT et attache `req.user = { id, is_admin }`
7. **And** les routes protégées retournent 401 si pas de JWT, 403 si droits insuffisants
8. **And** les mots de passe sont hashés avec bcrypt (cost factor 10+)
9. **And** la validation d'input rejette les pseudo vides, trop courts ou trop longs, et les mots de passe trop courts
10. **And** la page `public/login.html` affiche inscription et connexion
11. **And** le module `public/js/shared/auth-ui.js` gère l'affichage conditionnel (connecté/déconnecté) sur toutes les pages

Couvre : FR1, FR2, FR3

## Tasks / Subtasks

- [x] **Task 1 : Service auth & routes API** (AC: #1, #2, #3, #4, #5, #8, #9)
  - [x] 1.1 Créer `src/services/auth.js` : register(username, password), login(username, password), generateToken(user), verifyToken(token)
  - [x] 1.2 Créer `src/routes/auth.js` : POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
  - [x] 1.3 Register : validation (username 3-30 chars COLLATE NOCASE, password 8+ chars), hash bcrypt cost 12, détecter premier utilisateur → is_admin = 1
  - [x] 1.4 Login : bcrypt.compare, générer JWT { sub: user.id, is_admin: user.is_admin, iat, exp: 7j }, set cookie token httpOnly + SameSite=Strict + path=/
  - [x] 1.5 Logout : res.clearCookie('token', { httpOnly: true, sameSite: 'strict', path: '/' })
  - [x] 1.6 Erreurs : INVALID_CREDENTIALS (401) sans leak, CONFLICT (409) si pseudo pris, VALIDATION_ERROR (400) si input invalide

- [x] **Task 2 : Middleware auth** (AC: #6, #7)
  - [x] 2.1 Implémenter `src/middleware/auth.js` (remplacer le stub) : lire cookie `token`, jwt.verify, attacher req.user = { id, is_admin }
  - [x] 2.2 Whitelist : POST /api/auth/register, POST /api/auth/login, GET /api/health → skip auth
  - [x] 2.3 Pas de JWT ou invalide → 401 AUTH_REQUIRED via response.js helper
  - [x] 2.4 Créer helper `requireAdmin` pour les routes nécessitant is_admin → 403 FORBIDDEN

- [x] **Task 3 : Page login/register** (AC: #10, #11)
  - [x] 3.1 Créer `public/login.html` : formulaire inscription (pseudo + password + confirm) et connexion (pseudo + password), toggle entre les deux
  - [x] 3.2 Créer `public/js/login.js` : appels fetch vers /api/auth/register et /api/auth/login, gestion erreurs, redirection
  - [x] 3.3 Créer `public/js/shared/auth-ui.js` : module vérifiant l'auth via GET /api/auth/me, affichage conditionnel header (nom utilisateur + déconnexion si connecté, lien login sinon)

- [x] **Task 4 : Route GET /api/auth/me** (AC: #6, #11)
  - [x] 4.1 Ajouter GET /api/auth/me dans routes/auth.js : retourne { data: { id, username, display_name, is_admin } } si authentifié
  - [x] 4.2 Cette route est protégée par le middleware auth (pas dans la whitelist)

- [x] **Task 5 : Tests** (AC: #1-#9)
  - [x] 5.1 Tests unitaires auth service : register premier utilisateur → is_admin, register suivant → pas admin, login valide, login invalide, validation input
  - [x] 5.2 Tests intégration routes : POST /api/auth/register → 201, doublon → 409, POST /api/auth/login → 200 + cookie, mauvais mdp → 401, POST /api/auth/logout → 200, GET /api/auth/me → 200 si connecté / 401 sinon
  - [x] 5.3 Tests middleware : requête sans cookie → 401, cookie invalide → 401, cookie valide → req.user attaché, whitelist → pass-through
  - [x] 5.4 Mettre à jour le script test dans package.json pour inclure les nouveaux fichiers test

## Dev Notes

### Architecture — Patterns obligatoires

**JWT payload exact :**
```json
{ "sub": 1, "is_admin": true, "iat": 1745100000, "exp": 1745186400 }
```
- `sub` = user.id (pas userid, pas user_id dans le JWT)
- Expiration : 7 jours
- Secret : importé depuis `src/config/index.js` → `JWT_SECRET`
- Cookie name : `token`

**⚠️ Architecture précise sur bcrypt cost :** le doc architecture dit cost 12, les ACs disent 10+. Utiliser **12** (archi fait autorité).

**Pipeline middleware — whitelist auth :**
```
POST /api/auth/login    → skip auth
POST /api/auth/register → skip auth
GET  /api/health        → skip auth
```
Toutes les autres routes passent par authMiddleware.

**Format cookie :**
```javascript
res.cookie('token', jwt, {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
});
```
⚠️ `secure: true` uniquement en production (HTTPS via Let's Encrypt + DuckDNS). En dev (localhost HTTP), `secure: false`.

**Response helpers existants** (ne pas réinventer) :
- `success(res, data, status)` — `src/utils/response.js`
- `error(res, { code, message, status })` — `src/utils/response.js`
- `authRequired(res, message)` — déjà défini
- `forbidden(res, message)` — déjà défini
- `validationError(res, message)` — déjà défini

**Config existante** — ne pas lire process.env directement :
```javascript
import { JWT_SECRET, NODE_ENV } from '../config/index.js';
// ⚠️ Si JWT_SECRET manquant, le serveur doit refuser de démarrer
```

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `src/services/auth.js` | **CRÉER** — register, login, generateToken, verifyToken |
| `src/routes/auth.js` | **CRÉER** — POST register, POST login, POST logout, GET me |
| `src/middleware/auth.js` | **MODIFIER** — remplacer le stub pass-through |
| `server.js` | **MODIFIER** — monter `/api/auth` routes |
| `public/login.html` | **CRÉER** — page login/register |
| `public/js/login.js` | **CRÉER** — logique formulaire |
| `public/js/shared/auth-ui.js` | **CRÉER** — module auth conditionnel |
| `tests/unit/auth-service.test.js` | **CRÉER** |
| `tests/integration/auth.test.js` | **CRÉER** |
| `tests/unit/auth-middleware.test.js` | **CRÉER** |
| `package.json` | **MODIFIER** — ajouter nouveaux tests dans script test |

### Fichiers existants à NE PAS TOUCHER

- Legacy HTML en racine (index.html, compendium.html, etc.)
- `style.css` (legacy)
- `src/database.js` — connexion DB, ne pas modifier
- `scripts/migrate.js` — schéma DB, pas de changement nécessaire (table users existe déjà)
- `scripts/seed.js` — données de seed, pas de changement

### Pattern auth service — structure recommandée

```javascript
// src/services/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database.js';
import { JWT_SECRET } from '../config/index.js';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

export function register(username, password) { /* ... */ }
export function login(username, password) { /* ... */ }
export function generateToken(user) { /* ... */ }
export function verifyToken(token) { /* ... */ }
```

### Pattern routes auth — structure recommandée

```javascript
// src/routes/auth.js
import { Router } from 'express';
import * as authService from '../services/auth.js';
import { success, validationError, error } from '../utils/response.js';

const router = Router();

router.post('/register', (req, res) => { /* ... */ });
router.post('/login', (req, res) => { /* ... */ });
router.post('/logout', (req, res) => { /* ... */ });
router.get('/me', (req, res) => { /* ... */ });

export default router;
```

### Pattern middleware auth — structure recommandée

```javascript
// src/middleware/auth.js
import { verifyToken } from '../services/auth.js';
import { authRequired, forbidden } from '../utils/response.js';

const WHITELIST = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
];

export default function authMiddleware(req, res, next) {
  if (WHITELIST.some(w => w.method === req.method && req.path === w.path)) return next();
  // verify cookie, attach req.user ...
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return forbidden(res);
  next();
}
```

### Learnings Story 1.1

- **ESM modules** : tout le projet est `"type": "module"`, pas de require()
- **server.js** : utilise un guard `isMainModule` pour éviter listen() à l'import (pour tests)
- **Tests** : `node --test` avec chemins explicites (pas de globs sur Windows)
- **Config** : tout passe par `src/config/index.js`, jamais `process.env` directement (sauf config/index.js)
- **Response helpers** : tous définis dans `src/utils/response.js`, ne pas en créer de nouveaux
- **error-handler.js** : utilise `NODE_ENV` depuis config, vérifie `res.headersSent`
- **Middleware pipeline** dans `src/middleware/index.js` : l'ordre est fixe, auth est step 5

### Project Structure Notes

Le projet suit cette structure pour les nouveaux fichiers :
```
src/
├── services/auth.js     ← Business logic (register, login, token)
├── routes/auth.js       ← Express routes (POST register/login/logout, GET me)
├── middleware/auth.js    ← JWT verification + whitelist + requireAdmin
public/
├── login.html           ← Page inscription/connexion
├── js/
│   ├── login.js          ← Script page login
│   └── shared/auth-ui.js ← Module auth conditionnel (header)
tests/
├── unit/auth-service.test.js
├── unit/auth-middleware.test.js
├── integration/auth.test.js
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2a: JWT payload]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2b: Pipeline middleware]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2c: Protect-by-default]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 2d: Chiffrement]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 3b: Format erreur]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1, FR2, FR3]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/implementation-artifacts/1-1-initialisation-projet-base-de-donnees.md — Dev Agent Record]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Completion Notes List

- Auth service créé avec register/login/generateToken/verifyToken
- Routes auth : POST register (auto-login + cookie), POST login (cookie), POST logout (clearCookie), GET me
- Premier inscrit = is_admin automatique, message de confirmation
- bcrypt cost 12, JWT 7j, cookie httpOnly + SameSite=Strict + secure en prod
- Middleware auth remplace le stub : whitelist 3 routes, vérifie JWT, charge user depuis DB, attache req.user
- requireAdmin export pour les routes admin futures
- Validation JWT_SECRET au démarrage du serveur (process.exit si manquant)
- Page login.html avec toggle inscription/connexion, Tailwind CSS dark theme
- auth-ui.js module partagé : checkAuth(), initAuthUI(), logout()
- 30 tests : 8 unit auth-service, 5 unit auth-middleware, 12 integration auth, 1 integration health, 4 unit schema
- helper httpRequest dans tests/setup.js pour tests intégration HTTP complets

### Change Log

- 2026-04-20 : Story 1.2 implémentée — inscription, authentification, middleware auth, page login, tests

### File List

- src/services/auth.js (CRÉÉ)
- src/routes/auth.js (RÉÉCRIT — legacy CommonJS → ESM)
- src/middleware/auth.js (MODIFIÉ — stub → implémentation complète)
- server.js (MODIFIÉ — ajout import authRoutes, validation JWT_SECRET)
- public/login.html (CRÉÉ)
- public/js/login.js (CRÉÉ)
- public/js/shared/auth-ui.js (CRÉÉ)
- tests/unit/auth-service.test.js (CRÉÉ)
- tests/unit/auth-middleware.test.js (CRÉÉ)
- tests/integration/auth.test.js (CRÉÉ)
- tests/setup.js (MODIFIÉ — ajout createTestApp avec auth, httpRequest helper)
- package.json (MODIFIÉ — script test étendu)
- public/css/tailwind.css (REBUILD)
