import { describe, expect, it } from "vitest";

import type { ProfileDocument } from "@/modules/profiles";

import { checkOutput, normalizeForQuote, verdictWordIn } from "./checks";
import { ASSISTS, SECTION_ASSISTS, type AssistDef, type SectionAssistKind } from "./kinds";
import { AssistRequestSchema, type AssistRequest } from "./request";

// F24 R4–R6, R16: every way a model's output can be wrong is rejected, and the rejection names the check.
// The fixtures are small and hand-written; the real model is only called by the evaluation suite.

const BASE_REQUEST = {
  promptVersion: 1,
  task: "task",
  question: null,
  passages: [
    { id: "line:1", label: "Drafted line 1", text: "Wetlands: Mapped in the study area: 2 features, 1.84 acres." },
    { id: "chunk:1", label: "21A.50.290", text: "A buffer of one hundred (100) feet shall be\nmaintained from the edge of a Category II wetland." },
  ],
  refs: [
    { id: "line:1", kind: "line" as const },
    { id: "row:gap-1", kind: "gap" as const },
  ],
  ruleValues: [],
};

function request(overrides: Partial<AssistRequest> & Pick<AssistRequest, "assistId" | "kind">): AssistRequest {
  return AssistRequestSchema.parse({ ...BASE_REQUEST, ...overrides });
}

const explainRequest = request({ assistId: "EV1", kind: "explain" });
const findRequest = request({ assistId: "SC3", kind: "find" });
const questionsRequest = request({ assistId: "SC2", kind: "questions" });

const run = (assistId: keyof typeof ASSISTS, req: AssistRequest, answer: unknown, baseDocument: ProfileDocument | null = null) =>
  checkOutput({ assist: ASSISTS[assistId], request: req, rawText: typeof answer === "string" ? answer : JSON.stringify(answer), baseDocument });

function sectionDef(kind: SectionAssistKind, phase: AssistDef["phase"] = "screening"): AssistDef {
  const def = SECTION_ASSISTS[kind];
  return { id: kind, phase, kind, wave: 1, label: "", staff: false, subject: "phase", promptVersion: def.promptVersion, task: def.task, maxWords: def.maxWords, schema: def.schema };
}

const runSection = (kind: SectionAssistKind, req: AssistRequest, answer: unknown, phase: AssistDef["phase"] = "screening") =>
  checkOutput({ assist: sectionDef(kind, phase), request: req, rawText: typeof answer === "string" ? answer : JSON.stringify(answer), baseDocument: null });

const SECTION = {
  headline: "Screening results",
  lines: ["Wetlands are mapped in the study area."],
  tables: [{ key: "screening", caption: null, columnOrder: ["resourceType", "finding", "source", "confidence"] }],
};

const sectionRequest = (assistId: "section-explain" | "section-edit") =>
  request({
    assistId,
    kind: assistId,
    passages: [
      { id: "section:0", label: "The section's headline", text: SECTION.headline },
      { id: "section:1", label: "A line of the section", text: SECTION.lines[0] ?? "" },
    ],
    section: SECTION,
    instruction: "Make the second line plainer.",
    tableFormats: [{ key: "screening", columns: ["resourceType", "finding", "source", "confidence"] }],
  });

const failedCheck = (r: ReturnType<typeof run>) => (r.ok ? null : r.failures[0]?.check);

