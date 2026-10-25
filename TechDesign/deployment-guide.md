# TechDesign — Deployment Guide

**Status:** Current as of 2026-10-24. This document describes the current deployment; the `deploy/` Oracle stack is kept only as a reference.
**Kind:** System-level. It has no Requirements counterpart.
**Implementation:** Current deployment: Vercel web, Supabase data/auth/storage, one managed worker container.
**Builds on:** [system-architecture.md](system-architecture.md) (_Deployment_, _Operations_, _Security and access_), [data-model.md](data-model.md) (_Operations_, _Privileges and immutability_), [accounts-roles.md](accounts-roles.md)

This guide deploys the application as it is built today:

| Tier | Service | What it runs |
| --- | --- | --- |
| **Web** | Vercel | Next.js 16 pages, Server Actions, and route handlers |
| **Data, sign-in, files** | Supabase | PostgreSQL 18 with PostGIS and pgvector, Supabase Auth, and Storage through its S3-compatible endpoint |
| **Worker** | One managed always-on container | The existing `worker` image: graphile-worker, Chromium for PDFs, GDAL for ingestion, Poppler for code text |
| **AI** | NVIDIA hosted inference | Optional AI assist; the app works without it |
| **Code** | GitHub | Repository and release tags |

The worker is the only process that cannot run as a normal Vercel Function. It keeps a long-lived PostgreSQL connection for graphile-worker, runs at most two jobs at a time, prints PDFs with Chromium, and loads public GIS data with GDAL. Vercel Functions scale to zero when no request arrives, so a worker loop started inside one dies. Vercel's own guidance is to keep an always-on worker on a platform built for it and connect it to the application through a shared database or queue. UPlan already uses PostgreSQL as its queue, so the worker only needs the Supabase connection string.

The worker can run on any always-on container host — Render, Railway, Fly.io, Google Cloud Run with a minimum instance of 1, or the existing Oracle Cloud VM. It is a managed container, not a second application tier. The rest of this guide calls it **the worker host**.

