# Story 6.2 : Cold start NAS & Loading UX

## Metadata
- story_id: 6.2
- epic: 6 — Résilience, Polish & Décommissionnement
- status: done
- created: 2026-04-23
- author: dev-agent (implémenté en avance sur le planning)

## Goal

Fournir un état de chargement lisible quand le serveur NAS est en cold start (première requête > 5s), et s'assurer que les assets statiques sont mis en cache côté client pour accélérer les chargements suivants.

## Acceptance Criteria

- [x] AC1: Si la première requête fetch prend > 1s, un overlay s'affiche avec "Le serveur se réveille… Quelques secondes, merci de patienter." et une barre de progression indéterminée
- [x] AC2: L'overlay disparaît automatiquement dès que la première réponse API arrive (transition fade-out)
- [x] AC3: Express sert `/css` et `/js` avec `Cache-Control: public, max-age=604800` en production, pas de cache en développement
- [x] AC4: Les assets HTML référencent les scripts et CSS avec query string `?v=` pour l'invalidation de cache
- [x] AC5: Le module `cold-start.js` est chargé sur toutes les pages HTML de l'application

## Tasks

- [x] T1: Créer `public/js/shared/cold-start.js` — intercept premier fetch, overlay conditionnel
- [x] T2: Configurer `Cache-Control` dans `src/middleware/index.js` — `maxAge` conditionnel prod/dev
- [x] T3: Ajouter `<script src="/js/shared/cold-start.js?v=...">` sur toutes les pages HTML

## Dev Agent Record

### File List
- `public/js/shared/cold-start.js` — created
- `src/middleware/index.js` — modified (Cache-Control statique)
- `public/index.html` — modified
- `public/login.html` — modified
- `public/univers.html` — modified
- `public/carte_interactive.html` — modified
- `public/itineraire.html` — modified
- `public/dashboard.html` — modified
- `public/profile.html` — modified
- `public/admin.html` — modified
- `public/admin/import.html` — modified
- `public/vaisseaux.html` — modified
- `public/regles.html` — modified

### Change Log
- Création de `public/js/shared/cold-start.js` :
  - Intercepte `window.fetch` pour le premier appel uniquement
  - Si la réponse tarde > 1000ms, injecte un `<div id="loading-overlay">` avec message thématique et barre de progression CSS indéterminée
  - L'overlay disparaît avec transition fade-out dès reception de la réponse
  - Auto-initialise à l'import (pas de fonction init() à appeler)
  - Accessible : `role="status"`, `aria-live="polite"`, `aria-label` sur l'overlay
- Modification de `src/middleware/index.js` :
  - `express.static('public/css', { maxAge: ASSET_MAX_AGE })` sur `/css`
  - `express.static('public/js', { maxAge: ASSET_MAX_AGE })` sur `/js`
  - `ASSET_MAX_AGE = NODE_ENV === 'production' ? 7 * 24 * 60 * 60 * 1000 : 0` (604800s en prod)
- Ajout de `<script type="module" src="/js/shared/cold-start.js?v=...">` sur toutes les pages HTML

### Completion Notes
- Story 6.2 implémentée en avance sur le planning, découverte lors de la préparation de la story.
- Tous les AC couverts : overlay, Cache-Control 7 jours prod, query strings `?v=` sur assets.
- Couvre NFR14 (cold start NAS toléré > 5s), NFR17 (Cache-Control + invalidation `?v=`).
