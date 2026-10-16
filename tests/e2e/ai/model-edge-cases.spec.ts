import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import {
  checkOutput,
  normalizeForQuote,
  verdictWordIn,
  type CheckId,
} from "../../../src/modules/assist/checks";
import { ASSISTS, ASSIST_IDS, type AssistId } from "../../../src/modules/assist/kinds";
import { digitRuns } from "../../../src/modules/assist/request";
import { ruleValuesOf } from "../../../src/modules/assist/rule-changes";
import { CODE, request, sample } from "../support/ai-cases";
import { EVIDENCE, explain, found } from "../support/ai-corpus";

// The edges of the checks that stand between a model and a planner (TechDesign/ai-assist.md, K1-K8). The guardrails
// spec proves the checks catch what a model plausibly gets wrong; this one maps WHERE each check's line is: which
// spellings of a word it catches, which formats of a number it treats as the same number, how a quote may differ from
// its passage and still be a quote, and exactly where a size limit starts. Every case here is a decision someone could
// have made the other way, so each is pinned: a change to a check that moves a line fails a named test.
//
// A few lines are in the wrong place. Those are listed as GAPS and run as expected failures (test.fail): the suite
// stays green while a gap is open, and goes red the day it is closed, which is the reminder to move the case up.

const run = (assistId: AssistId, req: ReturnType<typeof request>, output: unknown, withProfile = false) =>
  checkOutput({
    assist: ASSISTS[assistId],
    request: req,
    rawText: typeof output === "string" ? output : JSON.stringify(output),
    baseDocument: withProfile ? sample : null,
  });
const first = (r: ReturnType<typeof run>): CheckId | "accepted" =>
  r.ok ? "accepted" : (r.failures[0]?.check ?? "accepted");

// --- every assist, every shape -------------------------------------------------------------------------------------

const SHAPES = {
  explain: { paragraphs: [{ text: "Two features.", restates: ["x"], quotes: [] }] },
  questions: { questions: [{ text: "What is mapped?", basis: { kind: "gap", ref: "x" } }] },
  "found-true": { found: true, passages: [{ sectionPath: "x", quote: { sourceId: "x", text: "xxxx" } }] },
  "found-false": { found: false },
  reasons: { reasons: [], notStated: [] },
  differences: { differences: [] },
  fields: { fields: [] },
  changes: { changes: [] },
} as const;
type Shape = keyof typeof SHAPES;

const ACCEPTS: Record<AssistId, Shape[]> = {
  PR1: ["changes"],
  PR2: ["found-true", "found-false"],
  EV1: ["explain"],
  EV2: ["reasons"],
  EV3: ["fields"],
  SC1: ["explain"],
  SC2: ["questions"],
  SC3: ["found-true", "found-false"],
  ST1: ["found-true", "found-false"],
  ST2: ["questions"],
  ST3: ["differences"],
  IM1: ["explain"],
  IM2: ["questions"],
  IM3: ["found-true", "found-false"],
};

const LINES = request("IM1", {
  passages: [{ id: "line:0", label: "Drafted line 0", text: "Wetlands: 2 features, 1.84 acres." }],
  refs: [{ id: "line:0", kind: "line" }],
});
const GAPS = request("SC2", {
  passages: [{ id: "gap:1", label: "Gap 1", text: "Streams: no dataset." }],
  refs: [{ id: "gap:1", kind: "gap" }],
});

/** A minimal request and a minimal honest answer for each assist: proof that every one of the 14 can be answered. */
const OWN: Record<AssistId, { req: ReturnType<typeof request>; ok: unknown; withProfile?: boolean }> = {
  PR1: {
    req: request("PR1", {
      passages: [{ id: "chunk:1", label: "21A.1", text: "Nothing differs." }],
      ruleValues: ruleValuesOf(sample),
    }),
    ok: { changes: [] },
    withProfile: true,
  },
  PR2: { req: request("PR2", { question: "q?", passages: CODE }), ok: { found: false } },
  EV1: {
    req: request("EV1", { passages: LINES.passages, refs: LINES.refs }),
    ok: explain("Two features, 1.84 acres."),
  },
  EV2: {
    req: request("EV2", {
      passages: [
        { id: "meta:a", label: "A", text: "Published 2019." },
        { id: "meta:b", label: "B", text: "Published 2023." },
      ],
    }),
    ok: { reasons: [], notStated: ["The metadata does not say."] },
  },
  EV3: {
    req: request("EV3", { passages: [{ id: "meta:1", label: "Metadata", text: "Wetlands." }] }),
    ok: { fields: [] },
  },
  SC1: {
    req: request("SC1", {
      passages: [{ id: "row:w", label: "The screening row", text: "Wetlands within 100 feet." }],
      refs: [{ id: "row:w", kind: "row" }],
    }),
    ok: explain("Wetlands lie within 100 feet.", ["row:w"]),
  },
  SC2: {
    req: GAPS,
    ok: {
      questions: [
        { text: "What could show whether a stream runs through?", basis: { kind: "gap", ref: "gap:1" } },
      ],
    },
  },
  SC3: { req: request("SC3", { question: "q?", passages: CODE }), ok: { found: false } },
  ST1: {
    req: request("ST1", { question: "geotechnical report", passages: CODE }),
    ok: found("21A.35.210", "chunk:5", "A geotechnical report and an arborist report"),
  },
  ST2: {
    req: request("ST2", {
      passages: [{ id: "flag:w", label: "Flag", text: "Wetland flagged." }],
      refs: [{ id: "flag:w", kind: "flag" }],
    }),
    ok: {
      questions: [{ text: "Which source shows a wetland nearby?", basis: { kind: "flag", ref: "flag:w" } }],
    },
  },
  ST3: {
    req: request("ST3", {
      passages: [{ id: "checklist", label: "Checklist", text: "A geotechnical report." }],
    }),
    ok: { differences: [] },
  },
  IM1: { req: LINES, ok: explain("Two features, 1.84 acres.") },
  IM2: {
    req: request("IM2", {
      passages: [{ id: "range:w", label: "The impact range", text: "Between 0.42 and 1.17 acres." }],
      refs: [{ id: "range:w", kind: "range" }],
    }),
    ok: {
      questions: [
        { text: "What rating decides the end of the range?", basis: { kind: "range", ref: "range:w" } },
      ],
    },
  },
  IM3: { req: request("IM3", { question: "q?", passages: CODE }), ok: { found: false } },
};

