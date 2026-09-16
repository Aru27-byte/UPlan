# UPlan — Alternatives and Trade-offs

**Status:** Draft — system-level technical design
**Last updated:** 2026-09-12
**Related:** [tech-stack.md](tech-stack.md) · [system-architecture.md](system-architecture.md) · [data-model.md](data-model.md)

One record per decision. A change to the stack starts here: update the record, then the documents that cite it.

## D1. One modular monolith with two process types

**Chosen.** One repository and TypeScript codebase. It builds a Next.js `web` process and a graphile-worker `worker` process, and both use one PostgreSQL database.

**Considered.**

- _Microservices per feature_ — network boundaries, distributed transactions, and duplicated authorization. More code, and new race conditions.
- _Serverless functions_ — execution time limits for PDF rendering and data ingestion, and no job enqueue inside the database transaction.
- _Jobs inside the Next.js process_ — heavy rendering and GDAL work would compete with page requests, and scaling one would scale both.

**Trade-offs accepted.** Module boundaries rest on lint rules and review, not the network. The worker needs its own bundle step, done with esbuild.

**Revisit when.** A module needs independent scaling or its own team.

## D2. Next.js 16 with the App Router

**Chosen.** Server Components for reads, Server Functions for mutations, route handlers for uploads, downloads, and tiles.

**Considered.**

- _React Router 8 in framework mode_ — the closest runner-up, with simpler data loading and fewer caching concepts. It has a smaller ecosystem and a history of framework churn.
- _React single-page app with a Fastify API_ — a duplicated API layer and client-side data fetching. More code.
- _SvelteKit_ — a smaller pool of accessible component libraries and developers.

**Trade-offs accepted.** Next.js caching features stay off for regulated data. The Next.js docs warn that Proxy coverage can silently change, so every Server Function and route handler checks access itself.

**Revisit when.** Next.js changes defaults so that data routes become static or cached.

## D3. Node.js 24 LTS, TypeScript 6.0, npm

