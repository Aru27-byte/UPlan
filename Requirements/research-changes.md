# Requirements — Research Changes and Document Versions

**Feature:** F22 · `workflow` (start, finish, cancel) + `reports` (versions, download) + the Report and Overview pages
**Status:** Draft
**Serves:** I6 · **Release:** 1 _(added 2026-09-27)_
**Derived from:** [charter.md](charter.md) (P3, _Output_), [features.md](features.md) (F5, F10, F22), [intents.md](intents.md) (I6)
**Related design doc:** [TechDesign/research-changes.md](../TechDesign/research-changes.md)
**Builds on:** [locked-report.md](locked-report.md) (F10 — the document), [research-phases.md](research-phases.md) (F21 — reviews), [decisions.md](decisions.md) (F5 — status, reopen)

## Why

Research doesn't stop when a document goes out. A boundary is corrected, a dataset is refreshed, the profile's rules change, or a planner finds a better source. Today a released report is final and the decision can be reopened, but nothing tells the planner what the change touched, and nothing produces a second document that sits beside the first. A record that will be quoted, printed, and requested must keep every version it ever put out, and each version must say what was different about it.

## Words

To **finish research** is to publish the final document for a project. A **version** is one published document. A **research change** is the period between starting to change a completed project and publishing its next version.

## Requirements

**R1. Finishing research produces exactly one final document, and it is stored by UPlan.** It is a PDF that a planner can download, and UPlan keeps the file and its SHA-256 hash in its own database, so the document can be fetched, checked, and exported without any other service. A project can finish only when every phase has a review of its current output whose verdict is _Reviewed_ (F21), and the analysis for its current inputs has finished.

**R2. Each published document is a numbered version, and versions are never changed.** Version 1 is the first document. Each later one is version 2, 3, and so on, in order, with no gaps. Once published, a version's file, hash, and record are never edited or deleted, and a later version never replaces an earlier one (F10 R7, P3).

**R3. A completed project is changed only by starting a research change, and starting one is an explicit act that names the version it changes.** The planner starts it from the dashboard (**Re-research**), from the project's Overview, or from any phase page's notice. Nothing edits a completed project any other way: its inputs, reviews, and details are read-only until a research change starts.

**R4. A research change may begin with new data or with a chosen phase.** After starting, the planner can upload a new site or footprint boundary, load sample data, edit the project details, record a resolution note, or go to any phase and change what feeds it (F21 R9). A change to the city's profile that arrives meanwhile is picked up the same way (F2).

**R5. While a research change is open, the project lists what it changed.** For each phase, it states whether the phase's output is unchanged since the last published version or changed, and whether the changed output has been reviewed yet. It also states whether the project details changed. A phase whose output is unchanged keeps its review and needs none.

**R6. A research change finishes only when every phase is reviewed and something actually changed.** Publishing a version identical to the last one is refused, and the message says so. Every version after the first requires a short reason, which is stored with it.

**R7. A research change that changed nothing can be cancelled,** returning the project to completed with its last version as the current one. A research change that changed something cannot be cancelled, because the new inputs are already recorded; it is finished, or its inputs are changed again.

**R8. Publishing a version is safe against concurrent changes.** While a document is being generated, the project is read-only, and starting a second generation is refused. If two people or two tabs try to finish at once, exactly one wins. If generation fails after its retries, the project returns to in progress with the failure shown, and nothing is published or numbered.

**R9. The version history lists every published version, newest first.** Each shows its number, the date and time it was published in the city's time zone, who published it, the reason, which phases and details changed from the previous version, its file size, its hash, and a **Download** link for exactly that version. The latest version is marked as latest.

**R10. Every document says what it is.** It shows its version number, when it was published, the project's details, the profile version it was built under, and each phase's review (verdict, reviewer, time, and any note). Versions after the first show the reason and the phases and details that changed. A document built with sample data says so on its first page (F23, P1).

**R11. The document is built only from the run and the records pinned when finishing began.** Its content never depends on anything that changed afterward, including the latest profile or the latest geometry (P3).

**R12. Downloading a version returns the stored bytes.** The response carries the file's hash, and only the project's owner can download it.

## Out of scope for this feature

- Reverting a project to an earlier version's inputs. A planner who wants an earlier boundary uploads or redraws it, which is a new revision like any other.
- Comparing two versions' documents side by side. The history states what changed; the planner opens both files.
- A second person signing off on a version (F12).
- Emailing or otherwise sending a version. The file is downloaded.
- Purging versions (F16).

## Open items

- How long a stored document is kept follows the profile's retention setting for reports (F16). Purging is a records process and isn't built here.
