# Story 3.1 — Carte Interactive & Itinéraire (CSS Grid, Option B)

**Epic :** 3 — Carte Interactive & Révélation en Session  
**Status :** backlog  
**Date :** 2026-04-21  
**Origine :** Sprint Change Proposal 2026-04-21 + décision produit (Option B)

---

## Décision produit

**Option B retenue :** La page `public/itineraire.html` est réécrite en reprenant `donnee_base/itineraire_backup_20260419.html` comme base — avec la carte CSS grid 40×40 + image `carte_ma.jpg` en fond, et le calcul d'itinéraire intégré. C'est le **cœur de l'app**, vers lequel le Dashboard et le Hub envoient l'utilisateur.

Le catalogue de vaisseaux (fiches, modèles) est extrait vers `public/vaisseaux.html` (Story 5.1). Sur la carte, le **sélecteur de vaisseau actif** reste pour paramétrer le calcul.

`public/carte_interactive.html` (canvas) : retiré de la navigation principale.

---

## Story

As a MJ ou joueur connecté,  
I want to open the interactive galaxy map with itinerary calculation,  
so that I can plan routes, generate perils, and navigate the campaign universe from a single spatial view.

---

## Fichier de référence

**Source :** `donnee_base/itineraire_backup_20260419.html`  
**Cible :** `public/itineraire.html` (remplacement complet du fichier actuel)

Le nouveau fichier est un **ES module** conforme à la stack Express. Toute la logique de calcul est conservée telle quelle depuis le backup. Seule la **source de données** change (JSON inline + localStorage → API Express).

---

## Acceptance Criteria

```gherkin
Given un utilisateur connecté avec une table active
When il ouvre /itineraire.html
Then la carte CSS grid s'affiche avec l'image de fond carte_ma.jpg
And les quadrants ayant des systèmes révélés sont marqués visuellement

Given l'utilisateur est MJ
When il clique sur un quadrant avec des systèmes
Then le bottom-sheet (mobile) ou panneau desktop affiche les infos du quadrant
And il peut ajouter ce quadrant comme Départ, Étape ou Arrivée

Given des points de route sont définis
When le MJ clique sur "Calculer"
Then les segments IP/HS sont calculés, les périls générés
And le résultat est sauvegardé via POST /api/travel-routes

Given le MJ sélectionne un vaisseau actif depuis le sélecteur en haut de page
When il calcule un itinéraire
Then les stats du modèle du vaisseau (vitesse_croisiere, vitesse_hyperspatiale, autonomie) sont utilisées

Given l'utilisateur n'est pas connecté
When il ouvre /itineraire.html
Then il est redirigé vers /login.html

Given aucune table n'est active (pas de X-Table-Id en localStorage)
When l'utilisateur arrive sur la page
Then un message l'invite à sélectionner une table depuis l'accueil
```

---

## Mapping des sources de données

| Donnée | Backup (legacy) | Nouveau backend |
|---|---|---|
| Quadrants + systèmes | `<script id="quadrants-data">` inline | `GET /api/data/t/:tid/all` → champ `quadrants` |
| Vaisseaux de la table | localStorage | `GET /api/ships` (via `fetchWithTable`) |
| Vaisseau actif | `table_state.active_ship_id` | `GET /api/data/t/:tid/all` → champ `activeShipId` |
| Écriture vaisseau actif | `MA.setActiveShip()` | `POST /api/data/t/:tid/state` avec `{ shipId }` |
| Modèles de vaisseaux | inline JS | `GET /api/ship-models` (via `fetchWithTable`) |
| Données périls | localStorage + JSON inline | `GET /api/data/t/:tid/all` → champ `perilsData` |
| Assignments périls | localStorage | `GET /api/data/t/:tid/all` → champ `perilAssignments` |
| Tables de périls custom | localStorage | `GET /api/data/t/:tid/all` → champ `customTables` |
| Historique voyages | localStorage | `GET /api/travel-routes` (list) + `POST` (save) |

---

## Tasks

### Task 0 — ⚠️ PRÉREQUIS : Asset image carte

Vérifier si `public/carte_MA.png` ou `public/carte_ma.jpg` existe.

```powershell
Test-Path "public/carte_MA.png"
Test-Path "public/carte_ma.jpg"
```

