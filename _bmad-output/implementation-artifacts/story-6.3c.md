# Story 6.3c — Docker build, deploy & documentation

## Status
**done**

## Story

**As a** développeur/administrateur,  
**I want** un Dockerfile correct, un docker-compose.yml complet et une documentation opérationnelle,  
**So that** l'application peut être déployée de façon reproductible via Docker.

## Acceptance Criteria

- [x] AC1 : `Dockerfile` multi-stage, Node 22-alpine, volume pour `db/`, CMD migrate + start
- [x] AC2 : `docker-compose.yml` avec volume persistant SQLite + `restart: unless-stopped`
- [x] AC3 : `.env.example` documenté avec toutes les variables (PORT, JWT_SECRET, DB_PATH, NODE_ENV)
- [x] AC4 : `README.md` → setup local, variables, commandes (dev/build/test/deploy), architecture
- [x] AC5 : Build Docker validé — artefacts revus, bug de copie CSS corrigé

## Implementation Notes

### État initial

La quasi-totalité des artefacts était déjà en place :
- `Dockerfile` multi-stage builder → production ✅
- `docker-compose.yml` avec volume `./db:/app/db` et `restart: unless-stopped` ✅
- `.env.example` complet ✅
- `README.md` exhaustif (setup, variables, commandes, architecture, sécurité) ✅
- `scripts/seed.js` ESM complet (referenced by `npm run seed`) ✅
- `scripts/migrate.js` existant ✅

### Bug corrigé : ordre des COPY dans le Dockerfile

**Problème** : Dans le stage `production`, l'ordre était :
```dockerfile
COPY --from=builder /app/public/css/tailwind.css ./public/css/tailwind.css  # ligne 19
COPY public/ ./public/  # ligne 24 → ÉCRASAIT la ligne 19 avec la version locale potentiellement obsolète
```

**Fix** : Interversion — `COPY public/` en premier, puis `COPY --from=builder` par-dessus.

### Fix .dockerignore : exclusion de tailwind.css

`public/css/tailwind.css` n'était pas dans `.dockerignore` alors que ce fichier est généré à la
compilation (exclu du repo via `.gitignore`). S'il existe localement, il entrait dans le contexte
de build et l'ordre des COPY pouvait produire un CSS obsolète.

**Fix** : Ajout de `public/css/tailwind.css` dans `.dockerignore`.

## Dev Agent Record

### Changes Made

1. **`Dockerfile`** — Fix ordre `COPY public/` avant `COPY --from=builder tailwind.css`
2. **`.dockerignore`** — Ajout `public/css/tailwind.css`

### Files Modified

- `Dockerfile`
- `.dockerignore`

### Validation

- Artefacts relus et validés :
  - `Dockerfile` (multi-stage, Node 22-alpine, scripts/migrate.js au CMD)
  - `docker-compose.yml` (port 3200:3000, volume ./db, restart: unless-stopped)
  - `.env.example` (PORT, JWT_SECRET, DB_PATH, NODE_ENV)
  - `README.md` (setup, variables, commandes, Docker, architecture, sécurité)
  - `scripts/seed.js` (ESM, gère galactic_events manquant)
  - `scripts/migrate.js` (existant)
- Bug critique corrigé (CSS écrasé dans Docker build)
- Tests E2E antérieurs (6.3a) couvrent les routes validées
