---
name: spec
description: Create the paired Requirements and TechDesign markdown docs for a UPlan feature. Use when starting a feature that has no spec yet, or when asked to write requirements or a technical design for something.
---

Create a matched pair of spec documents for the feature named in `$ARGUMENTS`.

## Steps

1. Derive a kebab-case basename from `$ARGUMENTS` (e.g. "Zoning Overlay Editor" → `zoning-overlay-editor`).
2. Check whether `Requirements/<basename>.md` or `TechDesign/<basename>.md` already exists. If either does, stop and report it — do not overwrite. Offer to update instead.
3. Before writing, ask the user anything you need that the existing docs don't answer: who the feature is for, what problem it solves, and what "done" looks like. Do not invent requirements to fill the template.
4. Write both files using the templates below.
5. Report the two paths you created and list any section you left as a placeholder.

## Requirements/&lt;basename&gt;.md

```markdown
# <Feature Name> — Requirements

**Status:** Draft
**Design:** [TechDesign/<basename>.md](../TechDesign/<basename>.md)

## Problem
What is broken or missing today, and for whom.

## Users and scenarios
Who uses this, and the concrete situations they are in when they do.

## Requirements
Numbered and individually testable. Each states an observable outcome, not an implementation.

- **R1** —
- **R2** —

## Out of scope
What this feature deliberately does not do, so the design does not over-reach.

## Open questions
Unresolved decisions that block or reshape the design.
```

## TechDesign/&lt;basename&gt;.md

```markdown
# <Feature Name> — Technical Design

**Status:** Draft
**Requirements:** [Requirements/<basename>.md](../Requirements/<basename>.md)

## Approach
The shape of the solution in a few paragraphs, and the main alternative rejected.

## Data model
Entities, fields, relationships, and where they are stored.

## Interfaces
APIs, events, and screens this feature exposes or consumes.

## Requirement coverage
Every requirement ID maps to where it is satisfied. This table is what `/design-check` audits.

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1  |              |       |
| R2  |              |       |

## Risks and tradeoffs
What could go wrong, and what was traded away.

## Open questions
```

## Rules

- Requirements describe outcomes; the design describes mechanism. Do not let implementation detail leak into `Requirements/`.
- Every `R` id in the requirements doc must appear in the design doc's coverage table, even if the cell says "deferred".
- If the user has not settled the product charter, say so rather than inventing scope.
