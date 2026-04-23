# Story 2.6: Import admin avec rapport de validation

Status: ready-for-dev

## Story

As a admin,
I want to import existing data (JSON) with a detailed validation report,
So that I can migrate my existing campaign data without losing information.

## Acceptance Criteria

1. **Admin — import POST** : quand un admin soumet un fichier JSON valide via `POST /api/admin/import`, les données sont importées et il reçoit `{ "data": { "imported": N, "skipped": M, "errors": [{ "entity": "...", "reason": "..." }] } }`
2. **Import partiel** : quand le fichier contient des erreurs partielles, les entrées valides sont importées (SAVEPOINT par entité avec rollback individuel), les invalides sont listées dans `errors` avec identifiant + raison
3. **Non-admin — 403** : quand un non-admin tente l'import, il reçoit 403
4. **Backup automatique** : backup automatique de la DB avant import via `database.backup()` de better-sqlite3 (safe en WAL mode), stocké dans `db/backups/ma_backup_<timestamp>.db`
5. **Formats supportés** : l'import supporte les formats JSON existants du projet : `quadrants_MA.json`, `perils_data.json`, `galactic_events.json` (déduits automatiquement par structure)
6. **Page admin** : une page `public/admin/import.html` permet l'upload avec affichage du rapport
7. **Lien onboarding** : le lien vers l'import est activé dans l'onboarding admin (Story 1.3 déjà existante)

## Tasks / Subtasks

### Backend — Service d'import (AC: #1, #2, #4, #5)

