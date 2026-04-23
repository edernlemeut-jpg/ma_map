---
id: 3-1-carte-interactive-css-grid-option-b
epic: epic-3
status: done
title: Carte interactive CSS grid - itineraire connecte au backend (Option B)
created: 2026-04-20
updated: 2026-04-21
owner: Crepe
baseline_commit: 794d01d
context:
  - story-3.1-carte-interactive-integration.md
---

## CONTEXTE

Option B retenue. La page public/itineraire.html est reecrite en partant de donnee_base/itineraire_backup_20260419.html — CSS grid 40x40 + image carte_MA.png en fond, calcul d'itineraire complet, perils, historique.

La source de donnees passe de JSON inline + localStorage vers API Express (/api/systems, /api/ships, /api/ship-models, /api/sync, /api/travel-routes, /perils_data.json).

Catalogue vaisseaux (CRUD) extrait en Story 5.1. Selecteur vaisseau actif reste sur la carte.

BUG CRITIQUE : parseQuadrantCoords dans map-service.js utilise regex [A-Z]+ ignorant les lettres grecques. Fix obligatoire.

## ACCEPTANCE CRITERIA

- AC1: La carte CSS grid s'affiche avec l'image carte_MA.png en fond
- AC2: Les systemes de la table apparaissent sur les bons quadrants (lettres grecques)
- AC3: Pan/zoom + bottom-sheet mobile fonctionnels
- AC4: Calcul d'itineraire entre deux points -> resultat avec perils
- AC5: Vaisseau actif selectionnable, ses stats (depuis modele) influencent le calcul
- AC6: Historique des voyages lisible depuis GET /api/travel-routes
- AC7: Utilisateur non connecte -> redirect /login.html
- AC8: Hub (index.html) et Dashboard MJ pointent vers /itineraire.html

---

# Tasks & Acceptance

- [ ] T0: Copier perils_data.json -> public/perils_data.json
- [ ] T1: Creer endpoint PATCH /api/ships/active dans src/routes/ships.js
- [ ] T2: Corriger parseQuadrantCoords dans public/js/map/map-service.js (LETTRES_MA.indexOf)
- [ ] T3: Reecrire public/itineraire.html (CSS grid depuis backup, sans JSON inline ni api.js legacy)
- [ ] T4: Creer public/js/itineraire.js (module ES - auth guard, load data, wiring API)
- [ ] T5: MAJ public/index.html (Itineraire en premier acces rapide)
- [ ] T6: MAJ public/dashboard.html (lien Carte -> /itineraire.html)