**Chosen.** Node.js 24 LTS. TypeScript 6.0 with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`. npm with a committed lockfile.

**Considered.**

- _TypeScript 7.0_ — the native compiler is much faster, but typescript-eslint's peer range stops below 6.1. Upgrading would cost the type-aware rules that catch floating promises.
- _Bun or Deno_ — not the decided Node stack, with library compatibility risk.

**Trade-offs accepted.** Slower type checking than TypeScript 7.

**Revisit when.** typescript-eslint and Next.js both support TypeScript 7.

## D4. PostgreSQL 18 with PostGIS 3.6

**Chosen.** One PostgreSQL database with PostGIS, holding relational data, spatial data, the job queue, and sessions, plus F2's retrieval index later in v1 (D21). It runs in a container on the VM (D17).

**Considered.**

- _SQL Server with spatial types_ — weaker Node tooling and fewer spatial functions.
- _MongoDB_ — a poor fit for the multi-row invariants this product depends on, and limited spatial analysis.
- _A separate spatial service, such as Python with GeoPandas_ — a second language and a second service.

**Trade-offs accepted.** The team needs PostGIS skills.

**Revisit when.** Data volume outgrows one database, which one city's data will not.

## D5. Drizzle ORM, with SQL for spatial work

**Chosen.** A Drizzle schema per module, drizzle-kit migrations, and `sql` templates for PostGIS functions, on the node-postgres driver.

**Considered.**

- _Prisma_ — spatial types need raw SQL anyway, and it adds its own query engine.
- _Kysely_ — an excellent SQL builder, but schema types and migrations need extra tools.
- _Raw `pg` with hand-written types_ — more code, and the types drift from the schema.

**Trade-offs accepted.** Drizzle is still 0.x, with 1.0 in release candidates. Geometry columns need custom column types.

**Revisit when.** Drizzle 1.0 is stable. Upgrade on purpose, not by accident.

## D6. City profiles as immutable JSON documents

**Chosen.** Each approved profile is one `profile_version` row holding the whole document as JSONB. One Zod schema validates it, and the same schema drives the Excel template, the editor, and the diff between versions.

**Considered.**

- _Normalized rule tables copied for each version_ — the database would enforce structure, but at the cost of several tables plus mapping and copy code.
- _Event sourcing of rule edits_ — auditable, but every read replays events. Much more code.

**Trade-offs accepted.** PostgreSQL can't enforce the document's inner structure, so every write goes through one validated function. Queries across versions need JSON operators.

**Revisit when.** Rules must be queried across many cities in SQL.

## D7. Concurrency control

**Chosen.**

- Immutable versions.
- Compare-and-set state transitions.
- Row locks wherever a "current" pointer moves.
- Unique and partial unique indexes for one-at-a-time rules.
- Jobs enqueued in the same transaction as the change that needs them.
- One job queue per decision, city, or dataset, so related work runs in series.

**Considered.**

- _SERIALIZABLE isolation everywhere, with retry loops_ — correct, but retry handling spreads through every code path.
- _Advisory locks or Redis locks_ — the lock lives apart from the data it protects and can be lost in a crash.
- _Last write wins_ — silently loses a planner's work.

**Trade-offs accepted.** Some actions fail with a conflict the user must resolve. For example, a city can't have two pending profile changes at once.

**Revisit when.** Conflicts become common enough that users need merging.

## D8. graphile-worker for background jobs

**Chosen.** graphile-worker on the same database. Jobs are added with `graphile_worker.add_job()` inside the transaction that triggers them. Named queues run related jobs one at a time, and every job sets `max_attempts` explicitly.

**Considered.**

- _pg-boss_ — also Postgres-based and capable. graphile-worker's SQL `add_job`, job keys, and named queues map more directly onto enqueueing inside a transaction.
- _BullMQ_ — needs Redis, and enqueueing can't share the database transaction.
- _Amazon SQS_ — a crash between the database commit and the send loses the job.

**Trade-offs accepted.** Job throughput is bounded by PostgreSQL, which is ample for one city. The library's default of 25 attempts would retry failures for a long time, so every job overrides it.

**Revisit when.** Job load competes with interactive queries.

## D9. Spatial analysis in PostGIS, in the jurisdiction's projected coordinates

**Chosen.** Geometries are stored in EPSG:4326. Measurements and buffers happen after transforming to the jurisdiction's `analysis_srid`, which is EPSG:2926 for Sammamish.

**Considered.**

- _Turf.js in Node or the browser_ — approximations that can disagree with the database and the report.
- _Storing everything in the local projection_ — simpler queries, but every table is tied to one state plane zone.

**Trade-offs accepted.** Transforming at query time costs CPU, which is negligible at city scale.

**Revisit when.** Multi-city analysis makes the transforms slow.

## D10. Map stack

**Chosen.**

- MapLibre GL JS renders the map, and Terra Draw handles tracing.
- Evidence layers are vector tiles made by PostGIS `ST_AsMVT`. Each tile URL includes the dataset version, so a tile never changes and can be cached as immutable.
- The basemap is a Protomaps extract of the city's area, built from OpenStreetMap data with the `pmtiles` command-line tool, and served by Caddy from the VM's disk.
- Terra Draw is adapter-based — it has no rendering code of its own — so wiring it to MapLibre needs `terra-draw-maplibre-gl-adapter`, the same project's official adapter package (peer deps `terra-draw@^1.0.0`, `maplibre-gl>=4`, both already pinned here). Writing an equivalent adapter by hand against `terra-draw`'s exported `TerraDrawExtend` base classes would be more code, not less, to maintain a capability the ecosystem already publishes (`.claude/rules/best-practices.md`: "A new dependency must remove more code than it adds").

**Considered.**

- _Leaflet_ — simpler, but weak with large vector layers and no WebGL.
- _OpenLayers_ — full-featured, with a heavier API.
- _ArcGIS Maps SDK_ — familiar to city GIS staff, but licensed and heavy.
- _Mapbox GL JS_ — proprietary license.
- _A Martin tile server_ — one more service to run.
- _Prebuilt PMTiles per dataset version_ — fast, but adds tippecanoe to ingestion.
- _Hosted basemap APIs_ — third-party availability and terms.

**Trade-offs accepted.** Someone must refresh the basemap file on purpose. No aerial imagery source is chosen yet; the map-workspace design picks a public-domain one.

**Revisit when.** Tile load from PostGIS becomes noticeable.

## D11. GDAL command-line tools for ingestion

**Chosen.** The worker runs `ogr2ogr`, and GDAL raster tools where a source is raster, to load public data into staging tables. SQL then moves the features into `evidence_feature`.

**Considered.**

- _`gdal-async` Node bindings_ — native module builds, with the same GDAL underneath.
- _Pure JavaScript parsers for each format_ — much more code, and fewer formats.

**Trade-offs accepted.** A non-JavaScript binary in the worker image, whose exit codes and output must be checked explicitly.

**Revisit when.** The base image stops providing GDAL.

## D12. The locked report

**Chosen.**

- The report is a React component rendered to static HTML. The worker prints it with Playwright's Chromium, using `tagged: true` and `outline: true`.
- Maps inside the report are SVG paths that PostGIS generates with `ST_AsSVG`, from the same geometries the numbers came from.
- The PDF's SHA-256 is recorded, and the file is stored write-once in the `reports` bucket. The application's credentials can create objects but never overwrite or delete them, and a retention rule blocks everyone else until an administrator removes it.

**Considered.**

- _React-PDF_ — needs no browser, but can't produce tagged PDFs, so reports would not be accessible.
- _Typst_ — excellent typesetting, but a second template language.
- _Screenshots of the live WebGL map_ — heavier, and nondeterministic in headless browsers.
- _PDF permission passwords_ — trivial to remove.
- _PAdES digital signatures_ — would make altered copies detectable, at the cost of certificate and key management. Deferred.
- _S3 Object Lock with a retention date per object_ — OCI's S3 compatibility API doesn't support it. A bucket retention rule is OCI's equivalent.

**Trade-offs accepted.** A forwarded copy can still be altered; the recorded hash and the write-once original prove what UPlan released. The worker image carries Chromium. A retention rule covers the whole bucket, so disposing of one report would mean lifting protection from all of them; disposal is designed with records export.

**Revisit when.** A city asks for signed PDFs.

## D13. Excel with read-excel-file and write-excel-file

**Chosen.** write-excel-file generates the template from the profile schema, read-excel-file parses uploads, and Zod validates every row.

**Considered.**

- _ExcelJS_ — one library for reading and writing, but no release since version 4.4.0 in October 2023.
- _SheetJS Community Edition_ — current builds ship from the vendor's CDN; npm stops at 0.18.5.
- _A hand-made template file in the repository_ — drifts from the schema.

**Trade-offs accepted.** Two small libraries instead of one.

**Revisit when.** Either library stops being maintained.

## D14. Better Auth: the city's sign-in for city staff, GitHub for UPlan staff

**Chosen.** Better Auth with `@better-auth/sso`, signing city staff in over OIDC through the city's identity provider, such as Microsoft Entra ID. UPlan staff have no city account, so they sign in with GitHub through Better Auth's built-in GitHub provider, and only a GitHub account linked to a `staff_member` row gets staff rights. Sessions are stored in PostgreSQL, and roles live in UPlan's own `membership` and `staff_member` tables.

**Considered.**

- _`openid-client` directly_ — small and standards-focused, but sessions, CSRF protection, and account linking would become our own code.
- _Hosted identity (WorkOS, Auth0, Clerk)_ — the least code, but another vendor holding government staff identities, with per-user cost.
- _NextAuth_ — its npm `latest` release is still 4.x.
- _Passkeys for UPlan staff_ — no outside service at all, but enrollment and recovery would become our own code.
- _Guest accounts for UPlan staff in each city's tenant_ — no second sign-in path, but every city's IT would have to invite and remove vendor staff.

**Trade-offs accepted.** Better Auth owns its tables and their text ids. UPlan staff can't sign in while GitHub is down.

**Revisit when.** Several cities with different identity providers make a hosted SSO broker worth its cost, or UPlan's team adopts a work identity provider.

## D15. Drafting rule updates with RAG on open models (later in v1)

**Chosen.**

- A retrieval-augmented generation workflow in the worker that runs entirely on the VM (see _Drafting code changes with retrieval_ in the architecture).
- Qwen3.5-4B (Apache 2.0) generates, and Qwen3-Embedding-0.6B (Apache 2.0) embeds. llama.cpp's server hosts both in router mode, in the `models` container.
- A JSON Schema grammar constrains the output. Deterministic checks match it against the quoted sources, and UPlan staff confirm it before it reaches any decision _(round 9)_.
- Poppler's `pdftotext` turns PDFs into text.

**Considered.**

- _The Claude API_ — the previous choice. Strong drafts, but paid per token, and an external call.
- _The OpenAI API_ — also paid per token, and also external.
- _OpenAI's gpt-oss-20b open weights_ — Apache 2.0, and strong at structured output, but OpenAI sizes it for 16 GB of memory. The whole VM has 12 GB.
- _Qwen3.5-9B_ — better drafts, but at 4-bit it needs about 6.5 GB, which leaves too little for PostgreSQL, the worker, and Chromium.
- _Gemma 4 E4B_ — Apache 2.0 and a similar size. The runner-up if the evaluation set favors it.
- _Ollama_ — easier model downloads, but a second layer over the same engine, with its own model store to keep in step with pinned files.
- _Generation without retrieval, pasting whole ordinances_ — longer prompts are slow on two cores, and the model wouldn't see the current rules it has to change.
- _Docling for PDF conversion_ — better with tables and scans, but a Python stack and more memory in the worker.
- _Rule-based parsing of ordinances_ — brittle against legal prose, and a large amount of code.
- _Manual drafting by UPlan staff_ — no model risk, but slow.

**Trade-offs accepted.**

- A 4B model drafts less reliably than frontier models. The checks turn many of its mistakes into visible failed drafts, and staff confirmation catches the rest.
- On two shared cores a draft takes minutes per changed section. Drafts run in the background, one at a time.
- A scanned ordinance with no text layer fails with that reason. Planners can upload the rules instead (F17).
- Only public code text reaches the models, and nothing leaves the VM.

**Revisit when.** The evaluation set shows staff routinely rewriting drafts, or the VM gains enough memory for a larger model.

## D16. Phones as a responsive web app

**Chosen.** The same Next.js app, laid out for small screens, with look-up views only _(round 7)_.

**Considered.**

- _Installable PWA with offline caching_ — offline copies of rules and evidence go stale without anyone noticing.
- _Capacitor wrapper_ — app-store overhead, with no new capability.
- _React Native_ — a second UI codebase, contradicting "one application."

**Trade-offs accepted.** No offline use on site visits, and no app-store listing.

**Revisit when.** Planners need offline look-up and accept that it must be labeled as possibly out of date.

## D17. Hosting at zero cost on Oracle Cloud's Always Free tier

**Chosen.**

- One Always Free Arm VM with 2 OCPUs, 12 GB of memory, and a 200 GB boot volume, running Docker Compose: `caddy`, `web`, `worker`, `postgres`, `models`, and the one-off `migrate`.
- Object Storage, Bastion, and monitoring from the same Oracle tenancy, so the infrastructure has one provider.
- The city's DNS name points at the VM's reserved IP, and Caddy gets the certificate from Let's Encrypt.
- Secrets in two root-only files on the VM. Images built on the VM at deploy time.
- The tenancy upgraded to Pay As You Go, with a one-dollar budget alert. Every resource stays within Always Free limits, so the bill stays at zero.

**Considered.**

- _AWS: ECS on Fargate, RDS, S3, and CloudFront_ — the previous choice. Managed and highly available, but paid.
- _Other clouds' free tiers_ — Google Cloud's always-free VM has 1 GB of memory, and AWS and Azure free offers expire after months.
- _Vercel Hobby_ — limited to non-commercial use, and it can't run the worker, Chromium, or GDAL.
- _Free managed PostgreSQL, such as Neon or Supabase_ — 0.5 GB of storage. graphile-worker's always-open connection would keep Neon's compute running past its free hours, and Supabase pauses free projects that go quiet for a week.
- _Cloudflare Tunnel, CDN, and firewall in front of the VM_ — no open ports and better protection at the edge, but they need a registered domain, which costs money.
- _OCI Vault for secrets_ — encrypted and audited, but it needs instance policies and a fetch step at boot.
- _A container registry_ — builds once in CI, but Arm images and private registry storage stretch free allowances.
- _A second provider for offsite backups_ — survives losing the Oracle account, at the cost of another service.

**Trade-offs accepted.**

- One VM means no high availability, a few seconds of downtime per deploy, and hours to rebuild from backups if the VM is lost.
- 2 OCPUs and 12 GB are shared by everything, so memory limits are set per container and model work yields the CPU.
- Oracle halved the Always Free Arm allowance in June 2026 without an announcement. Limits can change again, and free tiers carry no service level agreement.
- Data and backups share one provider. Losing the Oracle account would lose both; the city's records exports (F16) are the copies outside UPlan.
- Oracle's documentation doesn't say whether upgrading exempts a tenancy from idle-instance reclamation; users report that it does. The health monitor would report a reclaimed VM within 10 minutes.
- The VM serves HTTPS directly, with no web application firewall or CDN in front of it.

**Revisit when.** A city contract funds hosting, the pilot needs an uptime commitment, Oracle changes the free limits again, or v2 opens UPlan to residents.

## D18. Testing

**Chosen.**

- Vitest for unit and integration tests.
- Testcontainers with a PostGIS image that adds pgvector, for everything that touches SQL.
- Playwright Test with axe for end-to-end and accessibility checks.
- Storage tests against development buckets in the same Oracle tenancy, with the same create-only permissions as production.
- Tests of model-dependent code use recorded model responses and fixture vectors kept beside the test. An evaluation suite runs the real models against golden ordinances before any model, quantization, or prompt change ships.
- GitHub Actions runs everything, the evaluation suite only when started by hand.

**Considered.**

- _Jest_ — slower, with weaker ESM and TypeScript support.
- _Mocked databases_ — would hide exactly the SQL, locking, and PostGIS behavior that matters most.
- _S3 emulators_ — MinIO's community edition is in maintenance mode, and an emulator wouldn't enforce OCI's create-only permissions.
- _Calling the real models in every test run_ — slow on CI runners, and the output changes whenever a model file does.

**Trade-offs accepted.** Integration tests need Docker. Storage tests need development credentials, and their requests count against the free Object Storage allowance.

**Revisit when.** Storage tests take a noticeable share of the request allowance.

## D19. ESLint with type-aware rules, and Prettier

**Chosen.** ESLint 10 flat config with these rules:

- typescript-eslint's type-checked rules, notably `no-floating-promises`, `no-misused-promises`, and `switch-exhaustiveness-check`.
- eslint-plugin-import-x `no-cycle`.
- `no-restricted-imports` to enforce module boundaries.

Prettier handles formatting.

**Considered.**

- _Biome_ — one fast tool, but fewer type-aware rules.
- _The TypeScript compiler alone_ — no promise-safety rules.

**Trade-offs accepted.** Two tools, and slower linting than Biome.

**Revisit when.** Biome reliably catches floating promises.

## D20. React Aria Components with Tailwind CSS

**Chosen.** React Aria Components for interactive controls, styled with Tailwind CSS.

**Considered.**

- _shadcn/ui_ — copies component source into the repository, which is more code to own.
- _MUI_ — heavy, with opinionated styling.
- _Headless UI_ — a smaller set of components.

**Trade-offs accepted.** Every primitive is styled by us.

**Revisit when.** The component set stops covering what the UI needs.

## D21. Retrieval index in PostgreSQL, with pgvector and full-text search (later in v1)

**Chosen.** Document chunks, their embeddings in a `vector(1024)` column with an HNSW index, and a generated `tsvector` live in PostgreSQL beside the profile they're compared with. One SQL query ranks chunks by exact section references, by vector distance, and by full-text match, and fuses the three rankings with reciprocal rank fusion.

**Considered.**

- _A dedicated vector database, such as Qdrant, Weaviate, or Chroma_ — another service, using memory the VM doesn't have, and chunks stored outside the transaction that stores their document.
- _Vector search alone_ — misses exact legal references, such as section numbers.
- _Full-text search alone_ — misses rules whose wording changed.
- _A reranking model_ — better ordering, at the cost of another model in memory and more minutes per draft.

**Trade-offs accepted.** The index is tied to one embedding model. Changing models means embedding every document again, as new rows.

**Revisit when.** The evaluation set shows relevant sections ranked outside the top 8, which would make a reranker worth its memory.

## D22. Operations at zero cost: a health check, Oracle's monitor, and pgBackRest

**Chosen.**

- `GET /api/health` checks the database, the worker heartbeat, WAL archiving, backup freshness, disk space, and jobs that used up their attempts.
- An OCI APM synthetic monitor calls it every 10 minutes. Monitoring alarms email UPlan staff through Notifications when it fails, and when Object Storage nears its free limits.
- pgBackRest archives WAL continuously and takes nightly backups into Object Storage.
- pino logs stay on the VM, in Docker's local log driver.

**Considered.**

- _Grafana Cloud's free tier_ — searchable logs, metrics, and dashboards, but one more external service with its own agent.
- _A self-hosted Prometheus, Loki, and Grafana_ — memory the VM doesn't have.
- _OCI Logging with Connector Hub_ — central logs without another provider, at the cost of an agent configuration, a log group, and a connector.
- _OCI block volume backups_ — nothing to configure, but at most five backups, and up to a day of lost work.
- _Nightly `pg_dump`_ — simple, but it loses up to a day of work and restores slowly.

**Trade-offs accepted.** Logs are read on the VM, and they're lost if the VM is. The monitor runs inside Oracle's cloud, so an outage across the region could silence the monitor along with the app.

**Revisit when.** UPlan serves more than one city, or an incident can't be explained from the logs on the VM.

Sources: [Oracle: Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [InfoQ: Oracle halves Always Free Ampere A1 limits](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/) · [Oracle: Object Storage retention rules](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules.htm) · [OpenAI: gpt-oss](https://openai.com/index/introducing-gpt-oss/) · [Unsloth: Qwen3.5 memory requirements](https://unsloth.ai/docs/models/qwen3.5) · [Google: Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) · [Neon: plans](https://neon.com/docs/introduction/plans) · [Supabase: free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) · [Vercel: Hobby plan](https://vercel.com/docs/plans/hobby)
