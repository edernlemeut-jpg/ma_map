---
project_name: 'Metal Adventures'
user_name: 'Crepe'
date: '2026-04-18'
sections_completed: ['technology_stack', 'implementation_rules', 'code_quality', 'workflow', 'anti_patterns']
---

# Project Context for AI Agents

_Ce fichier contient les règles critiques que les agents IA doivent suivre lors de tout travail sur ce projet. Il se concentre sur les détails non-évidents qu'un agent pourrait manquer._

---

## Stack technologique

- **HTML5** / **CSS3** / **JavaScript ES6+** — uniquement vanilla, aucun framework
- **Tailwind CSS** — CDN uniquement, dans `calendrier.html` et `revolte.html`
- **Google Fonts (Cinzel + Inter)** — CDN, dans `revolte.html` uniquement
- **Aucun** build tool, bundler, transpileur, ni gestionnaire de paquets
- **Aucun** fichier `.js` séparé — tout le JavaScript est inline dans les fichiers `.html`

---

## Règles d'implémentation critiques

### Architecture des fichiers

- Le projet est une **MPA (Multi-Page Application)** — chaque page `.html` est autonome
- Ne jamais créer de fichiers `.js` séparés — tout le JS va dans `<script>` à la fin du `<body>` de la page concernée
- Le CSS spécifique à une page va dans `<style>` en haut du fichier HTML (avant le `<body>`)
- Le CSS partagé va dans `style.css` — modifier ce fichier affecte toutes les pages

### Persistance des données

| Clé localStorage | Page propriétaire | Type de données |
|---|---|---|
| `galacticEvents` | `calendrier.html` | Array d'événements |
| `quadrantsMA` | `itineraire.html` | Objet quadrants (carte galaxie) |
| `charactersData` | `personnage.html` | Array de personnages |

- Ne jamais utiliser la même clé localStorage dans deux pages différentes (sauf si intentionnellement partagé)
- `carte_interactive.html` est un **fichier archivé** (historique de développement, ancêtre d'`itineraire.html`) — ne pas modifier, ne pas maintenir, ne pas référencer comme fonctionnalité active

### Données du compendium

- `compendium.html` contient ses données JSON **entièrement inline** dans le HTML — pas de fichier externe
- Pour modifier les données du compendium, éditer directement le bloc JSON dans le `<script>` de cette page

### Navigation entre pages

- L'en-tête de navigation `<header class="site-header">` est **copié manuellement** dans chaque page — pas de composant partagé
- Ajouter `class="active-nav"` sur le lien correspondant à la page courante dans chaque navigation

### Variables CSS

- Les variables CSS globales sont définies dans `style.css` sous `:root`
- Certaines pages redéfinissent `:root` localement — la définition locale a priorité
- Toujours vérifier si une page a son propre `:root` avant d'assumer que `style.css` s'applique

---

## Conventions de nommage

- **Fichiers** : `snake_case` (ex: `carte_interactive.html`, `perils_data.json`)
- **Fonctions JS** : mixte français/camelCase (ex: `sauvegarder()`, `loadEventsFromLocalStorage()`)
- **Clés localStorage** : camelCase anglais (ex: `galacticEvents`, `quadrantsMA`)
- **Classes CSS** : kebab-case (ex: `.site-header`, `.active-nav`, `.container-frame`)
- **Variables CSS** : `--color-*`, `--font-*` (ex: `--color-accent-gold`, `--font-main`)

---

## Qualité et style de code

- Pas de linter configuré — appliquer le style existant de la page modifiée
- Pas de formatter automatique — respecter l'indentation du fichier cible (2 ou 4 espaces selon la page)
- Commentaires en français dans les sections logiques principales
- Pas de `console.log` en production
- Utiliser `JSON.parse(localStorage.getItem('clé')) || valeurParDéfaut` pour les lectures sécurisées

---

## Anti-patterns — Ne JAMAIS faire

- ❌ Introduire un framework JS (React, Vue, Angular…)
- ❌ Créer un `package.json` ou installer npm/node
- ❌ Créer des fichiers `.js` séparés (tout reste inline)
- ❌ Installer Tailwind localement — CDN uniquement
- ❌ Modifier `carte_interactive.html` — fichier archivé, valeur historique uniquement (ancêtre d'`itineraire.html`)
- ❌ Utiliser `import` / `export` (modules ES6) — les balises `<script>` n'ont pas `type="module"`
- ❌ Ajouter un build step, un transpileur ou un bundler
- ❌ Utiliser `fetch()` sans serveur local — les requêtes `file://` sont bloquées par les navigateurs
- ❌ Modifier les données du compendium dans un fichier externe — elles sont inline dans le HTML

---

## Workflow de développement

- **Édition** : modifier directement les fichiers `.html` — aucun build nécessaire
- **Test** : ouvrir dans un navigateur (ou via Live Server VS Code pour éviter les restrictions `file://`)
- **Déploiement** : copier les fichiers `.html`, `.css`, `.json` sur un hébergement statique
- **Pas de tests automatisés** — validation manuelle uniquement
- **Sauvegarde données** : exporter régulièrement les JSON depuis chaque outil (calendrier, carte, personnages)

---

## Dépendances CDN (hors-ligne)

Si l'application est utilisée sans connexion internet :
- `calendrier.html` et `revolte.html` seront sans style (Tailwind CDN indisponible)
- `revolte.html` utilisera une police de secours (Google Fonts indisponible)
- Les pages sans CDN (`index.html`, `itineraire.html`, `peril.html`, `compendium.html`, `personnage.html`) fonctionneront normalement
