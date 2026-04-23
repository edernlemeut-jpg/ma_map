---
id: 3-2-fiche-systeme-au-clic
epic: epic-3
status: done
title: Fiche système au clic — détails complets & édition MJ
created: 2026-04-20
owner: Crepe

## CONTEXTE

Enrichissement de la fiche système : lorsqu'un utilisateur clique sur un système dans la carte interactive, afficher un panneau détaillé avec tous les champs du système, éditable par le MJ. Préparer les hooks pour révélation progressive (Epic 3-3).

- La modal de base existe (Story 3.1)
- Afficher tous les champs système (voir DB schema)
- Édition MJ : ajouter/modifier les détails
- Persistance API via PATCH /api/compendium/systems/:id
- Non-MJ : affichage seul, pas d'édition
- Responsive, cohérent avec reste du design

## ACCEPTANCE CRITERIA

- AC1: Fiche système affiche tous les champs (nom, faction, gouvernement, route, description, quadrant, is_frontiere, soleil, corpsCelestes, patrouilles)
- AC2: MJ peut éditer les champs cliquables (@- handle, clic → input ou textarea)
- AC3: Bouton Sauvegarder déclenche PATCH API, retour succès/erreur
- AC4: Non-MJ voit fiche en lecture seule (pas de boutons d'édition)
- AC5: Champs non-éditables: id, quadrant, created_at (col n'existe pas)
- AC6: Validation: nom non vide, faction doit exister en DB
- AC7: Afficher indicateur "MJ" pour modifier, "Lecture seule" pour joueurs
- AC8: Tests : édition MJ, save API, non-MJ read-only, validation (4+ tests)

## TECHNIQUE

- Étendre le composant modal de 3.1
- Formulaire éditable inline (pas de pop-up d'édition secondaire)
- API: PATCH /api/compendium/systems/:id (déjà existante, Story 2.5)
- Auth: check `req.user.is_admin` ou lien table MJ
- Erreurs API affichées dans la fiche
- Touch targets ≥ 44px

## NOTES

- La DB est déjà à jour (système a tous les champs)
- Les routes commerce ne sont pas éditables (futurs, algos)
- Prévoir événement "systemUpdated" pour rafraîchir la carte si besoin

---

# Tâches

- T1: Enrichir le service map pour charger détails système
- T2: Basculer modal en mode édition (UI inline)
- T3: Service d'édition système (validation + save API)
- T4: Gestion auth (MJ vs joueur, read-only UI)
- T5: Gestion erreurs (API, validation)
- T6: Tests (édition MJ, read-only, validation)
- T7: MAJ package.json