- [ ] **T1** Créer `src/services/import.js` (AC: #1, #2, #4, #5)
  - [ ] T1.1 Fonction `backupDatabase()` — appelle `db.backup()` de better-sqlite3, stocke dans `db/backups/ma_backup_<timestamp>.db`, crée le dossier si nécessaire
  - [ ] T1.2 Fonction `detectFormat(data)` — détecte le format JSON par structure (quadrants/perils/events)
  - [ ] T1.3 Fonction `importQuadrants(data)` — importe quadrants_MA.json → tables systems + factions
  - [ ] T1.4 Fonction `importPerils(data)` — importe perils_data.json → table peril_data
  - [ ] T1.5 Fonction `importGalacticEvents(data)` — log info seulement (pas de table DB dédiée, comme seed.js)
  - [ ] T1.6 Fonction `runImport(data)` — orchestrate : backup → detect → import → retourne rapport
  - [ ] T1.7 Chaque entité importée dans un SAVEPOINT individuel → rollback individuel en cas d'erreur
  - [ ] T1.8 Rapport : `{ imported: N, skipped: M, errors: [{ entity, reason }] }`

### Backend — Route admin (AC: #1, #3)

- [ ] **T2** Créer `src/routes/admin.js` + monter dans server.js (AC: #1, #3)
  - [ ] T2.1 `POST /api/admin/import` — vérifier `req.user.is_admin === 1`, sinon `forbidden(res)`
  - [ ] T2.2 Accepter le body JSON (le frontend parsera le fichier côté client et enverra le JSON)
  - [ ] T2.3 Appeler `runImport(req.body)`, retourner `success(res, rapport)`
  - [ ] T2.4 Monter `/api/admin` dans `server.js` avec `import adminRoutes from './routes/admin.js'`

### Backend — Tests (AC: #1, #2, #3, #4, #5)

- [ ] **T3** Tests unitaires service import (AC: #1, #2, #4, #5)
  - [ ] T3.1 Fichier : `tests/unit/import-service.test.js`
  - [ ] T3.2 Test : detectFormat détecte quadrants (objet avec arrays de systèmes)
  - [ ] T3.3 Test : detectFormat détecte perils (objet avec categories)
  - [ ] T3.4 Test : detectFormat détecte events (array avec title/dateStart)
  - [ ] T3.5 Test : importQuadrants importe systèmes + factions, retourne rapport correct
  - [ ] T3.6 Test : importQuadrants skip duplicate (UNIQUE(quadrant, nom)), error listé
  - [ ] T3.7 Test : importPerils importe peril_data, retourne rapport correct
  - [ ] T3.8 Test : backupDatabase crée le fichier backup

- [ ] **T4** Tests d'intégration route admin (AC: #1, #3)
  - [ ] T4.1 Fichier : `tests/integration/admin-import.test.js`
  - [ ] T4.2 Test : admin POST import quadrants → 200 + rapport
  - [ ] T4.3 Test : non-admin POST import → 403
  - [ ] T4.4 Test : POST avec JSON invalide → 400
  - [ ] T4.5 Test : sans auth → 401

### Frontend — Page import admin (AC: #6, #7)

- [ ] **T5** Créer `public/admin/import.html` (AC: #6)
  - [ ] T5.1 Page avec upload file input (accept=".json")
  - [ ] T5.2 Le frontend parse le JSON localement, l'envoie via POST en body JSON
  - [ ] T5.3 Afficher le rapport d'import : compteurs (imported/skipped/errors)
  - [ ] T5.4 Afficher la liste d'erreurs si présente
  - [ ] T5.5 Style Tailwind cohérent avec le reste du projet
  - [ ] T5.6 Accessible uniquement si connecté et admin

- [ ] **T6** Mettre à jour package.json avec les nouveaux tests

## Dev Notes

### ⚠️ FORMATS JSON EXISTANTS — Mapping critique

**quadrants_MA.json** — Structure :
```json
{
  "Κ-8": [
    {
      "nom": "Bazaar",
      "faction": "Barrens",
      "corpsCelestes": [{ "nom": "...", "classe": "M", "description": "", "lunes": [...] }],
      "soleil": { "nom": "Losserim", "classe": "Naine jaune", "description": "..." },
      "isFrontiere": true,
      "gouvernement": "Corporatiste",
      "route": "Route Galactique (+1d)",
      "patrouilles": [{ "cout": "20", "vaisseaux": "Galactic Scout" }],
      "description": "..."
    }
  ],
  "Λ′-24": []
}
```
→ Mapping vers DB systems :
- clé objet → `quadrant`
- `nom` → `nom`
- `faction` → `faction` (aussi extraire vers table factions)
- `isFrontiere` → `is_frontiere` (0/1)
- `route` → `route`
- `gouvernement` → `gouvernement`
- `description` → `description`
- `soleil` → `soleil_json` (JSON.stringify)
- `corpsCelestes` → `corps_celestes_json` (JSON.stringify)
- `patrouilles` → `patrouilles_json` (JSON.stringify)

**perils_data.json** — Structure :
```json
{
  "interplanetaire": {
    "name": "Périls Interplanétaires",
    "categories": [...]
  },
  "hyperespace": { ... }
}
```
→ Mapping vers DB peril_data : chaque clé → `type`, valeur → `data_json` (JSON.stringify)

**galactic_events.json** (dans `donnee_base/`) — Structure :
```json
[{ "id": "...", "title": "...", "dateStart": "0101.01", "dateEnd": "...", "color": "#6366f1", "galacticYear": 50429, "createdAt": "..." }]
```
→ ⚠️ PAS DE TABLE DB dédiée. Le seed.js fait juste un `console.log`. L'import doit logger info et retourner `{ imported: 0, skipped: N, errors: [] }` avec un message approprié.

### ⚠️ PATTERN D'IMPORT — SAVEPOINT par entité

Le seed.js utilise déjà un pattern similaire. Pour Story 2.6, utiliser des SAVEPOINTs SQLite pour rollback individuel :

```javascript
db.exec('BEGIN');
for (const system of systems) {
  db.exec(`SAVEPOINT sp_${i}`);
  try {
    insertSystem.run(system);
    imported++;
    db.exec(`RELEASE sp_${i}`);
  } catch (err) {
    db.exec(`ROLLBACK TO sp_${i}`);
    db.exec(`RELEASE sp_${i}`);
    errors.push({ entity: system.nom, reason: err.message });
    skipped++;
  }
}
db.exec('COMMIT');
```

### ⚠️ SEED.JS EXISTE DÉJÀ — ne pas dupliquer

Le fichier `scripts/seed.js` fait déjà un import initial des 3 formats JSON. La Story 2.6 crée un endpoint **admin** pour ré-importer à la demande (migration de données de campagne). Le code de parsing/mapping peut être inspiré du seed mais doit gérer les doublons (UNIQUE constraints) et les erreurs partielles.

### ⚠️ BACKUP better-sqlite3

```javascript
import db from '../database.js';
// db.backup(filename) retourne une Promise
await db.backup(`db/backups/ma_backup_${Date.now()}.db`);
```

⚠️ `db` dans ce projet est l'instance better-sqlite3, PAS le module. Vérifier dans `src/database.js` comment il est exporté.

### ⚠️ AUTH — is_admin

Le champ `users.is_admin` est un INTEGER (0/1). L'auth middleware met le user dans `req.user` via JWT. Vérifier que `req.user.is_admin === 1` dans la route admin.

### Pattern de route — ajouter dans server.js

```javascript
// server.js — ajouter après les autres imports
import adminRoutes from './routes/admin.js';
// après les autres app.use
app.use('/api/admin', adminRoutes);
```

### Responses helpers disponibles

```javascript
import { success, validationError, forbidden, notFound } from '../utils/response.js';
```

### Pattern frontend admin page

Pas de framework — vanilla JS + Tailwind comme le reste. La page import.html doit :
1. Input type=file accept=".json"
2. Lire le fichier via FileReader
3. Parser le JSON
4. POST vers `/api/admin/import` avec `fetchWithTable()` ou fetch direct (pas besoin de table context pour l'admin)

⚠️ L'import admin est global (pas lié à une table de jeu). Donc fetch direct (pas fetchWithTable).

### DB Schema — Tables concernées par l'import

```sql
-- systems (UNIQUE(quadrant, nom))
INSERT INTO systems (quadrant, nom, faction, is_frontiere, route, gouvernement, description, soleil_json, corps_celestes_json, patrouilles_json)

-- factions (UNIQUE(name))
INSERT INTO factions (name)

-- peril_data (type TEXT PRIMARY KEY)
INSERT OR REPLACE INTO peril_data (type, data_json)
```

### Fichiers existants — ne PAS modifier sauf server.js

| Fichier | Action | Détail |
|---------|--------|--------|
| `src/services/import.js` | CRÉER | Service d'import avec backup, detect, import |
| `src/routes/admin.js` | CRÉER | Route POST /api/admin/import |
| `src/server.js` | MODIFIER | Monter adminRoutes sous /api/admin |
| `public/admin/import.html` | CRÉER | Page d'upload admin |
| `tests/unit/import-service.test.js` | CRÉER | Tests unitaires |
| `tests/integration/admin-import.test.js` | CRÉER | Tests intégration |
| `package.json` | MODIFIER | Ajouter chemins tests |

### backup.js / data.js — Legacy (CommonJS)

Les fichiers `src/routes/backup.js` et `src/routes/data.js` existent mais sont en CommonJS (require), non montés dans server.js. Ce sont des vestiges legacy. NE PAS les utiliser — créer `src/routes/admin.js` en ESM (import/export).

### Learnings des stories précédentes

- `esc()` sur tous les attributs HTML dynamiques
- Touch targets ≥ 44px
- UNIQUE constraint → try-catch avec message user-friendly
- Validation manuelle, pas de Joi/Zod
- `String()` wrap sur les query params
- Tests : `TEST_PREFIX` pour cleanup, `createTestApp()` + `httpRequest()` pour intégration

### Anti-patterns — NE PAS FAIRE

- ❌ Ne PAS utiliser backup.js ou data.js (legacy CommonJS)
- ❌ Ne PAS créer de table galactic_events — pas dans le schéma, juste logger
- ❌ Ne PAS modifier le seed.js
- ❌ Ne PAS utiliser multer pour l'upload — le frontend parse le JSON et l'envoie en body
- ❌ Ne PAS dupliquer le code du seed — s'en inspirer mais avec gestion d'erreurs
