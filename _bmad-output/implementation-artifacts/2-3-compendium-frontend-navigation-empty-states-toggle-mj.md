# Story 2.3: Compendium frontend — navigation, empty states & toggle MJ inline

Status: done

## Story

As a joueur,
I want to browse the visible universe data in a themed interface,
So that I can reference the game world during sessions.

As a MJ,
I want to toggle entity visibility directly from the compendium with a single tap,
So that I can reveal content in < 3 seconds without leaving the page.

## Acceptance Criteria

1. **Given** je suis joueur avec une table active **When** j'ouvre `public/compendium.html` **Then** je vois les entités visibles groupées par catégorie avec navigation par onglets (Systèmes / Factions / Vaisseaux)
2. **Given** aucune entité n'est visible pour moi **When** j'ouvre le compendium **Then** je vois un empty state narratif thématique (ex: « Les archives du vaisseau sont encore verrouillées. Votre équipage n'a pas assez d'accréditations pour accéder aux données galactiques… »)
3. **Given** je suis MJ **When** je vois une entité dans le compendium **Then** un indicateur visuel (icône œil) montre le statut de visibilité **And** je peux taper directement sur l'indicateur pour toggler — un seul geste, pas de navigation **And** révéler = toggle immédiat sans confirmation **And** cacher = micro-confirmation (les joueurs pourraient être en train de lire)
4. **Given** le MJ vient de révéler une entité **When** le poller du joueur reçoit la mise à jour **Then** un badge discret « nouveau contenu » apparaît sur l'onglet concerné du compendium **And** le badge disparaît quand le joueur consulte l'onglet
5. **And** le compendium utilise `fetchWithTable()` de `table-selector.js` pour les appels API (⚠️ `fetch-client.js` n'existe PAS — voir Dev Notes)
6. **And** le poller d'Epic 1 (Story 1.6) est branché pour détecter les changements de visibilité

## Tasks / Subtasks

### Backend — Extension du sync service (AC: #4, #6)

- [x] **T1** Étendre `src/services/sync.js` — `getSyncPayload()` doit inclure les compteurs d'entités visibles par type (AC: #4, #6)
  - [x] T1.1 Importer `getVisibleIds` de `src/services/visibility.js`
  - [x] T1.2 Pour chaque type (`systems`, `factions`, `ship_models`) : appeler `getVisibleIds(type, tableId, role)` et renvoyer `{ count: ids.length }` dans `entities`
  - [x] T1.3 Shape du payload : `{ version: 1, timestamp, entities: { systems: { count: N }, factions: { count: N }, ship_models: { count: N } } }`
- [x] **T2** Tests unitaires sync service étendu (AC: #4, #6)
  - [x] T2.1 Test : sync payload contient les clés `systems`, `factions`, `ship_models` avec `count`
  - [x] T2.2 Test : joueur ne voit que les compteurs de ses entités visibles
  - [x] T2.3 Test : MJ voit le total de toutes les entités

### Frontend — Page & navigation (AC: #1, #2)

- [x] **T3** Créer `public/compendium.html` — shell HTML (AC: #1)
  - [x] T3.1 Copier le pattern exact de `public/index.html` : `<head>` (charset, viewport, Tailwind CSS), `<body class="bg-gray-900 text-gray-100 min-h-screen flex flex-col">`, header identique, `<script type="module" src="/js/compendium/compendium-app.js">`
  - [x] T3.2 3 onglets de navigation : Systèmes / Factions / Vaisseaux (boutons/liens avec states actif/inactif)
  - [x] T3.3 Container principal avec une zone par onglet (`#tab-systems`, `#tab-factions`, `#tab-ship-models`), seul l'onglet actif visible
  - [x] T3.4 Zone empty state global (si aucune donnée du tout) : message narratif thématique
  - [x] T3.5 Lien retour vers dashboard dans le header ou navigation

- [x] **T4** Créer `public/js/compendium/compendium-app.js` — module principal (AC: #1, #2, #5)
  - [x] T4.1 `import { initHeader } from '/js/shared/header.js'`
  - [x] T4.2 `import { getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js'`
  - [x] T4.3 Pattern init exact de `dashboard.js` : `initHeader()` → vérif user → vérif tableId → redirect si absent
  - [x] T4.4 Charger les 3 endpoints en parallèle : `GET /api/systems`, `GET /api/factions`, `GET /api/ship-models`
  - [x] T4.5 Stocker dans state module-level : `let state = { systems: [], factions: [], ship_models: [], activeTab: 'systems' }`
  - [x] T4.6 Navigation onglets : clic → mettre à jour `state.activeTab` → `render()`
  - [x] T4.7 Rendu conditionnel : si aucune entité (les 3 vides) → empty state global narratif
  - [x] T4.8 Rendu par onglet : si l'onglet courant est vide → empty state par catégorie (message thématique différent)

### Frontend — Rendu des entités (AC: #1)

- [x] **T5** Fonctions de rendu par type d'entité (AC: #1)
  - [x] T5.1 `renderSystems(systems)` — card list : nom, quadrant, faction, gouvernement, is_frontiere (⚠️ entier 0/1, afficher en booléen côté front), description tronquée
  - [x] T5.2 `renderFactions(factions)` — card list : nom, description, toute propriété utile
  - [x] T5.3 `renderShipModels(models)` — card list : nom, categorie, fabricant, description (⚠️ `armement_json`/`systemes_secondaires_json` sont du TEXT brut, NE PAS tenter de parser — déféré Story 3.2)
  - [x] T5.4 Style : cards avec Tailwind (`bg-gray-800 border border-gray-700 rounded-lg p-4`), hover effect, touch targets ≥ 44px

### Frontend — Toggle MJ (AC: #3)

- [x] **T6** Indicateur visibilité + toggle MJ (AC: #3)
  - [x] T6.1 Détecter le rôle : la réponse API contient `visible: boolean` sur chaque entité ssi MJ → utiliser ça comme détection (`'visible' in entity`)
  - [x] T6.2 MJ : ajouter icône œil (👁️ ouvert = visible, 👁️‍🗨️ barré = caché) + Tailwind classes pour état
  - [x] T6.3 Clic sur icône œil → action immédiate :
    - Révéler (`visible: false` → `true`) : toggle immédiat, pas de confirmation
    - Cacher (`visible: true` → `false`) : micro-confirmation (petit toast inline « Cacher ? » avec bouton confirmer, timeout auto 3s)
  - [x] T6.4 Optimistic UI : mettre à jour le DOM immédiatement AVANT l'appel API
  - [x] T6.5 Appel `PATCH /api/visibility/:entityType/:entityId` avec `{ visible: !entity.visible }`
  - [x] T6.6 Sur erreur API : rollback du DOM + notification d'erreur discrète
  - [x] T6.7 Touch target icône œil ≥ 44px × 44px (mobile)

### Frontend — Poller & badges (AC: #4, #6)

- [x] **T7** Intégrer le poller pour détecter les changements (AC: #4, #6)
  - [x] T7.1 `import { createPoller } from '/js/shared/poller.js'`
  - [x] T7.2 `createPoller({ onData: handleSyncData })` — démarrer au init
  - [x] T7.3 `handleSyncData(data)` : comparer `data.entities.systems.count` (etc.) avec `state.systems.length`
  - [x] T7.4 Si delta détecté sur un type → ajouter badge « nouveau contenu » sur l'onglet correspondant (petit point coloré ou texte discret)
  - [x] T7.5 Badge disparaît quand l'utilisateur clique sur l'onglet → recharger les données du type depuis l'API
  - [x] T7.6 Stocker `lastKnownCounts = { systems: N, factions: N, ship_models: N }` pour comparaison

### Tests (AC: tous)

- [x] **T8** Tests unitaires frontend (AC: #1, #2, #3, #4)
  - [x] T8.1 Fichier : `tests/unit/compendium-frontend.test.js`
  - [x] T8.2 Tests rendering : tab switching, active tab styling
  - [x] T8.3 Tests empty state : aucun donnée → message narratif affiché
  - [x] T8.4 Tests MJ toggle : détection rôle MJ via `visible` field, optimistic UI state change
  - [x] T8.5 Tests badge : count delta → badge affiché, tab click → badge retiré
- [x] **T9** Tests d'intégration sync service étendu (AC: #4, #6)
  - [x] T9.1 Fichier : `tests/integration/sync-compendium.test.js` (ou étendre `sync.test.js` existant)
  - [x] T9.2 `GET /api/sync` avec joueur : vérifie le shape `entities.systems.count` etc.
  - [x] T9.3 `GET /api/sync` avec MJ : vérifie que counts = total
  - [x] T9.4 Toggle visibility + re-sync : count change détecté
- [x] **T10** Ajouter les nouveaux fichiers test dans `package.json` scripts.test

## Dev Notes

### ⚠️ AVERTISSEMENT CRITIQUE : fetch-client.js N'EXISTE PAS

L'AC#5 mentionne `fetch-client.js` mais ce fichier n'existe pas. La fonction réelle est **`fetchWithTable()`** exportée depuis `public/js/shared/table-selector.js`. Toutes les pages existantes (dashboard.js) utilisent ce pattern :

```javascript
import { fetchWithTable } from '/js/shared/table-selector.js';
const res = await fetchWithTable('/api/endpoint');
const json = await res.json();
```

`fetchWithTable` ajoute automatiquement le header `X-Table-Id` depuis localStorage.

### Déféré de Story 2.2 — is_frontiere et JSON brut

- **`is_frontiere`** est renvoyé comme entier 0/1 par l'API (SQLite n'a pas de boolean). Le frontend DOIT convertir : `entity.is_frontiere ? 'Oui' : 'Non'` ou icône. Ne PAS envoyer de patch backend.
- **`armement_json`/`systemes_secondaires_json`** sont du TEXT brut (double-encoded JSON). NE PAS tenter de les parser/afficher dans cette story. Déféré à Story 3.2 (fiche détail).

### Pattern d'initialisation — copier dashboard.js EXACTEMENT

```javascript
import { initHeader } from '/js/shared/header.js';
import { getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';

async function init() {
  const user = await initHeader();
  if (!user) { window.location.href = '/login.html'; return; }
  const tableId = getActiveTableId();
  if (!tableId) { window.location.href = '/'; return; }
  // ... load compendium data
}
init();
```

### Empty states narratifs — textes thématiques

- **Global** (aucune donnée, tous onglets vides) : « Les archives du vaisseau sont encore verrouillées. Votre équipage n'a pas assez d'accréditations pour accéder aux données galactiques… »
- **Systèmes** (onglet vide) : « Aucun système stellaire cartographié. Vos capteurs longue portée n'ont encore rien détecté… »
- **Factions** (onglet vide) : « Aucune faction répertoriée. Les canaux diplomatiques sont silencieux… »
- **Vaisseaux** (onglet vide) : « Aucun modèle de vaisseau dans la base de données. Les chantiers navals n'ont rien publié… »

### Optimistic UI — pattern MJ toggle

```javascript
// 1. DOM update immédiat
entity.visible = !entity.visible;
renderEntity(entity);

// 2. API call en background
try {
  const res = await fetchWithTable(`/api/visibility/${entityType}/${entity.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible: entity.visible })
  });
  if (!res.ok) throw new Error('Toggle failed');
} catch {
  // 3. Rollback on failure
  entity.visible = !entity.visible;
  renderEntity(entity);
  showError('Erreur de synchronisation');
}
```

### Micro-confirmation pour cacher

Quand le MJ clique pour **cacher** (visible → false), afficher un élément inline temporaire :
- Petit message « Cacher aux joueurs ? » avec bouton « Confirmer »
- Auto-dismiss après 3 secondes (annule l'action)
- Si confirmé → exécuter le toggle
- PAS de modal bloquant

### Poller — extension du sync service

Le sync service actuel (`src/services/sync.js`) renvoie `entities: {}`. Il faut l'étendre pour inclure les compteurs de visibilité. Le frontend compare ces compteurs avec son état local pour détecter les nouveaux contenus.

**Attention** : le poller est branché côté joueur (pas MJ). Le MJ n'a pas besoin de badge puisqu'il fait les changements lui-même.

### Détection rôle MJ côté frontend

L'API renvoie `visible: boolean` sur chaque entité SEULEMENT pour le MJ. Pour le joueur, le champ `visible` n'existe pas. Donc :

```javascript
const isMJ = data.length > 0 && 'visible' in data[0];
// Ou: toute entité avec 'visible' → MJ
```

Si `data` est vide, pas de toggle possible → pas de problème de détection.

### Responsive mobile-first

- Touch targets ≥ 44px (boutons onglets, icônes toggle, cards)
- Espacement ≥ 8px entre cibles adjacentes
- Onglets : full-width sur mobile, tabs horizontaux sur desktop
- Cards : pleine largeur mobile, grille 2 colonnes desktop (si pertinent)
- Dark theme par défaut (sessions en soirée)

### Structure des fichiers à créer/modifier

| Fichier | Action | Détail |
|---------|--------|--------|
| `public/compendium.html` | CRÉER | Page shell — copier pattern index.html |
| `public/js/compendium/compendium-app.js` | CRÉER | Module principal compendium |
| `src/services/sync.js` | MODIFIER | Ajouter compteurs visibilité dans payload |
| `tests/unit/compendium-frontend.test.js` | CRÉER | Tests unitaires frontend logic |
| `tests/integration/sync-compendium.test.js` | CRÉER | Tests intégration sync étendu |
| `package.json` | MODIFIER | Ajouter 2 chemins de test |

### API endpoints consommés

| Endpoint | Méthode | Body | Réponse joueur | Réponse MJ |
|----------|---------|------|-----------------|------------|
| `/api/systems` | GET | — | `{ data: [{ id, quadrant, nom, faction, is_frontiere, route, gouvernement, description }] }` | idem + `visible: bool` par entité |
| `/api/factions` | GET | — | `{ data: [{ id, nom, ... }] }` | idem + `visible: bool` |
| `/api/ship-models` | GET | — | `{ data: [{ id, nom, categorie, fabricant, ... }] }` | idem + `visible: bool` |
| `/api/visibility/:type/:id` | PATCH | `{ visible: bool }` | 403 (MJ only) | `{ data: { entityType, entityId, visible } }` |
| `/api/sync` | GET | — | `{ data: { version, timestamp, entities: { systems: { count }, factions: { count }, ship_models: { count } } } }` | idem (counts = total) |

### Anti-patterns — NE PAS FAIRE

- ❌ Ne PAS créer `fetch-client.js` — utiliser `fetchWithTable` de `table-selector.js`
- ❌ Ne PAS parser `armement_json`/`systemes_secondaires_json` (déféré 3.2)
- ❌ Ne PAS ajouter de pagination (AC: pas requis, < 200 entités)
- ❌ Ne PAS utiliser de framework (React, Vue, etc.) — vanilla JS ES modules
- ❌ Ne PAS créer de store centralisé — state module-level simple
- ❌ Ne PAS utiliser de bundler — ES modules natifs
- ❌ Ne PAS cacher avec modal bloquant — micro-confirmation inline uniquement
- ❌ Ne PAS exposer le nombre total d'entités au joueur (plausible deniability)

### Project Structure Notes

L'arborescence cible suit l'architecture définie :
```
public/
├── compendium.html                    # NOUVEAU
├── js/
│   ├── compendium/
│   │   └── compendium-app.js          # NOUVEAU
│   └── shared/
│       ├── header.js                  # existant, réutilisé
│       ├── table-selector.js          # existant, fetchWithTable
│       └── poller.js                  # existant, réutilisé
src/
└── services/
    └── sync.js                        # MODIFIÉ (compteurs)
tests/
├── unit/
│   └── compendium-frontend.test.js    # NOUVEAU
└── integration/
    └── sync-compendium.test.js        # NOUVEAU
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — §3a REST, §4a-4e Frontend]
- [Source: _bmad-output/planning-artifacts/prd.md — FR15, FR38, Journey 3, Journey 5]
- [Source: _bmad-output/implementation-artifacts/2-2-compendium-api-routes-lecture-filtrees.md — Dev Notes]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — D1 JSON, D2 is_frontiere]
- [Source: public/js/dashboard.js — init pattern]
- [Source: public/js/shared/poller.js — createPoller API]
- [Source: src/routes/visibility.js — PATCH toggle endpoint]
- [Source: src/services/sync.js — payload skeleton à étendre]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

