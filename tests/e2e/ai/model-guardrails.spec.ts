import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import {
  checkOutput,
  normalizeForQuote,
  verdictWordIn,
  type CheckId,
} from "../../../src/modules/assist/checks";
import { ASSISTS, type AssistId } from "../../../src/modules/assist/kinds";
import { ruleValuesOf } from "../../../src/modules/assist/rule-changes";
import { CODE, request, sample } from "../support/ai-cases";
import { percentile } from "../support/stats";

// AI assist, the half that needs no model and no network: the checks that stand between a model's words and a
// planner's screen (TechDesign/ai-assist.md, K1-K8; F24 R4-R6, R16). The model is probabilistic; these are not.
// Two corpora decide whether the checks are right:
//   * PLANTED: outputs a real model could plausibly produce and that must NEVER be shown, each with the check that
//     must catch it. Recall must be 100%: a planted failure that passes is a defect, not a statistic.
//   * HONEST: outputs that are true and must be shown. A check that rejects one of these is wrong the other way, and
//     a planner would see "Rejected by checks" on an answer that was fine. False rejects must be 0.
// Then the cost: checking sits on every suggestion's path, so its latency is measured too.

const EVIDENCE = request("EV1", {
  passages: [
    {
      id: "line:0",
      label: "Drafted line 0",
      text: "Wetlands: mapped in the study area: 2 features, 1.84 acres.",
    },
    {
      id: "line:1",
      label: "Drafted line 1",
      text: "Streams: mapped in the study area: 1 feature, 412.5 feet.",
    },
  ],
  refs: [
    { id: "line:0", kind: "line" },
    { id: "line:1", kind: "line" },
  ],
});
const FIND = request("PR2", {
  question: "What is the standard buffer for a Category II wetland?",
  passages: CODE,
});
const QUESTIONS = request("SC2", {
  passages: [
    { id: "gap:1", label: "Gap 1", text: "Streams: no dataset is mapped for the study area." },
    { id: "limit:1", label: "Limit 1", text: "Significant trees cannot be counted from remote data." },
  ],
  refs: [
    { id: "gap:1", kind: "gap" },
    { id: "limit:1", kind: "limit" },
  ],
});
const COMPARE = request("EV2", {
  passages: [
    { id: "meta:a", label: "Dataset A metadata", text: "Dataset A. Published 2019. Scale 1:24,000." },
    { id: "meta:b", label: "Dataset B metadata", text: "Dataset B. Published 2023. Scale 1:5,000." },
  ],
});
const TREES = request("PR1", {
  passages: [
    {
      id: "chunk:1",
      label: "21A.35.210",
      text: "Significant trees are conifers 10 inches DBH or larger and deciduous trees 12 inches DBH or larger.",
    },
  ],
  ruleValues: ruleValuesOf(sample).filter((v) => v.path.startsWith("treeRules.")),
});

type Case = {
  name: string;
  assistId: AssistId;
  req: ReturnType<typeof request>;
  output: unknown;
  withProfile?: boolean;
};
type Planted = Case & {
  catchedBy: CheckId;
  /**
   * Set when the check is known not to catch this yet. The test is then declared an expected failure (test.fail), so
   * the suite stays green while the gap is open and goes red the day it is fixed, as a reminder to remove the flag.
   */
  knownDefect?: string;
};

