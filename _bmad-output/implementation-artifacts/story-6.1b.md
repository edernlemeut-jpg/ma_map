---
title: 'Story 6.1b - File d attente MJ offline'
type: 'feature'
created: '2026-04-21'
status: 'done'
baseline_commit: 'NO_VCS'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis 6.1a, une coupure réseau place correctement le MJ en lecture seule, mais les actions déjà différées avant la coupure restent uniquement en mémoire et peuvent être perdues sur reload ou rester muettes jusqu'à un refresh manuel. Cela laisse un trou par rapport à l'objectif de reprise automatique sur coupure courte côté MJ.

**Approach:** Étendre la file différée existante en une file best-effort persistée en `localStorage`, restaurée au rechargement et rejouée automatiquement à la reconnexion. Garder un périmètre strict: uniquement les actions déjà modélisées dans `createDeferredCommitQueue`, sans chercher à résoudre l'idempotence globale, les conflits multi-onglets ou un offline-first complet.

## Boundaries & Constraints

**Always:** Conserver les pages comme MPA autonomes utilisant une primitive partagée dans `js/shared/*`; limiter 6.1b aux actions déjà différées sur dashboard et itinéraire; persister les entrées par table active avec métadonnées minimales; rejouer dans l'ordre FIFO à la reconnexion; faire un refresh depuis la source serveur après replay; vider le stockage des entrées rejouées avec succès; en cas d'échec de replay, abandonner l'entrée fautive, afficher un message explicite et recharger l'état serveur pour revenir à une vérité cohérente.

**Ask First:** Élargir la file aux formulaires non différés (création/édition de route, création/édition de vaisseau, édition carte); ajouter coordination multi-onglets; introduire IndexedDB, service worker, Background Sync ou identifiants idempotents côté serveur.

**Never:** Transformer cette story en offline-first général; masquer les conflits potentiels derrière des retries infinis; conserver des entrées mortes sans feedback utilisateur; désactiver le mode lecture seule 6.1a pour les actions non supportées; modifier l'API backend pour un protocole de replay complexe dans cette story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pending survives reload | MJ a une action différée supportée, puis recharge la page avant reconnexion | La file est restaurée depuis `localStorage`, le toast indique qu'une action reste en attente, et aucun envoi n'est tenté tant que l'état reste offline | Si la désérialisation échoue, vider l'entrée corrompue et afficher un message discret de file invalide ignorée |
| Auto replay on reconnect | La page détecte `onReconnect` avec une ou plusieurs actions persistées | Les actions sont rejouées dans l'ordre d'origine, puis l'UI recharge les données serveur et affiche un toast de synchronisation réussie avec compteur si utile | Si une action échoue, arrêter le replay restant, supprimer l'entrée fautive, afficher l'erreur et recharger depuis le serveur |
| Unsupported MJ write while offline | MJ tente une action non couverte par la file pendant l'état offline 6.1a | L'action reste bloquée en lecture seule comme aujourd'hui | Conserver le message existant de mode lecture seule hors ligne |
| Queue overflow | Plus de 3 actions différées supportées sont empilées | La stratégie actuelle reste inchangée: la plus ancienne est commitée/flushée en priorité et l'état persisté reflète exactement la file mémoire restante | Si le flush forcé échoue, afficher l'erreur et recharger depuis le serveur |

</frozen-after-approval>

## Code Map

- `public/js/shared/deferred-commit.js` -- primitive de file différée à étendre pour snapshot, hydratation et replay persistant
- `public/dashboard.html` -- seule vue utilisant la file différée pour bulk visibility; doit restaurer et rejouer ses entrées supportées
- `public/itineraire.html` -- seconde vue avec file différée pour visibilité de vaisseau et retrait de waypoint; doit persister et rejouer ces opérations
- `public/js/shared/poller.js` -- hooks de reconnexion déjà disponibles; pas de changement majeur attendu mais dépendance de comportement
- `tests/unit/deferred-commit.test.js` -- base des tests unitaires de la queue; doit couvrir persistance/restauration/replay

## Tasks & Acceptance

