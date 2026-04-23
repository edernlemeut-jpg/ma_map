# Spécification — itineraire.html (refonte mobile-first)

**Date :** 2026-04-18  
**Scénario :** scenario-itineraire-mobile.md  
**Statut :** Prêt pour implémentation

---

## Résumé du changement

Remplacement complet d'`itineraire.html` par une version mobile-first utilisant Tailwind CSS. 
Même fichier, même clé localStorage, même format de données. 
Correction du bug de calcul du modificateur de périls.

---

## Architecture de la page

### Layout mobile (portrait, défaut)

```
┌──────────────────────────────┐
│  Metal Adventures  [⚙]  [≡] │  ← Header fixe (h-12)
├──────────────────────────────┤
│                              │
│   CARTE GALACTIQUE           │  ← Zone carte (55vh)
│   Pinch-zoom + pan tactile   │     overflow: hidden
│   Tap → sélection quadrant   │     touch-action: none (JS custom)
│                              │
├──────────────────────────────┤
│  ▼ Alpha-12                  │  ← Bottom sheet (slide-up)
│  ● Kerath Prime    [Départ]  │     Max-height: 35vh
│  ○ Vor Station     [Étape]   │     Scroll interne
│  ○ Miner's Rest    [Arrivée] │     Quadrant vide → [+ Ajouter système]
│  [Fermer]                    │
├──────────────────────────────┤
│  [🚀 Calculer l'itinéraire]  │  ← Bouton fixe en bas
└──────────────────────────────┘
```

### Layout desktop (≥ 768px)

```
┌────────────────────┬─────────────────────┐
│                    │  Paramètres         │
│   CARTE            │  ─────────────────  │
│   (flex-grow)      │  Systèmes sélect.   │
│                    │  ─────────────────  │
│                    │  Résultat voyage    │
│                    │  (cards segments)   │
└────────────────────┴─────────────────────┘
```

---

## Composants

### 1. Carte galactique

| Propriété | Valeur |
|---|---|
| Grille | 40×40, rendue en `<div>` grid (1600 divs, cliquables, indicateurs CSS) |
| Zoom | Pinch-zoom JS natif (touch events) + boutons +/- desktop |
| Pan | Drag tactile (touchmove) + drag souris (mousemove) |
| Quadrant tap | → ouvre bottom sheet du quadrant |
| Quadrant vide | Affiche bottom sheet avec message "Quadrant vide" uniquement |
| Indicateurs | Départ = bleu, Étape = jaune, Arrivée = vert |
| Chemin | Trait SVG superposé reliant les quadrants sélectionnés |

### 2. Bottom sheet quadrant

- Slide-up animé depuis le bas
- Titre : coordonnée + nom du quadrant si nommé
- Liste des systèmes avec boutons rôle : `[Départ]` `[Étape]` `[Arrivée]`
- Un système ne peut avoir qu'un seul rôle à la fois
- Bouton `[Fermer]` et swipe-down pour fermer
- Si quadrant vide : message "Quadrant vide — aucun système répertorié" (pas d'option d'ajout)

### 3. Panneau paramètres (modal, [⚙])

Champs :
- Vitesse interplanétaire (US/jour) — défaut : 100
- Succès excédentaires Navigation — défaut : 0
- Vitesse hyperspatiale (PC/jour) — défaut : 1000
- Autonomie vaisseau (PC) — défaut : 10000
- Succès excédentaires Saut — défaut : 0

Bouton `[Enregistrer]` → ferme le modal, paramètres conservés en `localStorage('itineraireParams')` (persistés entre sessions).

### 4. Résultat voyage — cards segments

Affiché après calcul, sous la carte (mobile) ou panneau droit (desktop).

**Résumé total :**
```
Total : X jours · Y périls · Z PC
```

**Card par segment :**
```
┌─────────────────────────────┐
│ Kerath Prime → Vor Station  │
│ 2 jours · Hyperspatial      │
├─────────────────────────────┤
│ Jour 1  [Péril : Épave ▶]  │
│ Jour 2  [Péril : Calme ▶]  │
│ Surf J1 : [____] PC         │
└─────────────────────────────┘
```

- Tap sur un péril → fiche péril (modal plein écran)
- Champ Surf modifiable par jour (recalcule la distance restante)

### 5. Fiche péril (modal)

- Nom, description, protocole, résultat, senseurs, sciences stellaires
- Bouton `[Fermer]` + swipe-down

### 6. Historique des itinéraires

