# Story 1.3 : Onboarding premier admin

Status: done

## Story

As a premier admin fraîchement inscrit,
I want to be guided through initial setup,
So that I know immediately how to create my first game table.

## Acceptance Criteria (BDD)

1. **Given** je suis le premier utilisateur et je viens de m'inscrire **When** j'arrive sur la page d'accueil **Then** je vois un guide d'onboarding thématique m'invitant à créer ma première table de jeu
2. **Given** l'onboarding est affiché **When** je regarde le guide **Then** il me propose également d'importer des données (lien vers l'import admin, désactivé pour l'instant avec un tooltip "Bientôt disponible")
3. **Given** des tables de jeu existent déjà **When** j'arrive sur la page d'accueil **Then** l'onboarding ne s'affiche plus
4. **Given** je suis connecté **When** j'arrive sur la page d'accueil **Then** je vois le dashboard avec mon nom, un header partagé avec navigation et déconnexion
5. **Given** je ne suis pas connecté **When** j'accède à la page d'accueil **Then** je suis redirigé vers /login.html

Couvre : FR39

## Tasks / Subtasks

- [x] **Task 1 : API — route tables count** (AC: #1, #3)
  - [x] 1.1 Créer `src/routes/tables.js` avec GET /api/game_tables/count : retourne `{ data: { count: N } }` — nombre de tables existantes (route protégée par auth, pas de whitelist)
  - [x] 1.2 Monter la route dans server.js : `app.use('/api/game_tables', tablesRoutes)`

- [x] **Task 2 : Page d'accueil public/index.html** (AC: #1, #4, #5)
  - [x] 2.1 Créer `public/index.html` : page dashboard avec header partagé (nom utilisateur + déconnexion via auth-ui.js), structure Tailwind dark theme cohérente avec login.html
  - [x] 2.2 Le header doit inclure les éléments `#auth-user-info`, `#auth-user-name`, `#auth-login-link`, `#auth-logout-btn` attendus par auth-ui.js
  - [x] 2.3 Ajouter redirection vers /login.html si non connecté (via auth-ui.js → `initAuthUI()` retourne null)

- [x] **Task 3 : Composant onboarding** (AC: #1, #2, #3)
  - [x] 3.1 Créer `public/js/onboarding.js` : module qui vérifie via GET /api/game_tables/count si count === 0, et si oui affiche le guide d'onboarding dans un conteneur `#onboarding-container`
  - [x] 3.2 Le guide d'onboarding contient : titre thématique ("Bienvenue, Capitaine ! 🚀"), étape 1 "Créer votre première table de jeu" (bouton actif qui mènera vers la création de table — pour l'instant lien désactivé ou placeholder), étape 2 "Importer des données univers" (désactivé, tooltip "Bientôt disponible")
  - [x] 3.3 Si count > 0, le `#onboarding-container` reste masqué et un message dashboard normal s'affiche

- [x] **Task 4 : Tests** (AC: #1-#5)
  - [x] 4.1 Test intégration : GET /api/game_tables/count retourne `{ data: { count: 0 } }` quand aucune table n'existe
  - [x] 4.2 Test intégration : GET /api/game_tables/count retourne 401 sans auth
  - [x] 4.3 Mettre à jour le script test dans package.json

## Dev Notes

### Architecture — ce que fait cette story

Cette story est **principalement frontend** : elle crée la page d'accueil (`public/index.html`) qui sert de dashboard post-login, et affiche conditionnellement un guide d'onboarding pour le premier admin.

Le seul endpoint API ajouté est `GET /api/game_tables/count` qui compte les tables existantes. C'est un endpoint léger qui sera étendu dans Story 1.4 quand on implémentera la vraie gestion des tables.

### Routes existantes — ne pas toucher

- `GET /api/health` — whitelisté dans auth middleware
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — auth routes

### Pattern route — cohérent avec health.js

```javascript
// src/routes/tables.js
import { Router } from 'express';
import { success } from '../utils/response.js';
import db from '../database.js';

const router = Router();

router.get('/count', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM game_tables').get();
  success(res, { count });
});

export default router;
```

### Pattern page — cohérent avec login.html

```html
<!-- Structure header partagée attendue par auth-ui.js -->
<header>
  <nav>
    <span id="auth-user-info" class="hidden">
      <span id="auth-user-name"></span>
      <a href="#" id="auth-logout-btn">Déconnexion</a>
    </span>
    <a href="/login.html" id="auth-login-link">Connexion</a>
  </nav>
</header>
```

### Pattern redirection si non connecté

```javascript
import { initAuthUI } from '/js/shared/auth-ui.js';

const user = await initAuthUI();
if (!user) {
  window.location.href = '/login.html';
  // stop script execution
}
```

### Fichiers existants à NE PAS TOUCHER

- `src/middleware/auth.js` — pas de nouvelles routes whitelistées (game_tables/count est protégé)
- `src/middleware/table-context.js` — reste stub, sera implémenté dans 1.4
- `src/services/auth.js`, `src/routes/auth.js` — pas de changement
- `src/database.js`, `scripts/migrate.js`, `scripts/seed.js`
- Legacy HTML en racine (index.html, compendium.html, etc.)

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `src/routes/tables.js` | **CRÉER** — GET /count |
| `server.js` | **MODIFIER** — monter `/api/game_tables` |
| `public/index.html` | **CRÉER** — dashboard avec header + onboarding container |
| `public/js/dashboard.js` | **CRÉER** — logique page d'accueil + redirection auth |
| `public/js/onboarding.js` | **CRÉER** — vérification count + affichage guide |
| `tests/integration/tables.test.js` | **CRÉER** — tests count endpoint |
| `package.json` | **MODIFIER** — ajout test dans script |

### Learnings Stories précédentes

- **ESM modules** : tout le projet est `"type": "module"`, pas de require()
- **Tests** : `node --test` avec chemins explicites (pas de globs sur Windows)
- **Config** : tout passe par `src/config/index.js`, jamais `process.env` directement
- **Response helpers** : `src/utils/response.js` — success(), error(), authRequired() etc.
- **httpRequest helper** dans `tests/setup.js` pour tests intégration HTTP complets
- **createTestApp** dans `tests/setup.js` inclut déjà auth + health routes
- **server.js** : `isMainModule` guard pour éviter listen() à l'import

### Project Structure Notes

```
src/
├── routes/tables.js     ← GET /count (nouveau)
public/
├── index.html           ← Dashboard (nouveau)
├── js/
│   ├── dashboard.js      ← Logique page d'accueil (nouveau)
│   ├── onboarding.js     ← Guide onboarding conditionnel (nouveau)
│   └── shared/auth-ui.js ← Existant, inchangé
tests/
├── integration/tables.test.js ← Tests API tables (nouveau)
```

### Note importante — table game_tables

La table `game_tables` existe déjà dans le schéma (créée par migrate.js dans Story 1.1). Elle a les colonnes : `id`, `name`, `created_by`, `invite_code`, `created_at`, `updated_at`. On n'a pas besoin de modifier le schéma.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section pipeline middleware]
- [Source: _bmad-output/planning-artifacts/prd.md — FR39]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1 : Remplacé le legacy `src/routes/tables.js` (CommonJS) par un nouveau module ESM avec GET /count. Monté dans server.js + tests/setup.js.
- Task 2 : Créé `public/index.html` avec header partagé auth-ui.js, conteneurs onboarding et dashboard.
- Task 3 : Créé `public/js/dashboard.js` (init auth + redirection) et `public/js/onboarding.js` (fetch count, affichage conditionnel du guide).
- Task 4 : 2 tests intégration (count=0, 401 sans auth). Fix cleanup SQLITE_ERROR : colonne `mj_id` et non `created_by`.
- 32/32 tests passent (30 existants + 2 nouveaux).

### Change Log
- 2026-04-20 : Story 1.3 implémentée — API count, dashboard, onboarding, tests

### File List
- `src/routes/tables.js` — REMPLACÉ (legacy → ESM, GET /count)
- `server.js` — MODIFIÉ (import + mount tablesRoutes)
- `tests/setup.js` — MODIFIÉ (ajout tablesRoutes dans createTestApp)
- `public/index.html` — CRÉÉ (dashboard avec header + onboarding container)
- `public/js/dashboard.js` — CRÉÉ (init auth, redirection, loadOnboarding)
- `public/js/onboarding.js` — CRÉÉ (fetch count, guide conditionnel)
- `tests/integration/tables.test.js` — CRÉÉ (2 tests intégration)
- `package.json` — MODIFIÉ (ajout tables.test.js dans script test)
