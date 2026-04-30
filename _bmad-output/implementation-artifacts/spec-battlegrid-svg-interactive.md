---
title: 'Battlegrid SVG interactive — Combat spatial (Phase A)'
type: 'feature'
created: '2026-04-30'
status: 'done'
baseline_commit: 'd4c5360812184e3ed63d987fb440c78c32335ccb'
context:
  - 'docs/analyse-combat-spatial.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Il n'existe aucun outil en session pour gérer le combat spatial Metal Adventures — le MJ doit tout faire sur papier (positions sur la Battlegrid, distance en K, arcs de tir, phase de combat).

**Approach:** Créer une page SPA `/combat-spatial.html` avec un radar SVG 600×600 interactif (drag-snap 25K), une liste de sessions de combat persistées en SQLite liées aux `game_tables`, et un panneau d'état de combat (phase, configuration, champ de bataille). Le schéma DB prévoira dès maintenant les colonnes pour les futures phases B (résolveur) et C (postes d'équipage).

## Boundaries & Constraints

**Always:**
- La page est accessible aux joueurs (lecture seule) et au MJ (lecture + modification) — même pattern que `tresors.html`
- Un combat est lié à une `game_table` via `requireTable()` middleware — `isMJ()` requis pour créer/modifier/supprimer
- Les positions sont snappées sur la grille à ±25K incrément le long des axes (horizontal = attaque, vertical = interception)
- Le schéma DB doit inclure dès maintenant : `phase`, `configuration`, `champ_bataille`, `combat_json` (état complet), `journal_json` (futur B), `crew_json` (futur C)
- SVG rendu en `viewBox="0 0 600 600"`, responsive dans son conteneur
- Conserver les patterns existants : `fetchWithTable`, `isMJ()`, `db.prepare().all()/.run()`, `success(res, data)`, `forbidden(res)`

**Ask First:**
- Si un vaisseau tiré de `ship_models` n'a pas de `classe` reconnue (autre que chasseur/frégate/croiseur) → demander quelle icône SVG utiliser
- Si la migration DB échoue à cause d'une table `combats_spatiaux` déjà existante avec un schéma différent → ne pas écraser, HALT

**Never:**
- Pas de dépendance Vue.js / React / bibliothèque graphique externe — SVG vanilla + JS vanilla uniquement
- Pas d'implémentation du résolveur de tests (B) ni des fiches de poste (C) dans ce spec
- Pas de calcul automatique de l'Avantage, de l'initiative ou des effets de tir — affichage seul
- Ne pas modifier le schéma des tables `ship_models` ni `game_tables`

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Créer un combat | POST `/api/combat-spatial` + `{nom, configuration, champ_bataille, vaisseaux[]}` | 201 + combat créé avec ID UUID, positions initiales configurées selon la configuration | 400 si `nom` vide ou `configuration` invalide |
| Charger la Battlegrid | GET `/api/combat-spatial/:id` | Radar SVG avec tous les tokens positionnés, phase et configuration affichées | 404 si combat inconnu ou d'une autre table |
| Déplacer un vaisseau | PATCH `/api/combat-spatial/:id/vaisseaux/:shipId` + `{trajectoire, position}` | Position mise à jour, token déplacé sur le radar, `updated_at` rafraîchi | 403 si non-MJ ; 400 si position non multiple de 25 or > 600K |
| Phase change | PATCH `/api/combat-spatial/:id` + `{phase}` | Phase et indicateur visuel mis à jour, impossible de revenir en arrière (approche→tournoyant irréversible) | 400 si transition invalide |
| Joueur sans MJ | GET page | Radar en lecture seule (pas de drag, pas de boutons edit) | Aucun, côté client via `isMJ()` |
| Aucun combat actif | GET `/api/combat-spatial` (liste vide) | Aside affiche « Aucun combat actif » + bouton « Nouveau combat » (MJ) | — |

</frozen-after-approval>

## Code Map

- `src/database.js` — ajouter migration `combats_spatiaux` + `combat_ships` dans l'initialisation
- `src/routes/combat-spatial.js` — nouveau : CRUD sessions de combat, GET liste, GET détail, POST créer, PATCH état/vaisseaux, DELETE
- `public/combat-spatial.html` — nouvelle page SPA, structure aside + main, import Tailwind compilé
- `public/js/combat-spatial-app.js` — SPA principale : gestion liste, chargement combat, orchestration
- `public/js/combat-radar.js` — composant SVG pur : rendu radar, tokens, drag-snap, arcs visuels
- `server.js` — monter la route `/api/combat-spatial`
- `public/js/shared/header.js` — ajouter lien nav vers `/combat-spatial.html` (visible si MJ ou table active)
- `tests/integration/combat-spatial.test.js` — tests CRUD + validations