- Accessible via bouton `[📋 Historique]` dans le panneau résultat
- Chaque calcul validé peut être **sauvegardé** avec un nom libre (ex: "Voyage vers Kerath")
- Stocké dans `localStorage('itineraireHistorique')` — tableau d'entrées horodatées
- Vue liste : nom, date, résumé (X jours, Y segments)
- Actions par entrée : `[Charger]` → recharge la sélection et le résultat / `[Supprimer]`
- Pas de limite de nombre d'entrées (gestion manuelle par l'utilisateur)

### 7. Mode Admin périls ([≡] dans header)

- Vue liste des tables interplanétaire / hyperspatiale
- Accordéon par catégorie
- Édition inline de chaque péril
- Bouton `[+ Ajouter péril]` par catégorie
- Données sauvegardées dans `localStorage('perilsDataAdmin')`

---

## Mécanique de calcul des périls — CORRECTION BUG

### Comportement corrigé

```javascript
function roll2D6() {
    return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

function getPeril(type, surplusSuccesses = 0) {
    const perilData = perilsData[type];
    if (!perilData?.categories?.length) return { nom: "Péril non défini", data: { description: "Données non chargées." } };

    // 1er jet : détermination de la catégorie (non modifié par les succès exc.)
    const categoryRoll = roll2D6();
    const category = perilData.categories.find(c => categoryRoll >= c.seuilMin && categoryRoll <= c.seuilMax);
    if (!category?.perils?.length) return { nom: "Calme plat", data: { description: "Aucun événement notable." } };

    // 2ème jet : péril spécifique dans la catégorie
    const rawRoll = roll2D6();
    // Soustraction des succès excédentaires sur ce résultat — plancher à 2
    // Le résultat modifié peut tomber dans une catégorie inférieure
    const modifiedRoll = Math.max(2, rawRoll - surplusSuccesses);

    // Recherche dans toutes les catégories triées par seuilMin décroissant
    // (permet de traverser vers une catégorie moins grave si nécessaire)
    const sortedCategories = [...perilData.categories].sort((a, b) => b.seuilMin - a.seuilMin);
    for (const cat of sortedCategories) {
        const peril = cat.perils?.find(p => modifiedRoll >= p.seuilMin && modifiedRoll <= p.seuilMax);
        if (peril) return peril;
    }

    // Fallback absolu : premier péril de la première catégorie
    return perilData.categories[0]?.perils?.[0] ?? { nom: "Calme plat", data: { description: "Aucun événement." } };
}
```

### Règle de surf

- Champ `surf` (PC ou US selon type) saisi dans le tableau résultat
- Augmente la distance parcourue ce jour → réduit le nombre de jours restants du segment
- Recalcul via bouton `[Actualiser]`

---

## Stack technique

| Élément | Choix |
|---|---|
| CSS | Tailwind CDN (cohérent avec `calendrier.html`, `revolte.html`) |
| JS | Vanilla ES6+ inline |
| Carte | `<div>` grid 40×40, zoom/pan via touch events natifs JS |
| Données | `localStorage('quadrantsMA')` + `perils_data.json` (fetch ou inline) |
| Persistance params | `localStorage('itineraireParams')` |
| Historique | `localStorage('itineraireHistorique')` |
| Pas de modules ES | `<script>` sans `type="module"` |

---

## Comportement responsive

| Breakpoint | Layout |
|---|---|
| < 768px (mobile) | Carte plein écran, bottom sheet, bouton calculer fixe en bas |
| ≥ 768px (desktop) | Carte à gauche (70%), panneau paramètres + résultat à droite |

---

## Critères d'acceptation

- [ ] La carte est navigable au doigt (pinch-zoom + pan)
- [ ] Tap sur un quadrant ouvre la bottom sheet en < 100ms
- [ ] Tap sur un quadrant vide affiche "Quadrant vide" (sans option d'ajout)
- [ ] Sélectionner départ + arrivée possible en < 30 secondes
- [ ] Les paramètres de voyage sont persistés entre sessions
- [ ] Le modificateur succès excédentaires est soustrait du 2ème jet (péril spécifique)
- [ ] Si résultat modifié < 2, le péril affiché est celui du seuil 2
- [ ] Le résultat modifié peut tomber dans une catégorie inférieure
- [ ] Le résultat est lisible en portrait sur écran 6" sans zoom
- [ ] Un itinéraire calculé peut être sauvegardé avec nom libre
- [ ] L'historique liste les itinéraires sauvegardés avec option Charger / Supprimer
- [ ] Le surf est saisissable par jour avec recalcul
- [ ] Le mode Admin des périls est utilisable au doigt
- [ ] La clé `localStorage('quadrantsMA')` est conservée (format inchangé)
- [ ] La page fonctionne hors connexion (pas de CDN bloquant)
- [ ] Le layout desktop deux-colonnes fonctionne à ≥ 768px
