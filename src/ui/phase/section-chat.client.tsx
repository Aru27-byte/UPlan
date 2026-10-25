"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ActionForm } from "../action-form.client";
import type { ActionState } from "../action-state";
import { inputClassName } from "../action-styles";
import { Icon } from "../icons";

import type { AssistCardModel } from "./assist-types";
import type { SectionChatModel, SectionPrompt } from "./types";
import type { SuggestionView } from "@/modules/assist";
import type { Action } from "./types";

import { saveChatMessageAction, loadChatMessagesAction } from "@/app/(app)/projects/[projectId]/actions";

type ChatActionState = ActionState & { data?: SuggestionView };

function formatTimestampClient(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const CHECK_TEXT: Record<string, string> = {
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

const KIND_TITLE: Record<string, string> = {
  "section-explain": "Explain this section",
  "section-edit": "Change this section",
  EV1: "Explain this evidence",
  EV2: "Why the sources may differ",
  SC1: "Explain a screening row",
  SC3: "Where the code says this",
  ST1: "Why this study is listed",
  ST2: "Questions for the conference",
  IM1: "Explain this impact",
  IM2: "What would narrow this range",
  IM3: "Where the code sets this width",
};

const STATUS_TEXT = { ready: "Suggestion", rejected: "Rejected by checks", failed: "Did not finish", running: "Running" } as const;
const RESPONSE_TEXT: Record<"helpful" | "not-helpful" | "dismissed" | "confirmed" | "rejected", string> = {
  helpful: "Marked helpful",
  "not-helpful": "Marked not helpful",
  dismissed: "Dismissed",
  confirmed: "Confirmed by staff and applied",
  rejected: "Rejected by staff",
};

function responseText(key: string): string {
  return RESPONSE_TEXT[key as keyof typeof RESPONSE_TEXT] ?? key;
}

function sourceLabeller(view: SuggestionView): (id: string) => string {
  const byId = new Map((view.request?.passages ?? []).map((p) => [p.id, p.label]));
  return (id) => byId.get(id) ?? id;
}

function blocksOf(view: SuggestionView): AssistCardModel["blocks"] {
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
    const blocks: AssistCardModel["blocks"] = content.passages.map((p) => ({
      heading: p.sectionPath,
      text: "",
      quotes: quotesOf([p.quote]),
      note: null,
    }));
    if (content.gloss) blocks.push({ heading: "In other words", text: content.gloss, quotes: [], note: null });
    return blocks;
  }
  if ("reasons" in content) {
    const REASON_LABEL: Record<string, string> = { vintage: "Vintage", scale: "Scale", definition: "Definition", coverage: "Coverage", method: "Method", unknown: "Unknown" };
    const blocks: AssistCardModel["blocks"] = content.reasons.map((r) => ({
      heading: REASON_LABEL[r.reason] ?? r.reason,
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
    const METADATA_KEY_LABEL: Record<string, string> = { limitation: "What the dataset can't show", vintage: "Vintage", scale: "Scale", method: "Method" };
    if (content.fields.length === 0) {
      return [{ heading: null, text: "The metadata states none of these. Nothing is proposed.", quotes: [], note: null }];
    }
    return content.fields.map((f) => ({
      heading: METADATA_KEY_LABEL[f.key] ?? f.key,
      text: f.value,
      quotes: quotesOf([f.quote]),
      note: null,
    }));
  }
  if ("headline" in content) {
    const blocks: AssistCardModel["blocks"] = [
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
  if ("changes" in content) {
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
  return [];
}

function suggestionToCard(view: SuggestionView, _timeZone: string, respondAction: Action): AssistCardModel {
  const at = formatTimestampClient(view.finishedAt ?? view.startedAt);
  const problems: string[] = [];
  if (view.status === "rejected") {
    problems.push("This answer failed UPlan's checks, so none of it is shown as an answer.");
    for (const f of view.checkFailures) problems.push(`${CHECK_TEXT[f.check] ?? f.check} ${f.message}`);
  }
  if (view.status === "failed") problems.push(view.errorDetail === "rate-limited" ? "UPlan Assist is at its limit. Try again later." : `UPlan Assist did not answer (${view.errorDetail ?? "no reason recorded"}). Try again.`);
  if (view.status === "running") problems.push("This request is still running, or was interrupted. Ask again after a minute.");

  return {
    id: view.id,
    title: KIND_TITLE[view.assistId] ?? view.assistId,
    subject: view.request?.instruction ?? view.request?.question ?? null,
    status: view.status,
    statusText: STATUS_TEXT[view.status] ?? view.status,
    createdAt: new Date(view.finishedAt ?? view.startedAt).toISOString(),
    stamp: `UPlan Assist · ${view.modelId} · ${at} · not part of the analysis`,
    outOfDate: null,
    blocks: blocksOf(view),
    problemLines: problems,
    sent: view.request ? JSON.stringify(view.request, null, 2) : null,
    responses: view.responses.map((r) => `${responseText(r.response)} · ${formatTimestampClient(r.createdAt)}${r.note ? ` · ${r.note}` : ""}`),
    respondAction,
    confirm: null,
  };
}

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  card?: AssistCardModel;
  /** A user message whose save/answer is still in flight: it shows its own words with a "Sending…" note. */
  pending?: boolean;
  /** The assistant's loading bubble, shown from the moment the request is sent until the answer arrives. */
  thinking?: boolean;
};

function clockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chatMessageForm(values: {
  phase: string;
  role: "user" | "assistant";
  content: string;
  instruction?: string | null;
  suggestionId?: string | null;
}): FormData {
  const form = new FormData();
  form.append("phase", values.phase);
  form.append("role", values.role);
  form.append("content", values.content);
  if (values.instruction) form.append("instruction", values.instruction);
  if (values.suggestionId) form.append("suggestionId", values.suggestionId);
  return form;
}

/** The answer as plain text, stored beside the suggestion so the history still reads if the card cannot be rebuilt. */
function cardPlainText(card: AssistCardModel): string {
  const lines: string[] = [card.title];
  if (card.subject) lines.push(card.subject);
  for (const block of card.blocks) {
    if (block.heading) lines.push(block.heading);
    if (block.text) lines.push(block.text);
    if (block.note) lines.push(block.note);
    for (const quote of block.quotes) lines.push(`"${quote.text}" — from ${quote.source}`);
  }
  lines.push(...card.problemLines);
  return lines.filter((line) => line.trim().length > 0).join("\n").slice(0, 10_000);
}

/** Saving history is best effort: a database problem must never stop the question from being answered. */
async function persistChatMessage(
  projectId: string,
  values: Parameters<typeof chatMessageForm>[0],
): Promise<string | null> {
  try {
    const result = await saveChatMessageAction(projectId, {}, chatMessageForm(values));
    return result.error ?? null;
  } catch {
    return "This message could not be saved to the conversation history.";
  }
}

/**
 * The stored history, with each assistant row's suggestion card reattached. Suggestions that predate the
 * history (or whose rows were not written) are shown from the page's own cards, so no answer is lost.
 */
function historyMessages(
  rows: { id: string; role: "user" | "assistant"; content: string; instruction: string | null; suggestionId: string | null; createdAt: string }[],
  cards: AssistCardModel[],
): LocalMessage[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const shown = new Set<string>();
  const fromRows: LocalMessage[] = [];
  for (const row of rows) {
    // Older rows could be written without their prompt (the save failed while the answer's did not). The
    // instruction on the answer puts the planner's words back in front of it, so the history still reads.
    const previous = fromRows[fromRows.length - 1];
    if (row.role === "assistant" && row.instruction && (previous?.role !== "user" || previous.content !== row.instruction)) {
      fromRows.push({
        id: `prompt-${row.id}`,
        role: "user",
        content: row.instruction,
        timestamp: new Date(new Date(row.createdAt).getTime() - 1),
      });
    }
    const card = row.role === "assistant" && row.suggestionId ? cardsById.get(row.suggestionId) : undefined;
    if (card) shown.add(card.id);
    fromRows.push({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.createdAt),
      ...(card ? { card } : {}),
    });
  }
  const cardsWithoutRows: LocalMessage[] = cards
    .filter((card) => !shown.has(card.id))
    .map((card) => ({
      id: `card-${card.id}`,
      role: "assistant" as const,
      content: "",
      timestamp: new Date(card.createdAt),
      card,
    }));
  return [...fromRows, ...cardsWithoutRows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function MessageBubble({ message }: { message: LocalMessage }) {
  if (message.thinking) {
    return (
      <div className="flex gap-2" role="status" aria-label="UPlan Assist is writing an answer">
        <div className="max-w-[75%] rounded-2xl border border-line bg-surface px-4 py-2.5 rounded-bl-md">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="flex gap-0.5" aria-hidden="true">
              <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
            </span>
            <span>UPlan Assist is thinking…</span>
          </div>
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex gap-2 justify-end">
        <div className="max-w-[75%] rounded-2xl bg-brand text-white px-4 py-2.5 rounded-br-md">
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          <p className="mt-1 text-right text-xs opacity-70">{message.pending ? "Sending…" : clockTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  if (!message.card) {
    return (
      <div className="flex gap-2">
        <div className="max-w-[85%] rounded-2xl border border-line bg-surface px-4 py-2.5 rounded-bl-md">
          <p className="text-sm text-text whitespace-pre-wrap break-words">{message.content}</p>
          <p className="mt-1 text-xs text-muted">{clockTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 max-w-[85%]">
        <article className="rounded-2xl border border-line bg-surface p-3 rounded-bl-md">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">{message.card.title}</p>
            <p className="text-xs text-muted">{message.card.statusText}</p>
          </div>

          {message.card.outOfDate ? (
            <p className="mb-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-text">
              <span className="font-semibold text-warn">Out of date. </span>
              {message.card.outOfDate} Ask again to get an answer about what is on the page now.
            </p>
          ) : null}

          {message.card.problemLines.length > 0 ? (
            <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-text">
              {message.card.problemLines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}

          {message.card.blocks.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {message.card.blocks.map((block, i) => (
                <li key={`${i}:${block.text}`} className="text-sm text-text">
                  {block.heading ? <p className="font-semibold">{block.heading}</p> : null}
                  {block.text ? <p>{block.text}</p> : null}
                  {block.note ? <p className="text-xs text-muted">{block.note}</p> : null}
                  {block.quotes.map((q, j) => (
                    <blockquote key={`${j}:${q.text}`} className="mt-1.5 border-l-4 border-line pl-3 text-sm text-text">
                      <p>&ldquo;{q.text}&rdquo;</p>
                      <footer className="text-xs text-muted">From: {q.source}</footer>
                    </blockquote>
                  ))}
                </li>
              ))}
            </ol>
          ) : null}
        </article>
      </div>
    </div>
  );
}

export function SectionChat({ model, disabledReason, projectId }: { model: SectionChatModel; disabledReason: string | null; projectId: string }) {
  const [mode, setMode] = useState<"explain" | "change">("explain");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const assistRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // The newest server-built cards. Kept in a ref so loading the history runs once per phase, not on every
  // re-render a Server Action's refresh() causes mid-answer.
  const serverCardsRef = useRef<AssistCardModel[]>(model.messages);
  serverCardsRef.current = model.messages;
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadProblem(null);
    const form = new FormData();
    form.append("phase", model.phase);
    loadChatMessagesAction(projectId, {}, form)
      .then((result) => {
        if (cancelled) return;
        if (result.error) setLoadProblem("The earlier conversation could not be loaded.");
        const rows = result.data ?? [];
        setMessages(historyMessages(rows, serverCardsRef.current));
      })
      .catch(() => {
        if (cancelled) return;
        // Still show the answers the page already built for this phase.
        setLoadProblem("The earlier conversation could not be loaded.");
        setMessages(historyMessages([], serverCardsRef.current));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, model.phase]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, isSubmitting]);

  const action = useCallback(
    async (previous: ChatActionState, formData: FormData): Promise<ActionState> => {
      const rawInstruction = formData.get("instruction");
      const instruction = typeof rawInstruction === "string" ? rawInstruction.trim() : "";
      if (instruction.length === 0) return { error: "Type a question or a change." };

      setIsSubmitting(true);
      const sentAt = Date.now();
      const userId = `user-${sentAt}`;
      const thinkingId = `thinking-${sentAt}`;
      // Show the prompt and the loading state together, before anything leaves the browser.
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: instruction, timestamp: new Date(sentAt), pending: true },
        { id: thinkingId, role: "assistant", content: "", timestamp: new Date(sentAt), thinking: true },
      ]);

      let saveProblem: string | null = null;

      try {
        saveProblem = await persistChatMessage(projectId, {
          phase: model.phase,
          role: "user",
          content: instruction,
          instruction,
        });

        const result = (await (mode === "explain" ? model.explainAction(previous, formData) : model.changeAction(previous, formData))) as ChatActionState;
        const card = result.data ? suggestionToCard(result.data, model.timeZone, model.respondAction) : null;
        const answer = card ? cardPlainText(card) : (result.error ?? result.notice ?? "The request did not finish. Try again.");
        const answerId = card ? `answer-${result.data?.id}` : `notice-${sentAt}`;

        // Replace the loading bubble with the answer, directly below the prompt.
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== thinkingId).map((m) => (m.id === userId ? { ...m, pending: false } : m)),
          { id: answerId, role: "assistant", content: answer, timestamp: new Date(), ...(card ? { card } : {}) },
        ]);

        saveProblem ??= await persistChatMessage(projectId, {
          phase: model.phase,
          role: "assistant",
          content: answer,
          instruction,
          suggestionId: result.data?.id ?? null,
        });
      } catch (error) {
        const answer = `The request did not finish: ${error instanceof Error ? error.message : "unknown error"}.`;
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== thinkingId).map((m) => (m.id === userId ? { ...m, pending: false } : m)),
          { id: `error-${sentAt}`, role: "assistant", content: answer, timestamp: new Date() },
        ]);
        saveProblem ??= await persistChatMessage(projectId, {
          phase: model.phase,
          role: "assistant",
          content: answer,
          instruction,
        });
      } finally {
        setIsSubmitting(false);
        if (textareaRef.current) textareaRef.current.value = "";
      }

      return saveProblem ? { error: saveProblem } : {};
    },
    [mode, model.phase, model.explainAction, model.changeAction, model.timeZone, model.respondAction, projectId],
  );

  function chooseMode(next: "explain" | "change") {
    setMode(next);
    if (assistRef.current) assistRef.current.value = "";
  }

  function fill(prompt: SectionPrompt) {
    setMode("explain");
    if (assistRef.current) assistRef.current.value = prompt.assistId;
    if (textareaRef.current) {
      textareaRef.current.value = prompt.text;
      textareaRef.current.focus();
    }
  }

  const modeColors = {
    explain: "border-brand bg-brand/5",
    change: "border-accent-tan bg-accent-tan/5",
  };

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-green text-ink">
          <Icon name="sparkles" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-heading">UPlan Assist</p>
          <p className="text-[11px] text-muted">Ask about this section</p>
        </div>
      </div>
      {!model.configured ? (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <p role="status" className="text-sm text-muted max-w-xs">
            {model.notConfigured} This phase works fully without it.
          </p>
        </div>
      ) : disabledReason ? (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <p role="status" className="text-sm text-muted max-w-xs">{disabledReason}</p>
        </div>
      ) : (
<>
            <div className={`overflow-y-auto p-4 ${modeColors[mode]} rounded-xl border transition-colors duration-200 max-h-[500px]`}>
              <div className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
                {isLoading ? (
                  <p role="status" className="py-6 text-center text-sm text-muted">Loading the conversation…</p>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-muted py-8">
                    <Icon name="sparkles" className="text-2xl opacity-30" />
                    <p className="text-sm">Ask UPlan Assist about this section</p>
                    <p className="text-xs">Choose a prompt below or type your own message</p>
                  </div>
                ) : (
                  messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
                )}
                <div ref={endRef} />
              </div>
            </div>

            {loadProblem ? (
              <p role="status" className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-text">{loadProblem}</p>
            ) : null}

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2">
              <div role="group" aria-label="UPlan Assist mode" className="flex gap-1 rounded-lg border bg-canvas/50 p-1">
                <button
                  type="button"
                  aria-pressed={mode === "explain"}
                  onClick={() => chooseMode("explain")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    mode === "explain" ? "bg-brand text-ink shadow-sm" : "text-muted hover:text-text"
                  }`}
                >
                  Explain
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "change"}
                  onClick={() => chooseMode("change")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    mode === "change" ? "bg-accent-tan text-ink shadow-sm" : "text-muted hover:text-text"
                  }`}
                >
                  Change
                </button>
              </div>
              <span className="text-xs text-muted ml-auto">
                {mode === "explain" ? "Answers a question, changes nothing" : "Rewrites narrative, stores a version"}
              </span>
            </div>

            {mode === "explain" && model.prompts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-2" role="group" aria-label="Prompt suggestions">
                {model.prompts.map((prompt) => (
                  <button
                    key={prompt.assistId}
                    type="button"
                    onClick={() => fill(prompt)}
                    className="rounded-full border border-accent-gold/45 bg-accent-gold/[0.12] px-3 py-1 text-xs font-semibold text-accent-gold transition-colors duration-150 hover:border-accent-gold"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            ) : null}

            <ActionForm action={action} className="flex flex-col gap-2">
              <input type="hidden" name="phase" value={model.phase} />
              <input type="hidden" name="expectedContentSha256" value={model.contentSha256} />
              <input type="hidden" name="expectedOutputSha256" value={model.outputSha256} />
              <input ref={assistRef} type="hidden" name="assistId" defaultValue="" />

              <div className="flex gap-2">
                <label htmlFor="section-chat-message" className="sr-only">
                  {mode === "explain" ? "Your question" : "What to change"}
                </label>
                <textarea
                  ref={textareaRef}
                  id="section-chat-message"
                  name="instruction"
                  rows={3}
                  required
                  maxLength={2000}
                  disabled={isSubmitting || isLoading}
                  onChange={() => {
                    if (assistRef.current) assistRef.current.value = "";
                  }}
                  className={`flex-1 ${inputClassName} font-normal resize-none ${isSubmitting || isLoading ? "opacity-50" : ""}`}
                  placeholder={
                    mode === "explain"
                      ? "Ask what this section says, or why a source may differ…"
                      : "Say what to change about the narrative. Figures, maps, tables, and quoted text stay as they are…"
                  }
                />
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                    isSubmitting || isLoading
                      ? "border-line bg-canvas/50 text-muted cursor-not-allowed"
                      : mode === "explain"
                      ? "border-brand bg-brand text-ink hover:bg-accent-lime"
                      : "border-accent-tan bg-accent-tan text-ink hover:bg-accent-tan/90"
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="animate-spin rounded-full border-2 border-current border-t-transparent size-4" />
                      {mode === "explain" ? "Asking…" : "Changing…"}
                    </span>
                  ) : mode === "explain" ? (
                    "Ask"
                  ) : (
                    "Change"
                  )}
                </button>
              </div>

              {isSubmitting && (
                <p className="text-xs text-muted text-center animate-pulse">
                  {mode === "explain" ? "Asking UPlan Assist… this can take up to a minute" : "Changing the section… this can take up to a minute"}
                </p>
              )}

              <p className="text-xs text-muted text-center">
                AI may make mistakes. Always double check important information before trusting it.
              </p>
            </ActionForm>
          </div>
        </>
      )}
    </div>
  );
}