## Tasks & Acceptance

**Execution:**
- [x] `src/database.js` — Ajouter dans `initDatabase()` la migration `combats_spatiaux` (id TEXT PK, table_id, nom, statut, phase, configuration, champ_bataille, combat_json, journal_json, crew_json, notes, created_by, created_at, updated_at) et `combat_ships` (id TEXT PK, combat_id FK ON DELETE CASCADE, ship_model_id TEXT, nom, camp TEXT CHECK IN ('joueurs','ennemis','neutres'), trajectoire, position_k INTEGER, orientation, avantage, structure_actuelle, structure_max, destroyed BOOLEAN DEFAULT 0, sort_order) — schéma complet dès maintenant pour éviter migrations cassantes en B/C
- [x] `src/routes/combat-spatial.js` — Créer le router Express : GET `/` (liste pour la table), POST `/` (créer, MJ only), GET `/:id` (détail + ships), PATCH `/:id` (mettre à jour phase/config/champ), PATCH `/:id/ships/:shipId` (déplacer vaisseau — position, trajectoire, avantage, état), DELETE `/:id` (MJ only) — utiliser `requireTable`, `requireAuth`, `isMJ`, `success/forbidden/notFound` helpers du projet
- [x] `public/js/combat-radar.js` — Classe `CombatRadar` : génère SVG 600×600 viewBox, 3 anneaux (r=60/150/300–palette #1a5c2a), 4 axes, labels 100K/250K/500K, tokens par classe (path triangle/rect/polygon), couleurs par camp (vert/rouge/jaune), drag-snap sur multiples de 15px (=25K), ligne tiretée contact visuel, arc de tir en overlay au hover. Émet événements custom `ship-moved` et `ship-selected`.
- [x] `public/js/combat-spatial-app.js` — Classe `CombatSpatialApp` : fetch liste de combats via `fetchWithTable`, instancie `CombatRadar` dans `#radar-container`, panneau de détail (phase clock, configuration, champ de bataille), boutons MJ (Ajouter vaisseau depuis ship_models, changer phase, supprimer combat), vue lecture seule si `!isMJ()`. Écoute `ship-moved` → PATCH API.
- [x] `public/combat-spatial.html` — Page HTML avec layout aside (liste sessions) + main (radar + panneau contrôle), imports `/js/combat-radar.js` et `/js/combat-spatial-app.js`, import CSS compilé Tailwind
- [x] `server.js` — `import combatSpatialRoutes from './src/routes/combat-spatial.js'` + `app.use('/api/combat-spatial', combatSpatialRoutes)`
- [x] `public/js/shared/header.js` — Ajouter entrée de navigation "Combat spatial" avec lien `/combat-spatial.html`, visible uniquement si `getActiveTableId()` est défini
- [x] `tests/integration/combat-spatial.test.js` — Couvrir : créer combat valide (201), créer sans nom (400), déplacer vaisseau avec position non-multiple-de-25 (400), accès sans être MJ (403 sur POST/PATCH/DELETE), transition de phase invalide (400), vaisseau inconnu (404)

**Acceptance Criteria:**
- Étant donné un MJ avec une table active, quand il ouvre `/combat-spatial.html`, il voit la liste de ses combats et peut créer un nouveau combat avec configuration Face-à-face
- Étant donné un combat actif avec 2 vaisseaux, quand le MJ glisse un token sur le radar, la position est snappée au multiple de 25K le plus proche et persistée en DB
- Étant donné un joueur (non-MJ), quand il charge la page, il voit le radar en lecture seule (drag désactivé, boutons d'édition absents)
- Étant donné la phase « approche », quand le MJ clique « Passer au combat tournoyant », la phase change et l'indicateur visuel se met à jour
- Étant donné un vaisseau positionné hors d'une trajectoire, l'API retourne 400

## Design Notes

**Drag-snap SVG** : convertir les coordonnées de drag (pixels) en distance en K avec `roundToNearest(px, 15) * (25/15)`, puis recalculer le pixel snappé. Tous les tokens restent sur les axes (horizontal ou vertical) — le drag est contraint à 1D selon la `trajectoire` du vaisseau.

**Configurations de départ** (positions initiales) — initialiser en POST selon `configuration` :
- `face-a-face` : vaisseau A à +200K axe attaque, vaisseau B à -200K
- `filature` : vaisseau A à +100K, vaisseau B à +225K (même axe, même sens)
- `interception-reussie` : vaisseaux sur axes opposés, position 0
- `interception-ratee` : vaisseaux sur axes perpendiculaires, ±200K chacun
- `accostage` : tous à 0K

**Tokens SVG** (viewBox interne 20×20) :
```
chasseur  : <polygon points="10,2 18,18 2,18"/>
frégate   : <rect x="2" y="4" width="16" height="12"/>
croiseur  : <polygon points="10,2 18,10 10,18 2,10"/>
inconnu   : <circle cx="10" cy="10" r="8"/>
```

## Verification

**Commands:**
- `node --experimental-vm-modules node_modules/.bin/jest tests/integration/combat-spatial.test.js --no-coverage` — expected: toutes les assertions passent, 0 échec
- `node -e "const db=require('./src/database.js'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'combat%'\").all())"` — expected: `[{name:'combats_spatiaux'},{name:'combat_ships'}]`

**Manual checks:**
- Ouvrir `/combat-spatial.html` en tant que MJ → boutons « Nouveau combat » et formulaire création visibles
- Créer un combat Face-à-face → 2 tokens apparaissent sur le radar aux positions ±200K axe horizontal
- Glisser un token → token snappé à 25K, position mise à jour sans rechargement de page
- Se connecter comme joueur → même page, radar visible, aucun bouton d'édition, drag désactivé

## Suggested Review Order

**DB Schema**

- Tables `combats_spatiaux` + `combat_ships` with FK cascade; all future-phase columns (journal, crew) included now.
  [`database.js:536`](../../src/database.js#L536)

**API — Domain constants & helpers**

- `VALID_PHASES`, `PHASE_ORDER`, `INITIAL_POSITIONS` — face-à-face places ships at opposite signs (±200K).
  [`combat-spatial.js:25`](../../src/routes/combat-spatial.js#L25)

- `requireTable()` + `isMJ()` — auth pattern matching existing project routes.
  [`combat-spatial.js:58`](../../src/routes/combat-spatial.js#L58)

**API — Creation & position logic**

- POST /: default ship placement uses `pos` (not `Math.abs(pos)`) so face-à-face places ships at −200 and +200.
  [`combat-spatial.js:142`](../../src/routes/combat-spatial.js#L142)

**API — Phase transition**

- PATCH /: irréversibility enforced via `PHASE_ORDER` comparison; config invalid → 400 (not silent fallback).
  [`combat-spatial.js:216`](../../src/routes/combat-spatial.js#L216)

**API — Ship update & NaN guards**

- PATCH /ships/:id: `Number.isFinite()` guards on `avantage` and `structure_actuelle`; empty `nom` rejected.
  [`combat-spatial.js:325`](../../src/routes/combat-spatial.js#L325)

**SVG Radar — Rendering**

- `CombatRadar` constructor; `render(combat)` is the entry point for full SVG draw.
  [`combat-radar.js:40`](../../public/js/combat-radar.js#L40)

- `_drawShip()` — token shapes by class (triangle/rect/diamond/circle), colored by camp.
  [`combat-radar.js:290`](../../public/js/combat-radar.js#L290)

**SVG Radar — Drag-snap**

- `_startDrag` / `_onDragMove` / `_onDragEnd` — 1D constrained drag, snap to 15 px = 25K, emits `ship-moved`.
  [`combat-radar.js:421`](../../public/js/combat-radar.js#L421)

**SPA Application**

- `CombatSpatialApp` orchestrates list, detail render, MJ controls, drag event → PATCH API.
  [`combat-spatial-app.js:45`](../../public/js/combat-spatial-app.js#L45)

**HTML Page**

- Two-column layout (aside + radar panel); `#ship-modal` and `#combat-modal` for CRUD forms.
  [`combat-spatial.html:1`](../../public/combat-spatial.html#L1)

**Server mount & Navigation**

- Route mounted after chasses-tresor; nav link shown to all roles (not MJ-only) when table active.
  [`server.js:33`](../../server.js#L33)
  [`hub.js:54`](../../public/js/hub.js#L54)
  [`index.html:107`](../../public/index.html#L107)

**Tests**

- 19 integration tests covering CRUD, phase irréversibility, 400/403/404, position assertions.
  [`combat-spatial.test.js:1`](../../tests/integration/combat-spatial.test.js#L1)

