import { MEASURE_LABEL, STUDY_LABEL } from "@/modules/analysis";
import {
  NOT_CONFIGURED_MESSAGE,
  assistAvailability,
  assistsByPhase,
  indexedTextHash,
  listCitySuggestions,
  listPhaseSuggestions,
  listSourceDocuments,
  metadataBinding,
  type AssistId,
  type AssistPhase,
  type SuggestionView,
} from "@/modules/assist";
import type { Actor } from "@/modules/accounts";
import { formatTimestamp } from "@/modules/provenance";
import type { Workflow } from "@/modules/workflow";
import type { ActionState } from "@/ui/action-state";
import type { StepGroup } from "@/ui/phase/group-tones";
import type { AssistBlock, AssistCardModel, AssistControlModel, AssistPanelModel } from "@/ui/phase/assist-types";

// App-layer glue between the assist module's views and the plain model the panel renders. Every date is
// formatted here, in the city's time zone, and every sentence a person reads that UPlan (not the model) wrote
// is fixed text in this file.

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const KIND_TITLE: Record<AssistId, string> = {
  PR1: "Draft rule changes from code text",
  PR2: "Find in the code",
  EV1: "Explain this evidence",
  EV2: "Why the sources may differ",
  EV3: "Draft from publisher metadata",
  SC1: "Explain a screening row",
  SC2: "What this screen might miss",
  SC3: "Where the code says this",
  ST1: "Why this study is listed",
  ST2: "Questions for the conference",
  ST3: "Compare with the checklist",
  IM1: "Explain this impact",
  IM2: "What would narrow this range",
  IM3: "Where the code sets this width",
};

const STATUS_TEXT = {
  ready: "Suggestion",
  rejected: "Rejected by checks",
  failed: "Did not finish",
  running: "Running",
} as const;

const RESPONSE_TEXT: Record<string, string> = {
  helpful: "Marked helpful",
  "not-helpful": "Marked not helpful",
  dismissed: "Dismissed",
  confirmed: "Confirmed by staff and applied",
  rejected: "Rejected by staff",
};

const CHECK_TEXT: Record<"K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8", string> = {
  K1: "The answer was not in the required shape.",
  K2: "A quote is not in the text it was said to come from.",
  K3: "A number is not one that was given to the model.",
  K4: "The answer used a word that carries a verdict.",
  K5: "The answer pointed at something that was not provided.",
  K6: "A question was not phrased as a question about information.",
  K7: "The answer was longer than allowed.",
  K8: "The drafted change is not one a rule may make.",
};

const REASON_LABEL: Record<"vintage" | "scale" | "definition" | "coverage" | "method" | "unknown", string> = {
  vintage: "Vintage",
  scale: "Scale",
  definition: "Definition",
  coverage: "Coverage",
  method: "Method",
  unknown: "Unknown",
};

const METADATA_KEY_LABEL: Record<"limitation" | "vintage" | "scale" | "method", string> = {
  limitation: "What the dataset can't show",
  vintage: "Vintage",
  scale: "Scale",
  method: "Method",
};

function sourceLabeller(view: SuggestionView): (id: string) => string {
  const byId = new Map((view.request?.passages ?? []).map((p) => [p.id, p.label]));
  return (id) => byId.get(id) ?? id;
}