Si absent : copier `donnee_base/carte_MA.png` → `public/carte_MA.png`

Dans `public/itineraire.html`, ajuster le CSS :
```css
#carte { background: url('/carte_MA.png') 0 0/800px 800px no-repeat; }
```

---

### Task 1 — ⚠️ CRITIQUE : Intégrer la constante LETTRES grecques

Le backup utilise l'array `LETTRES` + la fonction `coordXY` pour positionner les systèmes. Cette logique doit être **reproduite dans le nouveau module** — les quadrants MA utilisent des lettres grecques (`"Κ-8"`, `"Α′-29"`) et non des lettres latines.

```javascript
// Ordre exact des 40 colonnes du jeu Metal Adventures
const LETTRES_MA = [
  "Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ",
  "Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ",
  "Φ","Χ","Ψ","Ω",
  "Α′","Β′","Γ′","Δ′","Ε′","Ζ′","Η′","Θ′",
  "Ι′","Κ′","Λ′","Μ′","Ν′","Ξ′","Ο′","Π′"
];

function coordXY(coord) {
  const dashIdx = coord.lastIndexOf('-');
  const letter = coord.slice(0, dashIdx);
  const number = parseInt(coord.slice(dashIdx + 1), 10);
  return { x: LETTRES_MA.indexOf(letter), y: 40 - number };
}
```

**Aussi corriger `public/js/map/map-service.js`** : même problème dans `parseQuadrantCoords`. Remplacer la regex `[A-Z]+` par la même logique `LETTRES_MA.indexOf`.

---

### Task 2 — Vérifier et monter `/api/data` dans `server.js`

`GET /api/data/t/:tid/all` est le endpoint bulk-load le plus efficace. Il retourne en une requête : quadrants, ships, shipModels, perilsData, customTables, perilAssignments, history, activeShipId.

**Vérifier dans `server.js` :**
```javascript
import dataRoutes from './src/routes/data.js';
app.use('/api/data', dataRoutes);
```

⚠️ `src/routes/data.js` est en **CommonJS** (`require`). Il faut soit :
- Le convertir en ESM (remplacer `require` par `import`, `module.exports` par `export default`)
- Soit utiliser `createRequire` pour l'importer depuis server.js ESM

Si la conversion est trop lourde pour cette story, utiliser les endpoints séparés en fallback :
```javascript
// Fallback si /api/data non disponible :
GET /api/systems      → systèmes (grouper par quadrant côté client)
GET /api/ships        → vaisseaux
GET /api/ship-models  → modèles
GET /api/sync         → contient version + activeShipId + routes actives
```

---

### Task 3 — Réécrire `public/itineraire.html` depuis le backup

**Principe :** Le backup est la base HTML + CSS. Toutes les fonctions sont conservées. Seule la source de données change.

#### 3a — Supprimer le bloc `<script id="quadrants-data">`
JSON inline retiré. Les données viennent de l'API.

#### 3b — Supprimer `<script src="/js/api.js">` + auth overlay custom
Remplacer par une structure ES module :

```html
<!-- Dans <head>, remplacer le CDN Tailwind -->
<link rel="stylesheet" href="/css/tailwind.css">

<!-- À la fin du <body>, avant </body> -->
<script type="module" src="/js/itineraire.js"></script>
```

#### 3c — Créer `public/js/itineraire.js`

```javascript
import { initAuthUI } from '/js/shared/auth-ui.js';
import { getActiveTableId, fetchWithTable } from '/js/shared/table-selector.js';

// Auth guard
const currentUser = await initAuthUI();
if (!currentUser) {
  window.location.href = '/login.html';
  throw new Error('non autorisé');
}

// Table guard
const tableId = getActiveTableId();
if (!tableId) {
  document.body.innerHTML = `<div class="p-8 text-center text-gray-300">
    Aucune table sélectionnée. <a href="/" class="text-blue-400 underline">Retour à l'accueil</a>
  </div>`;
  throw new Error('pas de table');
}

// Bulk load
async function loadPageData() {
  const res = await fetchWithTable(`/api/data/t/${tableId}/all`, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement données');
  return res.json();
}

const pageData = await loadPageData();
const donnees = pageData.quadrants;       // { "Κ-8": [...systèmes], ... }
const ships = pageData.ships || [];
const shipModels = pageData.shipModels || [];
let activeShipId = pageData.activeShipId || '';
const perilsData = pageData.perilsData || {};
const customTables = pageData.customTables || [];
const perilAssignments = pageData.perilAssignments || { systems: {}, quadrants: {} };
const history = pageData.history || [];

// Puis appeler les fonctions d'init du backup (IIFE refactorisées ou copiées ici)
// initCarte(donnees), initShipSelector(ships, shipModels, activeShipId), etc.
```

