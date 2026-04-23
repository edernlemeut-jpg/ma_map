# Epic 6 Context: Résilience, Polish & Décommissionnement

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cet epic durcit l'application pour les vraies conditions de jeu: coupures réseau courtes, réveil lent du serveur NAS, régressions cross-epic et suppression finale du legacy. L'objectif est de conserver une expérience lisible et fiable en session tout en finalisant les contraintes de maintenabilité et d'exploitation avant décommissionnement.

## Stories

- Story 6.1a: Indicateur réseau & mode lecture seule
- Story 6.1b: File d'attente MJ offline
- Story 6.2: Cold start NAS & loading UX
- Story 6.3a: Suite E2E Playwright cross-epic
- Story 6.3b: Décommissionnement legacy
- Story 6.3c: Docker build, deploy & documentation

## Requirements & Constraints

- La reconnexion après coupure réseau doit resynchroniser automatiquement l'interface.
- Les coupures courtes doivent éviter la perte de données côté MJ, avec optimistic UI et retry, sans exposer de fuites côté joueur.
- La perte réseau prolongée doit rester compréhensible via des messages explicites plutôt qu'un simple indicateur minimal.
- Le code client doit rester organisé en couche partagée `js/shared/*` plus pages autonomes, sans réintroduire de logique dupliquée ou de dépendances croisées fortes entre pages.
- Les assets statiques et la reprise après cold start doivent rester compatibles avec une application servie par Express sur NAS.
- Les suppressions legacy et durcissements de déploiement ne doivent pas casser les flux déjà couverts par les epics précédents.

## Technical Decisions

- La synchronisation repose sur `/api/sync` et un poller partagé avec fréquence adaptée selon visibilité de page (`document.hidden`) et gestion de reconnexion.
- Les pages MPA restent responsables de leur propre état UI, mais s'appuient sur des primitives partagées dans `public/js/shared/`.
- Les réponses API restent encapsulées dans `{ data: ... }` et les erreurs dans `{ error: { code, message, status } }`.
- Les tests sont séparés dans `tests/unit`, `tests/integration` et `tests/e2e`; toute logique partagée introduite pour la résilience doit être testable hors DOM complet.
- Les évolutions de persistance ou de migration doivent rester idempotentes et ne pas introduire de dépendance build-side supplémentaire.

## UX & Interaction Patterns

- Les vues principales doivent exposer un état réseau lisible: connecté, synchronisation, hors-ligne, et message renforcé si la coupure dure.
- Le MJ doit voir clairement quand ses actions deviennent indisponibles ou différées, avec une rétroaction immédiate sur la reconnexion et la resynchronisation.
- Les mécanismes différés doivent conserver le pattern existant de toast, file visuelle et annulation temporaire, sans transformer l'application en mode offline-first complet.

## Cross-Story Dependencies

- 6.1b s'appuie directement sur 6.1a: indicateur réseau, détection offline, hooks de reconnexion et mode lecture seule déjà présents.
- 6.2 complète l'expérience de résilience côté chargement initial mais ne remplace pas les mécanismes de resync réseau.
- 6.3a doit valider les comportements de reconnexion et de résilience introduits par 6.1a/6.1b.
- 6.3b et 6.3c ferment l'epic en retirant le legacy et en documentant le déploiement final sans casser les flux durcis plus tôt.