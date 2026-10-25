# UPlan — Tech Stack

**Status:** Current as of 2026-10-24 — system-level technical design; deployment rows reflect the Vercel + Supabase + managed worker deployment
**Last updated:** 2026-10-24
**Implementation:** Current stack; the Oracle VM rows in `deploy/` are historical.
**Derived from:** [charter.md](../Requirements/charter.md), [intents.md](../Requirements/intents.md), [features.md](../Requirements/features.md)
**Related:** [system-architecture.md](system-architecture.md) · [data-model.md](data-model.md) · [alternatives-and-tradeoffs.md](alternatives-and-tradeoffs.md)

Each choice cites its decision record (D1, D2, …) in _alternatives-and-tradeoffs.md_, where the rejected options and accepted trade-offs live. Version lines were checked against the npm registry and each project's own pages on 2026-09-12. `package-lock.json` pins exact package versions. The worker image is built from the Dockerfile; pin its base image by digest in a production build.

## Principles behind the stack

- **Zero cost where possible.** Every choice is open-source software or a free tier used within its limits. No paid API. Vercel Pro may be needed for a commercial city pilot; that is a hosting plan, not an API.
- **Few services, little configuration.** Vercel hosts the application, Supabase holds the data, sign-in, and files, one managed worker host runs the jobs, and NVIDIA serves the model calls. GitHub hosts the code. There is no self-run database or web server.
- **Less code.** One repository, one language, one database, and two process types of our own. A dependency earns its place only by removing more code than it adds.
- **The database guards the invariants.** Constraints, row locks, and immutable rows prevent race conditions. No coordination lives in application memory.
- **Failures stay visible.** No layer substitutes defaults, cached data, another source, or another model when something fails.
- **The report is the product (P3).** Integrity and accessibility of the released PDF shape the rendering stack.

## Runtime and language

| Choice     | Version line | Role                                                                                                              | Decision |
| ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Node.js    | 24 LTS       | Runs the web and worker processes                                                                                 | D3       |
| TypeScript | 6.0          | Not 7.0: typescript-eslint supports `typescript >=4.8.4 <6.1.0`, and its type-aware rules catch floating promises | D3       |
| npm        | 11           | The only package manager                                                                                          | D3       |

## Web application

| Choice                | Version line | Role                                                                                       | Decision |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------ | -------- |
| Next.js (App Router)  | 16           | Pages, Server Functions, route handlers. `src/proxy.ts` only redirects signed-out visitors | D2       |
| React                 | 19           | UI                                                                                         | D2       |
| React Aria Components | 1            | Accessible interactive controls                                                            | D20      |
| Tailwind CSS          | 4            | App styling. The report uses its own print stylesheet                                      | D20      |

## Maps

| Choice                                                | Version line | Role                                                                      | Decision |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------- | -------- |
| MapLibre GL JS                                        | 6            | Map workspace in the browser and on phones                                | D10      |
| Terra Draw                                            | 1            | Tracing study areas and footprints                                        | D10      |
| terra-draw-maplibre-gl-adapter                        | 1            | The official adapter wiring Terra Draw's drawing modes to MapLibre GL JS  | D10      |
| PostGIS vector tiles (`ST_AsMVT`)                     | —            | Evidence layers, served per dataset version                               | D10      |
| Protomaps basemap (OpenStreetMap data) with `pmtiles` | 4            | A basemap extract for the city's area, served as a static file by Vercel | D10      |
| pmtiles (npm)                                         | 4            | Reads the `.pmtiles` basemap archive client-side via a MapLibre protocol  | D10      |
| @protomaps/basemaps                                   | 5            | Generates the basemap's fill/line paint rules from the same archive       | D10      |

## Data

| Choice                      | Version line  | Role                                                                                                     | Decision |
| --------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| PostgreSQL                  | 18            | All relational data, the job queue, and the retrieval index, on Supabase Postgres with PostGIS and pgvector | D4, D28  |
| PostGIS                     | 3.6           | All spatial measurement and analysis                                                                     | D4, D9   |
| pgvector                    | 0.8           | Later in v1: embeddings and HNSW search for F2's retrieval index                                         | D21      |
| Drizzle ORM and drizzle-kit | 0.45 and 0.31 | Schema, migrations, typed queries. Spatial and vector SQL goes in `sql` templates                        | D5       |
| node-postgres (`pg`)        | 8             | The one database driver, shared with graphile-worker                                                     | D5, D8   |
| Zod                         | 4             | Validation at every boundary: forms, uploads, environment, job payloads, profile documents, model output | D6       |

## Background work