#### 3d — Adapter `getParams()` pour lire depuis le modèle de vaisseau

Le backup lit `vitesse_croisiere`, `vitesse_hyperspatiale`, `autonomie` directement depuis le vaisseau. Dans la nouvelle DB, ces stats sont sur le **modèle**.

```javascript
function getParams() {
  const activeShip = ships.find(s => s.id === activeShipId);
  if (!activeShip) return { vcr: 2, vhs: 1, auto: 10 }; // defaults
  const model = shipModels.find(m => m.id === activeShip.model_id);
  return {
    vcr:  model?.vitesse_croisiere    || 2,
    vhs:  model?.vitesse_hyperspatiale || 1,
    auto: model?.autonomie             || 10,
    nom:  activeShip.name || activeShip.nom || 'Vaisseau'
  };
}
```

#### 3e — Adapter l'écriture du vaisseau actif

```javascript
async function setActiveShip(shipId) {
  activeShipId = shipId;
  await fetchWithTable(`/api/data/t/${tableId}/state`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipId })
  });
}
```

#### 3f — Adapter la sauvegarde de l'historique

Remplacer localStorage par POST vers travel-routes :
```javascript
async function saveCurrentTrip(trip, name) {
  await fetchWithTable('/api/travel-routes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name || `${trip.points[0]} → ${trip.points[trip.points.length - 1]}`,
      active: false
    })
  });
}
```

#### 3g — Retirer l'onglet "Vaisseaux" du modal admin

L'onglet de gestion CRUD des vaisseaux est retiré du modal admin de cette page. Il ira dans `public/vaisseaux.html` (Story 5.1).

**Garder dans le modal admin :**
- Onglet périls (tables customs, assignments quadrant/système)
- Onglet systèmes (édition MJ)

**Retirer :**
- `renderVaisseauxTab()`, `renderShipsList()`, formulaire add/edit ship, `SHIPS` object

#### 3h — Conserver toute la logique de calcul SANS MODIFICATION

Copier telles quelles depuis le backup sans changer une ligne :
- `roll2D6()`, `getFlatList()`, `getPeril()`, `resolvePeril()`, `genDayData()`
- `calculateTrip()`, `summaryHTML()`, `legsHTML()`, `renderTrip()`, `attachPerilEvents()`
- `getTableForLeg()`, `findPerilByNom()`, `calcHSDist()`
- `markPath()`, `initCarte()`, `refreshCarte()`
- Pan/zoom : `applyT()`, `initPanZoom()`, `centerMap()`
- Bottom-sheet : `onCellClick()`, `renderBSTripState()`
- Détail système : `showSystemDetail()`, `renderEditSystem()`

---

### Task 4 — Mise à jour `public/index.html` (Hub)

```html
<!-- Accès rapides : Itinéraire en PREMIER -->
<a href="/itineraire.html" class="...">🗺️ Carte & Itinéraire</a>
```

Supprimer ou rétrograder `carte_interactive.html` du hub.

---

### Task 5 — Mise à jour `public/dashboard.html` (Dashboard MJ)

Changer le lien "Carte Galactique" → `href="/itineraire.html"` avec le label "Itinéraire / Carte".

---

## Fichiers à créer / modifier

| Fichier | Action | Détail |
|---|---|---|
| `public/itineraire.html` | **Réécrire** | Base = backup, supprimer inline data + api.js, ajouter lien vers module ES |
| `public/js/itineraire.js` | **Créer** | Module ES : auth guard, table guard, data load, wiring API |
| `public/carte_MA.png` *(si absent)* | **Copier** | Depuis `donnee_base/carte_MA.png` |
| `public/js/map/map-service.js` | **Modifier** | Corriger `parseQuadrantCoords` (lettres grecques) |
| `public/index.html` | **Modifier** | Itinéraire en premier accès rapide |
| `public/dashboard.html` | **Modifier** | Lien → `/itineraire.html` |
| `server.js` *(si nécessaire)* | **Modifier** | Monter `/api/data` si absent |

