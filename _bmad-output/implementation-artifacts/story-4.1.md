---
story_id: 4-1-dashboard-mj-page-accueil-raccourcis
story_title: Dashboard MJ — Page d'accueil & raccourcis
epic: epic-4
created: 2026-04-20T12:00:00
status: done
---

# Story 4.1: Dashboard MJ — Page d'accueil & raccourcis

## Context

**Epic:** Epic 4 — Dashboard MJ & Visibilité avancée  
**Story Points:** 8 (Medium: nouvelle page HTML + endpoint API léger + tests)  
**Related Stories:** 1.5 (table context), 1.6 (polling/sync), 3.3 (delta sync with counters), 2.x (compendium routes)

Cette story crée la page centrale du MJ : un hub donnant accès rapide à toutes ses fonctions en une vue, avec des compteurs en temps réel (systèmes visibles, joueurs connectés...) et les entités récemment modifiées pour reprendre une session facilement.

**Point d'entrée naturel du MJ :** après connexion, le MJ est redirigé ou guidé vers `/dashboard.html`. Les joueurs sont rejetés (403 → redirect index).

---

## Acceptance Criteria

### AC1: Accès réservé MJ

**Given** je suis un joueur connecté  
**When** je tente d'accéder à `GET /api/dashboard`  
**Then** le serveur retourne 403 avec corps `{ "error": { "code": "FORBIDDEN", "message": "Accès réservé au MJ", "status": 403 } }`

**Given** je suis un joueur et j'accède à `public/dashboard.html`  
**When** la page charge et détecte mon rôle via `/api/auth/me`  
**Then** je suis redirigé vers `/index.html`

### AC2: Compteurs en temps réel

**Given** je suis MJ avec une table active  
**When** j'ouvre `public/dashboard.html`  
**Then** je vois :
- **Systèmes visibles / total** — ex: `12 / 47 systèmes`
- **Joueurs connectés** — ex: `2 / 3 joueurs` (membres de la table hors MJ actif)
- **Sessions récentes** — timestamp du dernier accès de chaque joueur (optionnel MVP: si disponible)

**And** les compteurs se rafraîchissent via le delta sync existant (`GET /api/sync`) — pas de polling séparé

### AC3: Raccourcis de navigation

**Given** je suis MJ sur le dashboard  
**When** la page est affichée  
**Then** je vois des raccourcis vers :
- Compendium : `/compendium.html`
- Carte interactive : `/carte_interactive.html`
- Itinéraire : `/itineraire.html` (si page existe)

**And** chaque raccourci affiche une icône thématique, un titre, et une description courte

### AC4: Entités recently modified

**Given** des entités ont été modifiées dans les dernières 24h (toggle visibilité, édition MJ)  
**When** le dashboard se charge  
**Then** les entités récemment modifiées sont listées (nom, type, timestamp, statut visibilité)  
**And** la liste est limitée à 10 entités maximum  
**And** cliquer sur une entité dans la liste ouvre le compendium filtré sur cet élément  
**And** si aucune modification dans les 24h, un message « Aucune modification récente » s'affiche

### AC5: Design & responsive

**Given** je visualise le dashboard en mobile (360px) ou desktop (1200px)  
**When** la page est affichée  
**Then** la grille de raccourcis est 2 colonnes en mobile, 3-4 en desktop  
**And** le style est cohérent avec les autres pages (Tailwind, dark theme, mêmes classes header/nav)  
**And** la page utilise le même `<header>` de navigation que `compendium.html` (copié en dur, avec `class="active-nav"` sur "Dashboard")

---

## Tasks

### T1: Endpoint `GET /api/dashboard` (25 min)

**File:** `src/routes/dashboard.js` (nouveau fichier)

