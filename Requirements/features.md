# UPlan — Feature List

**Status:** Reviewed in round 9; planner-maintained profiles added 2026-09-12, with round 10 open; study scoping moved into release 1 and F18–F19 added 2026-09-26
**Last updated:** 2026-09-26
**Derived from:** [charter.md](charter.md), [intents.md](intents.md), review rounds 1–9
**Next:** Requirements and TechDesign pairs, starting with release 1

## How to read this

Each feature becomes a pair of docs sharing one kebab-case basename: `Requirements/<basename>.md` and `TechDesign/<basename>.md`. Every feature names the intents it serves, and every intent is served by at least one feature (see *Intent coverage*).

Features describe capabilities, not screens. UI design and technical design both start from this list.

## Releases

v1 ships in stages *(round 8)*. Release 1 proves the pilot's edge: a planner takes a real application from evidence (I2) to impact (I3) to a released report (I6). Until sign-off ships, review happens outside UPlan.

| Release | Intents | Features |
| --- | --- | --- |
| **Release 1** | I1, I2, I3, I4, I6, I9 | F1–F10, F11 for planners, F14, F16–F19 |
| **Later in v1** — order not set | I5, I8, phone look-up | F11 reviewer role, F12, F13, F15 |

Release 1 is bigger than its intents suggest. F7–F10 and F14 deliver them; the other features are foundations a real application can't run without: the rules and the way planners maintain them, provenance, accounts, and public records retention. This size was accepted on 2026-09-12. On 2026-09-26 it grew: F14 (study scoping) moved up from later in v1, and F18 (the decision overview and stage rail) and F19 (evidence review) were added, so a planner can see where a decision stands and what the evidence's confidence is made of. Release 1 now delivers I1 and I4 as well.

## At a glance

| ID | Feature | Basename | Serves | Release |
| --- | --- | --- | --- | --- |
| F1 | Jurisdiction profile | `jurisdiction-profile` | I1–I6, I9 | 1 |
| F2 | Code change tracking | `code-change-tracking` | I1–I6, I9 | 1 — *under review in round 10* |
| F3 | Evidence layers | `evidence-layers` | I1–I4 | 1 |
| F4 | Provenance | `provenance` | All | 1 |
| F5 | Decisions | `decisions` | All | 1 |
| F6 | Map workspace | `map-workspace` | I1–I5 | 1 |
| F7 | Evidence base | `evidence-base` | I2 | 1 |
| F8 | Proposal footprint | `proposal-footprint` | I3 | 1 |
| F9 | Impact analysis | `impact-analysis` | I3 | 1 — *the pilot's edge* |
| F10 | Locked report | `locked-report` | I6 | 1 |
| F11 | Accounts and roles | `accounts-roles` | All; I8 | 1 for planners; reviewers later |
| F12 | Review and sign-off | `review-signoff` | I8 | Later |
| F13 | Conditions tracing | `conditions-tracing` | I5 | Later |
| F14 | Study scoping | `study-scoping` | I1, I4 | 1 *(moved up 2026-09-26)* |
| F15 | Phone look-up | `phone-lookup` | Looking up I1–I6 | Later |
| F16 | Records retention and export | `records-export` | Public records | 1 |
| F17 | Profile upload and editing | `profile-upload-edit` | I9 | 1 |
| F18 | Decision overview and stage rail | `decision-overview` | All | 1 *(added 2026-09-26)* |
| F19 | Evidence review | `evidence-review` | I2, I6 | 1 *(added 2026-09-26)* |

## Release 1 — foundations

### F1. Jurisdiction profile — `jurisdiction-profile`

**Serves:** I1–I6, I9 · **Release:** 1

A city's profile: its regulated categories, its rules, and the settings its planners choose, held as configuration rather than code. Every project or proposal a planner analyzes — every decision — is created under a city's profile and analyzed under it. For Sammamish: the six critical area types, their buffers, the significant-tree rules, and the studies each critical area triggers.

