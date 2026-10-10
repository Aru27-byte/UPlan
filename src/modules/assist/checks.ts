import type { ProfileDocument } from "@/modules/profiles";
import { ValidationError } from "@/platform/errors";

import { QuoteSchema, RuleDraftSchema, type AssistDef, type Quote, type SuggestionContent } from "./kinds";
import { digitRuns, numbersInRequest, type AssistRequest } from "./request";
import { applyRuleChanges, parseRulePath, ruleValuesOf } from "./rule-changes";

// TechDesign/ai-assist.md, "Checks every output passes". Every function here is deterministic and pure. The
// rule behind all of them is check, never repair: a failed output is recorded as rejected and shown as
// rejected. It is never trimmed, retried with hints, or sent to another model (F24 R4–R6, R11).

export type CheckId = "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8";
export type CheckFailure = { check: CheckId; message: string };
export type CheckResult = { ok: true; content: SuggestionContent } | { ok: false; failures: CheckFailure[] };

// K4. Applied to what the MODEL wrote, never to a quote: a quote is the city's own sentence, and the code is
// full of "shall" and "condition". The words are the design's denylist plus rank and score (F24 R6).
const VERDICT_DENYLIST: RegExp[] = [
  /\bapprov(?:e|es|ed|al|ing)\b/i,
  /\bden(?:y|ies|ied|ial)\b/i,
  /\brecommend\w*/i,
  /\bclear(?:s|ed|ance)?\b/i, // "clearing" (what a proposal does to land) is not a verdict
  /\bsafe(?:ly|ty)?\b/i,
  /\bacceptable\b/i,
  /\bno stud(?:y|ies)\b/i,
  /\bnot needed\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bshall\b/i,
  /\bconditions?\b/i,
  /\brank(?:s|ed|ing)?\b/i,
  /\bscor(?:e|es|ed|ing)\b/i,
];

export function verdictWordIn(text: string): string | null {
  for (const pattern of VERDICT_DENYLIST) {
    const m = pattern.exec(text);
    if (m) return m[0];
  }
  return null;
}

// K6. A question is interrogative and about information, never a requirement.
const INTERROGATIVES = new Set([
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how", "is", "are", "was", "were",
  "does", "do", "did", "can", "could", "would", "will", "has", "have", "had",
]);
const REQUIREMENT_WORDS = /\b(?:ensure|require[sd]?|requirement)\b/i;