**Execution:**
- [x] `public/js/shared/deferred-commit.js` -- ajouter sérialisation, restauration et replay ordonné des entrées persistables, avec API explicite pour snapshot/hydrate/clear -- centraliser la logique 6.1b dans une primitive testable
- [x] `public/dashboard.html` -- brancher la persistance locale de la file bulk visibility, restaurer au bootstrap et rejouer sur `onReconnect` avec feedback utilisateur -- fermer la perte de données des actions déjà différées sur cette vue
- [x] `public/itineraire.html` -- brancher la persistance locale de la file visibilité vaisseau / retrait waypoint, restaurer au bootstrap et rejouer sur `onReconnect` avec refresh serveur -- aligner la seconde vue qui utilise déjà `createDeferredCommitQueue`
- [x] `tests/unit/deferred-commit.test.js` -- ajouter tests de snapshot, hydratation, replay ordonné, purge d'entrée corrompue et conservation des limites de file -- verrouiller le comportement critique sans dépendre du DOM

**Acceptance Criteria:**
- Given une action MJ déjà supportée par la file différée est mise en attente puis la page est rechargée avant reconnexion, when le bootstrap se termine, then l'action reste visible comme pending et sera encore éligible au replay automatique.
- Given une ou plusieurs actions persistées existent et la reconnexion réseau est détectée, when le replay démarre, then les actions sont rejouées dans l'ordre d'origine et l'interface se resynchronise depuis le serveur sans intervention manuelle.
- Given une entrée persistée est invalide ou un replay renvoie une erreur serveur, when la page tente de la restaurer ou de la rejouer, then l'entrée fautive est supprimée, un message explicite est affiché et l'UI revient à l'état serveur rechargé.
- Given le MJ est offline sur une action non couverte par la file, when il tente cette action, then le blocage lecture seule 6.1a reste la protection en vigueur.

## Design Notes

La portée doit rester volontairement asymétrique: on persiste uniquement des entrées déjà prévues pour l'optimistic UI et l'undo window. Cela permet de satisfaire la reprise automatique sur coupure courte sans introduire de protocole métier nouveau côté backend.

Le format persisté doit rester minimal et stable: clé par page + table active, payload sérialisable JSON, label, timestamp, et type logique déjà connu par la page appelante. Les callbacks UI (`onOptimisticApply`, `onOptimisticRollback`) ne doivent pas être persistés; ils sont réassociés localement au moment de l'hydratation.

## Verification

**Commands:**
- `node --test tests/unit/deferred-commit.test.js` -- expected: nouvelles garanties sur snapshot/hydratation/replay passent
- `node --test --test-concurrency=1 tests/unit/deferred-commit.test.js tests/unit/poller.test.js tests/integration/sync.test.js` -- expected: pas de régression ciblée sur la résilience et le polling

## Suggested Review Order

**Queue hardening and replay semantics**

- Base durable du comportement: persistence safe, gating offline, retry cap, version check.
  [`deferred-commit.js:35`](../../public/js/shared/deferred-commit.js#L35)

- Évite les crashs storage navigateur et protège les writes/reads non fiables.
  [`deferred-commit.js:47`](../../public/js/shared/deferred-commit.js#L47)

- Supprime le risque de boucle infinie en drain avec entrées retained.
  [`deferred-commit.js:327`](../../public/js/shared/deferred-commit.js#L327)

**Dashboard integration**

- Point d’entrée UI MJ: classification transitoire/permanente et retention ciblée.
  [`dashboard.html:560`](../../public/dashboard.html#L560)

- Empêche les tentatives de commit offline avant reconnexion effective.
  [`dashboard.html:629`](../../public/dashboard.html#L629)

- Feedback explicite post-replay pour les entrées encore en attente réseau.
  [`dashboard.html:748`](../../public/dashboard.html#L748)

**Itinerary integration and safety**

- Garde preview: aucun replay réel pendant l’isolation vue joueur MJ.
  [`itineraire.html:943`](../../public/itineraire.html#L943)

- Hydratation stricte: rejet des payloads incomplets pour éviter commits invalides.
  [`itineraire.html:1095`](../../public/itineraire.html#L1095)

- Replay destructif stale atténué: drop des suppressions de waypoint trop anciennes.
  [`itineraire.html:1109`](../../public/itineraire.html#L1109)

**Tests and execution wiring**

- Couverture unitaire des edge cases critiques de queue durcie.
  [`deferred-commit.test.js:283`](../../tests/unit/deferred-commit.test.js#L283)

- Suite E2E ciblée restore + reconnect replay sur dashboard et itinéraire.
  [`reconnect-replay.spec.js:25`](../../tests/e2e/reconnect-replay.spec.js#L25)

- Configuration Playwright minimale dédiée au run ciblé Story 6.1b.
  [`playwright.config.js:1`](../../playwright.config.js#L1)