# Requirements — AI Assist

**Feature:** F24 · `assist` (new module) + the assist panel on each phase page
**Status:** Draft
**Serves:** I1, I2, I4, I9 · **Release:** 1, in three waves _(added 2026-10-10)_
**Derived from:** [charter.md](charter.md) (_AI assistance_, P1–P3, _Posture_), [features.md](features.md) (F24, F2), [intents.md](intents.md)
**Related design doc:** [TechDesign/ai-assist.md](../TechDesign/ai-assist.md)
**Builds on:** [research-phases.md](research-phases.md) (F21), [evidence-layers.md](evidence-layers.md) (F3), [study-scoping.md](study-scoping.md) (F14), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)

## Why

A planner's slow hours are not spent measuring. UPlan already measures. They are spent reading: finding the sentence of the code that explains a buffer, working out why two datasets disagree, translating a screening row for a colleague, and thinking of what a desk screen can't see. Staff spend theirs reading ordinances to update a profile. A language model is good at exactly that reading and weak at exactly what UPlan must never get wrong: the number, the flag, the verdict. So the model reads and quotes, and the engine still measures and decides nothing.

## Words

**AI assist** is UPlan's use of a language model. An **assist** is one capability of it. A **suggestion** is one stored output of an assist. A **kind** is the fixed shape of a suggestion: **Explain**, **Questions**, **Find**, **Compare**, **Metadata draft**, or **Rule draft**. The **analysis** is everything UPlan computes without a model: measurements, flags, study lists, impact, drafted phase outputs.

## Requirements

**R1. AI assist never changes the analysis.** A suggestion changes no measurement, flag, study, impact figure, drafted output, review state, or output fingerprint. A phase's state and the final document are the same whether or not any suggestion exists (P3).

**R2. No suggestion enters the released document.** The document is built only from pinned analysis records and the planner's own reviews. A planner may copy a suggestion's text into their own review note; it is then the planner's text and is recorded as theirs.

**R3. Every suggestion is labeled where it is shown.** It states that it is AI-assisted, which model produced it, when, and that it is not part of the analysis, beside every suggestion and in every export (P1).

**R4. Every statement about a rule, dataset, or code is backed by an exact quote.** The suggestion carries the quote and its source (document and section, or dataset and field). A suggestion with a quote that is not found, word for word, in the passages it was given is rejected. The rejection is recorded and shown; nothing from the rejected suggestion is displayed as an answer.

**R5. No suggestion contains a number it was not given.** Every number in a suggestion appears in the input sent with the request. A number that does not is a rejection (R4's handling).

**R6. No suggestion carries a verdict.** None recommends, approves, denies, clears, ranks, scores, or rates; none says a study is or is not needed or an impact is acceptable; none proposes a condition of approval. This is enforced by the fixed shapes of the kinds and by a denylist test on every output, and a violation is a rejection (charter _Posture_; F14 R9).

**R7. A suggestion only reads and cites; it never decides.** Explain, Questions, Find, and Compare suggestions take effect on nothing. Metadata drafts and Rule drafts take effect only when UPlan staff confirm them, through the same approval path as an uploaded change (F17), and never the person who requested them.

**R8. Only allow-listed input is sent to the model service.** The allowed classes are: published code and ordinance text; dataset metadata; the city's profile rules and citations; and a project's measured results with names removed (resource types, counts, areas, distances, ranges, gaps, limits, dataset titles and dates). Never sent: a project's title, parcel or address, applicant, project manager, dates of filing or decision, planner notes, resolution notes, review notes, boundary coordinates, uploaded files, or any person's name or email. The request sent is stored with the suggestion so anyone can see exactly what left UPlan.

**R9. A suggestion is requested, never automatic.** A planner chooses to request one, per phase and per subject. Nothing is requested on page load, on save, or in the background, and no review or finish ever requires one.

**R10. A suggestion is stored and shown as stored.** It is bound to the exact phase output (or profile or dataset version) it was made on. It is never regenerated silently. When that output has since changed, the suggestion is shown as out of date beside the reason, and a new one has to be requested.

**R11. A failure is shown with its reason and nothing replaces it.** An unreachable service, a timeout, a rate limit, an unconfigured key, or a rejected output says so in place. UPlan does not switch to another model, show a canned answer, or show an earlier suggestion as if it were current. The phase works fully without assist.

**R12. Use is capped, and the cap is shown.** A per-person and a per-city daily cap on requests are enforced in the database. A planner who reaches a cap is told which cap and when it resets.

**R13. A double submission makes one suggestion.** Two identical requests at once, for the same output and subject, result in one suggestion and one call to the service.

**R14. A planner can dismiss a suggestion or mark it unhelpful, with an optional note.** The response is recorded and never edited. It informs the evaluation set (R16) and nothing else.

**R15. The assist panel is accessible.** It works by keyboard, its states are announced to assistive technology, and it uses words and shapes, not color alone (WCAG 2.1 AA). It works on a phone for reading existing suggestions; requesting stays a browser task.

**R16. A change to a model, prompt, or retrieval setting ships only if the evaluation set does not get worse.** The set holds golden questions with their expected quotes and the expected rejections of verdict-bearing and invented-number outputs.

**R17. Suggestions and their responses are records.** They follow F16's retention and export, including the request that was sent and the model that answered.

**R18. Assist is by phase, and only where it helps.** The assists in each phase are those in _Assist by phase_ below. Site and Footprint have none, because a planner's boundary is their own act and not a text to read.

## Assist by phase

The design doc carries the full tables: inputs, outputs, checks, and gates per assist.

| Phase | Assists | Kinds | Takes effect on |
| --- | --- | --- | --- |
| City profile (F1, F2, F17) | Draft a rule change from a code change; draft dataset limitations | Rule draft, Metadata draft | Only after staff confirm |
| Site | None | — | — |
| Evidence | Explain the evidence in plain language; explain why two sources may differ; draft a dataset's limitations | Explain, Compare, Metadata draft | Nothing; staff confirm metadata |
| Screening | Explain a screening row with its rule quoted; suggest what a desk screen can't see; find the passage | Explain, Questions, Find | Nothing |
| Studies | Find why a study is listed; draft questions for the pre-application conference; compare flags against the city's checklist | Find, Questions, Compare | Nothing |
| Footprint | None | — | — |
| Impact | Explain the impact table in plain language; name what would narrow a range; find where a buffer is set | Explain, Questions, Find | Nothing |
| Overview | None | — | — |
| Report | None in the document | — | — |

## Out of scope

- A model that writes, edits, or ranks findings, recommendations, conditions, or any text inside the released document.
- A model that decides screening flags, study needs, or impact, or that computes any number.
- Reading an applicant's submitted documents, site plans, or studies, and extracting project details or footprints from them.
- A chat with the whole project. Every assist has one fixed purpose, input, and shape.
- Training or fine-tuning a model, and anything that sends UPlan's data to be learned from.
- Automatic application of any suggestion, including rule drafts.
- Voice, images, and maps as model input.

## Open items

- Whether the city's use of NVIDIA's free inference service as a pilot is permitted under its terms. Until confirmed, assist is enabled for development and evaluation only.
- Where the code text for Find comes from on the hosting target: staff paste or upload, or a fetch. See the design doc's _Open items_.
