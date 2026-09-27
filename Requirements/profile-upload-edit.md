# Requirements — Profile Upload and Editing

**Feature:** F17 · `profiles`
**Status:** Draft
**Serves:** I9 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Uploaded and edited by planners_), [features.md](features.md) (F17), [system-architecture.md](../TechDesign/system-architecture.md) (_Key flows: Profile upload or edit_)
**Related design doc:** [TechDesign/profile-upload-edit.md](../TechDesign/profile-upload-edit.md)
**Builds on:** [jurisdiction-profile.md](jurisdiction-profile.md) (F1 — the document this feature proposes changes to)

## Why

Both of Sammamish's code-hosting sites returned 403 on 2026-09-12, so automatic reading (F2) cannot be the only way a profile gets built or kept current. A planner must be able to load and correct the city's rules by hand, with every change accountable: who, when, why, and what it would change before it takes effect.

## Requirements

**R1. UPlan provides an Excel template generated from the live profile schema.** The template can never drift from what the system accepts, because both are produced from one Zod schema (F1's `ProfileDocumentSchema`).

**R2. Every row in an uploaded workbook carries its code section and effective date, or the upload is rejected with the complete list of problems.** A planner never sees one error, fixes it, and discovers a second — validation reports everything wrong at once.

**R3. An upload that fails validation stores only the upload attempt, never a change to the profile.** The failed file and its error list are kept for the planner to fix and retry; nothing about the current or pending profile is affected.

**R4. A planner can edit any rule or setting after upload, and every edit records who made it, when, and why.** A reason is required text, never optional (`profile_change.reason`).

**R5. Only one profile change can be pending for a city at a time.** A second proposal — whether another upload or an edit — fails immediately with a conflict that names the pending change, rather than racing it.

**R6. Before a change takes effect, it shows what it would change in every open decision under that city.** A preview analysis runs the proposed document against every open decision, so a reviewer sees rule differences and impact differences, including any decision whose preview run failed, before deciding.

**R7. Nobody approves their own change.** _Assumed per `system-architecture.md`'s round-10 table, changed 2026-09-27:_ a UPlan staff member approves or rejects a pending change, and the person approving cannot be the person (or system) that proposed it. Any signed-in person can propose a change. If round 10 answers differently — no approval step, or a city reviewer — only the approval check changes, not the proposal or preview flow.

**R8. Approving a change is final and atomic: the new version is created, the city's current pointer moves to it, and every open decision is queued for re-analysis, all together or not at all.** A crash partway can never leave the city pointing at no version, or at a version with no re-analysis queued.

**R9. Rejecting a change discards nothing about the attempt — the rejected `profile_change` row, its reason, and who decided it stay in the history.**

**R10. A released report never changes because a profile change was approved after release.** Only open decisions are affected by a new profile version; a decision whose report already released is not requeued (F10's immutability holds regardless of what F17 does later).

**R11. Uploads and edits carry only rules and settings, never evidence layers.** A workbook or edit that attempts to add spatial data is out of scope for this feature entirely — evidence comes only from F3.

## Out of scope for this feature

- What the document contains and how rules resolve for a date (F1).
- Automatic drafting of a change from a code-source fetch (F2, later in v1, proposes changes through this same pending-change mechanism with `source = 'code_change'`).

## Open items

- **Round 10 — who approves:** R7 states the assumed default (UPlan staff, now that jurisdiction membership is gone). This doc's approval step is written so a different answer (no approval, or a city reviewer) replaces one function's authorization check, not the transaction shape.