A Vercel-native replacement for the worker, using Vercel Queues and Workflows, is described in [Part E](#part-e--vercel-native-worker-alternative). It requires replacing graphile-worker, Chromium, and GDAL in code, so it is the migration path, not the current deployment.

---

## Part A — Deploy the web app, database, auth, and files

### A1. Collect these first

| Item | Where it comes from |
| --- | --- |
| A domain, such as `uplan.example.org` | A registrar you control, or a subdomain the city creates |
| A Vercel account and project | vercel.com |
| A Supabase account and project | supabase.com |
| A worker host account | Render, Railway, Fly.io, Google Cloud Run, or an existing VM |
| A strong database password | `openssl rand -base64 24` |
| An NVIDIA API key (optional) | build.nvidia.com |

Use **Vercel Pro** for a city pilot. The Hobby plan is limited to non-commercial use, caps functions at 300 seconds, and allows Cron Jobs only once a day. The app works on Hobby for evaluation, but the pilot should use Pro or confirm that the city's use qualifies.

### A2. Create the Supabase project

1. Create a project in the region closest to the city. Record the project reference and the database password.
2. **Database.** Supabase provides PostgreSQL 18 with PostGIS and pgvector. The migrations create the `vector` extension; PostGIS is available on Supabase. If your project does not have PostGIS enabled, run `create extension if not exists postgis;` in the SQL editor as the owner.
3. **Auth.** Authentication → Providers → Email: enable email and password. Leave **Confirm email** off for a demo. For a pilot, configure a custom SMTP sender and turn confirmation on (B2.4 in the earlier guide; the register page already handles both states).
4. **Auth URLs.** Authentication → URL Configuration:
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback` and, for local development, `http://localhost:3000/auth/callback`.
5. **Storage.** Create a bucket named `uplan-objects`. UPlan stores uploaded profile workbooks, raw evidence, and records exports there. Published PDFs are stored in the database, so a `uplan-reports` bucket is not needed. Keep `OCI_BUCKET_REPORTS` set to any existing bucket name for now, because `src/platform/env.ts` still requires the variable; it is unused.
6. **Storage credentials.** Storage → S3 access keys: create an access key. Record the endpoint (`https://<project-ref>.supabase.co/storage/v1/s3`), region, access key id, and secret. Supabase's S3 keys are project-scoped rather than per-operation, so the create-only guarantee is the application client's contract: `src/platform/object-storage.ts` exposes only `putIfAbsent`, `headIfExists`, and `getObject`, with no delete or overwrite. Treat the keys as secrets and rotate them if they leak.
7. **Connection strings.** Project Settings → Database:
   - **Web / Vercel:** the transaction pooler on port `6543`.
   - **Worker:** the session pooler or direct connection on port `5432`. graphile-worker uses LISTEN/NOTIFY and advisory locks, so it must not use transaction pooling.
   - **Migrations:** the direct connection or session pooler.
8. **Backups.** Check the plan's backup and point-in-time recovery window. Record it in the pilot runbook. A free project pauses after a week without use; restore it from the Supabase dashboard if that happens.

### A3. Run the migrations

From a machine with the repository and a migrated environment:

```sh
DATABASE_URL="<direct or session connection string>" npm run db:migrate
```

Migrations `0000`–`0011` create the schema, the job queue, the immutability triggers, the AI tables, and the report section and chat tables. Migrations are append-only; never edit one that has been applied. Run them before starting the new web or worker version. The application never runs migrations at startup.

The migrations do not create a restricted `uplan_app` role. The current deployment connects as the schema owner, which is acceptable for a demo but not the pilot. Part C lists the least-privilege work.

### A4. Configure Vercel

1. Import the GitHub repository into Vercel. Framework preset: Next.js. Root directory: the repository root.
2. Build command: `npm run build`. Install command: `npm install`. Output: Next.js default.
3. Function region: choose the region closest to the Supabase project. A cross-region database round trip costs more than the function's cold start.
4. Environment variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase transaction pooler, port `6543` |
| `APP_URL` | `https://<your-domain>` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key from Project Settings → API |
| `NVIDIA_API_KEY` | Optional. Leave empty and assist says it is not set up |
| `OCI_S3_ENDPOINT` | `https://<project-ref>.supabase.co/storage/v1/s3` |
| `OCI_S3_REGION` | The Supabase project's region, such as `us-west-1` |
| `OCI_S3_ACCESS_KEY_ID` | The Supabase Storage S3 access key id |
| `OCI_S3_SECRET_ACCESS_KEY` | The Supabase Storage S3 secret |
| `OCI_BUCKET_OBJECTS` | `uplan-objects` |
| `OCI_BUCKET_REPORTS` | Any existing bucket name; currently unused |
| `LOG_LEVEL` | `info` |

The `OCI_S3_*` names are kept because the S3 client and environment schema were written for Oracle's S3-compatible endpoint. Supabase Storage speaks the same API, and `forcePathStyle: true` already matches its path-style endpoint. Renaming the variables to generic `S3_*` names is a later cleanup, not a deployment blocker.

5. `NEXT_PUBLIC_` must not prefix `NVIDIA_API_KEY` or any secret. The browser has no Supabase client and no model key.
6. Deploy. On first deploy, Vercel builds the Next.js app. The worker is deployed separately in Part B.
7. Attach the domain in Vercel → Settings → Domains and follow the DNS instructions. Vercel issues the TLS certificate.
8. **Request body limit.** Vercel Functions accept at most 4.5 MB in one request. The app's profile-upload validation allows 5 MB, which is above that ceiling, so a workbook near the limit fails at the platform before the handler runs. Either lower the form and Zod limit to 4.5 MB, or upload directly to Supabase Storage with a signed URL and pass the object key to the server. This is a deployment item, not a reason to raise the app limit.

### A5. The basemap

The map reads `public/basemap/basemap.pmtiles`, served by Vercel as a static file. It is committed to the repository. If you need a fresh extract for another city:

1. Download the `pmtiles` CLI from the go-pmtiles releases.
2. Extract a small area from Protomaps' free daily build:

```sh
pmtiles extract https://build.protomaps.com/20260918.pmtiles public/basemap/basemap.pmtiles \
  --bbox=-122.10,47.50,-121.90,47.70 --maxzoom=15
```

The extract is a few megabytes. Vercel serves static files with range requests, so the client can read only the tiles it needs. Street and place labels are deliberately not rendered, so the app does not depend on a third-party font or sprite server at runtime.

### A6. Object storage check

The profile workbook upload path is the only feature that exercises object storage today. If uploads fail, check:

- the endpoint ends in `/storage/v1/s3`;
- the region matches the Supabase project;
- the access key has create and read permission on `uplan-objects`;
- `forcePathStyle` is in effect (it is, in `src/platform/object-storage.ts`).

Reports do not need object storage. Finishing research writes the PDF to `report.pdf` in PostgreSQL.

### A7. First web deployment check

- `https://<your-domain>` shows the landing page over HTTPS.
- `/register` creates an account and `/sign-in` signs it in.
- `/dashboard` loads with no city yet, or with the seeded cities after Part B.
- `/api/health` answers. On a fresh Supabase project it may report `backup_freshness` or `wal_archiving` because those checks were written for a self-run PostgreSQL; see Part C.
- Vercel → Logs shows pino JSON lines with no secrets.

---

## Part B — Run the worker

### B1. Why the worker is separate

The worker runs `graphile-worker` in a long-lived process. It:

- keeps a PostgreSQL connection open and listens for new jobs;
- processes at most two jobs at a time;
- prints the final PDF with Playwright Chromium;
- loads public datasets with GDAL and converts documents with Poppler;
- runs `record_heartbeat` every five minutes and `daily_jurisdiction_maintenance` once a day from `deploy/crontab`.

Vercel Functions are request-driven. A container with no HTTP traffic scales down after five minutes in production, and a worker loop started inside a function stops. Vercel's documented pattern for this shape is to keep the worker on Render, Railway, Fly.io, Amazon ECS, or Kubernetes and connect it to the Vercel app through a shared queue or database. UPlan's queue is already in PostgreSQL, so the worker only needs the same Supabase database.

### B2. Build the worker image

The repository's `Dockerfile` has a `worker` target. It is based on the Playwright image and adds GDAL and Poppler:

```sh
docker build --target worker -t uplan-worker .
```

The image's command is `node dist/worker/main.js` and it expects the full application environment. The `worker:build` script bundles the worker with esbuild; the Docker build already runs it in the `build` stage.

### B3. Configure the worker host

Create a background worker or always-on service from the image. Set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase **session** pooler or direct connection, port `5432` |
| `APP_URL` | `https://<your-domain>` |
| `SUPABASE_URL` | Same as Vercel |
| `SUPABASE_PUBLISHABLE_KEY` | Same as Vercel |
| `NVIDIA_API_KEY` | Optional; same as Vercel |
| `OCI_S3_*` | Same as Vercel |
| `OCI_BUCKET_*` | Same as Vercel |
| `LOG_LEVEL` | `info` |

The worker imports `src/platform/env.ts`, which validates the whole environment at startup. A missing variable is a crash with the variable's name, not a fallback.

The worker does not need a public port. If the host requires one, expose the host's default health port and nothing else.

### B4. Start it with the crontab

In production the worker needs graphile-worker's crontab file. On a host that runs the container directly:

```sh
node dist/worker/main.js --crontab=/app/deploy/crontab
```

The Docker image's default command does not include `--crontab`; pass it in the host's start command, or use the Compose reference in `deploy/compose.yaml`, which mounts `deploy/crontab`. Without it, jobs enqueued by the web app still run, but the heartbeat and daily maintenance do not.

If your worker host runs a plain Node process instead of the image:

```sh
npm run worker:build
npx playwright install chromium
node --env-file=.env dist/worker/main.js --crontab=deploy/crontab
```

Install GDAL and Poppler on the host for dataset ingestion and code text. The Playwright image already includes Chromium.

### B5. Verify the worker

1. Sign in, create a project (or start with sample data).
2. Within a minute the analysis should finish and the phase pages should show drafted output instead of "Analysis is out of date."
3. `GET /api/health` should stop naming `worker_heartbeat` after the first five-minute heartbeat.
4. Finish research. The report should move from "Generating document" to version 1 and offer a download.

If analysis never runs:

- check the worker logs for `worker started`;
- confirm `DATABASE_URL` uses port 5432, not the transaction pooler;
- confirm the worker can reach Supabase (network egress, IP allow list);
- check `graphile_worker.jobs` for pending jobs and `graphile_worker.job_queues` for stuck queues;
- check the health endpoint's `worker_heartbeat` and `exhausted_jobs` checks.

### B6. Scaling

One worker at concurrency 2 is enough for a pilot. Start another instance only if the queue is consistently backed up. Jobs for one project share a named queue (`decision:<id>`), so two workers never run the same project's analysis at once. Every handler is idempotent, so a restart or a retry is safe.

### B7. Host-specific notes

- **Render:** create a Background Worker from the Docker image. Background workers do not receive HTTP traffic and do not spin down on the free web-service schedule.
- **Railway:** create a service from the image and set the start command with `--crontab`.
- **Fly.io:** deploy the image as a `worker` process group with no services; set the start command and a volume only if you need local logs.
- **Google Cloud Run:** use a worker pool or a service with `min-instances=1` and CPU always allocated. A request-driven Cloud Run service that scales to zero has the same problem as Vercel.
- **Existing Oracle VM:** the old `deploy/compose.yaml` still works. Run only `worker` (and `migrate` when needed); point `DATABASE_URL` at Supabase and remove the local `postgres` dependency.

---

## Part C — Operations, security, and backups

### C1. Health check

`GET /api/health` returns 200, or 503 with the names of the failing checks. The current code checks:

- `database` — a `select 1`;
- `worker_heartbeat` — a heartbeat no more than 15 minutes old;
- `wal_archiving` — `pg_stat_archiver`;
- `backup_freshness` — a `backup_run` row within 26 hours;
- `disk_space` — the function's filesystem below 85%;
- `exhausted_jobs` — jobs that used up their attempts in the last 24 hours.

The last three were written for the self-run PostgreSQL VM. On Supabase:

- WAL archiving is managed by Supabase; `pg_stat_archiver` may not expose the same view.
- Backups are Supabase's, not pgBackRest; `backup_run` is empty unless you add a job that records a Supabase backup check.
- The function's disk is ephemeral and not the database's disk, so `disk_space` is not a meaningful database check.

For the pilot, either:

1. keep `database`, `worker_heartbeat`, and `exhausted_jobs`, and replace the other three with Supabase-specific checks (project status, backup age from the Supabase API, database size against the plan limit); or
2. run a small external monitor against `/api/health` and Supabase's own status, and accept that the endpoint reports only the checks that still apply.

Do not let a known-inapplicable check make the endpoint fail forever. A health check that always says 503 trains everyone to ignore it.

### C2. Logs and alerts

- **Web:** Vercel → Logs. pino writes one JSON line per boundary event.
- **Worker:** the worker host's log stream. Keep at least 7 days.
- **Database:** Supabase logs and metrics.
- **Alerts:** an external monitor (Better Stack, UptimeRobot, Checkly, or Supabase's own alerts) calls `/api/health` every 5–10 minutes and emails UPlan staff. Vercel Pro's own monitoring is not a substitute for an external check.
- **Cron:** if you add Vercel Cron, set `CRON_SECRET` and reject requests without `Authorization: Bearer <secret>`.

### C3. Backups and restore

- **Database:** Supabase's automatic backups, plus point-in-time recovery if the plan includes it. Record the retention window. Rehearse a restore into a scratch project before the pilot and quarterly after.
- **Published documents:** stored in `report.pdf` inside the database, so the database backup covers them. The SHA-256 beside each PDF is how you detect a changed row.
- **Object storage:** `uplan-objects` holds uploads and raw evidence. Supabase Storage is backed up with the project on paid plans; on the free plan, download the bucket before risky changes.
- **Records exports:** the city's public-records copies are the independent copy outside UPlan. Produce them on the city's schedule.
- **Secrets:** keep the Supabase database password, S3 keys, and NVIDIA key in a password manager, not only in Vercel or the worker host.

### C4. Security

- Supabase Auth is called only from the server. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Authorization is enforced inside module functions. A project query is scoped to its owner in SQL; a staff action checks `staff_member`.
- Vercel and the worker hold server-side secrets only. No `NEXT_PUBLIC_` secret exists.
- UPlan's object client has no delete or overwrite method. Supabase's S3 keys are project-scoped, so the client contract is the enforcement; treat the keys as secrets and rotate them if they leak.
- The database currently connects as the schema owner. Before the pilot, create a restricted `uplan_app` role with the grants in [data-model.md](data-model.md) (_Privileges and immutability_) and give the web and worker that role. Run migrations as the owner.
- Add a Content Security Policy that allows MapLibre's blob workers and nothing broader. The current code does not set one. Add it in `next.config.ts` (or `vercel.json` headers) and test the map page.
- Turn on Supabase's network restrictions or a database IP allow list where the plan supports it. Vercel Functions use dynamic IPs; the worker host may have a fixed egress IP.

### C5. Migrating from the Oracle VM reference stack

The `deploy/` directory remains in the repository as a working reference, not as the target.

1. **Database:** dump the old PostgreSQL with `pg_dump --format=custom`, restore into Supabase with `pg_restore`. If the old database uses extensions or roles unavailable on Supabase, create the extensions first and restore into a fresh schema.
2. **Storage:** copy `uplan-objects` from OCI to Supabase Storage, preserving keys. Keys are content hashes or record ids, so a copy is idempotent.
3. **Auth:** keep the Supabase Auth project already used by the app. Existing `app_user.auth_id` rows keep working. If you are moving from a database that used Better Auth, follow the linking steps in the earlier A14 section: register, then link `app_user.auth_id` by email, deliberately.
4. **Environment:** point `DATABASE_URL`, `OCI_S3_*`, and `APP_URL` at the new services.
5. **Deploy web:** import the repository into Vercel and set the environment.
6. **Deploy worker:** build the worker image and run it against the Supabase database.
7. **Verify:** sign in, open a project, run an analysis, finish a report, download a version, and check `/api/health`.
8. **Decommission:** stop the old `web`, `worker`, `postgres`, and `caddy` containers only after a week of successful operation. Keep the old database dump until the pilot's first backup restore passes.

---

## Part D — First-run data

1. **Register the first person** at `/register` with the email that will be UPlan staff. This creates the `app_user` row.
2. **Create the city and staff row.** The seed script is the only built-in bootstrap:

```sh
DATABASE_URL="<direct connection string>" npm run db:seed:local -- you@example.com --allow-remote
```

The script refuses a non-local database unless `--allow-remote` is passed, because it grants staff rights and installs illustrative data. Run it from a trusted machine, only against the intended project.

It creates:

- **Sammamish**, **Redmond**, and **Bellevue** as jurisdictions;
- an illustrative, approved profile for each;
- illustrative sample evidence datasets for Sammamish;
- a `staff_member` row for the email.

It creates no project. Start one from the dashboard. The Redmond and Bellevue profiles are illustrative, not those cities' law.

3. **For a real pilot,** replace the illustrative profile with the city's workbook and replace the sample evidence with real datasets. Never mix sample rows with real evidence in a pilot database. The sample rows are labeled `is_sample` and carry illustrative provenance.
4. **Add a second staff member** for AI rule-draft confirmation. The same person can never confirm their own draft; the database has a unique partial index for one confirmation per draft.
5. **Optional AI key.** Add `NVIDIA_API_KEY` to Vercel and the worker host. Without it every phase still works and the assist panels say it is not set up.

---

## Part E — Vercel-native worker alternative

This is the path to remove the external worker host. It is **not the current deployment**; it requires code changes and needs its own design review before it ships.

### E1. What changes

| Current | Vercel-native replacement |
| --- | --- |
| `graphile_worker.add_job()` inside the transaction | A `job_outbox` row written in the same transaction, plus a dispatcher that publishes to Vercel Queues |
| graphile-worker queue and crontab | Vercel Queues topics and consumers; Vercel Cron for schedules |
| `run_analysis` job | A queue consumer route that calls `runAnalysis`, or a Vercel Workflow step |
| `release_report` with Playwright Chromium | A Workflow or queue consumer using `@sparticuz/chromium-min` with `puppeteer-core`/`playwright-core`; bundle under 250 MB, or use Vercel large functions (5 GB beta) |
| `ingest_dataset` with GDAL CLI | `gdal-async` in a large function, or restrict ingestion to GeoJSON/PostGIS-readable files and keep GDAL for offline staff imports |
| `record_heartbeat` every 5 minutes | Supabase `pg_cron` writes the heartbeat directly, or Vercel Cron on Pro (minimum every minute) |
| `daily_jurisdiction_maintenance` | Supabase `pg_cron` calling a SQL function, or a Vercel Cron route on Pro |
| `build_records_export` | A queue consumer or Workflow step |
| Worker host | Nothing to run |

### E2. Transactional enqueue with an outbox

Vercel Queues cannot participate in a PostgreSQL transaction. Keep the existing guarantee with the transactional outbox pattern:

1. In the same transaction as the data change, insert a row into `job_outbox` with the task name, JSON payload, an idempotency key, and `available_at`.
2. A dispatcher — a Vercel Cron route on Pro, or a Vercel Workflow — reads undispatched rows with `for update skip locked`, publishes each to its Vercel Queue topic with `idempotencyKey`, and marks the row dispatched.
3. A queue consumer calls the existing module function. The function is already idempotent by input hash or record id.
4. A failed publish is retried by the dispatcher; a failed consumer is retried by Queues. Both are at-least-once, which the handlers already tolerate.

This preserves “a change never exists without its job” without graphile-worker.

### E3. PDF rendering on Vercel

The proven pattern is:

- `puppeteer-core` (or `playwright-core`) plus `@sparticuz/chromium-min`;
- the Chromium binary stored in Supabase Storage or another object bucket and downloaded once per cold start;
- `page.pdf({ tagged: true, outline: true })` in the consumer;
- the function bundle kept under 250 MB, or the large-functions beta enabled for up to 5 GB.

Test the tagged PDF and outline before relying on it. If Chromium cannot be made to fit or start reliably, keep report release on the external worker host; it is the one job that most benefits from a real browser image.

### E4. GDAL on Vercel

`gdal-async` provides Node.js bindings and can run in a large function. It adds a native binary and must be tested on the Vercel runtime. A lower-risk alternative is:

- accept only GeoJSON or a PostGIS-readable file in the web upload;
- use `gdal-async` or a one-off staff job for other formats;
- keep the external worker for ingestion if the city's sources need full GDAL.

### E5. Scheduling

- **Vercel Cron:** Pro allows once per minute and 100 jobs per project. Hobby allows once per day only.
- **Supabase `pg_cron`:** runs inside Postgres with no HTTP, ideal for the heartbeat and daily maintenance. It can call `pg_net` to hit a Vercel route if a job must run in application code.
- **Queues:** use delayed messages for retries and backoff; the maximum delay is 7 days.

### E6. Why this is not the current deployment

It replaces three working pieces at once — the queue, the PDF renderer, and the ingester — and each has a failure mode that is visible to a planner. The current worker container is the low-risk path while the pilot proves the product. Migrate one job type at a time, starting with `build_records_export` or `run_analysis`, and keep report release on the worker until the Vercel PDF path has passed the same golden tests.

---

## Part F — Pilot go-live checklist

Do not open the pilot to planners until every line is true:

- [ ] The Supabase project has PostGIS, pgvector, Auth, Storage, and a recorded backup window.
- [ ] Migrations `0000`–`0011` have run; no migration is edited after it is applied.
- [ ] Vercel has the full environment; the browser has no Supabase or NVIDIA key.
- [ ] The worker image is running with the crontab, a session-mode database connection, Chromium, and GDAL.
- [ ] `/api/health` returns 200, or its remaining failures are documented and harmless.
- [ ] One restore from backup has succeeded into a scratch project.
- [ ] A planner registers with a confirmed email address; a second registered person sees none of the first person's projects.
- [ ] A project runs analysis, every section becomes ready, and version 1 downloads.
- [ ] A research change publishes version 2 and version 1 still downloads unchanged.
- [ ] No sample row exists in the pilot database.
- [ ] The restricted database role and its grants are in place, or the risk is accepted in writing.
- [ ] A Content Security Policy is set and the map still renders.
- [ ] Secrets are in a password manager, not only in Vercel or the worker host.
- [ ] The city's public-records export has been produced once.