/** The body of a suggestion in the panel's one block shape. Each branch reads only what its kind's shape holds. */
export function blocksOf(view: SuggestionView): AssistBlock[] {
  const content = view.content;
  if (content === null) return [];
  const label = sourceLabeller(view);
  const quotesOf = (qs: { sourceId: string; text: string }[]) => qs.map((q) => ({ source: label(q.sourceId), text: q.text }));

  if ("paragraphs" in content) {
    return content.paragraphs.map((p) => ({
      heading: null,
      text: p.text,
      quotes: quotesOf(p.quotes),
      note: `Restates: ${p.restates.map(label).join(", ")}`,
    }));
  }
  if ("questions" in content) {
    return content.questions.map((q) => ({
      heading: null,
      text: q.text,
      quotes: q.quote ? quotesOf([q.quote]) : [],
      note: `Comes from: ${label(q.basis.ref)}`,
    }));
  }
  if ("found" in content) {
    if (!content.found) {
      return [{ heading: null, text: "No passage in the code text that has been added answers this. That does not mean the code is silent.", quotes: [], note: null }];
    }
    const blocks: AssistBlock[] = content.passages.map((p) => ({
      heading: p.sectionPath,
      text: "",
      quotes: quotesOf([p.quote]),
      note: null,
    }));
    if (content.gloss) blocks.push({ heading: "In other words", text: content.gloss, quotes: [], note: null });
    return blocks;
  }
  if ("reasons" in content) {
    const blocks: AssistBlock[] = content.reasons.map((r) => ({
      heading: REASON_LABEL[r.reason],
      text: r.text,
      quotes: quotesOf(r.quotes),
      note: null,
    }));
    for (const s of content.notStated) blocks.push({ heading: "Not stated in the metadata", text: s, quotes: [], note: null });
    return blocks;
  }
  if ("differences" in content) {
    if (content.differences.length === 0) {
      return [{ heading: null, text: "No differences found in this text. This reads one document only.", quotes: [], note: null }];
    }
    return content.differences.map((d) => ({
      heading: d.study,
      text: `In the engine's list: ${d.inEngine ? "yes" : "no"}. In the checklist text: ${d.inChecklist ? "yes" : "no"}.`,
      quotes: quotesOf([d.quote]),
      note: null,
    }));
  }
  if ("fields" in content) {
    if (content.fields.length === 0) {
      return [{ heading: null, text: "The metadata states none of these. Nothing is proposed.", quotes: [], note: null }];
    }
    return content.fields.map((f) => ({
      heading: METADATA_KEY_LABEL[f.key],
      text: f.value,
      quotes: quotesOf([f.quote]),
      note: null,
    }));
  }
  if (content.changes.length === 0) {
    return [{ heading: null, text: "The code text states no value that differs from the profile. Nothing is proposed.", quotes: [], note: null }];
  }
  return content.changes.map((c) => ({
    heading: c.path,
    text: `Profile has ${c.from}; the text states ${c.to}.`,
    quotes: quotesOf([c.quote]),
    note: `Section ${c.sectionPath}`,
  }));
}

export function cardModel(
  view: SuggestionView,
  opts: {
    timeZone: string;
    subject: string | null;
    outOfDate: string | null;
    respondAction: Action;
    confirm: AssistCardModel["confirm"];
  },
): AssistCardModel {
  const at = formatTimestamp(view.finishedAt ?? view.startedAt, opts.timeZone);
  const problems: string[] = [];
  if (view.status === "rejected") {
    problems.push("This answer failed UPlan's checks, so none of it is shown as an answer.");
    for (const f of view.checkFailures) problems.push(`${CHECK_TEXT[f.check]} ${f.message}`);
  }
  if (view.status === "failed") problems.push(view.errorDetail === "rate-limited" ? "The free model service is at its limit. Try again later." : `The model service did not answer (${view.errorDetail ?? "no reason recorded"}). Try again.`);
  if (view.status === "running") problems.push("This request is still running, or was interrupted. Ask again after a minute.");

  return {
    id: view.id,
    title: KIND_TITLE[view.assistId],
    subject: opts.subject,
    status: view.status,
    statusText: STATUS_TEXT[view.status],
    stamp: `AI-assisted · ${view.modelId} · ${at} · not part of the analysis`,
    outOfDate: opts.outOfDate,
    blocks: blocksOf(view),
    problemLines: problems,
    sent: view.request ? JSON.stringify(view.request, null, 2) : null,
    responses: view.responses.map((r) => `${RESPONSE_TEXT[r.response] ?? r.response} · ${formatTimestamp(r.createdAt, opts.timeZone)}${r.note ? ` · ${r.note}` : ""}`),
    respondAction: opts.respondAction,
    confirm: opts.confirm,
  };
}

const PHASE_OUT_OF_DATE = "The phase's output changed after this was made.";

/**
 * The assist panel of the city profile page (F24 PR1, PR2, EV3, ST3). Finding a passage is open to anyone signed
 * in; drafts are staff-only, and a draft is confirmed by a staff member other than the one who asked for it.
 */
