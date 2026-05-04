---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments: ['docs/index.md', 'docs/project-overview.md', 'docs/architecture.md', '_bmad-output/project-context.md']
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 4
classification:
  projectType: 'Web App (extensible) — MPA + REST API'
  domain: 'Collaborative Campaign Management (tabletop RPG)'
  complexity: 'Medium (risque exécution élevé : solo dev, exposition internet)'
  projectContext: 'brownfield'
  prd1Scope:
    - 'Auth centralisée : 2 rôles (mj/joueur) + flag is_admin, protect-by-default'
    - 'Visibilité whitelist par joueur (player_id nullable), cascade descendante, bulk toggles'
    - 'Header unifié : table selector + navigation outils'
    - 'Décomposition itinéraire en 4 outils (après audit dépendances)'
    - 'Dashboard post-login par rôle + état zéro table géré'
    - 'Migration en 4 phases (backup, chaque phase = état fonctionnel, scope de repli)'
    - 'Admin reset mot de passe (manuel)'
  deferred:
    - 'Fork MJ des données globales (architecture prévue, pas livré PRD #1)'
    - 'Jour actuel du jeu dans header (PRD #3 - Calendrier)'
  principles:
    - 'Protéger expérience de jeu'
    - 'Réduire risque erreur'
    - 'Résultat tangible rapidement'
  robustness:
    - 'Protect-by-default : toute route protégée sauf whitelist explicite'
    - 'Cascade descendante : parent caché = enfants cachés'
    - 'Audit avant extraction : inventaire dépendances dans les 160K'
    - 'Serveur-side first : ne pas se fier au masquage CSS pour la sécurité'
    - 'Backup avant chaque phase + scope de repli si bloqué'
    - 'État zéro toujours valide : zéro table, zéro données = message clair'
  visibilityModel: 'whitelist (tout caché par défaut, MJ révèle explicitement)'
  vision:
    statement: "Metal Adventures est un outil de gestion de campagne qui centralise personnages, systèmes et données narratives en un seul endroit, permettant au MJ de retrouver, relier et exploiter l'ensemble de sa campagne sans effort. Structuré comme un graphe de campagne — un tableau d'enquête où chaque entité est reliée aux autres — chaque outil est une vue sur ce graphe. La carte interactive en est le point d'entrée naturel."
    differentiator: "Les outils existants (Kanka, Notion, World Anvil) sont des cahiers vides — ils ne connaissent pas le jeu. Metal Adventures pense comme un MJ de MA : périls, factions, voyages spatiaux et bestiaire sont des mécaniques natives. Les données forment deux couches — le livre de règles (univers MA, partagé) et le carnet de bord (campagne, propre à la table). La visibilité MJ/joueur est un levier de narration : le MJ contrôle le rythme des révélations."
    insight: "itinéraire.html a prouvé que l'automatisation de mécaniques de jeu libère la narration. Ce succès valide l'approche pour les autres douleurs."
    tripleTemporality: "Préparation (avant séance) + Compagnon (pendant séance) + Mémoire (entre séances)"
    dataLayers: "Livre de règles (univers MA, global) vs Carnet de bord (campagne, par table)"
    visibilityAsNarrative: "La visibilité n'est pas une contrainte de sécurité — c'est un levier de narration. Le MJ contrôle le rythme des révélations."
    mapAsEntryPoint: "La carte interactive est le point d'entrée naturel du graphe de campagne"
    graphFoundations: "PRD #1 doit poser les fondations du graphe (table entity_links) pour que chaque PRD suivant l'enrichisse"
  prd1Tools:
    - 'Carte interactive'
    - 'Dashboard MJ (hub actions rapides)'
    - 'Itinéraire'
    - 'Compendium'
  successCriteria:
    - 'MJ peut préparer et jouer une session complète sans ouvrir Excel/HTML legacy'
    - 'Joueurs consultent carte et compendium en autonomie pendant la partie'
  dashboardMJ: 'Hub actions rapides : révéler une planète, lancer un événement, noter. Toggle session active change les priorités visuelles.'
  migrationStrategy: 'Squelette technique + migration complète des données = remplacement day-one des fichiers legacy. Strangler Fig Pattern. Audit monolithe avant schema freeze.'
  extractionOrder:
    - 'Phase 0 : js/shared/* (auth, header, table-context, ui-helpers, data-fetchers) + smoke tests'
    - 'Phase 1 : Compendium (le plus découplé)'
    - 'Phase 2 : Carte interactive'
    - 'Phase 3 : Dashboard MJ (nouvelle feature)'
    - 'Phase 4 : Itinéraire résiduel (coeur du monolithe)'
  technicalPrereqs:
    - 'Audit du monolithe (cartographie relations implicites) — 2h'
    - 'Schema freeze (valider 13 tables + entity_links)'
    - '10 smoke tests Playwright sur état actuel'
  uxPriorities:
    - 'Reveal sous pression : MJ en session < 3s de la pensée à action'
    - 'Autonomie joueur : carte/compendium cherchables sans aide MJ'
    - 'Dashboard deux vitesses : toggle session active masque le bruit'
  accessMatrix:
    itineraire: { mj: 'édition', joueur: 'lecture + générer routes' }
    carte_systemes: { mj: 'édition', joueur: 'consultation (systèmes visibles)' }
    navires: { mj: 'édition', joueur: 'consultation (connus)' }
    perils: { mj: 'édition', joueur: 'aucun accès' }
    gestion_systemes: { mj: 'édition', joueur: 'aucun accès' }