**Changes:**
- Créer route `GET /` — accessible MJ seulement (vérifier `req.table.role === 'mj'`, sinon 403)
- Retourner :
  ```json
  {
    "data": {
      "stats": {
        "systems_visible": 12,
        "systems_total": 47,
        "players_connected": 2,
        "players_total": 3
      },
      "recent_changes": [
        {
          "entity_type": "systems",
          "entity_id": 5,
          "entity_name": "Proxima Station",
          "action": "revealed",
          "updated_at": "2026-04-20T10:30:00Z",
          "visible": true
        }
      ]
    }
  }
  ```
- `systems_visible` : COUNT via `getVisibleIds('systems', tableId, 'joueur')` (visible aux joueurs)
- `systems_total` : `SELECT COUNT(*) FROM systems`
- `players_total` : membres de la table avec `role = 'joueur'`
- `players_connected` : heuristique — membres ayant eu une requête API dans les 5 dernières minutes (voir note ci-dessous)
- `recent_changes` : query `visibility_rules` ou `table_visibility_overrides` jointes aux entités, filtrées par `updated_at > NOW - 24h`, limitées à 10, triées par `updated_at DESC`
- Format d'erreur uniforme : `{ error: { code, message, status } }` (convention projet)

**Note technique — players_connected :**  
Il n'y a pas de table de sessions/heartbeat pour l'instant. Deux options :
1. **(Choix recommandé MVP)** : Retourner `players_total` comme count, et `players_connected` fixé à null ou omis — afficher uniquement le total des joueurs dans l'UI (pas de compteur "en ligne")
2. **(Différé)** : Créer une table `user_last_seen(user_id, last_seen_at)` mise à jour par middleware — Story 4.5 (mode session active) est le bon endroit pour introduire ce mécanisme

**Tests : T1.1, T1.2, T1.3** (voir T6)

### T2: Enregistrer la route dans server.js (5 min)

**File:** `server.js`

**Changes:**
- Importer `dashboardRouter` depuis `./src/routes/dashboard.js`
- Monter sur `/api/dashboard` dans le pipeline middleware existant (après authMiddleware + tableContextMiddleware)
- Pattern identique aux autres routes (sync, visibility, search...)

### T3: Créer `public/dashboard.html` (30 min)

**File:** `public/dashboard.html` (nouveau fichier)

**Changes:**
- Structure HTML minimale avec :
  - Même `<header>` de navigation que `compendium.html` (copié en dur, `class="active-nav"` sur "Dashboard")
  - `<main>` avec :
    - Section compteurs : `#stats-systems`, `#stats-players`
    - Section raccourcis : grille de cartes cliquables
    - Section activité récente : `#recent-changes` liste
  - Même `<footer>` si présent dans les autres pages
- Tailwind CSS (déjà compilé dans `public/css/tailwind.css`)
- `<script type="module">` en bas du body (ES modules, convention projet)
- Imports depuis `public/js/shared/` :
  - `auth-ui.js` pour l'auth (pattern identique à `carte_interactive.html`)
  - `fetch-client.js` pour les appels API
  - `poller.js` pour rafraîchir les stats via delta sync

### T4: Logique JS du dashboard (20 min)

**File:** `public/dashboard.html` (bloc `<script type="module">`)

**Changes:**

**Initialisation :**
```javascript
// Vérification auth + rôle
const user = await checkAuthAndRole(); // redirige si non-MJ

// Chargement initial des données
await loadDashboardData();

// Polling via /api/sync pour refresh des compteurs
setupPolling();
```

**`loadDashboardData()` :**
- `GET /api/dashboard` via `fetch-client.js`
- Remplir `#stats-systems` : `"${data.stats.systems_visible} / ${data.stats.systems_total} systèmes"`
- Remplir `#stats-players` : ne montrer que total si `players_connected` absent (MVP)
- Remplir `#recent-changes` avec la liste (ou message vide si vide)

**`setupPolling()` :**
- Utiliser `createPoller` depuis `public/js/shared/poller.js` (même pattern que `carte_interactive.html`)
- Sur chaque tick `onData`, rappeler `loadDashboardData()` pour rafraîchir les stats
- Connection indicator : même composant que `carte_interactive.html` (copier le pattern HTML + JS du `getConnectionState`)

