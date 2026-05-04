# Test Automation Summary

## Generated Tests

### Integration Tests
- [x] tests/integration/systems-bulk.test.js - `POST /api/systems/bulk` — 13 cas couverts

### E2E Tests
- [x] tests/e2e/reconnect-replay.spec.js - Dashboard restore + reconnect replay for deferred bulk visibility
- [x] tests/e2e/reconnect-replay.spec.js - Itineraire restore + reconnect replay for deferred ship visibility
- [x] tests/e2e/compendium-bulk.spec.js - Export/Import JSON systèmes + satellites dans openBodyModal

## Coverage

### `POST /api/systems/bulk` (systems-bulk.test.js)
- happy path : création de plusieurs systèmes, vérification en DB
- items sans `nom` ou `quadrant` silencieusement ignorés
- sérialisation automatique des champs `*_json` (objet → string)
- champs `*_json` déjà string acceptés
- limite MAX_BULK = 500 (> 500 → 400)
- tableau vide → 400, body non-tableau → 400
- autorisation : joueur → 403, sans auth → 401, sans X-Table-Id → 400/403
- transaction atomique : doublon UNIQUE → rollback complet

### Export/Import JSON compendium (compendium-bulk.spec.js)
- export : téléchargement déclenché, nom de fichier correct, id/visible absents, quadrant présent
- import valide : systèmes ajoutés à la liste
- import JSON invalide : message d'erreur inline (pas d'alert)
- import tableau vide : aucune modification, pas d'erreur
- min=0 sur input distance satellite

## Execution
- Integration : `node --test tests/integration/systems-bulk.test.js` → 13/13 ✔
- E2E : `npm run test:e2e` (compendium-bulk.spec.js inclus)
- Full suite : `npm test` → 293 pass, 13 fail (13 failures pre-existantes, toutes antérieures à cette session)

## Notes
- `tests/setup.js` : import `dashboard.js` (route supprimée en story 6-3b) retiré — fix de setup pré-existant.
- Les 13 failures de la suite complète sont pré-existantes (confirmé par `git stash` avant/après).
