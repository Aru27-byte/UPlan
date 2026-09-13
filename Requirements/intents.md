# UPlan — Intents

**Status:** Draft — reviewed in round 7; I9 added 2026-09-12
**Last updated:** 2026-09-12
**Derived from:** [charter.md](charter.md), review rounds 1–7
**Next:** Feature list (`Requirements/features.md`)

## What an intent is

An intent is an outcome a user — a planner or a reviewer — comes to UPlan for, tied to the moment they need it. Intents sit between the charter and the feature list:

- The **charter** says what UPlan is, and what it will and won't do.
- **Intents** say what a user is trying to get done, and what they come away with.
- The **feature list** names what gets built to deliver each intent. Every feature serves at least one intent, or a constraint listed under *Across all intents*; an intent no feature serves is a gap.

Intents describe outcomes, not screens or mechanisms.

## At a glance

| ID | Intent | Moment | Charter basis |
| --- | --- | --- | --- |
| I1 | Scope the studies a site owes | Before filing | Jobs: screening |
| I2 | Assemble an independent evidence base | During review | Jobs: evidence assembly |
| I3 | See the proposal's impact | During review | What UPlan evaluates |
| I4 | Know what the applicant's studies should address | During review | Moments of use |
| I5 | Trace conditions of approval | During review | Posture |
| I6 | Produce a report that holds up | End of review | Output; P1–P3 |
| I8 | Review and sign off before the report goes out | End of review | Users: reviewers; Posture |
| I9 | Maintain the city's profile | Setup, and whenever the code changes | Jurisdiction profile |

I3 is the pilot's edge: the intent the pilot must deliver best (round 7). I7 was dropped in round 7, when the proposed P4 was not adopted; its number is not reused.

## Before filing

### I1. Scope the studies a site owes

**When** a prospective applicant asks for a pre-application conference, **the planner wants** to know which regulated critical areas the site likely touches, **so that** the conference letter names every study the application must include.

**The planner comes away with:**

- Each critical area type in the jurisdiction profile that the site likely touches, including critical areas just off the site whose buffers reach onto it.
- For each, the study it points to — for example, which critical areas a critical area study must cover.
- The source, date, and confidence of the data behind every flag (P1), and a plain statement of what the screen cannot see.

**Guardrails:**

- A flag can add a study to the list. The absence of a flag never removes one (P2).
- One site at a time. Comparing candidate areas returns with capital projects, after v1.

## During review

### I2. Assemble an independent evidence base

**When** an application is under review, **the planner wants** the public record's ecological evidence for the study area gathered and reconciled in one place, **so that** they stop rebuilding it by hand for every decision.

**The planner comes away with:**

- Evidence for every dimension in the jurisdiction profile, drawn from public data.
- The source, date, and confidence of every item (P1).
- Disagreements between sources shown as disagreements, and missing data shown as gaps — never smoothed over.

**Guardrails:**

- Independent: built from free public data *(round 9)*, not from the applicant's studies.
- Desk analysis only. Nothing is captured in the field.

### I3. See the proposal's impact

*The pilot's edge — what the pilot must do best (round 7).*

**When** reviewing an application, **the planner wants** to see what the proposal would clear, grade, or build, set against the evidence, **so that** they know which regulated resources it would remove or disturb.

**The planner comes away with:**

- The proposal's footprint, traced by the planner, set against every dimension in the jurisdiction profile.
- Which regulated resources and buffers fall inside the footprint, and how much of each.
- What desk analysis can't measure, stated plainly — for example, how many significant trees would come down.

**Guardrails:**

- The footprint is the proposal under evaluation, not evidence, so tracing it from the application's site plan keeps the evidence independent.
- No verdict. UPlan shows the impact; it never says whether the impact is acceptable.
- Not in v1: comparing the proposal against alternatives.

### I4. Know what the applicant's studies should address

**When** the applicant's studies arrive, **the planner wants** an independent account of what the public record says those studies should address, **so that** gaps turn into correction letters during review instead of surprises late in the process.

**The planner comes away with:**

- For each required study, the critical areas and resources the public record indicates it should cover, with provenance (P1).

**Guardrails:**