test.describe("every assist answers in its own shape, and only its own", () => {
  for (const id of ASSIST_IDS) {
    test(`${id} (${ASSISTS[id].kind}): its own minimal honest answer is accepted`, () => {
      const own = OWN[id];
      const result = run(id, own.req, own.ok, own.withProfile);
      expect(
        result.ok,
        result.ok ? "" : result.failures.map((f) => `${f.check} ${f.message}`).join(" | "),
      ).toBe(true);
    });

    for (const shape of Object.keys(SHAPES) as Shape[]) {
      if (ACCEPTS[id].includes(shape)) continue;
      test(`${id} (${ASSISTS[id].kind}) rejects a ${shape} answer as the wrong shape (K1)`, () => {
        expect(first(run(id, OWN[id].req, SHAPES[shape], id === "PR1"))).toBe("K1");
      });
    }
  }

  test("every assist has a positive word cap, a prompt version, and a task that says what it may not do", () => {
    for (const id of ASSIST_IDS) {
      const def = ASSISTS[id];
      expect(def.maxWords, id).toBeGreaterThan(0);
      expect(def.promptVersion, id).toBeGreaterThanOrEqual(1);
      expect(def.task.length, id).toBeGreaterThan(40);
    }
  });
});

// --- K4: where the verdict line is ---------------------------------------------------------------------------------

const VERDICT_CAUGHT = [
  "approve",
  "approves",
  "approved",
  "approval",
  "approving",
  "deny",
  "denies",
  "denied",
  "denial",
  "recommend",
  "recommends",
  "recommended",
  "recommendation",
  "recommending",
  "clear",
  "clears",
  "cleared",
  "clearance",
  "safe",
  "safely",
  "safety",
  "acceptable",
  "no study",
  "no studies",
  "not needed",
  "should",
  "must",
  "shall",
  "condition",
  "conditions",
  "rank",
  "ranks",
  "ranked",
  "ranking",
  "score",
  "scores",
  "scored",
  "scoring",
];
const VERDICT_ALLOWED = [
  "clearing",
  "clearly",
  "unclear",
  "clearcut",
  "conditional",
  "preconditions",
  "approximately",
  "approach",
  "mustard",
  "shallow",
  "scorecard",
  "ranger",
  "range",
  "arrange",
  "dent",
  "saferoom",
  "safeguard",
  "restore",
  "scoreboard",
  "dense",
];

test.describe("K4: the verdict words, by spelling", () => {
  for (const word of VERDICT_CAUGHT) {
    for (const [label, text] of [
      ["lower case", `It is ${word} here.`],
      ["upper case", `IT IS ${word.toUpperCase()} HERE.`],
      ["at the start", `${word[0]?.toUpperCase()}${word.slice(1)} is the word.`],
      ["before punctuation", `The word is "${word}", plainly.`],
    ] as const) {
      test(`"${word}" is caught ${label}`, () => {
        expect(verdictWordIn(text)).not.toBeNull();
      });
    }
  }

  for (const word of VERDICT_ALLOWED) {
    test(`"${word}" is not a verdict word`, () => {
      expect(verdictWordIn(`The ${word} was mapped.`)).toBeNull();
    });
  }

  test("a verdict word inside a quote is the city's, not the model's: allowed", () => {
    const req = request("PR2", {
      question: "q?",
      passages: [{ id: "chunk:1", label: "21A.1", text: "A condition shall be approved by the Director." }],
    });
    expect(
      first(run("PR2", req, found("21A.1", "chunk:1", "A condition shall be approved by the Director"))),
    ).toBe("accepted");
  });

  test("the same word in the model's own gloss is rejected", () => {
    const req = request("PR2", {
      question: "q?",
      passages: [{ id: "chunk:1", label: "21A.1", text: "A buffer applies." }],
    });
    const answer = {
      found: true,
      passages: [{ sectionPath: "21A.1", quote: { sourceId: "chunk:1", text: "A buffer applies" } }],
      gloss: "It shall apply.",
    };
    expect(first(run("PR2", req, answer))).toBe("K4");
  });

  test("a verdict word is caught in every place the model writes prose: text, gloss, value, notStated", () => {
    const meta = request("EV3", {
      passages: [{ id: "meta:1", label: "Metadata", text: "Wetlands under 1 acre are not shown." }],
    });
    const field = {
      fields: [
        {
          key: "limitation",
          value: "This is safe to rely on.",
          quote: { sourceId: "meta:1", text: "Wetlands under 1 acre are not shown" },
        },
      ],
    };
    expect(first(run("EV3", meta, field))).toBe("K4");

    const cmp = request("EV2", { passages: [{ id: "meta:a", label: "A", text: "Published 2019." }] });
    expect(first(run("EV2", cmp, { reasons: [], notStated: ["Whether it is acceptable."] }))).toBe("K4");
    expect(
      first(
        run("EV2", cmp, {
          reasons: [
            { reason: "vintage", text: "Newer data is the better choice and should win.", quotes: [] },
          ],
          notStated: [],
        }),
      ),
    ).toBe("K4");
  });

  test("fields the model chooses from a fixed list are not scanned for words: enums and section paths", () => {
    const req = request("SC2", { passages: GAPS.passages, refs: GAPS.refs });
    const answer = {
      questions: [
        { text: "What could show whether a stream runs through?", basis: { kind: "gap", ref: "gap:1" } },
      ],
    };
    expect(first(run("SC2", req, answer))).toBe("accepted");
  });
});

