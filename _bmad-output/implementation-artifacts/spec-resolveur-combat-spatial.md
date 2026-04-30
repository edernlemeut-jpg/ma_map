---
title: 'Résolveur de tests — Combat spatial (Phase B)'
type: 'feature'
created: '2026-04-30'
status: 'done'
baseline_commit: '2657cc81529b03a6516821f94d173715a18436af'
context:
  - 'docs/analyse-combat-spatial.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En session de combat spatial, le MJ n'a aucun outil pour résoudre les tests d'actions (Engagement, Tirer, Manœuvre défensive/offensive, Accrocher, etc.) ni pour conserver un journal chronologique des événements de combat.

**Approach:** Ajouter sur la page `/combat-spatial.html` un panneau résolveur (bouton « Résoudre » sur le combat actif) qui ouvre une modale dual-mode : rouleau de dés virtuel d10-pool (N dés, succès = valeur ≤ seuil, résultats individuels affichés) OU saisie manuelle du résultat. Chaque résolution peut être loguée dans un journal de combat persisté en SQLite (`journal_json`). Le journal est visible par tous les membres de la table.

## Boundaries & Constraints

**Always:**
- MJ uniquement pour créer une entrée journal (POST `/:id/journal`) ; les joueurs peuvent lire le journal (GET `/:id` inclut déjà `journal`)
- Journal append-only : chaque entrée est `{id, ts, action, acteur, pool, seuil, resultats, succes, note}` — `id` = `Date.now()` côté client, `ts` = ISO string
- Le colonne `journal_json` existante dans `combats_spatiaux` est utilisée — pas de nouvelle table
- Actions disponibles : liste fixe tirée des tableaux 8.1–8.5 de `analyse-combat-spatial.md` (Engagement, Accrocher, Break!, Tirer, Manœuvre défensive, Manœuvre offensive, Viser, Identifier, Brouillage radar, Canaliser, et « Autre » libre)
- Dés virtuels : d10 pool (1–16 dés), seuil 1–10 configurable, résultats individuels colorisés (succès en vert, échec en rouge) — aucun calcul automatique de modificateurs de phase

**Ask First:**
- Si `journal_json` d'un combat dépasse 500 entrées → HALT et demander si on tronque les anciennes

**Never:**
- Pas de calcul automatique des modificateurs de Difficulté selon la phase ou la distance
- Pas d'application automatique des effets (pas de mise à jour `avantage` ou `structure_actuelle` depuis le résolveur)
- Pas d'historique global multi-combats
- Pas de mode « lancé de dés » accessible aux joueurs (lecture seule du journal uniquement)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Résoudre une action (dés virtuels) | MJ ouvre modal, sélectionne « Tirer », 3 dés, seuil 3, clique Lancer | 3d10 affichés individuellement, totalisation des succès affichée | — |
| Résoudre (saisie manuelle) | MJ bascule mode manuel, entre « 2 succès », note « +1 de Viser » | Résultat stocké sans pool/resultats, note conservée | — |
| Loguer l'entrée | MJ clique « Inscrire au journal » | POST `/:id/journal` → 200 + entrée ajoutée en tête du journal affiché | 403 si non-MJ ; 400 si `action` manquante |
| Lecture journal (joueur) | GET `/:id` côté joueur | Journal visible en lecture seule dans le panneau dédié | — |
| Lancer sans choisir d'action | Click « Lancer » sans action sélectionnée | Bouton « Inscrire » désactivé ; résultat de dés quand même affiché | — |

</frozen-after-approval>

## Code Map

- `src/routes/combat-spatial.js` — ajouter POST `/:id/journal` (append à `journal_json`)
- `public/js/combat-resolver.js` — nouveau module : modale résolveur + lanceur d10 + mode manuel
- `public/js/combat-spatial-app.js` — intégrer `CombatResolver`, ajouter panneau journal, bouton « Résoudre »
- `public/combat-spatial.html` — ajouter `<div id="resolver-modal">`, `<section id="journal-panel">`, bouton « Résoudre »
- `tests/integration/combat-spatial.test.js` — tests POST journal (MJ OK, joueur 403, sans action 400)

