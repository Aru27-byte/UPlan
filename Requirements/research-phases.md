# Requirements — Research Phases and Report Sections

**Feature:** F21 · `workflow` (phases, sections, chat) + the six phase pages
**Status:** Draft — revised 2026-10-22: reviews and section feedback replaced by versioned report sections and a section chat
**Serves:** I1, I2, I3, I6 · **Release:** 1 _(added 2026-09-27)_
**Derived from:** [charter.md](charter.md) (P1–P3, _Posture_, _AI assistance_), [features.md](features.md) (F21), [intents.md](intents.md)
**Related design doc:** [TechDesign/research-phases.md](../TechDesign/research-phases.md)
**Builds on:** [decision-overview.md](decision-overview.md) (F18 — the stage rail), [evidence-base.md](evidence-base.md) (F7), [study-scoping.md](study-scoping.md) (F14), [impact-analysis.md](impact-analysis.md) (F9), [evidence-review.md](evidence-review.md) (F19), [locked-report.md](locked-report.md) (F10)

## Why

A planner's research is a sequence of questions: where is the site, what does the record show, what does the screen flag, what studies follow, what would the proposal remove, and what is the impact. UPlan already answers each one. What is missing is the working loop around the answer: read the section of the report the phase produces, ask what it means, change the wording when it is not clear, and keep every version of that change. Without that loop a planner can't make the report say what they have checked, and a reader can't tell which wording was current when a version was published.

## Words

A **phase** is one step of the research that produces an output: **Site, Evidence, Screening, Studies, Footprint, Impact**. **Overview** and **Report** frame them and are not phases. A phase's **output** is what UPlan drafts for it. A **report section** is the part of the final document that phase produces. The **analysis draft** is the section UPlan builds from the current output; it is not a stored version until the planner changes it. A **section version** is one stored, immutable copy of a section. The **section chat** is the assistant on a phase page; it has an **Explain** mode and a **Change** mode. A **revert** makes an earlier version's content current again by creating a new version; it never deletes or edits an earlier one.

## Requirements

**R1. A project has six phases, in a fixed order, and each has its own page.** Every phase page shows, in this order: the report section with the section chat beside it; what the output is drafted from; the phase's own data and editors. The section and chat are the top block, not an accordion. The section's version history is reachable from that block.

**R2. A phase's analysis draft is built by UPlan's analysis engine, deterministically, from the phase's pinned inputs.** The same inputs give the same draft, byte for byte. Measurements come from PostGIS. The sentences that describe them are fixed templates over those measurements. No language model writes the analysis draft (P2, _Posture_; decided 2026-09-26). The section's figures, maps, tables, quoted source text, lists, and fixed notices are **locked**: no model and no planner edit changes them. The summary and narrative around them may be rewritten only through the section chat, which stores the result as a new section version (F24). The page does not label a section as AI-assisted; the chat's own answers are labeled (F24 R3).

**R3. An analysis draft states measurements and gaps and never a verdict.** It never says an impact is acceptable, that land is clear, that a study isn't needed, or what the planner should decide. It never ranks or scores (P2, F18 R5, F9 R6). A denylist test enforces this on every template.

**R4. A phase has an output only when its inputs exist and, for the analysis phases, the analysis for the current inputs has finished.**
- Site needs a study area. Footprint needs a footprint.
- Evidence, Screening, and Studies need a finished analysis of the current inputs.
- Impact needs that and a footprint.
Until then the phase says exactly what is missing or that the analysis is running, out of date, or failed (F18 R7). It never shows an earlier section as if it were current. A stored section may be shown, labeled **Out of date**, beside the reason.

**R5. Each phase is in exactly one section state, derived from records, not from a flag someone sets.**
- **To do** — a required input is missing.
- **Updating** — the inputs exist and the analysis is not finished.
- **Ready** — there is a section built from the current output: either the analysis draft or a stored version whose engine output is still the current one.
- **Out of date** — there is a stored version built on an earlier output. It is shown with the reason, and the report cannot be generated from it.

There is no review verdict, no "needs review", and no "revision requested". The planner's act is reading, changing, or reverting the section, and those acts are recorded as section versions.

**R6. The section chat has two modes, and the planner asks for both.**
- **Explain** answers a question about the section in the chat and changes nothing. It is labeled as AI-assisted (F24 R3).
- **Change** rewrites the section's summary and narrative, may reorder those parts, and may change a table's formatting. It creates a new section version. It never changes a locked figure, map, table value, quoted source, list item, notice, or verdict.

Nothing is requested on page load, on save, or in the background. A phase works fully without the chat.