describe("R4–R6: output checks", () => {
  it("R4: accepts an explanation whose quote is in the passage and whose number was sent", () => {
    const r = run("EV1", explainRequest, {
      paragraphs: [{ text: "Two features are mapped, 1.84 acres.", restates: ["line:1"], quotes: [{ sourceId: "line:1", text: "2 features, 1.84 acres" }] }],
    });
    expect(r.ok).toBe(true);
  });

  it("R4: K1 rejects an answer that is not JSON, without repairing it", () => {
    expect(failedCheck(run("EV1", explainRequest, "Sure! Here is the explanation."))).toBe("K1");
  });

  it("R4: K1 rejects a shape with an extra key", () => {
    const r = run("EV1", explainRequest, {
      paragraphs: [{ text: "x", restates: ["line:1"], quotes: [], recommendation: "approve it" }],
    });
    expect(failedCheck(r)).toBe("K1");
  });

  it("R4: K1 accepts JSON wrapped in one markdown fence, and nothing else is stripped", () => {
    const fenced = "```json\n" + JSON.stringify({ found: false }) + "\n```";
    expect(run("SC3", findRequest, fenced).ok).toBe(true);
    expect(failedCheck(run("SC3", findRequest, 'Here: {"found": false}'))).toBe("K1");
  });

  it("R4: K2 rejects a quote that is not in the passage it names", () => {
    const r = run("SC3", findRequest, {
      found: true,
      passages: [{ sectionPath: "21A.50.290", quote: { sourceId: "chunk:1", text: "a buffer of two hundred feet" } }],
    });
    expect(failedCheck(r)).toBe("K2");
  });

  it("R4: K2 rejects a quote that names a passage that was not sent", () => {
    const r = run("SC3", findRequest, {
      found: true,
      passages: [{ sectionPath: "21A.50.290", quote: { sourceId: "chunk:99", text: "anything at all" } }],
    });
    expect(failedCheck(r)).toBe("K2");
  });

  it("R4: K2 accepts a true quote across a line break and a hyphenation", () => {
    const r = run("SC3", findRequest, {
      found: true,
      passages: [{ sectionPath: "21A.50.290", quote: { sourceId: "chunk:1", text: "shall be maintained from the edge of a Category II wetland" } }],
    });
    expect(r.ok).toBe(true);
  });

  it("R4: K5 rejects a section path that is not the section of the passage quoted", () => {
    const r = run("SC3", findRequest, {
      found: true,
      passages: [{ sectionPath: "21A.99.999", quote: { sourceId: "chunk:1", text: "a Category II wetland" } }],
    });
    expect(failedCheck(r)).toBe("K5");
  });

  it("R4: K5 rejects a restated line that was not sent", () => {
    const r = run("EV1", explainRequest, { paragraphs: [{ text: "Two features.", restates: ["line:9"], quotes: [] }] });
    expect(failedCheck(r)).toBe("K5");
  });

  it("R5: K3 rejects an invented number", () => {
    const r = run("EV1", explainRequest, { paragraphs: [{ text: "About 2 acres, or 80,000 square feet.", restates: ["line:1"], quotes: [] }] });
    expect(failedCheck(r)).toBe("K3");
  });

  it("R5: K3 rejects a rounded number: 1.84 may not become 2 acres, and 1.8 is not 1.84", () => {
    const r = run("EV1", explainRequest, { paragraphs: [{ text: "Roughly 1.8 acres.", restates: ["line:1"], quotes: [] }] });
    expect(failedCheck(r)).toBe("K3");
  });

  it.each([
    ["approve", "This site should be approved."],
    ["deny", "The application could be denied."],
    ["recommend", "We recommend a study."],
    ["clear", "The land is clear of wetlands."],
    ["safe", "It is safe to develop."],
    ["no study", "There is no study needed here."],
    ["condition", "A condition of 2 acres applies."],
    ["should", "The planner should look closer."],
  ])("R6: K4 rejects a verdict word (%s)", (_word, text) => {
    const r = run("EV1", explainRequest, { paragraphs: [{ text, restates: ["line:1"], quotes: [] }] });
    expect(failedCheck(r)).toBe("K4");
  });

  it("R6: the denylist does not fire on the city's own words inside a quote", () => {
    const r = run("SC3", findRequest, {
      found: true,
      passages: [{ sectionPath: "21A.50.290", quote: { sourceId: "chunk:1", text: "shall be maintained from the edge" } }],
    });
    expect(r.ok).toBe(true);
  });

  it("R6: 'clearing' is not a verdict, but 'cleared' is", () => {
    expect(verdictWordIn("Site clearing and grading")).toBeNull();
    expect(verdictWordIn("The site is cleared")).not.toBeNull();
  });

  it("R6: K6 rejects a question phrased as a requirement, or without a question mark", () => {
    const asked = (text: string) =>
      run("SC2", questionsRequest, { questions: [{ text, basis: { kind: "gap", ref: "row:gap-1" } }] });
    expect(asked("What mapped data would show whether a stream is on the site?").ok).toBe(true);
    expect(failedCheck(asked("Ensure a stream survey is done?"))).toBe("K6");
    expect(failedCheck(asked("What would show a stream"))).toBe("K6");
    expect(failedCheck(asked("A survey of the stream is needed."))).toBe("K6");
  });

  it("R6: K5 rejects a question whose basis is not a record that was sent", () => {
    const r = run("SC2", questionsRequest, { questions: [{ text: "What is mapped nearby?", basis: { kind: "gap", ref: "row:made-up" } }] });
    expect(failedCheck(r)).toBe("K5");
  });

  it("R6: K5 rejects a basis of the wrong kind", () => {
    const r = run("SC2", questionsRequest, { questions: [{ text: "What is mapped nearby?", basis: { kind: "flag", ref: "row:gap-1" } }] });
    expect(failedCheck(r)).toBe("K5");
  });

  it("R6: K7 rejects an answer over the assist's word limit", () => {
    const long = Array.from({ length: 200 }, () => "word").join(" ");
    const r = run("SC1", request({ assistId: "SC1", kind: "explain" }), { paragraphs: [{ text: long, restates: ["line:1"], quotes: [] }] });
    expect(failedCheck(r)).toBe("K7");
  });
});