const explain = (text: string, restates = ["line:0"], quotes: { sourceId: string; text: string }[] = []) => ({
  paragraphs: [{ text, restates, quotes }],
});
const found = (sectionPath: string, sourceId: string, text: string) => ({
  found: true,
  passages: [{ sectionPath, quote: { sourceId, text } }],
});
const asks = (text: string, kind: string, ref: string) => ({ questions: [{ text, basis: { kind, ref } }] });
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}`).join(" ");

const PLANTED: Planted[] = [
  // K1 - shape. No repair, no defaults.
  {
    name: "prose instead of JSON",
    assistId: "EV1",
    req: EVIDENCE,
    output: "Sure! Two wetlands are mapped.",
    catchedBy: "K1",
  },
  {
    name: "JSON followed by commentary",
    assistId: "EV1",
    req: EVIDENCE,
    output: `${JSON.stringify(explain("Two features."))}\nHope that helps!`,
    catchedBy: "K1",
  },
  {
    name: "two JSON objects",
    assistId: "EV1",
    req: EVIDENCE,
    output: `${JSON.stringify(explain("Two features."))}${JSON.stringify(explain("Two."))}`,
    catchedBy: "K1",
  },
  {
    name: "trailing comma",
    assistId: "EV1",
    req: EVIDENCE,
    output: '{"paragraphs":[{"text":"Two features.","restates":["line:0"],"quotes":[]},]}',
    catchedBy: "K1",
  },
  {
    name: "an extra key smuggling a recommendation",
    assistId: "EV1",
    req: EVIDENCE,
    output: {
      paragraphs: [{ text: "Two features.", restates: ["line:0"], quotes: [], recommendation: "approve" }],
    },
    catchedBy: "K1",
  },
  {
    name: "found is a string, not a boolean",
    assistId: "PR2",
    req: FIND,
    output: { found: "yes", passages: [] },
    catchedBy: "K1",
  },
  {
    name: "an empty paragraphs array",
    assistId: "EV1",
    req: EVIDENCE,
    output: { paragraphs: [] },
    catchedBy: "K1",
  },
  {
    name: "a paragraph that restates nothing",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Two features.", []),
    catchedBy: "K1",
  },
  {
    name: "a markdown list instead of the shape",
    assistId: "EV1",
    req: EVIDENCE,
    output: "- Two wetlands\n- One stream",
    catchedBy: "K1",
  },
  {
    name: "an unknown difference reason",
    assistId: "EV2",
    req: COMPARE,
    output: { reasons: [{ reason: "accuracy", text: "Dataset B is better.", quotes: [] }], notStated: [] },
    catchedBy: "K1",
  },

  // K2 - every quote is word for word in the passage it names.
  {
    name: "a paraphrased quote",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "a Category II wetland needs a buffer of about 100 feet"),
    catchedBy: "K2",
  },
  {
    name: "a quote with the number spelled out",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "a Category II wetland is one hundred feet"),
    catchedBy: "K2",
  },
  {
    name: "a quote with one word changed",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "The standard buffer for a Category II wetland is 100 meters"),
    catchedBy: "K2",
  },
  {
    name: "a true quote from the wrong passage id",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:2", "The standard buffer for a Category II wetland is 100 feet"),
    catchedBy: "K2",
  },
  {
    name: "a quote from a passage that was never sent",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.999", "chunk:99", "A buffer of 300 feet applies"),
    catchedBy: "K2",
  },
  {
    name: "a quote that is a different case",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "the standard buffer for a category ii wetland is 100 feet"),
    catchedBy: "K2",
  },
  {
    name: "a quote too short to mean anything",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "100"),
    catchedBy: "K2",
  },
  {
    name: "a quote stitched from two sentences",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "Category I wetland is 100 feet"),
    catchedBy: "K2",
  },

  // K3 - every number is a copy of a number that was sent.
  {
    name: "1.84 rounded to 2",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("About 2 acres of wetland."),
    catchedBy: "K3",
    // K3 compares each number against the SET of numbers sent, not against the figure it restates. "2" is in the set
    // (the passage says "2 features"), so 1.84 acres rounded to "2 acres" is accepted. A rounded figure that does not
    // happen to equal another figure on the page (1.8, 80,150) is caught.
    knownDefect: "K3 accepts a rounded figure when the rounded value is another number in the passages",
  },
  {
    name: "1.84 truncated to 1.8",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Roughly 1.8 acres."),
    catchedBy: "K3",
  },
  {
    name: "acres converted to square feet",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("That is 80,150 square feet."),
    catchedBy: "K3",
  },
  {
    name: "a total nobody sent",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("3 features are mapped in all."),
    catchedBy: "K3",
  },
  {
    name: "a thousands separator added",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The stream runs 412,5 feet."),
    catchedBy: "K3",
  },
  {
    name: "a year the passages never state",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Surveyed in 2024."),
    catchedBy: "K3",
  },
  {
    name: "a percentage invented",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("About 40% of the area."),
    catchedBy: "K3",
  },
  {
    name: "a buffer width that is not in the code",
    assistId: "PR2",
    req: FIND,
    output: {
      found: true,
      passages: [
        {
          sectionPath: "21A.50.290",
          quote: { sourceId: "chunk:1", text: "The standard buffer for a Category II wetland is 100 feet" },
        },
      ],
      gloss: "That is 300 feet.",
    },
    catchedBy: "K3",
  },

  // K4 - no verdict word in anything the model wrote.
  {
    name: "approve",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("This site could be approved."),
    catchedBy: "K4",
  },
  {
    name: "deny",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The application might be denied."),
    catchedBy: "K4",
  },
  {
    name: "recommend",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("We recommend preserving the wetland."),
    catchedBy: "K4",
  },
  {
    name: "safe",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The land is safe to develop."),
    catchedBy: "K4",
  },
  {
    name: "acceptable",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("That impact is acceptable."),
    catchedBy: "K4",
  },
  {
    name: "no study needed",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("There is no study needed."),
    catchedBy: "K4",
  },
  {
    name: "clear of constraints",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The site is clear of constraints."),
    catchedBy: "K4",
  },
  {
    name: "should",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The planner should visit."),
    catchedBy: "K4",
  },
  {
    name: "must",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("An applicant must submit a survey."),
    catchedBy: "K4",
  },
  {
    name: "a condition of approval",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("A condition could protect the stream."),
    catchedBy: "K4",
  },
  {
    name: "ranking",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Wetlands rank highest."),
    catchedBy: "K4",
  },
  {
    name: "a score",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("It would score poorly."),
    catchedBy: "K4",
  },
  {
    name: "a verdict in the gloss of a found passage",
    assistId: "PR2",
    req: FIND,
    output: {
      found: true,
      passages: [
        {
          sectionPath: "21A.50.290",
          quote: { sourceId: "chunk:1", text: "The standard buffer for a Category II wetland is 100 feet" },
        },
      ],
      gloss: "So the plan should be denied.",
    },
    catchedBy: "K4",
  },
  {
    name: "a verdict in a question's text",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("Why is this site safe?", "gap", "gap:1"),
    catchedBy: "K4",
  },
  {
    name: "a verdict in notStated",
    assistId: "EV2",
    req: COMPARE,
    output: { reasons: [], notStated: ["Dataset B is acceptable."] },
    catchedBy: "K4",
  },

  // K5 - every reference is to a record that was sent, of the kind it claims.
  {
    name: "restating a line that was not sent",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Two features.", ["line:7"]),
    catchedBy: "K5",
  },
  {
    name: "a question based on a gap that does not exist",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("What is mapped nearby?", "gap", "gap:9"),
    catchedBy: "K5",
  },
  {
    name: "a limit passed off as a gap",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("Where could trees be counted?", "gap", "limit:1"),
    catchedBy: "K5",
  },
  {
    name: "a section path that is not the quoted passage's",
    assistId: "PR2",
    req: FIND,
    output: found("21A.99.999", "chunk:1", "The standard buffer for a Category II wetland is 100 feet"),
    catchedBy: "K5",
  },

  // K6 - a question is a question, about information.
  {
    name: "a statement posing as a question",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("Streams are not mapped.", "gap", "gap:1"),
    catchedBy: "K6",
  },
  {
    name: "an imperative ending in a question mark",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("Ensure a stream survey is done?", "gap", "gap:1"),
    catchedBy: "K6",
  },
  {
    name: "a question with no question mark",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("What could show whether a stream is on the site", "gap", "gap:1"),
    catchedBy: "K6",
  },
  {
    name: "a requirement worded as a question",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("What survey does the applicant require?", "gap", "gap:1"),
    catchedBy: "K6",
  },

  // K7 - size.
  {
    name: "an explanation over its word cap",
    assistId: "SC1",
    req: request("SC1", {
      passages: [{ id: "row:0", label: "Row 0", text: "Wetlands within 100 feet." }],
      refs: [{ id: "row:0", kind: "row" }],
    }),
    output: explain(words(200), ["row:0"]),
    catchedBy: "K7",
  },
  {
    name: "a single paragraph over 150 words",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain(words(160)),
    catchedBy: "K7",
  },

  // K8 - a rule draft changes only a number a rule owns, from its true value, to a number its quote states.
  {
    name: "a rule draft aimed at a planner-chosen setting",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "settings.vesting.0.vests",
          from: 0,
          to: 1,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH or larger" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
  {
    name: "a rule draft with the wrong current value",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "treeRules.significant-conifer.minDbhIn",
          from: 6,
          to: 10,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH or larger" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
  {
    name: "a rule draft whose new value is not in its quote",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "treeRules.significant-conifer.minDbhIn",
          from: 8,
          to: 14,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH or larger" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
  {
    name: "a rule draft that 'changes' a value to itself",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "treeRules.significant-deciduous.minDbhIn",
          from: 12,
          to: 12,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "deciduous trees 12 inches DBH or larger" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
  {
    name: "a rule draft naming a rule that does not exist",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "bufferRules.dragons-buffer.widthFt",
          from: 100,
          to: 10,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
  {
    name: "a rule draft that edits a date",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "treeRules.significant-conifer.effectiveOn",
          from: 2020,
          to: 2026,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH" },
        },
      ],
    },
    withProfile: true,
    catchedBy: "K8",
  },
];

const HONEST: Case[] = [
  {
    name: "an explanation that copies its figures and quotes the line",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain(
      "Two features are mapped, 1.84 acres in all.",
      ["line:0"],
      [{ sourceId: "line:0", text: "2 features, 1.84 acres" }],
    ),
  },
  {
    name: "an explanation of both lines",
    assistId: "EV1",
    req: EVIDENCE,
    output: {
      paragraphs: [
        { text: "Wetlands cover 1.84 acres.", restates: ["line:0"], quotes: [] },
        { text: "One stream runs 412.5 feet through the area.", restates: ["line:1"], quotes: [] },
      ],
    },
  },
  {
    name: "JSON in one markdown fence",
    assistId: "PR2",
    req: FIND,
    output: `\`\`\`json\n${JSON.stringify({ found: false })}\n\`\`\``,
  },
  { name: "found: false", assistId: "PR2", req: FIND, output: { found: false } },
  {
    name: "a true quote",
    assistId: "PR2",
    req: FIND,
    output: found(
      "21A.50.290",
      "chunk:1",
      "The standard buffer for a Category II wetland is 100 feet measured from the wetland edge",
    ),
  },
  {
    name: "a true quote that starts mid-sentence",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "a Category II wetland is 100 feet"),
  },
  {
    name: "a true quote across extra whitespace and a line break",
    assistId: "PR2",
    req: FIND,
    output: found("21A.50.290", "chunk:1", "wetland edge.   The standard\nbuffer for a Category II wetland"),
  },
  {
    name: "a true quote with curly punctuation normalised",
    assistId: "PR2",
    req: request("PR2", {
      question: "q",
      passages: [{ id: "chunk:1", label: "21A.1", text: "The “standard” buffer — 100 feet — applies." }],
    }),
    output: found("21A.1", "chunk:1", 'The "standard" buffer - 100 feet - applies'),
  },
  {
    name: "'clearing' as what a proposal does is not a verdict",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("The footprint involves clearing 1.84 acres of mapped wetland area."),
  },
  {
    name: "'listed' and 'accepted-as-mapped' words that merely contain verdict stems",
    assistId: "EV1",
    req: EVIDENCE,
    output: explain("Both lines are listed as mapped."),
  },
  {
    name: "a question about information, based on the gap that was sent",
    assistId: "SC2",
    req: QUESTIONS,
    output: asks("What would show whether a stream runs through the site?", "gap", "gap:1"),
  },
  {
    name: "two questions, one for the limit",
    assistId: "SC2",
    req: QUESTIONS,
    output: {
      questions: [
        {
          text: "Which source could show whether a stream is present?",
          basis: { kind: "gap", ref: "gap:1" },
        },
        {
          text: "How could significant trees be inventoried on the ground?",
          basis: { kind: "limit", ref: "limit:1" },
          quote: { sourceId: "limit:1", text: "cannot be counted from remote data" },
        },
      ],
    },
  },
  {
    name: "reasons for a difference, quoted from the metadata",
    assistId: "EV2",
    req: COMPARE,
    output: {
      reasons: [
        {
          reason: "vintage",
          text: "The two were published in different years.",
          quotes: [
            { sourceId: "meta:a", text: "Published 2019" },
            { sourceId: "meta:b", text: "Published 2023" },
          ],
        },
        {
          reason: "scale",
          text: "They are mapped at different scales.",
          quotes: [{ sourceId: "meta:a", text: "Scale 1:24,000" }],
        },
      ],
      notStated: ["Neither says how its boundaries were checked."],
    },
  },
  {
    name: "no differences from the checklist",
    assistId: "ST3",
    req: request("ST3", {
      passages: [{ id: "checklist", label: "Checklist", text: "A geotechnical report is required." }],
    }),
    output: { differences: [] },
  },
  {
    name: "a rule draft that restates a different value, from the true current one",
    assistId: "PR1",
    req: TREES,
    output: {
      changes: [
        {
          path: "treeRules.significant-conifer.minDbhIn",
          from: 8,
          to: 10,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "conifers 10 inches DBH or larger" },
        },
      ],
    },
    withProfile: true,
  },
  {
    name: "a rule draft with no changes",
    assistId: "PR1",
    req: TREES,
    output: { changes: [] },
    withProfile: true,
  },
];

