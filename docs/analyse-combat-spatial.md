# Analyse complète du système de combat spatial — Metal Adventures

> Sources : Manuel des joueurs v1.5 (MdJ, p.150-169) · Guide du Meneur (GdM, p.85-92)

---

## 1. Vue d'ensemble

Le combat spatial de Metal Adventures est un système **cinématique et agressif** qui privilégie le spectacle aux calculs astrophysiques. Il se joue en **mode ludique** (tours avec initiative) et se décline en **quatre phases distinctes** qui se succèdent naturellement selon le déroulement de l'action :

| Phase | Description | Condition de transition |
|---|---|---|
| **L'approche** | Les vaisseaux se rapprochent sur la Battlegrid | Distance = 0 → tentative d'engagement |
| **Le combat tournoyant** | Mêlée orbitale, vaisseaux dans un cube de 1K | Break! réussi → poursuite |
| **La poursuite** | Un vaisseau fuit, l'autre poursuit via l'Écart | Écart = 0 → réengagement ; Écart > portée → liberté |
| **L'abordage** | Des fusiliers sautent sur le vaisseau adverse | Le combat personal se déroule en parallèle |

---

## 2. La Battlegrid

### 2.1 Définition et philosophie

La Battlegrid est le **système de repérage tactique centralisé** utilisé depuis l'Âge Stellaire. Il en existe plusieurs versions (Mk1 fond vert, Mk2 fond blanc, etc.). C'est une représentation **abstraite en 2D** d'un espace en 3D : elle montre des **vecteurs et des distances**, pas des positions exactes.

> Deux vaisseaux sur la même trajectoire de Battlegrid ne sont pas forcément l'un derrière l'autre dans la réalité, mais la Battlegrid montre qu'ils se dirigent dans la même direction à la même distance du point 0.

### 2.2 Unités

- **Klik (K)** = 1 000 km — unité de base du combat spatial et des voyages orbitaux
- **Incrément** = 25 K — la graduation minimale, le déplacement minimal d'un vaisseau, et la valeur d'une division de la chaîne sur le radar

### 2.3 Composantes de la Battlegrid

| Élément | Description |
|---|---|
| **Point zéro (point 0)** | Centre de la Battlegrid ; objectif stratégique ou point neutre |
| **Trajectoire d'attaque** | Ligne droite principale, graduée en 25K (12 points, de 25K à 300K de chaque côté) |
| **Trajectoire d'interception** | Seconde ligne droite, perpendiculaire à la trajectoire d'attaque |
| **Axes de convergence** | Arcs de cercle reliant les deux trajectoires à des **points de convergence** à distance équivalente du point 0 |
| **Relevés de distance** | Chiffres le long des trajectoires indiquant la distance au point 0 |
| **Compteur d'Avantage** | Valeur numérique (1–12+) représentant l'ascendant tactique d'un pilote |

### 2.4 Calcul de la distance entre deux vaisseaux

- **Même trajectoire** : compter les incréments de 25K qui les séparent
- **Trajectoires différentes** : prendre le vaisseau le plus éloigné du point 0, identifier l'**axe de convergence** le plus proche de ce vaisseau (côté point 500K) → la distance entre les deux vaisseaux est égale à la valeur de cet axe

### 2.5 Conditions d'utilisation

- Nécessite **senseurs fonctionnels** + **officier à la vigie**
- Seule la vigie peut consulter la Battlegrid
- Portée maximale de la Battlegrid : **1000 K** de diamètre
- Sans Battlegrid : combat "en aveugle" (distances verbalisées par le MJ)

### 2.6 Mode simplifié (duel)

Pour un combat à deux vaisseaux sans complication :
- Les deux vaisseaux sont toujours sur la même trajectoire
- On retient "de tête" la distance qui les sépare
- On l'inscrit sur une feuille blanche ou un tableau effaçable

---

## 3. Phase d'approche

### 3.1 Mouvement (action gratuite du pilote)