// Words that carry the same verdict and are not on the list. The denylist matches whole words in a fixed set of
// spellings, so an inflection or a synonym is a way past it. Each is a verdict the charter forbids ("never
// recommends, approves, denies, or clears"), so each should be caught, and today none is.
const VERDICT_GAPS = [
  ["denying", "an inflection of 'deny' that the pattern does not list"],
  ["unsafe", "'safe' only matches as a whole word, so its opposite slips through"],
  ["disapprove", "'approve' only matches as a whole word"],
  ["disapproved", "'approved' only matches as a whole word"],
  ["rejected", "a synonym of 'denied'"],
  ["reject", "a synonym of 'deny'"],
  ["grant", "a synonym of 'approve'"],
  ["granted", "a synonym of 'approved'"],
  ["advisable", "a recommendation in other words"],
  ["advise", "a recommendation in other words"],
  ["ought to", "a recommendation in other words"],
  ["needs to", "a requirement in other words"],
  ["have to", "a requirement in other words"],
  ["go ahead", "an approval in other words"],
  ["proceed", "an approval in other words"],
  ["preferable", "a recommendation in other words"],
  ["best option", "a ranking in other words"],
  ["no concern", "a clearance in other words"],
  ["nothing to worry about", "a clearance in other words"],
  ["free of constraints", "a clearance in other words"],
  ["suitable for development", "a verdict in other words"],
] as const;

test.describe("K4: verdicts the denylist does not know (expected failures)", () => {
  for (const [word, why] of VERDICT_GAPS) {
    test(`should catch "${word}"`, () => {
      test.fail(true, why);
      expect(verdictWordIn(`The site is ${word}.`)).not.toBeNull();
    });
  }
});

// --- K3: which spellings of a number are the same number -----------------------------------------------------------

const NUMBER_OK = [
  "1.84 acres",
  "412.5 feet",
  "2 features and 1 feature",
  "1.84.",
  "(1.84)",
  "1.84, then 412.5",
  "line 0",
  "0 and 1",
  "between 1.84 and 412.5",
  "1.84-412.5",
  "1.84acres",
  "$1.84",
  "1.84;",
  "about 1.84/412.5",
  "“1.84”",
];
const NUMBER_REJECTED = [
  ["1.840", "a trailing zero is a different figure"],
  ["01.84", "a leading zero is a different figure"],
  ["1,84", "a comma for a decimal point"],
  ["184", "the decimal point dropped"],
  ["1.8", "truncated"],
  ["1.9", "rounded up"],
  ["2.0", "rounded and given a decimal"],
  ["3", "a total nobody sent"],
  ["412", "the decimal dropped"],
  ["412.50", "a trailing zero"],
  ["12.5", "the first digit dropped"],
  ["1.84e3", "scientific notation brings in a 3"],
  ["2024-10-20", "a date"],
  ["1,000", "a thousands figure"],
  ["50%", "a percentage"],
  ["line 7", "a line that was never sent"],
  ["1.84.5", "a version-like run is one run, and not a sent one"],
  ["1 000", "a space as a thousands separator makes two runs; 000 was not sent"],
] as const;

test.describe("K3: which numbers are copies", () => {
  for (const prose of NUMBER_OK) {
    test(`accepts "${prose}"`, () => {
      expect(first(run("EV1", EVIDENCE, explain(prose)))).toBe("accepted");
    });
  }
  for (const [prose, why] of NUMBER_REJECTED) {
    test(`rejects "${prose}" (${why})`, () => {
      expect(first(run("EV1", EVIDENCE, explain(prose)))).toBe("K3");
    });
  }

  test("every invented number is named in the rejection, not just the first", () => {
    const result = run("EV1", EVIDENCE, explain("It is 7 acres across 9 parcels."));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.map((f) => f.message).join(" ")).toMatch(/number 7[\s\S]*number 9/);
    }
  });

  test("a number in a question the planner typed is a number that was sent", () => {
    const req = request("PR2", { question: "What is the buffer for a 75 foot setback?", passages: CODE });
    const answer = {
      found: true,
      passages: [
        {
          sectionPath: "21A.50.300",
          quote: {
            sourceId: "chunk:2",
            text: "A buffer of 75 feet shall be maintained from a Type Ns stream",
          },
        },
      ],
      gloss: "The question's 75 appears.",
    };
    expect(first(run("PR2", req, answer))).toBe("accepted");
  });

  test("a number in a rule's path or current value is a number that was sent", () => {
    const [path] = ruleValuesOf(sample);
    expect(path).toBeDefined();
    expect(digitRuns(String(path?.value)).length).toBeGreaterThan(0);
  });

  test("digits in a quote are the city's own and are not held to K3", () => {
    const answer = explain(
      "Two features.",
      ["line:0"],
      [{ sourceId: "line:0", text: "2 features, 1.84 acres" }],
    );
    expect(first(run("EV1", EVIDENCE, answer))).toBe("accepted");
  });

  test("the passage's label counts: a label that says 'line 0' lets the model write 'line 0'", () => {
    expect(first(run("EV1", EVIDENCE, explain("As line 0 says, 1.84 acres.")))).toBe("accepted");
  });
});

const NUMBER_GAPS = [
  ["about two acres", "a number spelled as a word is not a digit run, so 1.84 acres rounded to 'two' passes"],
  ["roughly one point eight acres", "spelled-out decimals pass"],
  ["nearly half an acre", "fractions in words pass"],
  ["twice as many features", "a multiple in words passes"],
  ["１.９ acres", "full-width digits are not matched by \\d, so a changed figure in them passes"],
  ["٢ acres", "Arabic-Indic digits are not matched by \\d"],
] as const;

test.describe("K3: known gaps (expected failures)", () => {
  for (const [prose, why] of NUMBER_GAPS) {
    test(`should reject "${prose}"`, () => {
      test.fail(true, why);
      expect(first(run("EV1", EVIDENCE, explain(prose)))).toBe("K3");
    });
  }
});

