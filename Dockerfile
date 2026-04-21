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

# Assets compilés depuis le builder
COPY --from=builder /app/public/css/tailwind.css ./public/css/tailwind.css

# Sources de l'application
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY perils_data.json ./
COPY quadrants_MA.json ./

# Répertoire de la base SQLite (monté comme volume à l'exécution)
RUN mkdir -p /app/db

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]

