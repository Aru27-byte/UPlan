# Do Not

Hard constraints. If a task seems to need one of these broken, stop and ask instead.

## Output and files

- **No artifacts.** Don't publish Artifact pages. Don't create files nobody asked for: no scratch files, notes, summaries, reports, or TODO lists in the repository. Deliver work as edits to real project files, and explain it in the conversation.
- Don't commit generated output: builds, coverage, test results, screenshots, rendered PDFs, uploads, or logs.
- Don't write documentation outside `Requirements/` and `TechDesign/` unless asked.
- Don't say "X remains unchanged." Show the code.
- Don't show part of a changed function. Show the whole function, or the whole component.

## Code

- Don't add a fallback mechanism, as defined in the best-practices rules.
- Don't create a parallel version of an existing component, function, or module (`*V2`, `new*`, `legacy*`). Rewrite the existing one.
- Don't leave an obsolete file, export, or dependency behind without flagging it.
- Don't use `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` comments, non-null assertions, or `as` casts on external data.
- Don't use `enum`, `namespace`, default exports outside the files Next.js requires, or barrel files other than a module's `index.ts`.
- Don't leave floating promises, `console.log`, commented-out code, or `.only` and `.skip` in tests.
- Don't add a dependency without its decision record in `TechDesign/alternatives-and-tradeoffs.md`.

## Cost and services

- Don't add a paid service, a paid tier, or a paid API, including the Claude or OpenAI APIs.
- Don't call an external AI API. Models run in the `models` container on the VM.
- Don't add an external service, a container, or a model without a decision record, or without checking it against the VM's memory limits and the free-tier budget.
- Don't add configuration that a default already covers.

## Data and concurrency

- Don't update or delete profile versions, uploads, evidence features, geometry revisions, finished analysis runs, ready dataset versions, released reports, indexed code documents and their chunks, or finished drafts.
- Don't check and then write outside one transaction, and don't enforce a one-at-a-time rule in code alone.
- Don't coordinate work through in-memory state, locks, queues, or timers.
- Don't run model work outside the `rag` queue.
- Don't enqueue a job outside the transaction that needs it, or without `max_attempts`.
- Don't edit an applied migration, and don't run migrations when the app starts.
- Don't use Next.js data caching (`use cache`, `cacheComponents`, `unstable_cache`, or time-based `revalidate`) for rules, evidence, decisions, or reports.

## Product

- Don't compute an area, length, or buffer in JavaScript. PostGIS computes every number UPlan shows.
- Don't write text that recommends approving, denying, conditioning, or clearing land. Don't use a language model to draft findings, recommendations, or conditions; F2's model drafts only profile rules with quoted sources.
- Don't count significant trees, and don't assume a field-rated attribute such as a wetland rating.
- Don't ingest licensed, applicant-submitted, or consultant data as evidence.
- Don't display a figure without its provenance, and don't present `retrieved_at` as the publisher's date.
- Don't send applicant or personal data to any external API.

## Security

- Don't rely on `src/proxy.ts` for authorization. Check access in the module function.
- Don't query city data without scoping it to a jurisdiction the actor belongs to.
- Don't put secrets in the repository, images, logs, or anything sent to the browser.
- Don't publish ports from any container but `caddy`, or open inbound ports on the VM beyond 80 and 443.
- Don't import runtime code from `@/modules` or `@/platform` into `*.client.tsx` files or `src/ui/`.

## Process

- Don't write implementation code for a feature before its TechDesign doc exists.
- Don't run or recommend an npm script that `package.json` doesn't define.
- Don't commit, push, or open pull requests unless asked.