describe("R7: rule drafts (K8)", () => {
  const base = {
    schemaVersion: 1,
    resourceTypes: [{ key: "wetlands", label: "Wetlands", ruleSet: "critical-areas", mapStatus: "approximate" }],
    bufferRules: [
      {
        key: "wetland-buffer",
        resourceType: "wetlands",
        appliesWhen: null,
        widthFt: 100,
        citation: { codeSection: "SMC 21A.50.290", ordinance: null, sourceUrl: "https://example.test/code" },
        effectiveOn: "2020-01-01",
        repealedOn: null,
      },
    ],
    studyTriggers: [],
    treeRules: [],
    settings: {
      vesting: [
        { ruleSet: "critical-areas", vests: true },
        { ruleSet: "trees", vests: false },
      ],
      retention: [
        { recordType: "decision", retainYears: 6, countFrom: "created" },
        { recordType: "report", retainYears: 6, countFrom: "report-released" },
        { recordType: "profile-change", retainYears: 6, countFrom: "created" },
        { recordType: "records-export", retainYears: 6, countFrom: "created" },
      ],
      exportFormats: ["pdf"],
    },
  } satisfies Record<string, unknown>;

  const req = request({
    assistId: "PR1",
    kind: "rule-draft",
    ruleValues: [{ path: "bufferRules.wetland-buffer.widthFt", value: 100 }],
    passages: [{ id: "chunk:1", label: "21A.50.290", text: "The standard buffer for a Category II wetland is 150 feet." }],
  });

  const change = (over: Record<string, unknown>) => ({
    changes: [
      {
        path: "bufferRules.wetland-buffer.widthFt",
        from: 100,
        to: 150,
        sectionPath: "21A.50.290",
        quote: { sourceId: "chunk:1", text: "buffer for a Category II wetland is 150 feet" },
        ...over,
      },
    ],
  });

  const doc = (): ProfileDocument => structuredClone(base) as unknown as ProfileDocument;

  it("R7: accepts a change to a rule-owned number whose quote states the new value", () => {
    expect(run("PR1", req, change({}), doc()).ok).toBe(true);
  });

  it("R7: K8 rejects a change to a setting a planner chose", () => {
    expect(failedCheck(run("PR1", req, change({ path: "settings.vesting.0.vests" }), doc()))).toBe("K8");
  });

  it("R7: K8 rejects a change to a rule's date", () => {
    expect(failedCheck(run("PR1", req, change({ path: "bufferRules.wetland-buffer.effectiveOn" }), doc()))).toBe("K8");
  });

  it("R7: K8 rejects a `from` that is not the profile's current value", () => {
    expect(failedCheck(run("PR1", req, change({ from: 75 }), doc()))).toBe("K8");
  });

  it("R7: K8 rejects a new value that its quote does not state", () => {
    const r = run("PR1", req, change({ to: 175 }), doc());
    expect(failedCheck(r)).toBe("K8");
  });

  it("R7: K8 rejects a rule that does not exist", () => {
    expect(failedCheck(run("PR1", req, change({ path: "bufferRules.no-such-rule.widthFt" }), doc()))).toBe("K8");
  });

  it("R7: a draft without the profile it was made against is rejected, never guessed at", () => {
    expect(failedCheck(run("PR1", req, change({}), null))).toBe("K8");
  });
});

