# Requirements — Profile Upload and Editing

**Feature:** F17 · `profiles`
**Status:** Draft — changes apply at once, with no review step (2026-10-04); sources list added
**Serves:** I9 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Uploaded and edited by planners_), [features.md](features.md) (F17), [system-architecture.md](../TechDesign/system-architecture.md) (_Key flows: Profile upload or edit_)
**Related design doc:** [TechDesign/profile-upload-edit.md](../TechDesign/profile-upload-edit.md)
**Builds on:** [jurisdiction-profile.md](jurisdiction-profile.md) (F1 — the document this feature changes)

## Why

Both of Sammamish's code-hosting sites returned 403 on 2026-09-12, so automatic reading (F2) cannot be the only way a profile gets built or kept current. A planner must be able to load and correct the city's rules by hand, with every change accountable: who, when, and what it was.

On 2026-10-04 the review step was removed: a planner's change applies the moment it is saved, and the profile page no longer shows a change history or a queue of changes awaiting review. Accountability now rests on the record each change leaves, not on a second person's approval.

## Requirements

**R1. UPlan provides an Excel template generated from the live profile schema.** The template can never drift from what the system accepts, because both are produced from one Zod schema (F1's `ProfileDocumentSchema`). The template is downloaded from the Sources view of the profile page's settings panel.

**R2. Every row in an uploaded workbook carries its code section and effective date, or the upload is rejected with the complete list of problems.** A planner never sees one error, fixes it, and discovers a second — validation reports everything wrong at once.

**R3. An upload that fails validation stores only the upload attempt, never a change to the profile.** The failed file and its error list are kept for the planner to fix and retry; nothing about the current profile or the source list is affected.

**R4. A planner can edit every setting after upload from the profile page's settings panel, and every edit records who made it and when.** The settings are vesting per rule set, map status per resource type, retention per record type, and export formats. One save changes them together as a new profile version. The change records a fixed description ("Settings edited in UPlan"); no reason is asked for. Rules themselves are changed by uploading a workbook (R12).

**R5. A change takes effect the moment it is saved, with no review.** Saving creates the new profile version, moves the city's current pointer to it, and records the change as already approved by the person who made it. Nobody else approves it, and the profile page shows no queue of changes awaiting review. Each form carries the profile revision its page showed; a save built on a revision that is no longer current fails with a conflict and writes nothing, so two planners saving from the same revision can never both succeed.

**R6. _Withdrawn 2026-10-04._** Previewing a change against open decisions needed a pending change to preview. Open decisions are re-analyzed under the new version as soon as a change applies (R8).

**R7. _Withdrawn 2026-10-04._** There is no approval, so no rule about who approves. Any signed-in person may change the profile. If round 10 decides that profile edits need a second person after all, a gate returns in front of R5's transaction, not inside it.

**R8. A change is final and atomic: the new version is created, the city's current pointer moves to it, and every open decision is queued for re-analysis, all together or not at all.** A crash partway can never leave the city pointing at no version, or at a version with no re-analysis queued.

**R9. _Withdrawn 2026-10-04._** Rejection no longer exists. A change that fails validation (R2, R4) is refused before anything is written, apart from the upload record in R3.

**R10. A released report never changes because a profile change was made after release.** Only open decisions are affected by a new profile version; a decision whose report already released is not requeued (F10's immutability holds regardless of what F17 does later).

**R11. Uploads and edits carry only rules and settings, never evidence layers.** A workbook or edit that attempts to add spatial data is out of scope for this feature entirely — evidence comes only from F3.

**R12. The profile has an editable list of sources, each either a web page or an Excel workbook.** A planner can add, rename, and remove sources from the Sources view of the settings panel. A web source has a name and an `http` or `https` address, which can be changed; any other kind of address is rejected. An Excel source has a name and the workbook that supplied the profile's current rules; uploading a workbook (new, or in place of an existing source's) applies it under R5 and records it as that source. Removing a source takes it off the list only: the rules it supplied stay in the profile. A source belongs to one city and can be changed or removed only through that city.

## Out of scope for this feature

- What the document contains and how rules resolve for a date (F1).
- Reading a web source automatically and drafting a change from it (F2). The sources list records where the city's rules come from; the page's Update Regulations action is specified separately.
- Reviewing or approving a change before it takes effect. F2's drafted changes are a different matter: best-practices requires UPlan staff to confirm a model's draft, and that flow brings its own review back when F2 is built.

## Open items

- **Round 10 — who may change the profile:** R7 states the current answer (any signed-in person, no approval). Because nothing now stands between a signed-in person and the city's rules, round 10 should confirm that is intended.
- **Update Regulations:** the profile page shows the button; what it does is to be specified.
- **Obsolete after this change:** the `purpose = 'preview'` analysis runs and the `analysis_run.profile_change_id` column have no producer any more. They remain until the analysis feature's docs are revised.
