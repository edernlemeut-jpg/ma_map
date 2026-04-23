---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage', 'step-04-ux-alignment', 'step-05-epic-quality', 'step-06-final-assessment']
assessedDocuments:
  prd: '_bmad-output/planning-artifacts/prd.md'
  architecture: null
  epics: null
  ux: null
overallStatus: 'NOT READY — PRD solide, documents aval manquants'
---

# Implementation Readiness Assessment Report

**Date :** 2026-04-19
**Projet :** Metal Adventures
**Évaluateur :** Expert PM — Readiness Check Workflow

---

## Document Discovery

### Documents trouvés

| Type | Statut | Fichier |
|---|---|---|
| **PRD** | ✅ Trouvé | `_bmad-output/planning-artifacts/prd.md` (~560 lignes, 12 étapes complétées) |
| **Architecture** | ❌ Absent | Aucun dans `planning-artifacts/`. `docs/architecture.md` existe mais est un doc brownfield pré-PRD. |
| **Epics & Stories** | ❌ Absent | Aucun fichier |
| **UX Design** | ❌ Absent | Aucun fichier |

### Documents annexes

- `_bmad-output/project-context.md` — contexte projet (potentiellement obsolète)
- `docs/project-overview.md`, `docs/development-guide.md`, `docs/source-tree-analysis.md` — docs brownfield existants

**Doublons :** Aucun.

---

## PRD Analysis

### Functional Requirements Extracted

**39 FRs** répartis en 9 domaines :

#### Gestion des utilisateurs (FR1-FR4)
- **FR1 :** Création de compte (premier inscrit = auto-admin + MJ)
- **FR2 :** Connexion avec persistance (cookie)
- **FR3 :** Déconnexion
- **FR4 :** Attribution de rôles MJ/joueur par l'admin

#### Gestion des tables de jeu (FR5-FR8)
- **FR5 :** Création de table
- **FR6 :** Invitation de joueurs
- **FR7 :** Sélection de table active
- **FR8 :** Contexte de table automatique sur toutes les pages

#### Visibilité et révélation (FR9-FR14)
- **FR9 :** Toggle visibilité individuel
- **FR10 :** Bulk reveal par catégorie/zone
- **FR11 :** Cascade descendante (parent caché = enfants cachés)
- **FR12 :** Undo reveal (grace period)
- **FR13 :** Protect-by-default (joueur ne voit que le visible)
- **FR14 :** Vue « comme joueur » pour le MJ

#### Compendium (FR15-FR18)
- **FR15 :** Consultation des données visibles
- **FR16 :** Recherche textuelle
- **FR17 :** Plausible deniability en recherche
- **FR18 :** Édition MJ

#### Carte interactive (FR19-FR23)
- **FR19 :** Visualisation systèmes visibles
- **FR20 :** Fog of war (silhouettes)
- **FR21 :** Fiche système au clic
- **FR22 :** Navigation scroll/zoom + recentrage
- **FR23 :** Animation de reveal

#### Dashboard MJ (FR24-FR27)
- **FR24 :** Écran unique raccourcis/actions rapides
- **FR25 :** Recherche rapide toutes entités
- **FR26 :** Toggle « session active »
- **FR27 :** Gestion visibilité depuis dashboard

#### Itinéraire (FR28-FR31)
- **FR28 :** Route planning
- **FR29 :** Ship management
- **FR30 :** Génération liste de périls
- **FR31 :** Partage données via API

#### Migration et import (FR32-FR33)
- **FR32 :** Import avec rapport de validation
- **FR33 :** Import partiel (tolérance erreurs)

#### Synchronisation temps réel (FR34-FR37)
- **FR34 :** Polling automatique sans refresh
- **FR35 :** Indicateur état de connexion
- **FR36 :** Optimistic UI côté MJ
- **FR37 :** Resynchronisation automatique

#### États vides et onboarding (FR38-FR39)
- **FR38 :** Empty state narratif
- **FR39 :** Onboarding premier accès