- Le pilote annonce une vitesse = multiple de 25K ≤ vitesse tactique du vaisseau
- **Un vaisseau fonctionnel peut toujours se déplacer d'au moins 25K**
- Si le vaisseau s'est déplacé de **> 25K** au tour précédent → doit se déplacer dans la même direction d'au moins 25K (sauf action **Rétrofusées!**)
- Si le vaisseau s'est déplacé de **≤ 25K** → peut rester stationnaire ou changer de direction
- Si le pilote est inactif → le vaisseau avance automatiquement de 25K (ou reste immobile si vitesse précédente ≤ 25K)

### 3.2 Visibilité

- En approche : les vaisseaux ennemis sont **invisibles à l'œil nu** (uniquement détectables sur les senseurs)
- En combat tournoyant : les vaisseaux deviennent **visibles** (le MJ montre l'illustration du vaisseau)

### 3.3 Arcs de tir en approche

| Arc | Condition de tir |
|---|---|
| **Proue** | Même trajectoire, cible devant |
| **Poupe** | Même trajectoire, cible derrière |
| **Flancs** | Cible sur une autre trajectoire |
| **Tourelles** | Tous les vaisseaux |
| **Arc interdit** | Action **Pivoter** (action simple) + ne pas se déplacer ce tour |

### 3.4 Configurations de départ (MdJ + GdM)

| Configuration | Placement |
|---|---|
| **Face-à-face** | Sur la trajectoire d'attaque, orientés vers le point 0, distants de la portée des meilleurs senseurs |
| **Filature** | Même trajectoire, orientés vers le même point 500K, distants de la moitié de la portée des senseurs |
| **Interception réussie** | Assaillant sur traj. interception + assailli sur traj. attaque, tous deux vers point 0, à l'axe de convergence ≤ portée des senseurs |
| **Interception ratée** | Assaillant vers point 0, assailli vers point 500K, à l'axe de convergence ≤ portée des senseurs |
| **Accostage** | Tous au point 0 ; déplacement libre au premier tour |
| **Combat hyperspatial** | Trajectoire d'attaque uniquement, pas de Virer possible |
| **Combat monstrueux** | Si monstre furtif : combat à 0K avec surprise ; sinon Face-à-face |
| **Combat orbital** | Planète au point 0 ; vaisseaux à 25K sur leur trajectoire |

---

## 4. Le combat tournoyant

### 4.1 Description

- Se déroule dans un **cube d'un klik d'arête** (1K = 1000 km, espace quasi-nul)
- Les vaisseaux restent au même point de la Battlegrid (sauf vaisseaux ≥ 10 000t)
- Implique potentiellement un **nombre infini de vaisseaux**

### 4.2 Deux notions clés

#### Contact visuel
Avoir le vaisseau ennemi dans sa **ligne de mire**. Nécessaire pour pouvoir tirer.

#### L'Avantage
Avoir le dessus tactique. Noté par une **valeur numérique** (1 minimum).
- Obtenu lors de l'engagement (succès excédentaires du test de Pilotage)
- Modifié par l'action **Accrocher**

### 4.3 Situations de tir en combat tournoyant

| Situation | Acteur | Action autorisée |
|---|---|---|
| **Contact visuel unilatéral** | Celui qui l'a | Toutes tourelles + toutes batteries d'un même arc |
| **Contact visuel unilatéral** | Celui qui ne l'a pas | **Aucun tir** |
| **Face à face (contact mutuel)** | Chacun | Toutes tourelles + batteries d'un arc ; combat très dangereux |

### 4.4 Règle des gros vaisseaux (≥ 10 000 t)

- Peuvent continuer à se déplacer sur la Battlegrid pendant le combat tournoyant
- Si leur vitesse tactique > adversaires → le combat tournoyant est **rompu**
- Immunisés aux coups critiques, aux armes lourdes et aux armes de véhicules
- Le combat tournoyant continue au nouveau point de la Battlegrid si la vitesse ne suffit pas

### 4.5 Fin du combat tournoyant

- Vaisseau neutralisé (structure à 0) → défaite
- Action **Break!** réussie → poursuite
- Vaisseau de 10 000t trop rapide → rupture automatique

---

## 5. La poursuite

### 5.1 Mécanisme

L'**Écart** = distance entre poursuivi et poursuivant.

| Origine | Écart de départ |
|---|---|
| Depuis l'approche | Distance réelle entre les vaisseaux au moment de la fuite |
| Depuis le combat tournoyant | Vitesse tactique du fuyard |

### 5.2 Résolution par tour

- Chaque pilote annonce sa vitesse (souvent le maximum)
- Vitesse du **poursuivant** → **retranchée** à l'Écart
- Vitesse du **poursuivi** → **ajoutée** à l'Écart

### 5.3 Tirs autorisés

| Camp | Armes utilisables |
|---|---|
| Poursuivant | Tourelles + armes de **proue** |
| Poursuivi | Tourelles + armes de **poupe** |

### 5.4 Fin de la poursuite

- **Écart ≤ 0** : engagement possible (comme en approche)
- **Écart > portée courte des senseurs** de tous les poursuivants : fuyard hors de danger
- **Limite de saut** : si le vaisseau sort de la Battlegrid, il peut passer en hyperespace (si Calculer un saut réussi)

---

## 6. L'abordage

### 6.1 Conditions

- Les vaisseaux doivent être en **combat tournoyant**
- Enfiler un scaphandre + sortir par le sas
- Idéalement les vaisseaux sont immobiles

### 6.2 Modes d'abordage

| Cible immobile | Cible en mouvement |
|---|---|
| Simple action **Sauter** jusqu'à la coque | Action **Bastardos Salto** (Athlétisme, TD) |
| Si sas rétractable dispo : simple amarrage | Si sas rétractable : action **Stella Special** |

### 6.3 Statut du sas de la cible

| État | Condition |
|---|---|
| **Verrouillé** | Vaisseau mobile |
| **Déverrouillé** | Vaisseau immobile (sauf préparation à la défense) |
| **Trappe de soute** | Commandée uniquement de l'intérieur (Effraction avec D+1) |

### 6.4 Après l'abordage

- Gestion en **combat personnel** (cf. combat au sol)
- Si le combat spatial continue : les deux combats se déroulent **en simultané** (initiative globale partagée)

---

## 7. Les postes d'équipage et leurs compétences

| Poste | Rôle | Compétence principale |
|---|---|---|
| **Pilote** | Manœuvres, engagement, break, virer | Pilotage (Vaisseau spatial) |
| **Vigie / Capteur** | Détection, brouillage, identification | Senseurs |
| **Canonnier** | Tirs, viser, préparer les armes | Armes embarquées |
| **Ingénieur / Machineries** | Redistribution d'énergie, réparations | Ingénierie |
| **Capitaine / Officier** | Initiative (Rapport de situation), commandement | Navigation / Commandement |
| **Fusilier / Abordage** | Bastardos Salto, combat personnel | Athlétisme / Combat |

---

## 8. Actions spatiales — Récapitulatif complet

### 8.1 Actions du Pilote

| Action | Phase | Durée | Compétence | Effet |
|---|---|---|---|---|
| **Mouvement** | Toutes | Action gratuite | — | Déplacement de x×25K sur la Battlegrid |
| **Engagement** | Approche | Complexe | Pilotage (VS) | Engager le combat tournoyant ; Avantage = succès excédentaires ; Difficulté = distance/25 |
| **Accrocher** | CT | Complexe | Pilotage (VS) | Obtenir/augmenter l'Avantage et le contact visuel ; Diff=1 si Avantage, sinon =valeur de l'Avantage |
| **Break!** | CT | Complexe | Pilotage (VS) | Quitter le CT → poursuite à distance = vitesse tactique ; même Difficulté qu'Accrocher |
| **Rétrofusées!** | App / Pours. | Complexe | Pilotage (VS) | Faire demi-tour (25K) ; App→poursuite ; poursuite→approche ou fin |
| **Stella Special** | CT | Complexe | Pilotage (VS) opposée | Amarrer via sas rétractable (nécessite contact visuel + Avantage) ; TD |
| **Virer** | Approche | Complexe | Pilotage (VS) | Changer de trajectoire ; succès excédentaires × 25K doit ≥ axe de convergence suivant |
| **Pivoter** | Toutes | Simple | — | Changer l'arc de tir face à la cible |
| **Cascade!** | Toutes | Complexe | Pilotage (VS) | Manœuvre en espace difficile (Diff 2–11 selon situation) |
| **Manœuvre défensive** | Toutes | Complexe | Pilotage (VS) | +succès excédentaires à la Difficulté des tirs ennemis |
| **Manœuvre offensive** | Toutes | Complexe | Pilotage (VS) | +succès excédentaires en dés bonus aux canonniers et fusiliers |

### 8.2 Actions du Canonnier (poste Canons)

| Action | Durée | Compétence | Effet |
|---|---|---|---|
| **Tirer** | Complexe | Armes embarquées | Tir sur cible ; Diff: CT=1, ≤portée=3, ≤2×portée=5, au-delà=impossible |
| **Viser** | Simple | — | +1d au prochain tir sur cette cible |
| **Préparer une arme** | Complexe | — | Recharger une arme en mode Coup par coup (CC) |

#### Modificateurs de tir

| Situation | Modificateur |
|---|---|
| Cible immobile | TF (très facile) |
| Dégâts négligeables (vs Blindage) | TD |
| Environnement encombré | D+1 |
| Intempéries spatiales | D+1 |
| Senseurs détruits | TD |
| Tir localisé | TD |
| Tirer sur CT sans y participer | TD |

### 8.3 Actions de la Vigie (poste Senseurs)

| Action | Durée | Compétence | Effet |
|---|---|---|---|
| **Identifier** | Complexe | Senseurs | Obtenir des infos sur un contact radar (classe, modèle, état…) ; TD si passif, portée longue = impossible |
| **Recherche radar** | Complexe | Senseurs | Localiser un vaisseau non repéré ; test ouvert (D+1) pour balayage large |
| **Brouillage radar** | Complexe | Senseurs | +succès excédentaires à la Difficulté des tirs ennemis ; TD si cible hors portée courte |
| **Brouillage radio** | Complexe | Senseurs | Opposition Senseurs ; empêche la coordination d'escadron ennemi |

### 8.4 Actions des Machineries (Ingénieur)

| Action | Durée | Compétence | Effet |
|---|---|---|---|
| **Canaliser** | Complexe | Ingénierie | Redistribuer l'énergie entre systèmes : Armement / Propulsion / Senseurs ; bonus ou malus selon systèmes favorisés/appauvris |

### 8.5 Actions générales (tous postes)

| Action | Durée | Compétence | Effet |
|---|---|---|---|
| **Communiquer** | Simple | — | Utiliser l'intercom entre postes |
| **Changer de poste** | Complexe (≤1000t) / 5 min (>1000t) | — | Changer de poste physique dans le vaisseau |
| **Rapport de situation** | Complexe | Navigation | Refaire le test d'initiative (effectif au prochain tour) |
| **Bastardos Salto** | Complexe | Athlétisme | Sauter sur un vaisseau en mouvement (toujours TD, apesanteur D+1) |

---

## 9. Tirs localisés

Un tir localisé cible un **composant spécifique** du vaisseau. Réservé aux armes CC ou semi-auto. Le test est **(TD)**.

| Localisation | Effet simple (succès excédentaires ≤ Coque) | Effet majeur (> Coque, ou 2e tir) |
|---|---|---|
| **Batterie** | Tests Armes embarquées (TD) | Batterie détruite |
| **Quartiers** | Passagers blessés (L) + dépressurisation II | Passagers blessés (G) + dépressurisation III |
| **Cockpit** | Pilotes/Vigies blessés (L) + dépressurisation II | Pilotes/Vigies blessés (G) + dépressurisation III |
| **Hyperpropulsion** | (TD) pour Calculer un saut | Saut impossible |
| **Machineries** | Fuite (perte autonomie) | Kaboom! (explosion complète si hyperpropulsion) |
| **Propulsion** | Vitesse ÷2, E2F aux tests | Vaisseau immobilisé |
| **Sas** | Porte extérieure détruite | Porte interne détruite |
| **Senseurs** | Tests Senseurs (TD) | Senseurs détruits |
| **Soute** | Moitié de la cargaison détruite | Toute la cargaison détruite |
| **Système secondaire** | Endommagé (ne fonctionne plus) | Détruit (à remplacer) |

---

## 10. Règles de coordination — "Tous ensemble!"

| Niveau | Règle |
|---|---|
| **Dans un vaisseau** | Un seul personnage résout l'action par poste ; l'effectif supplémentaire donne des dés bonus |
| **En escadron** | Les pilotes peuvent se soutenir mutuellement via Tous ensemble! |
| **Tirs coordonnés** | Un seul tir par batterie par tour ; chaque arme supplémentaire = 1d bonus ; coordonner entre vaisseaux d'un même escadron = 1d bonus par arme participant |
| **Cibles multiples** | Un tir peut affecter autant de cibles qu'il y a d'armes (×5 si RC, ×10 si RL) |

---

## 11. Champs de bataille spatiaux (GdM)

| Champ | Spécificités |
|---|---|
| **Espace profond** | Aucun modificateur ; combat le plus fréquent ; limite de saut possible |
| **Orbite planétaire** | Manœuvre défensive : Diff+1d ; combat en orbite ajoute complexité orbitale |
| **Champ d'astéroïdes** | Manœuvre défensive TF ; risque de collision (Cascade!) |
| **Bataille spatiale** | Manœuvre défensive : Diff+1d ; système dédié (Le Fer et le Sang) pour les grandes batailles |
| **Hyperespace** | Trajectoire d'attaque uniquement ; propulsion = vitesse hypersp./10 ; tests Pilotage D+1 ; un échec MF = 1S au vaisseau ; combat rare et dangereux |

---

## 12. Données de référence des vaisseaux

### Classes et tonnage

| Classe | Tonnage type | Caractéristiques |
|---|---|---|
| Capsule | 10 t | Très petite, 1 homme |
| Chasseur | 100 t | Hyperagressif, très maniable |
| Transport / Frégate | 1 000 t | Polyvalent, bonne vitesse |
| Croiseur | 10 000 t | Immunisé coups critiques ; peut continuer à se déplacer en CT |
| Cuirassé / Capital | 100 000 t | Vaisseaux de commandement ; immunité complète aux armes de véhicule |

### Caractéristiques spatiales clés

| Stat | Description |
|---|---|
| **Vitesse tactique** | Vitesse maximale en K par tour (détermine déplacement en approche/poursuite) |
| **Manœuvrabilité** | Impacte les tests du combat tournoyant |
| **Blindage** | Réduit les dégâts bruts reçus |
| **Coque** | Points de structure + seuil pour les effets de tirs localisés |
| **Portée senseurs (courte)** | Distance maximale pour la Battlegrid et les tirs |

### Arcs de tir possibles

| Arc | Position sur le vaisseau |
|---|---|
| Proue | Avant ; tire devant sur la même trajectoire |
| Poupe | Arrière ; tire derrière sur la même trajectoire |
| Flanc tribord / Flanc bâbord | Côtés ; tirent sur les autres trajectoires |
| Tourelles | Omnidirectionnel |

---

## 13. Analyse pour l'implémentation numérique

### 13.1 La Battlegrid numérique (radar)

L'image de référence montre une **Battlegrid circulaire** (version Mk2 fond blanc) avec :

| Élément visuel | Correspondance règles |
|---|---|
| Anneau à 100K | Axe de convergence à 100K |
| Anneau à 250K | Axe de convergence à 250K |
| Anneau à 500K | Limite externe de la Battlegrid standard |
| 4 axes (croix) | Trajectoire d'attaque (horizontal) + trajectoire d'interception (vertical) |
| Chaîne en bordure | Décoration HUD ; légende O-O = 25K (un maillon = 1 incrément) |
| Point central | Point zéro |
| Positions sur les bras | Graduations en 25K (12 points par bras = 300K maximum par trajectoire) |

### 13.2 État du combat à modéliser

```javascript
// Modèle de données pour le combat spatial
const combatState = {
  phase: 'approche' | 'tournoyant' | 'poursuite' | 'abordage',
  configuration: 'face-a-face' | 'filature' | 'interception-reussie' | '...',
  champDeBataille: 'espace-profond' | 'orbite' | 'asteroides' | 'hyperespace',
  
  vaisseaux: [
    {
      id: string,
      nom: string,
      tonnage: number,           // En tonnes
      vitesseTactique: number,   // En K par tour
      vitesseActuelle: number,
      trajectoire: 'attaque' | 'interception',
      position: number,          // Distance au point 0 en K (négatif = autre côté)
      orientation: 'vers0' | 'vers500',
      arcFace: 'proue' | 'poupe' | 'flanc-t' | 'flanc-b', // arc face à l'ennemi en CT
      
      // Combat tournoyant
      contactVisuel: boolean,
      avantage: number | null,   // null = n'a pas l'Avantage, number = valeur
      
      // État
      structureActuelle: number,
      structureMax: number,
      propulsionDetruite: boolean,
      senteursDetruits: boolean,
      
      // Arcs d'armement disponibles
      armement: {
        proue: Arme[],
        poupe: Arme[],
        flancTribord: Arme[],
        flancBabord: Arme[],
        tourelles: Arme[]
      }
    }
  ],
  
  // Poursuite
  ecart: number | null,
  
  // Logs du combat
  journal: TourLog[]
}
```

### 13.3 Logique du combat tournoyant

```
Chaque tour de CT :
  Pour chaque vaisseau par ordre d'initiative :
    1. PILOTE → Accrocher | Break! | Manœuvre défensive | Manœuvre offensive | Pivoter | Stella Special
    2. VIGIE → Brouillage radar | Brouillage radio | Identifier | Recherche radar
    3. CANONS → Tirer (si contact visuel) | Viser | Préparer
    4. MACHINERIES → Canaliser
    5. OFFICIER → Rapport de situation | Communiquer

Après Accrocher réussi :
  Si pas de contact visuel → contact visuel obtenu
  Vainqueur prend l'Avantage = succès excédentaires (min 1)
  
Après Break! réussi :
  Phase → 'poursuite'
  Écart = vitesse tactique du fuyard
```

### 13.4 Architecture technique proposée

#### Technologie

| Couche | Choix recommandé | Justification |
|---|---|---|
| Rendu radar | **SVG** | Transformations propres, zoom, texte intégré |
| État combat | **JS vanilla ou Vue.js** | Léger, cohérent avec le reste du projet |
| API backend | **Express existant** | Routes combat spatial sous `/api/combat-spatial` |
| Persistance | **SQLite** (db existante) | Table `combats_spatiaux` liée aux tables de jeu |

#### Structure fichiers proposée

```
public/
  combat-spatial.html       ← Page principale
  js/
    combat-spatial-app.js   ← SPA principale
    combat-radar.js         ← Composant SVG radar
    combat-engine.js        ← Logique des règles

src/routes/
  combat-spatial.js         ← API CRUD

src/combat/
  rules.js                  ← Règles encodées (actions, modificateurs)
  ai-pilote.js              ← IA simple pour PNJ pilotes
```

#### Table SQL

```sql
CREATE TABLE IF NOT EXISTS combats_spatiaux (
  id TEXT PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_cours',
  phase TEXT NOT NULL DEFAULT 'approche',
  configuration TEXT NOT NULL,
  champ_bataille TEXT NOT NULL DEFAULT 'espace-profond',
  combat_json TEXT NOT NULL DEFAULT '{}',  -- État complet
  journal_json TEXT NOT NULL DEFAULT '[]', -- Historique des tours
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 14. Spécifications du radar SVG

```
Dimensions canvas : 600×600 px
Centre : (300, 300)

Anneaux concentriques :
  - r=60px  → 100K
  - r=150px → 250K
  - r=300px → 500K (bord externe)

Axes :
  - Horizontal = Trajectoire d'attaque (0°/180°)
  - Vertical   = Trajectoire d'interception (90°/270°)

Graduations (positions) :
  Tous les 15px = 25K
  De 15px à 300px = 12 positions par bras (25K à 300K)

Point zéro : cercle plein r=8px au centre

Tokens vaisseaux :
  - Icône selon classe (triangle=chasseur, rectangle=frégate, polygon=croiseur)
  - Couleur selon camp (vert=joueurs, rouge=ennemis, jaune=neutres)
  - Orientation (flèche) selon direction
  - Si immobile : croix superposée

Avantage :
  Arc en surbrillance autour du vaisseau ayant l'Avantage
  Valeur numérique affichée

Contact visuel :
  Ligne tiretée entre les deux vaisseaux concernés
  Direction : du "voyeur" vers la cible

Portée d'arme :
  Overlay au survol : zone de tir possible colorée selon arc

Esthétique :
  Fond blanc
  Lignes et textes : vert foncé (#1a5c2a) ou noir pour lisibilité MJ
  Bordure chaîne : repeating-linear-gradient ou SVG pattern
```

---

## 15. Fonctionnalités de l'interface interactive

### Interface radar (MJ uniquement)

| Fonctionnalité | Description |
|---|---|
| **Glisser-déposer** | Déplacer un vaisseau le long de sa trajectoire (snap en 25K) |
| **Changer de trajectoire** | Bouton Virer → déplace vers l'axe de convergence correspondant |
| **Zoom** | Vue rapprochée pour le CT |
| **Arcs de tir** | Survol d'un vaisseau → overlay coloré des zones de tir |
| **Phase clock** | Indicateur de phase actuelle + tour numéroté |
| **Log de combat** | Journal déroulant des actions résolues |

### Panneau d'actions (par joueur / poste)

| Poste | Actions disponibles selon phase |
|---|---|
| **Pilote** | Boutons des actions disponibles avec Difficulté calculée |
| **Vigie** | Boutons radar (identifier, brouiller) |
| **Canons** | Liste des cibles possibles + Difficulté affichée |
| **Machineries** | Slider redistribution d'énergie |

### Résolveur de tests

- Affichage : "Pilotage (VS) — Difficulté 3" → lancer les dés → résultat
- Calcul automatique des modificateurs (TF, TD, D+1)
- Application automatique des effets (contact visuel, Avantage, dégâts)

---

## 16. Éléments non couverts (à compléter)

| Sujet | Référence | Disponibilité |
|---|---|---|
| Caractéristiques complètes des vaisseaux | MdJ p.134–148 / GdM p.168–173 | `tmp_pdf_texts/mdj.txt` |
| Types d'armes embarquées et portées | MdJ p.136–137 | `tmp_pdf_texts/mdj.txt` |
| Règles de grandes batailles rangées | Le Fer et le Sang | Supplément (non analysé) |
| Combat hyperspatial complet | Les Sciences et l'Infini | Supplément (non analysé) |
| Pilotage planétaire | MdJ p.198–205 | `tmp_pdf_texts/mdj.txt` |

---

*Document généré à partir de Metal Adventures MdJ v1.5 et GdM — Analyse complète du système de combat spatial.*
