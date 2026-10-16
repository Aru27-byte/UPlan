import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import { ASSIST_IDS } from "../../../src/modules/assist/kinds";
import {
  CALL_TIMEOUT_MS,
  GENERATE_MODEL_ID,
  chat,
  isModelConfigured,
} from "../../../src/platform/model-client";
import { GOLDEN_CASES } from "../support/ai-cases";
import { askModel, createStore, type Sample } from "../support/ai-live";
import {
  AI_LATENCY_HARD_MAX_MS,
  AI_LATENCY_P50_MS,
  AI_LATENCY_P95_MS,
  AI_MIN_PASS_RATE,
  AI_REPEATS,
} from "../support/env";
import { percentile, seconds, summarize } from "../support/stats";

// AI assist against the REAL model service: accuracy and latency of the golden set (TechDesign/ai-assist.md, F24 R16;
// testing rules: "a change to a model id, prompt, chunking, or retrieval query ships only if retrieval recall, draft
// accuracy, and rejection of the planted failures don't drop"). Tagged @live because it spends the free allowance; run
// it with `npm run test:e2e:ai`. It sends only the invented, public text in support/ai-cases.ts, never a real project's
// data. The edge cases, the embeddings, and the load sweeps are in the specs beside this one.
//
// An answer is judged twice, in this order:
//   1. It clears the same deterministic checks the app applies (K1-K8). An answer the checks reject is a miss here too:
//      a planner would see "Rejected by checks", not an answer.
//   2. It is RIGHT for the case: the right passage, both ends of the range, "found: false" when the text is silent.
// And timed: each call finishes inside the client's own timeout (45 s, after which the app records a failure), and the
// median and 95th percentile across all calls stay inside the budgets in support/env.ts.

const store = createStore("ai-eval");

