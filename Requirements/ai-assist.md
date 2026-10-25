# Requirements — AI Assist

**Feature:** F24 · `assist` module + the section chat on each phase page
**Status:** Draft — revised 2026-10-22: the phase assist panel becomes a section chat with Explain and Change modes; AI edits create versioned report sections
**Implementation:** Built in release 1; current as of 2026-10-24. The dashboard question box and New-research document scan are prototype-level conveniences.
**Serves:** I1, I2, I4, I9 · **Release:** 1, in three waves _(added 2026-10-10)_
**Derived from:** [charter.md](charter.md) (_AI assistance_, P1–P3, _Posture_), [features.md](features.md) (F24, F2), [intents.md](intents.md)
**Related design doc:** [TechDesign/ai-assist.md](../TechDesign/ai-assist.md)
**Builds on:** [research-phases.md](research-phases.md) (F21), [locked-report.md](locked-report.md) (F10), [evidence-layers.md](evidence-layers.md) (F3), [study-scoping.md](study-scoping.md) (F14), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)

## Why

A planner's slow hours are not spent measuring. UPlan already measures. They are spent reading: finding the sentence of the code that explains a buffer, working out why two datasets disagree, translating a screening row for a colleague, and thinking of what a desk screen can't see. Staff spend theirs reading ordinances to update a profile. A language model is good at exactly that reading and weak at exactly what UPlan must never get wrong: the number, the flag, the verdict. So the model reads and quotes, the engine still measures and decides nothing, and the planner remains the author of every change to the report's wording.

## Words

**AI assist** is UPlan's use of a language model. A **suggestion** is one stored output of an assist. A **kind** is the fixed shape of a suggestion: **Explain**, **Questions**, **Find**, **Compare**, **Metadata draft**, **Rule draft**, **Section explain**, or **Section edit**. The **analysis** is everything UPlan computes without a model: measurements, flags, study lists, impact, and the analysis drafts of report sections. The **section chat** is the assistant on a phase page. Its **Explain** mode answers a question and changes nothing. Its **Change** mode returns a rewritten section, which UPlan stores as a new **section version**. A **prompt filler** is a phase-specific sentence that fills the chat's message box; it never sends on its own.

## Requirements

**R1. AI assist never changes the analysis.** A suggestion changes no measurement, flag, study, impact figure, engine output, output fingerprint, or published document. A section change never edits the analysis draft or its fingerprint; it stores a separate section version, and every earlier version stays. A phase's engine state and every published document are the same whether or not any suggestion exists (P3).

**R2. No suggestion enters the released document unasked.** The document is built from the analysis drafts and the section versions current when generation begins. A section change enters it only when the planner asks for the change in the chat, and then as a section version the planner adopted. The document does not label that section as AI-assisted. A planner may also copy a suggestion's text into a note or a message; it is then the planner's text and is recorded as theirs.

**R3. Every suggestion and chat answer is labeled where it is shown.** It states that it is AI-assisted, which model produced it, when, and that it is not part of the analysis, beside the answer and in every export (P1). **A report section is not labeled.** The label belongs to the chat answer and the stored suggestion, not to the section the planner adopted.

**R4. Every statement about a rule, dataset, or code is backed by an exact quote.** The suggestion carries the quote and its source (document and section, or dataset and field). A suggestion with a quote that is not found, word for word, in the passages it was given is rejected. The rejection is recorded and shown; nothing from the rejected suggestion is displayed as an answer.

