# Scénario — Itinéraire mobile-first

**Date :** 2026-04-18  
**Cycle :** 1 — Page pilote (définit les conventions de refonte)

---

## Cible

Refonte complète d'`itineraire.html` en approche **mobile-first**, remplaçant l'existant.  
Cette page devient le **pilote** : les patterns UX et techniques définis ici serviront de référence pour la refonte de `calendrier.html`, `compendium.html`, etc.

---

## Contexte d'utilisation

- **Utilisateur unique** : le MJ (Maître de Jeu)
- **Usage principal** : en cours de partie, téléphone en main, une main libre possible
- **Usage secondaire** : préparation de session (desktop)
- **Conditions** : lumière variable, temps limité, besoin de résultats immédiats

---

## État actuel

- Carte 40×40 quadrants sans zoom/pan tactile → inutilisable au doigt
- Panneau de paramètres latéral (slide depuis la gauche) → hors écran mobile
- Résultat voyage : tableau multi-colonnes → illisible en portrait
- Panneau itinéraire (slide depuis la droite) → hors écran mobile
- Modificateur succès excédentaires saisi mais **non appliqué au calcul** (bug)
- Données chargées depuis `quadrants_MA.json` et `perils_data.json` via injection inline dans le HTML

---

## État désiré

Expérience fluide mobile-first :
1. MJ ouvre la page → carte visible immédiatement, zoomable
2. Tap sur un quadrant → bottom sheet avec systèmes présents
3. Sélection départ / étapes / arrivée en quelques taps
4. Saisie des paramètres de voyage (vitesse, succès exc.) dans un panneau accessible
5. Résultat affiché en cards verticales claires : jours + périls par jour
6. Tap sur un péril → fiche détail

---

## Parcours utilisateur cible (mobile)

```
Ouverture page
    → Carte galactique (55vh, zoomable au pinch)
    → Tap quadrant → Bottom sheet : liste des systèmes (ou "Quadrant vide")
    
Sélection itinéraire
    → Sur chaque système : bouton [Départ] [Étape] [Arrivée]
    → Indicateurs visuels sur la carte (couleurs selon rôle)
    
Paramètres de voyage
    → Bouton flottant [⚙ Paramètres] → panneau modal
    → Vitesse interplanétaire, vitesse hyperspatiale, autonomie, succès exc. navigation, succès exc. saut
    
Calcul
    → Bouton [Calculer] → affichage résultat
    
Résultat
    → Total voyage : X jours / Y périls
    → Cards par segment (départ → arrivée) :
        · Nombre de jours
        · Type (interplanétaire / hyperspatial)
        · Tableau jours avec péril du jour (cliquable)
    → Tap péril → Fiche péril plein écran
```

---

## Critères de succès

- [ ] Sélectionner départ + arrivée en moins de 30 secondes
- [ ] Résultat voyage lisible sans scroll ni zoom sur écran 6" portrait
- [ ] Le modificateur succès excédentaires est correctement soustrait du 2ème jet
- [ ] Fonctionne hors connexion (pas de CDN critique)
- [ ] Quadrants vides accessibles (tap possible, option ajout système)
- [ ] Versión desktop fonctionnelle (même fichier, media queries)

---

## Périmètre

| Élément | Changement |
|---|---|
| `itineraire.html` | **Remplacement complet** |
| `perils_data.json` | Aucun changement |
| `quadrants_MA.json` | Aucun changement |
| `localStorage('quadrantsMA')` | Clé conservée, format inchangé |
| Stack CSS | Migration vers Tailwind CDN |
| Bug modificateur | **Corrigé** dans cette version |

**Niveau de risque :** Élevé (refonte structurelle + correction mécanique)