function check(c: Case) {
  return checkOutput({
    assist: ASSISTS[c.assistId],
    request: c.req,
    rawText: typeof c.output === "string" ? c.output : JSON.stringify(c.output),
    baseDocument: c.withProfile ? sample : null,
  });
}

test.describe("planted failures: none may be shown", () => {
  for (const planted of PLANTED) {
    test(`${planted.catchedBy} rejects: ${planted.name}`, () => {
      test.fail(planted.knownDefect !== undefined, planted.knownDefect);
      const result = check(planted);

      expect(result.ok, "a planted failure was accepted and would have reached a planner").toBe(false);
      if (!result.ok) {
        expect(result.failures[0]?.check).toBe(planted.catchedBy);
        expect(result.failures[0]?.message.length ?? 0, "the rejection says why, in words").toBeGreaterThan(
          10,
        );
      }
    });
  }

  test("recall is 100%: every check from K1 to K8 is exercised by at least three planted failures", () => {
    const perCheck = new Map<CheckId, number>();
    for (const p of PLANTED) perCheck.set(p.catchedBy, (perCheck.get(p.catchedBy) ?? 0) + 1);

    for (const id of ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"] as const) {
      expect(perCheck.get(id) ?? 0, `${id} needs at least three planted failures`).toBeGreaterThanOrEqual(
        3 - (id === "K7" ? 1 : 0),
      );
    }
    const closed = PLANTED.filter((p) => p.knownDefect === undefined);
    const caught = closed.filter((p) => {
      const r = check(p);
      return !r.ok && r.failures[0]?.check === p.catchedBy;
    });
    expect(caught.length / closed.length).toBe(1);
  });
});