**Total FRs : 39**

### Non-Functional Requirements Extracted

**17 NFRs** répartis en 4 catégories :

#### Performance (NFR1-NFR5)
- **NFR1 :** FMP < 2s réseau local
- **NFR2 :** Actions MJ < 3s perçu (optimistic UI)
- **NFR3 :** Polling 3-5s, réponse serveur < 500ms
- **NFR4 :** Recherche compendium < 1s (~200 entités)
- **NFR5 :** 5 utilisateurs simultanés sans dégradation

#### Sécurité (NFR6-NFR10)
- **NFR6 :** HTTPS obligatoire
- **NFR7 :** JWT cookies httpOnly + Secure + SameSite=Strict
- **NFR8 :** Protect-by-default serveur (pas client)
- **NFR9 :** bcrypt pour les mots de passe
- **NFR10 :** Validation rôle + appartenance table par endpoint

#### Fiabilité (NFR11-NFR14)
- **NFR11 :** Resync automatique après perte < 60s
- **NFR12 :** Backup DB avant chaque migration
- **NFR13 :** Import partiel sans crash
- **NFR14 :** Cold start NAS toléré (> 5s acceptable)

#### Maintenabilité (NFR15-NFR17)
- **NFR15 :** Architecture couche partagée + pages autonomes
- **NFR16 :** Migration DB via scripts idempotents
- **NFR17 :** Cache-Control explicite + invalidation versionnée

**Total NFRs : 17**

### Additional Requirements (hors FRs/NFRs)

Extraits des sections Domain-Specific et Web App :
- Zéro notification sonore en séance
- HTTPS via Let's Encrypt + DuckDNS
- Tailwind bundlé localement
- ES modules natifs
- Dark mode par défaut mobile / clair par défaut desktop
- Touch targets ≥ 44px, espacement ≥ 8px
- Cache-Control : `public, max-age=86400` statiques, `no-store` API
- Carte portrait + paysage, bouton recentrer permanent

### PRD Completeness Assessment — Forces

| Aspect | Évaluation |
|---|---|
| Executive Summary | ✅ Clair, complet, bien motivé |
| Classification | ✅ Détaillé avec stack, contexte, complexité |
| Success Criteria | ✅ SMART avec méthodes de vérification |
| Product Scope | ✅ MVP → PRD#1 → Growth → Vision, progression logique |
| User Journeys | ✅ Excellents — 6 parcours dont edge cases, patterns UX extraits |
| Domain Requirements | ✅ Fort — intégrité narrative, contexte séance, souveraineté données |
| Web App Requirements | ✅ Complet — polling, HTTPS, responsive, dark mode, cache |
| Phased Development | ✅ 5 phases avec DoD, séquence de build, parallélisation |
| FRs | ✅ 39 FRs bien structurés par domaine |
| NFRs | ✅ 17 NFRs mesurables avec cibles |
| Risk Mitigation | ✅ Table de risques avec mitigations concrètes |
| Frontmatter | ✅ Riche metadata structurée (accessMatrix, classification, etc.) |

---

## PRD Completeness Assessment — Problèmes identifiés

### 🔴 P1 — Visibilité granulaire : journeys vs FRs en désaccord

**Constat :** Les parcours utilisateurs décrivent un modèle de visibilité **à niveaux** :
- Parcours 1 : « Il active la visibilité "**position seule**" pour les joueurs — ils verront que Procyon existe sur la carte, mais pas les détails »
- Parcours 5 : « Pas encore de détails sur les planètes, pas de factions affichées. **Juste le nom et la position.** »

Mais les FRs (FR9-FR14) décrivent un modèle **binaire** (on/off par entité).

**Analyse :** Ce n'est pas nécessairement une contradiction — si chaque entité enfant (faction, corps céleste) a sa propre visibilité indépendante, la cascade descendante (FR11) + les reveals individuels (FR9) peuvent reconstituer le comportement décrit dans les journeys. Le système est visible = position affichée ; puis le MJ révèle séparément les factions et planètes à l'intérieur.

