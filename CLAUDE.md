# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UPlan is a greenfield **urban planning application**, delivered as one application to both browser and mobile. The implementation stack is TypeScript/Node. The repo currently contains no application code.

The product charter settles scope, users, and posture. It is a live draft — anything it marks as *proposed* or lists under *open questions* is not decided, so do not build on it as though it were:

@Requirements/charter.md

UPlan is unrelated to the "True Path Navigator" chatbot described in the user-level Claude settings (`~/.claude/settings.json`, `autoMode.environment`). Do not carry that project's stack, environment variables, file names, or commands into this repo.

## Spec-first workflow

Work moves in one direction: **charter → intents → feature list → Requirements → TechDesign → code.** Do not write implementation code for a feature before its TechDesign doc exists.

Each feature is a matched pair of Markdown docs sharing one kebab-case basename:

```
Requirements/study-area-screening.md    what the system must do, and why
TechDesign/study-area-screening.md      how it will be built
```

Keep the pair in sync — changing a requirement means revisiting its design doc. Requirements are numbered (`R1`, `R2`, …) so the design doc can cite them by ID.

`Requirements/charter.md`, `Requirements/intents.md`, and `Requirements/features.md` are product-level documents with no TechDesign counterpart; the pairing rule covers feature docs only. Name each pair with the basename its feature has in `Requirements/features.md`.

## No toolchain exists yet

There is no `package.json`, `tsconfig.json`, test runner, linter, or formatter in this repo. Do not run or recommend `npm test`, `npm run build`, or any other script until that script actually exists in a `package.json` — read the manifest before claiming a command works.

Use **npm**. `pnpm`, `yarn`, `bun`, `make`, and `gh` are not installed on this machine.

This directory is not a git repository. Git and GitHub workflows are unavailable until `git init` is run.
