# Requirements — Project Dashboard

**Feature:** F20 · `decisions` (list, delete) + `workflow` (summaries) + the dashboard, shell, and city profile access
**Status:** Draft
**Serves:** every intent · **Release:** 1 _(added 2026-09-27)_
**Derived from:** [charter.md](charter.md) (_Core object_, _Users_), [features.md](features.md) (F5, F11, F20), [intents.md](intents.md)
**Related design doc:** [TechDesign/project-dashboard.md](../TechDesign/project-dashboard.md)
**Builds on:** [decisions.md](decisions.md) (F5), [decision-overview.md](decision-overview.md) (F18), [research-phases.md](research-phases.md) (F21), [research-changes.md](research-changes.md) (F22), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)

## Why

A planner signs in to get back to work, or to start it. Today they land on a list under a city they were granted access to, with no sense of where each piece of research stands, and the city's rules are one nav item among three. With jurisdiction membership gone (F11), the first screen has a simpler job: show this person's research, let them continue it, change it, or start new research, and keep the city's profile in reach.

## Words

A **project** is a decision (charter). **Research** is the work done on it. See _Words used in the product_ in [features.md](features.md).

## Requirements

**R1. After signing in, a person lands on the dashboard.** A person who registered lands there too. A person with no projects sees an empty state that offers **New research** and **Start with sample data** (F23), not a blank page.

**R2. The dashboard lists the signed-in person's own projects in the current city (R11), and only theirs.** It lists them as one table, **My Research Projects**, with the projects that have the most phases left to review first. Deleted projects never appear. Nobody sees another person's project, and a request for one reads as "not found" (F11).

**R3. Each project row states: its title, a progress badge, a "Sample data" badge when it uses sample data, a count of phases left for review, and when it was last updated.** The progress badge is counts and words: for example "3 of 6 phases reviewed", or "Completed · version 2" once a document is published. The count of phases left for review sits beside the badge, so it is readable before the row is opened. Opening a row shows each phase's state as a track of six steps, with the number of phases left for review at its top right. None of it is a percentage, score, or rating (F18 R5).

**R4. Each project offers only the actions that fit its state.**
- In progress: **Resume**, which opens the project at the step it is waiting on, and **Delete**.
- Completed: **Re-research**, which starts a research change (F22), and **Delete**. **Download document** is in the opened row.
- Generating its document: no change actions, and a plain note that the document is being generated.
- **New research** is always on the page.

**R5. Delete research asks for confirmation, names the project, and says what it does.** Deleting removes the project from every list and from view. It keeps every record, because working data may be public record (F16). It is refused while a document is being generated. It is a compare-and-set on the project's version, so a stale page can't delete a project that changed.

**R6. The dashboard links to the city profile.** A **View city profile** button sits beside **New research** in the page header. The link is also in the navigation on every signed-in page. The dashboard no longer shows a profile card.

**R7. The table's header summarizes with counts only:** projects in progress and projects completed. No count is a score.

**R8. The signed-in app has one professional visual system.** A navigation rail, a page header, panels, tables, status labels, and buttons behave and look the same on every page. Status is never conveyed by color alone (WCAG 1.4.1). Every page meets WCAG 2.1 AA at desktop and phone widths, and a keyboard user can reach and operate every action.

**R9. Creating a project takes one short form.** It asks for a title and an application type, and optionally a parcel or address, the applicant, the project manager, the target decision date, and the filing date. It names the city whose rules will apply. It also offers to start with sample data (F23). Nothing optional is required to begin.

**R10. Every action reports what happened.** A successful action shows a confirmation on the next page. A failure shows a message a planner can act on, in the page, not a blank error screen. A button that submits disables itself while the request is in flight.

**R11. A planner can switch between cities _(added 2026-10-16, by request; replaces the one-city rule of 2026-09-26)_.** The navigation rail on every signed-in page has a **City** control that lists every city set up, by name, with the current one selected. It appears when more than one city is set up; with one there is nothing to switch to. Choosing a city makes it the **current city** and opens the dashboard. The current city is the one whose profile **City profile** opens, whose rules **New research** names and applies (R9), and whose projects the dashboard lists (R2). The choice is remembered in the person's browser, so it is the same on the next visit from that browser.

**R12. Switching cities hides nothing and changes nothing.** Projects in other cities are kept and listed again when their city is chosen. A project always opens under the city it was created in, whichever city is current, and it is analyzed under that city's profile (F5).

**R13. The current city is never guessed.** With exactly one city set up, that city is the current one. With more than one, the current city is the one the person chose; if they have not chosen one, or the remembered choice names a city that no longer exists, the page asks them to choose, listing the cities, and shows nothing else. With none set up, the page says so and how UPlan staff fix it. The remembered choice is not a secret and grants no access: every read and write is still scoped by the module function that performs it (F11).

## Out of scope for this feature

- Sharing a project with another person, and any team view of many people's projects. Both need F12's access model.
- Search, filters, and sorting controls beyond the fixed order in R2. A list of a planner's own projects is short in the pilot.
- Purging deleted projects. Purging is a records process (F16), not a planner action.
- Per-person limits on which cities someone may switch to. Every signed-in person may read every city's profile (F11 R3), so every city is offered to everyone.
- A project that moves from one city to another. A project belongs to the city it was created under (F5).

## Open items

- Whether a deleted project can be restored by the planner who deleted it. The record is kept, so it could be. Not needed for release 1.