- Every rule cites the code section or ordinance it comes from, and when it took effect (P1).
- A second city is a new profile, not a rewrite.
- Rules are always current *(round 7)*: every decision uses the profile as it stands now. *Under review in round 10, because planners can now mark rule types as vesting.*
- **Settings planners choose** *(2026-09-12)*, instead of facts UPlan confirms with each city:
  - **Vesting:** which rule types vest to the date an application was filed. What the setting does to the analysis is open in round 10.
  - **Map status:** for each critical area type, whether the mapped boundary is regulatory or approximate, with a site study setting the real boundary. *Proposed default:* approximate until a planner says otherwise (P2).
  - **Records:** how long each kind of record is kept, and the formats records export in (F16).
- Kept current automatically from public records (F2), or uploaded and edited by planners (F17).

**Open for TechDesign:** how much of the code can be held as configuration. Some rules depend on field-rated attributes, such as buffers that vary with a wetland's rating.

### F2. Code change tracking — `code-change-tracking`

**Serves:** I1–I6, I9 · **Release:** 1 — *under review in round 10*

UPlan watches the city's public records for code changes and keeps the profile current from them *(round 8)*.

- **UPlan's team confirms every change** *(round 9)*. UPlan finds the change and drafts the rule update automatically; someone on UPlan's team checks it against the ordinance before it reaches any decision.
- *Default:* the published Sammamish Municipal Code is the base, and adopted ordinances are watched for changes not yet codified. The city publishes both, and codifies ordinances "if appropriate" after adoption.
- *Default:* when the rules change, a released report stays exactly as released, and a decision still in progress switches to the new rules and shows the planner what changed.

**When a city's website blocks automated reading** — as both sites hosting Sammamish's code did on 2026-09-12 (403 Forbidden) — planners upload the rules instead (F17). Automatic reading may still become possible with permission or a feed from the city or its code publisher.

### F3. Evidence layers — `evidence-layers`

**Serves:** I1–I4 · **Release:** 1

The datasets behind each dimension in the profile, gathered and kept current, each with its source, date, and confidence.

- Covers every dimension in the Sammamish profile: habitat and corridors, wetlands, streams, flood areas, geologic hazards, aquifer recharge areas, and forest canopy.
- Records what each dataset can't show — for example, individual tree diameters.
- Free public data only *(round 9)*, so anyone reading a report can look up the same sources.

### F4. Provenance — `provenance`

**Serves:** every intent · **Release:** 1

Source, date, and confidence attached to every figure — evidence, rules, and impact results — and carried everywhere the figure goes: the map, the report, and exports (P1).

- A derived figure, such as an impact measurement, carries the provenance of everything it was computed from.
- Confidence is stated in terms a commissioner can read.

### F5. Decisions — `decisions`

**Serves:** every intent · **Release:** 1

The core object: a decision about one application, anchored to a study area the planner draws. It holds the decision's evidence, footprint, impact, and report.

- The study area is drawn, and can cross parcel lines, because habitat doesn't follow them.
- Every decision belongs to one city's profile and is analyzed under it (F1).
- A decision records the date its application was filed, so vesting settings can act on it (round 10).
- A decision shows where it stands — for example, in progress or report released.
- A decision records its project details: parcel or address, applicant, project manager, and target decision date. None is required to start one.
- A decision in progress shows what changed when the rules change (F2).

### F6. Map workspace — `map-workspace`

**Serves:** I1–I5 · **Release:** 1

Where planners explore a decision: its evidence layers, study area, and footprint, with each layer's provenance one step away.

- Nothing on the map claims more precision than its data has (P1).
- Boundaries the profile marks as approximate look approximate (F1).
- Browser in release 1; phone look-up arrives with F15.
- A resource type with no mapped dataset appears as a gap, and a link can open the map with a layer already on.
- The map is the instrument; the report is the product (P3).

## Release 1 — evidence to report

### F7. Evidence base — `evidence-base`

**Serves:** I2 · **Release:** 1

For each decision, the evidence for its study area, assembled and reconciled across sources.

- Where sources disagree, both are shown. Where data is missing, the gap is shown.
- Built independently from public data, never from the applicant's studies.
- Each item's confidence is broken into the facts behind it, and a planner can record which source they rely on where two disagree (F19).

### F8. Proposal footprint — `proposal-footprint`

