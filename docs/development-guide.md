# Metal Adventures — Guide de développement

## Prérequis

Aucune dépendance à installer. Le projet est du HTML/CSS/JS pur.

| Prérequis | Version minimale | Notes |
|---|---|---|
| Navigateur web | Chrome 90+ / Firefox 88+ / Edge 90+ | Pour le support ES6+, localStorage, CSS variables |
| Éditeur de texte | N'importe lequel | VS Code recommandé |
| Serveur web local | Optionnel | Requis si `peril.html` charge `perils_data.json` via `fetch()` |
| Connexion internet | Optionnelle | Requise pour Tailwind CSS CDN et Google Fonts |

---

## Lancement du projet

### Méthode 1 — Ouverture directe (plus simple)

```
Ouvrir index.html dans un navigateur
```

Fonctionne pour la majorité des pages. ⚠️ Si `peril.html` utilise `fetch()` pour charger `perils_data.json`, un serveur local est nécessaire (les navigateurs bloquent les requêtes `file://`).

### Méthode 2 — Serveur local (recommandé)

**Avec VS Code (Live Server) :**
1. Installer l'extension *Live Server*
2. Clic droit sur `index.html` → "Open with Live Server"
3. Naviguer vers `http://localhost:5500`

**Avec Python :**
```bash
# Python 3
cd "h:/MEGA/Personnel/Sites JDR/MA"
python -m http.server 8080
# Puis ouvrir http://localhost:8080
```

**Avec Node.js :**
```bash
npx serve .
# Puis ouvrir l'URL indiquée
```

---

## Structure du flux de développement

### Modifier une page

Chaque page est **autonome** — toute modification se fait directement dans le fichier `.html` :

- **CSS spécifique à la page** → dans le `<style>` en haut du fichier
- **Logique JS** → dans le `<script>` en bas du fichier
- **HTML** → dans le `<body>`

### Modifier le style partagé

Modifier `style.css` affecte **toutes les pages**. Ce fichier contient :
- Variables CSS (palette, polices)
- Styles de l'en-tête de navigation
- Boutons communs
- Inputs génériques

### Modifier les données

| Données | Fichier à modifier | Notes |
|---|---|---|
| Tables de périls | `perils_data.json` | Ou via l'interface Admin dans `peril.html` |
| Carte galactique initiale | `quadrants_MA.json` | Ou via l'interface dans `itineraire.html` puis export |
| Données du compendium | Dans `compendium.html`, balise `<script>` (JSON inline) | Pas de fichier séparé |

---

## Conventions de code

### HTML
- `lang="fr"` sur toutes les pages
- `charset="UTF-8"` obligatoire
- En-tête de navigation identique sur toutes les pages : `<header class="site-header">`
- Classe `active-nav` sur le lien correspondant à la page courante

### CSS
- Variables CSS via `--color-*`, `--font-*` dans `:root`
- Classes BEM-like : `.site-header`, `.site-nav`, `.page-content`, `.container-frame`
- Chaque page peut surcharger les variables dans son propre `:root` local
- Classes utilitaires Tailwind uniquement dans `calendrier.html` et `revolte.html`

### JavaScript
- Tout en vanilla ES6+ (`const`, `let`, arrow functions, template literals)
- Pas de modules (`import`/`export`) — scripts inline uniquement
- Fonctions nommées pour les actions principales (ex: `saveEventsToLocalStorage()`, `sauvegarder()`)
- Initialisation via `document.addEventListener('DOMContentLoaded', ...)` ou code en fin de script

### Persistance localStorage
```javascript
// Sauvegarder
localStorage.setItem('maClé', JSON.stringify(monObjet));

// Charger
const données = JSON.parse(localStorage.getItem('maClé')) || valeurParDéfaut;

// Supprimer
localStorage.removeItem('maClé');
```

---

## Clés localStorage utilisées

| Clé | Page(s) | Type |
|---|---|---|
| `galacticEvents` | `calendrier.html` | Array d'événements |
| `quadrantsMA` | `itineraire.html` | Objet quadrants |
| `charactersData` | `personnage.html` | Array de personnages |
| `[clé périls admin]` | `peril.html` | Objet tables de périls modifiées |

---

## Ajouter une nouvelle page

1. Copier la structure de base d'une page existante (ex: `revolte.html`)
2. Modifier le `<title>` et le contenu
3. Ajouter le lien dans la `<nav>` de **toutes les autres pages** (mise à jour manuelle)
4. Ajouter la classe `active-nav` sur le bon lien dans la nouvelle page

---

## Export / Import des données

### Calendrier (`galactic_events.json`)
- **Export** : bouton dans la page → télécharge `galactic_events.json`
- **Import** : bouton dans la page → sélection du fichier JSON

### Carte galactique (`quadrants_MA.json`)
- **Export** : bouton "Exporter JSON" → télécharge l'état actuel
- **Import** : bouton "Importer JSON" → écrase les données locales
- **Reset** : bouton "Réinitialiser" → vide `localStorage('quadrantsMA')`

### Personnages
- Import/export via le panneau latéral de `personnage.html`

---

## Déploiement

Le projet est 100 % statique. Toutes les options de déploiement fonctionnent :

| Méthode | Commande / Action | Notes |
|---|---|---|
| Hébergement local | Ouvrir `index.html` | ⚠️ Restrictions `file://` possibles |
| Serveur web basique | Copier tous les fichiers `.html`, `.css`, `.json` sur le serveur | Aucune configuration serveur requise |
| GitHub Pages | Push sur la branche `main` / `gh-pages` | Idéal — HTTPS gratuit |
| Netlify / Vercel | Drag & drop du dossier | Déploiement instantané |
| Docker (nginx) | `COPY . /usr/share/nginx/html` | Pour un déploiement conteneurisé |

### Fichiers à déployer (obligatoires)

```
index.html
style.css
calendrier.html
itineraire.html
peril.html
compendium.html
personnage.html
revolte.html
galactic_events.json
perils_data.json
quadrants_MA.json
```

> Le dossier `_bmad/`, `_bmad-output/`, `design-artifacts/` et `docs/` ne sont **pas** nécessaires en production.

---

## Sauvegarde des données utilisateur

⚠️ **Important** : toutes les données sont dans le `localStorage` du navigateur. Elles seront **perdues** si :
- L'utilisateur vide le cache / l'historique du navigateur
- L'utilisateur change de navigateur ou de machine

### Stratégie de sauvegarde recommandée

Exporter régulièrement les données depuis chaque outil vers des fichiers JSON, et les versionner (par exemple dans un dossier `_saves/`).

Fichiers à sauvegarder périodiquement :
- `galactic_events.json` (export depuis le calendrier)
- Carte galactique (export depuis la carte interactive)
- Données personnages (export depuis personnage)
