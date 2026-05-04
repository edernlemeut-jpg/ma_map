---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/planning-artifacts/prd2.md', '_bmad-output/planning-artifacts/architecture.md']
---

# Metal Adventures - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Metal Adventures, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Gestion des utilisateurs**

- FR1 : Un visiteur peut créer un compte (le premier inscrit devient automatiquement admin + MJ)
- FR2 : Un utilisateur peut se connecter et rester authentifié entre les sessions (cookie persistant)
- FR3 : Un utilisateur peut se déconnecter
- FR4 : Un admin peut attribuer les rôles MJ ou joueur aux membres d'une table

**Gestion des tables de jeu**

- FR5 : Un MJ peut créer une table de jeu
- FR6 : Un MJ peut inviter des joueurs à rejoindre sa table
- FR7 : Un utilisateur connecté peut sélectionner la table active parmi celles auxquelles il appartient
- FR8 : Le contexte de table (données affichées, permissions) est automatiquement appliqué à toutes les pages

**Visibilité et révélation**

- FR9 : Un MJ peut activer ou désactiver la visibilité d'une entité pour les joueurs (toggle individuel)
- FR10 : Un MJ peut activer la visibilité en masse par catégorie ou par zone (bulk reveal)
- FR11 : La visibilité suit une cascade descendante — une entité cachée entraîne la non-visibilité de ses enfants
- FR12 : Un MJ peut annuler un reveal accidentel dans un délai de grâce (undo reveal)
- FR13 : Un joueur ne voit que les entités explicitement rendues visibles pour lui (protect-by-default)
- FR14 : Un MJ peut prévisualiser ce qu'un joueur voit (vue « comme joueur »)

**Compendium (référence univers)**

- FR15 : Un joueur peut consulter les systèmes, factions, modèles de vaisseaux et données de jeu visibles pour lui
- FR16 : Un utilisateur peut rechercher des entités par texte dans le compendium
- FR17 : La recherche d'un joueur ne confirme jamais l'existence de données cachées (plausible deniability)
- FR18 : Un MJ peut éditer les données du compendium (systèmes, factions, données de jeu)

**Carte interactive**

- FR19 : Un joueur peut visualiser les systèmes visibles sur une carte géographique interactive
- FR20 : Les systèmes non révélés apparaissent comme des silhouettes mystérieuses (fog of war)
- FR21 : Un joueur peut cliquer sur un système visible pour voir sa fiche (données accessibles selon visibilité)
- FR22 : La carte est navigable en scroll/zoom en portrait et en paysage, avec un bouton de recentrage
- FR23 : Les éléments nouvellement révélés apparaissent avec une animation subtile (feedback de reveal)

**Dashboard MJ**

- FR24 : Un MJ peut accéder à ses raccourcis et actions rapides depuis un écran unique
- FR25 : Un MJ peut rechercher rapidement une entité toutes catégories confondues
- FR26 : Un MJ peut activer/désactiver le mode « session active »
- FR27 : Un MJ peut gérer la visibilité individuelle et en masse depuis le dashboard

**Itinéraire**

- FR28 : Un MJ peut planifier une route entre systèmes (route planning)
- FR29 : Un MJ peut gérer les vaisseaux affectés à la table (ship management)
- FR30 : Un MJ peut générer la liste des périls à jouer sur un trajet (sans résolution automatique)
- FR31 : Les données d'itinéraire sont partagées entre utilisateurs de la même table via API

**Migration et import**

- FR32 : Un admin peut importer des données existantes (JSON, SQLite) avec un rapport de validation détaillé
- FR33 : L'import tolère les erreurs partielles et signale les entrées ignorées (import partiel)

**Synchronisation temps réel**

- FR34 : Les données visibles pour un joueur se mettent à jour automatiquement sans refresh (polling)
- FR35 : Un joueur voit un indicateur d'état de connexion (connecté / synchronisation / hors ligne)
- FR36 : Les actions MJ sont appliquées immédiatement côté interface, avec synchronisation en arrière-plan (optimistic UI)
- FR37 : En cas de perte réseau, la resynchronisation est automatique au retour de la connexion

**États vides et onboarding**

- FR38 : Un joueur sans données visibles voit un message thématique (empty state narratif)
- FR39 : Le premier accès post-installation guide l'admin vers la création de table et l'import des données

### NonFunctional Requirements

**Performance**

- NFR1 : First Meaningful Paint < 2s sur réseau domestique (hors cold start NAS)
- NFR2 : Actions MJ (reveal, toggle visibilité) < 3s en perception utilisateur (optimistic UI)
- NFR3 : Polling joueur : intervalle 3-5s, réponse serveur < 500ms
- NFR4 : Recherche compendium < 1s pour ~200 entités
- NFR5 : Utilisateurs simultanés supportés : 5 (1 MJ + 4 joueurs) sans dégradation

**Sécurité**

