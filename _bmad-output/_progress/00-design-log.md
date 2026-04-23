---
project: Metal Adventures
last_updated: 2026-04-18
---

# Design Log — Metal Adventures

## En cours

**Cycle 1 — itineraire.html (mobile-first)**  
Statut : Spécification approuvée → prêt pour [I] Implémentation  
Scénario : `evolution/scenarios/scenario-itineraire-mobile.md`  
Spec : `evolution/specs/spec-itineraire-mobile.md`  

---

## Backlog

| Priorité | Outil | Notes |
|---|---|---|
| 2 | `calendrier.html` | Consultable + modifiable en jeu (mobile) |
| 3 | `compendium.html` | Lecture seule en jeu (mobile) |
| 4 | `peril.html` | Configuration des tables (hors jeu, mobile souhaité) |
| — | `personnage.html` | Ignoré pour cette phase |

---

## Décisions de conception

- **Approche** : mobile-first, remplacement (pas de fichiers parallèles)
- **Stack CSS** : Tailwind CDN sur toutes les pages refondues
- **`itineraire.html` = page pilote** : ses conventions UX/techniques s'appliqueront aux autres refontes
- **`carte_interactive.html`** : legacy, ne pas modifier
- **Bug périls** : modificateur succès excédentaires corrigé dans le cycle 1

---

## Complété

_(vide — premier cycle)_