| Choice                  | Version line | Role                                                                                                                         | Decision |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| graphile-worker         | 0.18         | Postgres-backed jobs: analysis runs, report release, data ingestion, retention flags, the heartbeat, and later F2's drafting | D8       |
| GDAL command-line tools | 3.8 or later | Loading public GIS data into PostGIS, in the worker image                                                                    | D11      |
| Poppler `pdftotext`     | —            | Later in v1: turning code and ordinance PDFs into text for F2, in the worker image                                           | D15      |

## AI assist, retrieval, and drafting (F24, and F2 later in v1)

| Choice                                          | Version line              | Role                                                                                                                                  | Decision |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| NVIDIA hosted inference API (`integrate.api.nvidia.com/v1`) | OpenAI-compatible API | Generation and embeddings for AI assist and F2, over HTTPS from the server, with an API key in a Vercel environment variable. Called with `fetch` and Zod: no SDK | D27      |
| `nvidia/nemotron-3-ultra-550b-a55b` | Pinned id in `model-client.ts` | Fills the fixed output shapes, thinking off. Chosen unmeasured; a change must pass `npm run eval:assist`                       | D27      |
| `nvidia/nemotron-3-embed-1b` | Pinned id in `model-client.ts` | Embeds code chunks and questions; the first 1,024 of its 2,048 dimensions are kept and re-normalized, stored in pgvector | D21, D27 |
| llama.cpp, Qwen3.5-4B, Qwen3-Embedding-0.6B     | —                         | **Superseded by D27.** The earlier on-VM design (D15), kept only as history                                                           | D15      |

## Files and documents

| Choice                                               | Version line | Role                                                                                                  | Decision |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | -------- |
| Supabase Storage, through its S3 compatibility API | — | Uploaded workbooks, raw public data, code documents, and records exports. Published reports are stored in the database. | D12, D28 |
| AWS SDK for JavaScript (`@aws-sdk/client-s3`) | 3 | The one object storage client, pointed at Supabase Storage's S3 endpoint with `forcePathStyle: true` | D28 |
| read-excel-file and write-excel-file                 | 9 and 4      | Parsing profile uploads, and generating the template from the profile schema                          | D13      |
| Playwright (Chromium)                                | 1.63         | Printing the report to PDF with `tagged: true` and `outline: true`                                    | D12      |

## Identity

| Choice                              | Version line | Role                                                                                                                                                            | Decision |
| ----------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Supabase Auth, through `@supabase/supabase-js` and `@supabase/ssr` | 2 and 0.12   | Everyone registers and signs in with an email address and a password. Supabase holds the credentials and sessions; UPlan mirrors each person into `app_user` | D14      |

## Quality and delivery

| Choice                                            | Version line | Role                                                           | Decision |
| ------------------------------------------------- | ------------ | -------------------------------------------------------------- | -------- |
| Vitest                                            | 5            | Unit and integration tests                                     | D18      |
| Testcontainers (`@testcontainers/postgresql`)     | 12           | Real PostgreSQL with PostGIS and pgvector in integration tests | D18      |
| Playwright Test with `@axe-core/playwright`       | 1.63 and 4   | End-to-end and accessibility tests                             | D18      |
| ESLint, typescript-eslint, eslint-plugin-import-x | 10, 8, 4     | Type-aware lint rules, module boundaries, no import cycles     | D19      |
| Prettier                                          | 3            | Formatting                                                     | D19      |
| esbuild                                           | 0.28         | Bundles the worker entry point                                 | D1       |
| pino                                              | 10           | Structured JSON logs to standard output                        | D22      |
| GitHub Actions                                    | —            | CI for the GitHub repository                                   | D18      |

## Hosting and operations

**Current (D28, D29): Vercel for the application, Supabase for the database, sign-in, and files, one managed worker host for the jobs, and NVIDIA for model calls.**

| Choice | Version line | Role | Cost basis | Decision |
| --- | --- | --- | --- | --- |
| Vercel | Pro recommended; Hobby for evaluation | Hosts the Next.js application: pages, Server Actions, route handlers, and optional Cron Jobs | Free tier for Hobby (non-commercial, 300 s functions, daily cron); Pro for a pilot | D28 |
| Supabase (Postgres with PostGIS and pgvector, Auth, Storage) | Free plan or paid | The database, sign-in, and files, through one project | Free tier is about 500 MB and pauses after a week idle; a pilot should use a paid plan | D14, D28 |
| Managed worker host (Render, Railway, Fly.io, Cloud Run with min instances 1, or the existing Oracle VM) | One small always-on container | Runs the `worker` image: graphile-worker, Chromium, GDAL, Poppler | Free/paid depending on host; the worker is the only always-on process | D29 |
| GitHub | Free plan | Repository and CI | Free | D18 |
| NVIDIA inference API | Free, rate-limited | Generation and embeddings for AI assist and the future F2 | Free, rate-limited; confirm terms for a city pilot | D27 |
| External uptime monitor | Free or low-cost | Polls `/api/health` and alerts staff | Free/low-cost | D22 |

