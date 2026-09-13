# UPlan — Product Charter

**Status:** Draft — review rounds 1–9 complete; planner-maintained profiles added 2026-09-12, with round 10 open. Intents are in `Requirements/intents.md`; the feature list is in `Requirements/features.md`.
**Last updated:** 2026-09-12
**Next:** Round 10, then UI design and technical design, starting with the release 1 features

## In one line

UPlan helps municipal planners assemble the evidence behind decisions to develop forests and other habitat, and lay out the tradeoff clearly enough to withstand scrutiny.

## Problem

When a city weighs whether a forest, wetland, or other habitat should be cleared for development, the evidence is scattered across agencies, datasets, and formats. Planners rebuild that evidence by hand for every decision, and they often can't tell early which ecological constraints a site carries, or which studies an application should include — so the analysis is slow, expensive, and arrives late.

## Users

| | Who | Role in v1 |
| --- | --- | --- |
| **Primary** | Municipal planners — city and county planning staff | Users. They build decisions in UPlan, maintain their city's profile, and produce UPlan's output. |
| **Reviewers** | Planning supervisors and the Director | Users. They review each decision in UPlan and sign off before its report goes out. |
| **Secondary** | Residents and community groups | Not users until v2, and not the report's audience in v1 — the report is written for the commission and council. |

## Spine

**The ecological tradeoff of developing land is the spine.** UPlan exists to make the develop-vs-preserve decision rigorous and evidenced. Research and workflow features exist to serve that decision; anything that does not serve it is out of scope.

## Core object

A **decision**, anchored to a **study area**.

- The **decision** is the question being asked — should this land be developed, and under what conditions — with its evidence attached.
- The **study area** is the decision's drawn boundary: a district, corridor, or habitat area assessed as a whole, because habitat does not follow parcel lines.
- Every decision belongs to a **city's profile** — the jurisdiction profile described below — and is analyzed under that city's rules and settings. The projects and proposals a planner analyzes live under it.

## What UPlan evaluates

**The proposal's impact.** The planner traces what a proposal would clear, grade, or build, and UPlan shows which regulated resources and buffers fall inside that footprint. What is already on the land is the evidence the impact is measured against, not the end product. Comparing a proposal against alternatives is not in v1.

**The pilot's edge** *(decided in round 7)*: measuring the proposal's impact — what it would remove or disturb, for each regulated resource and buffer — is what the pilot must do best. It is UPlan's case for being opened instead of the public maps planners already have (see *Pilot context*).

## Jobs

1. **Evidence assembly** *(primary)* — gather and reconcile the ecological evidence for a study area into a documented evidence base, and set the proposal's impact against it, instead of rebuilding the evidence by hand each time.
2. **Screening** *(secondary)* — before an application is filed, flag which regulated critical areas a site likely touches, so the pre-application conference can name the studies the applicant must submit. Comparing candidate areas returns with capital projects, after v1.

## Moments of use

- **Before filing — the pre-application conference.** Screening happens here. Sammamish lists a pre-application conference letter on the checklist for every subdivision application (see *Pilot context*).
- **During review — the primary moment.** Evidence assembly happens here. UPlan is the planner's independent second opinion: it shows what the public record says an application's studies should address.

## Posture

**UPlan structures the decision; it never makes the call.** It surfaces the evidence, makes explicit which values lead to which conclusion, and shows what is uncertain. It never recommends developing or preserving.

**Conditions of approval — trace, never draft.** The planner writes the conditions. UPlan links each condition to the impact and evidence behind it, and shows any impact no condition addresses. It never drafts or proposes a condition.

**Sign-off releases the analysis, not the development.** A reviewer's sign-off in UPlan means the decision's analysis and report are ready to go out. The call on the development is still made outside UPlan.

## Principles

- **P1. Provenance is the substrate.** Every figure shows its source, its date, and its confidence. Remote data is often coarse or years old, and "when was this surveyed?" is the first hard question any finding will face.
- **P2. Screening never clears land.** A screening result flags reasons to look closer; it is not a finding. "No constraints detected" must never read as "safe to develop," or as "no study needed."
- **P3. The report is the product; the map is the instrument.** The report is what gets forwarded, printed, and quoted out of context, so its integrity is never traded for map polish.

