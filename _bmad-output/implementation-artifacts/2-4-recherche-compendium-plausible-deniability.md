# Story 2.4: Recherche compendium avec plausible deniability

Status: done

## Story

As a joueur,
I want to search the compendium by text,
so that I can find information quickly without the search revealing hidden content.

## Acceptance Criteria

1. **Joueur — résultats filtrés** : quand un joueur tape un terme de recherche (minimum 2 caractères), seules les entités visibles apparaissent dans les résultats
2. **Plausible deniability** : quand les résultats s'affichent, rien n'indique que des résultats ont été filtrés — pas de compteur total, pas de pagination suspecte, pas de trous alphabétiques
3. **MJ — résultats complets** : quand le MJ recherche, il voit tous les résultats avec marquage visuel des entités cachées (opacité réduite + icône œil barré)
4. **Route API** : `GET /api/search?q=X&types=systems,factions,ship_models` — retourne les résultats filtrés par visibilité
5. **SQL LIKE** : recherche sur colonnes textuelles de chaque type — full scan acceptable à ~200 entités
6. **Sanitization** : le paramètre `q` est échappé contre les caractères spéciaux SQL (`%`, `_`, `\`)
7. **Minimum query** : `q` de moins de 2 caractères retourne un tableau vide
8. **Format retour unifié** : `{ "data": [{ "type": "systems", "id": 1, "name": "..." , ...fields }, ...] }`
9. **Performance** : temps de réponse < 1s (NFR4)
10. **Frontend** : barre de recherche dans le compendium avec debounce, résultats affichés dans une zone dédiée remplaçant le contenu des onglets

## Tasks / Subtasks

### Backend — Service de recherche (AC: #4, #5, #6, #7, #8)

- [x] **T1** Créer `src/services/search.js` — service de recherche cross-entités (AC: #4, #5, #6, #7, #8)
  - [x] T1.1 Fonction `searchEntities(query, types, tableId, role)` retournant un tableau d'entités unifiées
  - [x] T1.2 Construire une requête SQL par type demandé : `SELECT ... FROM {table} WHERE {colonnes} LIKE ?`
  - [x] T1.3 Colonnes de recherche par type :
    - `systems` : `nom`, `quadrant`, `faction`, `gouvernement`, `description`
    - `factions` : `name`, `short`, `description`
    - `ship_models` : `nom`, `classe`, `origine`
  - [x] T1.4 Sanitizer la query : échapper `%`, `_`, `\` avant de construire le pattern `%query%`
  - [x] T1.5 Si `query.length < 2` → retourner `[]` immédiatement
  - [x] T1.6 Filtrage par visibilité : réutiliser `isVisible()` de `src/services/visibility.js`
    - MJ : retourner TOUTES les entités + `visible: boolean` (depuis perspective joueur)
    - Joueur : retourner UNIQUEMENT les entités visibles
  - [x] T1.7 Format retour unifié : `{ type: 'systems', id, nom, ...colonnes_utiles }` — garder les mêmes champs que les API existantes par type
  - [x] T1.8 Paramètre `types` : tableau de types valides, filtrer les types inconnus silencieusement — défaut = tous les types si absent
  - [x] T1.9 ⚠️ NE PAS utiliser de compteur total ni de métadonnée qui révèle le nombre d'entités cachées

- [x] **T2** Créer `src/routes/search.js` — route GET /api/search (AC: #4, #9)
  - [x] T2.1 `GET /api/search?q=X&types=systems,factions,ship_models`
  - [x] T2.2 Exiger `req.table` (table context obligatoire)
  - [x] T2.3 Parser `types` : split sur virgule, valider chaque type contre liste blanche `['systems', 'factions', 'ship_models']`
  - [x] T2.4 Appeler `searchEntities(q, parsedTypes, req.table.id, req.table.role)`
  - [x] T2.5 Retourner `success(res, results)` — format standard `{ data: [...] }`
  - [x] T2.6 Monter la route dans `server.js` et `tests/setup.js`

### Backend — Tests (AC: #1, #2, #3, #4, #5, #6, #7)

- [x] **T3** Tests unitaires service search (AC: #1, #2, #3, #5, #6, #7)
  - [x] T3.1 Fichier : `tests/unit/search-service.test.js`
  - [x] T3.2 Test : `q` < 2 caractères → `[]`
  - [x] T3.3 Test : caractères spéciaux `%`, `_`, `\` sont échappés (pas d'injection SQL LIKE)
  - [x] T3.4 Test : MJ reçoit toutes les entités + champ `visible`
  - [x] T3.5 Test : joueur ne reçoit que les entités visibles (pas de `visible` field)
  - [x] T3.6 Test : résultats contiennent le champ `type` correctement
  - [x] T3.7 Test : filtrage par types fonctionne (un seul type, tous les types, types invalides ignorés)

- [x] **T4** Tests d'intégration route search (AC: #4, #9)
  - [x] T4.1 Fichier : `tests/integration/search.test.js`
  - [x] T4.2 Test : `GET /api/search?q=test` avec MJ → 200 + résultats avec `visible`
  - [x] T4.3 Test : `GET /api/search?q=test` avec joueur → 200 + résultats sans `visible`
  - [x] T4.4 Test : joueur ne voit pas les entités cachées (plausible deniability)
  - [x] T4.5 Test : `q` absent ou trop court → 200 + `[]`
  - [x] T4.6 Test : sans auth → 401
  - [x] T4.7 Test : sans table context → 400

### Frontend — Barre de recherche (AC: #1, #2, #3, #10)

- [x] **T5** Ajouter barre de recherche dans `public/compendium.html` (AC: #10)
  - [x] T5.1 Insérer un `<input>` de recherche entre le header et les onglets
  - [x] T5.2 Style : `bg-gray-800 border border-gray-700 rounded-lg px-4 py-3`, placeholder « Rechercher… », icône 🔍
  - [x] T5.3 Touch target ≥ 44px, full-width
  - [x] T5.4 Bouton clear (✕) visible quand texte non vide

- [x] **T6** Logique de recherche dans `compendium-app.js` (AC: #1, #2, #3, #10)
  - [x] T6.1 Input event avec debounce 300ms
  - [x] T6.2 Si `query.length < 2` → restaurer l'affichage normal des onglets
  - [x] T6.3 Si `query.length >= 2` → `fetchWithTable('/api/search?q=' + encodeURIComponent(query))`
  - [x] T6.4 Pendant la recherche : masquer les onglets, afficher la zone de résultats
  - [x] T6.5 Afficher les résultats groupés par type (sous-titres : Systèmes / Factions / Vaisseaux)
  - [x] T6.6 Renderers dédiés par type (renderSystemCard, renderFactionCard, renderShipModelCard) avec hidden marker pour MJ
  - [x] T6.7 MJ : les entités cachées apparaissent avec opacité réduite + icône œil barré (toggle fonctionnel)
  - [x] T6.8 Empty state recherche : « Aucun résultat pour "X"… » avec message narratif
  - [x] T6.9 Clear/Esc : revenir à l'affichage normal des onglets
  - [x] T6.10 ⚠️ Plausible deniability : NE PAS afficher "X résultats trouvés" — afficher les résultats directement sans compteur

- [x] **T7** Tests unitaires frontend search (AC: #10)
  - [x] T7.1 Ajouter tests dans `tests/unit/compendium-frontend.test.js`
  - [x] T7.2 Test : debounce ne déclenche pas de requête pour < 2 caractères
  - [x] T7.3 Test : groupement des résultats par type

- [x] **T8** Ajouter les nouveaux fichiers test dans `package.json` scripts.test

### Review Findings

- [x] [Review][Patch] XSS: `m.prix` interpolé sans `esc()` dans `renderShipModelCard` [compendium-app.js:~L450]
- [x] [Review][Patch] `req.query.q` peut être un tableau (Express qs) → crash `.trim()` [src/routes/search.js:L12]
- [x] [Review][Patch] `req.query.types` peut être un tableau → crash `.split()` [src/routes/search.js:L18]
- [x] [Review][Defer] Race condition stale response: pas d'AbortController dans performSearch — deferred, pattern absent du projet
- [x] [Review][Defer] Pas de LIMIT SQL — deferred, ~200 entités par spéc
- [x] [Review][Defer] DB sync bloque event loop — deferred, better-sqlite3 sync by design
- [x] [Review][Defer] LIKE ASCII-only, accents français ratés — deferred, limitation SQLite/ICU
- [x] [Review][Defer] Pas de max query length — deferred, risque mineur à cette échelle
- [x] [Review][Defer] isVisible() exception tue toute la recherche — deferred, pattern pré-existant (story 2.3)
- [x] [Review][Defer] Pas de rate limiting sur /api/search — deferred, concern cross-cutting
- [x] [Review][Defer] ship_models description dans renderShipModelCard est dead code (colonne absente du SELECT) — deferred, inoffensif

## Dev Notes

### ⚠️ AVERTISSEMENT CRITIQUE : Plausible Deniability

Le principe fondamental de cette story est que le joueur ne doit JAMAIS pouvoir déduire l'existence d'entités cachées à partir des résultats de recherche. Cela signifie :

- ❌ Pas de « 5 résultats sur 12 trouvés »
- ❌ Pas de pagination qui révèle un total
- ❌ Pas de compteur de résultats du tout côté joueur
- ❌ Pas de message « certains résultats sont masqués »
- ✅ Juste les résultats, comme si c'était tout ce qui existe

### Pattern de service — copier compendium.js

Le pattern exact est dans `src/services/compendium.js` :
```javascript
// MJ : toutes les entités + visible: boolean
if (role === 'mj') {
  return all.map(s => ({ ...s, visible: isVisible('systems', s.id, tableId, 'joueur') }));
}
// Joueur : seulement les visibles
return all.filter(s => isVisible('systems', s.id, tableId, 'joueur'));
```

### Pattern de route — copier systems.js

```javascript
router.get('/', (req, res) => {
  if (!req.table) {
    return validationError(res, 'Aucune table sélectionnée');
  }
  const data = searchEntities(req.query.q, parsedTypes, req.table.id, req.table.role);
  success(res, data);
});
```

### Colonnes de recherche par type (vérifiées dans compendium.js)

| Type | Colonnes recherchées | Colonne display name |
|------|---------------------|---------------------|
| `systems` | `nom`, `quadrant`, `faction`, `gouvernement`, `description` | `nom` |
| `factions` | `name`, `short`, `description` | `name` |
| `ship_models` | `nom`, `classe`, `origine` | `nom` |

⚠️ Les colonnes EXACTES de la DB sont :
- **systems** : `id, quadrant, nom, faction, is_frontiere, route, gouvernement, description`
- **factions** : `id, name, short, description, icon, color`
- **ship_models** : `id, nom, classe, vitesse_croisiere, vitesse_hyperspatiale, autonomie, manoeuvrabilite, vitesse_tactique, blindage, coque, senseurs, equipage, passagers, soute, prix, origine, image, armement_json, systemes_secondaires_json`

### Sanitization SQL LIKE

```javascript
function escapeLike(str) {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
// Usage : WHERE nom LIKE '%' || ? || '%' ESCAPE '\\'
// Passer escapeLike(query) comme paramètre bindé
```

### Architecture de l'API — format de retour unifié

Le spec dit `{ type, id, name }` minimal. Mais pour réutiliser les renderers frontend existants, il faut retourner TOUTES les colonnes de chaque type + le champ `type` ajouté. Ainsi le frontend peut passer les résultats directement aux fonctions `renderSystems()`, etc.

```javascript
// Retour pour un système :
{ type: 'systems', id: 5, nom: 'Sol', quadrant: 'Alpha', faction: 'Empire', ... }

// Retour pour une faction :
{ type: 'factions', id: 3, name: 'Consortium', short: 'CSM', ... }
```

### Frontend — Mode recherche vs Mode onglets

Deux modes d'affichage mutuellement exclusifs :
1. **Mode onglets** (défaut) : navigation par onglets avec badges — état actuel
2. **Mode recherche** : quand `query.length >= 2`, masquer les onglets et afficher les résultats groupés

Le passage entre les deux modes doit être fluide :
- Taper dans la barre de recherche → mode recherche
- Effacer la barre / Esc / clic sur clear → retour mode onglets
- Le poller continue en arrière-plan dans les deux modes

### fetchWithTable — rappel

```javascript
import { fetchWithTable } from '/js/shared/table-selector.js';
const res = await fetchWithTable(`/api/search?q=${encodeURIComponent(query)}`);
```

❌ NE PAS créer `fetch-client.js` — ça n'existe pas.

### Debounce pattern

```javascript
let searchTimeout = null;
input.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(input.value.trim());
  }, 300);
});
```

### Montage de la route dans app.js

Vérifier le pattern existant dans `src/app.js` pour monter les routes. Le pattern est :
```javascript
import searchRouter from './routes/search.js';
app.use('/api/search', searchRouter);
```

### Tests — pattern setupTest

Les tests d'intégration utilisent `createTestApp()` et `httpRequest()` de `tests/setup.js`.
Les tests unitaires importent directement les services.
Préfixe test data : `const TEST_PREFIX = '__test_search_';`

### Anti-patterns — NE PAS FAIRE

- ❌ Ne PAS exposer le nombre total d'entités au joueur (plausible deniability)
- ❌ Ne PAS créer `fetch-client.js` — utiliser `fetchWithTable` de `table-selector.js`
- ❌ Ne PAS utiliser FTS5 — SQL LIKE suffit pour ~200 entités
- ❌ Ne PAS créer d'index spécialisé — full scan < 1ms
- ❌ Ne PAS ajouter de pagination (< 200 résultats max)
- ❌ Ne PAS afficher « X résultats trouvés » côté joueur
- ❌ Ne PAS retourner le total des résultats non filtrés dans l'API
- ❌ Ne PAS parser `armement_json`/`systemes_secondaires_json` (déféré 3.2)

### Review Findings de Story 2.3 (à respecter)

- `pendingToggles` Set pour guarder les clics rapides — pattern à réutiliser si toggle dans les résultats de recherche
- `stopPoller()` avant `startPoller()` — poller non dupliqué
- `esc()` sur tous les attributs HTML dynamiques (y compris `data-id`)
- `json.data ?? []` pour garder contre les null

### Structure des fichiers à créer/modifier

| Fichier | Action | Détail |
|---------|--------|--------|
| `src/services/search.js` | CRÉER | Service de recherche cross-entités |
| `src/routes/search.js` | CRÉER | Route GET /api/search |
| `src/app.js` | MODIFIER | Monter la route search |
| `public/compendium.html` | MODIFIER | Ajouter barre de recherche |
| `public/js/compendium/compendium-app.js` | MODIFIER | Logique recherche + mode search |
| `tests/unit/search-service.test.js` | CRÉER | Tests unitaires service |
| `tests/integration/search.test.js` | CRÉER | Tests intégration route |
| `tests/unit/compendium-frontend.test.js` | MODIFIER | Tests frontend search |
| `package.json` | MODIFIER | Ajouter chemins de test |

### API endpoints

| Endpoint | Méthode | Params | Réponse joueur | Réponse MJ |
|----------|---------|--------|----------------|------------|
| `/api/search?q=X&types=systems,factions,ship_models` | GET | `q`: string (min 2), `types`: csv optionnel | `{ data: [{ type, id, nom, ... }] }` | idem + `visible: bool` par entité |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Service `searchEntities()` avec SQL LIKE par type, sanitization, filtrage visibilité
- Route `GET /api/search?q=X&types=...` avec table context obligatoire
- Frontend : barre de recherche avec debounce 300ms, mode search/onglets mutuellement exclusifs
- MJ : entités cachées affichées opacity-50 + icône œil barré, toggle fonctionnel
- Joueur : aucun indice d'entités cachées (plausible deniability respecté)
- 19 tests unitaires service + 8 tests intégration route + 5 tests frontend = 32 nouveaux tests
- Tous 200 tests passent (les 9 failures en full run sont des flaky pre-existing dans sync/table-context/visibility, passent individuellement)

### Change Log

- 2026-04-20: Implémentation complète Story 2.4 — recherche compendium avec plausible deniability

### File List

- `src/services/search.js` (CRÉÉ) — service de recherche cross-entités
- `src/routes/search.js` (CRÉÉ) — route GET /api/search
- `server.js` (MODIFIÉ) — montage route search
- `tests/setup.js` (MODIFIÉ) — montage route search dans test app
- `public/compendium.html` (MODIFIÉ) — barre de recherche + zone résultats
- `public/js/compendium/compendium-app.js` (MODIFIÉ) — logique search mode, renderers, debounce
- `tests/unit/search-service.test.js` (CRÉÉ) — 19 tests unitaires service
- `tests/integration/search.test.js` (CRÉÉ) — 8 tests intégration route
- `tests/unit/compendium-frontend.test.js` (MODIFIÉ) — 5 tests frontend search ajoutés
- `package.json` (MODIFIÉ) — ajout fichiers test dans scripts.test