**R7. A change belongs to the exact section and output the planner was reading.** The page carries the section's content hash and the engine output's fingerprint. A change is refused with a clear message if either has changed since the page loaded. A change never touches the engine output, its fingerprint, the analysis, or an earlier section version.

**R8. Section versions are append-only.** Each version records who made it, when, the planner's instruction when it came from the chat, the content, and the engine output it was built on. The phase shows the current version and its history, newest first. No version is edited or deleted. A revert creates a new version with the earlier version's content and records which version it came from.

**R9. A revert is allowed even when the target version was built on an earlier output, and it always warns first.**
- The warning says, distinctly, that reverting changes the report section and replaces the current wording.
- When the target version's figures no longer match the current analysis, the warning says so, and says that the report cannot be generated until the section is updated to the current analysis.
- The planner can cancel the revert before it happens; the cancel choice is focused first.
- After a revert, the section is **Out of date** if the target's engine output is not current. The page offers **Update to current analysis**, which creates a new version from the current analysis draft.
- A revert never deletes the version it replaced or any other version.

**R10. "What changed" is stated as the sentences added and the sentences removed.** It compares two section versions, or the current section and the current analysis draft, and adds no judgment. The history shows the instruction that produced a version, when there was one.

**R11. To iterate, the planner changes an input and reads the new analysis.** Each phase names what feeds it and links to where that input is changed: Site and Footprint have their own editors; Evidence has the resolution notes (F19) and links to Site; Screening and Studies link to Site; Impact links to Footprint. A change to an input starts a new analysis. When it finishes, the engine output changes, and a stored section becomes **Out of date**. UPlan never silently rebases a stored section onto the new analysis; the planner chooses **Update to current analysis** or asks the chat for a change.

**R12. The Site and Footprint phases accept a boundary three ways: drawn on the map, uploaded as a GeoJSON file, or loaded from sample data (F23).** An upload is checked, never repaired: it must be valid GeoJSON in WGS 84 holding exactly one Polygon or MultiPolygon, and a geometry that isn't valid is rejected with the reason (F5 R7). Each way saves a new numbered revision (F5 R5, R6).

**R13. Changing a section, reverting it, and using the chat are allowed only while the project's research is in progress.** A completed project's phases are read-only until the planner starts a research change (F22).

**R14. Every phase page states what desk analysis can't see for its phase,** from the run's recorded limits and the phase's fixed text (F14 R9), and shows the provenance of everything it displays through the one formatter (P1).

**R15. Each phase page works on a phone for looking things up,** and building a footprint, drawing a site, or editing a section stays a browser task (charter).

**R16. The section is the real content, rendered from the same components the document is stitched from (locked-report.md R18), over the project's current records or the stored version.** When a phase has nothing to show yet, the section says exactly what is missing and shows no stand-in. The chat sits beside the section when the block is wide enough and below it on a phone. The section is not labeled as AI-assisted. A short note beside it says that maps, tables, figures, and quoted source text come from the analysis and cannot be changed, and that the summary and narrative can.

**R17. Below the section block, a step page's data is in accordion sections that are closed when the page loads and open on click.** Each section's heading carries a one-line summary and any status, so the page can be read closed. Irregular data is an exception and stays open: the map workspace and the drawing and upload editors. The chat and the section are controls, not data, and stay open.

**R18. The stage rail shows the research as one linear process, and fits the room it has.** Stages are numbered in order, grouped as Set up, Assemble, Analyze, and Report, each group in its own color, with an arrow between stages and between groups showing the direction of the work. Its layout follows its own width, not the window's: one column read top to bottom when narrow, the four groups side by side left to right when wide, and it never overflows or scrolls sideways at any width. Each stage shows its state as words and a shape, never by color alone (F18 R12). The phase states are To do, Updating, Ready, and Out of date.

**R19. The Overview shows the project at a glance, between its report-section block and its data:** the application type, parcel or address, applicant, project manager, the filing and target dates, and the city, each reading "Not yet recorded" when blank, and every phase whose section is not Ready, with its state and a link to it. When every phase is Ready it says so. It states facts and never a verdict. The Overview's section stays read-only: it is the project's recorded details and the city's rules, not a narrative to edit.

## Out of scope for this feature

- Review verdicts, review notes, and feedback boxes. The section version is the record.
- Sign-off by a second person (F12).
- A model that changes a figure, map, table value, quoted source, list item, notice, or verdict.
- A model that drafts a phase's analysis output, in any phase.
- Conditions of approval (F13).
- Field verification, applicant studies, and licensed data as inputs (charter).

## Open items

- Whether the Overview's section should get the same chat. Release 1 keeps it read-only, because its content is the project's recorded details and the city's rules; a narrative there would not have measurements behind it.
