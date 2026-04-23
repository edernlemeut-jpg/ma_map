# PR Draft - Story 6.1b

## Title
feat: complete story 6.1b deferred offline replay

## Summary
Cette PR finalise la Story 6.1b en ajoutant une persistance locale best-effort de la file différée MJ, une restauration au chargement, puis un replay automatique à la reconnexion pour les flux déjà supportés.

## Why
En 6.1a, le mode lecture seule offline protégeait bien les écritures, mais certaines actions déjà différées pouvaient être perdues au reload ou restaient sans replay automatique.

## What changed
- Durcissement de la primitive de file différée: snapshot, hydratation, replay ordonné, protections sur storage et drain.
- Intégration dashboard: restauration pending, replay sur reconnexion, feedback utilisateur.
- Intégration itinéraire: restauration/replay des opérations supportées, garde-fous sur payloads invalides et stale deletes.
- Tests unitaires étendus sur les cas limites de queue.
- Suite E2E ciblée restore + reconnect replay sur dashboard et itinéraire.
- Configuration Playwright minimale et script npm dédié.
- Artefact QA récapitulatif ajouté.
- Story marquée done avec Suggested Review Order.

## Files
- public/js/shared/deferred-commit.js
- public/dashboard.html
- public/itineraire.html
- tests/unit/deferred-commit.test.js
- tests/e2e/reconnect-replay.spec.js
- playwright.config.js
- package.json
- _bmad-output/implementation-artifacts/tests/test-summary.md
- _bmad-output/implementation-artifacts/story-6.1b.md

## Validation
- E2E ciblé: npm run test:e2e:replay
- Résultat: 2 passed, 0 failed

## Risks and mitigations
- Scope volontairement limité aux opérations déjà modélisées dans la queue différée.
- Pas d’offline-first global, pas de coordination multi-onglets, pas de protocole idempotent backend ajouté.
- En cas d’entrée corrompue ou replay en erreur, purge de l’entrée fautive + resync serveur.

## Rollback
Revert du commit ff92129 pour revenir au comportement pré-6.1b.

## Commit
ff92129 - feat: complete story 6.1b deferred offline replay
