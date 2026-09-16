# Best Practices

These rules apply to all work in this repository. `TechDesign/` is the source of truth for how UPlan is built. If a rule here and a TechDesign doc disagree, stop and flag the conflict rather than picking one.

## Think first

- **Take your time to ultrathink when on extended thinking mode — thinking is cheaper than fixing bugs.** Reason fully before touching concurrency, SQL, geometry, authorization, or anything that writes a record other records depend on.
- Before editing, read the feature's Requirements and TechDesign docs and the code involved. The spec-first workflow in `CLAUDE.md` applies.

## Less code

- **Less code is better than more code.** The best change is the smallest one that fully meets the requirement.
- A new dependency must remove more code than it adds. It needs a decision record in `TechDesign/alternatives-and-tradeoffs.md` and a row in `TechDesign/tech-stack.md` before it's installed.
- No speculative abstraction: no generic helper, option, or setting until a second real use exists.
- No wrappers around libraries, except at the boundaries the architecture names: database, object storage, auth, jobs, and the model server.
- One way to do each thing. Follow the existing pattern for data access, validation, errors, and jobs instead of adding a second one.

## Zero cost, few services, little configuration

- **Every service costs nothing:** open-source software, or a free tier used within the limits in _Free-tier budget_ in `TechDesign/system-architecture.md`. Never add a paid service, a paid tier, or a paid API, including the Claude and OpenAI APIs.
- **Few external services.** Oracle Cloud's Always Free tier provides the infrastructure, and GitHub and Let's Encrypt are the only other external services. Adding one needs a decision record that says why the existing providers can't do the job.
- **Fit the VM.** 2 OCPUs and 12 GB of memory run everything. Before adding a process, a model, or anything else with a runtime cost, state its memory and CPU needs against the container limits in the architecture.
- **Minimal configuration.** Prefer a default, or one setting in an existing file, over a new file, service, or console resource.
- **Watch the allowances.** A change that raises use of a free allowance, such as Object Storage requests, updates the budget table in the same change.

## Rewrite, don't pile up

- **Rewrite existing components over adding new ones.** Before creating a component, function, or file, search for one that already does most of the job, and change it.
- Never keep two versions side by side, such as `ImpactTableV2` or `legacyRelease`. Replace the old one in the same change.
- **Flag obsolete files to keep the codebase lightweight.** See _Obsolete files_ in the file-structure rules.

## No fallback mechanisms

**No fallback mechanisms — they hide real failures.** When something is missing, invalid, or failing, the failure must reach a person or the logs. Never:

- Put a default in place of required data that is missing, such as `?? 0`, `|| []`, or `?? "unknown"`.
- Catch an error and carry on as if the operation succeeded, or return an empty result from a `catch`.
- Serve cached, stale, or previous data because a fetch failed, unless the failure is displayed alongside it.
- Switch automatically to another data source, code path, model, or service.
- Repair invalid input a person gave, such as a drawn geometry, an upload, or a form value, instead of rejecting it.
- Parse an unknown template or schema version "as best we can."

These are not fallbacks, and they are allowed:

- Retrying the same idempotent job up to an explicit `max_attempts`, with the final failure recorded and shown.
- An alternative a person explicitly chooses, such as uploading a profile workbook when automated reading is blocked.
- A true empty state shown as exactly that. "No mapped wetlands in this study area" is a fact, never a clearance (P2).
- A nullable column for a fact that genuinely may not exist yet, such as an unassigned permit number, displayed as not yet assigned.

## Avoid race conditions at all costs

**Avoid race conditions at all costs.** Follow _Concurrency and consistency_ in `TechDesign/system-architecture.md`:

- Never change a record other records depend on. Create a new version.
- Enforce every one-at-a-time rule with a database constraint, never with check-then-insert code.
- Make every state change a compare-and-set that must affect exactly one row. Zero rows means `ConflictError`.
- Move a "current" pointer only under `SELECT … FOR UPDATE`, in the transaction that creates the new version.
- Enqueue jobs with `graphile_worker.add_job()` inside the transaction that needs them, on the aggregate's named queue, with an explicit `max_attempts`.
- Pin exact versions in every computation. Never read "current" twice within one computation.
- No module-level mutable state, in-memory locks or queues, or `setTimeout` sequencing. Assume many web and worker instances.
- Await every promise, and use `Promise.all` only for truly independent work.
- In the browser, send the revision an edit was based on, block double submission, and discard responses to superseded requests.
- A guard isn't done until its race test passes (see the testing rules).

## Product principles are code rules

- **P1, provenance:** every stored figure carries source, date, and confidence, and every display or export of it goes through the one provenance formatter.
- **P2, screening never clears land:** no code path produces "clear," "safe to develop," or "no study needed."
- **P3, the report is the product:** a report is built only from a pinned analysis run. After release, its row, bytes, and hash never change.
- **Posture:** UPlan never recommends. No generated text proposes approval, denial, or conditions. Conditions are traced, never drafted.
- **Drafting (F2):** a model drafts only profile rules, each backed by an exact quote from a retrieved passage. A draft reaches decisions only after every deterministic check passes and UPlan staff confirm it.
- **Limits of desk analysis:** never count significant trees. When a rule depends on a field-rated attribute, compute the range rather than assuming a value.
- **Free public data only:** licensed, applicant, and consultant data never become evidence.

## Security and privacy

- Authorize inside module functions, for every read and write. `src/proxy.ts` is a convenience redirect, not a security boundary.
- Scope every query of city data to a jurisdiction the actor belongs to.
- Validate every boundary with Zod: form data, route params, uploads, job payloads, environment variables, and API responses.
- Never log secrets, or personal data beyond a user id.
- Keep applicant and personal data inside UPlan's own infrastructure: the VM and its Object Storage. The models run on the VM and receive only public code text.

## Accessibility

- Every page meets WCAG 2.1 AA, and everything shown on the map is also available as text.
- Released PDFs are printed with `tagged: true` and `outline: true`, with a title on every SVG map and header cells in every table.
