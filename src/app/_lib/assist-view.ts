import { NOT_CONFIGURED_MESSAGE, assistAvailability, indexedTextHash, listCitySuggestions, listPhaseSuggestions, listSourceDocuments, metadataBinding, type AssistId, type StoredAssistId, type SuggestionView } from "@/modules/assist";
import type { Actor } from "@/modules/accounts";
import { formatTimestamp } from "@/modules/provenance";
import { contentSha256, type PhaseKey, type Workflow } from "@/modules/workflow";
import type { ActionState } from "@/ui/action-state";
import type { AssistBlock, AssistCardModel, AssistControlModel, AssistPanelModel } from "@/ui/phase/assist-types";
import type { SectionChatModel } from "@/ui/phase/types";

import { shownSectionContent } from "./workflow-labels";

// App-layer glue between the assist module's views and the plain model the panel renders. Every date is
// formatted here, in the city's time zone, and every sentence a person reads that UPlan (not the model) wrote
// is fixed text in this file.

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

// The strongest assists, offered as fillers above the chat's message box (research-phases.md R6). A filler
// writes its text into the box and sets the hidden assist id; it never sends. Site and Footprint have none,
// because a boundary is the planner's own act. The words ask for reading and quoting, never a verdict.
export const PHASE_PROMPTS: Partial<Record<PhaseKey, { assistId: AssistId; label: string; text: string }[]>> = {
  evidence: [
    {
      assistId: "EV1",
      label: "Restate the evidence in plain language",
      text: "Restate this section in plain language for a reader who is not a GIS analyst. Keep every figure exactly as written and quote the sources.",
    },
    {
      assistId: "EV2",
      label: "Explain why two sources may differ",
      text: "Explain why the two sources may differ, using only their own metadata. Do not say which source is right.",
    },
  ],
  screening: [
    {
      assistId: "SC1",
      label: "Explain a screening row with its rule",
      text: "Explain what this screening row and its rule mean together. Quote the rule exactly. Do not say whether the row is a concern.",
    },
    {
      assistId: "SC3",
      label: "Find where the code says this",
      text: "Find the passage of the code that sets this screening row's buffer or trigger, and quote it exactly.",
    },
  ],
  studies: [
    {
      assistId: "ST1",
      label: "Find why this study is listed",
      text: "Find the passage that names this study and explain why it is listed. Do not add or remove a study.",
    },
    {
      assistId: "ST2",
      label: "Turn a flag into a question",
      text: "Turn this flagged resource into questions for a site visit. Ask what information would show whether it is on or near the site.",
    },
  ],
  impact: [
    {
      assistId: "IM1",
      label: "Put the impact table into words",
      text: "Restate each impact row in plain language, copying every figure exactly and both ends of any range.",
    },
    {
      assistId: "IM2",
      label: "What would narrow this range",
      text: "Ask what field-rated fact would decide which end of this range applies. Do not assume one.",
    },
    {
      assistId: "IM3",
      label: "Find where the code sets this width",
      text: "Find the passage of the code that sets this width or measure, and quote it exactly.",
    },
  ],
};

const KIND_TITLE: Record<StoredAssistId, string> = {
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
  "section-explain": "Explain this section",
  "section-edit": "Change this section",
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

const CHECK_TEXT: Record<"K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8" | "K9", string> = {
  K1: "The answer was not in the required shape.",
  K2: "A quote is not in the text it was said to come from.",
  K3: "A number is not one that was given to the model.",
  K4: "The answer used a word that carries a verdict.",
  K5: "The answer pointed at something that was not provided.",
  K6: "A question was not phrased as a question about information.",
  K7: "The answer was longer than allowed.",
  K8: "The drafted change is not one a rule may make.",
  K9: "The change dropped a column the report needs, or used a table this section does not print.",
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
      note: "restates" in p ? `Restates: ${p.restates.map(label).join(", ")}` : null,
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
  if ("headline" in content) {
    const blocks: AssistBlock[] = [
      { heading: "Headline", text: content.headline, quotes: [], note: null },
      ...content.lines.map((line) => ({ heading: null, text: line, quotes: [], note: null })),
    ];
    for (const table of content.tables ?? []) {
      blocks.push({
        heading: `Table: ${table.key}`,
        text: table.caption ? `Caption: ${table.caption} · Columns: ${table.columnOrder.join(" → ")}` : `Columns: ${table.columnOrder.join(" → ")}`,
        quotes: [],
        note: null,
      });
    }
    return blocks;
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
  if (view.status === "failed") problems.push(view.errorDetail === "rate-limited" ? "UPlan Assist is at its limit. Try again later." : `UPlan Assist did not answer (${view.errorDetail ?? "no reason recorded"}). Try again.`);
  if (view.status === "running") problems.push("This request is still running, or was interrupted. Ask again after a minute.");

  return {
    id: view.id,
    title: KIND_TITLE[view.assistId],
    subject: opts.subject,
    status: view.status,
    statusText: STATUS_TEXT[view.status],
    createdAt: (view.finishedAt ?? view.startedAt).toISOString(),
    stamp: `UPlan Assist · ${view.modelId} · ${at} · not part of the analysis`,
    outOfDate: opts.outOfDate,
    blocks: blocksOf(view),
    problemLines: problems,
    sent: view.request ? JSON.stringify(view.request, null, 2) : null,
    responses: view.responses.map((r) => `${RESPONSE_TEXT[r.response] ?? r.response} · ${formatTimestamp(r.createdAt, opts.timeZone)}${r.note ? ` · ${r.note}` : ""}`),
    respondAction: opts.respondAction,
    confirm: opts.confirm,
  };
}

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
  const noText = "Staff have not added any code text yet. Add it below, and UPlan Assist can quote it.";

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
    title: "UPlan Assist for the city's rules (optional)",
    summary: "Finds the exact passage of the code behind a rule, and helps staff keep the profile current. Drafts take effect only when a second staff member confirms.",
    featureTitle: "Find the rule behind the reading",
    featureDescription:
      "Ask UPlan Assist to quote the exact passage of the city's code that answers a question. Drafts for staff take effect only when a second staff member confirms them.",
    configured: availability.configured,
    notConfigured: NOT_CONFIGURED_MESSAGE,
    controls,
    cards,
    group: "Set up",
  };
}

