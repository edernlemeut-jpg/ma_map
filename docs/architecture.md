# Metal Adventures — Architecture Technique

## Résumé

Metal Adventures est une **application web multi-pages (MPA) 100 % client-side**, construite avec du HTML, CSS et JavaScript vanilla. Il n'y a ni serveur, ni framework JavaScript, ni système de build. Chaque page est un document HTML autonome qui embarque son CSS spécifique et son JavaScript directement dans des balises `<style>` et `<script>`.

---

## Patron architectural global

```
┌─────────────────────────────────────────────┐
│           Application Metal Adventures      │
│                                             │
│  ┌───────────┐  Partage  ┌──────────────┐   │
│  │ style.css │◄──────────│ Toutes pages │   │
│  └───────────┘           └──────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │         Pages HTML autonomes         │   │
│  │  (CSS inline + JS inline par page)   │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │          Couche de données           │   │
│  │  localStorage  ←→  Fichiers JSON     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Pattern principal par page :** chaque page suit le pattern MVC simplifié :
- **Modèle** : objet/tableau JS chargé depuis `localStorage` ou fichier JSON embarqué
- **Vue** : DOM HTML rendu dynamiquement via `innerHTML` et `createElement`
- **Contrôleur** : gestionnaires d'événements (`addEventListener`, `onclick`)

---

## Système de design

Un système de tokens CSS est défini dans `style.css` (variables CSS globales) :

```css
:root {
  --color-background: #1a1a1a;    /* Fond sombre */
  --color-frame: #3a3a3a;         /* Panneaux */
  --color-frame-border: #888;     /* Bordures */
  --color-text-light: #f0f0f0;    /* Texte clair */
  --color-accent-gold: #c8a464;   /* Accent principal (or) */
  --color-accent-red: #b94b4b;    /* Accent secondaire (rouge) */
  --color-accent-blue: #6495c8;   /* Accent tertiaire (bleu) */
  --color-parchment: #f5e8c8;     /* Fond parchemin */
  --font-main: 'Georgia', serif;  /* Police narrative */
  --font-ui: 'Helvetica', sans-serif; /* Police interface */
}
```

> ⚠️ Plusieurs pages redéfinissent localement leurs propres variables `:root`, ce qui crée des incohérences partielles avec le fichier `style.css` partagé.

---

## Architecture par page

### `index.html` — Hub de navigation
- **Rôle** : Page d'accueil avec liens vers toutes les sections
- **Complexité** : Minimale — HTML statique + CSS inline
- **Données** : Aucune
- **Pattern** : Landing page pure

---

### `calendrier.html` — Calendrier Galactique
- **Rôle** : Gestion du calendrier de la campagne
- **Système temporel custom** :
  - 10 mois galactiques × 5 semaines × 5 jours = **250 jours/an**
  - Année de référence : 50 429
  - Correspondance : 1 jour galactique ≈ 1.46 jour terrestre
- **Fonctionnalités** :
  - Grille de calendrier mensuelle et vue annuelle
  - Ajout/édition/suppression d'événements avec couleur personnalisée
  - Sélection d'une date "active" (suivie d'une session)
  - Navigation entre mois/années
  - Export/import JSON des événements
  - Panneau de paramètres latéral coulissant
- **Persistance** :
  - `localStorage('galacticEvents')` — objet JSON des événements
  - Export → `galactic_events.json`
- **Dépendances CDN** : Tailwind CSS

---

### `carte_interactive.html` — Carte Interactive ⚠️ LEGACY
- **Statut** : **Fichier archivé** — ancêtre historique d'`itineraire.html`. Ne pas modifier, ne pas maintenir.
- **Context** : A servi de base de développement pour construire `itineraire.html`. Conservé à titre de référence.

---

### `itineraire.html` — Planificateur d'itinéraire
- **Rôle** : Éditeur de la carte galactique + calcul de routes et de périls de voyage
- **Grille** : 40 colonnes × 40 lignes = 1 600 quadrants
- **Nomenclature** : lettres grecques pour les colonnes (Α à Π′), nombres pour les lignes
- **Hierarchie de données par quadrant** :
  ```
  Quadrant
  └── Système stellaire (nom, faction)
      └── Corps célestes (étoile, planète, lune, patrouille…)
          ├── nom, classe, description
          └── Satellites (lunes)
  ```
- **Fonctionnalités** :
  - Clic sur quadrant → panneau de détail coulissant (depuis le bas)
  - Ajout/édition de systèmes stellaires et corps célestes
  - Filtrage par mot-clé (met en surbrillance les quadrants trouvés)
  - Sélection de points de départ, d'étapes et d'arrivée
  - Calcul du nombre de jours de voyage par segment
  - Table de périls par segment (lien vers `peril.html` pour résolution)
  - Panneau droit coulissant avec l'itinéraire complet
  - Import/export JSON de toute la carte
  - Réinitialisation complète
- **Persistance** : `localStorage('quadrantsMA')` — propriétaire de cette clé

---

### `peril.html` — Générateur de périls
- **Rôle** : Outil de tirage aléatoire de rencontres spatiales
- **Types de voyages** :
  - **Interplanétaire** — déplacements dans un système stellaire
  - **Hyperspatial** — déplacements entre systèmes
- **Données** : chargées depuis `perils_data.json` (tables de rencontres hiérarchiques par seuils de dés)
- **Structure des données de périls** :
  ```json
  {
    "interplanetaire": {
      "categories": [
        {
          "seuilMin": 2, "seuilMax": 4, "nom": "Rencontre heureuse",
          "perils": [
            {
              "seuilMin": 2, "seuilMax": 5, "nom": "Épave",
              "data": { "description", "protocole", "resultat", "senseurs", "sciencesStellaires" }
            }
          ]
        }
      ]
    },
    "hyperspatial": { ... }
  }
  ```
- **Fonctionnalités** :
  - Sélection du type de voyage
  - Tirage aléatoire avec affichage de la fiche de péril complète
  - Mode Admin : édition des tables de périls
  - Planificateurs intégrés (interplanétaire, hyperspatial) avec calcul de périls par segment

---

### `compendium.html` — Compendium
- **Rôle** : Encyclopédie des règles du jeu
- **Données** : entièrement embarquées dans le HTML (JSON inline dans `<script>`)
- **Types d'entités** : Compétences (avec domaines : Techniques, Survie, Sciences, Négociation, Espionnage, Trempe), et probablement d'autres types (faune, équipements, véhicules…)
- **Structure d'une compétence** :
  ```json
  {
    "id": "competence-armes-de-poing",
    "type": "Compétence",
    "name": "Armes de poing",
    "domain": "Techniques",
    "description": "...",
    "is_closed": false,
    "is_violent": true
  }
  ```
- **Fonctionnalités** :
  - Navigation 3 panneaux : liste des types → liste filtrée → détail
  - Recherche/filtrage global
  - Affichage de détail avec références croisées
  - Ajout/édition/suppression d'entités (mode admin)
- **Persistance** : données en mémoire (session seulement) — pas de localStorage

---

### `personnage.html` — Base de données des personnages
- **Rôle** : Gestion des fiches personnages (PJ et PNJ)
- **Fonctionnalités** :
  - Tableau avec tri des colonnes
  - Portrait (upload d'image)
  - Vue détaillée en modal (onglets)
  - Import/export CSV ou JSON
  - Panneau latéral gauche coulissant
- **Persistance** : `localStorage('charactersData')` — tableau JSON de personnages
- **Structure d'un personnage** : données typiques de fiche JDR (nom, compétences, attributs, bio…)

---

### `revolte.html` — Gestion de révolte
- **Rôle** : Outil pour les mécaniques de rébellion galactique
- **Fonctionnalités** :
  - Formulaires de saisie pour les paramètres d'une révolte (ressources, soutien, objectifs)
  - Calcul des modificateurs selon les règles
  - Info-boxes contextuelles (bonus/malus)
- **Dépendances CDN** : Tailwind CSS, Google Fonts (Cinzel, Inter)
- **Persistance** : aucune notable

---

## Patron de persistance détaillé

| Page | Clé localStorage | Contenu | Partagé avec |
|---|---|---|---|
| `calendrier.html` | `galacticEvents` | Tableau d'événements JSON | — |
| `itineraire.html` | `quadrantsMA` | Objet quadrant → systèmes | — |
| `carte_interactive.html` | — | **Fichier legacy** — ne plus utiliser | — |
| `peril.html` | `[clé peril admin]` | Données tables modifiées | — |
| `personnage.html` | `charactersData` | Tableau de personnages | — |

---

## Modèle de données — Quadrant galactique

```typescript
interface Quadrant {
  [coordonnee: string]: SystemeStellaireOuVide[]
}

interface SystemeStellaireOuVide {
  nom: string
  faction: string
  corpsCelestes: CorpsCeleste[]
}

interface CorpsCeleste {
  nom: string
  classe: string        // "M", "Satellite", etc.
  description: string
  lunes: CorpsCeleste[]
  // Champs étendus selon le type (planète, étoile, patrouille…)
}
```

---

## Cohérence du design système

### Points forts
- Palette de couleurs cohérente (fond sombre, or, rouge) sur toutes les pages
- En-tête de navigation partagé
- Pattern de panneau latéral coulissant réutilisé (carte, calendrier, personnage, compendium)
- Pattern modal partagé (calendrier, personnage, péril, compendium)

### Points de vigilance
- Plusieurs pages définissent leurs propres variables `:root` en doublon de `style.css`
- Tailwind CSS n'est chargé que sur 2 pages (calendrier, révolte), créant une légère incohérence de classes utilitaires
- Les scripts JS sont tous inline — aucune séparation code/template
- Pas de gestion d'erreur centralisée pour localStorage (silencieux en cas de quota dépassé)