**R5. No suggestion contains a number it was not given.** Every number in a suggestion appears in the input sent with the request. A number that does not is a rejection (R4's handling).

**R6. No suggestion carries a verdict.** None recommends, approves, denies, clears, ranks, scores, or rates; none says a study is or is not needed or an impact is acceptable; none proposes a condition of approval. This is enforced by the fixed shapes of the kinds and by a denylist test on every output, and a violation is a rejection (charter _Posture_; F14 R9). The same denylist applies to a section change before it becomes a version.

**R7. A suggestion only reads and cites; it never decides.** Explain, Questions, Find, Compare, and Section explain suggestions take effect on nothing. A Section edit takes effect only when the planner asks for a change in the section chat; it creates a new section version and never changes the engine output, the analysis, a profile, or a dataset. Metadata drafts and Rule drafts take effect only when a UPlan staff member confirms them through the profile module, and never the person who requested them. A planner's ordinary profile upload or settings edit still applies at once, as F17 says.

**R8. Only allow-listed input is sent to the model service.** The allowed classes are: published code and ordinance text; dataset metadata; the city's profile rules and citations; and a project's measured results with names removed (resource types, counts, areas, distances, ranges, gaps, limits, dataset titles and dates). A section change also sends the section's text, tables, and fixed notices, with every map reduced to its title and description and no coordinates. Never sent: a project's title, parcel or address, applicant, project manager, dates of filing or decision, planner notes, resolution notes, boundary coordinates, uploaded files, or any person's name or email. A planner's chat message is free text, so it is checked against the project's recorded identity and against email addresses before it is sent; a message that contains one is refused with the reason, and no model call is made. The request sent is stored with the suggestion so anyone can see exactly what left UPlan.

**R9. A suggestion is requested, never automatic.** A planner chooses to request one, per phase and per question. Nothing is requested on page load, on save, or in the background, and no phase or finish ever requires one. A prompt filler only fills the message box; the planner still sends it.

**R10. A suggestion is stored and shown as stored.** It is bound to the exact section version and engine output it was made on. It is never regenerated silently. When that section or output has since changed, the suggestion is shown as out of date beside the reason, and a new one has to be requested. A section change is refused if the section or engine output changed while the planner was reading it.

**R11. A failure is shown with its reason and nothing replaces it.** An unreachable service, a timeout, a rate limit, an unconfigured key, or a rejected output says so in place. UPlan does not switch to another model, show a canned answer, or show an earlier suggestion as if it were current. The phase works fully without assist.

**R12. Use is capped, and the cap is shown.** A per-person and a per-city daily cap on requests are enforced in the database. A planner who reaches a cap is told which cap and when it resets.

**R13. A double submission makes one suggestion.** Two identical requests at once, for the same section and question, result in one suggestion and one call to the service.

**R14. A planner can dismiss a suggestion or mark it unhelpful, with an optional note.** The response is recorded and never edited. It informs the evaluation set (R16) and nothing else.

**R15. The section chat is accessible.** It works by keyboard, its states are announced to assistive technology, and it uses words and shapes, not color alone (WCAG 2.1 AA). It works on a phone for reading existing messages and the section; sending a change stays a browser task.

**R16. A change to a model, prompt, or retrieval setting ships only if the evaluation set does not get worse.** The set holds golden questions with their expected quotes, the expected rejections of verdict-bearing and invented-number outputs, and section-edit cases that try to change a figure, a map, a table value, or a quote.

**R17. Suggestions and their responses are records.** They follow F16's retention and export, including the request that was sent and the model that answered. A section version records the suggestion that produced it, when there was one.

**R18. Assist is by phase, and only where it helps.** Every phase has the section chat's Explain and Change modes. The phase-specific prompt fillers are those in _Assist by phase_ below. Site and Footprint have only the generic Explain and Change prompts, because a boundary is the planner's own act and there is no public text to read.

**R19. The phase's assist surface is the section chat, and its strongest assist is a prompt filler.** On Evidence, Screening, Studies, and Impact, the chat shows the phase's assists as prompt fillers, strongest first. A filler fills the message box and never sends. The chat sits beside the report section and is optional; the page works fully without it. The old separate assist panel is gone from phase pages. The city profile's assist panel remains for staff.

## Assist by phase

The design doc carries the full tables: inputs, outputs, checks, and gates per assist.

| Phase | Assists | Kinds | Takes effect on |
| --- | --- | --- | --- |
| City profile (F1, F2, F17) | Draft a rule change from a code change; draft dataset limitations; find in the code; compare studies with the checklist | Rule draft, Metadata draft, Find, Compare | Only after staff confirm |
| Site | Section chat: explain or change the section | Section explain, Section edit | A new section version, when the planner sends a change |
| Evidence | Explain the evidence in plain language; explain why two sources may differ; section chat | Explain, Compare, Section explain, Section edit | A new section version for a change; nothing for an explanation |
| Screening | Explain a screening row with its rule quoted; suggest what a desk screen can't see; find the passage; section chat | Explain, Questions, Find, Section explain, Section edit | A new section version for a change; nothing for an explanation |
| Studies | Find why a study is listed; draft questions for the pre-application conference; compare flags against the city's checklist; section chat | Find, Questions, Compare, Section explain, Section edit | A new section version for a change; nothing for an explanation |
| Footprint | Section chat: explain or change the section | Section explain, Section edit | A new section version, when the planner sends a change |
| Impact | Explain the impact table in plain language; name what would narrow a range; find where a buffer is set; section chat | Explain, Questions, Find, Section explain, Section edit | A new section version for a change; nothing for an explanation |
| Overview | None | — | — |
| Report | None in the document | — | — |

## Out of scope

- A model that writes without the planner's request, or that changes a figure, map, table value, quoted source, list item, notice, or verdict inside a section or the released document.
- A model that decides screening flags, study needs, or impact, or that computes any number.
- Reading an applicant's submitted documents, site plans, or studies, and extracting project details or footprints from them.
- A chat with the whole project. The section chat is scoped to one phase's section and one message at a time.
- Training or fine-tuning a model, and anything that sends UPlan's data to be learned from.
- Automatic application of any suggestion, including rule drafts and section changes.
- Voice, images, and maps as model input.

## Open items

- Whether the city's use of NVIDIA's free inference service as a pilot is permitted under its terms. Until confirmed, assist is enabled for development and evaluation only.
- ~~Where the code text for Find comes from on the hosting target.~~ _Decided 2026-10-10:_ staff paste it on the profile page. A fetch is a later step. See the design doc's _As built_.
