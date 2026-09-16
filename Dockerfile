# Three targets — web, worker, postgres — per TechDesign/system-architecture.md's container table
# and .claude/rules/file-structure-and-imports.md. `migrate` reuses the `worker` target (it only
# needs drizzle-kit and the compiled schema, not Chromium/GDAL at runtime, but one image is simpler
# and still fits the free VM's disk — system-architecture.md's "minimal configuration" principle).

# ---- deps: install once, shared by build stages ------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the Next.js app and the worker bundle ---------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build \
  && npm run worker:build

# ---- web: Next.js standalone server -------------------------------------------------------------
FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# ---- worker: graphile-worker, with GDAL, Poppler, and Chromium (Playwright's own image) ----------
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends gdal-bin poppler-utils \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY package.json ./
CMD ["node", "dist/worker/main.js"]

# ---- migrate: applies migrations once per deploy, before web/worker start (V7) -------------------
FROM worker AS migrate
CMD ["npx", "drizzle-kit", "migrate"]

# ---- postgres: PostgreSQL 18 + PostGIS 3.6 + pgvector 0.8 + pgBackRest ---------------------------
FROM postgres:18 AS postgres
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    postgresql-18-postgis-3 \
    postgresql-18-pgvector \
    pgbackrest \
  && rm -rf /var/lib/apt/lists/*