**NE PAS MODIFIER :**
- `src/routes/ships.js`, `src/routes/travel-routes.js`, `src/routes/ship-models.js`
- `src/services/route-perils.js`
- La logique de calcul de route (copie fidèle du backup)

---

## Contexte technique

### `fetchWithTable` — ajouter `credentials: 'include'`
```javascript
// table-selector.js ne passe pas credentials par défaut.
// Toujours passer : { credentials: 'include' } dans les options.
fetchWithTable('/api/systems', { credentials: 'include' })
```

### Format réponse API standard
```json
{ "data": [...] }
{ "error": { "code": "...", "message": "...", "status": 400 } }
```

### Payload `GET /api/data/t/:tid/all`
```json
{
  "quadrants": { "Κ-8": [{ "nom": "Bazaar", "faction": "Barrens", ... }], ... },
  "ships": [{ "id": "uuid", "nom": "El barco del Sol", "model_id": "..." }],
  "shipModels": [{ "id": "fregate", "nom": "Frégate Légère", "vitesse_croisiere": 3, "vitesse_hyperspatiale": 2, "autonomie": 10, ... }],
  "activeShipId": "uuid-or-empty-string",
  "perilsData": { "spatial": { "categories": [...] }, "planete": { ... } },
  "customTables": [...],
  "perilAssignments": { "systems": { "Bazaar:spatial": "table-id" }, "quadrants": {} },
  "history": [{ "id": 1, "shipName": "...", "createdAt": "..." }]
}
```

### `POST /api/data/t/:tid/state` (vaisseau actif)
```json
// Body :
{ "shipId": "uuid" }
// Réponse : 200 OK
```

### Colonnes ships dans la DB
```
id, table_id, nom (→ name dans listShips), model_id, hull, crew, cargo_capacity, notes
```
Les stats de navigation (`vitesse_croisiere`, `vitesse_hyperspatiale`, `autonomie`) sont sur `ship_models`, pas sur `ships`.

---

## Known Unknowns

1. **`/api/data` monté dans `server.js` ?** — Vérifier. `src/routes/data.js` est CommonJS (`require`), peut nécessiter conversion ESM.
2. **`carte_ma.jpg` ou `carte_MA.png` ?** — Vérifier le nom exact dans `donnee_base/` et adapter le CSS.
3. **L'onglet Vaisseaux du backup couvre-t-il aussi les modèles ?** — Oui selon le code. Tout retirer (ira en Story 5.1).
4. **`GET /api/sync` retourne-t-il `active_ship_id` ?** — Vérifier `src/services/sync.js`. Si oui, peut servir de fallback polling pour la page.

---

## Definition of Done

- [ ] La carte CSS grid s'affiche avec l'image de fond réelle
- [ ] Les systèmes de la table "El barco del Sol" apparaissent aux bons quadrants grecs
- [ ] Pan/zoom tactile + bottom-sheet mobile fonctionnels
- [ ] Calcul d'itinéraire entre deux points → résultat avec perils
- [ ] Vaisseau actif sélectionnable, ses stats (du modèle) influencent le calcul
- [ ] Historique lisible depuis `GET /api/travel-routes`
- [ ] Utilisateur non connecté → redirect `/login.html`
- [ ] Hub et Dashboard MJ pointent vers `/itineraire.html`
- [ ] `public/carte_interactive.html` (canvas) absent de la navigation principale

---

## Story suivante

**Story 5.1 — Catalogue de Vaisseaux (`public/vaisseaux.html`)**  
Page dédiée : liste des vaisseaux de la table + fiches + modèles. CRUD MJ. Lien depuis le hub et depuis le sélecteur de vaisseau de la carte.

---

## Suggested Review Order

1. `server.js` — montage `/api/data` (Task 2)
2. `public/carte_MA.png` — asset image (Task 0)
3. `public/js/map/map-service.js` — fix coords grecques (Task 1)
4. `public/itineraire.html` — réécriture HTML/CSS (Task 3)
5. `public/js/itineraire.js` — module ES (Task 3)
6. `public/index.html` + `public/dashboard.html` — liens (Tasks 4 & 5)