const SECTION_OUTPUT_CHANGED = "The analysis changed after this was made.";
const SECTION_CHANGED = "The section changed after this was made.";

function requestSubject(request: SuggestionView["request"]): string | null {
  if (!request) return null;
  return request.instruction ?? request.question;
}

/**
 * The suggestion as plain text. The chat stores this beside the suggestion id so a restored message still
 * reads if its card can no longer be rebuilt (and so the stored answer never depends on the client's copy).
 */
export function suggestionPlainText(view: SuggestionView): string {
  const lines: string[] = [KIND_TITLE[view.assistId] ?? view.assistId];
  const subject = requestSubject(view.request);
  if (subject) lines.push(subject);
  for (const block of blocksOf(view)) {
    if (block.heading) lines.push(block.heading);
    if (block.text) lines.push(block.text);
    if (block.note) lines.push(block.note);
    for (const quote of block.quotes) lines.push(`"${quote.text}" — from ${quote.source}`);
  }
  if (view.status === "rejected") {
    lines.push("This answer failed UPlan's checks, so none of it is shown as an answer.");
    for (const failure of view.checkFailures) lines.push(`${CHECK_TEXT[failure.check]} ${failure.message}`);
  }
  if (view.status === "failed") {
    lines.push(
      view.errorDetail === "rate-limited"
        ? "UPlan Assist is at its limit. Try again later."
        : `UPlan Assist did not answer (${view.errorDetail ?? "no reason recorded"}). Try again.`,
    );
  }
  if (view.status === "running") lines.push("This request is still running, or was interrupted. Ask again after a minute.");
  return lines.filter((line) => line.trim().length > 0).join("\n").slice(0, 10_000);
}

/**
 * The section chat's model: the phase's fillers, its messages, and the hashes the page carries (R7). The
 * page's Server Actions are bound to its project, so this file passes them through and builds no request.
 */
export async function sectionChatModel(args: {
  actor: Actor;
  workflow: Workflow;
  decisionId: string;
  phase: PhaseKey;
  explainAction: Action;
  changeAction: Action;
  respondAction: Action;
}): Promise<SectionChatModel> {
  const view = args.workflow.phases.find((p) => p.phase === args.phase);
  if (!view) throw new Error(`phase ${args.phase} is not in the workflow`);
  const availability = assistAvailability();
  const suggestions = await listPhaseSuggestions(args.actor, args.decisionId, args.phase);
  const shown = shownSectionContent(view.state);
  const currentSha = shown ? contentSha256(shown) : "";
  const outputSha = view.output?.contentSha256 ?? "";

  return {
    phase: args.phase,
    configured: availability.configured,
    notConfigured: NOT_CONFIGURED_MESSAGE,
    prompts: PHASE_PROMPTS[args.phase] ?? [],
    messages: suggestions.map((v) =>
      cardModel(v, {
        timeZone: args.workflow.timeZone,
        subject: requestSubject(v.request),
        outOfDate:
          v.outputSha256 !== outputSha
            ? SECTION_OUTPUT_CHANGED
            : v.sectionSha256 !== null && v.sectionSha256 !== currentSha
              ? SECTION_CHANGED
              : null,
        respondAction: args.respondAction,
        confirm: null,
      }),
    ),
    explainAction: args.explainAction,
    changeAction: args.changeAction,
    respondAction: args.respondAction,
    contentSha256: currentSha,
    outputSha256: outputSha,
    timeZone: args.workflow.timeZone,
  };
}