---

# Product Requirements Document - Metal Adventures

**Author:** Crepe
**Date:** 2026-04-19

## Executive Summary

Metal Adventures est un outil de gestion de campagne pour le jeu de rôle sur table Metal Adventures, auto-hébergé sur NAS personnel. Il centralise personnages, systèmes solaires, vaisseaux et données narratives en un seul endroit, permettant au MJ de retrouver, relier et exploiter l'ensemble de sa campagne sans effort.

L'outil est structuré comme un graphe de campagne : chaque entité (PNJ, système, vaisseau, événement) est un nœud relié aux autres. Quatre outils — Carte interactive, Dashboard MJ, Itinéraire et Compendium — sont des vues sur ce graphe. La carte interactive en est le point d'entrée naturel.

L'outil sert en trois temps : **préparation** (le MJ construit et configure avant la séance), **compagnon** (actions rapides et révélations en session), **mémoire** (le MJ et les joueurs consultent l'état de la campagne entre les séances).

**Utilisateurs cibles :** un MJ (admin, créateur de contenu, contrôle total) et 3-5 joueurs (consultation des informations révélées par le MJ). Accessible via navigateur sur réseau local et internet (DuckDNS).

**Problèmes résolus :**
- Préparation chronophage (création PNJ, impression de fiches, consultation de sources éparses)
- Perte d'état du jeu entre les séances (paramètres de révolte, situation des personnages, notes insuffisantes)
- Interruption narrative pendant les séances (jets de périls manuels — déjà résolu par itinéraire.html)
- Dépendance à des outils génériques (Notion, Kanka) qui ne connaissent pas les mécaniques du jeu

### What Makes This Special

Les outils existants (Kanka, Notion, World Anvil) sont des cahiers vides — ils ne connaissent pas le jeu. Metal Adventures intègre nativement les mécaniques du jeu : périls, factions, voyages spatiaux, modèles de vaisseaux. Les données forment deux couches : les **données univers** (systèmes, factions, modèles de vaisseaux — partagées, issues du jeu de base) et les **données campagne** (vaisseaux, itinéraires, visibilité, état du jeu — propres à chaque table de jeu).

La visibilité MJ/joueur est un levier de narration : tout est masqué par défaut (whitelist), le MJ révèle les informations à ses joueurs au rythme de l'histoire. Un clic suffit pour rendre un système visible, un PNJ connu, une faction dévoilée. La cascade descendante garantit la cohérence : un système masqué cache automatiquement tout ce qu'il contient.

Le succès d'itinéraire.html (automatisation des jets de périls) a validé l'approche : automatiser les mécaniques de jeu libère le MJ pour la narration. Le PRD #1 étend ce principe à l'ensemble de la plateforme.

## Project Classification

| Critère | Valeur |
|---|---|
| **Type de projet** | Web App (extensible) — MPA + REST API |
| **Domaine** | Gestion collaborative de campagne JdR (Metal Adventures) |
| **Complexité** | Medium (risque exécution élevé : solo dev, pas de CI/CD, exposition internet) |
| **Contexte** | Brownfield — monolithe itinéraire.html (160K) à restructurer |
| **Stack** | Node.js, Express, SQLite (better-sqlite3), vanilla JS, Tailwind CSS (bundlé localement) |
| **Hébergement** | Container Docker sur NAS personnel, accessible DuckDNS |
| **Utilisateurs** | 1 MJ + 3-5 joueurs (usage privé) |

## Success Criteria

### User Success

**MJ (Crepe) :**
- Avant la séance : préparer les éléments de la session (systèmes, PNJ, visibilité) sans ouvrir de fichier externe (Excel, HTML statique, Notion)
- Au lancement de la séance : le Dashboard MJ affiche les raccourcis vers les éléments importants préparés
- Pendant la séance : révéler une information aux joueurs en < 3 secondes (recherche → toggle → visible)
- Entre les séances : retrouver l'état complet de la campagne sans dépendre de notes papier

