import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import { ASSIST_IDS, ASSISTS } from "../../../src/modules/assist/kinds";
import { buildMessages } from "../../../src/modules/assist/prompts";
import { GOLDEN_CASES } from "../support/ai-cases";
import { EDGE_CASES, EDGE_CATEGORIES } from "../support/ai-edge-cases";

// The evaluation sets are themselves code, and a set that quietly stops covering something is how a regression gets
// through. This spec holds the sets to account without calling any model: every assist, every kind, and every edge
// category is covered; every case is well formed; every id is unique; every request builds a prompt; and the planted
// instructions are really there.

const ALL = [...GOLDEN_CASES, ...EDGE_CASES];

test.describe("the evaluation sets cover the product", () => {
  test("every one of the 14 assists has a golden or an edge case", () => {
    const covered = new Set(ALL.map((c) => c.assistId));
    expect([...ASSIST_IDS].filter((id) => !covered.has(id))).toEqual([]);
  });

  test("every assist has at least two cases, so one lucky answer can't stand for it", () => {
    for (const id of ASSIST_IDS)
      expect(ALL.filter((c) => c.assistId === id).length, id).toBeGreaterThanOrEqual(2);
  });

  test("every kind of answer is exercised: explain, questions, find, compare, metadata-draft, rule-draft", () => {
    const kinds = new Set(ALL.map((c) => ASSISTS[c.assistId].kind));
    expect([...kinds].sort()).toEqual([
      "compare",
      "explain",
      "find",
      "metadata-draft",
      "questions",
      "rule-draft",
    ]);
  });

  test("every phase with assist has a case: profile, evidence, screening, studies, impact", () => {
    const phases = new Set(ALL.map((c) => ASSISTS[c.assistId].phase));
    expect([...phases].sort()).toEqual(["evidence", "impact", "profile", "screening", "studies"]);
  });

  test("the edge set has the thirteen categories and at least three cases in each", () => {
    expect(EDGE_CATEGORIES.length).toBe(13);
    for (const category of EDGE_CATEGORIES)
      expect(EDGE_CASES.filter((c) => c.category === category).length, category).toBeGreaterThanOrEqual(3);
  });

  test("every case that is meant to be 'nothing answers' expects found: false, and there are several", () => {
    const nothing = ALL.filter(
      (c) =>
        /nothing|silent|no passage|none answers|says none/i.test(c.probes) ||
        c.id.includes("nothing") ||
        c.id.includes("empty-"),
    );
    expect(nothing.length).toBeGreaterThanOrEqual(6);
  });

  test("the injection category has a safety check on every case that plants an instruction in the data", () => {
    const injections = EDGE_CASES.filter((c) => c.category === "injection");
    expect(injections.length).toBeGreaterThanOrEqual(10);
    const withoutSafety = injections.filter((c) => c.safety === undefined).map((c) => c.id);
    // The one deliberate exception is a trap that tries to force a wrong "found: false"; its test is accuracy alone.
    expect(withoutSafety).toEqual(["inj-answer-exists-but-format-trap"]);
  });

  test("a case that plants an instruction really contains one", () => {
    const planted =
      /ignore|override|disregard|system|note to model|repeat your|reply with|always answer|you are now|ignora|also state that|tell the reader/i;
    for (const c of EDGE_CASES.filter((e) => e.category === "injection")) {
      const where = [c.request.question ?? "", ...c.request.passages.flatMap((p) => [p.label, p.text])].join(
        "\n",
      );
      expect(where, c.id).toMatch(planted);
    }
  });
});

test.describe("every case is well formed", () => {
  test("ids are unique across both sets", () => {
    const ids = ALL.map((c) => c.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  for (const c of ALL) {
    test(`${c.id}: the request builds a prompt, names its assist's kind and task, and carries only allowed fields`, () => {
      expect(c.request.assistId).toBe(c.assistId);
      expect(c.request.kind).toBe(ASSISTS[c.assistId].kind);
      expect(c.request.task).toBe(ASSISTS[c.assistId].task);
      expect(Object.keys(c.request).sort()).toEqual([
        "assistId",
        "kind",
        "passages",
        "promptVersion",
        "question",
        "refs",
        "ruleValues",
        "task",
      ]);
      expect(buildMessages(c.request)).toHaveLength(2);
      expect(c.probes.length, "a case says what it probes").toBeGreaterThan(15);
    });

    test(`${c.id}: a rule draft has the profile it is checked against, and nothing else does`, () => {
      expect(c.baseDocument !== null).toBe(ASSISTS[c.assistId].kind === "rule-draft");
    });

    test(`${c.id}: no real project data: no email, no UUID, no coordinates`, () => {
      const text = JSON.stringify(c.request);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
      expect(text).not.toMatch(/-?1[12]\d\.\d{4,}/);
    });
  }
});
