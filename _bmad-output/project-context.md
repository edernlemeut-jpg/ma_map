---
project_name: 'Metal Adventures'
user_name: 'Crepe'
date: '2026-04-29'
sections_completed: ['technology_stack', 'architecture', 'database', 'api_routes', 'frontend_patterns', 'compendium_module', 'implementation_rules', 'anti_patterns']
---

# Project Context for AI Agents

_Ce fichier contient les règles critiques que les agents IA doivent suivre lors de tout travail sur ce projet. Généré le 2026-04-29 — remplace la version précédente (2026-04-18) qui décrivait une architecture obsolète sans serveur._

---

## Stack technologique

| Catégorie | Technologie | Version | Notes |
|---|---|---|---|
| Runtime | **Node.js** | 18+ | ESM (`"type": "module"`) |
| Serveur | **Express** | 4.21 | |
| Base de données | **better-sqlite3** | 11.7 | SQLite synchrone |
| Auth | **jsonwebtoken** | 9.0 + **bcryptjs** 2.4 | Cookie `token` HttpOnly |
| Sécurité | **helmet** | 8.0 | CSP activée |
| Upload | **multer** | 2.1 | |
| CSS framework | **Tailwind CSS** | 3.4 | Compilé via `npm run build:css` — **ne pas utiliser CDN** |
| Tests unitaires | Node.js `--test` | natif | `npm test` |
| Tests E2E | **Playwright** | 1.45 | `npm run test:e2e` |
| Dev server | **nodemon** | 3.1 | `npm run dev` |

**Lancement :** `npm run dev` (port 3000 par défaut, configurable via `.env`)

---

## Architecture globale

```
server.js                  ← point d'entrée Express
src/
  auth.js                  ← requireAuth / requireMJ / signToken (CommonJS legacy)
  config/index.js          ← PORT, JWT_SECRET, DB_PATH, NODE_ENV
  database.js              ← singleton better-sqlite3, migrations inline (ensureXxx)
  middleware/index.js      ← pipeline: static → json → cookie → helmet → auth → tableContext
  routes/                  ← un fichier par domaine (voir liste routes)
  services/                ← logique métier (compendium, visibility, etc.)
  utils/response.js        ← success(), error(), notFound(), validationError(), forbidden()
public/
  *.html                   ← pages servies statiquement
  css/                     ← tailwind.css (compilé), style.css (legacy)
  js/
    shared/                ← modules partagés entre pages
    univers/               ← compendium-app.js (module principal univers)
    personnage/            ← personnage-app.js
    calendrier/            ← module calendrier
    revolte/               ← module révolte
    itineraire.js          ← itinéraire de voyage
    ...
db/
  ma.db                    ← base SQLite (gitignorée)
```

---

## Base de données (SQLite)

### Règle critique : migrations inline dans `database.js`
- **Toujours** ajouter les nouvelles colonnes via une fonction `ensureXxx()` avec `ALTER TABLE IF NOT EXISTS` dans `src/database.js`
- Ne jamais modifier directement le schéma sans migration defensive
- Pattern type :
```js
function ensureXxxColumn() {
  const cols = db.prepare("PRAGMA table_info('table_name')").all();
  if (cols.find(c => c.name === 'new_col')) return;
  db.exec('ALTER TABLE table_name ADD COLUMN new_col TEXT');
}
ensureXxxColumn(); // appelé au démarrage
```

### Tables principales
| Table | Description | Champs JSON notables |
|---|---|---|
| `systems` | Systèmes solaires | `soleil_json`, `corps_celestes_json`, `patrouilles_json` |
| `factions` | Nations stellaires | — |
| `ship_models` | Modèles de vaisseaux | `armement_json`, `systemes_secondaires_json` |
| `ships` | Vaisseaux de table | — |
| `game_tables` | Tables de jeu | `session_active` |
| `users` | Utilisateurs | `profile_role` |
| `visibility` | Visibilité entités par table | `entity_type`, `entity_id` |
| `travel_routes` | Itinéraires | `route_waypoints` (table liée) |
| `admin_peril_tables` | Tables de périls admin | `data_json` |

