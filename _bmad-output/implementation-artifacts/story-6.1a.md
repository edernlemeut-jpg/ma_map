# Story 6.1a : Indicateur réseau & mode lecture seule hors-ligne

## Metadata
- story_id: 6.1a
- epic: 6 — Résilience, Polish & Décommissionnement
- status: done
- created: 2026-04-21
- author: dev-agent

## Goal
Rendre explicite l’état réseau en UI (connecté/synchronisation/hors-ligne), basculer les actions MJ en lecture seule en cas de coupure, afficher un message renforcé après 60s hors-ligne et notifier la reconnexion.

## Tasks
- [x] T1: Étendre le poller partagé avec backoff d’erreur optionnel
- [x] T2: Ajouter indicateur réseau sur dashboard (connecté/sync/hors-ligne/+60s)
- [x] T3: Activer mode lecture seule MJ hors-ligne sur dashboard
- [x] T4: Ajouter toast de reconnexion sur dashboard
- [x] T5: Ajouter indicateur réseau + mode lecture seule + toast sur carte interactive
- [x] T6: Ajouter indicateur réseau + mode lecture seule + toast sur page itinéraire
- [x] T7: Guard serveur/client des actions MJ en hors-ligne (front guards)
- [x] T8: Régression ciblée

## Dev Agent Record

### File List
- `public/js/shared/poller.js`
- `public/dashboard.html`
- `public/carte_interactive.html`
- `public/itineraire.html`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log
- `createPoller` supporte désormais un backoff d’erreur optionnel (`enableErrorBackoff`, `retryBaseMs`, `retryMaxMs`) avec remise à zéro sur succès.
- Dashboard:
  - Ajout du message explicite hors-ligne > 60s.
  - Bascule automatique en lecture seule hors-ligne (`body.mj-readonly`) pour les actions MJ.
  - Ajout d’un toast de reconnexion.
  - Activation du poller avec backoff d’erreur.
- Carte interactive:
  - Ajout message hors-ligne > 60s et bascule lecture seule MJ.
  - Ajout toast de reconnexion.
  - Activation du poller avec backoff d’erreur.
  - Guard explicite sur sauvegarde système en mode lecture seule hors-ligne.
- Itinéraire:
  - Ajout indicateur réseau d’en-tête (connecté/sync/hors-ligne/+60s).
  - Bascule lecture seule MJ hors-ligne avec neutralisation des panneaux d’édition.
  - Ajout toast de reconnexion.
  - Poller avec backoff et callbacks réseau harmonisés.
  - Guards explicites sur actions MJ mutantes (save/génération/visibilité périls).

### Completion Notes
- Story 6.1a implémentée sur les trois vues principales (dashboard, carte, itinéraire).
- Validation ciblée réussie en mode sériel: 35/35 tests passants.
- Epic 6 marqué `in-progress` avec 6.1a `done`.