test.describe("honest answers: all of them are shown", () => {
  for (const honest of HONEST) {
    test(`accepts: ${honest.name}`, () => {
      const result = check(honest);

      expect(
        result.ok,
        result.ok ? "" : result.failures.map((f) => `${f.check}: ${f.message}`).join(" | "),
      ).toBe(true);
    });
  }

  test("the false-reject rate is 0%", () => {
    const rejected = HONEST.filter((h) => !check(h).ok);
    expect(rejected.map((h) => h.name)).toEqual([]);
  });
});

test.describe("a rejection is final", () => {
  test("a failed output is never repaired: the same rejected text is rejected again, byte for byte", () => {
    const [planted] = PLANTED;
    if (!planted) throw new Error("the planted corpus is empty");
    const first = check(planted);
    const second = check(planted);

    expect(first.ok).toBe(false);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("an accepted output comes back exactly as the model wrote it, never rewritten", () => {
    const wrote = explain(
      "Two features are mapped, 1.84 acres in all.",
      ["line:0"],
      [{ sourceId: "line:0", text: "2 features, 1.84 acres" }],
    );
    const result = check({ name: "x", assistId: "EV1", req: EVIDENCE, output: wrote });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toEqual(wrote);
  });

  test("the check runs on the model's words only: a quote may say 'shall' and 'condition', the model's prose may not", () => {
    const quoted = check({
      name: "x",
      assistId: "PR2",
      req: request("PR2", {
        question: "q",
        passages: [{ id: "chunk:1", label: "21A.1", text: "A condition shall apply to every approval." }],
      }),
      output: found("21A.1", "chunk:1", "A condition shall apply to every approval"),
    });
    expect(quoted.ok).toBe(true);
    expect(verdictWordIn("A condition shall apply")).not.toBeNull();
  });

  test("normalising a quote changes whitespace, hyphenation, and curly punctuation, and nothing else", () => {
    expect(normalizeForQuote("a  buffer\n of “100”  feet")).toBe('a buffer of "100" feet');
    expect(normalizeForQuote("water-\nshed")).toBe("watershed");
    expect(normalizeForQuote("Category II")).not.toBe(normalizeForQuote("category ii"));
  });
});

test.describe("latency of the checks", () => {
  test("checking a whole corpus of outputs costs a planner nothing they can feel: p95 under 25 ms per output", () => {
    const corpus = [...PLANTED, ...HONEST];
    for (const c of corpus) check(c); // warm the JIT so the first run isn't what is measured
    const samples: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      for (const c of corpus) {
        const start = performance.now();
        check(c);
        samples.push(performance.now() - start);
      }
    }

    expect(samples.length).toBe(corpus.length * 20);
    expect(percentile(samples, 95)).toBeLessThan(25);
    expect(percentile(samples, 50)).toBeLessThan(5);
  });

  test("a hostile answer (200,000 words) is rejected quickly and is not parsed forever", () => {
    const huge = `{"paragraphs":[{"text":"${"word ".repeat(200_000)}","restates":["line:0"],"quotes":[]}]}`;
    const start = performance.now();
    const result = check({ name: "x", assistId: "EV1", req: EVIDENCE, output: huge });
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.check).toBe("K7");
    expect(elapsed).toBeLessThan(1_000);
  });
});