**Rules are always current** *(decided in round 7; the proposed P4 was not adopted)*. Every decision uses the jurisdiction profile as it stands now. A decision does not keep the rules in effect when its application was filed, so a report can cite rules a vested application isn't subject to (see *Pilot context*). A figure that comes from the rules still cites its source and date (P1). *Under review in round 10, because planners can now mark rule types as vesting.*

## Output

- **Interactive map workspace** — the main appeal; where planners explore a study area.
- **Report** — the main output; what planners actually use and take out of the product. It is released as a locked document that can't be edited *(round 8)*.
  - **Audience:** the planning commission and city council — kept in round 6. Neither body decides v1's subdivision applications: the Hearing Examiner decides subdivisions and the Director decides short subdivisions (see *Pilot context*).
  - Staff reports are public records, so the report is written for the commission and council but must hold up when read by residents, opponents, and attorneys.

## Ecological dimensions — v1

**Decided:** dimensions come from a **jurisdiction profile** — one city's regulated categories and rules, held as configuration rather than code. Sammamish is the first profile; a second city is a new profile, not a rewrite.

**Kept current from public records** *(round 8)*: UPlan watches the city's public records for code changes and updates the profile from them. UPlan drafts each update automatically, and someone on UPlan's team checks it against the ordinance before it reaches any decision *(round 9)*. Which records it watches is set in the feature list (F2).

**Uploaded and edited by planners** *(2026-09-12)*: when a city's website blocks automated reading, a planner uploads the city's rules from an Excel template and can edit them in UPlan afterward. Who approves those changes is open in round 10.

**Settings planners choose** *(2026-09-12)*: instead of UPlan confirming these with each city, planners set them in the profile.

- **Vesting:** which rule types vest to the date an application was filed.
- **Map status:** for each critical area type, whether the mapped boundary is regulatory or approximate.
- **Records:** how long each kind of record is kept, and the formats records export in.

The Sammamish profile covers the city's six regulated critical area types plus its tree rules. Every dimension chosen in round 4 maps into it:

| Round 4 dimension | Where it lives in the Sammamish profile |
| --- | --- |
| Habitat and species | Habitat conservation areas and migration corridors |
| Wetlands and water | Wetlands; streams; frequently flooded areas |
| Forest and canopy | Significant-tree rules |
| Connectivity and fragmentation | Migration corridors |
| *Added by the profile* | Geologically hazardous areas; critical aquifer recharge areas |

## v1 scope

| In | Out |
| --- | --- |
| Sammamish, Washington, as the single pilot city | Multiple jurisdictions *(under review in round 10)* |
| Subdivisions and short subdivisions; site clearing and development | Rezones and comprehensive plan amendments; city capital projects, which are the first expansion after v1 |
| The proposal's impact | Comparing a proposal against alternatives |
| Screening one site for the studies it needs, before filing | Comparing candidate areas, which returns with capital projects |
| Tracing conditions of approval to impacts and evidence | Drafting or proposing conditions |
| Evidence UPlan builds independently from public data | Applicant-submitted studies as an evidence source |
| Profiles planners upload from Excel and edit, including their settings | Uploading evidence layers; uploads carry rules and settings only |
| Desk analysis from free public data, including public remote sensing *(round 9)* | Field survey and on-site data capture; licensed data |
| Current rules for every decision | Tracking which version of the rules a decision was judged under |
| One application in the browser and on phones; on a phone, planners look up a decision's map and report | A separate mobile product; building a decision or recording anything on a phone |
| Planners and their reviewers as users, with sign-off before a report goes out | Resident accounts and participation — v2 |

**Future target — not to be designed now:** capturing and ingesting external data brought by consultants.

## Pilot context — Sammamish, Washington

Checked 2026-09-12 against the sources linked.

