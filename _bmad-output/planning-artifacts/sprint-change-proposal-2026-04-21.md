# Sprint Change Proposal — Restaurer la Carte Interactive comme Point d'Entrée Central

**Date :** 2026-04-21  
**Auteur :** Crepe  
**Scope :** Modéré — réorganisation backlog + implémentation Epic 3 + correction Epic 5  
**Statut :** ✅ Approuvé (session 2026-04-21)

---

## Section 1 : Résumé du problème

### Problème

La carte interactive (`carte_interactive.html` + `galaxy-map.js`) n'a jamais été intégrée dans la nouvelle application Express. Epic 3 ("Carte interactive & Révélation en session") a été sauté — le fichier existe dans `public/` mais sans auth, sans table context, sans visibility service. Epic 5 ("Itinéraire & Vaisseaux") a été livré partiellement sous forme de formulaires indépendants, sans la carte comme fondation.

La vision du PRD est violée : **"La carte interactive en est le point d'entrée naturel."**

### Contexte de découverte

Découvert après déploiement de Story 6.1b (résilience réseau). L'utilisateur a ouvert la page Itinéraire et constaté une UI de gestion tabulaire (vaisseaux/routes en formulaires), sans carte galactique visible.

### Preuve

- `public/carte_interactive.html` : page legacy portée par commit `7893a03`, aucune connexion au backend Express (pas de `fetch-client`, pas de `auth-ui`, pas de `table-selector`).
- `public/itineraire.html` : formulaires CRUD vaisseaux + routes + waypoints. Aucune carte.
- `public/js/map/galaxy-map.js` : moteur canvas fonctionnel (`GalaxyMap`, drag/zoom, precomputePositions), non utilisé par la nouvelle app.
- Epics note explicite sur Epic 5 : *"Les données route s'affichent sur la carte (Epic 3)."* — Cette dépendance n'a pas été respectée.

---

## Section 2 : Analyse d'impact

### Impact sur les Epics

| Epic | Impact | Détail |
|---|---|---|
| **Epic 3** (Carte) | 🔴 Non livré | FRs 19, 21, 22, 23, 34, 35 absents de la nouvelle app |
| **Epic 5** (Itinéraire) | 🟡 Partiellement livré | API routes/vaisseaux OK, affichage sur carte manquant |
| **Epic 6** (Résil.) | ✅ Non impacté | Story 6.1b done, résilience OK |
| **Epic 4** (Dashboard MJ) | 🟡 À compléter | Le dashboard existe mais "Carte Galactique" pointe vers le legacy |

### Impact sur les Stories

| Story | Impact | Action |
|---|---|---|
| Stories 1.x, 2.x | ✅ Done, pas impacté | |
| Stories 3.x | 🔴 Non créées | Créer Story 3.1 (intégration carte) |
| Stories 5.x (API) | ✅ Done | Routes/vaisseaux API OK |
| Story 5.x (UI carte) | 🔴 Non faite | Créer Story 5.x (overlay itinéraire sur carte) |
| Story 6.1b | ✅ Done | |

### Conflits avec les artefacts

**PRD :**  
- Vision `mapAsEntryPoint` : "La carte interactive est le point d'entrée naturel du graphe de campagne" — **non réalisée**.
- FRs 19-23 : listés dans Epic 3, non implémentés dans la nouvelle app.

**Architecture :**  
- Aucun conflit — `galaxy-map.js` est compatible avec la stack (vanilla JS ES modules).
- Le visibility service (`src/services/visibility.js`) est disponible pour filtrer les systèmes par table.
- Le polling (`poller.js`) est en place pour les mises à jour temps réel.

**UX :**  
- La page Itinéraire doit devenir un panneau latéral/mode sur la carte, pas une page autonome.
- La navigation principale doit pointer vers la carte, avec l'itinéraire accessible depuis la carte.

---

## Section 3 : Approche recommandée (mise à jour — Option B retenue)

**Choix : Ajustement direct** (Direct Adjustment) — **Option B : CSS Grid + backup comme base**

Pas de rollback. Le travail existant (API vaisseaux/routes, SQLite, auth) est conservé et réutilisé.

> **Décision prise en session 2026-04-21 :** L'approche canvas (`galaxy-map.js`) est abandonnée au profit du backup `donnee_base/itineraire_backup_20260419.html` (CSS grid 40×40 + carte_ma.jpg). Ce backup était fonctionnel et correspond à la vision par quadrant du projet. La page `public/itineraire.html` est le cœur de l'app — le bouton "Itinéraire" du Dashboard et du Hub renvoient vers cette page.

### Plan en 2 stories

#### Story 3.1 — Refonte `public/itineraire.html` (CSS grid + backend Express)
**Périmètre :**  
- Prendre `donnee_base/itineraire_backup_20260419.html` comme base HTML/CSS/JS.  
- Remplacer la source de données inline (`<script id="quadrants-data">`) par `GET /api/data/t/:tid/all`.  
- Remplacer localStorage + `/js/api.js` par modules partagés : `auth-ui.js`, `table-selector.js`, `fetchWithTable`.  
- Corriger les coordonnées grecques (`LETTRES_MA.indexOf` au lieu de regex `[A-Z]+`).  
- Conserver intacte toute la logique de calcul d'itinéraire, génération de périls et pan/zoom.  
- Retirer l'onglet "Vaisseaux" du modal admin (→ Story 5.1).  
- Conserver : sélecteur de vaisseau actif en haut de page.