export async function cityAssistPanel(args: {
  actor: Actor;
  jurisdictionId: string;
  timeZone: string;
  profile: { documentSha256: string } | null;
  datasets: { id: string; title: string; knownLimitation: string | null }[];
  requestAction: (assistId: AssistId) => Action;
  respondAction: Action;
  confirmRuleAction: Action;
  confirmMetadataAction: Action;
}): Promise<AssistPanelModel> {
  const { actor } = args;
  const availability = assistAvailability();
  const [suggestions, documents, indexedHash] = await Promise.all([
    listCitySuggestions(actor, args.jurisdictionId, ["PR1", "PR2", "EV3", "ST3"]),
    listSourceDocuments(args.jurisdictionId),
    indexedTextHash(args.jurisdictionId),
  ]);
  const codeDocs = documents.filter((d) => d.kind === "code").map((d) => ({ value: d.id, label: d.title }));
  const checklistDocs = documents.filter((d) => d.kind === "checklist").map((d) => ({ value: d.id, label: d.title }));
  const noText = "Staff have not added any code text yet. Add it below, and AI assist can quote it.";

  const controls: AssistControlModel[] = [
    {
      id: "PR2",
      label: "Find in the code",
      hint: "Returns the exact passage of the city's code text that answers your question, or says none does. It never explains what a rule means for a project.",
      subjects: null,
      subjectLabel: "",
      extra: { kind: "question" },
      action: args.requestAction("PR2"),
      disabledReason: indexedHash === null ? noText : null,
    },
  ];
  if (actor.isStaff) {
    controls.push(
      {
        id: "PR1",
        label: "Draft rule changes from code text",
        hint: "Proposes new values for rules the text states differently. Another staff member confirms before anything changes.",
        subjects: null,
        subjectLabel: "",
        extra: { kind: "select", name: "documentId", label: "Code text", options: codeDocs },
        action: args.requestAction("PR1"),
        disabledReason: args.profile === null ? "This city has no profile yet." : codeDocs.length === 0 ? noText : null,
      },
      {
        id: "ST3",
        label: "Compare studies with the city's checklist",
        hint: "Lists a study that is in the profile and not in the checklist text, or the other way round. It never edits the profile.",
        subjects: null,
        subjectLabel: "",
        extra: { kind: "select", name: "documentId", label: "Checklist", options: checklistDocs },
        action: args.requestAction("ST3"),
        disabledReason: args.profile === null ? "This city has no profile yet." : checklistDocs.length === 0 ? "Add a checklist below first." : null,
      },
      {
        id: "EV3",
        label: "Draft a dataset's limitations from its metadata",
        hint: "Proposes what the dataset can't show, each from a sentence of the publisher's text. Another staff member confirms.",
        subjects: null,
        subjectLabel: "",
        extra: { kind: "metadata", options: args.datasets.map((d) => ({ value: d.id, label: d.title })) },
        action: args.requestAction("EV3"),
        disabledReason: args.datasets.length === 0 ? "No dataset is mapped to this city yet." : null,
      },
    );
  }

  const cards = suggestions.map((v) => {
    const requestedByMe = v.requestedBy === actor.userId;
    const alreadyConfirmed = v.responses.some((r) => r.response === "confirmed");
    let outOfDate: string | null = null;
    let subject: string | null = null;
    let confirm: AssistCardModel["confirm"] = null;
    const extraProblems: string[] = [];

    if (v.assistId === "PR1" || v.assistId === "ST3") {
      subject = documents.find((d) => d.id === v.subjectKey)?.title ?? null;
      if (args.profile && v.outputSha256 !== args.profile.documentSha256) outOfDate = "The city's profile changed after this was made.";
    } else if (v.assistId === "PR2") {
      subject = v.request?.question ?? null;
      if (indexedHash !== null && v.outputSha256 !== indexedHash) outOfDate = "Code text was added after this was made.";
    } else if (v.assistId === "EV3") {
      const dataset = args.datasets.find((d) => d.id === v.subjectKey);
      subject = dataset?.title ?? null;
      const text = v.request?.passages[0]?.text;
      if (dataset && text !== undefined && metadataBinding(dataset.id, text, dataset.knownLimitation) !== v.outputSha256) {
        outOfDate = "The dataset's recorded limitation changed after this was made.";
      }
    }

    const draftReady = v.status === "ready" && !alreadyConfirmed && outOfDate === null && actor.isStaff;
    if (draftReady && v.assistId === "PR1" && v.content && "changes" in v.content && v.content.changes.length > 0) {
      if (requestedByMe) extraProblems.push("Another staff member must confirm this draft. The person who asked for it cannot.");
      else {
        confirm = {
          label: "Confirm and apply as a new profile version",
          description:
            "You are confirming that each chosen change matches the ordinance. The new values start on the date you enter, and the rule in force ends that day.",
          action: args.confirmRuleAction,
          fields: [
            {
              kind: "checkboxes",
              name: "acceptedPaths",
              legend: "Changes to apply",
              options: v.content.changes.map((c) => ({ value: c.path, label: `${c.path}: ${c.from} to ${c.to}` })),
            },
            { kind: "date", name: "effectiveOn", label: "Takes effect on" },
            { kind: "text", name: "ordinance", label: "Ordinance or code update", placeholder: "Ordinance O2026-123" },
          ],
        };
      }
    }
    if (draftReady && v.assistId === "EV3" && v.content && "fields" in v.content && v.content.fields.some((f) => f.key === "limitation")) {
      if (requestedByMe) extraProblems.push("Another staff member must confirm this draft. The person who asked for it cannot.");
      else {
        confirm = {
          label: "Confirm the limitation",
          description: "Sets the dataset's \"what it can't show\" text. Vintage, scale, and method are shown for reading and are not stored.",
          action: args.confirmMetadataAction,
          fields: [],
        };
      }
    }

    const card = cardModel(v, { timeZone: args.timeZone, subject, outOfDate, respondAction: args.respondAction, confirm });
    return { ...card, problemLines: [...card.problemLines, ...extraProblems] };
  });

  return {
    title: "AI assist for the city's rules (optional)",
    summary: "Finds the exact passage of the code behind a rule, and helps staff keep the profile current. Drafts take effect only when a second staff member confirms.",
    configured: availability.configured,
    notConfigured: NOT_CONFIGURED_MESSAGE,
    controls,
    cards,
    group: "Set up",
  };
}