### Champs JSON sérialisés dans `systems.corps_celestes_json`
Chaque corps céleste (planète/lune) est un objet JSON :
```json
{
  "nom": "...", "orbite": 1, "diametre": 10000,
  "atmosphere": "Dense", "gravite": "1G", "techno": "B",
  "securite": 3, "population": "500M",
  "gouvernement": "Démocratie",
  "environnements": ["Forêt", "Océan"],
  "astroports": [{ "nom": "Port Alpha", "type": "Standard" }],
  "satellites": [{ "nom": "Lune 1", "distance": 380, "description": "..." }],
  "commerce": "Standard",
  "marchandiseA": "Minerai", "marchandiseB": "...", "marchandiseC": "...",
  "illegal": "Armes",
  "texte_ambiance": "...",
  "description": "..."
}
```

---

## Routes API

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/api/systems` | auth + table | Liste systèmes (filtrée par visibilité) |
| POST | `/api/systems` | MJ | Créer un système |
| POST | `/api/systems/bulk` | MJ | Créer plusieurs systèmes depuis tableau JSON |
| PATCH | `/api/systems/:id` | MJ | Modifier un système |
| DELETE | `/api/systems/:id` | MJ | Supprimer un système |
| GET | `/api/factions` | auth + table | Liste factions |
| GET/POST/PATCH | `/api/factions` | MJ | CRUD factions |
| GET | `/api/ship-models` | auth | Modèles de vaisseaux |
| GET | `/api/ships` | auth + table | Vaisseaux de la table |
| GET | `/api/visibility/:type/:id` | MJ | Visibilité entité |
| PUT | `/api/visibility/:type/:id` | MJ | Modifier visibilité |
| GET | `/api/search` | auth | Recherche globale |
| GET | `/api/perils` | auth + table | Tables de périls |
| POST | `/api/perils/import-admin-defaults` | MJ | Import périls par défaut |
| GET | `/api/calendar` | auth + table | Calendrier galactique |
| GET | `/api/characters` | auth + table | Personnages |
| GET | `/api/sync` | auth + table | Sync temps réel (polling) |
| GET | `/api/planets` | auth + table | Planètes (legacy) |

### Pattern de réponse API uniforme (`src/utils/response.js`)
```js
success(res, data)         // { success: true, data }
notFound(res, message)     // 404
validationError(res, msg)  // 400
forbidden(res)             // 403
error(res, { code, message, status }) // 500
```
**Toujours utiliser ces helpers** — jamais `res.json()` directement dans les routes.

### Authentification
- JWT dans cookie `token` (HttpOnly, 30 jours)
- Header `X-Table-Id` requis pour les routes nécessitant un contexte de table
- `req.user` injecté par `src/middleware/auth.js`
- `req.table` (avec `.id`, `.role` = `'mj'`|`'joueur'`) injecté par `src/middleware/table-context.js`

---

## Frontend — Modules JS (`public/js/`)

### Module partagé clé : `table-selector.js`
```js
import { getActiveTableId, fetchWithTable, isMJ, setActiveTable, renderTableSelector } from '/js/shared/table-selector.js';
```
- `fetchWithTable(url, options)` — wrapper `fetch` qui ajoute automatiquement `X-Table-Id` depuis `localStorage`
- `isMJ()` — retourne `true` si le rôle local est `'mj'`
- **Toujours utiliser `fetchWithTable` au lieu de `fetch` brut** pour les appels API authentifiés

### Autres modules partagés
| Fichier | Export clé |
|---|---|
| `shared/header.js` | `initHeader()` — charge le header et retourne `user` |
| `shared/poller.js` | `createPoller(fn, interval)` — polling temps réel |
| `shared/auth-ui.js` | Helpers UI d'authentification |
| `shared/deferred-commit.js` | Commit différé avec debounce |

### Architecture de `compendium-app.js` (`public/js/univers/`)
C'est le module le plus complexe. Patterns à respecter :

**State global :**
```js
let state = { systems: [], factions: [], ship_models: [], ships: [], ... }
```

**Cycle de rendu :**
1. `init()` → `loadAllData()` → `renderApp()` → `renderActiveTab()`
2. Après toute modification → `state.systems.push(updated)` ou `state.systems[idx] = updated` → `renderActiveTab()`
3. `renderActiveTab()` dispatch vers `renderSystems(panel, systems)`, `renderFactions(...)`, etc.

**Pattern des modales :**
- Créer un `div` overlay avec `document.createElement`, injecter `innerHTML`, `document.body.appendChild`
- Fermeture via `overlay.remove()`
- Les sous-modales (ex. `openBodyModal`) ont `zIndex: 300` (au-dessus de la principale)
- Helper `esc(str)` **obligatoire** pour toutes les interpolations dans `innerHTML` (XSS)
- Helpers locaux de champs : `sf(id, label, type, val)` (input simple), `sta(id, label, val)` (textarea), `ta(id, label, val)` (textarea dans modal système)

**Pattern liste dynamique (add/remove) :**
Utilisé pour astroports et satellites. Modèle à suivre :
```js
// Bind boutons delete au rendu initial + après chaque ajout
const bindDeleteBtns = () => { 
  overlay.querySelectorAll('.bm-del-xxx').forEach(btn => 
    btn.addEventListener('click', () => btn.closest('.bm-xxx-row').remove())
  );
};
bindDeleteBtns();
// Bouton "Ajouter" → createElement + appendChild + rebind
overlay.querySelector('#bm-add-xxx').addEventListener('click', () => { ... });
// Save → querySelectorAll('.bm-xxx-row').map(row => collect fields).filter(r => r.nom)
```

**Visibilité MJ/Joueur :**
- `state.isMJ` détecté à la réponse API (présence de `visible` dans les entités) ou depuis `isAdmin`
- `canEdit = state.isMJ || state.isAdmin`
- Boutons d'action (créer, modifier, supprimer) conditionnés par `canEdit`

---

## Compendium — Données systèmes

### Champs du système (table `systems`)
```
id, quadrant, nom, faction, is_frontiere, route, gouvernement,
texte_ambiance, description, soleil_json, corps_celestes_json, patrouilles_json
```

### Soleil (`soleil_json`)
```json
{ "nom": "...", "classe": "G", "diametre": 1392, "distanceSaut": 5, "texte_ambiance": "...", "description": "...", "activiteSolaire": "..." }
```

### Corps célestes (`corps_celestes_json`)
Tableau d'objets. Voir structure complète en section Base de données ci-dessus.

### Édition côté backend
- `SYSTEM_EDITABLE` dans `src/services/compendium.js` liste les champs modifiables
- Pour ajouter un champ : 1) migration `ensureXxx()` dans `database.js`, 2) l'ajouter à `SYSTEMS_COLS` et `SYSTEM_EDITABLE`

### Import en masse
`POST /api/systems/bulk` accepte un tableau JSON. Les champs `*_json` peuvent être des objets ou des strings — le backend sérialise. Les champs `id` et `visible` sont ignorés.

---

## Règles d'implémentation critiques

### ⛔ Ne JAMAIS faire
- Utiliser `res.json()` directement — toujours utiliser les helpers `response.js`
- Utiliser `fetch()` brut côté frontend pour les routes API — toujours `fetchWithTable()`
- Insérer du HTML dynamique sans `esc()` — risque XSS
- Modifier le schéma DB sans migration défensive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Ajouter un champ API sans l'ajouter à `SYSTEMS_COLS`/`SYSTEM_EDITABLE` (ou équivalent)
- Créer des fichiers JS globaux — chaque module va dans son dossier `public/js/[module]/`

### ✅ Toujours faire
- Utiliser `fetchWithTable` avec `{ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(...) }` pour les POST/PATCH
- Appeler `renderActiveTab()` après toute mutation de `state.systems` / `state.factions` etc.
- Utiliser `esc()` pour tout contenu injecté dans `innerHTML`
- Vérifier `canEdit = state.isMJ || state.isAdmin` avant d'afficher les boutons d'édition
- Dans les routes, vérifier `req.table.role !== 'mj'` avant toute opération d'écriture
- Ajouter le filtre visibilité dans `getSystems()` / `getFactions()` pour les nouvelles entités

### Fichiers archivés (ne pas modifier)
- `public/carte_interactive.html` — ancêtre d'`itineraire.html`, archivé
- `src/auth.js` — CommonJS legacy (`.bak` existe), utilisé tel quel

---

## Tests

```bash
npm test          # tests unitaires (Node --test)
npm run test:e2e  # tests Playwright
```

- Tests unitaires dans `tests/unit/` — nommage `[module].test.js`
- Tests d'intégration dans `tests/integration/`
- Tests E2E dans `tests/e2e/`
- **Toujours** lancer `npm test` après modification de routes ou services

---

## Variables d'environnement (`.env`)

```
PORT=3000
JWT_SECRET=...          # obligatoire
DB_PATH=./db/ma.db      # optionnel, défaut ./db/ma.db
NODE_ENV=development
```

## Conventions de nommage

- **Fichiers** : `snake_case` (ex: `carte_interactive.html`, `perils_data.json`)
- **Fonctions JS** : mixte français/camelCase (ex: `sauvegarder()`, `loadEventsFromLocalStorage()`)
- **Clés localStorage** : camelCase anglais (ex: `galacticEvents`, `quadrantsMA`)
- **Classes CSS** : kebab-case (ex: `.site-header`, `.active-nav`, `.container-frame`)
- **Variables CSS** : `--color-*`, `--font-*` (ex: `--color-accent-gold`, `--font-main`)

---

## Qualité et style de code

- Pas de linter configuré — appliquer le style existant de la page modifiée
- Pas de formatter automatique — respecter l'indentation du fichier cible (2 ou 4 espaces selon la page)
- Commentaires en français dans les sections logiques principales
- Pas de `console.log` en production
- Utiliser `JSON.parse(localStorage.getItem('clé')) || valeurParDéfaut` pour les lectures sécurisées

---

## Anti-patterns — Ne JAMAIS faire

- ❌ Introduire un framework JS (React, Vue, Angular…)
- ❌ Créer un `package.json` ou installer npm/node
- ❌ Créer des fichiers `.js` séparés (tout reste inline)
- ❌ Installer Tailwind localement — CDN uniquement
- ❌ Modifier `carte_interactive.html` — fichier archivé, valeur historique uniquement (ancêtre d'`itineraire.html`)
- ❌ Utiliser `import` / `export` (modules ES6) — les balises `<script>` n'ont pas `type="module"`
- ❌ Ajouter un build step, un transpileur ou un bundler
- ❌ Utiliser `fetch()` sans serveur local — les requêtes `file://` sont bloquées par les navigateurs
- ❌ Modifier les données du compendium dans un fichier externe — elles sont inline dans le HTML

---

## Workflow de développement

- **Édition** : modifier directement les fichiers `.html` — aucun build nécessaire
- **Test** : ouvrir dans un navigateur (ou via Live Server VS Code pour éviter les restrictions `file://`)
- **Déploiement** : copier les fichiers `.html`, `.css`, `.json` sur un hébergement statique
- **Pas de tests automatisés** — validation manuelle uniquement
- **Sauvegarde données** : exporter régulièrement les JSON depuis chaque outil (calendrier, carte, personnages)

---

## Dépendances CDN (hors-ligne)

Si l'application est utilisée sans connexion internet :
- `calendrier.html` et `revolte.html` seront sans style (Tailwind CDN indisponible)
- `revolte.html` utilisera une police de secours (Google Fonts indisponible)
- Les pages sans CDN (`index.html`, `itineraire.html`, `peril.html`, `compendium.html`, `personnage.html`) fonctionneront normalement