## Tasks & Acceptance

**Execution:**
- [x] `src/routes/combat-spatial.js` — Ajouter `POST /:id/journal`
- [x] `public/js/combat-resolver.js` — Exporter classe `CombatResolver`
- [x] `public/js/combat-spatial-app.js` — Importer `CombatResolver`, panneau journal, bouton « Résoudre »
- [x] `public/combat-spatial.html` — Section `#journal-panel`
- [x] `tests/integration/combat-spatial.test.js` — 3 tests journal (MJ OK, joueur 403, sans action 400)

**Acceptance Criteria:**
- Étant donné un MJ avec un combat `en_cours`, quand il clique « Résoudre », la modale s'ouvre avec sélection d'action et lanceur de dés
- Étant donné un résultat de dés affiché, quand le MJ clique « Inscrire au journal », l'entrée apparaît immédiatement dans le panneau journal sans rechargement de page
- Étant donné un joueur (non-MJ), quand il charge la page, le panneau journal est visible en lecture seule (bouton « Résoudre » absent)
- Étant donné une entrée journal valide, quand POST `/:id/journal` est appelé sans être MJ, l'API retourne 403
- Étant donné que `action` est vide dans le body, quand POST `/:id/journal` est appelé, l'API retourne 400

## Design Notes

**Entrée journal (format):**
```js
{
  id: Date.now(),            // client-generated, unique enough
  ts: new Date().toISOString(),
  action: 'Tirer',           // string from ACTIONS list or free text
  acteur: 'Hawk',            // free text, optional
  pool: 3,                   // nb dés (mode dés), null en mode manuel
  seuil: 3,                  // seuil succès (mode dés), null en mode manuel
  resultats: [2, 7, 3],      // résultats bruts d10, null en mode manuel
  succes: 2,                 // succès comptés (resultats ≤ seuil), ou valeur saisie en mode manuel
  note: '+1 de Viser'        // texte libre, optional
}
```

**Succès d10 pool (Metal Adventures) :** `succès = résultats.filter(r => r <= seuil).length`

## Verification

**Commands:**
- `npm test -- --test-name-pattern="journal"` — expected: 3 nouveaux tests passent (journal MJ OK, joueur 403, sans action 400)

## Suggested Review Order

**Nouvelle route journal**

- Route complète avec statut guard, validations longueur/range, et generation id/ts serveur.
  [`combat-spatial.js:428`](../../src/routes/combat-spatial.js#L428)

**Module résolveur (nouveau fichier)**

- Classe complète : API publique, injection modal, liste ACTIONS dont `Viser` et `Autre` libre.
  [`combat-resolver.js:51`](../../public/js/combat-resolver.js#L51)

- Logique dés d10 pool, colorisation résultats, stockage `_lastRoll`.
  [`combat-resolver.js:248`](../../public/js/combat-resolver.js#L248)

- POST journal + dispatch entrée confirmée par le serveur + fermeture modale.
  [`combat-resolver.js:290`](../../public/js/combat-resolver.js#L290)

**Intégration dans l'app**

- Bouton « Résoudre » conditionnel (MJ + `en_cours`) dans les contrôles MJ.
  [`combat-spatial-app.js:174`](../../public/js/combat-spatial-app.js#L174)

- Listener `journal-entry` une-seule-fois + guard `combatId` avant prepend.
  [`combat-spatial-app.js:284`](../../public/js/combat-spatial-app.js#L284)

- Rendu et mise à jour du panneau journal (render plein + prepend incrémental).
  [`combat-spatial-app.js:537`](../../public/js/combat-spatial-app.js#L537)

**HTML**

- Section `#journal-panel` masquée par défaut, visible dès première entrée.
  [`combat-spatial.html:137`](../../public/combat-spatial.html#L137)

**Tests**

- 3 tests journal : MJ 200, joueur 403, action manquante 400.
  [`combat-spatial.test.js:271`](../../tests/integration/combat-spatial.test.js#L271)