- **Six regulated critical area types:** critical aquifer recharge areas; frequently flooded areas; geologically hazardous areas (landslide, steep slopes, erosion); habitat conservation areas and migration corridors; streams; wetlands. — [City of Sammamish: Critical Areas Ordinance update](https://www.sammamish.us/projects/critical-areas-ordinance-cao-update/)
- **Trees are regulated individually, by trunk diameter.** Significant trees are conifers 8" DBH or larger and deciduous trees 12" DBH or larger. Removing one requires a permit, and removals are capped by count over ten years. — [City of Sammamish: Permits for Removing Trees](https://www.sammamish.us/government/community-development/permit-center/trees/)
- **The city's streams feed a recovering fish population.** Native late-run kokanee spawn primarily in Ebright, Lewis, and Laughing Jacobs creeks, which flow into the south end of Lake Sammamish. — [King County: Lake Sammamish kokanee](https://kingcounty.gov/en/dept/dnrp/nature-recreation/environment-ecology-conservation/wildlife/fish-and-shellfish/kokanee)
- **Subdivision applications vest.** A proposed division of land is considered under the subdivision, zoning, and other land use control ordinances in effect when a fully completed application is submitted; the city defines what "fully completed" means. Vesting does not restrict conditions imposed under SEPA. Which environmental rules count as land use control ordinances is legally nuanced, so planners record their city's answer as a profile setting. — [RCW 58.17.033](https://app.leg.wa.gov/Rcw/default.aspx?cite=58.17.033); [MRSC: land use control ordinances and vesting](https://mrsc.org/stay-informed/mrsc-insight/february-2015/what-are-land-use-control-ordinances-for-purposes)
- **Neither v1 subdivision type is decided by the commission or council.** Preliminary approval of a subdivision (ten or more lots) "is a Type 3 decision subject to a hearing and decision by the Hearing Examiner based on the recommendation of the Director." Preliminary approval of a short subdivision (nine or fewer lots) "is a Type 2 land use decision made by the Director." — [City of Sammamish: Subdivision – Preliminary Approval](https://www.sammamish.us/media/wpuhopto/subdivision-preliminary-approval.pdf) (form dated 2022-01); [City of Sammamish: Short Subdivision – Preliminary Approval](https://www.sammamish.us/media/2tpam4z4/preliminary-short-subdivision.pdf) (form dated 2025-10)
- **The city decides which studies an application needs.** Both subdivision checklists list a pre-application conference letter, a critical area affidavit, a geotechnical report, an arborist report, and a critical area study "if applicable." For a clearing and grading permit, critical area, geotechnical, and arborist studies "may be required, as determined by the City of Sammamish." Any listed as necessary at a pre-application conference "must be included with the initial submittal," and any may be requested during review in a correction letter. — [City of Sammamish: Clearing and Grading Permit](https://www.sammamish.us/media/a42o5jp4/clearing-and-grading-permit.pdf) (form dated 2025-01)
- **Planners and applicants already have public maps.** The city's permit packets list King County iMap and the Sammamish Property Tool as resources.

**Reference documents to review:** the city's [Best Available Science Summary Report](https://www.sammamish.us/media/ufubtobg/sammamish-cao_bas-report_10-20-2023.pdf) and [Existing Conditions Report](https://www.sammamish.us/media/ioxkzzqa/sammamish-cao-update-ecr_10-20-2023.pdf) for its critical areas update, both dated 2023-10-20.

## Known limits of desk analysis

- **Significant trees can't be counted from remote data.** Canopy data shows forest extent, not individual trunk diameters, so v1 cannot say how many regulated trees a proposal removes. That count requires an on-the-ground tree inventory — external data, which is deferred.
- **Critical area boundaries may be set by site study, not by the map.** In Washington, critical area maps are commonly indicative, with the regulated boundary set by a site-specific study. Planners set this for each critical area type as a profile setting.
- **A desk screen can miss what no map shows.** A stream or wetland that no dataset records will not appear in screening, which is why a clean screen never waives a study (P2).

P1 and P2 govern all three: the report states plainly what desk analysis cannot see.

## Success metrics

Deferred by decision, 2026-09-12.

## Open questions

**Round 10:** whether vesting settings change which rules a decision uses; who approves profile uploads and edits; whether v1 opens to cities beyond Sammamish; and whether automatic code tracking stays in release 1. Feature-level questions are in `Requirements/features.md`.