**Gestion d'erreur :**
- Si `GET /api/dashboard` retourne 403, redirect vers `/index.html`
- Si retourne 500, afficher un message d'erreur inline (pas de crash page)

### T5: CSS spécifique dashboard (10 min)

**File:** `public/dashboard.html` (bloc `<style>` ou classes Tailwind uniquement)

**Décisions :**
- Préférer classes Tailwind (déjà disponibles) — pas de `<style>` custom sauf stricte nécessité
- Raccourcis : `grid grid-cols-2 md:grid-cols-3 gap-4`
- Cartes raccourcis : `bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition cursor-pointer`
- Section stats : badges `bg-blue-900 text-blue-200 px-3 py-1 rounded` pour les compteurs
- Recent changes : liste `divide-y divide-gray-700`, chaque item sur une ligne avec icône type + nom + timestamp

### T6: Tests (25 min)

**File:** `tests/integration/dashboard.test.js` (nouveau fichier)

**Tests à écrire :**

**T6.1 — MJ peut appeler GET /api/dashboard**
- Setup : créer table, user MJ, sélectionner table (cookie)
- Request : `GET /api/dashboard`
- Assert : 200, body a `data.stats.systems_visible`, `data.stats.systems_total`, `data.recent_changes`

**T6.2 — Joueur reçoit 403**
- Setup : user joueur, table sélectionnée
- Request : `GET /api/dashboard`
- Assert : 403, `error.code === 'FORBIDDEN'`

**T6.3 — Stats systèmes cohérents**
- Setup : MJ, table avec 3 systèmes visibles et 2 cachés
- Request : `GET /api/dashboard`
- Assert : `systems_visible === 3`, `systems_total === 5`

**T6.4 — recent_changes retourne uniquement les 24 dernières heures**
- Setup : modifier une entité, hardcoder `updated_at = NOW - 25h` pour une autre
- Request : `GET /api/dashboard`
- Assert : seule la modification récente est dans `recent_changes`

**T6.5 — recent_changes limité à 10**
- Setup : créer 15 modifications récentes
- Request : `GET /api/dashboard`
- Assert : `recent_changes.length <= 10`

**T6.6 — Sans table sélectionnée → erreur**
- Setup : MJ authentifié mais sans cookie table
- Request : `GET /api/dashboard`
- Assert : 400 ou 403 (selon convention middleware existant — vérifier `sync.js` pour pattern de référence)

---

## Technical Notes

### Recent Changes Query

La colonne `updated_at` doit exister dans les tables concernées. Vérifier :
- `systems` → colonne `updated_at` (créée en Epic 1 ou 2 — vérifier le schéma DB dans `scripts/migrate.js`)
- `visibility_rules` → `updated_at` pour tracer les révélations

Si `updated_at` n'existe pas sur `systems`, la solution MVP est de query `visibility_rules(updated_at)` seulement (les toggles de visibilité MJ passent tous par ce levier).

**Query SQL de référence pour recent_changes :**
```sql
SELECT 
  'systems' AS entity_type,
  vr.entity_id,
  s.nom AS entity_name,
  CASE WHEN vr.visible = 1 THEN 'revealed' ELSE 'hidden' END AS action,
  vr.updated_at,
  vr.visible
FROM visibility_rules vr
JOIN systems s ON s.id = vr.entity_id
WHERE vr.table_id = ?
  AND vr.entity_type = 'systems'
  AND vr.updated_at > datetime('now', '-24 hours')
ORDER BY vr.updated_at DESC
LIMIT 10
```

> **IMPORTANT :** Vérifier si `visibility_rules` a une colonne `updated_at`. Si non, utiliser `table_visibility_overrides` ou ajouter une migration `ALTER TABLE visibility_rules ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`.

### Vérification du schéma existant

