FROM node:22-slim

# sqlite3 client used by warmup.sh to prime indexes
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/admin.db

EXPOSE 3000

# Warm OS file cache + SQLite indexes before/after Next.js starts so the
# first user request doesn't pay cold-disk + cold-cache cost.
CMD ["sh", "-c", "scripts/warmup.sh && npm run start"]