/**
 * The text of a quote as compared (K2). Whitespace, hyphenation at a line break, ligatures, and curly
 * punctuation are normalized, because a PDF's line breaks would otherwise reject a true quote; case and every
 * word are not.
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** A model that wraps its JSON in one markdown fence has still written only JSON; anything else is not parsed. */
function parseModelJson(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  let text = raw.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*)\n```$/.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false, message: "The answer is not valid JSON." };
  }
}

type Harvest = {
  prose: string[];
  quotes: { quote: Quote; sectionPath: string | null }[];
  refs: { id: string; kind: string | null }[];
  questions: string[];
};

const PROSE_KEYS = new Set(["text", "gloss", "value"]);
const PROSE_LIST_KEYS = new Set(["notStated"]);

// Reads a validated content object for the strings a check cares about. The shapes are fixed, so which key
// holds prose, a quote, or a reference is known; anything else (enums, numbers, booleans, section paths) is
// not model prose.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function harvest(node: unknown, out: Harvest, parentSectionPath: string | null = null): Harvest {
  if (Array.isArray(node)) {
    for (const item of node) harvest(item, out, parentSectionPath);
    return out;
  }
  if (!isRecord(node)) return out;
  const obj = node;
  const sectionPath = typeof obj.sectionPath === "string" ? obj.sectionPath : parentSectionPath;

  for (const [key, value] of Object.entries(obj)) {
    if ((key === "quote" || key === "quotes") && value !== null && value !== undefined) {
      for (const q of Array.isArray(value) ? value : [value]) {
        const parsed = QuoteSchema.safeParse(q);
        if (parsed.success) out.quotes.push({ quote: parsed.data, sectionPath: key === "quote" ? sectionPath : null });
      }
    } else if (key === "restates" && Array.isArray(value)) {
      for (const id of value) if (typeof id === "string") out.refs.push({ id, kind: null });
    } else if (key === "basis" && isRecord(value)) {
      if (typeof value.ref === "string") out.refs.push({ id: value.ref, kind: typeof value.kind === "string" ? value.kind : null });
    } else if (PROSE_KEYS.has(key) && typeof value === "string") {
      out.prose.push(value);
    } else if (PROSE_LIST_KEYS.has(key) && Array.isArray(value)) {
      for (const s of value) if (typeof s === "string") out.prose.push(s);
    } else if (key === "questions" && Array.isArray(value)) {
      for (const q of value) {
        if (isRecord(q) && typeof q.text === "string") out.questions.push(q.text);
      }
      harvest(value, out, sectionPath);
    } else if (typeof value === "object" && value !== null) {
      harvest(value, out, sectionPath);
    }
  }
  return out;
}

/**
 * K1–K8 in order. The first failing check stops the rest, because a later check on an output that already
 * failed a cheaper one is noise. `baseDocument` is the profile a rule draft was made against (K8 only).
 */
export function checkOutput(args: {
  assist: AssistDef;
  rawText: string;
  request: AssistRequest;
  baseDocument: ProfileDocument | null;
}): CheckResult {
  const { assist, request } = args;
  const fail = (check: CheckId, ...messages: string[]): CheckResult => ({
    ok: false,
    failures: messages.map((message) => ({ check, message })),
  });

  // K1 — shape. No repair, no defaults.
  const json = parseModelJson(args.rawText);
  if (!json.ok) return fail("K1", json.message);
  const shape = assist.schema.safeParse(json.value);
  if (!shape.success) {
    return fail("K1", ...shape.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(answer)"}: ${i.message}`));
  }
  const content = shape.data;
  const found = harvest(content, { prose: [], quotes: [], refs: [], questions: [] });

  // K2 — every quote is, word for word, in the passage it names, and that passage was one of those sent.
  const passages = new Map(request.passages.map((p) => [p.id, p]));
  const quoteProblems: string[] = [];
  for (const { quote } of found.quotes) {
    const passage = passages.get(quote.sourceId);
    if (!passage) {
      quoteProblems.push(`A quote names "${quote.sourceId}", which is not a passage that was sent.`);
    } else if (normalizeForQuote(quote.text).length < 4 || !normalizeForQuote(passage.text).includes(normalizeForQuote(quote.text))) {
      quoteProblems.push(`The quote "${quote.text.slice(0, 80)}" is not in ${passage.label}.`);
    }
  }
  if (quoteProblems.length > 0) return fail("K2", ...quoteProblems);

  // K3 — every number is a copy of a number that was sent.
  const allowedNumbers = numbersInRequest(request);
  const invented = [...new Set(found.prose.flatMap(digitRuns))].filter((n) => !allowedNumbers.has(n));
  if (invented.length > 0) return fail("K3", ...invented.map((n) => `The number ${n} is not in what was sent.`));

  // K4 — no verdict word in anything the model wrote.
  for (const text of found.prose) {
    const word = verdictWordIn(text);
    if (word) return fail("K4", `The answer uses "${word}", which carries a verdict. UPlan's assist reads and quotes; it does not decide.`);
  }

  // K5 — every reference is to a record that was in the request, of the kind it claims.
  const refKinds = new Map(request.refs.map((r) => [r.id, r.kind]));
  const refProblems: string[] = [];
  for (const ref of found.refs) {
    const kind = refKinds.get(ref.id);
    if (kind === undefined) refProblems.push(`"${ref.id}" is not a record that was sent.`);
    else if (ref.kind !== null && ref.kind !== kind) refProblems.push(`"${ref.id}" is a ${kind}, not a ${ref.kind}.`);
  }
  for (const { quote, sectionPath } of found.quotes) {
    if (sectionPath === null) continue;
    const label = passages.get(quote.sourceId)?.label;
    if (label !== sectionPath) refProblems.push(`The section "${sectionPath}" is not the section of the passage quoted (${label ?? "unknown"}).`);
  }
  if (refProblems.length > 0) return fail("K5", ...refProblems);

  // K6 — a question is a question, and about information.
  for (const text of found.questions) {
    const first = text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    if (!text.trim().endsWith("?") || !INTERROGATIVES.has(first) || REQUIREMENT_WORDS.test(text)) {
      return fail("K6", `"${text.slice(0, 80)}" is not phrased as a question about information.`);
    }
  }

  // K7 — size.
  const words = found.prose.reduce((sum, s) => sum + wordCount(s), 0);
  if (words > assist.maxWords) return fail("K7", `The answer is ${words} words; the limit for this assist is ${assist.maxWords}.`);
  if (assist.kind === "explain" && "paragraphs" in content) {
    const long = content.paragraphs.find((p) => wordCount(p.text) > 150);
    if (long) return fail("K7", "A paragraph is longer than 150 words.");
  }

  // K8 — a rule draft changes only a number a rule owns, from its true current value, to a number its quote states.
  if (assist.kind === "rule-draft") {
    const draft = RuleDraftSchema.safeParse(content);
    if (!draft.success || args.baseDocument === null) return fail("K8", "A rule draft needs the profile it was made against.");
    const current = new Map(ruleValuesOf(args.baseDocument).map((v) => [v.path, v.value]));
    const problems: string[] = [];
    for (const change of draft.data.changes) {
      if (parseRulePath(change.path) === null) {
        problems.push(`"${change.path}" is not a number a rule owns; settings and dates are never drafted.`);
        continue;
      }
      if (current.get(change.path) !== change.from) {
        problems.push(`"${change.path}" is ${String(current.get(change.path))} in the profile, not ${change.from}.`);
      }
      if (change.to === change.from) problems.push(`"${change.path}" is "changed" to the value it already has.`);
      const quoted = digitRuns(change.quote.text).map((n) => n.replace(/,/g, ""));
      if (!quoted.includes(String(change.to))) problems.push(`The new value ${change.to} for "${change.path}" is not in its quote.`);
    }
    if (problems.length === 0) {
      try {
        applyRuleChanges(args.baseDocument, draft.data.changes.map((c) => ({ path: c.path, to: c.to })), null);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        problems.push(err.message);
      }
    }
    if (problems.length > 0) return fail("K8", ...problems);
  }

  return { ok: true, content };
}
