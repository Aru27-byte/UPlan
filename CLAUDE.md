# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UPlan is an **urban planning application** delivered as one responsive web application. The implementation stack is TypeScript/Node: Next.js 16, React 19, PostgreSQL/PostGIS, and graphile-worker. It is built and runnable; `Requirements/features.md` records which features are built, backend-only, or not built.

The current deployment is Vercel for the web app, Supabase for PostgreSQL/PostGIS/pgvector, Auth, and Storage, and one managed always-on worker container for analysis, PDF rendering, and ingestion. See `TechDesign/deployment-guide.md`.

The product charter settles scope, users, and posture. It is a live draft — anything it marks as *proposed* or lists under *open questions* is not decided, so do not build on it as though it were:

@Requirements/charter.md

UPlan is unrelated to the "True Path Navigator" chatbot described in the user-level Claude settings (`~/.claude/settings.json`, `autoMode.environment`). Do not carry that project's stack, environment variables, file names, or commands into this repo.

## Spec-first workflow

Work moves in one direction: **charter → intents → feature list → Requirements → TechDesign → code.** Do not write implementation code for a feature before its TechDesign doc exists.

Each feature is a matched pair of Markdown docs sharing one kebab-case basename:

```
Requirements/study-scoping.md    what the system must do, and why
TechDesign/study-scoping.md      how it will be built
```

Keep the pair in sync — changing a requirement means revisiting its design doc. Requirements are numbered (`R1`, `R2`, …) so the design doc can cite them by ID.

`Requirements/charter.md`, `Requirements/intents.md`, and `Requirements/features.md` are product-level documents with no TechDesign counterpart; the pairing rule covers feature docs only. Name each pair with the basename its feature has in `Requirements/features.md`.

## Toolchain

The repository has a working `package.json`, `tsconfig.json`, ESLint/Prettier, Vitest, Playwright, Drizzle, and the Next.js app. Use **npm** (Node 24, npm 11). Read `package.json` before claiming a script exists.

Common commands: `npm run dev`, `npm run build`, `npm run worker:dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run db:migrate`, `npm run db:seed:local -- <email>`.

This directory is a git repository. Do not assume `pnpm`, `yarn`, `bun`, `make`, or `gh` are installed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