The `deploy/` directory and its Oracle Compose stack remain in the repository as a historical reference. They are not the current deployment.

## Standards the stack must meet

- **Zero cost where possible.** Each free allowance, with its limit and planned use, is listed in _Free-tier budget_ in the architecture. A paid API, or a change that would exceed an allowance, needs a decision record first. Vercel Pro is an accepted pilot hosting cost if Hobby's terms do not fit.
- **Accessibility: WCAG 2.1 AA** for the app and for every released PDF. The DOJ's ADA Title II rule applies WCAG 2.1 AA to state and local government web content. After the April 2026 extension, governments serving 50,000 or more people must comply by April 26, 2027.
- **Numbers come from one place.** Areas, lengths, and buffers are computed only in PostGIS, in the jurisdiction's projected coordinate system. For Sammamish that is EPSG:2926, Washington State Plane North in US survey feet.
- **Free public data only** _(round 9)_. Every dataset records its license, and no licensed dataset is ingested.

## Deliberately left out

| Left out                                                                     | Why                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Paid APIs, including the Claude and OpenAI APIs | No paid API. Model calls use NVIDIA's free hosted inference _(D27)_. Vercel Pro is a hosting plan, not an API. |
| A fallback model, or a second model service                                  | A fallback hides a failure. A failed call is shown, and the phase works without assist                                            |
| A chat assistant over a whole project                                        | No fixed shape to check, and it needs project identity in context. Every assist has one purpose, input, and shape                 |
| Redis or any second datastore                                                | PostgreSQL already provides the queue, locks, and vector search                                                         |
| A separate vector database, such as Qdrant, Weaviate, or Chroma | One more service and one more copy of the chunks to keep in step. pgvector keeps them beside the rules they are compared with. |
| A reranking model                                                            | Another model in memory, and more minutes per draft. It's the first upgrade if retrieval misses sections                          |
| Microservices, GraphQL, a separate API server                                | One Next.js app with Server Functions needs less code                                                                             |
| Native mobile apps and offline mode                                          | Phones only look things up _(round 7)_, and offline copies go stale                                                               |
| Geometry math in JavaScript, such as Turf.js                                 | Numbers on screen must match the report, so PostGIS computes all of them                                                          |
| Data caches that can serve stale data (`use cache`, time-based revalidation) | Stale rules or evidence would be a hidden failure. Version-addressed tiles are the one cached response, because they never change |
| Feature-flag services                                                        | Staged releases ship as code, and flags that route around failures are fallbacks                                                  |
| A separate CDN, web application firewall, or tunnel | Vercel terminates TLS and serves the app from its edge. A WAF is not configured; Supabase's network controls cover the database. |
| Observability services, or a self-hosted Prometheus and Grafana | Vercel and Supabase dashboards plus one external uptime monitor cover a pilot. A dedicated observability stack is a later decision. |
| A secrets manager | Vercel and the worker host hold server-side environment variables; the few long-lived secrets are also in a password manager. |
| A container registry and Kubernetes | Vercel builds the web app, and the worker host builds or pulls one image. Kubernetes is unnecessary for one worker. |
| S3 emulators such as MinIO | Supabase Storage provides the S3-compatible endpoint in production and development. |
| OCR and layout-analysis tools, such as Docling                               | A heavier Python stack for scanned PDFs. A PDF without a text layer fails with that reason instead                                |

Sources: package versions and the typescript-eslint peer range from the npm registry, checked 2026-09-12 · [Vercel Functions limits](https://vercel.com/docs/functions/limitations) · [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) · [Vercel Queues](https://vercel.com/docs/queues) · [Vercel Workflows](https://vercel.com/docs/workflows) · [Supabase Storage S3 compatibility](https://supabase.com/docs/guides/storage/s3/authentication) · [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector) · [pgvector changelog](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) · [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) · [Next.js: proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) · [Playwright release notes: page.pdf() tagged and outline](https://playwright.dev/docs/release-notes) · [graphile-worker: add_job](https://worker.graphile.org/docs/sql-add-job) · [Jackson Lewis: DOJ extends Title II web accessibility deadlines](https://www.jacksonlewis.com/insights/doj-extends-public-entities-compliance-deadline-ada-related-website-accessibility-hhss-may-2026-deadline-still-looms)