**Serves:** I3 · **Release:** 1

The planner traces what the proposal would clear, grade, or build, working from the application's site plan.

- The footprint is the proposal under evaluation, not evidence.
- Built in the browser only.

**Open for UI design:** whether planners can also start from a site plan file instead of tracing by hand.

### F9. Impact analysis — `impact-analysis`

**Serves:** I3 · **Release:** 1 · *The pilot's edge (round 7)*

Measures what the footprint would remove or disturb, for each regulated resource and buffer in the profile.

- A quantity for each resource and buffer, carrying the provenance of its evidence and its rules (F4).
- A quantity measured against an approximate boundary is labeled approximate, with a note that a site study sets the regulated boundary (F1).
- What desk analysis can't measure, stated plainly — for example, how many significant trees would come down.
- Each impact shows the rules and evidence it was computed from, and whether the run it comes from is current.
- No verdict. It never says whether an impact is acceptable.

### F10. Locked report — `locked-report`

**Serves:** I6 · **Release:** 1

The report for the planning commission and city council, released as a locked document that can't be edited *(round 8)*.

- Lays out the evidence, the impact, what remains uncertain, and what desk analysis can't see. Conditions join it when F13 ships.
- States each critical area type's map status, and how the profile treats vesting (F1).
- Source, date, and confidence on every figure, in print (P1). Screening results never read as clearance (P2).
- No recommendation to develop or preserve.
- Once released, a report never changes, even when the rules do (F2's default).
- Before releasing, the planner sees what the release checks and what the report will state. The report carries the screening register, the study flags, and a source register.
- Until F12 ships, review happens outside UPlan before a report is released.

**Later:** excerpts that keep their provenance, for pasting into other documents.

### F14. Study scoping — `study-scoping`

**Serves:** I1, I4 · **Release:** 1 *(moved up from later in v1 on 2026-09-26)*

For one site, flags the critical areas it likely touches — including those just off the site whose buffers reach onto it — and the studies they point to. The same analysis serves the pre-application conference (I1) and checking what submitted studies should cover (I4).

- A screening register lists, for each resource type in the profile, what is mapped in the study area and what is just off it. A studies page lists the flags the mapped data raises and the data gaps.
- A flag can add a study. No flag ever removes one (P2).
- States what the screen can't see.
- Runs from the study area alone, so it works before a footprint exists and before the application is filed.
- No ranking, score, or significance label, and no model writes any of it.
- Not in release 1: survey-season windows, and tracking a study's status or the applicant's study contents.

**Open:** whether a city sets a data-age threshold in its profile settings.

### F18. Decision overview and stage rail — `decision-overview`

**Serves:** every intent · **Release:** 1 *(added 2026-09-26)*

A stage rail on every decision page shows the order of the work — Overview, Site, Evidence, Screening, Studies, Footprint, Impact, Report — and where each stage stands. The Overview answers the planner's five questions from the decision's own records.

- What do we know, what don't we know, what could delay this, what can desk analysis not settle, and what next.
- Counts and lists only. No completeness percentage, risk rating, or ranking of issues.
- Next actions come from a fixed rule table and name workflow steps, never a judgment about the development.
- Says whether the analysis is current, running, out of date, or failed, and what changed since the last run.
- Lists the rules that apply to the decision and the assumptions the analysis made.
- Where a planner records and edits the decision's project details.

### F19. Evidence review — `evidence-review`

**Serves:** I2, I6 · **Release:** 1 *(added 2026-09-26)*

Breaks each evidence item's confidence label into the facts behind it, and lets a planner record which source they rely on where two disagree.

- Seven attributes beside every item: source authority, data age, spatial precision, verification, boundary status, consistency, and professional review.
- A recorded resolution is a note with a required rationale. It never changes a measurement, and both sources stay shown (F7).
- A resolution applies only to the exact data it was recorded against.
- Recorded resolutions appear in the report.

## Release 1 — accounts, records, and profile upkeep

### F11. Accounts and roles — `accounts-roles`

**Serves:** every intent; I8 · **Release:** 1 for planners; the reviewer role ships with F12

City staff sign in, and each person is a planner or a reviewer.

**Open for TechDesign:** how city staff sign in — for example, with the accounts they already use at work.

### F16. Records retention and export — `records-export`

**Serves:** the public records constraint in *intents.md* · **Release:** 1

What planners create in UPlan is kept, and can be exported when the city receives a public records request.

- Retention starts with the first real application, because records obligations can apply from then.
- Retention periods and export formats are settings in the city's profile (F1), chosen by its planners.
- *Proposed default:* UPlan never deletes a record on its own when its retention period ends; it flags the record for the city's records process.

### F17. Profile upload and editing — `profile-upload-edit`

**Serves:** I9 · **Release:** 1

When a city's website blocks automated reading, a planner builds the city's profile by uploading an Excel file, then keeps it right by editing it in UPlan *(2026-09-12)*.

- UPlan provides the Excel template: each rule with the code section it comes from and its effective date (P1), plus the profile's settings (F1).
- *Proposed default:* UPlan checks an upload before it takes effect, and flags any rule missing its citation or effective date.
- Planners can edit any rule or setting after upload. Every change records who made it, when, and why.
- An upload or edit shows what it would change in open decisions before it takes effect. Released reports never change (F10).
- Uploads carry rules and settings, not evidence layers; evidence stays free public data (F3).

**Open — round 10:** who approves an upload or edit before it reaches any decision?

**Open for TechDesign:** how planner edits and automatic updates (F2) combine for the same city.

## Later in v1

### F12. Review and sign-off — `review-signoff`

**Serves:** I8 · **Release:** later in v1

A reviewer checks a decision, asks for changes, and signs off. The report is released only after sign-off.

- Records who reviewed, what they asked to change, and who signed off, and when.
- Sign-off releases the analysis and report; it is not a call on the development.

**Open:** can a reviewer sign off from a phone, or only look things up?

### F13. Conditions tracing — `conditions-tracing`

**Serves:** I5 · **Release:** later in v1

The planner enters conditions of approval. UPlan links each one to the impacts and evidence it answers, and lists the impacts no condition addresses.

- Never drafts or proposes a condition.
- An unaddressed impact is listed as a fact, not a recommendation.

### F15. Phone look-up — `phone-lookup`

**Serves:** looking up I1–I6 · **Release:** later in v1

A planner opens a decision's map and report on a phone, on a site visit or in a meeting *(round 7)*.

- Nothing is built or recorded on a phone.

## Intent coverage

| Intent | Delivered by | Built on |
| --- | --- | --- |
| I1. Scope the studies a site owes | F14 | F1–F6, F18 |
| I2. Assemble an independent evidence base | F7, F19 | F1–F6 |
| I3. See the proposal's impact | F8, F9 | F1–F6, F18 |
| I4. Know what the applicant's studies should address | F14 | F1–F6 |
| I5. Trace conditions of approval | F13 | F5, F9 |
| I6. Produce a report that holds up | F10 | F4, F5, F7, F9 |
| I8. Review and sign off before the report goes out | F12 | F5, F11 |
| I9. Maintain the city's profile | F17 | F1, F2 |

Every intent is covered. F16 serves the public records constraint rather than an intent.

## Open questions

**Round 10:**

- **Vesting (F1, F5):** does marking a rule type as vesting change which rules a decision uses, or only flag the difference?
- **Profile changes (F17):** who approves an upload or edit before it reaches any decision?
- **Cities (F1, F17):** can planners set up a profile for a city other than Sammamish in v1?
- **Automatic tracking (F2):** does it stay in release 1, or follow the upload?

**For the feature docs:**

- **F1:** how much of the code can be held as configuration (TechDesign).
- **F8:** whether planners can start from a site plan file instead of tracing (UI design).
- **F11:** how city staff sign in (TechDesign).
- **F14:** whether a city sets a data-age threshold in its profile settings, beyond which a dataset's age is called out.
- **F12:** whether a reviewer can sign off from a phone.
- **F17:** how planner edits and automatic updates combine for the same city (TechDesign).

Sources: [City of Sammamish: regulations, ordinances, agreements, and codes](https://www.sammamish.us/i-want-to/regulations/)