**Joueurs (3-5 amis) :**
- Accéder au menu des outils et à la carte interactive en autonomie
- Consulter les systèmes, factions et données visibles sans demander au MJ
- Aucune action requise pour se mettre à jour — les révélations du MJ apparaissent automatiquement

### Business Success

Projet hobby personnel — pas de métriques de revenus ou de croissance.

- **Adoption :** Crepe utilise l'outil comme unique source de vérité pour ses séances (zéro fichier legacy en parallèle)
- **Rétention joueurs :** les joueurs consultent spontanément la carte entre les séances
- **Motivation dev :** chaque phase de migration livre un résultat visible et utilisable, maintenant la motivation du solo dev

### Technical Success

- **Sécurité :** authentification JWT solide, aucune donnée joueur exposée sans auth, protect-by-default sur toutes les routes API
- **Performance :** chaque page charge en < 2 secondes sur réseau local
- **Intégrité des données :** zéro perte de données pendant les migrations. Backup avant chaque phase
- **Disponibilité :** l'outil fonctionne de manière fiable sur le NAS personnel (pas de SLA, mais pas de crash récurrent)

### Measurable Outcomes

| Métrique | Cible | Méthode de vérification |
|---|---|---|
| Remplacement legacy | 100% des fichiers HTML/Excel remplacés | Aucun fichier legacy utilisé en séance |
| Reveal sous pression | < 3 secondes | Test manuel en conditions de jeu |
| Temps de chargement | < 2s par page (réseau local) | Mesure navigateur |
| Sécurité API | 0 route non-protégée exposée | Audit des routes Express |
| Migration sans perte | 0 donnée perdue | Script de validation JSON source vs DB |

## Product Scope

### MVP — Minimum Viable Product

Fondations obligatoires, sans lesquelles rien ne se déploie :

1. **Auth centralisée** — 2 rôles (mj/joueur) dans `table_members`, flag `is_admin` dans `users`, protect-by-default
2. **Visibilité whitelist** — toggle individuel par entité + bulk par catégorie, cascade descendante, `player_id` nullable dans `visibility_rules`
3. **Migration des données** — données existantes (JSON, SQLite) migrées vers le schéma validé. Chaque phase = état fonctionnel + backup
4. **Extraction couche partagée** — `js/shared/*` (auth, header, table-context, ui-helpers) + header unifié

### PRD #1 Complet — Les 4 outils

Livrés après les fondations MVP, dans l'ordre :

1. **Compendium** — référence univers consultable (systèmes, factions, données de jeu). Le plus découplé du monolithe.
2. **Carte interactive** — vue géographique du graphe, point d'entrée joueur. Systèmes visibles affichés avec données accessibles.
3. **Dashboard MJ** — hub d'actions rapides. Toggle "session active", raccourcis, reveal rapide, gestion visibilité.
4. **Itinéraire** — route planning, ship management, périls. Le cœur du monolithe existant, simplifié après extraction.

### Growth Features (Post-PRD #1)

- **PRD #2 — Entity Links + Personnages (LIVRÉ 2026-04-29) :** entity_links graphe, fiches PJ interactives (santé/PP/Gloire/Énergie X), PNJ nommés, Catalogue Figurants, Metal Faktor Pool tracker — Epics 7-11
- **PRD #3 — Calendrier galactique :** gestion temporelle, jour actuel du jeu dans le header, journal automatique d'événements
- **PRD #4 — Bestiaire avancé & Vaisseaux de campagne :** fiches vaisseaux liées au graphe, générateur de personnages, arbre généalogique PNJ

### Vision (Futur)

