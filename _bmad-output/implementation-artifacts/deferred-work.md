# Deferred Work

## Deferred from: code review of Battlegrid SVG interactive (combat spatial Phase A, 2026-04-30)

Findings from adversarial review surfaced post-implementation. Patches already applied: Math.abs position bug, config validation 400, NaN guards for avantage/structure_actuelle, empty nom check in PATCH ships, nav link visibility for joueurs.

Remaining deferred items (pre-existing patterns or future-phase concerns):

- **journal_json dead code** — Column `journal_json` exists in `combats_spatiaux` but PATCH /:id never writes to it. Intentional placeholder for Phase B (résolveur). To implement in Phase B as append-only combat journal log endpoint.
- **isMJ() truthy check on is_admin** — `req.user?.is_admin` accepted as truthy rather than `=== true`. Matches project-wide pattern in other routes (chasses-tresor, etc.). Should be addressed project-wide if the user model ever changes.
- **combat_json / crew_json no size limit** — No content-length guard on JSON blobs in PATCH /:id. Pre-existing project pattern. Acceptable for internal tabletop use; if exposed publicly, add `express.json({ limit: '64kb' })` middleware.
- **CHECK constraints missing on configuration/orientation/classe** — Only `statut`, `phase`, `camp`, `trajectoire` have DB-level CHECK. Route-level validation compensates. To add CHECK constraints on next schema migration if needed.



Split décidé par l'utilisateur lors du multi-goal check. Les deux objectifs suivants sont différés après livraison de la Battlegrid (objectif A).

- **B) Résolveur de tests** — Modal dual-mode (dés virtuels d20 + pools Avantage/Désavantage OU saisie manuelle du résultat physique). Résolution selon les actions spatiales (Tirer, Manœuvre défensive/offensive, Viser, etc.), journal de session. Dépend du schéma DB établi en A (tables `combat_sessions`, `combat_ships`). Prérequis : schéma DB de A doit prévoir les colonnes `phase`, `action_log` JSON.
- **C) Gestion des postes d'équipage** — Assigner PJ/PNJ aux 5 postes (Pilote, Artilleur·s, Méca, Médecin, Passager), fiche de poste accessible par joueur depuis leur vue. Dépend de A pour la liste des vaisseaux en combat. Nécessite colonnes `crew_assignments` JSON ou table dédiée.

## Deferred from: code review of Résolveur de combat spatial — Phase B (2026-05-XX)

Patches applied: `Viser` added to ACTIONS list, `Autre` libre text input added, server-side `id`/`ts` generation, `statut` check, field length limits, range validation on pool/seuil/succes, resultats element validation, server-confirmed entry dispatched, `_reset()` button text fix.

Remaining deferred items:

- **CSRF** — `POST /:id/journal` uses cookie auth with no CSRF token, same as all other mutation endpoints in the project. Address project-wide with csurf or double-submit cookie pattern.
- **TOCTOU on 500-entry cap** — read-check-write is not atomic (JSON.parse → length check → unshift → UPDATE). Unlikely in practice (SQLite serialises writes at process level), but a `db.transaction()` wrapper would eliminate any theoretical race.
- **Full journal on every POST** — `success(res, { journal })` returns the full journal array (up to 500 entries). Client currently uses only `journal[0]`. Return only the new entry when possible; add pagination if the journal grows large.
- **DOM list unbounded** — `_prependJournalEntry()` never trims the `<ul>` to match the 500-entry server cap. Long-running sessions accumulate unlimited `<li>` nodes. Add a trim to 500 items after each prepend.
- **`Date.now()` ID collisions** — journal entry `id` is `Date.now()` on the server. Two rapid concurrent requests could get the same millisecond. Consider `crypto.randomUUID()` or a monotonic counter.
- **CombatResolver init for joueurs** — `new CombatResolver()` injects the resolver modal into the DOM for all users, including joueurs. The modal is not reachable via normal UI and the server enforces 403, so no security impact. Guard with `if (this._mj)` to keep joueur DOM clean.
- **Test coverage for boundary cases** — missing test coverage: pool/seuil out-of-range, oversized action/note, statut check (posting to finished combat), exact 499/500/501 entry boundary, client-supplied id/ts ignored.
- **JSDoc signature incorrect** — `CombatResolver.open()` jsdoc says `open(combatId, combat)` but implementation is `open(combatId)`. Update docblock.

