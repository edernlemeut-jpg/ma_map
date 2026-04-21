FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx tailwindcss -i public/css/input.css -o public/css/tailwind.css --minify
RUN npm prune --production

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
