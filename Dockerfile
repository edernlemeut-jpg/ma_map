# ── Étape 1 : Build des assets CSS ───────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:css

# ── Étape 2 : Image de production ────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Sources de l'application
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# CSS compilé depuis le builder (remplace l'éventuelle version locale obsolète)
COPY --from=builder /app/public/css/tailwind.css ./public/css/tailwind.css
COPY scripts/ ./scripts/
COPY src/seeds/ ./src/seeds/
COPY perils_data.json ./
COPY quadrants_MA.json ./
COPY characters_data.json ./
COPY secondary_systems_data.json ./

# Répertoire de la base SQLite (monté comme volume à l'exécution)
RUN mkdir -p /app/db

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node server.js"]