Avant de coder T1, faire :
```javascript
import db from '../database.js';
const cols = db.prepare("PRAGMA table_info('visibility_rules')").all();
console.log(cols.map(c => c.name));
```
... ou inspecter `scripts/migrate.js` pour trouver la définition complète de `visibility_rules`.

### Pattern d'import JS partagé (référence : carte_interactive.html)

```javascript
import { initAuthUI, getAuthToken } from '/js/shared/auth-ui.js';
import { apiFetch } from '/js/shared/fetch-client.js';
import { createPoller } from '/js/shared/poller.js';
```

### Role check côté frontend (pattern de référence)

Dans `carte_interactive.html`, le check d'auth se fait via `initAuthUI` qui appelle `/api/auth/me`. Pour la redirection des joueurs, dupliquer le pattern :
```javascript
const { role } = await apiFetch('/api/auth/me').then(r => r.data);
if (role !== 'mj') window.location.href = '/index.html';
```

### Pas de nouvelle dépendance

Ne pas ajouter de bibliothèque. Les seuls modules acceptables sont `express` (déjà installé) et `better-sqlite3` (déjà installé).

### Ordre middleware server.js

Le nouveau routeur `dashboardRouter` doit être monté **après** `authMiddleware` et `tableContextMiddleware`, dans le même pattern que `/api/sync`. Le check `role === 'mj'` se fait dans le handler de route, pas dans un middleware dédié (pour consistence avec le reste du code existant).

### Format de réponse API — Convention projet

Toujours wrapper dans `{ data: ... }` pour les succès, `{ error: { code, message, status } }` pour les erreurs (fonction `success()` et `validationError()` / réponse manuelle 403 depuis `src/utils/response.js`).

### Colonne `updated_at` — migration potentielle

Si `visibility_rules` n'a pas `updated_at`, créer un script de migration dans `scripts/migrate.js` avec le pattern idempotent existant :
```javascript
// Migration N+1
if (currentVersion < N+1) {
  db.exec(`ALTER TABLE visibility_rules ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`);
  db.pragma(`user_version = ${N+1}`);
}
```

---

## Dev Notes

### Fichiers à créer
- `src/routes/dashboard.js`
- `public/dashboard.html`
- `tests/integration/dashboard.test.js`

### Fichiers à modifier
- `server.js` — ajout route `/api/dashboard`
- `scripts/migrate.js` — si migration `updated_at` nécessaire

### Fichiers à NE PAS modifier
- `public/js/shared/poller.js` — ne pas changer l'API publique (Story 3.3 vient d'être stabilisé)
- `src/services/visibility.js` — lire seulement, ne pas modifier
- `src/services/sync.js` — lire seulement pour comprendre les helpers disponibles

### Leçons des stories précédentes

1. **Test mocks + HTTP validation** : si un test mock ne définit pas `.ok`, utiliser `=== false` (strict) pour ne pas casser les mocks (bug découvert en Story 3.3)
2. **Tailwind inline `<style>` blocks** : ne jamais mettre de classes utilitaires Tailwind dans un bloc `<style>`. Tailwind classes vont uniquement dans `class=""` des éléments HTML.
3. **ES modules dans `public/`** : tous les scripts sont `type="module"`, utiliser `import/export`, jamais `require()`.
4. **Convention `success()`** : toujours utiliser `success(res, data)` de `src/utils/response.js` plutôt qu'un `res.json()` direct.
5. **Validation rôle dans le handler** : pattern standard du projet = check `req.table.role` dans le handler, pas dans un nouveau middleware.

### Run tests

```bash
node --test tests/integration/dashboard.test.js
```

Pour la suite complète (régression) :
```bash
node --test tests/unit/poller.test.js tests/integration/map-polling.test.js tests/unit/map-service.test.js tests/unit/map-editing.test.js tests/integration/carte-interactive.test.js tests/unit/sync-deltas.test.js tests/integration/dashboard.test.js
```
