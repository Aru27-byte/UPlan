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
# `next build` imports every route module to collect page data, and src/platform/env.ts validates
# the environment at import — so the build needs values that pass validation. These are inline to
# this one command (not ENV, not in any shipped image): nothing reads them at build time except the
# validator, and the running containers get their real values from /etc/uplan/app.env, where a
# missing one is still a startup failure (best-practices.md: "Configuration fails fast").
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
  BETTER_AUTH_SECRET=build-only-placeholder-not-a-real-secret \
  BETTER_AUTH_URL=http://localhost:3000 \
  CITY_OIDC_ISSUER=https://build.invalid CITY_OIDC_DOMAIN=build.invalid \
  CITY_OIDC_CLIENT_ID=build CITY_OIDC_CLIENT_SECRET=build \
  GITHUB_CLIENT_ID=build GITHUB_CLIENT_SECRET=build \
  OCI_S3_ENDPOINT=https://build.invalid OCI_S3_REGION=build \
  OCI_S3_ACCESS_KEY_ID=build OCI_S3_SECRET_ACCESS_KEY=build \
  OCI_BUCKET_OBJECTS=build OCI_BUCKET_REPORTS=build \
  npm run build \
  && npm run worker:build

# ---- web: Next.js standalone server -------------------------------------------------------------
FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id, which Next's standalone server would bind to; caddy
# reaches `web` over the Compose network, so listen on every interface instead.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
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
# The migrations declare geometry columns but never create the extension; the postgis/postgis image
# used for local development does it on first start, this image doesn't. Runs once, when the data
# directory is first created, as the superuser, in POSTGRES_DB.
RUN echo "CREATE EXTENSION postgis;" > /docker-entrypoint-initdb.d/10-postgis.sql