describe("R7/R19: section chat (K9)", () => {
  it("R19: section-explain accepts a quoted line of the section", () => {
    const r = runSection("section-explain", sectionRequest("section-explain"), {
      paragraphs: [{ text: "The section states where wetlands are mapped.", quotes: [{ sourceId: "section:1", text: "Wetlands are mapped in the study area." }] }],
    });
    expect(r.ok).toBe(true);
  });

  it("R19: section-explain rejects a quote that is not in the section", () => {
    const r = runSection("section-explain", sectionRequest("section-explain"), {
      paragraphs: [{ text: "The section states where wetlands are mapped.", quotes: [{ sourceId: "section:1", text: "Wetlands cover half the site." }] }],
    });
    expect(failedCheck(r)).toBe("K2");
  });

  it("R19: K7 applies the 150-word paragraph cap to section-explain", () => {
    const long = Array.from({ length: 200 }, () => "word").join(" ");
    const r = runSection("section-explain", sectionRequest("section-explain"), { paragraphs: [{ text: long, quotes: [] }] });
    expect(failedCheck(r)).toBe("K7");
  });

  it("R7: K9 accepts a new caption and a reordered column list", () => {
    const r = runSection("section-edit", sectionRequest("section-edit"), {
      headline: "Screening results",
      lines: ["Wetlands are mapped in the study area."],
      tables: [{ key: "screening", caption: "Screening register", columnOrder: ["confidence", "source", "finding", "resourceType"] }],
    });
    expect(r.ok).toBe(true);
  });

  it("R7: K9 rejects a column list that drops a provenance column", () => {
    const r = runSection("section-edit", sectionRequest("section-edit"), {
      headline: "Screening results",
      lines: ["Wetlands are mapped in the study area."],
      tables: [{ key: "screening", caption: null, columnOrder: ["resourceType", "finding", "source"] }],
    });
    expect(failedCheck(r)).toBe("K9");
  });

  it("R7: K9 rejects a table the section does not have", () => {
    const r = runSection("section-edit", sectionRequest("section-edit"), {
      headline: "Screening results",
      lines: ["Wetlands are mapped in the study area."],
      tables: [{ key: "resolutions", caption: null, columnOrder: ["resourceType", "sources", "reliedOn", "reason", "recordedBy"] }],
    });
    expect(failedCheck(r)).toBe("K9");
  });

  it("R7: a section change belongs to a research phase, never the profile", () => {
    const r = runSection("section-edit", sectionRequest("section-edit"), {
      headline: "Screening results",
      lines: ["Wetlands are mapped in the study area."],
    }, "profile");
    expect(failedCheck(r)).toBe("K9");
  });

  it("R7: K1 rejects a section change with an extra key", () => {
    const r = runSection("section-edit", sectionRequest("section-edit"), {
      headline: "Screening results",
      lines: ["Wetlands are mapped in the study area."],
      recommendation: "approve",
    });
    expect(failedCheck(r)).toBe("K1");
  });
});

describe("normalizeForQuote", () => {
  it("folds whitespace, line-break hyphenation, and curly quotes but not words or case", () => {
    expect(normalizeForQuote("a  buf-\nfer’s\n width")).toBe("a buffer's width");
    expect(normalizeForQuote("Shall")).not.toBe(normalizeForQuote("shall"));
  });
});
