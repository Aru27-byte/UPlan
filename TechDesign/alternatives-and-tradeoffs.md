# UPlan — Alternatives and Trade-offs

**Status:** Draft — system-level technical design; D27 and D28 added 2026-10-10
**Last updated:** 2026-10-10
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
- The basemap is served, and read, as a single `.pmtiles` file — a **vector** tile archive read entirely over HTTP range requests, which is what Caddy's `file_server` + `handle_path` were already built to serve ("the basemap file served with byte ranges") and what Protomaps' own free daily builds actually publish (their product is vector, not pre-rendered raster tiles). MapLibre has no built-in reader for the format, so `basemap-style.client.ts` uses the `pmtiles` npm package (Protomaps' own client library) to register a `pmtiles://` protocol handler, and `@protomaps/basemaps` (the actively maintained successor to the now-deprecated `protomaps-themes-base`) to generate the ~100 fill/line paint rules a basemap needs, instead of hand-authoring them.
- Text labels (`symbol` layers) are filtered out of that generated style: rendering them needs font glyphs and sprite icons, and Protomaps only publishes those from a live `protomaps.github.io` URL — an always-on third-party call this app has no other reason to make. Everything else (roads, water, parks, buildings) still renders from the same downloaded-on-purpose `.pmtiles` extract, no external call at runtime. Bundling the glyph/sprite files locally, the same way the extract itself is downloaded once and served from disk, is the addressable follow-up if labels are wanted (see `basemap-style.client.ts`'s comment).

**Considered.**

- _Leaflet_ — simpler, but weak with large vector layers and no WebGL.
- _OpenLayers_ — full-featured, with a heavier API.
- _ArcGIS Maps SDK_ — familiar to city GIS staff, but licensed and heavy.
- _Mapbox GL JS_ — proprietary license.
- _A Martin tile server_ — one more service to run.
- _Prebuilt PMTiles per dataset version_ — fast, but adds tippecanoe to ingestion.
- _Hosted basemap APIs_ — third-party availability and terms.
- _Raster PNG basemap tiles_ (a `{z}/{x}/{y}.png` URL template) — an earlier implementation pass assumed this, but nothing in the free Protomaps ecosystem publishes pre-rendered raster tiles, and Caddy's own config already only ever served one range-requested file, not a tile-file tree — corrected to match what was already the documented and deployed intent.

**Trade-offs accepted.** Someone must refresh the basemap file on purpose. No aerial imagery source is chosen yet; the map-workspace design picks a public-domain one. Local development regenerates its own small extract with the `pmtiles` CLI (see `LOCAL_HOSTING.md`) rather than sharing production's file.

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
- The PDF's SHA-256 is recorded, and the file is stored in the database, write-once behind a trigger (D23). _(Revised 2026-09-27: it was stored in the `reports` bucket with create-only credentials and a retention rule.)_

**Considered.**

- _React-PDF_ — needs no browser, but can't produce tagged PDFs, so reports would not be accessible.
- _Typst_ — excellent typesetting, but a second template language.
- _Screenshots of the live WebGL map_ — heavier, and nondeterministic in headless browsers.
- _PDF permission passwords_ — trivial to remove.
- _PAdES digital signatures_ — would make altered copies detectable, at the cost of certificate and key management. Deferred.
- _S3 Object Lock with a retention date per object_ — OCI's S3 compatibility API doesn't support it. A bucket retention rule is OCI's equivalent, and D23 replaced the bucket for documents.

**Trade-offs accepted.** A forwarded copy can still be altered; the recorded hash and the write-once original prove what UPlan released. The worker image carries Chromium. Disposal of one document is designed with records export.

**Revisit when.** A city asks for signed PDFs.

## D13. Excel with read-excel-file and write-excel-file

**Chosen.** write-excel-file generates the template from the profile schema, read-excel-file parses uploads, and Zod validates every row.

**Considered.**

- _ExcelJS_ — one library for reading and writing, but no release since version 4.4.0 in October 2023.
- _SheetJS Community Edition_ — current builds ship from the vendor's CDN; npm stops at 0.18.5.
- _A hand-made template file in the repository_ — drifts from the schema.

**Trade-offs accepted.** Two small libraries instead of one.

**Revisit when.** Either library stops being maintained.

## D14. Supabase Auth: email and password sign-in for everyone

**Chosen.** Supabase Auth, on a free-tier hosted project, through `@supabase/supabase-js` and `@supabase/ssr`. Everyone registers and signs in with an email address and a password. Supabase holds the credentials and the session; UPlan keeps an `app_user` row per person, with the Supabase user id in a separate `auth_id` column, and staff rights stay in UPlan's own `staff_member` table. Registering grants no staff rights, and a person works on the projects they create (D24; the per-city `membership` table was removed on 2026-09-27). All calls run on the server, so the browser holds no Supabase client and no key. Supersedes the earlier choice of Better Auth with the city's OIDC provider for city staff and GitHub for UPlan staff, which is removed: `better-auth`, `@better-auth/sso`, their tables, and the `CITY_OIDC_*`, `GITHUB_*`, and `BETTER_AUTH_*` settings.

**Why the existing providers can't do the job.** Oracle's Always Free tier gives a VM, not an identity service; running one means writing password storage, rate limiting, and session handling ourselves. The product owner chose to hand that to a managed service and to drop the city-identity-provider dependency, which the pilot could not have set up without the city's IT.

**Exception to the personal-data rule.** `best-practices.md` keeps personal data inside the VM and its Object Storage. Supabase Auth stores each person's email address, name, and password hash outside it. The exception covers those three fields and nothing else: no decision, applicant, parcel, or evidence data goes to Supabase, and the application database keeps only the user id, name, and email. Supabase is a named external service, alongside GitHub and Let's Encrypt.

**Considered.**

- _Self-hosting Supabase's open-source auth server (GoTrue) on the VM_ — keeps credentials in-house and needs no exception, but adds a container and its configuration to a 12 GB VM, and the owner preferred the hosted service.
- _Keeping Better Auth with a password method_ — no new vendor, but password storage, reset, and rate limiting stay our code.
- _Hosted identity (WorkOS, Auth0, Clerk)_ — comparable to Supabase, with per-user cost past small free tiers.
- _NextAuth_ — its npm `latest` release is still 4.x.

**Trade-offs accepted.**

- **A vendor holds staff credentials**, as noted above.
- **Free projects pause after a week of inactivity.** While paused, sign-in fails with the "couldn't reach the sign-in service" message (R1) until someone restores the project in the dashboard. Signed-in sessions keep working only until their tokens need refreshing.
- **Email is the weak spot.** The built-in email service sends to the project's own team members only, at 2 messages an hour, so "Confirm email" can't work for real users without a custom SMTP sender. The pilot runs with it off; a registrant's address is then unproven, and staff check identity before granting access. Adding an SMTP provider is a new external service and needs its own record.
- **Free allowance:** 50,000 monthly active users, far above the pilot.
- **Existing people must be linked by hand.** Better Auth's ids don't match Supabase's, so each person from before this change has an `app_user` row with no `auth_id`. An operator links them with one statement (deployment guide). Their ids, staff rights, and history are untouched. Matching by email automatically was rejected: while "Confirm email" is off, anyone could register a colleague's address and inherit their projects and staff rights.

**Revisit when.** The pilot needs verified addresses (add SMTP and turn on "Confirm email"), the project's inactivity pause causes an outage, or several cities' own identity providers make single sign-on worth building.

## D15. Drafting rule updates with RAG on open models (later in v1)

> **Superseded in part by D27 (2026-10-10).** The retrieval, checks, and staff confirmation stand. The models no longer run on the VM; they are NVIDIA's hosted models, called from a Server Action. The reasoning below on model size and VM memory is history.

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

> **Superseded by D28 (2026-10-10),** which moves the target to Vercel and Supabase. The record stays because its reasons for rejecting Vercel are the open items D28 lists.

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

## D23. Final documents are stored in the database

**Chosen.** A published document is a row in `report`: the PDF in a `bytea` column beside its SHA-256, numbered as a version, and protected by a trigger that rejects any change or delete. The worker prints it with Playwright, as before, and stores it in the same transaction that completes the project. Object Storage no longer holds documents.

**Considered.**

- _Object Storage with create-only credentials (the first design)_ — strong write-once protection, but a second place that must agree with the database, a failure mode between the two (an object written and a row not updated), credentials a local developer must have for the app to work at all, and a retention rule that only exists in production.
- _Object Storage plus a copy in the database_ — two copies to keep identical, for no gain.
- _A PDF library in the web process_ — no browser, but it can't produce the tagged, outlined, accessible PDF the requirements ask for, and it would be a new dependency.

**Trade-offs accepted.** Documents add to the database's size and backups: a few hundred kilobytes each, which the pilot's volume makes negligible. The protection against tampering is a database trigger rather than storage permissions, so an operator with schema-owner rights could still change a row. The hash recorded beside it is how anyone detects that. The list queries never read the `pdf` column, so the history page stays fast.

**Revisit when.** Documents grow past a few megabytes each, or a city requires write-once storage that a trigger can't satisfy. The `reports` bucket and its variables stay configured, unused, until a deploy removes them.

## D24. A project belongs to its creator: no jurisdiction membership

**Chosen.** Access to a project is `decision.created_by`. The membership table, its grant and revoke functions, and the planner and reviewer checks are removed. Everyone who signs in is a planner. `staff_member` stays for the actions that need a second pair of eyes: approving profile changes, creating datasets and jurisdictions, installing sample evidence, and exporting records. A project that isn't the actor's, is deleted, or is absent is one `NotFoundError`.

**Considered.**

- _Keep membership and default every registered person into the pilot city_ — it hides the removal instead of doing it, and leaves a table whose only rows say "everyone".
- _Share every project with everyone in the city_ — the simplest model for a team, but it lets any planner change a colleague's work and read an applicant's details, which the charter's privacy posture doesn't support.
- _Per-project sharing now_ — the right answer for reviewers, but a feature of its own (F12), and nothing in release 1 needs it.

**Trade-offs accepted.** Colleagues can't see each other's projects until F12 designs sharing. Work that several members of a city could once see is visible to its creator alone after the migration. Anyone can register and reach the app, and a stranger sees only their own empty dashboard, which matters less now that "Confirm email" being off can't grant access to anything.

**Revisit when.** A supervisor needs to review a planner's project (F12), or the app opens beyond one city.

## D25. Deleting a project hides it and keeps its records

**Chosen.** "Delete research" sets `deleted_at` and `deleted_by` on the decision, and every read filters on it. Nothing else is touched.

**Considered.**

- _A hard delete with cascades_ — the request's plain reading, but working data may be public record (charter; F16), the data model forbids deleting geometry revisions, finished runs, and released documents, and a cascade would break the version history.
- _Deleting only in-progress projects_ — leaves a completed project impossible to remove from a person's dashboard.

**Trade-offs accepted.** A planner who deletes a project still has its records in the database. The confirmation says so. Purging is a records process (F16), not a button.

**Revisit when.** A city's retention setting requires disposal to be actioned in UPlan.

## D26. Phase outputs are derived and reviews are append-only; drafting stays deterministic

**Chosen.** A phase's output is computed from immutable records and fingerprinted; it is never stored. A planner's review is one append-only row bound to the fingerprint it was made on. The drafted summaries are fixed sentence templates over PostGIS measurements. No language model writes any phase output, in this or any release-1 feature.

**Considered.**

- _Storing each output_ — duplicates the run's results and adds a second place for numbers to disagree.
- _A language model to write summaries_ — reads well, but every sentence becomes untestable, it can't be pinned to a measurement, it contradicts `do-not.md` and the charter's posture, and a released report would depend on a model file. F2's model drafts only profile rules, with quoted sources.
- _A single "phase approved" flag_ — goes stale the moment an input changes, and can't say what was reviewed.

**Trade-offs accepted.** The summaries are plainer than generated prose. Their wording is changed in code, reviewed in a pull request, and versioned by `TEMPLATE_VERSION`.

**Revisit when.** A model can be constrained so that every sentence it writes is provably backed by a measurement, and the charter's posture allows it.

**Amended 2026-10-10 (D27).** The decision stands for phase outputs. AI assist (F24) is a separate, labeled aid beside them, so the model still never sits between a measurement and its sentence.

## D27. AI assist on NVIDIA's hosted inference, beside the analysis and never inside it

**Chosen.**

- A new module, `assist`, and one platform client, `src/platform/model-client.ts`, that calls NVIDIA's OpenAI-compatible API (`integrate.api.nvidia.com/v1`) with `fetch` and Zod. The key is a server-side environment variable. Model ids are constants, pinned in code, changed only through a pull request that passes the evaluation set.
- Six fixed output kinds: Explain, Questions, Find, Compare, Metadata draft, and Rule draft. Each has a Zod shape with a place for an exact quote, and each output passes deterministic checks for quotes, copied numbers, verdict words, and references.
- Only four classes of input leave UPlan: published code text, dataset metadata, profile rules, and project results with identity removed.
- Suggestions are stored in their own tables, bound to the output they were made on, requested by a person, and never part of the analysis, the fingerprint, or the released document. Metadata and rule drafts take effect only when staff other than the requester confirm.
- Embeddings use `nvidia/nv-embedqa-e5-v5` at 1,024 dimensions, so D21's `vector(1024)` column and index are unchanged.

**Considered.**

- _Keep models on the VM (D15)._ Private and free, but it needs the VM, and the stated hosting target no longer has one. A 4B model also drafts and explains less reliably than a hosted model in the 49B to 70B class.
- _The Claude or OpenAI APIs._ Stronger, but paid per token, which the zero-cost constraint rules out, and the city has made no data-sharing agreement.
- _Let the model write the phase summaries or the report._ Rejected by D26 and the charter: untestable sentences that cannot be pinned to a measurement.
- _A chat assistant._ No fixed shape to check, and it needs project identity in context.
- _Send the whole project for context._ Would put applicant and parcel identity at a third party. The allow-list sends measurements only.
- _Automatic suggestions on page load._ Spends the free allowance on unread text and invites trust in unrequested output. A button is one extra click.
- _A fallback to another hosted model on failure._ A fallback mechanism; failures are shown.
- _A worker queue for assist calls._ The target has no worker, and one call per request fits a function invocation. A queue would add a race to solve a problem that does not exist.

**Trade-offs accepted.**

- A third party sees requests, and its free tier is rate-limited, intended for development and evaluation, and its catalog changes. Mitigated by the allow-list, the caps, pinned ids, and every phase working without assist.
- Quote and number checks reject some true outputs (hyphenation, rounding). The cost is a visible rejection, never a wrong display.
- Output is not reproducible. It is stored and shown as stored.

**Revisit when.** NVIDIA's terms don't allow the pilot's use, a model id is retired and no candidate passes the evaluation set, or the city funds a paid or self-hosted model.

## D28. Hosting on Vercel and Supabase

**Chosen _(the stated infrastructure, 2026-10-10)_.**

- Vercel hosts the Next.js application. Supabase provides PostgreSQL with PostGIS and pgvector, Auth (already D14), and Storage through an S3-compatible endpoint, which keeps the existing S3 client.
- AI assist needs nothing else (D27).

**Considered.** D17's Oracle VM, which runs the worker, Chromium, and GDAL, and the options D17 rejected. D17 rejected Vercel Hobby because it is limited to non-commercial use and cannot run the worker, Chromium, or GDAL. Those objections are still true, so the move creates the following work, none of it designed yet.

**Open items this decision creates.**

| Concern | Was | On Vercel and Supabase | Status |
| --- | --- | --- | --- |
| Background jobs (analysis run, report release, ingestion, daily sweeps, heartbeat) | graphile-worker, a long-lived process (D8) | No long-lived process. Candidates: Vercel Cron calling a route that drains a Postgres queue; Supabase `pg_cron` with Edge Functions; running each job inline in a function within `maxDuration` | Open |
| Enqueue in the same transaction | `graphile_worker.add_job()` | Keep a Postgres jobs table written in the same transaction, drained by the chosen runner | Open |
| PDF rendering | Playwright Chromium in the worker (D12) | Chromium in a function (a trimmed build) within size and time limits, or a different renderer that still produces a tagged PDF with an outline (P3, WCAG) | Open, and it must be proven |
| Dataset ingestion | GDAL command-line tools (D11) | No GDAL in a function. Candidates: ingest in PostGIS from GeoJSON or a PostGIS-readable file, or ingestion outside Vercel by staff | Open |
| Analysis runtime | A job on a two-core VM | PostGIS inside Supabase; the run is SQL, so it may fit a function, but a long run can exceed `maxDuration` | Open |
| Basemap file | `caddy` serves a `.pmtiles` file | Supabase Storage or Vercel static files with range requests | Open |
| Backups and restore | pgBackRest to Object Storage | Supabase's own backups; check the free plan's retention | Open |
| Health check | OCI synthetic monitor | A route plus an external monitor, or Vercel's own | Open |
| Database size | 200 GB boot volume | The free plan's limit (about 500 MB), with documents stored as `bytea` | Open |
| Eligibility | — | Vercel Hobby is non-commercial; a city pilot may need Pro | Open |
| Project pausing | — | Supabase pauses a free project after a week idle (D14) | Known |

**Trade-offs accepted.** Less to administer, and free tiers that fit a pilot's dozens of users. In return, the heavy work has no home yet, and two free tiers (Supabase and NVIDIA) carry no service levels.

**Revisit when.** The jobs and PDF items are decided, which should happen before any further release 1 code assumes a worker.

Sources: [Oracle: Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [InfoQ: Oracle halves Always Free Ampere A1 limits](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/) · [Oracle: Object Storage retention rules](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules.htm) · [OpenAI: gpt-oss](https://openai.com/index/introducing-gpt-oss/) · [Unsloth: Qwen3.5 memory requirements](https://unsloth.ai/docs/models/qwen3.5) · [Google: Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) · [Neon: plans](https://neon.com/docs/introduction/plans) · [Supabase: free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) · [Vercel: Hobby plan](https://vercel.com/docs/plans/hobby)
