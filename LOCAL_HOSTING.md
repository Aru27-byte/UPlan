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
- `OCI_S3_*` — only exercised by profile workbook uploads; any syntactically valid value
  (a real URL for `OCI_S3_ENDPOINT`, any non-empty string for the rest) satisfies startup
  validation, but uploading a workbook fails at runtime without real OCI Object Storage
  credentials. Final documents are stored in the database, not in object storage, so finishing
  research needs none of this (`OCI_BUCKET_REPORTS` is still required at startup but unused; see
  `TechDesign/deployment-guide.md`).

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
the next step needs.

If your database already has people in it from before sign-in moved to Supabase Auth (for example,
DATABASE_URL points at a database with data), follow `TechDesign/deployment-guide.md` A14 to link your
existing accounts to their Supabase logins before anything else; step 7 then only needs your linked email.

## 7. Seed local data

```sh
npm run db:seed:local -- you@example.com
```

Use the email you just registered with. This makes you UPlan staff, creates the one city
("Sammamish"), approves an illustrative Sammamish profile, and installs the illustrative sample
evidence datasets. It creates no project: you start one from the dashboard. Safe to re-run any time;
it skips whatever already exists. There is no jurisdiction membership: every signed-in person is a
planner, and a project belongs to the person who created it.

## 8. Run the background worker

The worker is required, not optional: it runs each project's analysis (so the phases have output to
review) and generates the final document. Without it a project sits at "Analysis is out of date".

```sh
npx playwright install chromium   # once: the worker prints the final document as a PDF with it
npm run worker:dev                # builds the worker, then starts it (leave it running)
```

## 9. Walk through the workflow

1. Open http://localhost:3000 and sign in. You land on the **Dashboard**: your projects, and the city
   profile beside them.
2. Choose **Start with sample data**. The project opens on its **Overview** with every input filled in
   from a fictional site (labeled as sample data everywhere it appears), and the analysis starts.
3. Work through the stage rail: **Site, Evidence, Screening, Studies, Footprint, Impact**. On each,
   read the drafted output and choose **Record review**, or request a revision and change an input.
   On **Evidence**, record which source you rely on for each disagreement before reviewing it.
4. On **Report**, choose **Finish research and generate the document**. When the worker finishes, the
   project is **Completed** and version 1 can be downloaded.
5. Choose **Re-research** (dashboard) or **Start a research change** (project). Change something, for
   example the target decision date, or load a new footprint. The Overview lists what changed and the
   phases to review again. Finish the change with a reason to publish version 2. The version history
   on **Report** keeps both.

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
