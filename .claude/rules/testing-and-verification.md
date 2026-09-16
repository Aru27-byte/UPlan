# Testing and Verification

## What gets tested, and how

| Layer                                                                                       | Tool                                                         | Rule                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure logic: schemas, `rulesInForce`, diffs, formatters                                      | Vitest unit tests                                            | No database, no network                                                                                                                                                                                    |
| Anything that runs SQL: data access, the impact engine, transactions, constraints, triggers | Vitest with Testcontainers                                   | A real PostgreSQL with PostGIS at production's major versions. Never a mocked or in-memory database                                                                                                        |
| Storage                                                                                     | Vitest against the development buckets in OCI Object Storage | Real object storage with create-only credentials. A test asserts that overwriting or deleting an object fails                                                                                              |
| User flows                                                                                  | Playwright Test                                              | Release 1 end to end: upload a profile, approve it, create a decision, trace a footprint, see the impact, release the report                                                                               |
| Accessibility                                                                               | `@axe-core/playwright` inside the end-to-end specs           | No WCAG 2.1 A or AA violations on any page the specs visit                                                                                                                                                 |
| Released PDFs                                                                               | Vitest integration test                                      | Tagged, with an outline, containing the provenance text, and matching its stored hash                                                                                                                      |
| Retrieval and drafting (F2)                                                                 | The evaluation suite, against the real models                | Golden ordinances with their expected sections and rule changes. A change to a model file, quantization, prompt, chunking, or retrieval query ships only if retrieval recall and draft accuracy don't drop |

## Tests that are always required

- **A test for every requirement.** Each `R` id in a feature's Requirements doc has at least one test whose name starts with that id.
- **A failing test before every bug fix**, reproducing the bug.
- **A race test for every concurrency guard.** Start both competing operations at once on separate database connections: two approvals, two saves of one footprint, a release against a profile approval. Assert that exactly one succeeds and the other fails with `ConflictError`. A guard without its race test isn't done.
- **A failure test for every path a fallback could creep into.** Missing required data, an unknown template version, a failed fetch, an invalid drawn geometry, an unreachable model server, a draft that fails a check: each test asserts the explicit error, never a default.
- **Golden fixtures for impact numbers.** Use hand-checked geometries in the analysis projection with known areas and buffer overlaps, and assert values at the precision the report displays. When a rule depends on a missing attribute, assert the range.
- **Determinism.** Running the same analysis inputs twice produces byte-identical `results`.

## Writing tests

- Test a module through its `index.ts`, not its private functions.
- No sleeps or time-based waits. Wait for the actual event or state: a job's finished row, a response, a visible element.
- Control today's date through the injected clock in tests of rules in force, retention, and anything else date-dependent.
- Mock only what lies outside UPlan's infrastructure: public data sources and city websites. Use recorded responses kept beside the test.
- Tests of model-dependent code use recorded model responses and fixture vectors kept beside the test, because model output changes whenever a model file does. Only the evaluation suite calls the real models.
- Every test creates its own data, and none depends on another test's state or order.

## Verification before calling work done

1. Read `package.json` and run only scripts it defines. Once the toolchain is scaffolded, they are `npm run typecheck`, `npm run lint`, `npm test` for unit tests, `npm run test:integration`, `npm run test:e2e`, and `npm run eval:drafting` for F2's evaluation suite.
2. Run the tests covering what changed, plus the full unit suite.
3. For UI changes, also run the end-to-end specs for the affected pages, including their accessibility checks and a phone-width viewport.
4. For a change to a model file, quantization, prompt, chunking, or retrieval query, also run the evaluation suite.
5. When a change touches a feature's design, check that its Requirements and TechDesign docs still agree with `/design-check <feature>`.
6. Report results as they are: paste failing output, and name anything you didn't run and why.

Never call work finished while a check is failing, or skipped without saying so.
