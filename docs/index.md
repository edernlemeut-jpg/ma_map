# Metal Adventures — Index de la documentation

> Généré le 18 avril 2026 | Scan exhaustif | Projet : MA (Metal Adventures)

---

## Vue d'ensemble du projet

- **Type** : Application web multi-pages (MPA) — Vanilla HTML/CSS/JS
- **Architecture** : Monolithe client-side, aucun serveur, aucun build
- **Langage principal** : Français
- **Persistance** : `localStorage` navigateur + export/import JSON
- **Pages** : 8 pages HTML fonctionnelles

---

## Documentation générée

| Document | Description |
|---|---|
| [Vue d'ensemble](./project-overview.md) | Résumé exécutif, stack, liste des pages et données |
| [Architecture](./architecture.md) | Architecture détaillée, modèles de données, patterns par page |
| [Arborescence](./source-tree-analysis.md) | Structure des fichiers annotée, dépendances, navigation |
| [Guide de développement](./development-guide.md) | Lancer, modifier, déployer, sauvegarder |

---

## Référence rapide

### Pages de l'application

| Page | Titre | Fonctionnalité | localStorage |
|---|---|---|---|
| [index.html](../index.html) | Accueil | Hub de navigation | — |
| [calendrier.html](../calendrier.html) | Calendrier Galactique | Calendrier 10 mois × 25j, événements | `galacticEvents` |
| [itineraire.html](../itineraire.html) | Itinéraire | Galaxie 40×40, éditeur systèmes + planificateur de route | `quadrantsMA` |
| ~~carte_interactive.html~~ | ~~Carte Interactive~~ | **Legacy** — ancêtre d'`itineraire.html`, non maintenu | — |
| [peril.html](../peril.html) | Générateur de Périls | Rencontres aléatoires spatiales | `[clé admin]` |
| [compendium.html](../compendium.html) | Compendium | Encyclopédie des règles | — (inline) |
| [personnage.html](../personnage.html) | Personnages | Base de données PJ/PNJ | `charactersData` |
| [revolte.html](../revolte.html) | Révolte | Mécaniques de rébellion | — |

### Fichiers de données

| Fichier | Contenu |
|---|---|
| [galactic_events.json](../galactic_events.json) | Export des événements du calendrier |
| [perils_data.json](../perils_data.json) | Tables de rencontres (interplanétaire/hyperspatial) |
| [quadrants_MA.json](../quadrants_MA.json) | Données initiales de la carte galactique |

### Style partagé

| Fichier | Rôle |
|---|---|
| [style.css](../style.css) | Variables CSS, en-tête, composants communs |

---

## Pour commencer

**Ouvrir l'application :**
```
Ouvrir index.html dans un navigateur
```

**Ou avec un serveur local (recommandé) :**
```bash
python -m http.server 8080
# Puis naviguer vers http://localhost:8080
```

---

## Points d'attention pour les agents IA

1. **Pas de framework** — tout est vanilla HTML/CSS/JS. Pas de React, Vue, Angular.
2. **Pas de build** — modifier un fichier `.html` modifie directement l'application.
3. **Scripts inline** — tout le JS est dans des balises `<script>` à l'intérieur des pages HTML.
4. **CSS dupliqué** — les variables CSS `:root` sont redéfinies dans plusieurs pages. `style.css` est la référence, mais n'a pas toujours la priorité.
5. **`carte_interactive.html` est legacy** — c'est l'ancêtre d'`itineraire.html`. Ne pas modifier ni référencer. La clé `quadrantsMA` appartient à `itineraire.html`.
6. **Données du compendium embarquées** — `compendium.html` contient des milliers de lignes de JSON directement dans le HTML.
7. **Pas de tests automatisés** — validation uniquement manuelle dans le navigateur.
8. **Sauvegarde critique** — rappeler régulièrement à l'utilisateur d'exporter ses données JSON.
