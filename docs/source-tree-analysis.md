# Metal Adventures — Analyse de l'arborescence

## Racine du projet

```
MA/
│
├── index.html                  # 🏠 Point d'entrée — Hub de navigation
├── style.css                   # 🎨 Feuille de style partagée — design tokens, layout global
│
├── calendrier.html             # 📅 Calendrier galactique (10 mois × 25 jours)
├── carte_interactive.html      # ⚠️  LEGACY — ancêtre d'itineraire.html, ne pas modifier
├── itineraire.html             # 🗺️  Carte galactique interactive (40×40) + planificateur d'itinéraire
├── peril.html                  # ⚠️  Générateur de rencontres spatiales
├── compendium.html             # 📖 Encyclopédie des règles du jeu
├── personnage.html             # 👤 Base de données personnages (PJ/PNJ)
├── revolte.html                # 🔥 Gestionnaire de mécaniques de révolte
│
├── galactic_events.json        # 💾 Export des événements calendrier
├── perils_data.json            # 🎲 Tables de rencontres (interplanétaire/hyperspatial)
├── quadrants_MA.json           # 🌌 Données initiales de la carte (systèmes stellaires)
│
├── Classeur1.xlsm              # 📊 Classeur Excel (données supplémentaires — non intégré au web)
├── Classeur1.xlsx              # 📊 Classeur Excel (version sans macros)
│
├── docs/                       # 📚 Documentation générée (dossier project_knowledge)
│   ├── index.md                # Index maître de la documentation
│   ├── project-overview.md     # Vue d'ensemble du projet
│   ├── architecture.md         # Architecture technique détaillée
│   ├── source-tree-analysis.md # Ce fichier
│   ├── development-guide.md    # Guide de développement
│   └── project-scan-report.json # État du workflow de documentation
│
├── design-artifacts/           # 🎨 Artefacts WDS (vides pour l'instant)
│   ├── A-Product-Brief/
│   ├── B-Trigger-Map/
│   ├── C-UX-Scenarios/
│   ├── D-Design-System/
│   └── E-Development/
│
├── _bmad/                      # ⚙️  Configuration BMad (outils IA)
│   ├── _config/                # Manifestes et configuration globale
│   ├── bmb/                    # Module BMad Builder
│   ├── bmm/                    # Module BMad Method
│   ├── cis/                    # Module Creative Intelligence Suite
│   ├── core/                   # Module Core
│   ├── gds/                    # Module Game Dev Studio
│   ├── tea/                    # Module Test Architecture Enterprise
│   └── wds/                    # Module Web Design Studio
│
└── _bmad-output/               # 📤 Sorties BMad (vides pour l'instant)
    ├── planning-artifacts/
    ├── implementation-artifacts/
    └── test-artifacts/
```

---

## Fichiers critiques

### Point d'entrée

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil. Tous les utilisateurs arrivent ici. Liens vers les 6 outils principaux. |

### Feuille de style partagée

| Fichier | Rôle |
|---|---|
| `style.css` | Variables CSS globales (palette, polices), styles de l'en-tête, du footer, des boutons communs, des inputs. **Inclus dans toutes les pages.** |

### Pages applicatives

| Fichier | Clé de données localStorage | Longueur approx. |
|---|---|---|
| `calendrier.html` | `galacticEvents` | ~1 350 lignes |
| `carte_interactive.html` | — (legacy) | ~750 lignes |
| `itineraire.html` | `quadrantsMA` | ~800 lignes |
| `peril.html` | `[clé admin périls]` | ~500 lignes |
| `compendium.html` | — (données inline) | ~600 lignes CSS + ~3 000+ lignes JS/data |
| `personnage.html` | `charactersData` | ~1 600 lignes |
| `revolte.html` | — | ~400 lignes |

### Fichiers de données

| Fichier | Format | Taille approximative | Rôle |
|---|---|---|---|
| `galactic_events.json` | JSON array | Petit (données de campagne) | Export/import du calendrier |
| `perils_data.json` | JSON objet hiérarchique | Moyen (~200 périls) | Tables de rencontres pour peril.html |
| `quadrants_MA.json` | JSON objet (clé = coordonnée) | Grand (1 600 quadrants potentiels) | Données initiales / seed pour la carte |

---

## Dépendances CDN (externe)

| Ressource | URL | Utilisée dans |
|---|---|---|
| Tailwind CSS | `https://cdn.tailwindcss.com` | `calendrier.html`, `revolte.html` |
| Google Fonts — Cinzel | `https://fonts.googleapis.com` | `revolte.html` |
| Google Fonts — Inter | `https://fonts.googleapis.com` | `revolte.html` |

> ⚠️ L'application nécessite une connexion internet **uniquement** pour charger Tailwind CSS et les polices Google. En mode hors-ligne, `calendrier.html` et `revolte.html` perdront leur mise en forme Tailwind.

---

## Schéma de navigation entre pages

```
index.html
    │
    ├──► calendrier.html
    ├──► itineraire.html
    │         (quadrantsMA localStorage — propriétaire)
    │         [carte_interactive.html = legacy, non lié]
    ├──► peril.html ◄──── itineraire.html (liens directs vers périls)
    ├──► compendium.html
    ├──► personnage.html
    └──► revolte.html
```

---

## Structure interne type d'une page (pattern commun)

Chaque page HTML suit cette structure :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" ...>
    <title>...</title>
    <link rel="stylesheet" href="style.css">   <!-- Style partagé -->
    <style>
        /* Styles spécifiques à la page */
        :root { /* Variables locales (parfois en doublon) */ }
        /* Composants spécifiques */
    </style>
</head>
<body>
    <header class="site-header">
        <h1>Metal Adventures</h1>
        <nav class="site-nav">...</nav>
    </header>

    <!-- Layout principal de la page -->
    <div class="page-content">
        <!-- Panneaux, grilles, modals... -->
    </div>

    <script>
        // Données initiales
        // Fonctions utilitaires
        // Gestionnaires d'événements
        // Initialisation (DOMContentLoaded ou inline)
    </script>
</body>
</html>
```