test.describe("chat: the generation model, golden set", () => {
  test("@live the model service is configured and names the model the app will call", () => {
    const testInfo = test.info();
    store.reset();
    expect(
      isModelConfigured(),
      "NVIDIA_API_KEY is not set in the environment or .env, so there is nothing to evaluate.",
    ).toBe(true);
    // The id is a constant in src/platform/model-client.ts. This suite is how a change to it is judged, so it reports
    // the id it ran against rather than pinning one.
    expect(GENERATE_MODEL_ID).toMatch(/^[a-z0-9-]+\/[a-z0-9._-]+$/);
    testInfo.annotations.push({ type: "model", description: GENERATE_MODEL_ID });
  });

  test("@live preflight: a one-line request is answered inside the client's own timeout", async () => {
    const started = performance.now();
    let answer;
    try {
      answer = await chat([{ role: "user", content: 'Reply with exactly {"ok":true}' }], 30);
    } catch (err) {
      store.close(err instanceof Error ? err.message : String(err));
      throw err;
    }
    const elapsed = performance.now() - started;

    expect(answer.content.length).toBeGreaterThan(0);
    expect(elapsed, `the model service took ${seconds(elapsed)} to answer a one-line request`).toBeLessThan(
      CALL_TIMEOUT_MS,
    );
    expect(AI_LATENCY_HARD_MAX_MS).toBe(CALL_TIMEOUT_MS);
  });

  for (const golden of GOLDEN_CASES) {
    test(`@live ${golden.id}: ${golden.probes}`, async () => {
      store.assertOpen();
      const mine: Sample[] = [];
      for (let run = 1; run <= AI_REPEATS; run += 1) {
        const sample = await askModel(golden, run);
        mine.push(sample);
        store.record(sample);
      }

      const passed = mine.filter((s) => s.ok).length;
      const report = mine
        .map((s) => `run ${s.run}: ${s.ok ? "pass" : `${s.failure} - ${s.detail}`} (${seconds(s.latencyMs)})`)
        .join("\n");
      // Sampling at temperature 1.0 means one miss in three is noise; two is a regression.
      expect(passed, `${golden.id} passed ${passed} of ${AI_REPEATS}\n${report}`).toBeGreaterThanOrEqual(
        Math.ceil(AI_REPEATS * (2 / 3)),
      );
      for (const s of mine) {
        expect(
          s.latencyMs,
          `${golden.id} run ${s.run} took ${seconds(s.latencyMs)}, past the client's ${seconds(CALL_TIMEOUT_MS)} timeout`,
        ).toBeLessThanOrEqual(AI_LATENCY_HARD_MAX_MS + 2_000);
      }
    });
  }

  test("@live summary: accuracy and latency across every call, against the budgets", async () => {
    const testInfo = test.info();
    store.assertOpen();
    const samples = store.read();
    expect(samples.length, "no golden case ran before the summary").toBe(GOLDEN_CASES.length * AI_REPEATS);

    const passRate = samples.filter((s) => s.ok).length / samples.length;
    const latency = summarize(samples.map((s) => s.latencyMs));
    const answered = samples.filter((s) => s.tokensOut !== null);
    const byFailure = new Map<string, number>();
    for (const s of samples) if (s.failure) byFailure.set(s.failure, (byFailure.get(s.failure) ?? 0) + 1);
    const byAssist = ASSIST_IDS.map((id) => {
      const mine = samples.filter((s) => s.assistId === id);
      return { assist: id, calls: mine.length, passed: mine.filter((s) => s.ok).length };
    }).filter((row) => row.calls > 0);

    const report = {
      model: GENERATE_MODEL_ID,
      calls: samples.length,
      passRate: Number(passRate.toFixed(3)),
      minPassRate: AI_MIN_PASS_RATE,
      failuresByCause: Object.fromEntries(byFailure),
      latencyMs: {
        ...latency,
        budgetP50Ms: AI_LATENCY_P50_MS,
        budgetP95Ms: AI_LATENCY_P95_MS,
        clientTimeoutMs: CALL_TIMEOUT_MS,
      },
      meanTokensOut: Math.round(
        answered.reduce((sum, s) => sum + (s.tokensOut ?? 0), 0) / Math.max(1, answered.length),
      ),
      byAssist,
      perCase: GOLDEN_CASES.map((g) => {
        const mine = samples.filter((s) => s.caseId === g.id);
        return {
          id: g.id,
          passed: mine.filter((s) => s.ok).length,
          of: mine.length,
          p50Ms: Math.round(
            percentile(
              mine.map((s) => s.latencyMs),
              50,
            ),
          ),
        };
      }),
      misses: samples
        .filter((s) => !s.ok)
        .map((s) => ({ case: s.caseId, run: s.run, cause: s.failure, detail: s.detail })),
    };
    await testInfo.attach("ai-eval-report.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    testInfo.annotations.push({
      type: "ai-eval",
      description: `pass ${(passRate * 100).toFixed(0)}% of ${samples.length}; latency p50 ${seconds(latency.p50Ms)}, p95 ${seconds(latency.p95Ms)}, max ${seconds(latency.maxMs)}`,
    });

    expect(
      passRate,
      `accuracy ${(passRate * 100).toFixed(0)}% is under the ${(AI_MIN_PASS_RATE * 100).toFixed(0)}% floor\n${JSON.stringify(report.failuresByCause)}`,
    ).toBeGreaterThanOrEqual(AI_MIN_PASS_RATE);
    expect(
      latency.p50Ms,
      `median latency ${seconds(latency.p50Ms)} is over the ${seconds(AI_LATENCY_P50_MS)} budget`,
    ).toBeLessThanOrEqual(AI_LATENCY_P50_MS);
    expect(
      latency.p95Ms,
      `p95 latency ${seconds(latency.p95Ms)} is over the ${seconds(AI_LATENCY_P95_MS)} budget`,
    ).toBeLessThanOrEqual(AI_LATENCY_P95_MS);
    expect(
      latency.maxMs,
      `slowest call ${seconds(latency.maxMs)} is past the client timeout`,
    ).toBeLessThanOrEqual(AI_LATENCY_HARD_MAX_MS + 2_000);
  });

  test("@live summary: few answers invent a quote, a figure, or a verdict", () => {
    store.assertOpen();
    const samples = store.read();
    // Each is one the checks caught and a planner was spared; the rate says how often the model reaches for one.
    const hardFailures = samples.filter(
      (s) => s.failure === "K2" || s.failure === "K3" || s.failure === "K4",
    );
    expect(
      hardFailures.length / samples.length,
      `${hardFailures.length} answers invented a quote, a figure, or a verdict`,
    ).toBeLessThanOrEqual(0.1);
  });
});