type Subject = { value: string; label: string };

/** What a person can point at, per assist, from the current analysis. */
function subjectsFor(workflow: Workflow): Partial<Record<AssistId, Subject[]>> {
  const { run, rules, datasetTitles } = workflow.facts;
  if (!run || !rules) return {};
  const labelOf = (key: string) => rules.resourceTypes.find((r) => r.key === key)?.label ?? key;
  const titleOf = (id: string) => datasetTitles.get(id) ?? "a dataset";
  const rows = run.results.screening.map((r) => ({
    value: `row:${r.resourceType}:${r.datasetVersionId}`,
    label: `${labelOf(r.resourceType)} — ${titleOf(r.datasetVersionId)}`,
  }));
  const gaps = run.results.evidenceBase.gaps.map((g) => ({
    value: `gap:${g.resourceType}:${g.reason}`,
    label: `${labelOf(g.resourceType)} — no usable dataset`,
  }));
  const resourceTypesInImpact = [...new Set(run.results.impacts.map((i) => i.resourceType))];
  return {
    EV2: run.results.evidenceBase.disagreements.map((d) => ({
      value: `${d.resourceType}:${d.mappedBy}:${d.notMappedBy}`,
      label: `${labelOf(d.resourceType)}: ${titleOf(d.mappedBy)} and ${titleOf(d.notMappedBy)}`,
    })),
    SC1: [...rows, ...gaps],
    SC3: rows,
    ST1: [...new Set(rules.studyTriggers.map((t) => t.study))].sort().map((s) => ({ value: s, label: STUDY_LABEL[s] })),
    IM2: run.results.impacts
      .filter((i) => i.min !== i.max)
      .map((i) => ({ value: `range:${i.impactKey}`, label: `${labelOf(i.resourceType)}: ${MEASURE_LABEL[i.measure].toLowerCase()}` })),
    IM3: resourceTypesInImpact.map((rt) => ({ value: rt, label: labelOf(rt) })),
  };
}

