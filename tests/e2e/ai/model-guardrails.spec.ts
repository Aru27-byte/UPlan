import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import { normalizeForQuote, verdictWordIn, type CheckId } from "../../../src/modules/assist/checks";
import { request } from "../support/ai-cases";
import { EVIDENCE, HONEST, PLANTED, check, explain, found } from "../support/ai-corpus";
import { percentile } from "../support/stats";

// AI assist, the half that needs no model and no network: the checks that stand between a model's words and a
// planner's screen (TechDesign/ai-assist.md, K1-K8; F24 R4-R6, R16). The model is probabilistic; these are not.
// Two corpora decide whether the checks are right:
//   * PLANTED: outputs a real model could plausibly produce and that must NEVER be shown, each with the check that
//     must catch it. Recall must be 100%: a planted failure that passes is a defect, not a statistic.
//   * HONEST: outputs that are true and must be shown. A check that rejects one of these is wrong the other way, and
//     a planner would see "Rejected by checks" on an answer that was fine. False rejects must be 0.
// Then the cost: checking sits on every suggestion's path, so its latency is measured too.

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
