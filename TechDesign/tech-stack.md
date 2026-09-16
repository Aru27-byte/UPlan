# UPlan — Tech Stack

**Status:** Draft — system-level technical design
**Last updated:** 2026-09-12
**Derived from:** [charter.md](../Requirements/charter.md), [intents.md](../Requirements/intents.md), [features.md](../Requirements/features.md)
**Related:** [system-architecture.md](system-architecture.md) · [data-model.md](data-model.md) · [alternatives-and-tradeoffs.md](alternatives-and-tradeoffs.md)

Each choice cites its decision record (D1, D2, …) in _alternatives-and-tradeoffs.md_, where the rejected options and accepted trade-offs live. Version lines were checked against the npm registry and each project's own pages on 2026-09-12. Once the toolchain exists, `package-lock.json` pins exact package versions, and the Compose file pins images by digest.

## Principles behind the stack

- **Zero cost.** Every choice is open-source software, or a free tier used within its limits. No paid API, and no paid tier.
- **Few services, little configuration.** One VM runs everything from one Compose file. Oracle Cloud's Always Free tier provides the infrastructure, and the only other external services are GitHub and Let's Encrypt.
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
| Protomaps basemap (OpenStreetMap data) with `pmtiles` | 4            | A basemap extract for the city's area, served by Caddy from the VM's disk | D10      |

## Data

| Choice                      | Version line  | Role                                                                                                     | Decision |
| --------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| PostgreSQL                  | 18            | All relational data, the job queue, sessions, and the retrieval index, in a container on the VM          | D4       |
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

## Retrieval and drafting (F2, later in v1)

