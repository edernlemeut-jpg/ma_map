# Rétrospective Epic 6 — Résilience, Polish & Décommissionnement

**Date :** 2026-04-23  
**Facilitatrice :** Amelia (Dev)  
**Participant :** Crepe (Project Lead)

---

## Métriques de livraison

| Indicateur | Valeur |
|-----------|--------|
| Stories complétées | 5/5 actives (100 %) |
| Stories différées | 1 (6.1b — hors scope MVP volontaire) |
| Régressions détectées | 0 |
| Tests E2E en sortie | 14/14 ✅ |
| Story livrée hors planning | 1 (6.2 cold-start, découverte en cours de sprint) |

---

## Ce qui a bien fonctionné

1. **Primitive partagée (poller.js).** Étendue une fois, répercutée proprement sur dashboard, carte et itinéraire. Le pattern MPA + shared modules a prouvé sa valeur sur tout l'epic.

2. **6.2 en opportunisme malin.** La story cold-start NAS a été livrée en bonus lors de l'analyse d'une autre story. 13 fichiers HTML touchés en une passe, aucun AC oublié.

3. **6.3b bien scalpée.** Les bugs de redirections legacy (double 404 en cascade, auth middleware non whitelisté) auraient pu passer inaperçus. Le cadrage précis des AC a permis des fixes chirurgicaux.

4. **Suite E2E cross-epic (6.3a).** Helpers d'auth réutilisables, couverture complète des parcours MJ et joueur. Filet de sécurité solide.

5. **Décision 6.1b tenue.** La story différée a été implémentée proprement (12 tests unitaires) mais sans déborder sur le scope MVP. Le périmètre a été respecté.

6. **Pas de friction côté product owner.** Un epic technique bien cadré n'a pas nécessité de validation manuelle itérative — sain pour ce type d'epic.

---

## Ce qui n'a pas bien fonctionné

1. **Bug Dockerfile silencieux.** L'ordre `COPY --from=builder` *avant* `COPY public/` écrasait le CSS compilé. N'aurait été découvert qu'au premier vrai déploiement Docker — aucun test ne le couvrait.

2. **Auth middleware non whitelisté pour les URLs legacy (6.3b).** Les pages de redirection retournaient 401 pour les utilisateurs non connectés. Les tests E2E passaient tous connectés, donc le bug était invisible dans la suite automatisée.

3. **Pas de validation manuelle utilisateur.** Acceptable pour un epic 100 % technique avec bonne couverture E2E, mais à noter comme limite structurelle.

---

## Leçons apprises

| # | Leçon | Action concrète pour la suite |
|---|-------|-------------------------------|
| 1 | Les bugs Docker sont invisibles sans build réel | Tester `docker build` manuellement avant de clore un epic qui touche au Dockerfile |
| 2 | Les middlewares d'auth doivent être vérifiés pour chaque nouvelle route publique | Checklist de story : « cette route doit-elle être whitelistée dans `auth.js` ? » |
| 3 | Les stories `deferred` peuvent glisser dans le scope sans critère explicite | Ajouter une note `scope-locked` dans les stories différées pour rappeler l'intention |
| 4 | Un epic UX nécessite un moment de test réel même court | Pas applicable ici — à garder en tête pour les prochains epics fonctionnels |

---

## Bilan global du projet

- **6 epics, 30 stories** (dont 1 différée), **38/39 FRs** couverts (FR20 retiré du scope)
- Pas un seul rollback sur toute la durée du projet
- Discipline tests unitaires + intégration + E2E maintenue depuis l'Epic 1
- Application déployable sur NAS via Docker

---

## Statut

`epic-6-retrospective: done`