### Completion Notes List

- Sync service étendu avec compteurs de visibilité par type d'entité
- Page compendium.html créée avec navigation par onglets (Systèmes/Factions/Vaisseaux)
- compendium-app.js : chargement parallèle des 3 endpoints, rendu par cards Tailwind, empty states narratifs
- Toggle MJ avec optimistic UI + micro-confirmation inline pour cacher (auto-dismiss 3s)
- Poller intégré côté joueur uniquement : badges sur onglets quand delta détecté
- Détection MJ via présence du champ `visible` sur les entités
- ship_models rendu avec colonnes réelles (classe, origine) — armement_json/systemes_secondaires_json non parsés (déféré 3.2)
- is_frontiere affiché comme "⚠️ Frontière" (conversion entier 0/1)
- 168 tests, 35 suites, 0 échec

### Review Findings

- [x] [Review][Patch] renderShipModels() n'affiche pas la `description` — T5.3 [compendium-app.js]
- [x] [Review][Patch] Race condition toggle MJ — clics rapides multiples sans guard `pending` [compendium-app.js]
- [x] [Review][Patch] Poller dupliqué sur retry — `init()` ne tue pas le poller existant [compendium-app.js]
- [x] [Review][Patch] `entity.id` non échappé dans attribut `data-id` — injection possible [compendium-app.js]
- [x] [Review][Patch] `reloadTab()` crash si `json.data` est null [compendium-app.js]
- [x] [Review][Patch] `switchTab()` double render inutile quand badge actif [compendium-app.js]
- [x] [Review][Patch] Bouton "Confirmer" micro-confirmation min-h-[32px] → 44px (T6.7) [compendium-app.js]
- [x] [Review][Defer] `getVisibleIds()` exceptions DB non capturées — pré-existant [visibility.js]
- [x] [Review][Defer] `poller.js` callbacks onData non wrappées en try-catch — pré-existant [poller.js]
- [x] [Review][Defer] `poller.js` fetchFn potentiellement null si import dynamique échoue — pré-existant [poller.js]
- [x] [Review][Defer] `routes/sync.js` pas de try-catch autour de getSyncPayload() — pré-existant [routes/sync.js]

### Change Log

- `src/services/sync.js` — ajout compteurs visibilité via getVisibleIds
- `public/compendium.html` — NOUVEAU, shell HTML avec onglets
- `public/js/compendium/compendium-app.js` — NOUVEAU, module principal ~280 lignes
- `tests/unit/sync-service.test.js` — 3 tests visibilité ajoutés, assertions existantes mises à jour
- `tests/unit/compendium-frontend.test.js` — NOUVEAU, 16 tests logique pure
- `tests/integration/sync.test.js` — assertion mise à jour (entities avec counts)
- `tests/integration/sync-compendium.test.js` — NOUVEAU, 4 tests intégration
- `package.json` — 2 chemins test ajoutés

### File List

| Fichier | Action |
|---------|--------|
| `src/services/sync.js` | MODIFIÉ |
| `public/compendium.html` | NOUVEAU |
| `public/js/compendium/compendium-app.js` | NOUVEAU |
| `tests/unit/sync-service.test.js` | MODIFIÉ |
| `tests/unit/compendium-frontend.test.js` | NOUVEAU |
| `tests/integration/sync.test.js` | MODIFIÉ |
| `tests/integration/sync-compendium.test.js` | NOUVEAU |
| `package.json` | MODIFIÉ |