**Ce qui ne change pas :** `calculateTrip`, `genDayData`, `getPeril`, `resolvePeril`, bottom-sheet mobile, pan/zoom — aucune modification.

#### Story 5.1 — Catalogue de Vaisseaux (`public/vaisseaux.html`)
**Périmètre :**  
- Page dédiée : liste des vaisseaux de la table + fiches détaillées + modèles de vaisseaux.  
- CRUD MJ : ajout, édition, suppression via `/api/ships` et `/api/ship-models`.  
- Lien depuis le hub et depuis le sélecteur de vaisseau de la carte.

**Ce qui ne change pas :** L'API vaisseaux/modèles n'est pas modifiée.

### Effort estimé

| Story | Complexité | Risque |
|---|---|---|
| Story 3.1 | Moyen | Faible — backup fonctionnel comme base |
| Story 5.1 | Faible-Moyen | Faible — API déjà en place |

### Séquencement

```
[ Story 3.1 — Carte CSS grid intégrée ] → [ Story 5.1 — Catalogue vaisseaux ]
```

---

## Section 4 : Propositions de changements détaillés (Option B)

### 4.1 Changement Epic 3 — Story 3.1 (CSS grid, base backup)

**Epic 3 — Story 3.1 :**

```
Story: [3.1] Refonte public/itineraire.html — CSS grid + backend Express
Section: Stories list (Epic 3)

#### Story 3.1 : Carte CSS grid intégrée (Option B)

As a MJ ou joueur connecté,
I want to access the interactive galaxy map with itinerary calculation,
So that I can plan routes, generate perils, and navigate the campaign universe from a single spatial view.

Acceptance Criteria:
- La carte CSS grid 40×40 s'affiche avec l'image de fond carte_MA.png
- Les systèmes de la table sont positionnés correctement (lettres grecques)
- Pan/zoom + bottom-sheet mobile fonctionnels
- Calcul d'itinéraire entre deux points → résultat avec périls générés
- Vaisseau actif sélectionnable, ses stats (depuis modèle) influencent le calcul
- Historique lisible depuis GET /api/travel-routes
- Utilisateur non connecté → redirect /login.html
- Hub et Dashboard MJ pointent vers /itineraire.html

Couvre : FR19, FR21, FR22, FR28, FR29, FR30, FR34, FR35
Dépend de : Epic 1 (auth, table context), Epic 2 (visibility service)
```

### 4.2 Changement Epic 5 — Story 5.1 (catalogue vaisseaux)

**Epic 5 — Story 5.1 :**

```
Story: [5.1] Catalogue de vaisseaux (public/vaisseaux.html)

As a MJ,
I want a dedicated ship catalogue page,
So that I can manage ships and ship models without cluttering the map.

Acceptance Criteria:
- Page liste des vaisseaux de la table (GET /api/ships)
- Fiche détaillée par vaisseau (modèle, hull, crew, cargo, notes)
- Liste des modèles de vaisseaux (GET /api/ship-models)
- CRUD MJ : ajout, édition, suppression
- Lien depuis le hub et depuis la carte (bouton "Gérer les vaisseaux")

Couvre : UI pour vaisseaux (API déjà livrée)
Dépend de : Story 3.1
```

### 4.3 Changement Hub (public/index.html) et Dashboard

```
Section: Accès rapides

OLD:
- Itinéraire (lien vers l'ancienne page formulaire)
- Carte Galactique (lien vers carte_interactive.html)

NEW:
- Itinéraire / Carte → /itineraire.html (premier lien, priorité maximale)
- Vaisseaux → /vaisseaux.html (après Story 5.1)
- [Supprimer] carte_interactive.html de la navigation principale
```

---

## Section 5 : Handoff d'implémentation

### Scope : Modéré

Réorganisation backlog (2 nouvelles stories) + implémentation par Developer agent.

### Responsabilités

| Rôle | Action |
|---|---|
| **Developer (Amelia)** | Implémenter Story 3.1, puis Story 5.x |
| **Crepe (MJ/Product Owner)** | Valider la carte visuellement après Story 3.1 |

### Critères de succès

- [ ] La carte CSS grid s'ouvre depuis le hub et affiche les systèmes de la table "El barco del Sol" aux bons quadrants grecs
- [ ] Un joueur connecté ne voit que les systèmes révélés par le MJ
- [ ] Le calcul d'itinéraire entre deux quadrants produit un résultat avec périls
- [ ] Le vaisseau actif est sélectionnable et ses stats influencent le calcul de route
- [ ] Hub + Dashboard MJ pointent vers `/itineraire.html`
- [ ] Page catalogue vaisseaux accessible depuis la carte (Story 5.1)
- [ ] Les routes planifiées sont visibles comme traits sur la carte
- [ ] `public/itineraire.html` redirige vers la carte

### Ordre des stories

1. **Story 3.1** — Carte intégrée (critique, débloquer tout)
2. **Story 5.x** — Overlay itinéraire (dépend de 3.1)

---

*Document généré par le workflow BMAD Correct Course — 2026-04-21*