- Notes de campagne intégrées (remplacement Notion)
- Actions joueur asynchrones (déplacements, achats entre séances)
- Dashboard contextuel adaptatif (prép/séance/mémoire)
- Export/import complet de campagne (archivage, résilience)
- Fork MJ des données globales (chaque MJ personnalise l'univers)

## User Journeys

### Parcours 1 — Crepe, MJ : Préparation de séance (happy path)

Samedi matin. La séance est ce soir. Crepe ouvre le Dashboard MJ sur son PC. Il voit ses raccourcis : la révolte en cours dans le système Kepler, les 3 PNJ qu'il a créés cette semaine, les systèmes encore masqués.

Il clique sur le système "Procyon" — les joueurs ont annoncé vouloir y aller. Il vérifie les données : factions, corps célestes, patrouilles. Tout est en place. Il active la visibilité "position seule" pour les joueurs — ils verront que Procyon existe sur la carte, mais pas les détails.

Il ouvre l'Itinéraire et prépare une route depuis le dernier système visité. Les tables de périls sont configurées. Il note mentalement "si les joueurs prennent la route longue, il y aura 3 jours de voyage et donc 3 jets de périls".

**Résultat :** 20 minutes de préparation. Pas d'Excel ouvert, pas de Notion consulté. Tout est dans l'outil.

**Capacités révélées :** Dashboard avec raccourcis MJ, édition de systèmes, gestion visibilité par niveau, préparation itinéraire, tables de périls.

### Parcours 2 — Crepe, MJ : En séance sous pression (edge case)

Vendredi soir. Les joueurs décident d'ignorer Procyon et de foncer vers Exxalia — un système que Crepe avait prévu de révéler dans 3 séances. Il a 10 secondes avant que le silence devienne gênant.

Il ouvre le Dashboard, tape "Exxalia" dans la recherche rapide. Le système apparaît. Un clic : visibilité activée pour les joueurs. Immédiatement, Exxalia apparaît sur leur carte.

Les joueurs voient la position mais pas les détails. Crepe fait mine de consulter ses notes (il consulte la fiche système dans l'outil) et improvise. Pendant qu'il narre, il toggle la visibilité des factions présentes à Exxalia — une par une, au rythme de l'histoire.

Un joueur demande "c'était quoi comme planètes dans ce système ?". Crepe ouvre la fiche système, révèle les corps célestes visibles. Le joueur voit l'info apparaître sur sa carte sans refresh.

**Résultat :** Situation improvisée gérée en < 30 secondes. Les joueurs n'ont pas vu la sueur.

**Capacités révélées :** Recherche rapide, reveal en un clic sans confirmation, visibilité granulaire (position vs détails vs factions), mise à jour joueur via short polling (< 5s).

### Parcours 3 — Théo, joueur : Consultation entre les séances

Mardi soir. Théo, un des joueurs, repense à la séance de vendredi. "On devait aller à Procyon ou Exxalia déjà ? Et c'était quelle faction qui contrôlait ce secteur ?"

Il ouvre l'outil sur son téléphone, se connecte. Le menu s'affiche : Carte, Compendium. Il ouvre la Carte interactive. Il voit les systèmes que le MJ a révélés — les systèmes non-révélés apparaissent comme des silhouettes mystérieuses (fog of war). Il clique sur Exxalia, voit les infos accessibles : position, factions visibles, corps célestes révélés.

Il ouvre le Compendium pour vérifier la description de la faction OCG. Trouve l'info en 3 secondes. Il tape "Kepler" dans la recherche — aucun résultat. L'outil ne confirme pas l'existence de données cachées (plausible deniability).

**Résultat :** Théo a retrouvé ses repères en 2 minutes, sans déranger Crepe. À la prochaine séance, il sera à jour.

**Capacités révélées :** Accès mobile responsive, carte avec fog of war, compendium consultable, auth joueur persistante, plausible deniability en recherche.

### Parcours 4 — Crepe, admin : Première installation et migration

Dimanche après-midi. Crepe vient de déployer la nouvelle version sur son NAS. Il ouvre l'outil pour la première fois.

Il se connecte — premier utilisateur inscrit = auto-admin + MJ. Il crée sa table de jeu "Campagne Pirate". L'outil lui propose d'importer les données existantes. Il lance la migration : `quadrants_MA.json` → systèmes, `perils_data.json` → tables de périls, données SQLite existantes → vaisseaux et modèles.

Un rapport de validation s'affiche : "108 systèmes importés, 29 modèles de vaisseaux, 7 factions. 3 entrées avec coordonnées invalides — ignorées (détail disponible)." Import partiel réussi avec rapport d'erreurs.

Il invite ses joueurs : envoie les identifiants, ils se connectent, ils voient un empty state narratif : "L'univers vous attend. Votre première mission approche." Crepe ouvre le bulk reveal : sélectionne le quadrant Alpha, active "position seule" pour tous les systèmes connus. 27 systèmes apparaissent sur la carte des joueurs d'un coup.

**Résultat :** Migration complète en 15 minutes. L'ancien `itineraire.html` peut être archivé.

**Capacités révélées :** Auto-attribution admin/MJ au premier inscrit, import partiel avec rapport d'erreurs, empty state narratif joueur, bulk reveal par quadrant, état zéro valide.

### Parcours 5 — Théo, joueur : En séance (réception de reveal)

Vendredi soir, la séance bat son plein. Les joueurs annoncent qu'ils se dirigent vers Exxalia. Crepe révèle le système (parcours 2). Théo a la carte ouverte sur son téléphone.

3 secondes plus tard, Exxalia apparaît sur sa carte — une nouvelle étoile surgit du brouillard de guerre. Il clique dessus : "Système Exxalia — Quadrant OCG". Pas encore de détails sur les planètes, pas de factions affichées. Juste le nom et la position.

Crepe continue de narrer. Il révèle la faction dominante. Sur l'écran de Théo, l'info se met à jour sans refresh : "Faction : Syndicat" apparaît dans la fiche du système. Théo consulte le Compendium pour en savoir plus sur le Syndicat — la fiche existe, il la lit en silence pendant que Crepe continue l'histoire.

Aucune interruption. Le MJ narre, l'outil confirme visuellement.

**Capacités révélées :** Short polling (mise à jour < 5s), fog of war (systèmes cachés = mystérieux, pas absents), mise à jour incrémentale sans refresh, compendium accessible en parallèle.

### Parcours 6 — Crepe, MJ : Erreur et résilience

Vendredi soir. Crepe clique trop vite et révèle le système Kepler — la révolte secrète que les joueurs ne devaient pas voir. Panique.

Il voit un discret bandeau "Kepler révélé — Annuler (5s)". Il clique Annuler. Kepler redevient masqué. Le polling joueur n'a pas encore récupéré le changement — aucun joueur n'a vu.

Plus tard dans la soirée, le Wi-Fi du salon décroche 30 secondes. Les joueurs voient sur leur carte un petit indicateur "Connexion perdue" en orange. Quand le réseau revient, le polling reprend automatiquement et la carte se resynchronise. Côté MJ, l'outil a fonctionné en mode optimistic UI pendant la coupure — ses clics ont été enregistrés localement et envoyés dès le retour réseau.

**Capacités révélées :** Undo reveal avec grace period (5s), indicateur de connexion joueur, optimistic UI côté MJ, resynchronisation automatique, aucune perte de données.

### Journey Requirements Summary

| Parcours | Capacités clés révélées |
|---|---|
| **MJ Préparation** | Dashboard raccourcis, édition systèmes, gestion visibilité par niveau, préparation itinéraire |
| **MJ En séance** | Recherche rapide, reveal 1-clic, visibilité granulaire, short polling joueur |
| **Joueur Consultation** | Mobile responsive, carte fog of war, compendium cherchable, plausible deniability |
| **Admin Migration** | Auto-admin, import partiel + rapport, empty state narratif, bulk reveal |
| **Joueur En séance** | Short polling < 5s, fog of war dynamique, mise à jour incrémentale, compendium parallèle |
| **MJ Erreur/Résilience** | Undo reveal 5s, indicateur connexion, optimistic UI, resync automatique |

### Patterns UX transversaux

| Pattern | Description | Parcours |
|---|---|---|
| **Undo reveal** | Grace period 5s après reveal, bandeau discret | 1, 2, 6 |
| **Voir comme joueur** | MJ peut prévisualiser ce qu'un joueur voit | 1 |
| **Fog of war** | Systèmes cachés = silhouettes mystérieuses, pas vide | 3, 5 |
| **Plausible deniability** | Recherche joueur ne confirme jamais l'existence de données cachées | 3 |
| **Empty state narratif** | Zéro donnée = message thématique, pas placeholder technique | 3, 4 |
| **Optimistic UI** | Actions MJ instantanées, sync en arrière-plan | 2, 6 |
| **Import partiel** | Import tolère les erreurs, rapport détaillé | 4 |
| **Confirmation légère** | Long-press ou swipe, pas modale bloquante | 1, 2 |

## Domain-Specific Requirements

### Intégrité narrative

- **Protect-by-default (whitelist).** Toute fuite de visibilité = scénario irréversiblement compromis. C'est la contrainte #1 du domaine — équivalent d'une fuite de données sensibles, mais sans recours possible.
- **Point de vigilance futur :** extensions de secrets au-delà des entités visibles (notes MJ, événements planifiés, statistiques cachées). À anticiper dans l'architecture même si hors scope PRD #1.

### Contexte d'utilisation en séance

- **MJ sous pression sociale** — les joueurs attendent. Chaque action doit être < 3 secondes, chaque action réversible.
- **Joueurs sur mobile** en séance, **PC ou mobile** hors séance.
- **Zéro notification sonore** — le MJ narre, l'outil ne doit jamais interrompre par du son.
- **Wi-Fi domestique potentiellement instable** — indicateur de connexion côté joueur + resynchronisation automatique au retour réseau.

### Données et souveraineté

- **Contenu 100% custom** — aucune contrainte de licence ou copyright sur les données de jeu.
- **Hébergement NAS personnel** via DuckDNS — pas de dépendance cloud tiers, souveraineté totale.
- **Backup = responsabilité utilisateur** — chaque phase de migration produit un backup. Pas de backup automatique cloud.

## Web App Specific Requirements

### Architecture

- MPA (Multi-Page Application) avec REST API. Pages séparées par outil (compendium, carte, itinéraire, dashboard).
- Couche partagée `js/shared/*` : auth, header, table-context, ui-helpers. Rupture assumée avec le pattern tout-inline actuel — le project-context sera mis à jour en conséquence.
- Modules ES natifs (`<script type="module">`) pour le chargement de la couche partagée. `api.js` à réécrire en `export` lors de la migration.

### Browser Support

- Navigateurs modernes uniquement : Chrome, Firefox, Opera, Safari, Edge (dernières 2 versions).
- Pas de support IE ou navigateurs legacy.

### HTTPS

- HTTPS obligatoire via Let’s Encrypt (renouvellement automatique). DuckDNS pour le DNS dynamique. Certificat TLS requis pour la sécurité des cookies JWT httpOnly.

### Responsive Design

- Mobile-first pour les vues joueur (carte, compendium) — usage principal en séance sur téléphone.
- Desktop-first pour les vues MJ (dashboard, édition) — préparation sur PC.
- Un breakpoint principal à 768px (mobile/desktop). Ajustement secondaire optionnel à 480px pour petits écrans.
- Touch targets ≥ 44px sur toutes les interfaces mobiles. Espacement minimum 8px entre cibles tactiles adjacentes. Listes : zone de tap pleine largeur.
- Carte interactive : utilisable en portrait (scroll/zoom) ET en paysage (vue élargie). Bouton « recentrer » visible en permanence. Pas de verrouillage d’orientation.

### Dark Mode

- Thème sombre par défaut sur mobile (séances en soirée, lumière tamisée). Thème clair par défaut sur desktop. Basculable par l’utilisateur.

### Performance Targets

- First Meaningful Paint < 2s sur réseau domestique (hors cold start NAS après inactivité prolongée). Voir NFR1-NFR5 pour les cibles mesurables complètes.
- Tailwind CSS bundlé localement (pas de CDN) — zéro dépendance internet pour les styles.
- Cache-Control explicite : `public, max-age=86400` sur assets statiques (JS/CSS/images), `no-store` sur les réponses `/api/*`. Invalidation par query string versionnée (`api.js?v=1.2`).

### Polling

- Full state polling, intervalle 3-5s. Payload = données de la table active uniquement (quelques Ko pour 4-5 utilisateurs).
- Endpoint dédié `/api/data/t/:tid/poll`. Endpoint `/api/health` pour l’indicateur de connexion.
- Delta polling reporté — YAGNI pour le volume de données actuel.

### États de connexion (joueur)

- Connecté : rien de visible.
- Polling échoué ×2 : bandeau discret « Synchronisation… » (ambre).
- Déconnecté : bandeau persistant « Hors ligne — données possiblement obsolètes » + bouton Réessayer.
- Resync réussi : flash vert bref « À jour » puis disparition.

### Feedback de reveal (joueur)

- Éléments nouvellement révélés : animation d’apparition subtile (fade-in / highlight temporaire) pour attirer l’attention du joueur.

### SEO

- Aucun — application privée derrière authentification.

### Accessibilité

- Minimum pragmatique : contraste WCAG AA sur texte principal, touch targets ≥ 44px, pas de dépendance au hover, texte ≥ 14px mobile, labels sur les inputs de formulaire, focus visible.
- Pas de conformité WCAG formelle. Pas d’ARIA avancé.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approche :** MVP plateforme — fondations minimales puis outils incrémentaux. Chaque phase = état fonctionnel + backup.
**Ressource :** 1 dev + agents IA. Pas d’estimation de temps — livraison incrémentale.
**Filet de sécurité :** La carte interactive existante reste utilisable en backup pendant toute la durée de développement.

### Phase 0 — Fondations (pré-requis premier outil)

**DoD :** Un utilisateur peut se connecter en HTTPS, voir un header unifié, et les pages existantes sont protégées par auth.

Séquence de build :

| Ordre | Tâche | Parallélisable |
|---|---|---|
| 0.1 | HTTPS (Let’s Encrypt + DuckDNS) | Oui |
| 0.2 | Tailwind local (CLI, `css/tailwind.css` commité) | Oui |
| 0.3 | Migration DB : `updated_at` sur tables principales, `player_id` nullable sur `visibility_rules` | Oui |
| 0.4 | Extraction `js/shared/*` en ES modules : `auth-ui.js`, `header.js`, `fetch-client.js`, `table-selector.js` | Oui |
| 0.5 | Conversion `js/api.js` IIFE → ES module export | Après 0.4 |
| 0.6 | Auth centralisée + rôles (JWT cookies Secure + httpOnly) | Après 0.4, 0.5 |
| 0.7 | Visibilité whitelist + cascade descendante (logique serveur) | Après 0.3, 0.6 |
| 0.8 | Auth-guard sur pages existantes (itinéraire, carte) — protection accès sans migration interne | Après 0.6 |
| 0.9 | Polling client `js/shared/poller.js` + endpoint `/api/data/t/:tid/poll` + `/api/health` | Après 0.5 |
| 0.10 | Smoke tests Playwright sur état post-migration | Dernier |

**Reporté :** `entity_links` → Phase 2 (pas de consommateur réel avant la carte).

### Phase 1 — Compendium

**DoD :** Un joueur connecté peut consulter les systèmes, factions et données de l’univers visibles pour lui, sur mobile.

- Référence univers en lecture (systèmes, factions, modèles de vaisseaux, données de jeu)
- Visibilité par rôle appliquée (whitelist + cascade)
- Recherche textuelle (`UNION ALL` + `LIKE`)
- Mobile responsive, dark mode par défaut
- Polling : données mises à jour sans refresh quand le MJ change la visibilité
- Fog of war sur les données non révélées (plausible deniability)

### Phase 2 — Carte interactive

**DoD :** La carte existante est remplacée par une version intégrée au système (auth, visibilité, polling, fog of war).

- Intégration dans le nouveau système (auth, shared layer, visibilité)
- Fog of war visuel (systèmes cachés = silhouettes)
- Reveal feedback (animation d’apparition pour les joueurs)
- Portrait + paysage, bouton recentrer
- Table `entity_links` conçue et implémentée ici (besoin concret)

### Phase 3 — Dashboard MJ

**DoD :** Le MJ peut gérer la session depuis un écran unique — recherche rapide, reveal, toggle visibilité.

- Hub d’actions rapides (toggle session active, raccourcis, reveal)
- Recherche rapide toutes entités
- Gestion visibilité bulk + individuelle
- Vue « comme joueur » (prévisualisation)
- Undo reveal (grace period 5s)

### Phase 4 — Itinéraire (migration monolithe)

**DoD :** L’itinéraire fonctionne sans localStorage, multi-utilisateur sur la même table, via API.

- Strangler Fig : migration progressive des fonctions du monolithe
- Route planning, ship management, périls — via API
- Suppression de la dépendance localStorage
- Archivage de l’ancien `itineraire.html`

### Risk Mitigation

| Risque | Mitigation |
|---|---|
| Phase 0 trop longue → rien ne ship | 0.1-0.4 parallélisables. Filet = carte existante. AI-assisted dev. |
| Fuite narrative (itinéraire sans auth) | Auth-guard dès Phase 0.8 sans migrer le monolithe |
| Cascade visibilité mal implémentée | Logique serveur Phase 0.7, pas juste la table. Tests E2E. |
| Migration monolithe (Phase 4) | Dernière phase. Strangler Fig progressif. Backup chaque étape. |
| `entity_links` mal conçu | Reporté à Phase 2 — design quand le besoin est concret. |

## Functional Requirements

### Gestion des utilisateurs

- **FR1 :** Un visiteur peut créer un compte (le premier inscrit devient automatiquement admin + MJ)
- **FR2 :** Un utilisateur peut se connecter et rester authentifié entre les sessions (cookie persistant)
- **FR3 :** Un utilisateur peut se déconnecter
- **FR4 :** Un admin peut attribuer les rôles MJ ou joueur aux membres d’une table

### Gestion des tables de jeu

- **FR5 :** Un MJ peut créer une table de jeu
- **FR6 :** Un MJ peut inviter des joueurs à rejoindre sa table
- **FR7 :** Un utilisateur connecté peut sélectionner la table active parmi celles auxquelles il appartient
- **FR8 :** Le contexte de table (données affichées, permissions) est automatiquement appliqué à toutes les pages

### Visibilité et révélation

- **FR9 :** Un MJ peut activer ou désactiver la visibilité d’une entité pour les joueurs (toggle individuel)
- **FR10 :** Un MJ peut activer la visibilité en masse par catégorie ou par zone (bulk reveal)
- **FR11 :** La visibilité suit une cascade descendante — une entité cachée entraîne la non-visibilité de ses enfants
- **FR12 :** Un MJ peut annuler un reveal accidentel dans un délai de grâce (undo reveal)
- **FR13 :** Un joueur ne voit que les entités explicitement rendues visibles pour lui (protect-by-default)
- **FR14 :** Un MJ peut prévisualiser ce qu’un joueur voit (vue « comme joueur »)
> **Clarification granularité :** chaque type d'entité (système, faction, corps céleste, PNJ…) possède son propre toggle de visibilité. Rendre un système visible affiche sa position sur la carte, mais ses enfants (factions, corps célestes) restent masqués tant qu'ils ne sont pas révélés individuellement. La cascade descendante (FR11) agit uniquement en masquage : cacher un parent cache ses enfants, mais révéler un parent ne révèle pas ses enfants. Ce modèle binaire par entité + hiérarchie produit la granularité « position seule vs détails » décrite dans les parcours utilisateurs.
### Compendium (référence univers)

- **FR15 :** Un joueur peut consulter les systèmes, factions, modèles de vaisseaux et données de jeu visibles pour lui
- **FR16 :** Un utilisateur peut rechercher des entités par texte dans le compendium
- **FR17 :** La recherche d’un joueur ne confirme jamais l’existence de données cachées (plausible deniability)
- **FR18 :** Un MJ peut éditer les données du compendium (systèmes, factions, données de jeu)

### Carte interactive

- **FR19 :** Un joueur peut visualiser les systèmes visibles sur une carte géographique interactive
- **FR20 :** Les systèmes non révélés apparaissent comme des silhouettes mystérieuses (fog of war)
- **FR21 :** Un joueur peut cliquer sur un système visible pour voir sa fiche (données accessibles selon visibilité)
- **FR22 :** La carte est navigable en scroll/zoom en portrait et en paysage, avec un bouton de recentrage
- **FR23 :** Les éléments nouvellement révélés apparaissent avec une animation subtile (feedback de reveal)

### Dashboard MJ

- **FR24 :** Un MJ peut accéder à ses raccourcis et actions rapides depuis un écran unique
- **FR25 :** Un MJ peut rechercher rapidement une entité toutes catégories confondues
- **FR26 :** Un MJ peut activer/désactiver le mode « session active »
- **FR27 :** Un MJ peut gérer la visibilité individuelle et en masse depuis le dashboard

### Itinéraire

- **FR28 :** Un MJ peut planifier une route entre systèmes (route planning)
- **FR29 :** Un MJ peut gérer les vaisseaux affectés à la table (ship management)
- **FR30 :** Un MJ peut générer la liste des périls à jouer sur un trajet (sans résolution automatique)
- **FR31 :** Les données d’itinéraire sont partagées entre utilisateurs de la même table via API

### Migration et import

- **FR32 :** Un admin peut importer des données existantes (JSON, SQLite) avec un rapport de validation détaillé
- **FR33 :** L’import tolère les erreurs partielles et signale les entrées ignorées (import partiel)

### Synchronisation temps réel

- **FR34 :** Les données visibles pour un joueur se mettent à jour automatiquement sans refresh (polling)
- **FR35 :** Un joueur voit un indicateur d’état de connexion (connecté / synchronisation / hors ligne)
- **FR36 :** Les actions MJ sont appliquées immédiatement côté interface, avec synchronisation en arrière-plan (optimistic UI)
- **FR37 :** En cas de perte réseau, la resynchronisation est automatique au retour de la connexion

### États vides et onboarding

- **FR38 :** Un joueur sans données visibles voit un message thématique (empty state narratif)
- **FR39 :** Le premier accès post-installation guide l’admin vers la création de table et l’import des données

## Non-Functional Requirements

### Performance

- **NFR1 :** First Meaningful Paint < 2s sur réseau domestique (hors cold start NAS)
- **NFR2 :** Actions MJ (reveal, toggle visibilité) < 3s en perception utilisateur (optimistic UI)
- **NFR3 :** Polling joueur : intervalle 3-5s, réponse serveur < 500ms
- **NFR4 :** Recherche compendium < 1s pour ~200 entités
- **NFR5 :** Utilisateurs simultanés supportés : 5 (1 MJ + 4 joueurs) sans dégradation

### Sécurité

- **NFR6 :** HTTPS obligatoire (Let’s Encrypt + DuckDNS). Pas de trafic HTTP en clair.
- **NFR7 :** Authentification JWT dans cookies `httpOnly` + `Secure` + `SameSite=Strict`
- **NFR8 :** Protect-by-default : toute entité est invisible aux joueurs sauf reveal explicite par le MJ. Aucune fuite possible via API (filtrage serveur, pas client).
- **NFR9 :** Mots de passe hashés (bcrypt). Pas de stockage en clair.
- **NFR10 :** Les endpoints API valident le rôle et l’appartenance à la table avant toute réponse.

### Fiabilité

- **NFR11 :** Perte réseau < 60s : resynchronisation automatique sans perte de données côté MJ (optimistic UI + retry)
- **NFR12 :** Backup de la base SQLite avant chaque phase de migration. Rollback possible par restauration fichier.
- **NFR13 :** Import partiel : le système reste fonctionnel même si certaines données d’import sont invalides.
- **NFR14 :** Cold start NAS : le premier accès après inactivité prolongée peut prendre > 5s. Les accès suivants sont dans les cibles de performance.

### Maintenabilité

- **NFR15 :** Code organisé en couche partagée (`js/shared/*`) + pages autonomes. Chaque page ne dépend que de la couche partagée.
- **NFR16 :** Migration DB via scripts idempotents versionnés (`pragma user_version`).
- **NFR17 :** Assets statiques avec `Cache-Control` explicite et invalidation par query string versionnée.
