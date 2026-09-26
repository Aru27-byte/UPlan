# Running UPlan locally

Commands only — see the code comments in each file referenced below for why. Run everything from
the repository root unless noted.

## Prerequisites

- Node.js and npm
- Docker Desktop, running
- A free Supabase project (for sign-in): under Authentication → Providers → Email, turn **Confirm email** off, and under URL Configuration add `http://localhost:3000/auth/callback` to the redirect URLs

## 1. Install dependencies

```sh
npm install
```

## 2. Configure environment

```sh
cp .env.example .env
```

Edit `.env` and fill in:

- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` — from your Supabase project's Project Settings → API
- `APP_URL` — leave as `http://localhost:3000`
- `OCI_S3_*` — only exercised by profile uploads and report release; any syntactically valid value
  (a real URL for `OCI_S3_ENDPOINT`, any non-empty string for the rest) satisfies startup
  validation, but those two features will fail at runtime without real OCI Object Storage
  credentials

Everything in `.env.example` is required — `src/platform/env.ts` validates it at startup and the
app refuses to start if anything is missing.

## 3. Start Postgres (PostGIS)

```sh
docker compose -f docker-compose.dev.yml up -d
```

## 4. Run migrations

```sh
npm run db:migrate
```

## 5. Get a local basemap extract

The map needs a small `.pmtiles` vector basemap extract at `public/basemap/basemap.pmtiles` (committed, because Vercel serves it as a static file; the VM deployment serves its own copy from `deploy/basemap/` instead).

1. Download the `pmtiles` CLI for your platform from https://github.com/protomaps/go-pmtiles/releases (a single binary — no install needed).
2. Extract a small area around your jurisdiction from Protomaps' free daily build (replace the date with a recent one, and the bbox with your area's `min_lon,min_lat,max_lon,max_lat`):

```sh
pmtiles extract https://build.protomaps.com/20260918.pmtiles public/basemap/basemap.pmtiles \
  --bbox=-122.10,47.50,-121.90,47.70 --maxzoom=15
```

This streams only the tiles inside that bbox (a few MB), not the whole planet file.

Note: street/place labels are deliberately not rendered (see `src/ui/basemap-style.client.ts`) — roads, water, parks, and buildings still show, just without text, to avoid depending on a live third-party font/sprite server at runtime.

## 6. Start the app

```sh
npm run dev
```

(`npm run dev`/`npm run build` automatically copy MapLibre's worker files into `public/maplibre/` first — required for the vector basemap to actually render; see `src/ui/basemap-style.client.ts`'s comment.)

Open http://localhost:3000/register and create an account — this creates your `app_user` row, which
the next step needs. (A local database from before sign-in moved to Supabase has old `app_user` rows
that match no Supabase user; reset it with `docker compose -f docker-compose.dev.yml down -v` and
repeat steps 3–4.)

## 7. Seed local data

```sh
npm run db:seed:local -- you@example.com
```

Use the email you just registered with. This grants you staff + planner access to a "Sammamish"
jurisdiction, seeds an approved profile, illustrative evidence datasets, and one demo decision
("Sammamish Ridge Estates (test data)") with a real computed analysis run — safe to re-run any
time, it skips whatever already exists.

## 8. (Optional) Run the background worker

Needed for dataset ingestion, profile-change previews, and report release/PDF rendering — not
needed to browse decisions, trace geometry, or view evidence/impact.

```sh
npm run worker:build
npm run worker:start
```

## Everyday commands

| Command                                         | What it does                                            |
| ----------------------------------------------- | ------------------------------------------------------- |
| `npm run dev`                                   | Start the app (Turbopack, hot reload)                   |
| `npm run typecheck`                             | TypeScript, no emit                                     |
| `npm run lint`                                  | ESLint                                                  |
| `npm run format:check`                          | Prettier check (`npm run format` to fix)                |
| `npm test`                                      | Unit tests (no database)                                |
| `npm run test:integration`                      | Integration tests (Testcontainers — needs Docker)       |
| `npm run build`                                 | Production build                                        |
| `docker compose -f docker-compose.dev.yml down` | Stop Postgres (add `-v` to also delete its data volume) |