## Deferred from: code review of compendium de règles (2026-04-23)

- Whitelist auth `prefix: true` sur `/api/rules` — pattern fragile si une future route `/api/rules-something` est créée sans auth. À revoir si les routes publiques se multiplient.
- `rules-service.js` : pas de try/catch autour des appels DB — même pattern pré-existant que visibility.js, poller.js. Documenté dans deferred-work.md 2026-04-20.
- Pas de validation longueur max sur `name`, `description`, `extra` — SQLite TEXT illimité, même pattern que ship_models, systems.
- `seedRulesEntries` garde `COUNT(*) > 0` trop agressive — impossible de re-seeder si données corrompues sans vider la table manuellement.
- `extra` en DB contient les champs `id`, `name`, `description` en doublon avec les colonnes dédiées — fonctionne, cosmétique, à nettoyer si le schéma évolue.
- `listRules` : SELECT sans LIMIT — acceptable à 225 entrées, à surveiller.

## Deferred from: code review of story 2-2-compendium-api-routes-lecture-filtrees (2026-04-20)

- `armement_json`/`systemes_secondaires_json` retournés comme TEXT brut — colonnes TEXT SQLite, l'API les retourne comme chaînes (double-encodage JSON). À traiter Story 3.2 (fiche détail) pour parser côté service ou frontend.
- `is_frontiere` retourné comme integer 0/1 au lieu de boolean — inconsistance cosmétique avec le champ `visible: true/false`. À harmoniser Story 2.3 (frontend) si le frontend en a besoin.

## Deferred from: code review of story 2-3-compendium-frontend (2026-04-20)

- `getVisibleIds()` dans `visibility.js` : exceptions DB non capturées — remontent comme 500 non formaté
- `poller.js` : callbacks `onData`/`onError`/`onReconnect` non wrappées en try-catch — exception dans callback laisse le poller dans un état incohérent
- `poller.js` : `fetchFn` potentiellement null si l'import dynamique échoue — `TypeError: fetchFn is not a function`
- `routes/sync.js` : pas de try-catch autour de `getSyncPayload()` — crash Express si erreur DB

## Deferred from: code review of story 2-4-recherche-compendium-plausible-deniability (2026-04-20)

- Race condition stale response : `performSearch` n'utilise pas d'AbortController — si réponse lente arrive après une réponse rapide, résultats écrasés. Pattern absent du projet entier.
- Pas de LIMIT SQL dans `searchEntities()` — acceptable à ~200 entités, mais potentiellement coûteux si le jeu de données grandit.
- DB sync bloque event loop — better-sqlite3 est synchrone par design, 3 LIKE scans séquentiels sur 1 requête HTTP. Tout le codebase fait pareil.
- LIKE ASCII-only pour accents français — `"systeme"` ne matche pas `"Système"`. Limitation SQLite sans extension ICU.
- Pas de max query length sur `q` — un client peut envoyer 10K+ caractères, provoquant des LIKE lourds.
- `isVisible()` exception tue toute la recherche — pas de try-catch par row, une erreur sur 1 entité avorte tous les résultats (pattern pré-existant depuis story 2.3).
- Pas de rate limiting sur `/api/search` — endpoint le plus coûteux, concern cross-cutting.
- `ship_models` description dans `renderShipModelCard` est dead code — la colonne `description` n'est pas dans le `SELECT` de `SEARCH_CONFIG.ship_models`.

## Deferred from: code review of story 2-5-edition-compendium-par-le-mj

- SQL injection dans cleanup tests (TEST_PREFIX constant, risque faible — paramétrer si copié)
- Visibilité stale après édition frontale — le poller rafraîchit, même pattern que vis toggle
- `esc()` dans tests incomplet vs production (test régression cosmétique)
- Pas de validation longueur max sur champs TEXT — SQLite TEXT illimité
- Pas de validation numérique côté frontend (browser type=number suffit)
- ship_models n'a pas de colonne `updated_at` — incohérence API avec systems/factions
- ship_models.id pas de validation longueur (TEXT PK, risque faible)
