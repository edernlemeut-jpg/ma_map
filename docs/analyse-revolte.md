# Analyse `revolte.html` vs règles officielles « Les pirates de l'espace »

Document de référence des règles : `tmp_ma11_revolte.txt` (extrait OCR du PDF MA11 — Les pirates de l'espace).
Code analysé :

- [public/revolte.html](../public/revolte.html)
- [public/js/revolte/revolte-app.js](../public/js/revolte/revolte-app.js)
- [src/services/revolte.js](../src/services/revolte.js)
- [src/routes/revolte.js](../src/routes/revolte.js)

> **Principe directeur :** les règles officielles font foi. L'outil doit (1) reproduire fidèlement, (2) aider le MJ à suivre l'évolution de la Révolte dans le temps, (3) automatiser ce qui est calculable.

---

## 1. Vue d'ensemble — ce qui est bien

- Persistance par session (CRUD, état JSON), liste latérale, autosave, export CR Markdown.
- 4 types couverts (Émeute / Festive / Mutinerie / Révolution).
- 4 étapes UI (Paramétrage / Préparation / Exécution / Célébration).
- Calcul des diff dynamiques (Sécurité + malus + QG non capturés) et badges « ✅ / ❌ » par test.
- Table population → insurgés correctement implémentée avec bonus/malus de décalage.
- Récompenses PP/PG conformes pour Mutinerie (1/2 PP selon tonnage) et Révolution (1/2/3 PP+PG selon scope).
- Coûts de déclenchement (3 / 3 / 1‑5‑8‑10 / 5‑10‑25 PP) corrects en valeur.
- Lieux de pouvoir + alliés + qualité des troupes : structures de données et UI en place.
- Intégration du monde (planètes, systèmes, vaisseaux, personnages) pour auto‑remplir population / Sécurité / tonnage.

---

## 2. Écarts règle / implémentation (par bloc)

### 2.1 Commun — Stella Bell, propagande, porte‑drapeaux, PP

| Règle | État | Détail |
|---|---|---|
| Conditions Stella : *(pirate impliqué)* **ET** *(population connaît Stella)* → pas de malus. Sinon D+1. Stella morte → encore D+1. | ❌ Bug | `getMalus()` lit `!stella.porteDrapeau \|\| !stella.connu` ; la première condition devrait être « au moins un porte‑drapeau pirate » (calculable depuis `state.pd.pirates > 0`), pas « Stella est porte‑drapeau ». |
| Coût de l'appel Stella (PP) variable par nation : OCG/LPL = 1 PP ; Sol/Barrens = 3 PP ; EG = 5 PP. | ❌ Manquant | Aucune dépense de PP modélisée pour l'aide Stella. |
| Bonus « +1d si la population a récemment entendu un appel de Stella ». | ❌ Manquant | Pas de toggle distinct de « Stella connue » pour déclencher ce +1d ponctuel. |
| Propagande pirate générale : test Éloquence (3) ; chaque exc → soit +1d à un test de Révolte, soit +1 mois de durée. Délai d'effet : 1 j planète / 1 sem système / 1 mois nation / 3 mois galaxie. | ⚠️ Partiel | Le test est présent (`propagandeSuccesInput`, `eloquencePropagandeInput`) mais l'arbitrage « bonus en dés » vs « bonus en mois » et le délai d'effet selon portée (planète/système/nation/galaxie) ne sont ni saisis ni rappelés. |
| Pré‑travail Propagande (1) en 1 semaine → +1d au prochain test Éloquence. | ❌ Manquant | Action absente. |
| Catégories Porte‑Drapeau : **Pirates / Locaux** uniquement (avec officiers en sus). | ⚠️ Divergence | UI ajoute une 3ᵉ catégorie « Autres » qui n'existe pas dans les règles et qui fausse la majorité pirates ↔ locaux (un local mal catégorisé en « Autres » ne compte pas). |
| Coûts révolte = **dépense** (Émeute / Festive / Mutinerie) OU **sacrifice** (Révolution). Les dépenses ne sont **récupérables qu'à la fin** de la Révolte. | ⚠️ Partiel | Coûts affichés, mais : pas de distinction dépense/sacrifice dans l'UI ni de mécanique de verrouillage/déblocage des PP des participants à la fin. |
| Tests pendant la Révolte réservés aux officiers / PD ; tests (PD) réservés au PD. | ⚠️ Visuel | Le badge `(PD)` est mentionné dans des tooltips mais le tracker ne propose pas de choix « qui lance ce test » ni ne bloque les tests (PD) hors PD. |
| Récompense « officiers récupèrent **chacun** 1 PP ». | ⚠️ Affichage | Le compteur global mentionne « 1 PP » sans préciser « chacun × N officiers ». |

### 2.2 Émeute pirate

| Règle | État | Détail |
|---|---|---|
| Préparation Empathie (1) → exc = +1d Discours ; Tactique (1) → exc = +1d MF Police. | ✅ | Conforme. |
| Discours = **Éloquence (Sécurité) (PD)**. | ✅ | Conforme, mais badge (PD) absent. |
| « Grand lieu » modifie le **prix du sang** (10 décès / 5 min au lieu de 1 / 5 min), pas le Discours. | ❌ Bug logique | Code applique `grandLieuBonus = +1d` au discours, pas aux pertes ; et le prix du sang Émeute n'est pas calculé du tout dans `updateEmeuteUI` (`emeuteCelebrationResult` reste générique). |
| **Actions pendant l'émeute** (toutes 5 min/tentative) : Progresser (Commandement, Sécurité, PD), Initier pirate (Éloquence 3), Négocier (Intimidation ou Bureaucratie, Sécurité, PD) → +1d MF Police par exc ; si haut lieu : convocation responsable et négociation chronométrée. | ❌ Manquant | Aucune action « in‑run » trackée. |
| MF utilisable comme dés violents → émeute violente → **Wanted (-1)** pour tous les participants. | ❌ Manquant | Pas de toggle « émeute violente » ni de propagation Wanted. |
| Refaire le Discours pour prolonger l'émeute. | ❌ Manquant | Pas de relance. |
| Police! pendant l'émeute : coût -1d MF par 5 min ; options pour empêcher (négocier / combattre / Tactique Sécurité). | ❌ Manquant | Pas de tracker MF/Retour de flamme. |

### 2.3 Révolution festive

| Règle | État | Détail |
|---|---|---|
| Test MJ **Sécurité (10 - Gloire du PD au plus haut score)** au début des préparatifs → repérage ⇒ Police! / alerte sol. | ❌ Manquant | Non modélisé. |
| Table d'invités : 10 / 100 / 1 000 / **plusieurs milliers** avec coûts 250 / 2 500 / 25 000 / **250 000 Ø**, diff 1 / 3 / 5 / **8** et bonus de référence **− / +1d / TF / TF**. | ⚠️ Partiel | Coûts et diff corrects ; **les bonus de référence sont faux** : `nbInvitesData` = `{10:0, 100:1, 1000:0, 10000:0}` alors que les règles disent `{10:0, 100:+1d, 1000:TF, 10000:TF}`. De plus, ce bonus s'applique **à toutes les actions pendant la fête**, pas seulement à la préparation. |
| Préparer le lieu : compétence dépend du lieu (Environnement / Étiquette / Illégalités). | ⚠️ Partiel | Le code ne change que le label « Autorisation » selon `lieuFete` ; « Préparer le lieu » reste toujours Environnement. |
| Rassemblement = Étiquette (3) **ou** Illégalités (3) selon nature ; il faut **cumuler succès excédentaires = X**. | ⚠️ Partiel | La compétence n'est pas adaptée (toujours « Étiquette ») ; le seuil de succès exc est testé mais sur 1 seul jet alors que la règle laisse cumuler plusieurs jets de prép. |
| **Invités de marque** : rencontre OU Étiquette/Illégalités (3) ; vient si **X > Gloire min**. Test Sécurité (10‑Gloire max) MJ → espions, +1d/invité supplémentaire, exc → -1d MF Police. | ❌ Manquant | Aucun tracking des invités de marque ni des espions. |
| **Actions pendant la fête** (1h, bénéficient du bonus de référence) : Recruter (1), Initiation pirate, Discuter (Gloire min ignorée), Diffuser propagande pirate (Propagande 10-X **ou** 1 PP) → +1d par exc/PP à une révolte du mois prochain. | ❌ Manquant | Pas du tout. |
| Échec de l'Appel → 1 PP pour réessayer (par tentative supplémentaire). | ⚠️ Affichage | Mentionné en texte, pas trackable. |

### 2.4 Mutinerie pirate

| Règle | État | Détail |
|---|---|---|
| Ralliement : « Chaque test d'Éloquence réussi vous permet de recruter **1 mutin**, plus **1 par succès excédentaire** ». | ❌ Bug | `totalMutins = max(0, eloqPoste-3) + max(0, eloqCambuse-2)` ne compte **que les excédents** ; il manque le « +1 par jet réussi ». |
| Masse critique = `tonnage/100` ; au‑delà, auto‑recrutement de `tonnage/100`/jour mais **contre‑rév. +1d**. | ⚠️ Partiel | Masse critique affichée ; auto‑recrutement & malus de contre‑rév non gérés. |
| Cycle « capitaine alerté » : pas de Discrétion → Vigilance des officiers (exc Discrétion) ; Tactique capitaine (10 - tests vigilance) → confrontation. | ❌ Manquant | Non modélisé. |
| Discipliner / perte de Satisfaction → +1d aux tests prep. | ❌ Manquant | Le check unique « Conditions favorables (+1d) » remplace ces deux mécaniques distinctes. |
| Tactique (3) « analyser le vaisseau » (1 jour repos) → exc = +1d aux tentatives **Progresser** pendant la mutinerie. | ⚠️ Partiel | Test présent ; le bonus « Progresser » n'est pas mis en regard d'actions de progression à bord. |
| Durée = **5 min × succès exc** (refaire test pour prolonger). | ✅ | Conforme. |
| Bonus abordage : « lire une ligne plus haut le rapport de force » ; bonus évasion : +1d tous tests + 1d MF Police par mutin. | ❌ Manquant | Pas d'intégration avec un éventuel module d'abordage/évasion ; ces effets ne sont pas rappelés. |
| Prix du sang = `Tonnage/200` décès × tranches de 5 min ; ignoré pour 100 t. | ✅ | Conforme. |
| Wanted (-1) / (-3 si ≥ 10 000 t). | ✅ | Conforme. |

### 2.5 Révolution (le plus gros chantier)

#### Planification
| Règle | État |
|---|---|
| Identifier les **lieux de pouvoir** (astroports / nœuds com / bases militaires / QG) via Connaître (3), Se renseigner (3) (1j), bonus Sciences solaires / Stratégie (1). | ❌ Manquant — l'utilisateur saisit les lieux à la main sans test ni découverte progressive. |

#### Préparation
| Règle | État | Détail |
|---|---|---|
| 1 tentative / mois ; chaque test = 1 semaine de jeu ; résultat visible 1 mois plus tard. | ❌ Manquant | Pas de chronologie / calendrier ; tous les tests sont « instantanés ». |
| Présence sur place = -1 Gloire / mois. | ❌ Manquant | Aucun lien avec la Gloire des PJ. |
| Au moins 1 officier doit rester sur place. | ❌ Manquant | Pas vérifié. |
| D+1 par **QG de faction présent sur la planète** (différent des QG-lieux-de-pouvoir). | ⚠️ Confondu | Le code applique +1 par lieu de pouvoir « QG non capturé » — ce qui mélange deux notions distinctes (« QG comme lieu à capturer » vs « QG de faction sur la planète »). |
| Retours de flamme déclenchables par le MJ ; Discrétion ajoute +1d MF. | ❌ Manquant | Pas de tracker Retours de Flamme. |
| Alliés : Gloire = +1d/pt à **une** action prep / mois ; Grade = +1d/pt à **un** test Exécution mettant en scène sa faction. Statut = +1d MF/pt. Trésor : 100 Ø/mois **par point** de Grade OU de Riche. Infos sur lieux secrets. | ⚠️ Partiel | Les bonus sont sommés et appliqués **en permanence à tous les tests**, alors que les règles les limitent (« une action / mois », « un test »). Pas de cadence mensuelle. |
| Recruter insurgés : exc = sections ; masse critique = Sécurité sections → +1 section / (Sécurité)/mois auto ; 100 Ø/mois + 1 vaisseau par section ; déplacement (10 vsx/section, Stratégie Sécurité, durée). | ⚠️ Partiel | Calcul OK ; déplacements/vaisseaux non gérés (seulement affichés). |
| Qualité des troupes : départ E2F (-2) ; +1 cran via **5 UC d'armes / 1 000 insurgés**, **Commandement (3) (1 mois, 1 officier/section)**, **Stratégie (Sécurité) (1 mois)**. | ❌ Bug | Les boutons « Équiper / Entraîner / Planifier » sont identiques et sans condition (incrémentent juste la qualité) — pas de test, pas de coût en UC. |
| Sensibiliser : Discours rue **Éloquence Sécurité (PD)** ; Tracts **Propagande Sécurité** ; Comprendre **Sciences solaires 3**. Exc cumulés → bonus aux tests d'insurrection. **+1d / émeute pirate réussie ce mois** pour le Discours. | ⚠️ Partiel | Tests présents. Bug d'étiquette : le tooltip de « Tracts » dit « Communication » au lieu de « Propagande ». Le bonus « émeute réussie ce mois » n'est pas connecté aux sessions Émeute. |
| Tech : vendre [sections] tonnes d'une marchandise techno+1 → SC (1 mois) ; double = SC×2. | ❌ Manquant | Checkbox simple sans tonnage ni effet appliqué. |
| Secret divulgué : +1d ou TF selon le MJ, tant que pas démenti. | ⚠️ Partiel | Checkbox sans graduation ni application. |
| **Insurrection générale** (préalable obligatoire à la Révolution stellaire). | ❌ Manquant | Toute la mécanique (accès données, protocole 4 tests, propagation par quadrant, instabilité ‑1/‑2 Sécurité) est absente. |
| **Délégués / Coordination** (officiers délégués par planète, rendez‑vous, bonus selon délai). | ❌ Manquant | Pas du tout — c'est pourtant essentiel pour la portée locale/stellaire. |

#### Exécution
| Règle | État | Détail |
|---|---|---|
| Appel = Éloquence (Sécurité) (PD), 1 h, intercom/radio ; centre contrôle astroport → SC. Échec : 1 PP + Police!. | ⚠️ Partiel | Test présent ; pas de modificateur « astroport SC » ni de Police! sur échec. |
| Pour scope locale/stellaire : appel **simultané** sur chaque planète ; sinon alerte généralisée. | ❌ Manquant | Pas de gestion multi‑planètes. |
| Assaut d'un lieu : 4 étapes — **Atteindre / Entrer / Atteindre dirigeant / Obtenir reddition**. Les deux premières = Commandement OU Tactique (Sécurité), 1 j chacun, échec → perte sections = succès manquants. Les deux dernières = combats. Personnage nommé requis (sinon D+1). | ⚠️ Partiel | Code propose seulement « Atteindre » et « Entrer ». Pas de « Atteindre dirigeant » / « Reddition individuelle ». Pas de perte de sections sur échec. Pas de check « personnage nommé en tête ». |
| Fin de journée : tous capturés → victoire ; ≥½ → Intimidation (Sécurité) D+1 ; ≥1 → Intimidation (Sécurité) TD. | ✅ | Conforme à l'affichage de la diff de Reddition. |
| Soutien stratégique inter‑planètes (locale) ou inter‑systèmes (stellaire) après 1ʳᵉ libération. | ❌ Manquant | Pas modélisé. |

#### Célébration & Contre‑Révolution
| Règle | État | Détail |
|---|---|---|
| Nouveau dirigeant **doit être** un PD **local**. | ❌ Bug | Code propose tous les PD + officiers en candidats. |
| Choix de gouvernement (cf. GdM p.30) → conséquences sociales (alliances, lois, port d'arme…). | ❌ Manquant | Pas de menu de gouvernement. |
| Récompenses : 1/2/3 PP **et** 1/2/3 PG **par officier** selon scope. | ⚠️ Affichage | Affiché « chaque officier » mais sans calcul × nb officiers ; pas de bouton « distribuer ». |
| Sciences solaires (3) → prévoir conséquences ; MJ décide. | ✅ | Présent comme « prévisions ». |
| Prix du sang = (sections + dés bonus mobilisation populaire) × 1 000 morts / **jour de combat** ; ~10× blessés. | ⚠️ Partiel | Code somme `totalSections + totalSensBonus` ; les règles parlent de « **dés bonus conférés par la mobilisation populaire** » — ce qui peut inclure le bonus des alliés (Gloire/Grade) appliqué au test final, pas seulement la sensibilisation. À clarifier. |
| Contre‑rév : dirigeant peut trahir ; nation envoie flotte (semaine‑deux mois) ; négociation possible. | ❌ Manquant | Étape Contre‑Révolution n'est pas une vraie étape dans l'UI. |

---

## 3. Plan d'actions

Priorisé par : impact règle / facilité / valeur MJ. Phasage proposé en lots livrables indépendamment.

### Lot A — Corrections de bugs (rapide, gros impact règle)

1. **Fix logique Stella Bell** : remplacer `getMalus()` par une formule conforme.
   - Conditions OK = (au moins un PD pirate dans `state.pd.pirates > 0`) **ET** (`stellaConnu`). Sinon D+1.
   - Ajouter D+1 si `stellaMorte`.
   - Renommer la case « Porte‑Drapeau » → « Stella participe directement » (effet : bonus +1d sur les tests de la Révolte, pas suppression du malus de base).
2. **Fix ralliement Mutinerie** : `mutins = 1 + max(0, succès - diff)` par test réussi (et 0 si échec), pour chaque jet (poste / cambuse).
3. **Fix bonus invités fête** : `nbInvitesData = {10:0, 100:+1d, 1000:TF, 10000:TF}` et appliquer ce bonus de référence à **toutes les actions pendant la fête** (préparation et exécution).
4. **Fix grand lieu (Émeute)** : retirer son effet sur le Discours, **l'appliquer au prix du sang** (×10 décès / 5 min) et ajouter le calcul du prix du sang Émeute dans la Célébration.
5. **Fix compétence Tracts (Révolution)** : tooltip et badge = « Propagande » (pas « Communication »).
6. **Fix compétence Préparer le lieu (Festive)** : sélectionner Environnement / Étiquette / Illégalités selon `lieuFete`.
7. **Fix nouveau dirigeant** : restreindre la liste aux PD **locaux**.
8. **Fix « PD Autres »** : soit retirer la catégorie, soit la nommer « non‑classés » et **ne pas la compter** dans le calcul de majorité pirates ↔ locaux.
9. **Fix QG malus** : distinguer « QG de faction sur la planète » (saisi indépendamment, malus prep D+1 par QG) du « QG comme lieu de pouvoir à capturer » (malus tant que non capturé, mais éventuellement le même nombre).

### Lot B — Compléter les mécaniques manquantes (haut impact règle)

10. **Identifier les lieux de pouvoir** (Révolution) : ajouter un mini‑workflow avec tests Connaître (3) / Se renseigner (3) (1 j) + bonus Sciences solaires/Stratégie (1). Liste de types (Astroport / Nœud com / Base militaire / QG politique). Champs `discoveredBy`, `isSecret`.
11. **Étape Assaut complète** : 4 sous‑étapes par lieu (Atteindre / Entrer / Atteindre dirigeant / Obtenir reddition), checkbox « personnage nommé en tête » (sinon D+1), calcul de perte de sections sur échec.
12. **Coûts révolte = dépense vs sacrifice** : ajouter à l'UI le mécanisme « réserver des PP » par participant (dépense), « brûler » (sacrifice). Sur passage en statut « réussie » / « échouée » : libérer les dépenses + créditer les récompenses. Nécessite une notion de **participants identifiés** (réutiliser les listes PD/officiers).
13. **Actions pendant la Révolte** :
    - Émeute : Progresser / Initier / Négocier / Convoquer responsable, avec compteur de tranches de 5 min.
    - Festive : Recruter / Initiation / Discuter / Propagande pirate diffusée.
14. **Insurrection générale** (Révolution stellaire) : section dédiée avec accès aux données par nation, 4 tests du protocole, calcul du délai par quadrant (3 mois / 1 mois / 1 semaine selon total), tracker par quadrant, instabilité −1/−2 Sécurité.
15. **Délégués** : liste de délégués par planète/officier, dernière date de rencontre, action confiée, bonus +1d (≥ 1 mois) ou TF (≥ 6 mois) appliqué au résultat révélé.
16. **Tech & Secret** :
    - Tech : champ « niveau technologique vendu », tonnage requis = `sections de la pop`, application SC aux tests prep pendant 1 mois.
    - Secret : niveau libre (+1d / TF / aucun) saisi par le MJ + flag « démenti » qui annule l'effet.
17. **Propagande pirate générale** : sélecteur portée (planète / système / nation / galaxie) avec délai d'effet + choix exc → +1d **ou** +1 mois ; action préparatoire Propagande (1) en 1 semaine.

### Lot C — Aides MJ & automatisation chronologique (forte valeur)

18. **Calendrier de Révolte** : intégrer la date courante de la campagne (déjà dans le header) pour cadencer :
    - Mutinerie : 1 jour / tentative.
    - Festive : 1 h / test prep.
    - Révolution : 1 semaine / tentative + résultat visible 1 mois après, 1 tentative/mois max.
    - Avancer le calendrier au clic « tester » avec respect du cooldown.
19. **Compteur de Gloire** des PJ présents (Révolution) : −1 / mois calculé automatiquement si le personnage est marqué « présent ».
20. **Compteur PP par participant** : afficher par PJ/officier les PP dépensés / réservés / gagnés (lecture depuis la fiche perso si possible, sinon manuel).
21. **Tracker Retours de Flamme MF** par étape : pool de MF cumulés ; afficher coût courant de « Police! » + modificateurs (Tactique succès exc, Statut alliés, Discrétion succès…). Bouton « déclencher Police! » qui consomme MF.
22. **Lien Émeute → Révolution** : « +1d / émeute pirate **réussie** ce mois » au Discours de Rue (lecture des sessions Émeute statut `reussie` sur la même planète, même mois campagne).
23. **Lien Mutinerie → modules abordage/évasion** : afficher les bonus calculés (`+1d MF par mutin` pour Police!, lecture du rapport de force en abordage).
24. **Étape « Contre‑Révolution »** : rendre la 4ᵉ étape de l'UI distincte de la Célébration (la 5ᵉ étape selon les règles). Trackers : trahison dirigeant, flotte de pacification (délai 1 sem – 2 mois), négociation politique.
25. **Soutien stratégique inter‑planètes** (locale/stellaire) : sous‑formulaire Stratégie (3) + calcul voyage Express (réutiliser l'itinéraire si possible).
26. **Distribution PP/PG aux officiers** : bouton « Distribuer les récompenses » qui itère sur les officiers présents.

### Lot D — Polish & UX MJ

27. Distinguer visuellement les tests **(PD)** dans le tracker (badge à côté du nom + désactivation soft si aucun PD n'est défini dans la bonne catégorie).
28. Export CR enrichi : inclure participants, lieux de pouvoir avec statut, pertes humaines, étape Contre‑Révolution.
29. Mode « cheat sheet » : panneau latéral repliable affichant la **règle exacte** correspondant au test sélectionné (anti‑confusion vs tooltips courts).
30. Tests automatisés (Playwright) : 1 scénario par type couvrant l'enchaînement des 4 étapes et la persistance.

---

## 4. Dépendances suggérées

- **Lot A** est autonome — à faire en premier (corrections sans nouvelle donnée stockée).
- **Lot B** ajoute des champs au `state_json` ; rétro‑compatible via `mergeState()` déjà en place.
- **Lot C** dépend du calendrier de campagne (`header-campaign-date` existe déjà) et de la liaison sessions‑sessions (lecture multi‑sessions de la même table).
- **Lot D** parachève une fois le fond stabilisé.

---

## 5. Décisions arbitrées (réponses utilisateur)

1. **Stella « Porte‑Drapeau »** : à **supprimer**. La condition règle « un PD pirate dans la révolte » se calcule depuis `state.pd.pirates.length > 0`. La case n'a plus de raison d'exister.
2. **Catégorie PD « Autres »** : conservée comme **information** (PNJ ralliés non classés). À **exclure** du calcul de majorité pirates ↔ locaux et à styler visuellement comme tag d'info (badge gris vs gold).
3. **Compétence Tracts** : **Propagande** (OCR officiel). Corriger tooltip et badge.
4. **Calendrier de campagne** : la date du header (issue de `calendrier.html`) est **fiable** et représente le jour courant. À utiliser comme source de vérité pour les cooldowns et les délais de Révolution (1 sem/test, 1 mois entre tentatives, résultat M+1). L'app peut/doit faire avancer la date via les actions de Révolte (cf. Lot C-18).
5. **Table population** : coquille OCR confirmée → `POPULATION_DATA = 750 000` est le bon chiffre, code conforme.

---

## 6. Analyse graphique et parcours utilisateur

### 6.1 Bilan honnête de l'état actuel

**Forces.**
- Squelette propre : header standard MA, panneau sessions latéral, éditeur central, autosave non intrusive, palette `ma-theme.css` cohérente avec le reste du site.
- Le pattern « tracker‑row » (label + tooltip + input + dé + statut ✅/❌) est lisible et scalable. C'est la meilleure trouvaille UX de la page.
- Filtre de sessions par statut, badges colorés, compteur PP global en pied de panneau — tout cela est juste.
- Adaptatif mobile (panneau cache, single‑column) raisonnable.

**Faiblesses structurelles** (à dire sans détour) :

1. **L'étape 0 « Paramétrage » est une fourre‑tout encyclopédique.** Elle empile dans un même scroll : type de révolte, sélecteurs géographiques, population, sécurité, Stella (3 cases), propagande préalable (2 tests + résultat), 4 listes de porte‑drapeaux + officiers. Pour une émeute simple « la taverne explose ce soir », on doit passer devant tout l'attirail révolution avant d'arriver au test Empathie. C'est l'écran qui se sent le plus « formulaire administratif ».
2. **Pas de notion de temps.** Les règles **sont** une mécanique chronologique (1 mois entre tentatives, 1 semaine par test, résultat à M+1, durée d'émeute en 5 min, fête en 6–10 h, Gloire ‑1/mois). L'UI ne montre **aucune** ligne de temps, aucun horodatage. Toutes les tentatives apparaissent comme « instantanées et simultanées ». C'est le plus gros décalage règle/outil.
3. **Le tracker mélange jets passés, jets en cours et jets théoriques.** Un test affiché ✅ ne dit pas quand il a été fait, par qui, ni s'il est encore valable. Pour la Révolution qui dure des mois de jeu, c'est ingérable.
4. **Pas de vue MJ vs vue joueur.** Le supplément distingue explicitement les informations cachées (Sécurité 10‑Gloire, espions, Retours de Flamme MF, coordination des délégués…) et ce que voient les insurgés. Tout est mélangé dans un éditeur unique. Un joueur qui consulte cette page voit le malus Stella, les MF Police calculés, les invités de marque... c'est un spoiler permanent.
5. **Le passage étape 0 → 1 → 2 → 3 est linéaire et unique.** Or les règles bouclent (refaire le Discours pour prolonger une émeute, recommencer un mois de prep, lancer une 2ᵉ tentative d'Appel après échec). L'outil oblige à écraser l'historique précédent.
6. **Aucune cardinalité multi‑lieux.** Une Révolution locale = plusieurs planètes en parallèle, chacune avec ses délégués, ses lieux, ses tests prep. La session courante traite tout dans une seule scope.
7. **Surcharge cognitive en étape 1 Révolution.** Sur une révolution, l'étape 1 affiche d'un bloc : contexte lieux de pouvoir + soutiens stratégiques + qualité des troupes + 4 tests prep (Recrutement, Discours, Tracts, Compréhension) + actions spéciales Secret/Tech. Un MJ qui ouvre l'écran sans connaître les règles est noyé. Les compétences associées sont dans des tooltips minuscules (`ⓘ`), pas dans le label.
8. **Boutons « Équiper / Entraîner / Planifier » trompeurs.** Ils incrémentent la qualité d'un cran d'un simple clic — pas de jet, pas de coût, pas de durée. Visuellement ils suggèrent une action triviale et anodine ; règle, ce sont des engagements de 1 mois chacun.
9. **Compteur PP global non contextuel.** « 12 PP » sur le panneau sessions ne dit rien : dépense récupérable ? sacrifice ? PP cumulés à travers plusieurs sessions ?
10. **Bouton « 🗑 supprimer session » à 4 px du bouton « 💾 sauvegarder »**, sans confirmation rouge claire. Risque d'accident.
11. **Pas de feedback de cooldown.** Rien n'empêche de relancer un test 14 fois d'affilée jusqu'au succès. Les règles imposent souvent 1 test/jour ou 1/mois.
12. **CR Markdown** : intéressant mais trop générique, ne reflète pas la chronologie ni les participants identifiés.

### 6.2 Parcours utilisateur cible (par type)

Pour guider l'UI, voici le **parcours idéal MJ** d'après les règles, sur lequel l'outil doit se calquer.

#### A. Émeute pirate (durée réelle : 1 session de jeu, ~ 1 h)
1. Création rapide (3 champs : nom, lieu, planète déduite).
2. Saisie minimale du contexte : qui sont les pirates impliqués, Stella connue ou non.
3. **Préparation (30 s sur table)** : 2 jets (Empathie, Tactique). Tracker direct.
4. **Déclenchement** : 1 jet Discours, calcul auto du nombre de tranches de 5 min et du prix du sang.
5. **Pendant l'émeute** : chronomètre live + boutons « +1 tranche de 5 min », « Progresser », « Initier », « Négocier », « Subir Police! » qui consomment MF.
6. **Fin** : récompenses PP/Wanted/morts → CR.

→ **Verdict actuel** : étapes 1 et 2 acceptables ; tout ce qui est « pendant l'émeute » est absent. L'écran 0 demande trop avant de jouer.

#### B. Révolution festive (durée réelle : 1–2 sessions)
1. Création + lieu + nombre d'invités (palier).
2. **Préparation** : 3 jets (Autorisation, Rassemblement, Préparer le lieu), + sous‑liste d'invités de marque optionnelle.
3. **Pendant la fête** : timer 6–10 h, actions parallèles (Recruter / Diffuser propa / Discuter).
4. **Appel** au moment choisi.
5. **Bilan**.

→ **Verdict** : actions « pendant la fête » et invités de marque manquants. Les bonus de palier mal appliqués.

#### C. Mutinerie (durée réelle : plusieurs jours de jeu)
C'est **un mini‑jeu de chat et souris** qui mérite sa propre UI :
1. Création + vaisseau (auto‑remplissage tonnage).
2. **Phase quotidienne** : ligne par jour. Pour chaque jour : tests des PJ (Éloquence poste / cambuse / Discrétion / Tactique), Vigilance officier (MJ caché), action « Discipliner » côté capitaine si Satisfaction baisse, recrutement passif si masse critique atteinte. Compteur de mutins cumulés.
3. Déclenchement de l'Appel au jour J choisi.
4. **Exécution** : durée en tranches de 5 min, lien éventuel vers module abordage/évasion.
5. Bilan + Wanted.

→ **Verdict** : l'écran actuel agglomère tous les jets en une seule liste sans dimension temporelle. À refondre en « journal de bord » à lignes datées.

#### D. Révolution (durée réelle : 6 mois à 2 ans de campagne)
C'est un **outil de campagne longue durée**, pas un formulaire :
1. Création + portée (planétaire/locale/stellaire).
2. **Si locale/stellaire** : assistant qui crée une session enfant par planète (ou par système si stellaire) et lie au parent.
3. **Reconnaissance** (phase 0) : workflow d'identification des lieux de pouvoir.
4. **Préparation mensuelle** :
   - Page « mois en cours » qui montre : tentative restante, alliés sollicitables ce mois, délégués actifs, sections recrutées ce mois, dépense Ø.
   - Bouton « passer au mois suivant » qui consomme la date du calendrier, applique ‑1 Gloire aux PJ présents, déclenche le recrutement passif, révèle les résultats des tests M‑1.
   - Vue historique « mois passés » en accordéon.
5. **Insurrection générale** (stellaire) : panneau dédié avec progression par quadrant.
6. **Exécution** : assauts en parallèle par lieu, sous‑étapes ordonnées.
7. **Célébration + Contre‑Révolution** : 2 sections distinctes.

→ **Verdict** : l'écran actuel est **insuffisant pour une vraie campagne**. Il faut clairement passer d'un « formulaire » à un « tableau de bord temporel ».

### 6.3 Recommandations graphiques

**Niveau 1 — Quick wins (sans refonte) :**

- **Découper l'étape 0** en deux onglets internes : *« Identité »* (nom, type, lieu) et *« Cast »* (Stella, propagande, porte‑drapeaux). Réduit le scroll d'accueil de ~70 %.
- **Sortir les compétences des tooltips et les mettre en sous‑label** sous le nom du test (ex. `Tactique  ·  diff 3  ·  Tonneau de Stratégie p.X`). Le `ⓘ` reste pour la règle complète.
- **Étiqueter les tests réservés** : badge `(PD)` ou `(Officier)` à côté du nom, avec sélecteur « Lancé par : … » qui filtre la liste de PD/officiers selon le badge.
- **Confirmation rouge** sur le bouton 🗑 (dialog modal). Espacer du bouton 💾.
- **Compteur PP qualifié** : `12 PP (8 dépense, 4 sacrifice)`. Tooltip listant le détail.
- **Boutons « Équiper / Entraîner / Planifier »** : leur ajouter un picto cadenas ⏳ et un sous‑texte `1 mois · test requis` ; au clic, ouvrir un mini‑modal avec le jet correspondant et un compteur de durée.
- **Bandeau MJ en haut** quand le rôle est MJ : background `--gold-glow` et badge ⚙ « Vue MJ ». Ça lève l'ambiguïté.
- **Glossaire flottant** (bouton `?` fixé en bas à droite) listant TF / +1d / D+1 / TD / sc / SC / FF MF / etc. Source : OCR.

**Niveau 2 — Refactor UX moyen :**

- **Mode MJ / Mode joueur** : toggle en haut. Mode joueur masque Sécurité chiffrée, MF, espions, alertes ; affiche uniquement « tu sais que… ». Stocker un champ `visibility` par session (réutiliser `visibility_rules` déjà en place pour l'itinéraire).
- **Vue « Journal »** pour Mutinerie et Révolution : tableau chronologique au lieu d'une checklist. Une ligne = un jour (ou un mois), colonnes = actions ; le scroll devient horizontal/historique au lieu de top‑down.
- **Layout assaut révolution** : passer la liste des lieux de pouvoir en colonnes type « kanban » (Reconnu → Atteint → Entré → Dirigeant face‑à‑face → Capitulé). Chaque lieu est une carte qu'on fait glisser à l'étape suivante après le test correspondant.
- **Carte intégrée** (Révolution locale/stellaire) : embed du composant carte_interactive pour visualiser les systèmes/planètes en révolte. Code couleur : neutre / en préparation / en exécution / libéré.
- **Sous‑sessions liées** (Révolution locale → planète) : afficher un sélecteur d'enfants en haut de la session parent.

**Niveau 3 — Vision long terme :**

- **Vraie « campagne de révolte »** : un nœud agrégateur (table `revolte_campaign`) qui regroupe émeutes, fêtes, mutineries et révolution d'un même contexte narratif, sur la chronologie de la campagne, avec un fil d'événements croisés (« émeute du 3 mars → +1d Discours de rue du mois suivant »).
- **Intégration calendrier bidirectionnelle** : les jets de Révolte créent des entrées dans `calendrier.html` (date, type, résultat). Avancer le calendrier déclenche les tests M‑1 cachés.
- **Tableau de bord global Révoltes** sur le dashboard MJ : carte de chaleur des planètes en agitation.

### 6.4 Priorité visuelle conseillée

Dans l'ordre d'impact sur l'utilité de l'outil pour le MJ :

1. Bandeau Mode MJ / Mode joueur + sortie spoilers (haut effort/impact car élargit l'audience aux joueurs).
2. Compétence en sous‑label des tests + badge (PD).
3. Découpe Étape 0 en onglets.
4. Vue Journal chronologique pour Mutinerie.
5. Kanban assaut pour Révolution.
6. Compteur PP dépense/sacrifice.
7. Bandeau temps / mois en cours pour Révolution.
8. Confirmation suppression + espacement boutons.
9. Glossaire flottant.
10. Sous‑sessions parent/enfant pour scope locale/stellaire.

---

## 7. Synthèse exécutive

L'outil actuel est un **bon prototype de formulaire** mais reste **éloigné des règles** sur trois axes structurants : (1) il ignore la dimension temporelle qui est l'âme du système, (2) il ne distingue pas MJ et joueurs, (3) il traite la Révolution comme une émeute en plus gros au lieu d'un outil de campagne. Les corrections de bugs (Lot A) et l'ajout des mécaniques manquantes (Lot B) sont **nécessaires mais pas suffisants** : sans la refonte UX/temporelle proposée en §6, l'outil restera une checklist au lieu d'un tableau de bord. Recommandation : exécuter **Lot A + quick wins §6.3 niveau 1** en première itération (rapide, gros effet de surface), puis attaquer **Lot B + refactor §6.3 niveau 2** pour la Révolution.
