# Metal Adventures — Vue d'ensemble du projet

## Résumé exécutif

**Metal Adventures (MA)** est une suite d'outils de gestion pour la table de jeu de rôle *Metal Adventures*, un RPG de science-fiction galactique. L'application entière est une **application web multi-pages (MPA) 100 % côté client**, sans serveur, sans framework JavaScript, ni outil de build. Elle s'ouvre directement dans un navigateur en ouvrant `index.html`.

| Propriété | Valeur |
|---|---|
| Nom du projet | Metal Adventures (MA) |
| Type | Application web MPA — Vanilla HTML/CSS/JS |
| Architecture | Monolithe client-side |
| Langue principale | Français |
| Persistance | `localStorage` du navigateur + export/import JSON |
| Déploiement | Fichiers statiques — serveur web ou ouverture directe |

---

## Objectif

Fournir au maître de jeu (MJ) un ensemble d'outils numériques interactifs pour gérer une campagne *Metal Adventures* :

- Suivre le **calendrier galactique** personnalisé (10 mois × 25 jours)
- Explorer et éditer la **carte de la galaxie** (grille 40×40 de quadrants)
- Planifier des **itinéraires** de voyage spatial avec calcul des périls
- Générer des **périls de voyage** (rencontres aléatoires interplanétaires ou hyperspatiales)
- Consulter le **compendium** des règles (compétences, équipements, etc.)
- Gérer la **base de données des personnages** (PJ et PNJ)
- Gérer les mécaniques de **révolte** galactique

---

## Stack technologique

| Catégorie | Technologie | Version | Notes |
|---|---|---|---|
| Balisage | HTML5 | 5 | Pages sources |
| Style | CSS3 | 3 | `style.css` + styles inline par page |
| Logique | JavaScript | ES6+ | Scripts inline `<script>` dans chaque page |
| Framework CSS | Tailwind CSS | CDN (latest) | `calendrier.html`, `revolte.html` |
| Polices | Google Fonts (Cinzel, Inter) | CDN | `revolte.html` |
| Persistance | Web API `localStorage` | — | Toutes les pages avec données |
| Format de données | JSON | — | `galactic_events.json`, `perils_data.json`, `quadrants_MA.json` |

---

## Pages et modules

| Page | Titre | Fonctionnalité principale | Persistance |
|---|---|---|---|
| `index.html` | Accueil | Hub de navigation | Aucune |
| `calendrier.html` | Calendrier Galactique | Calendrier 10 mois×25j, gestion d'événements | `localStorage('galacticEvents')` + export JSON |
| `itineraire.html` | Itinéraire | Carte galaxie 40×40, éditeur de systèmes + planificateur de route | `localStorage('quadrantsMA')` + import/export JSON |
| ~~`carte_interactive.html`~~ | ~~Carte Interactive~~ | **Legacy** — ancêtre d'`itineraire.html`, conservé à titre historique | — |
| `peril.html` | Générateur de Périls | Tirage aléatoire de rencontres (interplanétaire/hyperspatial) | `localStorage` (données admin) |
| `compendium.html` | Compendium | Base de règles (compétences, faune, équipements…) | Données embarquées dans le HTML |
| `personnage.html` | Personnages | Base de données des personnages avec portraits | `localStorage('charactersData')` |
| `revolte.html` | Révolte | Gestion des mécaniques de rébellion galactique | Sans persistance notable |

---

## Fichiers de données JSON

| Fichier | Rôle | Utilisé par |
|---|---|---|
| `galactic_events.json` | Stockage d'export des événements du calendrier | `calendrier.html` (import/export) |
| `perils_data.json` | Tables de rencontres (interplanétaires et hyperspatiales) | `peril.html` (chargé via fetch ou inline) |
| `quadrants_MA.json` | Données initiales de la carte galactique (systèmes, planètes, lunes) | `itineraire.html` (seed + import) |

---

## Architecture de persistance

```
┌──────────────────────────────────────────────────────┐
│                  Navigateur (Client)                 │
│                                                      │
│  ┌─────────────────┐     ┌───────────────────────┐   │
│  │   localStorage   │     │   Fichiers JSON        │   │
│  │                 │     │   (import / export)     │   │
│  │  galacticEvents │◄────►│  galactic_events.json  │   │
│  │  quadrantsMA    │◄────►│  quadrants_MA.json     │   │
│  │  charactersData │     │                         │   │
│  │  [key peril]    │     │  perils_data.json       │   │
│  └─────────────────┘     └───────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Les données ne quittent jamais le navigateur sauf lors d'un export explicite. Il n'y a ni API, ni base de données distante.

---

## Liens de navigation

Toutes les pages partagent un en-tête de navigation commun (`<header class="site-header">`) pointant vers :
`Calendrier` · `Carte Interactive` · `Générateur de Périls` · `Compendium` · `Personnage` · `Révolte`  
_(Note : le menu n'est pas identique sur toutes les pages — certaines pages omettent des liens)_
