# Requirements — Sample Data

**Feature:** F23 · `decisions` (sample inputs) + `evidence` (illustrative datasets) + the phase pages and the city profile page
**Status:** Draft
**Serves:** every intent · **Release:** 1 _(added 2026-09-27)_
**Derived from:** [charter.md](charter.md) (P1, _Known limits of desk analysis_), [features.md](features.md) (F23), [evidence-layers.md](evidence-layers.md) (F3)
**Related design doc:** [TechDesign/sample-data.md](../TechDesign/sample-data.md)
**Builds on:** [research-phases.md](research-phases.md) (F21), [decisions.md](decisions.md) (F5), [provenance.md](provenance.md) (F4)

## Why

The whole workflow — from a site to a published document — has to be usable, demonstrable, and testable before a real application arrives, and without anyone inventing data by hand. The analysis engine must work on that data exactly as on real data, or the demonstration proves nothing. And because a report is quoted out of context, sample data must never be mistakable for a real site or a real source.

## Requirements

**R1. A planner can start a project with sample data.** One action creates a project whose details, study area, and footprint are all filled in from a fixed sample, and starts its analysis. From there the planner works through every phase as with any project.

**R2. Each input a phase accepts can be loaded from sample data on its own.** The project details form can be filled with sample details, but only while its optional details are still blank: sample details never overwrite a real applicant, address, or filing date. The Site phase can load a sample study area. The Footprint phase can load a sample footprint. Each saves a new numbered revision like any other input (F5 R5, R6).

**R3. The phases that have no input of their own run on sample evidence.** Evidence, Screening, Studies, and Impact draw on the city's evidence datasets. Where a city has none mapped, those phases say so as gaps (F7 R4), never as an empty success. UPlan staff can install the illustrative evidence datasets for the city, and doing so is safe to repeat.

**R4. The analysis treats sample data exactly like real data.** No code path in the analysis, screening, drafting, or document rendering checks whether an input is sample to decide what to compute. The same functions run, in PostGIS, on the same kinds of records.

**R5. The sample exercises every phase.** With the sample site, the sample footprint, and the illustrative datasets: the study area holds mapped features of several resource types; the footprint overlaps a regulated resource directly and reaches others through their buffers; two sources disagree on one resource type; one resource type has no dataset; at least one study is flagged and at least one is not; and a resource type with an approximate boundary appears. Each of these appears in the output it belongs to.

**R6. Sample data is labeled as sample everywhere it appears.** A sample boundary's source note says it is sample data. An illustrative dataset's source line says it is illustrative sample data, in every place provenance is shown (P1). A project that currently uses a sample boundary or a sample dataset shows a "Sample data" label on the dashboard, its header, and the Overview, and its published documents say so on their first page.

**R7. Sample data is never presented as a real site, a real applicant, or a real source.** Sample text names itself: for example "Sample parcel — not a real address". No sample value is a real person's or a real company's name.

**R8. Loading a sample input while research is in progress replaces nothing.** It saves a new revision on top of the existing ones, and the earlier revisions stay in the history. It is refused on a completed project until a research change starts (F22).

**R9. Installing the illustrative datasets is a staff action that never overwrites or deletes.** It creates the datasets, their versions, and their features only when they don't exist, and it maps them to the city's profile. It asks for confirmation and says the data is illustrative. It is available only to UPlan staff.

## Out of scope for this feature

- Sample profiles. A city's profile comes from an upload (F17) or the setup script. This release's setup script creates an illustrative Sammamish profile for a fresh database.
- Random or generated data. The sample is fixed, so every run and every test sees the same geometry and the same numbers.
- Sample data for a city other than Sammamish.
- Removing installed illustrative datasets from the UI. Removing evidence is not a planner or staff action (data-model rules); the setup script's reset is for local development only.

## Open items

- None.
