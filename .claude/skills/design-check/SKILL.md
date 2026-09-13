---
name: design-check
description: Audit a UPlan feature's TechDesign doc against its Requirements doc, reporting uncovered requirements, contradictions between the two, and requirements written so they cannot be tested. Use before implementation starts, or when asked whether a design is complete.
---

Audit the feature named in `$ARGUMENTS`. If no name is given, list the feature pairs in `Requirements/` and ask which one.

## Steps

1. Resolve the kebab-case basename and read both `Requirements/<basename>.md` and `TechDesign/<basename>.md`. If either is missing, report that and stop — suggest `/spec <name>`.
2. Extract every requirement ID (`R1`, `R2`, …) from the requirements doc.
3. Check each of the four categories below.
4. Report findings grouped by category, most severe first. If a category is clean, say so in one line rather than padding the report.

## What to check

**Uncovered requirements.** Every `R` id must appear in the design's coverage table with a real mechanism, not a restatement of the requirement. A row reading "R3 — handled by the R3 service" covers nothing. Report the id and what is missing.

**Contradictions.** Where the design asserts something the requirements rule out, or the two disagree on a number, limit, actor, or ordering. Quote both sides.

**Untestable requirements.** A requirement that no one could write a passing or failing test for: unquantified adjectives ("fast", "intuitive", "scalable"), requirements with no observable outcome, and requirements whose subject is the implementation rather than the user. Propose a concrete rewrite for each.

**Design without a requirement.** Mechanism in the design doc that no requirement asks for. This is scope creep or a missing requirement — say which you think it is.

## Rules

- Report only what the two documents actually say. Do not infer a requirement the author did not write in order to make the design look covered.
- Quote the line you are objecting to so the author can find it.
- Do not edit either document. This skill reports; the author decides.
