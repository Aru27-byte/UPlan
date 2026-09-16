# Conventions

## Language and types

- TypeScript 6.0 in `strict` mode, with `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`. That means no `enum`, no `namespace`, and no constructor parameter properties.
- No `any`. Parse unknown data with Zod at the boundary and use the inferred type.
- No non-null assertions (`!`), and no `as` casts on data from outside the process. `as const` is fine.
- Use `type`, not `interface`. States are string literal unions that match the database `CHECK` lists exactly.
- Zod schemas are PascalCase with a `Schema` suffix, and the inferred type drops it: `ProfileDocumentSchema` gives `ProfileDocument`.
- A `switch` over a union handles every case explicitly. Don't add a `default` branch that would hide a new case from `switch-exhaustiveness-check`.

## Naming

| Thing                   | Convention                                                                         | Example                                       |
| ----------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Files and folders       | kebab-case                                                                         | `profile-changes.ts`                          |
| Client components       | kebab-case file ending in `.client.tsx`                                            | `impact-table.client.tsx`                     |
| React components        | PascalCase; one exported component per file                                        | `ImpactTable`                                 |
| Functions and variables | camelCase; booleans start with `is`, `has`, or `can`                               | `rulesInForce`, `isApproximate`               |
| Route segments          | kebab-case folders, camelCase params                                               | `decisions/[decisionId]/report`               |
| Database                | snake_case, singular tables; `*_id`, `*_at` for timestamps, `*_on` for dates       | `decision_geometry.created_at`                |
| Job tasks               | snake_case verb phrases                                                            | `run_analysis`, `release_report`              |
| Job queues and keys     | `<aggregate>:<id>` and `<task>:<id>`. Every job that uses the models goes on `rag` | `decision:<id>`, `run_analysis:<id>`, `rag`   |
| Profile keys            | lowercase kebab-case                                                               | `wetlands`, `forest-canopy`                   |
| Tests                   | start with the requirement id                                                      | `it("R3: rejects a rule without a citation")` |

## Units, dates, and numbers

- Every measured quantity names its unit, such as `widthFt`, `minDbhIn`, or `retainYears`, or carries an explicit `unit` field. In this codebase `Ft` means US survey feet, the unit of EPSG:2926.
- Legal dates like `effectiveOn`, `filedOn`, and `eligibleOn` are `YYYY-MM-DD` strings, never `Date` objects, so no time zone can shift them.
- Timestamps are stored in UTC and displayed in the jurisdiction's `time_zone`.
- Store values unrounded. Round only in the display formatter in `src/modules/provenance/`.
- Domain logic takes today's date from an injected clock, never from `Date.now()` directly.

## Errors

- Expected outcomes throw `ValidationError`, `ConflictError`, `ForbiddenError`, or `NotFoundError` from `src/platform/errors.ts`, with a message a planner can act on.
- Everything else propagates. Catch only at a boundary (a route handler, Server Function, or job task) to translate or record the error, and rethrow anything you can't handle.
- Log once, at that boundary, with the request or job id.

## Data access

- A module's SQL stays in that module. Other code calls its exported functions.
- Spatial SQL uses Drizzle's `sql` template with bound parameters. Never build SQL by concatenating strings.
- A transaction opens in the module function that owns the invariant, never in a route, job task, or component.

## Comments and formatting

- Comments explain why, not what, and cite the requirement or principle a line enforces: `// P2: an empty result is not a clearance.`
- No commented-out code. A `TODO` must name its feature doc and requirement id.
- Prettier with default settings decides formatting. Don't reformat lines you didn't change.

## Presenting code in responses

- **Always output the full component unless told otherwise.**
- **If only one function changes, just show that one.** Show that whole function, never a fragment of it.
- **Be explicit on where snippets go (e.g., below “abc”, above “xyz”).** Give the file path and quote the exact neighboring line.
- **Never say “X remains unchanged” — always show the code.**
- Label every snippet with its file path, and say whether it replaces existing code or is new.