**Problème :** Cette interprétation est **implicite**. Aucun FR ne l'explicite. Le document Architecture devra définir la hiérarchie d'entités exacte et confirmer que le modèle binaire + cascade permet bien la granularité décrite dans les journeys. Sans ça, un développeur pourrait implémenter un toggle unique par système (position + tous les détails d'un coup).

**Action requise :** Soit ajouter un FR de clarification (ex: « FR-vis-granular : La visibilité par entité fonctionne à la granularité de l'entité individuelle — système, faction, corps céleste sont des entités distinctes avec leur propre toggle ») soit documenter explicitement dans l'architecture que le modèle hiérarchique produit la granularité attendue.

### 🟠 P2 — Incohérence classification : Tailwind CDN vs local

**Constat :** La table Project Classification (ligne ~123) indique :
> `Stack : Node.js, Express, SQLite (better-sqlite3), vanilla JS, **Tailwind CSS CDN**`

Mais la section Web App Requirements et Phase 0.2 disent clairement :
> « Tailwind CSS bundlé localement (pas de CDN) — zéro dépendance internet pour les styles »
> Phase 0.2 : « Tailwind local (CLI, `css/tailwind.css` commité) »

**Action requise :** Corriger « Tailwind CSS CDN » → « Tailwind CSS (bundlé localement) » dans la table de classification.

### 🟠 P3 — Pattern UX « Confirmation légère » sans FR

**Constat :** La table Patterns UX transversaux liste :
> « Confirmation légère : Long-press ou swipe, pas modale bloquante »

Mais aucun FR ne spécifie quand et comment ce pattern s'applique, ni quelles actions le déclenchent. C'est un risque d'interprétation variable lors de l'implémentation.

**Action requise :** Soit créer un FR dédié, soit documenter dans le UX Design quelles actions exactement utilisent ce pattern et comment.

### 🟡 P4 — Aucun journey pour la gestion de tables et rôles

**Constat :** FR4-FR8 couvrent la gestion des tables (création, invitation, sélection) et l'attribution de rôles. Mais aucun parcours utilisateur ne explore ce flux. Comment l'admin invite-t-il un joueur ? Interface dédiée ? Envoi d'un code ? Gestion depuis le dashboard ?

**Action requise :** Non bloquant pour le PRD, mais le UX Design devra combler ce vide.

### 🟡 P5 — Pas de FR pour le toggle dark mode

**Constat :** La section Web App Requirements dit « Basculable par l'utilisateur » (dark/light mode) mais il n'y a pas de FR correspondant. C'est un comportement utilisateur qui devrait être capturé.

**Action requise :** Mineur — peut être ajouté lors de la création des epics ou dans un FR d'accessibilité.

### 🟡 P6 — Phase 0 : tâches infra sans mapping FR

**Constat :** Phase 0 contient 10 tâches techniques (HTTPS, Tailwind, migration DB, auth-guard, etc.) qui ne correspondent à aucun FR car elles ne sont pas user-facing. C'est normal et attendu — mais les epics devront les couvrir sans FR associé.

**Action requise :** L'architecture et les epics devront prévoir des stories techniques pour Phase 0, tracées vers les NFRs plutôt que les FRs.

---

## Epic Coverage Validation

### Statut : ❌ IMPOSSIBLE — Aucun document Epics & Stories

Pas de document epics trouvé. **Couverture FR = 0%.**

| Métrique | Valeur |
|---|---|
| Total FRs dans le PRD | 39 |
| FRs couverts par des epics | 0 |
| Couverture | 0% |

**Impact :** Le document Epics & Stories doit être créé. Le PRD fournit une excellente base avec ses phases et son séquenceur de build. La création des epics devrait être directe grâce au phasing déjà défini.

---

## UX Alignment Assessment

### Statut : ⚠️ UX Document absent — WARNING

**UX est clairement implicite :** Le PRD décrit une application web interactive multi-utilisateurs avec des interactions complexes (fog of war, reveal en temps réel, optimistic UI, carte interactive, recherche rapide, dark mode toggle). Un document UX est **fortement recommandé**.

### Ce que le PRD couvre déjà bien (atténue le risque)

- 6 parcours utilisateurs détaillés avec contexte émotionnel
- 8 patterns UX transversaux identifiés (undo reveal, fog of war, plausible deniability, etc.)
- Responsive strategy claire (mobile-first joueurs, desktop-first MJ)
- Touch targets et espacement documentés
- Dark mode strategy définie
- États de connexion décrits
- Access matrix par rôle et outil

### Ce qui manque et nécessite un document UX

- Wireframes ou maquettes des écrans principaux
- Flux de navigation entre les outils
- Spécification de la "Confirmation légère" (P3)
- Interface de gestion de tables/rôles (P4)
- Layout du Dashboard MJ (raccourcis, toggle session, recherche rapide)
- Comportement du header unifié (table selector, navigation)
- Spécification du fog of war visuel (exact rendu des silhouettes)

---

## Epic Quality Review

### Statut : ❌ IMPOSSIBLE — Aucun epic disponible

Pas de document epics à évaluer.

---

## Summary and Recommendations

### Overall Readiness Status

## ❌ NOT READY

Le PRD est solide et complet — c'est un excellent point de départ. Mais 3 documents essentiels manquent pour démarrer l'implémentation : **Architecture**, **Epics & Stories**, et **UX Design** (recommandé).

### Issues Summary

| # | Sévérité | Problème | Action |
|---|---|---|---|
| P1 | 🔴 Critique | Visibilité granulaire : journeys vs FRs en désaccord | Clarifier dans PRD ou Architecture |
| P2 | 🟠 Majeur | Classification dit "Tailwind CSS CDN" vs réalité "local" | Corriger la table |
| P3 | 🟠 Majeur | Pattern "Confirmation légère" sans FR ni spec | Documenter dans UX ou ajouter FR |
| P4 | 🟡 Mineur | Pas de journey pour gestion tables/rôles | Combler dans UX Design |
| P5 | 🟡 Mineur | Pas de FR pour toggle dark mode | Ajouter FR ou documenter dans epics |
| P6 | 🟡 Mineur | Phase 0 tâches infra sans mapping FR | Normal — mapper aux NFRs dans epics |
| D1 | ❌ Bloquant | Architecture absente | Créer le document |
| D2 | ❌ Bloquant | Epics & Stories absents | Créer le document |
| D3 | ⚠️ Recommandé | UX Design absent | Fortement recommandé vu la complexité UI |

### Recommended Next Steps

1. **Corriger P1 et P2 dans le PRD** — 5 minutes. Clarifier la granularité de visibilité (même une phrase suffit) et corriger "CDN" → "local" dans la table
2. **Créer l'Architecture** — Décisions techniques, schéma DB validé, hiérarchie d'entités (critique pour P1), API design, infrastructure HTTPS/Docker
3. **Créer le UX Design** — Wireframes des écrans principaux, flux de navigation, spec des patterns identifiés (P3, P4)
4. **Créer les Epics & Stories** — Basés sur les 5 phases du PRD, mappés aux 39 FRs + 17 NFRs
5. **Re-run Implementation Readiness Check** — Quand les 3 documents sont prêts

### Final Note

Cette évaluation a identifié **2 problèmes dans le PRD** (P1 critique, P2 mineur à corriger) et **3 documents manquants** pour l'implémentation. Le PRD lui-même est de très bonne qualité — user journeys riches, phases bien séquencées, FRs/NFRs mesurables, risques identifiés. La route vers l'implémentation est claire : corriger les points P1-P2, puis produire architecture → UX → epics.
