# Metal Adventures — Serveur TTRPG multi-joueurs

Application web Node.js pour gérer une table de jeu de rôle *Metal Adventures* : carte stellaire interactive, compendium de factions/systèmes, gestion des vaisseaux, et synchronisation en temps réel entre MJ et joueurs.

---

## Prérequis

| Outil | Version minimale |
|-------|-----------------|
| Node.js | 22 |
| npm | 10 |
| Docker (optionnel) | 24 |

---

## Installation locale

```bash
# 1. Cloner et installer les dépendances
git clone <url-du-repo>
cd metal-adventures
npm install

# 2. Créer le fichier d'environnement
cp .env.example .env
# Éditer .env et définir JWT_SECRET

# 3. Initialiser la base de données
npm run migrate

# 4. (Optionnel) Importer les données de seed
npm run seed

# 5. Lancer en développement
npm run dev
```

L'application est disponible sur **http://localhost:3000**.

---

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3000` | Port d'écoute du serveur |
| `JWT_SECRET` | — | **Requis.** Clé secrète pour signer les tokens JWT (min. 32 caractères) |
| `DB_PATH` | `./db/ma.db` | Chemin vers la base SQLite |
| `NODE_ENV` | `development` | Environnement (`development` \| `production`) |

---

## Commandes

```bash
# Développement (rechargement automatique)
npm run dev

# Production
npm start

# Tests unitaires et d'intégration
npm test

# Tests E2E Playwright
npm run test:e2e

# Générer les CSS Tailwind
npm run build:css

# Migration de base de données
npm run migrate

# Seed (import des données JSON initiales)
npm run seed
```

---

## Déploiement Docker

### Build & run manuel

```bash
docker build -t metal-adventures .
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET=votre_secret_ici \
  -v $(pwd)/db:/app/db \
  --name metal-adventures \
  metal-adventures
```

### Avec docker-compose

```bash
# Copier et configurer les variables
cp .env.example .env

# Lancer (en arrière-plan)
docker compose up -d

# Arrêter
docker compose down

# Voir les logs
docker compose logs -f
```

---

## Architecture

```
metal-adventures/
├── server.js              # Point d'entrée Express
├── src/
│   ├── config/            # Configuration (PORT, JWT_SECRET, DB_PATH)
│   ├── database.js        # Connexion SQLite (better-sqlite3)
│   ├── middleware/        # Pipeline : static → json → cookie → helmet → auth
│   ├── routes/            # Routeurs Express par domaine
│   └── services/          # Logique métier
├── public/                # Fichiers statiques servis par Express
│   ├── css/               # Tailwind CSS compilé
│   ├── js/                # Scripts ES modules (partagés + par page)
│   └── *.html             # Pages de l'application
├── scripts/
│   ├── migrate.js         # Création du schéma SQLite
│   └── seed.js            # Import initial des données JSON
├── tests/
│   ├── unit/              # Tests Node.js natifs
│   ├── integration/       # Tests d'intégration API
│   └── e2e/               # Tests Playwright
├── db/                    # Base SQLite (exclue du repo)
├── perils_data.json        # Seed : tables de rencontres
├── quadrants_MA.json       # Seed : systèmes stellaires
└── donnee_base/
    └── galactic_events.json  # Seed : événements galactiques
```

### Pile technique

- **Backend** : Node.js 22, Express 4, ESM
- **Base de données** : SQLite via `better-sqlite3`
- **Auth** : JWT (cookies httpOnly)
- **Frontend** : HTML/CSS Tailwind, JavaScript ES modules
- **Tests** : Node.js test runner natif + Playwright

---

## Sécurité

- `JWT_SECRET` doit être une chaîne aléatoire d'au minimum 32 caractères: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- La base SQLite (`db/ma.db`) doit être sur un volume persistant et non exposé publiquement
- Les fichiers de seed JSON (`perils_data.json`, `quadrants_MA.json`) ne sont pas servis par Express