- NFR6 : HTTPS obligatoire (Let's Encrypt + DuckDNS). Pas de trafic HTTP en clair.
- NFR7 : Authentification JWT dans cookies httpOnly + Secure + SameSite=Strict
- NFR8 : Protect-by-default : toute entité invisible aux joueurs sauf reveal explicite par le MJ. Filtrage serveur.
- NFR9 : Mots de passe hashés (bcrypt). Pas de stockage en clair.
- NFR10 : Les endpoints API valident le rôle et l'appartenance à la table avant toute réponse.

**Fiabilité**

- NFR11 : Perte réseau < 60s : resynchronisation automatique sans perte de données côté MJ (optimistic UI + retry)
- NFR12 : Backup de la base SQLite avant chaque phase de migration. Rollback possible par restauration fichier.
- NFR13 : Import partiel : le système reste fonctionnel même si certaines données d'import sont invalides.
- NFR14 : Cold start NAS : le premier accès après inactivité prolongée peut prendre > 5s.

**Maintenabilité**

- NFR15 : Code organisé en couche partagée (js/shared/*) + pages autonomes.
- NFR16 : Migration DB via scripts idempotents versionnés (pragma user_version).
- NFR17 : Assets statiques avec Cache-Control explicite et invalidation par query string versionnée.

**PRD #2 — Nouveaux NFRs**

- NFR-PJ1 : Isolation joueur — GET /api/characters/:id vérifie req.user.id === character.user_id OU rôle MJ
- NFR-PJ2 : Calcul serveur — cases santé (CAR+SF) et Énergie X max (PER+INT) calculés backend
- NFR-MF1 : Atomicité — transfert MF en transaction SQLite begin/commit
- NFR-MF2 : Contrainte SQL CHECK (pj_pool + mj_pool = 50) et (>= 0) sur les deux colonnes
- NFR-EL1 : Généricité — source_type/target_type en TEXT ; validation types dans le service, pas enum DB
- NFR-FIG1 : Templates système immutables — 403 sur DELETE et PATCH si is_system_template = 1
- NFR-NPC1 : Service santé partagé — named_npcs utilisent exactement le même healthService que characters

### Additional Requirements

_Exigences techniques issues de l'Architecture Decision Document :_

- AR1 : Structure custom (pas de starter) — npm init, package.json "type": "module", server.js, Dockerfile
- AR2 : SQLite WAL mode activé dans database.js, better-sqlite3 synchrone, retry SQLITE_BUSY
- AR3 : Pipeline middleware ordonnée : express.static → json → cookie → auth → tableContext → routes
- AR4 : Service de visibilité centralisé (src/services/visibility.js) appelé explicitement par les routes
- AR5 : Convention de réponse API : toute donnée wrappée dans { "data": ... }, erreurs dans { "error": { code, message, status } }
- AR6 : Tailwind CLI local (pas CDN), sortie compilée dans public/css/tailwind.css
- AR7 : Tests : node --test (unit + integration) + Playwright (e2e), séparation tests/unit|integration|e2e
- AR8 : Docker single-container Node 22-alpine, volume ./db pour SQLite
- AR9 : Scripts migrate.js (pragma user_version) + seed.js (données initiales depuis JSON existants)
- AR10 : Modules partagés client dans public/js/shared/ (fetch-client, auth-ui, header, table-selector, poller)
- AR11 : Endpoint search cross-entités GET /api/search?q=X&types=... (SQL LIKE, index sur name)
- AR12 : Endpoint import admin POST /api/admin/import avec rapport { imported, skipped, errors }
- AR13 : Undo reveal client-side : toast 5s + PATCH inverse avant prochain polling joueur
- AR14 : Preview joueur via GET /api/sync?as_player=true (MJ voit comme joueur)
- AR15 : Helmet middleware pour headers de sécurité (X-Frame-Options, CSP basique)

**PRD #2 — Exigences techniques additionnelles**

- AR-P2.1 : 4 nouvelles tables avec migrations défensives : entity_links, named_npcs, figurant_templates, mf_pool
- AR-P2.2 : Extension défensive characters via ensureCharactersExtensions() — 16 nouvelles colonnes via ALTER TABLE IF NOT EXISTS
- AR-P2.3 : 5 nouveaux services dans src/services/ : entity-links, health-service, characters-pj, named-npcs, figurant-templates, mf-pool
- AR-P2.4 : Widget partagé public/js/shared/mf-pool-widget.js consommé par Dashboard MJ + Itinéraire (pages PRD #1)
- AR-P2.5 : Seed défensif 15 templates figurants — WHERE nom = ? avant INSERT (pas de COUNT global)
- AR-P2.6 : Patterns hérités obligatoires : fetchWithTable(), esc() sur innerHTML, helpers response.js, protect-by-default

### UX Design Requirements

_Pas de document UX Design disponible. Les exigences UX seront dérivées des parcours utilisateur du PRD._

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | 1 | Créer un compte (premier = admin + MJ) |
| FR2 | 1 | Se connecter / rester authentifié |
| FR3 | 1 | Se déconnecter |
| FR4 | 1 | Attribuer rôles MJ/joueur |
| FR5 | 1 | Créer une table de jeu |
| FR6 | 1 | Inviter des joueurs |
| FR7 | 1 | Sélectionner table active |
| FR8 | 1 | Contexte de table automatique |
| FR39 | 1 | Onboarding admin |
| FR9 | 2 | Toggle visibilité individuel |
| FR11 | 2 | Cascade visibilité |
| FR13 | 2 | Protect-by-default |
| FR15 | 2 | Consulter données univers visibles |
| FR16 | 2 | Rechercher dans le compendium |
| FR17 | 2 | Plausible deniability sur la recherche |
| FR18 | 2 | Éditer données compendium (MJ) |
| FR32 | 2 | Import JSON/SQLite avec rapport |
| FR33 | 2 | Import partiel tolérant aux erreurs |
| FR38 | 2 | Empty states narratifs |
| FR19 | 3 | Carte interactive — systèmes visibles |
| ~~FR20~~ | ~~3~~ | ~~Fog of war — RETIRÉ (hidden = n'existe pas pour le joueur)~~ |
| FR21 | 3 | Clic sur système → fiche |
| FR22 | 3 | Navigation scroll/zoom + recentrage |
| FR23 | 3 | Animation de reveal |
| FR34 | 3 | Polling — mise à jour automatique |
| FR35 | 3 | Indicateur état de connexion |
| FR10 | 4 | Bulk reveal par catégorie/zone |
| FR12 | 4 | Undo reveal (délai de grâce) |
| FR14 | 4 | Preview joueur (vue comme joueur) |
| FR24 | 4 | Dashboard MJ — raccourcis |
| FR25 | 4 | Recherche cross-entités rapide |
| FR26 | 4 | Mode session active |
| FR27 | 4 | Gestion visibilité depuis dashboard |
| FR36 | 4 | Optimistic UI pour actions MJ |
| FR28 | 5 | Route planning entre systèmes |
| FR29 | 5 | Gestion vaisseaux de la table |
| FR30 | 5 | Génération liste de périls |
| FR31 | 5 | Partage données itinéraire via API |
| FR37 | 6 | Resync automatique après perte réseau |
| FR7.1 | 7 | Créer lien typé entre deux entités |
| FR7.2 | 7 | Supprimer un lien |
| FR7.3 | 7 | Vue "entités liées" d'une entité |
| FR7.4 | 7 | Liens vers entités cachées masqués joueur |
| FR7.5 | 7 | Vue entités liées depuis fiche système Compendium |
| FR7.6 | 7 | Lien porte type de relation + note |
| FR7.7 | 7 | API entity_links scoped par table |
| FR8.1 | 8 | Créer fiche PJ pour un joueur |
| FR8.2 | 8 | MJ modifie toutes les données PJ |
| FR8.3 | 8 | Joueur consulte sa propre fiche |
| FR8.4 | 8 | MJ voit toutes les fiches de sa table |
| FR8.5 | 8 | Cases santé = CAR+SF (serveur) |
| FR8.6 | 8 | 3 niveaux de santé configurable |
| FR8.7 | 8 | Cases cochée/noircie (2 états) |
| FR8.8 | 8 | MJ modifie cases de santé en session |
| FR8.9 | 8 | Joueur coche ses cases (scène uniquement) |
| FR8.10 | 8 | MJ ajuste PP |
| FR8.11 | 8 | Joueur dépense PP |
| FR8.12 | 8 | MJ ajuste Gloire |
| FR8.13 | 8 | Énergie X max = PER+INT (si mutant) |
| FR8.14 | 8 | MJ ajuste Énergie X |
| FR8.15 | 8 | Joueur mutant dépense Énergie X |
| FR8.16 | 8 | Motivation + OD affichés en évidence |
| FR8.17 | 8 | OD avec couleur contrastée / icône |
| FR9.1 | 9 | Créer PNJ nommé (stats complètes) |
| FR9.2 | 9 | Modifier PNJ nommé |
| FR9.3 | 9 | Supprimer PNJ nommé (confirmation) |
| FR9.4 | 9 | Lier PNJ à entités (entity_links inline) |
| FR9.5 | 9 | Toggle visibilité PNJ |
| FR9.6 | 9 | Joueurs voient PNJ révélés (fiche simplifiée) |
| FR9.7 | 9 | MJ filtre/cherche PNJ |
| FR9.8 | 9 | Santé PNJ identique à PJ |
| FR9.9 | 9 | PNJ liés visibles dans vue entités système |
| FR10.1 | 10 | Consulter liste templates figurants |
| FR10.2 | 10 | Voir stats-bloc complet figurant |
| FR10.3 | 10 | Ajouter template personnalisé |
| FR10.4 | 10 | Modifier/supprimer template personnalisé |
| FR10.5 | 10 | Templates système non-supprimables, duplicables |
| FR10.6 | 10 | Filtrage par faction/catégorie |
| FR10.7 | 10 | Figurants non liés entity_links (global) |
| FR11.1 | 11 | Consulter état MF Pool (PJ/MJ) |
| FR11.2 | 11 | Transférer N dés PJ→MJ |
| FR11.3 | 11 | Transférer N dés MJ→PJ |
| FR11.4 | 11 | Contrainte pj+mj=50 — refus si violation |
| FR11.5 | 11 | Reset "nouvelle aventure" (50/0) |
| FR11.6 | 11 | Pool persisté par table |
| FR11.7 | 11 | Widget accessible sans navigation |
| FR11.8 | 11 | Delta 1 + raccourci ×5 |
| FR11.9 | 11 | Feedback visuel tension PJ/MJ |

**PRD #1 : 38/39 FRs couverts (FR20 retiré). PRD #2 : 43/43 FRs couverts. Total : 81/82 FRs, 0 gaps.**

## Epic List

### Epic 1 : Socle technique, Auth & Tables de jeu
Le MJ s'inscrit, crée sa table, invite ses joueurs. Tout le monde peut se connecter et sélectionner sa table. Les données univers sont seedées dans la base.
**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR39
**ARs couverts :** AR1-AR10, AR15
**Notes d'implémentation :** Story 0 = seed/migration (perils_data.json, quadrants_MA.json → SQLite). Skeleton polling (poller.js). Schema freeze en fin d'epic. Middleware pipeline complet.
**Décommissionnement :** Aucun legacy utilisé pour auth/tables.

### Epic 2 : Compendium, Univers & Service de visibilité
Le MJ édite et organise son univers. Les joueurs consultent les données visibles. Le MJ contrôle la visibilité entité par entité. L'admin peut importer des données existantes.
**FRs couverts :** FR9, FR11, FR13, FR15, FR16, FR17, FR18, FR32, FR33, FR38
**ARs couverts :** AR4, AR11, AR12
**Notes d'implémentation :** Le service de visibilité (src/services/visibility.js) est construit ici comme primitif réutilisable. Recherche avec plausible deniability. Import admin avec rapport.
**Décommissionnement :** compendium.html legacy remplacé.

### Epic 3 : Carte interactive & Révélation en session 🎯
Le MJ ouvre la carte, révèle un quadrant — les joueurs le voient apparaître en live sur leur téléphone avec une animation. Navigation tactile, fiches système au clic. Les systèmes cachés n'existent pas pour le joueur (pas de fog of war). C'est le premier moment partagé MJ-joueurs autour de la table.
**FRs couverts :** FR19, FR21, FR22, FR23, FR34, FR35 (FR20 retiré)
**Notes d'implémentation :** Polling actif enrichi sur le skeleton d'Epic 1. Le visibility service d'Epic 2 est réutilisé. L'indicateur de connexion donne confiance aux joueurs.
**Décommissionnement :** carte_interactive.html legacy remplacé.

### Epic 4 : Dashboard MJ & Visibilité avancée
Le MJ a son centre de commande : actions rapides, bulk reveal, undo accidentel, prévisualisation joueur, mode session active. Les actions sont instantanées (optimistic UI).
**FRs couverts :** FR10, FR12, FR14, FR24, FR25, FR26, FR27, FR36
**ARs couverts :** AR13, AR14
**Notes d'implémentation :** Recherche cross-entités. Undo reveal via deferred commit (toast 8s, opération envoyée au serveur uniquement après expiration). Preview via GET /api/preview/sync (endpoint dédié).
**Décommissionnement :** Plus aucun workflow MJ ne passe par le legacy.

### Epic 5 : Itinéraire & Vaisseaux
Le MJ planifie des routes entre systèmes, gère sa flotte, génère les périls d'un trajet. Les données sont partagées avec la table.
**FRs couverts :** FR28, FR29, FR30, FR31
**Notes d'implémentation :** Extraction de la logique depuis le monolithe itineraire.html (160K). Tables DB : travel_routes, route_waypoints (dénormalisée), route_perils. Les données route s'affichent sur la carte (Epic 3).
**Décommissionnement :** itineraire.html / peril.html legacy remplacés.

### Epic 6 : Résilience, Polish & Décommissionnement
La connexion se rétablit automatiquement après une coupure wifi. Les performances sont optimisées pour le jeu en session. Le legacy est définitivement retiré.
**FRs couverts :** FR37
**NFRs focus :** NFR1-5, NFR11, NFR14, NFR17
**Notes d'implémentation :** Resync automatique, polling adaptatif (document.hidden), cache-control, tests E2E cross-epic, cleanup legacy final.
**Décommissionnement :** Tous les fichiers .html legacy supprimés, Docker-only.

### Epic 7 : Graphe de campagne — Entity Links
Le MJ peut relier n'importe quelle entité à une autre (système, faction, vaisseau, PNJ, PJ, événement). La vue "entités liées" apparaît sur les fiches système du Compendium. Fondation extensible du graphe de campagne.
**FRs couverts :** FR7.1, FR7.2, FR7.3, FR7.4, FR7.5, FR7.6, FR7.7
**NFRs :** NFR-EL1
**Prérequis :** Epic 2 (visibility service) livré. **Fournit :** infrastructure graphe pour Epic 9.
**Ordre de livraison :** Premier — prérequis sequentiel de Epic 9.

### Epic 8 : Fiches PJ interactives
Un joueur connecté peut consulter sa propre fiche PJ (santé dynamique, PP, Gloire, Énergie X, OD). Le MJ peut créer et modifier toutes les fiches de sa table. Le healthService.js est extrait comme module réutilisable.
**FRs couverts :** FR8.1–FR8.17
**NFRs :** NFR-PJ1, NFR-PJ2, NFR-NPC1
**Prérequis :** Epic 1 (table characters). **Fournit :** healthService.js pour Epic 9.
**Parallélisable avec :** Epic 10.

### Epic 9 : PNJ Nommés
Le MJ peut créer des PNJ à stats complètes (Premiers/Seconds rôles), les lier au graphe, et régler leur visibilité. Les joueurs voient les PNJ révélés dans le Compendium (fiche simplifiée).
**FRs couverts :** FR9.1–FR9.9
**NFRs :** NFR-NPC1
**Dépend de :** Epic 7 (entity_links), bénéficie du healthService d'Epic 8.

### Epic 10 : Catalogue Figurants
Bibliothèque de stats-blocs réutilisables pour les PNJ anonymes. 15 templates système pré-peuplés, ajout de templates personnalisés. Données globales non liées au graphe.
**FRs couverts :** FR10.1–FR10.7
**NFRs :** NFR-FIG1
**Parallélisable avec :** Epic 8. Aucune dépendance croisée.

### Epic 11 : Metal Faktor Pool Tracker
Widget compact gérant le pool de 50 dés MF en temps réel. Persisté par table, accessible depuis Dashboard MJ et Itinéraire (pages PRD #1 — retrofit).
**FRs couverts :** FR11.1–FR11.9
**NFRs :** NFR-MF1, NFR-MF2
**Livrer en dernier :** retouche deux pages livrées en PRD #1 — risque de régression géré par snapshots E2E pré-retrofit.

---

## Stories

### Epic 1 : Socle technique, Auth & Tables de jeu

#### Story 1.1 : Initialisation projet & base de données

As a developer,
I want the project skeleton with Express server, SQLite database, migration/seed scripts, and standardized API contracts,
So that all future stories have a working foundation to build upon.

**Acceptance Criteria:**

**Given** le dépôt est vide
**When** `npm install && npm run migrate && npm run seed` sont exécutés
**Then** le serveur démarre sur le port configuré (défaut 3000), la DB `db/ma.db` existe en WAL mode
**And** les tables initiales sont créées : users, tables, table_members, quadrants, systems, factions, ship_models, perils, visibility_rules, table_visibility_overrides, npcs, notes, ships
**And** le script migrate.js est idempotent (re-run safe) via pragma user_version
**And** les données de `quadrants_MA.json`, `galactic_events.json`, `perils_data.json` sont importées via seed.js
**And** `.env.example` documente les variables requises : DB_PATH, JWT_SECRET, PORT, NODE_ENV
**And** le Dockerfile produit une image fonctionnelle (Node 22-alpine, volume ./db)
**And** Helmet est monté avec X-Frame-Options et CSP basique
**And** express.static sert `public/`, express.json() et cookie-parser sont montés
**And** les slots middleware pour auth et tableContext sont en place (pass-through initiaux)
**And** le pipeline respecte l'ordre : express.static → json → cookie → auth → tableContext → routes
**And** un helper de réponse API standardisé existe (`src/utils/response.js`) — format `{ "data": ... }` et `{ "error": { code, message, status } }`
**And** une route `GET /api/health` retourne `{ "data": { "status": "ok" } }` et utilise le helper
**And** Tailwind CLI compile `public/css/tailwind.css` via `npm run build:css`
**And** `node --test tests/` passe avec au moins un test smoke vérifiant le health check et le schéma DB

**Couvre :** AR1, AR2, AR3, AR5, AR6, AR7, AR8, AR9, AR15

---

#### Story 1.2 : Inscription & authentification

As a visiteur,
I want to create an account and log in securely,
So that I can access the application and be recognized across sessions.

**Acceptance Criteria:**

**Given** aucun utilisateur n'existe
**When** je m'inscris avec pseudo (3-30 chars) + mot de passe (8+ chars)
**Then** mon compte est créé avec `is_admin = true` (premier inscrit = admin + MJ)
**And** un message confirme que je suis le premier admin

**Given** des utilisateurs existent déjà
**When** je m'inscris
**Then** mon compte est créé avec `is_admin = false`

**Given** je suis inscrit
**When** je me connecte avec des identifiants valides
**Then** un JWT est stocké dans un cookie httpOnly + Secure + SameSite=Strict
**And** le JWT contient `{ sub, is_admin, iat, exp }` avec expiration de 7 jours
**And** je suis redirigé vers la page d'accueil

**Given** je me connecte avec des identifiants invalides
**When** je soumets le formulaire
**Then** je reçois une erreur 401 au format `{ "error": { code: "INVALID_CREDENTIALS", message, status: 401 } }` sans révéler si c'est le pseudo ou le mot de passe qui est faux

**Given** je suis connecté
**When** je clique « Déconnexion »
**Then** le cookie est supprimé et je suis redirigé vers la page de login

**And** le middleware `src/middleware/auth.js` décode le JWT et attache `req.user = { sub, is_admin }`
**And** les routes protégées retournent 401 si pas de JWT, 403 si droits insuffisants
**And** les mots de passe sont hashés avec bcrypt (cost factor 10+)
**And** la validation d'input rejette les pseudo vides, trop courts ou trop longs, et les mots de passe trop courts
**And** la page `public/login.html` affiche inscription et connexion
**And** le module `public/js/shared/auth-ui.js` gère l'affichage conditionnel (connecté/déconnecté) sur toutes les pages

**Couvre :** FR1, FR2, FR3

---

#### Story 1.3 : Onboarding premier admin

As a premier admin fraîchement inscrit,
I want to be guided through initial setup,
So that I know immediately how to create my first game table.

**Acceptance Criteria:**

**Given** je suis le premier utilisateur et je viens de m'inscrire
**When** j'arrive sur la page d'accueil
**Then** je vois un guide d'onboarding thématique m'invitant à créer ma première table de jeu
**And** le guide me propose ensuite d'importer des données (lien vers l'import admin des futurs epics, désactivé pour l'instant)
**And** si des tables existent déjà, l'onboarding ne s'affiche plus

**Couvre :** FR39

---

#### Story 1.4 : Gestion des tables de jeu & invitation

As a MJ,
I want to create a game table and invite players by sharing a simple code,
So that my group can join and start playing together.

**Acceptance Criteria:**

**Given** je suis connecté en tant que MJ
**When** je crée une table avec un nom
**Then** elle est persistée et je suis automatiquement membre avec le rôle `mj`
**And** un code d'invitation unique (6 chars alphanumériques, lisible dans le noir sur mobile) est généré pour cette table

**Given** je suis un joueur et j'ai reçu un code d'invitation
**When** je saisis le code sur la page de rejoindre une table
**Then** je deviens membre de cette table avec le rôle `joueur`
**And** si le code est invalide, un message d'erreur clair s'affiche

**Given** je suis admin
**When** je modifie le rôle d'un membre d'une table
**Then** il devient MJ ou joueur selon mon choix
**And** le MJ créateur d'une table ne peut pas être retiré

**And** les routes `src/routes/tables.js` exposent : POST (create), GET (list mine), POST /:id/join, PATCH /:id/members/:userId
**And** un joueur ne peut pas accéder aux tables dont il n'est pas membre (403)
**And** toutes les réponses utilisent le helper de réponse API standardisé

**Couvre :** FR4, FR5, FR6

---

#### Story 1.5 : Sélection de table & contexte automatique

As a utilisateur connecté appartenant à une ou plusieurs tables,
I want to select my active game table and have all pages reflect that context,
So that I see only the data relevant to my current game.

**Acceptance Criteria:**

**Given** j'appartiens à plusieurs tables
**When** j'ouvre le sélecteur de table
**Then** je vois la liste de mes tables et je peux en choisir une

**Given** j'ai sélectionné une table
**When** je navigue sur n'importe quelle page
**Then** le middleware `src/middleware/table-context.js` injecte `req.table` avec mon rôle dans cette table
**And** le header affiche le nom de la table active et mon rôle (MJ/joueur)

**Given** ma table sélectionnée a été supprimée côté serveur
**When** je navigue
**Then** le middleware détecte l'incohérence, efface la sélection locale et me redirige vers le sélecteur

**And** le composant `public/js/shared/table-selector.js` persiste le choix via localStorage et l'envoie via header `X-Table-Id`
**And** le composant `public/js/shared/header.js` affiche table active + rôle + bouton déconnexion
**And** sans table sélectionnée, les pages de contenu affichent un message invitant à en choisir une

**Couvre :** FR7, FR8

---

#### Story 1.6 : Skeleton polling

As a developer,
I want the polling infrastructure ready,
So that future epics can enrich the sync payload without rebuilding the polling mechanism.

**Acceptance Criteria:**

**Given** un utilisateur est connecté avec une table sélectionnée
**When** la page est active (document.hidden === false)
**Then** `public/js/shared/poller.js` requête `GET /api/sync` toutes les 3-5 secondes

**Given** la page est en arrière-plan (document.hidden === true)
**When** un cycle de polling arrive
**Then** l'intervalle est réduit à 15-30 secondes

**Given** aucune table n'est sélectionnée
**When** la page se charge
**Then** le poller ne démarre PAS

**And** le endpoint `GET /api/sync` retourne un payload structuré : `{ "data": { "version": <number>, "timestamp": <ISO8601>, "entities": {} } }`
**And** le poller expose un callback `onUpdate(data)` utilisable par les pages futures
**And** les tests unitaires couvrent le poller avec fake timers et mock de `document.hidden`

**Couvre :** AR10 (poller skeleton)

---

**Résumé Epic 1 : 6 stories — FR1-8, FR39 + AR1-10, AR15 couverts.**

### Epic 2 : Compendium, Univers & Service de visibilité

#### Story 2.1 : Service de visibilité

As a système,
I want a centralized visibility service that enforces protect-by-default and cascade rules,
So that every route can filter data consistently without duplicating logic.

**Acceptance Criteria:**

**Given** une entité n'a pas de règle de visibilité
**When** un joueur requête ses données
**Then** elle est invisible (protect-by-default)

**Given** un MJ appelle `PATCH /api/visibility/:entityType/:entityId` avec `{ "visible": true }`
**When** la requête est traitée
**Then** la règle est persistée dans `visibility_rules` et la réponse retourne l'état après toggle : `{ "data": { "entityType", "entityId", "visible": true } }`

**Given** une entité parente (quadrant) est cachée
**When** un joueur requête ses enfants (systèmes de ce quadrant)
**Then** ils sont tous invisibles, même ceux explicitement marqués visibles
**And** l'invariante est : un enfant ne peut JAMAIS être visible si son parent est masqué

**Hiérarchie de cascade :**
- Quadrant → Systèmes → Planètes (si applicable)
- Faction : pas de cascade (entité plate)
- Ship_model : pas de cascade (entité plate)
- Direction : top-down uniquement au toggle
- Stockage : visibilité explicite sur chaque entité ; au toggle d'un parent, mise à jour transactionnelle des enfants

**And** le service `src/services/visibility.js` expose :
- `isVisible(entityType, entityId, tableId, role)` — le MJ voit toujours tout
- `getVisibleIds(entityType, tableId, role)` — retourne les IDs filtrés selon le rôle
- `toggleVisibility(entityType, entityId, tableId, visible)` — persiste + cascade transactionnelle
**And** le paramètre `role` évite de dupliquer la bifurcation MJ/joueur dans chaque route
**And** pas de cache mémoire initial — recalcul à chaque appel (acceptable à ~200 entités, < 1ms sur SQLite)
**And** tests unitaires complets : protect-by-default, cascade top-down, toggle, invariante parent-enfant, rôle MJ vs joueur

**Couvre :** FR9, FR11, FR13, AR4

---

#### Story 2.2 : Compendium API — routes de lecture filtrées

As a developer,
I want API routes that serve universe data filtered by the visibility service,
So that the compendium frontend can display only what each user is allowed to see.

**Acceptance Criteria:**

**Given** je suis joueur avec une table active
**When** j'appelle `GET /api/systems` (ou `/api/factions`, `/api/ship-models`)
**Then** seules les entités visibles sont retournées, format : `{ "data": [{ "id", "name", ... }] }`
**And** aucune métadonnée ne trahit le nombre réel d'entités (pas de `total_count`, pas de `has_more`)

**Given** je suis MJ
**When** j'appelle les mêmes routes
**Then** toutes les entités sont retournées avec un champ supplémentaire `"visible": boolean`
**And** le champ `visible` n'apparaît JAMAIS dans la réponse joueur

**And** les routes `src/routes/systems.js`, `src/routes/factions.js`, `src/routes/ship-models.js` appellent le visibility service avec le rôle issu de `req.table`
**And** pas de pagination (< 200 entités, payload complet acceptable)
**And** les réponses utilisent le helper API standardisé
**And** tests d'intégration : réponse joueur sans champ `visible`, réponse MJ avec champ `visible`, filtrage correct

**Couvre :** FR15 (partie API)

---

#### Story 2.3 : Compendium frontend — navigation, empty states & toggle MJ inline

As a joueur,
I want to browse the visible universe data in a themed interface,
So that I can reference the game world during sessions.

As a MJ,
I want to toggle entity visibility directly from the compendium with a single tap,
So that I can reveal content in < 3 seconds without leaving the page.

**Acceptance Criteria:**

**Given** je suis joueur avec une table active
**When** j'ouvre `public/compendium.html`
**Then** je vois les entités visibles groupées par catégorie avec navigation par onglets

**Given** aucune entité n'est visible pour moi
**When** j'ouvre le compendium
**Then** je vois un empty state narratif thématique (ex: « Les archives du vaisseau sont encore verrouillées. Votre équipage n'a pas assez d'accréditations pour accéder aux données galactiques… »)

**Given** je suis MJ
**When** je vois une entité dans le compendium
**Then** un indicateur visuel (icône œil) montre le statut de visibilité
**And** je peux taper directement sur l'indicateur pour toggler — un seul geste, pas de navigation
**And** révéler = toggle immédiat sans confirmation
**And** cacher = micro-confirmation (les joueurs pourraient être en train de lire)

**Given** le MJ vient de révéler une entité
**When** le poller du joueur reçoit la mise à jour
**Then** un badge discret « nouveau contenu » apparaît sur l'onglet concerné du compendium
**And** le badge disparaît quand le joueur consulte l'onglet

**And** le compendium utilise `public/js/shared/fetch-client.js` pour les appels API
**And** le poller d'Epic 1 (Story 1.6) est branché pour détecter les changements de visibilité

**Couvre :** FR15 (partie UI), FR38

---

#### Story 2.4 : Recherche compendium avec plausible deniability

As a joueur,
I want to search the compendium by text,
So that I can find information quickly without the search revealing hidden content.

**Acceptance Criteria:**

**Given** je suis joueur
**When** je tape un terme de recherche (minimum 2 caractères)
**Then** seules les entités visibles apparaissent dans les résultats

**Given** je cherche un terme qui correspond à une entité cachée
**When** les résultats s'affichent
**Then** rien n'indique que des résultats ont été filtrés (pas de compteur total, pas de pagination suspecte, pas de trous alphabétiques)

**Given** je suis MJ
**When** je recherche
**Then** je vois tous les résultats avec marquage visuel des entités cachées (opacité réduite + icône œil barré)

**And** route `GET /api/search?q=X&types=systems,factions,ship_models`
**And** SQL LIKE sur colonnes `name` — full scan acceptable à ~200 entités (< 1ms), pas d'index spécialisé requis (FTS5 si volumétrie future)
**And** le paramètre `q` est sanitizé (échappement des caractères spéciaux SQL)
**And** requête `q` de moins de 2 caractères retourne un tableau vide
**And** format de retour unifié : `{ "data": [{ "type": "system", "id": 1, "name": "..." }, { "type": "faction", "id": 3, "name": "..." }] }`
**And** temps de réponse < 1s (NFR4)

**Couvre :** FR16, FR17, AR11

---

#### Story 2.5 : Édition compendium par le MJ

As a MJ,
I want to edit universe data (systems, factions, ship models),
So that I can customize my campaign world.

**Acceptance Criteria:**

**Given** je suis MJ de la table active
**When** je modifie un système, une faction ou un modèle de vaisseau via PATCH
**Then** les changements sont persistés immédiatement

**Given** je suis joueur
**When** je tente d'accéder à un endpoint d'édition
**Then** je reçois 403

**And** routes PATCH uniquement (pas de PUT — pas de remplacement complet d'entité)
**And** champs éditables par entité :
- Système : name, description, coordinates, quadrant_id
- Faction : name, description, alignment
- Ship_model : name, description, class, stats
**And** la validation d'input rejette les données malformées avec messages d'erreur clairs au format standard
**And** l'interface compendium affiche les contrôles d'édition (icône crayon) uniquement pour le MJ
**And** édition inline ou modale légère — pas de page séparée

**Couvre :** FR18

---

#### Story 2.6 : Import admin avec rapport de validation

As a admin,
I want to import existing data (JSON) with a detailed validation report,
So that I can migrate my existing campaign data without losing information.

**Acceptance Criteria:**

**Given** je suis admin
**When** je soumets un fichier JSON valide via `POST /api/admin/import`
**Then** les données sont importées et je reçois `{ "data": { "imported": N, "skipped": M, "errors": [{ "entity": "...", "reason": "..." }] } }`

**Given** le fichier contient des erreurs partielles
**When** l'import s'exécute
**Then** les entrées valides sont importées (SAVEPOINT par entité avec rollback individuel), les invalides sont listées dans `errors` avec identifiant + raison

**Given** je ne suis pas admin
**When** je tente l'import
**Then** je reçois 403

**And** backup automatique de la DB avant import via `database.backup()` de better-sqlite3 (safe en WAL mode)
**And** le backup est stocké dans `db/backups/ma_backup_<timestamp>.db`
**And** l'import supporte les formats JSON existants du projet : quadrants_MA.json, perils_data.json, galactic_events.json
**And** une page `public/admin/import.html` permet l'upload avec affichage du rapport
**And** le lien vers l'import est activé dans l'onboarding admin (Story 1.3)

**Couvre :** FR32, FR33, AR12

---

**Résumé Epic 2 : 6 stories — FR9, FR11, FR13, FR15-18, FR32-33, FR38 couverts.**

### Epic 3 : Carte interactive & Révélation en session 🎯

#### Story 3.1 : Carte interactive — rendu des systèmes visibles & navigation

As a joueur,
I want to view visible systems on an interactive SVG map that I can scroll, zoom, and recenter,
So that I can explore the galaxy on my phone during sessions.

**Acceptance Criteria:**

**Given** je suis joueur avec une table active
**When** j'ouvre `public/carte.html`
**Then** seuls les systèmes visibles sont affichés sur une carte SVG avec positions issues de la DB — rien d'autre, aucun indice de systèmes cachés

**Given** je scroll ou pinch-zoom
**When** la carte se déplace
**Then** la navigation est fluide (transform sur `<g>` racine, `will-change: transform`)
**And** le zoom a des limites min/max définies pour éviter le zoom infini

**And** `touch-action: none` uniquement sur le conteneur SVG (pas globalement) pour éviter le conflit avec le zoom natif iOS Safari
**And** un bouton de recentrage (FAB 48x48px, bas droite) ramène la vue à la position initiale
**And** les systèmes ont des zones de tap généreuses (minimum 44x44px) même si l'icône est plus petite
**And** la carte fonctionne en portrait et paysage sur écran 375px+ (dark theme)
**And** SVG avec viewBox + transformation matricielle, vanilla JS (pas de lib externe)
**And** le rendu utilise un `Map<systemId, SVGElement>` pour accès O(1) lors des mises à jour futures
**And** le pan/zoom multi-touch est isolé dans `public/js/map/transform.js`, testé unitairement

**Couvre :** FR19, FR22

---

#### Story 3.2 : Fiche système au clic

As a joueur,
I want to click on a visible system to see its details,
So that I can access game data directly from the map.

**Acceptance Criteria:**

**Given** je suis joueur
**When** je tape sur un système visible
**Then** un bottom sheet s'ouvre en peek state (~30% du viewport) avec nom + infos clés, swipe-up pour le détail complet — la carte reste visible en arrière-plan

**Given** je suis MJ
**When** je tape sur un système
**Then** la fiche s'ouvre avec toutes les données + indicateur de visibilité + toggle rapide (même pattern qu'Epic 2 Story 2.3)

**And** la fiche charge les données via `GET /api/systems/:id` (filtré par visibilité)
**And** un état de chargement s'affiche pendant le fetch
**And** la fiche se ferme au tap hors zone, bouton fermer, ou swipe-down
**And** en paysage, le bottom sheet devient un side panel

**Couvre :** FR21

---

#### Story 3.3 : Polling actif, reveal animation & indicateur de connexion

As a joueur,
I want the map to update automatically when the MJ reveals new content, with a connection indicator,
So that I see changes in real-time and trust that my view is current.

**Acceptance Criteria:**

**Given** le MJ révèle un système
**When** le prochain cycle de polling du joueur s'exécute
**Then** le système apparaît sur la carte avec une animation glow (halo lumineux pulsant 2-3x puis stabilisation, durée 800-1200ms)
**And** une vibration haptique courte (50ms via `navigator.vibrate`) accompagne le reveal
**And** `prefers-reduced-motion` : pas d'animation, apparition immédiate (vibration maintenue)

**Given** le MJ cache un système précédemment visible
**When** le delta sync le signale
**Then** le nœud SVG est supprimé immédiatement (le système cesse d'exister pour le joueur)

**Given** le polling est actif
**When** le joueur regarde la carte
**Then** un indicateur discret dans le header montre : 🟢 connecté / 🔄 synchronisation / 🔴 hors ligne
**And** 🔴 s'affiche après 2 échecs consécutifs de polling

**And** le endpoint `GET /api/sync` est enrichi avec des deltas de visibilité contenant les objets complets (pas juste des IDs) :
```json
{
  "data": {
    "version": 47,
    "timestamp": "...",
    "entities": {
      "systems": {
        "revealed": [{ "id": 12, "name": "...", "x": ..., "y": ... }],
        "hidden": [12],
        "updated": [{ "id": 8, "name": "..." }]
      }
    }
  }
}
```
**And** si la version fait un saut > 1 (polls manqués), le client fait un full refresh des données via les routes API existantes ; si le full refresh échoue, retry avec backoff exponentiel (1s, 2s, 4s, max 30s)
**And** le client ne recrée pas le DOM SVG à chaque poll — diff chirurgical via `Map<systemId, SVGElement>` (add/remove/update par ID)
**And** si plusieurs systèmes sont révélés en même temps, les animations sont décalées de 200ms chacune via `requestAnimationFrame` (pas `setTimeout`)
**And** le poller (Epic 1 Story 1.6) `onUpdate` est branché pour déclencher le re-rendu de la carte

**Couvre :** FR23, FR34, FR35

---

**Résumé Epic 3 : 3 stories — FR19, FR21-23, FR34-35 couverts. FR20 (fog of war) retiré.**

### Epic 4 : Dashboard MJ & Visibilité avancée

#### Story 4.1 : Dashboard MJ — page d'accueil & raccourcis

As a MJ,
I want a central dashboard with quick actions and a session-oriented overview,
So that I can manage my session efficiently from one screen.

**Acceptance Criteria:**

**Given** je suis MJ avec une table active
**When** j'ouvre `public/dashboard.html`
**Then** je vois : nombre de systèmes visibles/total, nombre de joueurs connectés, raccourcis vers compendium, carte, itinéraire
**And** les entités récemment modifiées (dernières 24h) sont listées pour reprise rapide de session

**Given** je suis joueur
**When** je tente d'accéder au dashboard
**Then** je suis redirigé vers la page d'accueil (403)

**And** les compteurs se rafraîchissent via le delta sync existant (pas de polling séparé)
**And** le dashboard est le point d'entrée naturel pour le MJ après connexion

**Couvre :** FR24

---

#### Story 4.2 : Recherche cross-entités rapide

As a MJ,
I want to search across all entity types from the dashboard,
So that I can find any game element in seconds during a session.

**Acceptance Criteria:**

**Given** je suis MJ sur le dashboard
**When** je tape dans la barre de recherche (accessible en 1 tap, icône persistante en haut)
**Then** les résultats apparaissent en temps réel (debounce 300ms) couvrant systèmes, factions, vaisseaux, PNJs, notes

**Given** la recherche retourne 0 résultat
**When** les résultats s'affichent
**Then** un message clair indique « Aucun résultat pour "X" »

**And** chaque résultat affiche le type, le nom, et le statut de visibilité (icône œil)
**And** cliquer sur un résultat ouvre la fiche correspondante
**And** maximum 20 résultats affichés (les plus pertinents d'abord)
**And** la recherche réutilise `GET /api/search?q=X&types=...` (Epic 2 Story 2.4)

**Couvre :** FR25

---

#### Story 4.3 : Gestion de visibilité en masse (bulk reveal)

As a MJ,
I want to reveal or hide multiple entities at once by category or zone,
So that I can quickly update player access during a session.

**Acceptance Criteria:**

**Given** je suis MJ sur le dashboard
**When** je sélectionne « Révéler tout le quadrant Nord »
**Then** une micro-confirmation s'affiche (« Révéler 12 éléments de Quadrant Nord ? » + bouton Confirmer) — pas de modale bloquante

**Given** je confirme
**When** l'opération s'exécute
**Then** tous les systèmes de ce quadrant deviennent visibles pour les joueurs en une seule opération

**And** endpoint `POST /api/visibility/bulk` avec body `{ "entityType": "systems", "filter": { "quadrant_id": 3 }, "visible": true }`
**And** la cascade s'applique (révéler un quadrant → ses systèmes deviennent visibles)
**And** l'opération est atomique (transaction DB)
**And** la réponse retourne `{ "data": { "affected": N, "version": V } }`
**And** l'UI reflète immédiatement le changement (optimistic update après confirmation)
**And** en cas d'échec serveur, rollback visuel + message d'erreur

**Couvre :** FR10, FR36 (partie bulk)

---

#### Story 4.4 : Undo reveal (délai de grâce) — deferred commit

As a MJ,
I want to undo an accidental reveal within a grace period,
So that I don't spoil content for my players by mistake.

**Acceptance Criteria:**

**Given** je viens de toggler la visibilité d'une entité (individuel ou bulk)
**When** un toast apparaît pendant 8 secondes avec un bouton « Annuler »
**Then** l'opération n'est PAS envoyée au serveur tant que le toast est actif (deferred commit)
**And** l'UI reflète le changement immédiatement (optimistic dans le client)

**Given** je clique « Annuler » avant expiration
**When** l'action est annulée
**Then** l'UI revient à l'état précédent, aucune requête serveur n'est envoyée

**Given** le toast expire sans annulation
**When** les 8 secondes passent
**Then** l'opération est envoyée au serveur (PATCH ou POST bulk)

**And** le toast est gros, contrasté, collé au bas de l'écran (minimum 48px de hauteur, zone tactile généreuse)
**And** si plusieurs actions successives, le dernier toast est visible en plein, les précédents sont collapsés en compteur (« 2 autres actions annulables »)
**And** maximum 3 opérations en attente simultanément
**And** naviguer vers une autre page envoie immédiatement toutes les opérations en attente (pas de perte)

**Couvre :** FR12, AR13

---

#### Story 4.5 : Mode session active

As a MJ,
I want to toggle a "session active" mode,
So that players know the game is in progress and polling is optimized.

**Acceptance Criteria:**

**Given** je suis MJ sur le dashboard
**When** j'active « Session active »
**Then** un flag est persisté côté serveur pour cette table

**And** quand la session est active, le polling joueur utilise l'intervalle agressif (3-5s) ; quand inactive, intervalle réduit (30s)
**And** les joueurs voient un indicateur discret confirmant que la session est en cours
**And** le endpoint `GET /api/sync` inclut le flag `sessionActive` dans sa réponse
**And** le client joueur détecte le changement de flag et ajuste l'intervalle immédiatement (pas au prochain cycle)
**And** le MJ peut désactiver la session manuellement à tout moment
**And** auto-désactivation après 30 minutes sans activité MJ (heartbeat basé sur les requêtes API du MJ)
**And** si le MJ ferme l'onglet, le heartbeat cesse et l'auto-timeout s'applique après 30min

**Couvre :** FR26, FR27, FR36 (partie session)

---

#### Story 4.6 : Preview joueur (vue « comme joueur »)

As a MJ,
I want to preview what a player sees,
So that I can verify my visibility settings before a reveal.

**Acceptance Criteria:**

**Given** je suis MJ
**When** j'active le mode preview
**Then** l'interface bascule pour montrer exactement ce qu'un joueur de ma table voit

**And** le mode preview utilise `GET /api/preview/sync` — endpoint dédié, accessible uniquement si `role === 'mj'` (retourne 403 sinon, paramètre ignoré silencieusement pour les joueurs)
**And** un **cadre coloré permanent sur les 4 côtés** de l'écran indique que le mode preview est actif (visible même en scrollant)
**And** les contrôles MJ (toggle, edit, bulk) sont désactivés et visuellement grisés avec overlay léger
**And** un **bouton flottant fixe** « Quitter Preview » est toujours visible
**And** double-tap anywhere quitte aussi le mode preview
**And** le preview n'affecte PAS le version tracking du MJ (il ne perd pas sa position de sync)

**Couvre :** FR14, AR14

---

**Résumé Epic 4 : 6 stories — FR10, FR12, FR14, FR24-27, FR36 couverts.**

### Epic 5 : Itinéraire & Vaisseaux

#### Story 5.1 : Gestion des vaisseaux de la table

As a MJ,
I want to manage the ships assigned to my game table,
So that I can track the fleet during the campaign.

**Acceptance Criteria:**

**Given** je suis MJ avec une table active
**When** je crée un vaisseau
**Then** il est associé à ma table et persisté en DB

**Given** je suis MJ
**When** je modifie ou supprime un vaisseau
**Then** les changements sont persistés

**And** routes `src/routes/ships.js` : CRUD complet, filtré par `table_id`
**And** schéma minimal du vaisseau : `{ id, table_id, name, model_id (FK → ship_models, nullable), hull, crew, cargo_capacity, notes }`
**And** si `model_id` est fourni, les stats du modèle sont pré-remplies (instanciation) ; si null, création libre
**And** suppression d'un vaisseau = soft delete (`deleted_at`) — n'apparaît plus dans les listes, mais les routes/périls liés conservent la référence
**And** les joueurs consultent les vaisseaux visibles (filtré par visibility service, même pattern œil que le compendium)
**And** toggle visibilité sur un vaisseau → toast undo 8s (deferred commit, même pattern Epic 4 Story 4.4)
**And** tri d'affichage côté joueur : alphabétique par nom
**And** page `public/itineraire.html` — section vaisseaux

**Couvre :** FR29

---

#### Story 5.2a : Route planning — CRUD & API

As a MJ,
I want to create and edit travel routes between systems,
So that I can prepare journey sequences for the campaign.

**Acceptance Criteria:**

**Given** je suis MJ
**When** je crée une route en sélectionnant un système de départ et un système d'arrivée
**Then** une route est créée avec la liste ordonnée des waypoints

**Given** une route existe
**When** j'ajoute ou supprime des waypoints intermédiaires
**Then** les changements sont persistés et la liste se met à jour

**And** table DB `travel_routes` (id, table_id, name, active, created_at, updated_at)
**And** table DB `route_waypoints` (id, route_id, system_id FK → systems, position INTEGER) — dénormalisée pour requêtes sur segments
**And** API `src/routes/travel-routes.js` : POST, GET (list par table), GET /:id, PATCH, DELETE
**And** une seule route `active = true` par table à la fois (activer une route désactive la précédente)
**And** validation : chaque `system_id` doit exister dans `systems`
**And** pattern d'interaction mobile : **tap séquentiel** pour ajouter au parcours (pas de drag & drop) — chaque tap ajoute le système en fin de liste
**And** numéros d'ordre affichés sur chaque waypoint dans la liste
**And** suppression d'un waypoint : bouton ✕ avec undo toast 8s
**And** état vide : CTA clair « Créer un itinéraire » (pas d'écran blanc)

**Couvre :** FR28 (partie données)

---

#### Story 5.2b : Visualisation des routes sur la carte

As a MJ,
I want to see my routes drawn on the interactive map,
So that I can verify the journey path visually.

**Acceptance Criteria:**

**Given** une route active existe pour ma table
**When** j'ouvre la carte interactive (Epic 3)
**Then** une polyline SVG relie les systèmes de la route dans l'ordre des waypoints

**And** la polyline utilise un `<g class="route-overlay">` injecté dans le SVG existant (mécanisme d'overlay extensible)
**And** les waypoints intermédiaires sont marqués par un point numéroté
**And** la polyline se met à jour en temps réel si le MJ modifie la route (événement custom `route:updated`)
**And** les joueurs voient la route sur leur carte uniquement si la route est visible (visibility service)
**And** cette story est **conditionnelle** : l'API de 5.2a fonctionne indépendamment, la visu est un bonus
**And** cibles de touch agrandies (min 44×44px) sur les systèmes en mode sélection

**Couvre :** FR28 (partie visualisation)

---

#### Story 5.3 : Génération de la liste des périls

As a MJ,
I want to generate a peril list for a travel route,
So that I can prepare encounters without automatic resolution.

**Acceptance Criteria:**

**Given** je suis MJ avec une route définie
**When** je clique « Générer périls »
**Then** une liste de périls est générée basée sur les données de `perils` (seedées en DB depuis Epic 1)

**And** définition d'un **segment** = paire de waypoints consécutifs (ex : waypoint[0] → waypoint[1] = segment 1)
**And** définition d'une **zone** = `quadrant_id` du système d'arrivée du segment
**And** nombre de périls par segment = 1 à 3 (configurable, défaut 1-2 aléatoire uniforme)
**And** tirage pondéré parmi les périls de la zone (poids = champ `weight` de la table `perils`, défaut 1)
**And** seed aléatoire **non déterministe** (Math.random) — la régénération produit un résultat différent
**And** table DB `route_perils` : `{ id, route_id, peril_id FK, segment_index, custom_text (nullable), is_manual BOOLEAN DEFAULT false }`
**And** endpoints : `POST /api/travel-routes/:id/perils/generate`, `GET /api/travel-routes/:id/perils`, `PATCH /api/travel-routes/:id/perils/:perilId` (édition), `DELETE /api/travel-routes/:id/perils/:perilId`, `POST /api/travel-routes/:id/perils` (ajout manuel, `is_manual = true`)
**And** chaque péril affiché avec type, difficulté, description — PAS de résolution automatique
**And** édition MJ inline (tap pour modifier le texte, cibles tactiles généreuses)
**And** indicateur visuel distinct pour les périls édités manuellement vs générés
**And** **régénération** : si des périls manuels existent, dialogue de confirmation « X périls édités manuellement seront perdus. Continuer ? » — les périls manuels sont préservés par défaut, seuls les générés sont remplacés
**And** liste longue (>5 périls) : compteur résumé en haut + collapse/expand par segment

**Couvre :** FR30

---

#### Story 5.4 : Partage des données d'itinéraire avec les joueurs

As a joueur de la table,
I want to see the shared travel data for my active game,
So that I can follow the campaign's journey.

**Acceptance Criteria:**

**Given** je suis joueur avec une table active
**When** j'ouvre la section itinéraire
**Then** je vois les données partagées par le MJ : route active, vaisseaux visibles, périls révélés

**And** les données sont filtrées par le visibility service : `travel_routes`, `ships`, `route_perils` — chacun filtré individuellement
**And** granularité de visibilité : la route entière (pas segment par segment), les vaisseaux individuellement, les périls en bloc par route (MJ révèle tous les périls d'une route ou aucun)
**And** le delta sync (`GET /api/sync`) est enrichi avec la section `itinerary: { active_route, ships, perils }` — uniquement la route active (pas l'historique)
**And** payload borné : max 1 route + ses waypoints + ses périls + les ships visibles
**And** la page itinéraire se met à jour automatiquement via le poller
**And** cas « aucune route active » : section masquée avec message « Aucun itinéraire en cours »
**And** vue joueur = **journal de bord** : présentation narrative des waypoints et périls révélés (pas un tableau brut), avec noms des systèmes et icônes de péril
**And** le mode preview MJ (Epic 4 Story 4.6) s'applique aussi à cette page (cadre coloré visible)

**Couvre :** FR31

---

**Résumé Epic 5 : 5 stories (5.1, 5.2a, 5.2b, 5.3, 5.4) — FR28-31 couverts.**

### Epic 6 : Résilience, Polish & Décommissionnement

#### Story 6.1a : Indicateur réseau & mode lecture seule

As a utilisateur,
I want the app to show my connection status and remain usable in read mode during a network loss,
So that I'm never confused about what's happening.

**Acceptance Criteria:**

**Given** la connexion réseau est perdue
**When** le poller échoue
**Then** un indicateur 🔴 « Hors ligne » apparaît dans le header (visible sur toutes les pages)

**And** l'UI reste fonctionnelle en lecture (données locales affichées, navigation possible)
**And** les boutons d'action MJ (toggle, edit, create, delete, bulk) sont désactivés visuellement (grisés + curseur disabled)
**And** les joueurs voient aussi l'indicateur 🔴

**Given** la connexion revient
**When** le poller réussit à nouveau
**Then** l'indicateur repasse à 🟢, le poller reprend normalement
**And** rattrapage via version jump : si le delta manqué > 1 version, full refresh automatique
**And** toast de confirmation « Reconnecté — données synchronisées »
**And** retry avec backoff exponentiel (1s, 2s, 4s, max 30s)

**Given** la perte réseau dure > 60 secondes
**When** le retry échoue encore
**Then** message explicite « Connexion perdue depuis plus d'une minute. Vérifiez votre réseau. » (pas juste le 🔴)

**Couvre :** FR37, NFR11

---

#### Story 6.1b : File d'attente MJ offline (post-MVP)

> **NOTE : Story différée.** Jugée trop complexe pour le scope initial (offline-first déguisé : idempotence, ordre de replay, conflits multi-onglets). À réévaluer si le besoin se confirme en usage réel. Pour le MVP, perte réseau = mode lecture seule côté MJ.

**Couvre :** — (scope futur)

---

#### Story 6.2 : Cold start NAS & loading UX

As a utilisateur,
I want a clear loading experience when the server is waking up,
So that I don't think the app is broken.

**Acceptance Criteria:**

**Given** le serveur NAS est en cold start (première requête > 5s)
**When** la page charge
**Then** un overlay s'affiche « Le serveur se réveille… quelques secondes » avec barre de progression indéterminée

**And** si la première réponse API prend > 1s, un `<div id="loading-overlay">` s'affiche
**And** l'overlay disparaît automatiquement dès que la première réponse API arrive
**And** Express sert les assets statiques avec `Cache-Control: public, max-age=604800` et query string `?v=` injectée au build (ex: `style.css?v=1.0`)
**And** l'adaptive polling est couvert par les tests E2E (pas d'AC séparé ici)

**Note :** les métriques NFR (FMP < 2s, API < 500ms pour ~200 entités) sont intégrées comme **Definition of Done** transversale à partir de l'Epic 3 (premier payload lourd). Elles ne constituent pas une story séparée.

**Couvre :** NFR1-5, NFR14, NFR17

---

#### Story 6.3a : Suite E2E Playwright cross-epic

As a développeur,
I want a comprehensive E2E test suite covering the full user flow,
So that regressions are caught automatically.

**Acceptance Criteria:**

**Given** toutes les fonctionnalités sont implémentées
**When** la suite Playwright s'exécute
**Then** le parcours complet est validé : inscription → création table → invitation joueur → seed données → compendium lecture/recherche → carte reveal → dashboard bulk/undo/preview → itinéraire → resync

**And** parcours MJ complet (tous les CRUD + visibilité + bulk + preview)
**And** parcours joueur complet (consultation + recherche + mode passif)
**And** test de resync : simuler coupure réseau et vérifier le rattrapage

**Couvre :** NFR7

---

#### Story 6.3b : Décommissionnement legacy

As a admin,
I want the legacy files removed once the migration is complete,
So that the codebase is clean and maintainable.

**Acceptance Criteria:**

**Given** la suite E2E passe à 100%
**When** je supprime les fichiers legacy
**Then** l'application fonctionne sans régression

**And** fichiers à supprimer : `compendium.html` (racine), `carte_interactive.html`, `itineraire.html`, `peril.html`, `personnage.html`, `revolte.html`, `calendrier.html`
**And** vérifier qu'aucune route Express ne sert encore ces fichiers (pas de 404 silencieux)
**And** les anciens bookmarks/URLs vers ces fichiers retournent une page « Cette page a déménagé → [lien vers nouvelle page] » (redirection gracieuse, pas un 404 brutal)
**And** les JSON legacy (`perils_data.json`, `quadrants_MA.json`, `galactic_events.json`) conservés en racine comme fichiers source de seed, mais non servis par `express.static` (exclus ou déplacés hors `public/`)
**And** `Classeur1.xlsm` archivé hors du projet (pas dans le repo)

**Couvre :** NFR15-16

---

#### Story 6.3c : Docker build, deploy & documentation

As a admin,
I want the Docker deployment validated and documented,
So that the app can be reliably deployed on my NAS.

**Acceptance Criteria:**

**Given** l'application est finalisée
**When** je lance `docker build && docker run`
**Then** l'application démarre et toutes les fonctionnalités sont opérationnelles

**And** Dockerfile : Node 22-alpine, volume pour `db/`, copie des assets, multi-stage build si pertinent
**And** `docker-compose.yml` avec volume persistant pour SQLite + restart policy
**And** `.env.example` documenté avec toutes les variables requises
**And** `README.md` : setup local, variables d'environnement, commandes (dev, build, test, deploy), architecture sommaire
**And** le build Docker est testé dans la CI (si CI configurée) ou manuellement validé

**Couvre :** NFR15

---

**Résumé Epic 6 : 5 stories (6.1a, 6.1b différée, 6.2, 6.3a, 6.3b, 6.3c) — FR37, NFR1-5, NFR7, NFR11, NFR14-17 couverts.**

---

**Résumé global : 6 epics, 30 stories (dont 1 différée), 38/39 FRs couverts (FR20 retiré).**

---

## Epic 7 : Graphe de campagne — Entity Links

Le MJ peut relier n'importe quelle entité à une autre (système, faction, vaisseau, PNJ, PJ, événement). La vue "entités liées" apparaît sur les fiches système du Compendium. Fondation extensible du graphe de campagne.

### Story 7.1 : Migration entity_links + service CRUD

As a développeur et MJ,
I want the entity_links table with defensive migration and a full CRUD service with type validation,
So that the MJ can create, query, and delete typed links between any two entities via the API.

**Acceptance Criteria:**

**Given** le serveur démarre
**When** ensureEntityLinks() est exécutée dans database.js
**Then** la table entity_links est créée avec : id, table_id INTEGER REFERENCES game_tables(id) ON DELETE CASCADE, source_type TEXT NOT NULL, source_id INTEGER NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, relation_type TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
**And** deux index sont créés : idx_el_source (table_id, source_type, source_id) et idx_el_target (table_id, target_type, target_id)
**And** la migration est idempotente (re-run multiple fois = même résultat)

**Given** un MJ authentifié avec une table sélectionnée
**When** POST /api/entity-links avec { source_type, source_id, target_type, target_id, relation_type, notes }
**Then** le lien est créé et retourné avec son id et created_at (HTTP 201)

**Given** une requête POST avec source_type invalide (ex: "monster")
**When** le service valide les types
**Then** l'API retourne 400 avec error.code "INVALID_ENTITY_TYPE"
**And** la validation couvre : null, chaîne vide, valeur non dans ['system','faction','ship','named_npc','character','event']

**Given** un MJ
**When** DELETE /api/entity-links/:id
**Then** le lien est supprimé, retourne 204
**And** un lien appartenant à une autre table retourne 403

**Given** un utilisateur authentifié avec table
**When** GET /api/entity-links?source_type=system&source_id=42
**Then** retourne tous les liens dont source_type=system ET source_id=42 ET table_id = req.table.id
**And** les liens d'autres tables ne sont jamais retournés (isolation table_id)

**And** src/services/entity-links.js est créé avec : createLink, getLinks, deleteLink
**And** toutes les routes utilisent le helper response.js
**And** GET nécessite auth+table, POST/DELETE nécessite rôle MJ

**Couvre :** FR7.1, FR7.2, FR7.7, NFR-EL1

---

### Story 7.2 : Vue "entités liées" dans la fiche système Compendium

As a MJ ou joueur,
I want to see a "linked entities" panel on each system sheet in the Compendium,
So that I can navigate the campaign graph directly from a system's detail page.

**Acceptance Criteria:**

**Given** une fiche système est affichée dans le Compendium
**When** la page se charge
**Then** une section "Entités liées" est visible sous les données système

**Given** le système a des entités liées
**When** la section est affichée
**Then** chaque lien affiche : type de l'entité cible (icône ou badge), nom de l'entité cible, type de relation si renseigné, note si renseignée
**And** chaque entrée est cliquable et navigue vers la fiche de l'entité cible

**Given** le MJ est authentifié
**When** la section entités liées est affichée
**Then** un bouton "Ajouter un lien" est visible et ouvre un formulaire inline : source_type=system, source_id=<id courant>, champs target_type/target_id/relation_type/notes
**And** un bouton "Supprimer" est visible sur chaque lien existant

**Given** aucun lien n'existe pour ce système
**When** la section est ouverte
**Then** un message "Aucune entité liée" s'affiche

**And** le module public/js/shared/entity-links.js est créé comme composant réutilisable
**And** toutes les valeurs affichées via innerHTML utilisent esc() obligatoirement
**And** les appels API utilisent fetchWithTable()

**Couvre :** FR7.3, FR7.5, FR7.6

---

### Story 7.3 : Protect-by-default — liens vers entités cachées

As a joueur,
I want to never see links to entities I'm not supposed to know about,
So that the MJ's hidden campaign information remains protected.

**Acceptance Criteria:**

**Given** un système a un lien vers un PNJ nommé avec visible=0
**When** un joueur charge la fiche système
**Then** ce lien N'apparaît PAS dans sa vue

**Given** un système a un lien vers un autre système avec visible=0
**When** un joueur charge la fiche
**Then** ce lien N'apparaît PAS même si le joueur connaît l'ID

**Given** un MJ charge la même fiche
**When** la section entités liées est affichée
**Then** TOUS les liens sont visibles y compris ceux vers des entités cachées
**And** les liens vers entités cachées sont visuellement marqués "(caché)" ou avec icône cadenas

**And** le filtrage se fait côté serveur dans src/services/entity-links.js — le client ne filtre jamais
**And** le service reçoit le rôle de req.table et filtre selon la visibilité de l'entité cible
**And** un test d'intégration vérifie que GET /api/entity-links ne retourne jamais de lien vers une entité visible=0 pour un joueur

**Couvre :** FR7.4

---

### Story 7.4 : Tests sécurité — validation types + leakage cross-table

As a développeur,
I want dedicated security tests for the entity_links validation matrix and cross-table isolation,
So that the graph foundation cannot be exploited to leak data between tables.

**Acceptance Criteria:**

**Given** la suite tests/integration/entity-links-security.test.js
**When** exécutée avec node --test
**Then** la matrice suivante passe pour source_type ET target_type :
- Valeur valide ('system') → 201 ✅
- null → 400, error.code INVALID_ENTITY_TYPE ✅
- Chaîne vide ('') → 400 ✅
- Valeur inconnue ('monster') → 400 ✅
- Tentative injection SQL → 400 ✅

**Given** deux tables de jeu A et B avec des entités dans chacune
**When** un MJ de la table A appelle GET /api/entity-links?source_type=system&source_id=<id_système_table_B>
**Then** le résultat est vide — aucun lien de la table B ne fuit

**Given** un MJ de la table A tente POST /api/entity-links avec target_id pointant vers une entité de la table B
**When** le service vérifie la cohérence
**Then** l'API retourne 400 ou 403 (pas de lien inter-tables possible)

**And** les tests couvrent aussi : DELETE d'un lien d'une autre table = 403, GET sans table = 401
**And** les tests utilisent une DB SQLite in-memory

**Couvre :** NFR-EL1 (sécurité cross-table), AR7

---

**Résumé Epic 7 : 4 stories — FR7.1–FR7.7 et NFR-EL1 couverts.**

---

## Epic 8 : Fiches PJ interactives

Un joueur connecté peut consulter sa propre fiche PJ (santé dynamique, PP, Gloire, Énergie X, OD). Le MJ peut créer et modifier toutes les fiches de sa table. Le service de santé est extrait comme module réutilisable pour Epic 9.

### Story 8.1 : Migration characters + healthService.js

As a développeur,
I want the characters table extended with PJ fields and a reusable health calculation service exported as a module,
So that all character sheets (PJ and named NPCs in Epic 9) share the same validated server-side health logic.

**Acceptance Criteria:**

**Given** le serveur démarre
**When** ensureCharactersExtensions() est exécutée dans database.js
**Then** les colonnes suivantes sont ajoutées à characters si absentes : type TEXT DEFAULT 'pj', user_id INTEGER, archetype TEXT, is_mutant INTEGER DEFAULT 0, stats_json TEXT, competences_json TEXT, sante_json TEXT, sante_niveaux INTEGER DEFAULT 3, pp INTEGER DEFAULT 3, gloire INTEGER DEFAULT 0, energie_x_max INTEGER DEFAULT 0, energie_x_cur INTEGER DEFAULT 0, motivation TEXT, overdrive_trigger TEXT, qualites_json TEXT, defauts_json TEXT
**And** la migration est idempotente

**Given** un appel à healthService.computeHealthTemplate({ car, sf, niveaux })
**When** le service calcule
**Then** retourne { niveaux: [ { cases: [ { etat: 'vide' }, ... ] } ] } avec (car+sf) cases par niveau
**And** un personnage avec car=4, sf=3 a 3 niveaux de 7 cases chacun

**Given** un appel à healthService.computeEnergyXMax({ per, int })
**When** calculé
**Then** retourne per+int

**And** src/services/health-service.js exporte : computeHealthTemplate, computeEnergyXMax, getHealthState, setHealthCase
**And** des tests unitaires couvrent computeHealthTemplate (valeurs normales, min, max) et computeEnergyXMax

**Couvre :** NFR-PJ2, NFR-NPC1 (module exportable), AR-P2.2

---

### Story 8.2 : CRUD fiches PJ + isolation joueur API

As a MJ,
I want to create and manage character sheets associated to each player,
So that each player has their own sheet tied to their account with full isolation.

**Acceptance Criteria:**

**Given** un MJ authentifié avec table sélectionnée
**When** POST /api/characters avec { nom, user_id, archetype, stats_json, is_mutant, ... }
**Then** la fiche est créée avec table_id = req.table.id, type = 'pj'
**And** sante_json est initialisé via healthService.computeHealthTemplate
**And** si is_mutant=1, energie_x_max est calculé via healthService.computeEnergyXMax

**Given** un MJ
**When** GET /api/characters?type=pj
**Then** toutes les fiches PJ de sa table sont retournées

**Given** un joueur authentifié
**When** GET /api/characters/:id avec l'id d'un autre joueur de sa table
**Then** retourne 403 Forbidden

**Given** un joueur authentifié
**When** GET /api/characters/:id avec son propre id
**Then** retourne sa fiche complète

**Given** un MJ
**When** GET /api/characters/:id (quel que soit l'user_id)
**Then** retourne la fiche complète

**And** la matrice d'autorisation est testée pour GET, PATCH, DELETE (owner ✅, non-owner joueur ❌, MJ ✅)

**Couvre :** FR8.1, FR8.2, FR8.3, FR8.4, NFR-PJ1

---

### Story 8.3 : Santé dynamique — cases cochées et noircies

As a MJ ou joueur,
I want to check and mark health cases on character sheets during a game session,
So that the character's health state is accurately tracked in real time.

**Acceptance Criteria:**

**Given** une fiche PJ est affichée
**When** la santé est rendue
**Then** elle affiche 3 niveaux (ou sante_niveaux), chaque niveau ayant CAR+SF cases
**And** une case "cochée" (dommage scène) s'affiche différemment d'une case "noircie" (dommage permanent)
**And** les cases sont remplies de droite à gauche visuellement

**Given** un MJ est en vue fiche PJ
**When** il clique sur une case
**Then** il peut passer entre les états : vide / cochée / noircie
**And** PATCH /api/characters/:id/health envoie { niveau_index, case_index, etat } et met à jour sante_json

**Given** un joueur est en vue sa propre fiche
**When** il clique sur une case
**Then** il peut basculer entre vide et cochée uniquement
**And** si le joueur envoie etat='noircie', l'API retourne 403

**And** les calculs de template restent côté serveur (le client ne recalcule pas CAR+SF)
**And** toutes les valeurs affichées via innerHTML utilisent esc()

**Couvre :** FR8.5, FR8.6, FR8.7, FR8.8, FR8.9, NFR-PJ2

---

### Story 8.4 : Ressources de session — PP, Gloire, Énergie X

As a MJ ou joueur,
I want to track and update PP, Gloire, and Énergie X on character sheets during a session,
So that session resources are always up to date.

**Acceptance Criteria:**

**Given** une fiche PJ affichée
**When** les ressources sont rendues
**Then** PP courant, Gloire et (si is_mutant) Énergie X courante/max sont visibles

**Given** un MJ
**When** PATCH /api/characters/:id avec { pp, gloire, ou energie_x_cur }
**Then** les valeurs sont mises à jour (pp et energie_x_cur minimum 0, energie_x_cur maximum energie_x_max)

**Given** un joueur
**When** PATCH /api/characters/:id/resources avec { delta_pp: -1 }
**Then** le PP est décrémenté, minimum 0
**And** si delta_pp > 0 est envoyé par un joueur, l'API retourne 403

**Given** un joueur mutant
**When** PATCH /api/characters/:id/resources avec { delta_energie_x: -N }
**Then** l'Énergie X courante diminue, minimum 0

**Given** un personnage non-mutant (is_mutant = 0)
**When** la fiche est affichée
**Then** le bloc Énergie X n'est pas affiché

**Couvre :** FR8.10, FR8.11, FR8.12, FR8.13, FR8.14, FR8.15

---

### Story 8.5 : Page personnage.html — vue joueur + motivation OD

As a joueur,
I want a dedicated character sheet page where I can see all my session info with my Overdrive trigger prominently displayed,
So that I never miss my OD trigger during a game session.

**Acceptance Criteria:**

**Given** je suis un joueur authentifié
**When** j'ouvre public/personnage.html
**Then** ma fiche PJ est chargée automatiquement
**And** la santé est affichée visuellement (niveaux + cases), les PP, la Gloire et l'Énergie X (si mutant) sont visibles

**Given** ma fiche a une motivation et un déclencheur OD renseignés
**When** la page se charge
**Then** la motivation est affichée
**And** le déclencheur OD est mis en évidence avec une couleur contrastée (ex: orange/ambre) et une icône distincte
**And** l'OD est visible sans scroll sur mobile

**Given** le MJ ouvre la section fiches PJ (admin.html ou vue dédiée)
**When** la liste se charge
**Then** toutes les fiches de sa table sont listées, chacune éditable via formulaire complet

**And** la page utilise public/js/personnage/pj-app.js
**And** toutes les valeurs affichées via innerHTML utilisent esc()

**Couvre :** FR8.16, FR8.17, FR8.1 (vue MJ)

---

### Story 8.6 : Tests matrice autorisation complète PJ

As a développeur,
I want a complete authorization matrix test suite for the characters API covering all HTTP methods,
So that the player isolation guarantee (NFR-PJ1) is verified exhaustively.

**Acceptance Criteria:**

**Given** la suite tests/integration/characters-auth.test.js
**When** exécutée avec node --test
**Then** les cas suivants passent :

| Appel | Rôle | Résultat |
|---|---|---|
| GET /api/characters/:own_id | joueur owner | 200 |
| GET /api/characters/:other_id | joueur non-owner | 403 |
| GET /api/characters/:any_id | MJ | 200 |
| PATCH /api/characters/:own_id | joueur owner | 200 (champs autorisés) |
| PATCH /api/characters/:other_id | joueur non-owner | 403 |
| PATCH /api/characters/:any_id | MJ | 200 |
| DELETE /api/characters/:own_id | joueur | 403 (suppression = MJ only) |
| DELETE /api/characters/:any_id | MJ | 200 |
| PATCH delta_pp > 0 | joueur | 403 |
| PATCH etat='noircie' | joueur | 403 |

**And** les tests utilisent une DB SQLite in-memory
**And** les tokens JWT de test sont générés avec la même clé que le serveur

**Couvre :** NFR-PJ1 (toutes méthodes HTTP), AR7

---

**Résumé Epic 8 : 6 stories — FR8.1–FR8.17, NFR-PJ1, NFR-PJ2, NFR-NPC1 couverts. healthService.js exposé comme module réutilisable pour Epic 9.**

---

## Epic 9 : PNJ Nommés

Le MJ peut créer des PNJ à stats complètes (Premiers/Seconds rôles), les lier au graphe, et régler leur visibilité. Les joueurs voient les PNJ révélés dans le Compendium (fiche simplifiée). La santé est gérée via le même service que les PJ.

### Story 9.1 : Table named_npcs + CRUD MJ

As a MJ,
I want to create, edit, and delete named NPCs with full MA stats,
So that I can prepare antagonists and allies with complete character data before a session.

**Acceptance Criteria:**

**Given** le serveur démarre
**When** ensureNamedNpcs() est exécutée dans database.js
**Then** la table named_npcs est créée avec : id, table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE, nom TEXT NOT NULL, role_type TEXT NOT NULL CHECK(role_type IN ('premier_role','second_role')), archetype TEXT, stats_json TEXT, competences_json TEXT, is_mutant INTEGER NOT NULL DEFAULT 0, energie_x INTEGER NOT NULL DEFAULT 0, motivation TEXT, overdrive_trigger TEXT, aptitude TEXT, qualites_json TEXT, defauts_json TEXT, pp INTEGER NOT NULL DEFAULT 3, sante_json TEXT, notes TEXT, visible INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT
**And** index idx_named_npcs_table sur (table_id) créé
**And** la migration est idempotente

**Given** un MJ authentifié
**When** POST /api/named-npcs avec { nom, role_type, archetype, stats_json, ... }
**Then** le PNJ est créé avec visible=0 par défaut
**And** sante_json est initialisé via healthService.computeHealthTemplate (import explicite depuis src/services/health-service.js)
**And** si is_mutant=1, energie_x_max calculé via healthService.computeEnergyXMax

**Given** un MJ
**When** PATCH /api/named-npcs/:id
**Then** peut modifier toutes les données

**Given** un MJ
**When** DELETE /api/named-npcs/:id
**Then** le PNJ est supprimé après confirmation côté client

**And** un joueur ne peut ni créer, ni modifier, ni supprimer (403 sur POST/PATCH/DELETE)
**And** src/services/named-npcs.js importe healthService depuis src/services/health-service.js (pas de duplication)

**Couvre :** FR9.1, FR9.2, FR9.3, NFR-NPC1

---

### Story 9.2 : Liaison entity_links depuis le formulaire PNJ

As a MJ,
I want to create entity links directly from the NPC creation/edit form,
So that I can connect a named NPC to systems, factions, or ships without leaving the NPC page.

**Acceptance Criteria:**

**Given** le formulaire de création/édition d'un PNJ nommé est ouvert
**When** le MJ arrive à la section "Entités liées"
**Then** la liste des liens existants pour ce PNJ est affichée (GET /api/entity-links?source_type=named_npc&source_id=:id)

**Given** le MJ clique "Ajouter un lien"
**When** il sélectionne type d'entité, ID cible, type de relation, note optionnelle
**Then** POST /api/entity-links est envoyé avec source_type='named_npc', source_id=<id_pnj>
**And** le lien apparaît dans la liste sans reload de page

**Given** le MJ clique "Supprimer" sur un lien
**When** confirmé
**Then** DELETE /api/entity-links/:id est appelé et le lien disparaît

**And** le formulaire réutilise public/js/shared/entity-links.js (pas de duplication de code)

**Couvre :** FR9.4

---

### Story 9.3 : Visibilité PNJ + vue joueur Compendium

As a MJ,
I want to control which named NPCs are visible to players,
So that I reveal antagonists only at the right narrative moment.

**Acceptance Criteria:**

**Given** un PNJ nommé avec visible=0
**When** un joueur appelle GET /api/named-npcs
**Then** ce PNJ n'apparaît PAS dans la liste

**Given** un MJ toggle visible=1 via PATCH /api/named-npcs/:id { visible: 1 }
**When** le joueur appelle ensuite GET /api/named-npcs
**Then** le PNJ apparaît avec : nom, role_type, archetype uniquement (pas les stats)

**Given** un joueur appelle GET /api/named-npcs/:id pour un PNJ visible
**When** la réponse est retournée
**Then** les champs stats_json, competences_json, sante_json, pp, energie_x sont ABSENTS du payload
**And** les champs nom, role_type, archetype, motivation, overdrive_trigger sont présents si renseignés

**Given** un MJ appelle GET /api/named-npcs/:id
**When** la réponse est retournée
**Then** TOUS les champs sont présents (payload complet)

**And** named-npcs.js implémente getForRole(id, role) construisant le payload selon le rôle
**And** les PNJ révélés apparaissent dans l'onglet "PNJ" du Compendium côté joueur

**Couvre :** FR9.5, FR9.6

---

### Story 9.4 : Recherche et filtrage PNJ (vue MJ)

As a MJ,
I want to filter and search named NPCs by faction, role type, or name,
So that I can quickly find the right NPC during a game session.

**Acceptance Criteria:**

**Given** le MJ appelle GET /api/named-npcs?faction=EG
**When** le filtre est appliqué
**Then** seuls les PNJ dont le champ faction correspond sont retournés

**Given** GET /api/named-npcs?role_type=premier_role
**Then** seuls les PNJ de ce type sont retournés

**Given** GET /api/named-npcs?q=Blood
**When** la recherche est effectuée
**Then** les PNJ dont le nom contient "Blood" (LIKE '%Blood%', case-insensitive) sont retournés

**And** les filtres sont combinables (faction + role_type + q)
**And** la liste est limitée à 50 entrées maximum
**And** l'interface MJ affiche la liste filtrée avec debounce 300ms sur le champ de recherche

**Couvre :** FR9.7

---

### Story 9.5 : Santé PNJ + vue entités liées sur fiche système

As a MJ,
I want named NPCs to have the same health tracking as PJ sheets, and to appear in system linked entities panels,
So that the campaign graph is fully connected and health management is consistent.

**Acceptance Criteria:**

**Given** un PNJ nommé avec stats_json car=3, sf=2
**When** le MJ ouvre la fiche du PNJ
**Then** la santé affiche 3 niveaux de 5 cases chacun
**And** le MJ peut modifier les cases via PATCH /api/named-npcs/:id/health { niveau_index, case_index, etat }

**And** PATCH /api/named-npcs/:id/health utilise healthService.setHealthCase (pas de logique santé dupliquée)

**Given** un système a un lien entity_links vers un PNJ nommé visible=1
**When** un joueur charge la fiche système dans le Compendium
**Then** ce PNJ apparaît dans "Entités liées" avec un lien vers sa fiche simplifiée

**Given** un système a un lien vers un PNJ nommé visible=0
**When** un joueur charge la fiche système
**Then** ce PNJ N'apparaît PAS dans les entités liées (protect-by-default de Story 7.3)

**Couvre :** FR9.8, FR9.9, NFR-NPC1

---

**Résumé Epic 9 : 5 stories — FR9.1–FR9.9, NFR-NPC1 couverts.**

---

## Epic 10 : Catalogue Figurants

Bibliothèque de stats-blocs réutilisables pour les PNJ anonymes. 15 templates système pré-peuplés, ajout de templates personnalisés. Données globales non liées au graphe d'entités.

### Story 10.1 : Table figurant_templates + seed + consultation

As a MJ,
I want to browse a pre-populated catalog of figurant stat-blocks,
So that I can quickly look up anonymous NPC stats during a combat session.

**Acceptance Criteria:**

**Given** le serveur démarre
**When** ensureFigurantTemplates() est exécutée dans database.js
**Then** la table figurant_templates est créée avec : id, nom TEXT NOT NULL, faction TEXT, categorie TEXT, structure INTEGER NOT NULL DEFAULT 3, blindage INTEGER NOT NULL DEFAULT 0, degats TEXT, mf_disponible INTEGER NOT NULL DEFAULT 0, competences_json TEXT, notes TEXT, is_system_template INTEGER NOT NULL DEFAULT 0, created_at TEXT
**And** la migration est idempotente

**Given** la phase de seed
**When** les 15 templates système sont insérés
**Then** chaque template est inséré seulement si un template de même nom n'existe pas (WHERE nom = ? avant INSERT)
**And** les 15 templates ont is_system_template=1 : Marin havanais, Pirate Black Mamba, Pirate Hijos de Havana, Soldat impérial, Marine impérial (armure), Citoyen Sol (noble), Chevalier de Sol, Cadre OCG, Agent OCG, Garde du corps OCG, Citoyen LPL, Agent LPL (secret), Esclave des Barrens, Pillard barren, Mercenaire (neutre)

**Given** un utilisateur authentifié
**When** GET /api/figurants
**Then** retourne tous les templates système + personnalisés
**And** la route fonctionne sans header X-Table-Id (données globales — middleware req.table non requis)

**Given** GET /api/figurants?faction=EG&categorie=militaire
**Then** seuls les templates correspondants sont retournés

**Couvre :** FR10.1, FR10.2, FR10.6, FR10.7, AR-P2.5

---

### Story 10.2 : CRUD templates personnalisés + protection immutables

As a MJ,
I want to add, edit, and remove custom figurant templates while system templates remain protected,
So that I can create campaign-specific stat-blocks without risking the default catalog.

**Acceptance Criteria:**

**Given** un MJ authentifié
**When** POST /api/figurants avec { nom, faction, categorie, structure, blindage, degats, ... }
**Then** le template est créé avec is_system_template=0

**Given** un MJ
**When** PATCH /api/figurants/:id sur un template is_system_template=0
**Then** la mise à jour est acceptée

**Given** un MJ tente PATCH /api/figurants/:id sur un template is_system_template=1
**When** la requête est reçue
**Then** l'API retourne 403 avec error.code "SYSTEM_TEMPLATE_IMMUTABLE"

**Given** un MJ tente DELETE /api/figurants/:id sur un template is_system_template=1
**When** la requête est reçue
**Then** l'API retourne 403

**Given** un MJ clique "Dupliquer" sur un template système
**When** l'action est confirmée
**Then** POST /api/figurants est envoyé avec les données copiées et is_system_template=0

**And** un joueur ne peut ni créer, modifier, ni supprimer de figurants (403 sur POST/PATCH/DELETE)
**And** un test unitaire vérifie PATCH et DELETE sur is_system_template=1 retournent tous les deux 403

**Couvre :** FR10.3, FR10.4, FR10.5, NFR-FIG1 (PATCH + DELETE protégés)

---

### Story 10.3 : Interface MJ — stats-bloc consultatif

As a MJ,
I want a searchable figurant browser with readable stat-blocks,
So that I can find the right NPC stats in under 10 seconds during a combat.

**Acceptance Criteria:**

**Given** le MJ ouvre la section Catalogue Figurants
**When** la liste se charge
**Then** tous les templates sont affichés avec : nom, faction, catégorie, structure, blindage, dégâts, MF disponible

**Given** le MJ tape dans le champ de recherche (debounce 300ms)
**When** le texte change
**Then** la liste est filtrée par nom (LIKE) et/ou faction

**Given** le MJ ouvre un template en détail
**When** le stats-bloc complet est affiché
**Then** structure, blindage, dégâts, MF disponible, compétences résumées, notes sont visibles
**And** le layout est lisible sur mobile (pas de scroll horizontal)

**And** l'interface est dans public/js/admin/figurants-app.js
**And** toutes les valeurs via innerHTML utilisent esc()

**Couvre :** FR10.1, FR10.2 (interface), FR10.6

---

**Résumé Epic 10 : 3 stories — FR10.1–FR10.7, NFR-FIG1 couverts.**

---

## Epic 11 : Metal Faktor Pool Tracker

Widget compact gérant le pool de 50 dés MF en temps réel. Persisté par table, accessible depuis Dashboard MJ et Itinéraire (retrofit pages PRD #1). Priorité : snapshots de régression avant tout retrofit.

### Story 11.1 : Snapshots E2E pre-retrofit

As a développeur,
I want baseline Playwright snapshots of the Dashboard MJ and Itinéraire pages before any widget integration,
So that any layout regression introduced by the MF widget is immediately detectable.

**Acceptance Criteria:**

**Given** les pages Dashboard MJ et Itinéraire sont opérationnelles (PRD #1 livré)
**When** le test tests/e2e/pre-retrofit-snapshots.test.js est exécuté
**Then** des screenshots stables sont capturés pour les deux pages (viewport desktop 1280×720 et mobile 375×812)
**And** les snapshots sont sauvegardés dans tests/snapshots/pre-mf-retrofit/

**Given** les snapshots de base existent
**When** les stories 11.3 et 11.4 seront exécutées
**Then** les tests de régression utiliseront ces snapshots comme référence

**And** le script de génération des snapshots est commité (pas les images si volumineuses)
**And** un commentaire dans le test documente quelle zone de chaque page sera affectée par le retrofit

**Couvre :** AR7 (E2E), protection régression Epic 11

---

### Story 11.2 : Table mf_pool + service atomique + API

As a développeur et MJ,
I want a persisted MF pool per table with atomic transfers enforced at DB level,
So that the 50-die total constraint is never violated.

**Acceptance Criteria:**

**Given** le serveur démarre
**When** ensureMFPool() est exécutée dans database.js
**Then** la table mf_pool est créée avec : id INTEGER PRIMARY KEY, table_id INTEGER NOT NULL UNIQUE REFERENCES game_tables(id) ON DELETE CASCADE, pj_pool INTEGER NOT NULL DEFAULT 50, mj_pool INTEGER NOT NULL DEFAULT 0, updated_at TEXT, CHECK (pj_pool >= 0), CHECK (mj_pool >= 0), CHECK (pj_pool + mj_pool = 50)
**And** la migration est idempotente

**Given** une table de jeu n'a pas encore de ligne mf_pool
**When** GET /api/mf-pool est appelé
**Then** une ligne est créée automatiquement (INSERT OR IGNORE) avec pj=50, mj=0, puis retournée

**Given** un MJ
**When** POST /api/mf-pool/transfer avec { delta: 3, direction: "pj_to_mj" }
**Then** la transaction SQLite (begin/commit) met à jour pj_pool -3 et mj_pool +3 atomiquement
**And** si le résultat violerait pj_pool < 0, l'API retourne 400 error.code "MF_INSUFFICIENT"
**And** la validation applicative précède l'ouverture de la transaction (double validation)

**Given** un MJ
**When** POST /api/mf-pool/reset (avec confirmation côté client)
**Then** pj_pool = 50, mj_pool = 0 dans une transaction atomique

**And** src/services/mf-pool.js : getPool, transfer (atomique), reset (atomique)
**And** GET nécessite auth+table, POST/transfer et POST/reset nécessitent rôle MJ

**Couvre :** FR11.1, FR11.2, FR11.3, FR11.4, FR11.5, FR11.6, NFR-MF1, NFR-MF2

---

### Story 11.3 : Widget mf-pool-widget.js + intégration Dashboard MJ

As a MJ,
I want an MF Pool widget available directly on the Dashboard without extra navigation,
So that I can manage the pool in real time during combat.

**Acceptance Criteria:**

**Given** le MJ a le Dashboard MJ ouvert
**When** la page se charge
**Then** le widget MF Pool est visible sans scroll
**And** le widget affiche "PJ : 45" et "MJ : 5" avec une barre visuelle reflétant l'équilibre PJ/MJ
**And** plus le MJ a de dés (mj_pool élevé), plus la couleur de la barre change (tension montante)

**Given** le MJ clique "−1 PJ / +1 MJ" (ou la direction inverse)
**When** le transfert est envoyé
**Then** le widget se met à jour immédiatement (optimistic UI)
**And** si l'API retourne 400, l'affichage revient à l'état précédent avec message d'erreur

**Given** le MJ active le bouton ×5
**When** il clique un bouton de transfert
**Then** le delta est multiplié par 5

**Given** le MJ clique "Reset aventure" et confirme
**When** la confirmation est validée
**Then** POST /api/mf-pool/reset est envoyé et le widget affiche PJ:50 / MJ:0

**And** public/js/shared/mf-pool-widget.js est un module autonome paramétrable (container_id)
**And** le module est importé dans le JS du Dashboard MJ
**And** les tests de régression post-retrofit Dashboard (vs snapshots Story 11.1) passent

**Couvre :** FR11.1–FR11.9, FR11.7 (Dashboard)

---

### Story 11.4 : Intégration widget dans la page Itinéraire (retrofit)

As a MJ,
I want the MF Pool widget also available on the Itinéraire page,
So that I can manage combat dice without switching tabs during a session.

**Acceptance Criteria:**

**Given** la page Itinéraire est ouverte
**When** la page se charge
**Then** le widget MF Pool est visible dans une zone cohérente du layout existant (sidebar ou section distincte)
**And** le widget utilise le même module mf-pool-widget.js que le Dashboard (zéro duplication de code)

**Given** le MJ interagit avec le widget sur l'Itinéraire
**When** un transfert est effectué
**Then** il fonctionne identiquement au Dashboard

**And** les tests de régression post-retrofit Itinéraire (vs snapshots Story 11.1) passent
**And** aucune fonctionnalité existante de la page Itinéraire n'est altérée

**Couvre :** FR11.7 (retrofit Itinéraire)

---

### Story 11.5 : Tests atomicité + contrainte DB mf_pool

As a développeur,
I want dedicated tests validating the MF Pool's atomic transfer and CHECK constraint,
So that the 50-die invariant is verifiably maintained including under error conditions.

**Acceptance Criteria:**

**Given** la suite tests/integration/mf-pool.test.js
**When** exécutée avec node --test
**Then** les cas suivants passent :
- Transfer nominal PJ→MJ : somme = 50 ✅
- Transfer nominal MJ→PJ : somme = 50 ✅
- Transfer qui amènerait pj_pool < 0 : 400, DB inchangée ✅
- Transfer delta=0 : accepté, DB inchangée ✅
- Reset : pj=50, mj=0 ✅
- INSERT plusieurs lignes pour même table_id : contrainte UNIQUE = erreur DB ✅
- Insertion directe SQL de pj=30, mj=25 : CHECK constraint SQLite rejette ✅

**Given** un test de robustesse
**When** le service simule un crash entre débit et crédit (mock partiel)
**Then** la transaction est rollback et les deux valeurs restent cohérentes (somme = valeur avant)

**And** les tests utilisent une DB SQLite in-memory distincte de la DB de prod
**And** le test CHECK direct insère via db.prepare().run() sans passer par l'API (test de la contrainte DB elle-même)

**Couvre :** NFR-MF1 (atomicité), NFR-MF2 (contrainte CHECK), AR7

---

**Résumé Epic 11 : 5 stories — FR11.1–FR11.9, NFR-MF1, NFR-MF2 couverts. Retrofit Dashboard MJ + Itinéraire avec protection snapshot pre-retrofit.**

---

**Résumé global PRD #2 : 5 epics (7-11), 23 stories, 43/43 FRs couverts, 7 NFRs couverts.**

**Résumé global complet (PRD #1 + PRD #2) : 11 epics, ~53 stories, 81/82 FRs couverts (FR20 retiré par décision produit).**