| Choice                                                 | Version line           | Role                                                                                                             | Decision |
| ------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server`) | Pinned by image digest | Serves both models to the worker in router mode: embeddings, and generation constrained by a JSON Schema grammar | D15      |
| Qwen3.5-4B, GGUF Q4_K_M (2.74 GB)                      | Pinned by SHA-256      | Drafts profile changes from retrieved passages. Apache 2.0                                                       | D15      |
| Qwen3-Embedding-0.6B, GGUF Q8_0 (639 MB)               | Pinned by SHA-256      | Embeds code chunks and queries as 1,024-dimension vectors. Apache 2.0                                            | D15, D21 |

## Files and documents

| Choice                                               | Version line | Role                                                                                                  | Decision |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | -------- |
| OCI Object Storage, through its S3 compatibility API | —            | Uploaded workbooks, raw public data, code documents, write-once reports, records exports, and backups | D12, D17 |
| AWS SDK for JavaScript (`@aws-sdk/client-s3`)        | 3            | The one object storage client, pointed at OCI's S3 compatibility endpoint                             | D17      |
| read-excel-file and write-excel-file                 | 9 and 4      | Parsing profile uploads, and generating the template from the profile schema                          | D13      |
| Playwright (Chromium)                                | 1.63         | Printing the report to PDF with `tagged: true` and `outline: true`                                    | D12      |

## Identity

| Choice                              | Version line | Role                                                                                                                                                            | Decision |
| ----------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Better Auth with `@better-auth/sso` | 1.7          | City staff sign in over OIDC through the city's identity provider. UPlan staff sign in with Better Auth's built-in GitHub provider. Sessions live in PostgreSQL | D14      |

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

## Hosting and operations at zero cost

| Choice                                                      | Version line                       | Role                                                                               | Cost basis  | Decision |
| ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ----------- | -------- |
| Oracle Cloud Infrastructure Arm VM (`VM.Standard.A1.Flex`)  | 2 OCPUs, 12 GB, 200 GB boot volume | Runs every process                                                                 | Always Free | D17      |
| Ubuntu Server                                               | 24.04 LTS                          | Host operating system, with unattended security upgrades                           | Open source | D17      |
| Docker Engine with the Compose plugin                       | —                                  | Runs every container from one Compose file                                         | Open source | D17      |
| Caddy                                                       | 2.11                               | HTTPS with automatic certificates, HTTP/3, the reverse proxy, and the basemap file | Open source | D17      |
| Let's Encrypt                                               | —                                  | The TLS certificate for the city's hostname                                        | Free        | D17      |
| OCI Bastion                                                 | —                                  | Time-limited SSH sessions for administration and deploys                           | Free        | D17      |
| OCI APM synthetic monitoring, Monitoring, and Notifications | —                                  | The health check from outside the VM, alarms, and alarm email                      | Always Free | D22      |
| pgBackRest                                                  | 2                                  | WAL archiving and encrypted backups to Object Storage                              | Open source | D22      |
| GitHub                                                      | Free plan                          | Repository, CI, and the OAuth app for UPlan staff                                  | Free        | D14, D18 |

## Standards the stack must meet

- **Zero cost.** Each free allowance, with its limit and planned use, is listed in _Free-tier budget_ in the architecture. A paid service, or a change that would exceed an allowance, needs a decision record first.
- **Accessibility: WCAG 2.1 AA** for the app and for every released PDF. The DOJ's ADA Title II rule applies WCAG 2.1 AA to state and local government web content. After the April 2026 extension, governments serving 50,000 or more people must comply by April 26, 2027.
- **Numbers come from one place.** Areas, lengths, and buffers are computed only in PostGIS, in the jurisdiction's projected coordinate system. For Sammamish that is EPSG:2926, Washington State Plane North in US survey feet.
- **Free public data only** _(round 9)_. Every dataset records its license, and no licensed dataset is ingested.

## Deliberately left out

| Left out                                                                     | Why                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Paid services and APIs, including the Claude and OpenAI APIs                 | Zero cost. Drafting runs on open models on the VM                                                                                 |
| Redis or any second datastore                                                | PostgreSQL already provides the queue, locks, sessions, and vector search                                                         |
| A separate vector database, such as Qdrant, Weaviate, or Chroma              | One more service using memory the VM doesn't have. pgvector keeps chunks beside the rules they're compared with                   |
| A reranking model                                                            | Another model in memory, and more minutes per draft. It's the first upgrade if retrieval misses sections                          |
| Microservices, GraphQL, a separate API server                                | One Next.js app with Server Functions needs less code                                                                             |
| Native mobile apps and offline mode                                          | Phones only look things up _(round 7)_, and offline copies go stale                                                               |
| Geometry math in JavaScript, such as Turf.js                                 | Numbers on screen must match the report, so PostGIS computes all of them                                                          |
| Data caches that can serve stale data (`use cache`, time-based revalidation) | Stale rules or evidence would be a hidden failure. Version-addressed tiles are the one cached response, because they never change |
| Feature-flag services                                                        | Staged releases ship as code, and flags that route around failures are fallbacks                                                  |
| A CDN, web application firewall, or tunnel in front of the VM                | They need a registered domain, which costs money. The city's hostname points at the VM                                            |
| Observability services, or a self-hosted Prometheus and Grafana              | One more service, or memory the VM doesn't have. The health check and OCI's monitor catch failures                                |
| A secrets manager                                                            | Two root-only files on the VM hold the few secrets                                                                                |
| A container registry and Kubernetes                                          | One VM builds and runs its own images                                                                                             |
| S3 emulators such as MinIO                                                   | MinIO's community edition is in maintenance mode, and an emulator wouldn't enforce OCI's create-only permissions                  |
| OCR and layout-analysis tools, such as Docling                               | A heavier Python stack for scanned PDFs. A PDF without a text layer fails with that reason instead                                |

Sources: package versions and the typescript-eslint peer range from the npm registry, checked 2026-09-12 · [Oracle: Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [InfoQ: Oracle halves Always Free Ampere A1 limits](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/) · [Caddy releases](https://github.com/caddyserver/caddy/releases) · [pgvector changelog](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) · [llama.cpp: server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) · [llama.cpp: Docker images](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md) · [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) · [Qwen3.5-4B GGUF files](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) · [Qwen3-Embedding-0.6B GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) · [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) · [Next.js: proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) · [Playwright release notes: page.pdf() tagged and outline](https://playwright.dev/docs/release-notes) · [graphile-worker: add_job](https://worker.graphile.org/docs/sql-add-job) · [Jackson Lewis: DOJ extends Title II web accessibility deadlines](https://www.jacksonlewis.com/insights/doj-extends-public-entities-compliance-deadline-ada-related-website-accessibility-hhss-may-2026-deadline-still-looms) · [Elestio: MinIO maintenance mode](https://blog.elest.io/minio-is-in-maintenance-mode-your-guide-to-s3-compatible-storage-alternatives/)