const HINT: Record<AssistId, string> = {
  PR1: "",
  PR2: "",
  EV1: "Restates the drafted lines in plain words. It adds no figure and never says a gap does not matter.",
  EV2: "Lists reasons the two sources' own metadata supports. It never says which source is right.",
  EV3: "",
  SC1: "Says what a row and its rule mean together, with the rule quoted. It never says a row is or is not a concern.",
  SC2: "Turns each recorded gap or limit into a question for a site visit. Questions only.",
  SC3: "Finds the passage that sets the buffer or trigger, quoted exactly.",
  ST1: "Finds the passage that names this study. It never adds or removes a study.",
  ST2: "Asks what information would show whether a flagged resource is on or near the site. It never says what an applicant must do.",
  ST3: "",
  IM1: "Restates each impact row, copying its figures exactly, with both ends of any range.",
  IM2: "Asks what field-rated fact would decide which end of a range applies. It never assumes one.",
  IM3: "Finds the passage that sets a width, quoted exactly.",
};

const EMPTY_REASON: Partial<Record<AssistId, string>> = {
  EV2: "No two sources disagree in this analysis.",
  SC1: "The screening has no rows yet.",
  SC3: "The screening has no rows yet.",
  ST1: "The profile names no studies.",
  IM2: "No impact in this analysis is a range.",
  IM3: "No resource type has a measured impact.",
};

const SUBJECT_LABEL: Partial<Record<AssistId, string>> = {
  EV2: "Which disagreement",
  SC1: "Which row",
  SC3: "Which row",
  ST1: "Which study",
  IM2: "Which range",
  IM3: "Which resource",
};

/**
 * The assist panel for one analysis phase of one project (F24 R18: Site and Footprint have none, so they never
 * call this). `requestAction` and `respondAction` are Server Functions the page bound to its project.
 */
export async function phaseAssistPanel(args: {
  actor: Actor;
  workflow: Workflow;
  phase: Extract<AssistPhase, "evidence" | "screening" | "studies" | "impact">;
  group: StepGroup;
  decisionId: string;
  requestAction: (assistId: AssistId) => Action;
  respondAction: Action;
}): Promise<AssistPanelModel> {
  const { workflow, phase } = args;
  const availability = assistAvailability();
  const suggestions = await listPhaseSuggestions(args.actor, args.decisionId, phase);
  const subjects = subjectsFor(workflow);
  const view = workflow.phases.find((p) => p.phase === phase);
  const currentSha = view?.output?.contentSha256 ?? null;
  const noOutput = view?.output ? null : "This phase has no output yet, so there is nothing to ask about.";

  const controls: AssistControlModel[] = assistsByPhase(phase)
    .filter((a) => !a.staff)
    .map((a) => {
      const options = subjects[a.id] ?? null;
      const needsSubject = a.subject !== "phase";
      return {
        id: a.id,
        label: a.label,
        hint: HINT[a.id],
        subjects: needsSubject ? (options ?? []) : null,
        subjectLabel: SUBJECT_LABEL[a.id] ?? "Which one",
        extra: null,
        action: args.requestAction(a.id),
        disabledReason: noOutput ?? (needsSubject && (options ?? []).length === 0 ? (EMPTY_REASON[a.id] ?? "There is nothing to ask about.") : null),
      };
    });

  const subjectLabelOf = (v: SuggestionView): string | null =>
    v.subjectKey === "" ? null : (Object.values(subjects).flat().find((s) => s?.value === v.subjectKey)?.label ?? null);

  return {
    title: "AI assist (optional)",
    summary: "Reads and quotes the text on this page. Asked for, never automatic, and never part of the analysis.",
    configured: availability.configured,
    notConfigured: NOT_CONFIGURED_MESSAGE,
    controls,
    group: args.group,
    cards: suggestions.map((v) =>
      cardModel(v, {
        timeZone: workflow.timeZone,
        subject: subjectLabelOf(v),
        outOfDate: currentSha !== null && v.outputSha256 !== currentSha ? PHASE_OUT_OF_DATE : null,
        respondAction: args.respondAction,
        confirm: null,
      }),
    ),
  };
}