- The planner does the comparison. UPlan does not ingest or grade the applicant's studies in v1.
- A resource missing from the public record is not proof a study can skip it (P2).
- I4 runs the same analysis as I1, later: I1 before the application exists, I4 once its studies arrive.

### I5. Trace conditions of approval

**When** drafting conditions of approval, **the planner wants** each condition linked to the impact and evidence behind it, **so that** every condition can be defended, and any impact left unaddressed is left that way on purpose.

**The planner comes away with:**

- Each condition the planner writes, linked to the impacts (I3) and evidence (I2) it answers.
- The impacts no condition addresses, listed as facts.

**Guardrails:**

- Trace, never draft. UPlan never proposes a condition, and an unaddressed impact is not a recommendation to add one.

## End of review

### I6. Produce a report that holds up

**When** the analysis is done, **the planner wants** a report for the planning commission and city council, **so that** the evidence, the impact, and the conditions hold up when the report is forwarded, printed, and quoted out of context by residents, opponents, and attorneys.

**The planner comes away with:**

- A report that lays out the evidence (I2), the proposal's impact (I3), the conditions and what each answers (I5), and what remains uncertain.
- Source, date, and confidence on every figure, in print as well as on screen (P1).
- Screening results that never read as clearance (P2).
- A plain statement of what desk analysis cannot see.

**Guardrails:**

- No recommendation to develop or preserve (Posture).
- The report's integrity comes before map polish (P3).
- The report goes out only after a reviewer signs off (I8).
- Released as a locked document that can't be edited (round 8).
- The audience was kept in round 6, though neither the commission nor the council decides v1's subdivision applications (see the charter's *Pilot context*).

### I8. Review and sign off before the report goes out

**When** a planner finishes a decision, **a reviewer — a planning supervisor or the Director — wants** to check the analysis and sign off, **so that** no report leaves the department unreviewed.

**The reviewer comes away with:**

- The decision's evidence, impact, and conditions, with the same provenance the planner saw (P1).
- A record of who reviewed the decision, what they asked to change, and who signed off, and when.

**Guardrails:**

- Sign-off releases the analysis and report; it is not a call on the development (Posture).

## Setup and upkeep

### I9. Maintain the city's profile

**When** UPlan can't read a city's code automatically, or the code changes, **the planner wants** to load the city's rules and settings and correct them in UPlan, **so that** every project or proposal in that city is analyzed under the right rules.

**The planner comes away with:**

- A profile for the city that every decision in that city is analyzed under.
- The city's rules, uploaded from an Excel template, each citing its code section and effective date (P1).
- Settings for vesting, map status, and records, chosen by the city's planners rather than assumed by UPlan.
- A history of every change: who made it, when, and why.

**Guardrails:**

- A change shows what it would change in open decisions before it takes effect. Released reports never change.
- Who approves a change before it takes effect is open in round 10.

## Across all intents

- **The map workspace is the instrument, not an intent.** Planners work through I1–I5 on the map, and P3 keeps the report ahead of it.
- **Phones are for looking up, not building** *(round 7)*. On a phone, a planner opens a decision's map and report — on a site visit or in a meeting. Tracing footprints and linking conditions stay in the browser. On site, the planner only looks; nothing is recorded.
- **Working data may be public record too.** Under Washington's Public Records Act, a public record is any writing about the conduct of government "prepared, owned, used, or retained" by an agency — which can reach what planners do inside UPlan, not only the report. Retention and export belong in the feature list. — [RCW 42.56.010](https://app.leg.wa.gov/RCW/default.aspx?cite=42.56.010)
- **UPlan competes with maps planners already have.** Sammamish's permit packets list King County iMap and the Sammamish Property Tool as resources. Every intent must give planners something those maps don't, and the pilot leads with I3.

## Not intents in v1

- Comparing candidate areas — returns with capital projects.
- Comparing a proposal against alternatives.
- Drafting conditions of approval.
- Tracking which version of the rules a decision was judged under — rules are always current (round 7). *Under review in round 10, because of vesting settings.*
- Building a decision on a phone.
- Capturing field data, or ingesting applicant or consultant studies.
- Anything for residents — v2.

## Open questions

The questions carried from here now live in [features.md](features.md). Round 10 covers vesting, approval of profile changes, cities beyond Sammamish, and when automatic tracking ships. Sign-off on a phone (F12) is still open.