// --- K2: how a quote may differ from its passage -------------------------------------------------------------------

const PASSAGE = "The standard buffer for a Category II wetland is 100 feet measured from the wetland edge.";
const quoteReq = (text: string) =>
  request("PR2", { question: "q?", passages: [{ id: "chunk:1", label: "21A.50.290", text }] });
const quoted = (text: string, passageText = PASSAGE) =>
  first(run("PR2", quoteReq(passageText), found("21A.50.290", "chunk:1", text)));

test.describe("K2: what counts as the same words", () => {
  const SAME: [string, string, string?][] = [
    ["the whole passage", PASSAGE],
    ["a piece from the middle", "a Category II wetland is 100 feet"],
    ["a quote with surrounding spaces", `   ${PASSAGE}   `],
    ["a doubled space", "standard  buffer for a  Category II"],
    ["a line break where the passage has a space", "standard buffer\nfor a Category II wetland"],
    ["a tab where the passage has a space", "standard\tbuffer for a Category II"],
    [
      "a passage with a line break and a quote without",
      "standard buffer for a Category II wetland",
      "The standard\nbuffer for a\nCategory II wetland is 100 feet",
    ],
    ["curly quotes against straight", 'The "standard" buffer', "The “standard” buffer applies."],
    ["straight quotes against curly", "The “standard” buffer", 'The "standard" buffer applies.'],
    ["curly apostrophe against straight", "The city's buffer", "The city’s buffer applies."],
    ["an en dash against a hyphen", "A 100-foot buffer", "A 100–foot buffer applies."],
    ["an em dash against a hyphen", "buffer - 100 feet", "The buffer — 100 feet — applies."],
    ["a ligature in the passage", "The fire buffer", "The ﬁre buffer applies."],
    ["a ligature in the quote", "The ﬁre buffer", "The fire buffer applies."],
    ["a non-breaking space in the passage", "100 feet from", "A buffer of 100 feet from the edge."],
    ["a non-breaking space in the quote", "100 feet from", "A buffer of 100 feet from the edge."],
    [
      "a word broken across lines with a hyphen",
      "the watershed boundary",
      "the water-\nshed boundary applies",
    ],
    ["a full-width digit in the passage (NFKC)", "100 feet", "A buffer of １００ feet applies."],
    ["exactly four characters", "feet", PASSAGE],
  ];
  for (const [name, text, passageText] of SAME) {
    test(`accepts ${name}`, () => {
      expect(quoted(text, passageText ?? PASSAGE)).toBe("accepted");
    });
  }

  const DIFFERENT: [string, string, string?][] = [
    ["a different case", "the standard buffer for a category ii wetland"],
    ["one word changed", "The standard buffer for a Category II wetland is 100 meters"],
    ["one word dropped from the middle", "The standard buffer a Category II wetland"],
    ["two words swapped", "The buffer standard for a Category II wetland"],
    ["a word added", "The standard protective buffer for a Category II wetland"],
    ["a word added at the end", "from the wetland edge today"],
    ["an ellipsis standing for a gap", "The standard buffer … wetland edge"],
    ["a bracketed ellipsis", "The standard buffer [...] wetland edge"],
    ["a zero-width space inside a word", "stand​ard buffer"],
    ["a soft hyphen inside a word", "stand­ard buffer"],
    ["the number changed", "is 150 feet measured"],
    ["a synonym", "The usual buffer for a Category II wetland"],
    ["the number spelled out", "is one hundred feet"],
    ["three characters", "100"],
    ["whitespace only", "      "],
    ["a fragment run together without its space", "standardbuffer"],
    ["a trailing period the passage lacks", "wetland edge.."],
  ];
  for (const [name, text, passageText] of DIFFERENT) {
    test(`rejects ${name}`, () => {
      expect(quoted(text, passageText ?? PASSAGE)).toBe("K2");
    });
  }

  test("a quote of the right words from the wrong passage is rejected", () => {
    const req = request("PR2", {
      question: "q?",
      passages: [
        { id: "chunk:1", label: "21A.1", text: "Alpha beta gamma delta." },
        { id: "chunk:2", label: "21A.2", text: "Epsilon zeta eta theta." },
      ],
    });
    expect(first(run("PR2", req, found("21A.1", "chunk:1", "Epsilon zeta eta")))).toBe("K2");
  });

  test("a quote that appears in two passages is accepted against the one it names", () => {
    const req = request("PR2", {
      question: "q?",
      passages: [
        { id: "chunk:1", label: "21A.1", text: "The buffer is 100 feet." },
        { id: "chunk:2", label: "21A.2", text: "The buffer is 100 feet." },
      ],
    });
    expect(first(run("PR2", req, found("21A.2", "chunk:2", "The buffer is 100 feet")))).toBe("accepted");
  });

  test("a source id differing in case or by a space is a passage that was not sent", () => {
    for (const id of ["Chunk:1", "chunk:1 ", " chunk:1", "chunk-1", "CHUNK:1"]) {
      expect(first(run("PR2", quoteReq(PASSAGE), found("21A.50.290", id, "standard buffer")))).toBe("K2");
    }
  });

  test("a rejected quote is named in the rejection with the passage it was said to come from", () => {
    const result = run(
      "PR2",
      quoteReq(PASSAGE),
      found("21A.50.290", "chunk:1", "an invented sentence about wetlands"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.message).toMatch(/invented sentence[\s\S]*21A\.50\.290/);
  });

  test("normalising is idempotent and never lengthens a quote", () => {
    for (const text of ["a  b", "ﬁre", "water-\nshed", "“x” — y", "plain"]) {
      const once = normalizeForQuote(text);
      expect(normalizeForQuote(once)).toBe(once);
      expect(once.length).toBeLessThanOrEqual(text.length + 1);
    }
  });
});

// --- K5: references and section paths ------------------------------------------------------------------------------

test.describe("K5: references and section paths", () => {
  const sectionOf = (path: string) =>
    first(run("PR2", quoteReq(PASSAGE), found(path, "chunk:1", "standard buffer")));

  test("the section path must be the passage's label exactly", () => {
    expect(sectionOf("21A.50.290")).toBe("accepted");
    for (const bad of [
      "21a.50.290",
      "21A.50.290 ",
      " 21A.50.290",
      "21A.50.29",
      "21A.50.2900",
      "Section 21A.50.290",
      "",
    ]) {
      expect(sectionOf(bad), JSON.stringify(bad)).not.toBe("accepted");
    }
  });

  test("a reference must be of the kind it claims, and a missing kind claim is not checked against the record's kind", () => {
    expect(
      first(
        run("SC2", GAPS, { questions: [{ text: "What is mapped?", basis: { kind: "gap", ref: "gap:1" } }] }),
      ),
    ).toBe("accepted");
    for (const kind of ["row", "limit", "flag", "range", "study", "rule", "line"]) {
      expect(
        first(run("SC2", GAPS, { questions: [{ text: "What is mapped?", basis: { kind, ref: "gap:1" } }] })),
        kind,
      ).toBe("K5");
    }
  });

  test("a reference to something that is not a kind at all is a shape failure", () => {
    expect(
      first(
        run("SC2", GAPS, {
          questions: [{ text: "What is mapped?", basis: { kind: "hunch", ref: "gap:1" } }],
        }),
      ),
    ).toBe("K1");
  });

  test("an explanation may restate several lines, and one unknown line among them rejects the whole answer", () => {
    const two = request("EV1", {
      passages: [
        { id: "line:0", label: "Drafted line 0", text: "A." },
        { id: "line:1", label: "Drafted line 1", text: "B." },
      ],
      refs: [
        { id: "line:0", kind: "line" },
        { id: "line:1", kind: "line" },
      ],
    });
    expect(first(run("EV1", two, explain("A and B.", ["line:0", "line:1"])))).toBe("accepted");
    expect(first(run("EV1", two, explain("A and B.", ["line:0", "line:2"])))).toBe("K5");
  });

  test("a passage that was sent as a passage but not as a reference cannot be restated", () => {
    const req = request("EV1", {
      passages: [{ id: "line:0", label: "Drafted line 0", text: "A." }],
      refs: [],
    });
    expect(first(run("EV1", req, explain("A.", ["line:0"])))).toBe("K5");
  });

  test("a quote's source id and a restated id are different things: quoting a ref-only id is K2", () => {
    const req = request("EV1", {
      passages: [{ id: "line:0", label: "Drafted line 0", text: "A fact." }],
      refs: [{ id: "line:0", kind: "line" }],
    });
    expect(
      first(run("EV1", req, explain("A fact.", ["line:0"], [{ sourceId: "line:9", text: "A fact" }]))),
    ).toBe("K2");
  });
});

// --- K6: what is a question ----------------------------------------------------------------------------------------

test.describe("K6: what is a question about information", () => {
  const asked = (text: string) =>
    first(run("SC2", GAPS, { questions: [{ text, basis: { kind: "gap", ref: "gap:1" } }] }));

  const INTERROGATIVES = [
    "What",
    "Which",
    "Who",
    "Whom",
    "Whose",
    "Where",
    "When",
    "Why",
    "How",
    "Is",
    "Are",
    "Was",
    "Were",
    "Does",
    "Do",
    "Did",
    "Can",
    "Could",
    "Would",
    "Will",
    "Has",
    "Have",
    "Had",
  ];
  for (const word of INTERROGATIVES) {
    test(`accepts a question that opens with "${word}" or "${word.toLowerCase()}"`, () => {
      expect(asked(`${word} a stream mapped here?`)).toBe("accepted");
      expect(asked(`${word.toLowerCase()} a stream mapped here?`)).toBe("accepted");
    });
  }

  test("accepts a curly opening quote, trailing spaces, a doubled question mark, and a second sentence", () => {
    expect(asked("“What is mapped?")).toBe("accepted");
    expect(asked("What is mapped?   ")).toBe("accepted");
    expect(asked("What is mapped??")).toBe("accepted");
    expect(asked("What is mapped? Where?")).toBe("accepted");
  });

  const REJECTED: [string, string][] = [
    ["a statement", "Streams are not mapped."],
    ["an imperative", "List the streams that are mapped?"],
    ["a request", "Please tell me what is mapped?"],
    ["an instruction", "Ensure a survey is done?"],
    ["no question mark", "What is mapped"],
    ["a question mark first", "?What is mapped"],
    ["a lone question mark", "?"],
    ["a question mark only in the middle", "What is mapped? Tell me"],
    ["'may', which is not on the list of openers", "May a stream be present?"],
    ["'might', which is not on the list of openers", "Might a stream be present?"],
    ["'if', which is not on the list of openers", "If a stream is present, where?"],
    ["a requirement word: required", "Is a survey required?"],
    ["a requirement word: requirement", "What is the requirement?"],
    ["a requirement word: require", "What does the code require?"],
    ["a requirement word: requires", "What survey requires attention?"],
    ["a requirement word: ensure, mid-sentence", "What would ensure a stream is found?"],
  ];
  for (const [name, text] of REJECTED) {
    test(`rejects ${name}`, () => {
      expect(asked(text)).toBe("K6");
    });
  }

  test("'should' in a question is a verdict word first (K4), because K4 runs before K6", () => {
    expect(asked("Should a stream be surveyed?")).toBe("K4");
  });

  test("one bad question among good ones rejects the whole answer", () => {
    const answer = {
      questions: [
        { text: "What is mapped?", basis: { kind: "gap", ref: "gap:1" } },
        { text: "Survey the stream.", basis: { kind: "gap", ref: "gap:1" } },
      ],
    };
    expect(first(run("SC2", GAPS, answer))).toBe("K6");
  });
});

// --- K7: where each size limit starts ------------------------------------------------------------------------------

const w = (n: number) =>
  Array.from({ length: n }, (_, i) => `w${String.fromCharCode(97 + (i % 26))}x`).join(" ");

type Sized = {
  id: AssistId;
  make: (n: number) => unknown;
  req: ReturnType<typeof request>;
  withProfile?: boolean;
};
const SIZED: Sized[] = [
  // Explanations: paragraphs of at most 100 words so the 150-word paragraph rule never decides.
  ...(["EV1", "IM1"] as const).map((id) => ({
    id,
    req: OWN[id].req,
    make: (n: number) => ({
      paragraphs: Array.from({ length: Math.ceil(n / 100) }, (_, i) => ({
        text: w(Math.min(100, n - i * 100)),
        restates: ["line:0"],
        quotes: [],
      })),
    }),
  })),
  {
    id: "SC1",
    req: OWN.SC1.req,
    make: (n) => ({ paragraphs: [{ text: w(n), restates: ["row:w"], quotes: [] }] }),
  },
  ...(["SC2", "ST2", "IM2"] as const).map((id) => ({
    id,
    req: OWN[id].req,
    make: (n: number) => ({
      questions: [
        {
          text: `What ${w(n - 1)}?`,
          basis: {
            kind: id === "SC2" ? "gap" : id === "ST2" ? "flag" : "range",
            ref: id === "SC2" ? "gap:1" : id === "ST2" ? "flag:w" : "range:w",
          },
        },
      ],
    }),
  })),
  ...(["PR2", "SC3", "ST1", "IM3"] as const).map((id) => ({
    id,
    req: OWN[id].req,
    make: (n: number) => ({
      found: true,
      passages: [
        { sectionPath: "21A.35.210", quote: { sourceId: "chunk:5", text: "A geotechnical report" } },
      ],
      gloss: w(n),
    }),
  })),
  {
    id: "EV2",
    req: OWN.EV2.req,
    make: (n) => ({ reasons: [{ reason: "vintage", text: w(n), quotes: [] }], notStated: [] }),
  },
  {
    id: "EV3",
    req: request("EV3", {
      passages: [{ id: "meta:1", label: "Metadata", text: "Wetlands under one acre are not shown." }],
    }),
    make: (n) => ({
      fields: [
        {
          key: "limitation",
          value: w(n),
          quote: { sourceId: "meta:1", text: "Wetlands under one acre are not shown" },
        },
      ],
    }),
  },
];

test.describe("K7: the word cap, on both sides of the line", () => {
  for (const s of SIZED) {
    const cap = ASSISTS[s.id].maxWords;
    // PR2/SC3/ST1/IM3 share CODE passages; their requests name chunk:5 only when the question's passage set has it.
    test(`${s.id}: ${cap} words are accepted`, () => {
      expect(first(run(s.id, s.req, s.make(cap), s.withProfile))).toBe("accepted");
    });
    test(`${s.id}: ${cap + 1} words are rejected (K7)`, () => {
      expect(first(run(s.id, s.req, s.make(cap + 1), s.withProfile))).toBe("K7");
    });
    test(`${s.id}: one word is accepted`, () => {
      expect(first(run(s.id, s.req, s.make(1), s.withProfile))).toBe("accepted");
    });
  }

  test("quotes do not count toward the cap", () => {
    const longQuote = Array.from({ length: 300 }, () => "feet").join(" ");
    const req = request("SC1", {
      passages: [{ id: "row:w", label: "The screening row", text: longQuote }],
      refs: [{ id: "row:w", kind: "row" }],
    });
    expect(
      first(
        run("SC1", req, {
          paragraphs: [
            { text: "It says feet.", restates: ["row:w"], quotes: [{ sourceId: "row:w", text: longQuote }] },
          ],
        }),
      ),
    ).toBe("accepted");
  });

  test("an explanation paragraph over 150 words is rejected even when the total is under the cap", () => {
    const answer = { paragraphs: [{ text: w(151), restates: ["line:0"], quotes: [] }] };
    expect(first(run("EV1", OWN.EV1.req, answer))).toBe("K7");
  });

  test("a difference's 'study' text is not counted, which leaves it unbounded (documented)", () => {
    const answer = {
      differences: [
        {
          study: w(5000),
          inEngine: true,
          inChecklist: false,
          quote: { sourceId: "checklist", text: "A geotechnical report" },
        },
      ],
    };
    expect(first(run("ST3", OWN.ST3.req, answer))).toBe("accepted");
  });
});

// --- K1: shape edge cases ------------------------------------------------------------------------------------------

test.describe("K1: what is JSON enough", () => {
  const ok = JSON.stringify({ found: false });
  const CASES: [string, string, CheckId | "accepted"][] = [
    ["plain JSON", ok, "accepted"],
    ["JSON with leading and trailing whitespace", `\n\n  ${ok}  \n`, "accepted"],
    ["a byte-order mark first", `\uFEFF${ok}`, "accepted"],
    ["a ```json fence", `\`\`\`json\n${ok}\n\`\`\``, "accepted"],
    ["a bare ``` fence", `\`\`\`\n${ok}\n\`\`\``, "accepted"],
    ["a fence with surrounding whitespace", `  \`\`\`json\n${ok}\n\`\`\`  `, "accepted"],
    ["pretty-printed JSON", JSON.stringify({ found: false }, null, 4), "accepted"],
    ["a fence with a sentence before it", `Here you go:\n\`\`\`json\n${ok}\n\`\`\``, "K1"],
    ["a fence with a sentence after it", `\`\`\`json\n${ok}\n\`\`\`\nHope that helps`, "K1"],
    ["a ```javascript fence", `\`\`\`javascript\n${ok}\n\`\`\``, "K1"],
    ["single quotes", "{'found': false}", "K1"],
    ["unquoted keys", "{found: false}", "K1"],
    ["a trailing comma", '{"found": false,}', "K1"],
    ["a comment", '{"found": false /* none */}', "K1"],
    ["a JSON string containing JSON", JSON.stringify(ok), "K1"],
    ["an array of the object", `[${ok}]`, "K1"],
    ["null", "null", "K1"],
    ["an empty string", "", "K1"],
    ["only whitespace", "   \n ", "K1"],
    [
      "output cut off by the token limit",
      '{"found": true, "passages": [{"sectionPath": "21A.50.290", "quote": {"sourceId": "chun',
      "K1",
    ],
    ["found:false with an extra key", '{"found": false, "why": "none"}', "K1"],
    ["found:true with no passages", '{"found": true, "passages": []}', "K1"],
    [
      "found:true with five passages (the limit is four)",
      JSON.stringify({
        found: true,
        passages: Array.from({ length: 5 }, () => ({
          sectionPath: "x",
          quote: { sourceId: "x", text: "xxxx" },
        })),
      }),
      "K1",
    ],
    ["NaN", '{"found": NaN}', "K1"],
    ["a duplicate key (the last wins, and it is valid)", '{"found": true, "found": false}', "accepted"],
  ];
  for (const [name, raw, expected] of CASES) {
    test(`${name}: ${expected}`, () => {
      expect(first(run("PR2", OWN.PR2.req, raw))).toBe(expected);
    });
  }

  test("a model that answers in prose when it has nothing to say is rejected, not read as 'found: false'", () => {
    expect(first(run("PR2", OWN.PR2.req, "I could not find anything about that."))).toBe("K1");
  });

  test("the rejection for a shape names the field and the reason, for a planner who has to read it", () => {
    const result = run("SC2", GAPS, { questions: [{ text: "What?", basis: { kind: "gap" } }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0]?.message).toMatch(/basis\.ref/);
  });

  test("a question may carry a null quote or none, but not a string", () => {
    const base = { text: "What is mapped?", basis: { kind: "gap", ref: "gap:1" } };
    expect(first(run("SC2", GAPS, { questions: [{ ...base, quote: null }] }))).toBe("accepted");
    expect(first(run("SC2", GAPS, { questions: [base] }))).toBe("accepted");
    expect(first(run("SC2", GAPS, { questions: [{ ...base, quote: "some words" }] }))).toBe("K1");
  });

  test("more than ten questions is a shape failure", () => {
    const q = { text: "What is mapped?", basis: { kind: "gap", ref: "gap:1" } };
    expect(first(run("SC2", GAPS, { questions: Array.from({ length: 10 }, () => q) }))).toBe("accepted");
    expect(first(run("SC2", GAPS, { questions: Array.from({ length: 11 }, () => q) }))).toBe("K1");
  });
});

// --- K8: rule drafts -----------------------------------------------------------------------------------------------

test.describe("K8: what a rule draft may change", () => {
  const values = ruleValuesOf(sample);
  const buffer = values.find((v) => v.path.startsWith("bufferRules."));
  const treesReq = (text: string) =>
    request("PR1", { passages: [{ id: "chunk:1", label: "21A.35.210", text }], ruleValues: values });
  const change = (path: string, from: number, to: number, quote: string) => ({
    path,
    from,
    to,
    sectionPath: "21A.35.210",
    quote: { sourceId: "chunk:1", text: quote },
  });
  const draft = (text: string, ...changes: ReturnType<typeof change>[]) =>
    first(run("PR1", treesReq(text), { changes }, true));
  const TREES =
    "Significant trees are conifers 10 inches DBH or larger and deciduous trees 14 inches DBH or larger.";
  const CONIFER = "treeRules.significant-conifer.minDbhIn";
  const DECIDUOUS = "treeRules.significant-deciduous.minDbhIn";

  test("accepts one change, two changes, and none", () => {
    expect(draft(TREES, change(CONIFER, 8, 10, "conifers 10 inches DBH or larger"))).toBe("accepted");
    expect(
      draft(
        TREES,
        change(CONIFER, 8, 10, "conifers 10 inches DBH or larger"),
        change(DECIDUOUS, 12, 14, "deciduous trees 14 inches DBH or larger"),
      ),
    ).toBe("accepted");
    expect(draft(TREES)).toBe("accepted");
  });

  test("accepts a buffer width stated with a thousands separator", () => {
    expect(buffer, "the sample profile has a buffer rule").toBeDefined();
    if (!buffer) return;
    const text = `A buffer of 1,200 feet applies.`;
    const answer = {
      changes: [
        {
          path: buffer.path,
          from: buffer.value,
          to: 1200,
          sectionPath: "21A.35.210",
          quote: { sourceId: "chunk:1", text: "A buffer of 1,200 feet" },
        },
      ],
    };
    expect(first(run("PR1", treesReq(text), answer, true))).toBe("accepted");
  });

  const REJECTED: [string, string, ReturnType<typeof change>[], CheckId][] = [
    [
      "a path in upper case",
      TREES,
      [change("treeRules.Significant-Conifer.minDbhIn", 8, 10, "conifers 10 inches DBH")],
      "K8",
    ],
    ["a path with an extra segment", TREES, [change(`${CONIFER}.x`, 8, 10, "conifers 10 inches DBH")], "K8"],
    [
      "a path in a collection that is not a rule's",
      TREES,
      [change("settings.vesting.0.vests", 0, 1, "conifers 10 inches DBH")],
      "K8",
    ],
    ["the profile's own metadata", TREES, [change("profile.name", 0, 10, "conifers 10 inches DBH")], "K8"],
    [
      "a rule's effective date",
      TREES,
      [change("treeRules.significant-conifer.effectiveOn", 2020, 2026, "conifers 10 inches DBH")],
      "K8",
    ],
    [
      "a rule's citation",
      TREES,
      [change("treeRules.significant-conifer.citation", 1, 10, "conifers 10 inches DBH")],
      "K8",
    ],
    [
      "a rule that does not exist",
      TREES,
      [change("treeRules.significant-oak.minDbhIn", 8, 10, "conifers 10 inches DBH")],
      "K8",
    ],
    [
      "a field the rule does not own (a tree rule's width)",
      TREES,
      [change("treeRules.significant-conifer.widthFt", 8, 10, "conifers 10 inches DBH")],
      "K8",
    ],
    ["a wrong current value", TREES, [change(CONIFER, 6, 10, "conifers 10 inches DBH")], "K8"],
    [
      "a current value taken from the new text",
      TREES,
      [change(CONIFER, 10, 14, "deciduous trees 14 inches DBH")],
      "K8",
    ],
    [
      "a change to the value it already has",
      "Significant trees are conifers 8 inches DBH or larger.",
      [change(CONIFER, 8, 8, "conifers 8 inches DBH")],
      "K8",
    ],
    [
      "a new value that is not in the quote",
      TREES,
      [change(CONIFER, 8, 12, "conifers 10 inches DBH or larger")],
      "K8",
    ],
    [
      "a new value from a different number in the quote",
      TREES,
      [change(CONIFER, 8, 4, "conifers 10 inches DBH or larger")],
      "K8",
    ],
    [
      "a new value written as a decimal the quote lacks",
      TREES,
      [change(CONIFER, 8, 10.5, "conifers 10 inches DBH or larger")],
      "K8",
    ],
    ["a negative value", TREES, [change(CONIFER, 8, -10, "conifers 10 inches DBH or larger")], "K8"],
    [
      "the same rule changed twice",
      TREES,
      [change(CONIFER, 8, 10, "conifers 10 inches DBH"), change(CONIFER, 8, 10, "conifers 10 inches DBH")],
      "K8",
    ],
    [
      "a value of zero, which the profile does not allow",
      "Significant trees are conifers 0 inches DBH or larger.",
      [change(CONIFER, 8, 0, "conifers 0 inches DBH")],
      "K8",
    ],
    [
      "a quote with the right words and the wrong section",
      TREES,
      [{ ...change(CONIFER, 8, 10, "conifers 10 inches DBH"), sectionPath: "21A.99.1" }],
      "K5",
    ],
    ["a quote that is not in the passage", TREES, [change(CONIFER, 8, 10, "conifers ten inches DBH")], "K2"],
  ];
  for (const [name, text, changes, expected] of REJECTED) {
    test(`rejects ${name} (${expected})`, () => {
      expect(draft(text, ...changes)).toBe(expected);
    });
  }

  test("more than twelve changes is a shape failure", () => {
    const many = Array.from({ length: 13 }, () => change(CONIFER, 8, 10, "conifers 10 inches DBH"));
    expect(draft(TREES, ...many)).toBe("K1");
  });

  test("a rule draft with no profile to check against is rejected, not waved through", () => {
    expect(first(run("PR1", treesReq(TREES), { changes: [] }, false))).toBe("K8");
  });

  test("a change to a buffer's width is accepted and a change to its study trigger distance is a different path", () => {
    const trigger = values.find((v) => v.path.startsWith("studyTriggers."));
    expect(trigger).toBeDefined();
    if (!buffer || !trigger) return;
    expect(buffer.path.endsWith(".widthFt")).toBe(true);
    expect(trigger.path.endsWith(".withinFt")).toBe(true);
  });
});

// --- the order the checks run in, and what a rejection leaves behind -----------------------------------------------

test.describe("the checks run in order and the first failure speaks", () => {
  const both = (text: string, quote: string) =>
    first(
      run("EV1", EVIDENCE, {
        paragraphs: [{ text, restates: ["line:0"], quotes: [{ sourceId: "line:0", text: quote }] }],
      }),
    );

  test("K1 before K2", () => {
    expect(
      first(
        run(
          "EV1",
          EVIDENCE,
          '{"paragraphs": [{"text": "x", "restates": ["line:0"], "quotes": [{"sourceId": "line:0"}]}]}',
        ),
      ),
    ).toBe("K1");
  });
  test("K2 before K3", () => {
    expect(both("It is 99 acres.", "an invented quote about wetlands")).toBe("K2");
  });
  test("K3 before K4", () => {
    expect(both("It is 99 acres and safe.", "2 features")).toBe("K3");
  });
  test("K4 before K5", () => {
    const answer = { paragraphs: [{ text: "This is approved.", restates: ["line:99"], quotes: [] }] };
    expect(first(run("EV1", EVIDENCE, answer))).toBe("K4");
  });
  test("K5 before K6 and K7", () => {
    const answer = { questions: [{ text: "Ensure it is done.", basis: { kind: "gap", ref: "gap:9" } }] };
    expect(first(run("SC2", GAPS, answer))).toBe("K5");
  });

  test("a rejection carries failures and no content: nothing of the answer can be shown", () => {
    const result = run("EV1", EVIDENCE, explain("It is approved."));
    expect(result.ok).toBe(false);
    expect("content" in result).toBe(false);
    if (!result.ok) {
      expect(result.failures.length).toBeGreaterThan(0);
      for (const f of result.failures) expect(f.check).toMatch(/^K[1-8]$/);
    }
  });

  test("checking the same answer twice gives the same result, and never mutates the request", () => {
    const req = request("EV1", { passages: EVIDENCE.passages, refs: EVIDENCE.refs });
    const before = JSON.stringify(req);
    const a = JSON.stringify(run("EV1", req, explain("Two features, 1.84 acres.")));
    const b = JSON.stringify(run("EV1", req, explain("Two features, 1.84 acres.")));
    expect(a).toBe(b);
    expect(JSON.stringify(req)).toBe(before);
  });

  test("an answer accepted for one request is not accepted for another that lacks its figures", () => {
    const answer = explain("Two features, 1.84 acres.");
    const other = request("EV1", {
      passages: [{ id: "line:0", label: "Drafted line 0", text: "Streams: 3 features." }],
      refs: [{ id: "line:0", kind: "line" }],
    });
    expect(first(run("EV1", EVIDENCE, answer))).toBe("accepted");
    expect(first(run("EV1", other, answer))).toBe("K3");
  });
});
