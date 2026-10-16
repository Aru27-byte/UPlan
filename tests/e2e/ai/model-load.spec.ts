import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import { checkOutput } from "../../../src/modules/assist/checks";
import { ASSISTS } from "../../../src/modules/assist/kinds";
import { buildMessages } from "../../../src/modules/assist/prompts";
import {
  CALL_TIMEOUT_MS,
  GENERATE_MODEL_ID,
  chat,
  isModelConfigured,
} from "../../../src/platform/model-client";
import { GOLDEN_CASES, request } from "../support/ai-cases";
import { STREAM_F, padded } from "../support/ai-edge-cases";
import { MAX_ANSWER_TOKENS, askModel, createStore, type Sample } from "../support/ai-live";
import { AI_LATENCY_HARD_MAX_MS, AI_LATENCY_P50_MS, AI_LATENCY_P95_MS } from "../support/env";
import { percentile, seconds, summarize } from "../support/stats";

// How the generation model behaves as the work gets bigger, busier, or cut short: the latency a planner feels is not
// one number. Tagged @live; run with `npm run test:e2e:ai`. Each test reports its measurements as an annotation and an
// attached JSON file, so a regression shows as a number that moved.
//   input size    one answer hidden in 5 to 120 chunks of text
//   output size   explanations of 1, 6, and 12 lines
//   truncation    an answer cut off by the token limit is rejected, never repaired
//   concurrency   1, 2, 4, and 8 requests at the same moment, as several planners pressing Ask would make
//   repeatability the same request, eight times

const store = createStore("ai-load");
const FIND = GOLDEN_CASES.find((g) => g.id === "find-stream-type-f");
if (!FIND) throw new Error("the golden set lost find-stream-type-f");

test.describe("load: the generation model", () => {
  test("@live the model service is configured and answers a one-line request", async () => {
    store.reset();
    expect(isModelConfigured(), "NVIDIA_API_KEY is not set").toBe(true);
    test.info().annotations.push({ type: "model", description: GENERATE_MODEL_ID });
    const started = performance.now();
    try {
      await chat([{ role: "user", content: 'Reply with exactly {"ok":true}' }], 30);
    } catch (err) {
      store.close(err instanceof Error ? err.message : String(err));
      throw err;
    }
    expect(performance.now() - started).toBeLessThan(CALL_TIMEOUT_MS);
  });

  test("@live input size: an answer hidden in 5, 20, 60, and 120 chunks is found, and time grows gently", async () => {
    store.assertOpen();
    const rows: {
      chunks: number;
      chars: number;
      tokensIn: number | null;
      p50Ms: number;
      right: number;
      of: number;
    }[] = [];
    for (const chunks of [5, 20, 60, 120]) {
      const passages = padded(chunks, chunks - 1, STREAM_F);
      const golden = {
        ...FIND,
        id: `size-${chunks}`,
        request: request("PR2", { question: "What buffer applies to a Type F stream?", passages }),
      };
      const samples: Sample[] = [];
      for (let run = 1; run <= 3; run += 1) {
        const s = await askModel(golden, run);
        samples.push(s);
        store.record(s);
      }
      rows.push({
        chunks,
        chars: passages.reduce((n, p) => n + p.text.length, 0),
        tokensIn: samples.find((s) => s.tokensIn !== null)?.tokensIn ?? null,
        p50Ms: Math.round(
          percentile(
            samples.map((s) => s.latencyMs),
            50,
          ),
        ),
        right: samples.filter((s) => s.ok).length,
        of: samples.length,
      });
    }
    await test
      .info()
      .attach("input-size.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    test.info().annotations.push({
      type: "input-size",
      description: rows.map((r) => `${r.chunks} chunks: ${seconds(r.p50Ms)}, ${r.right}/${r.of}`).join("; "),
    });

    const small = rows[0];
    const big = rows.at(-1);
    expect(small && small.right >= 2, `the 5-chunk case was right ${small?.right} of ${small?.of}`).toBe(
      true,
    );
    expect(big && big.p50Ms <= AI_LATENCY_HARD_MAX_MS, `120 chunks took ${seconds(big?.p50Ms ?? 0)}`).toBe(
      true,
    );
    expect(
      big?.p50Ms ?? 0,
      "120 chunks should not take more than five times as long as five plus five seconds",
    ).toBeLessThanOrEqual((small?.p50Ms ?? 0) * 5 + 5_000);
    for (const row of rows) expect(row.tokensIn ?? 0, `${row.chunks} chunks`).toBeGreaterThan(0);
  });

  test("@live output size: explaining 1, 6, and 12 lines costs time in proportion to what is written", async () => {
    store.assertOpen();
    const rows: { lines: number; tokensOut: number; p50Ms: number; msPerToken: number }[] = [];
    for (const n of [1, 6, 12]) {
      const texts = Array.from(
        { length: n },
        (_, i) =>
          `Resource ${String.fromCharCode(65 + i)}: ${i + 2} features, ${(i + 1) * 0.37} acres mapped.`,
      );
      const golden = {
        ...FIND,
        id: `lines-${n}`,
        assistId: "EV1" as const,
        request: request("EV1", {
          passages: texts.map((text, i) => ({ id: `line:${i}`, label: `Drafted line ${i}`, text })),
          refs: texts.map((_, i) => ({ id: `line:${i}`, kind: "line" as const })),
        }),
        verify: () => [],
      };
      const samples: Sample[] = [];
      for (let run = 1; run <= 2; run += 1) {
        const s = await askModel(golden, run);
        samples.push(s);
        store.record(s);
      }
      const answered = samples.filter((s) => s.tokensOut !== null);
      expect(answered.length, `no ${n}-line answer came back`).toBeGreaterThan(0);
      const tokensOut = Math.round(answered.reduce((t, s) => t + (s.tokensOut ?? 0), 0) / answered.length);
      const p50Ms = Math.round(
        percentile(
          answered.map((s) => s.latencyMs),
          50,
        ),
      );
      rows.push({ lines: n, tokensOut, p50Ms, msPerToken: Math.round(p50Ms / Math.max(1, tokensOut)) });
    }
    await test
      .info()
      .attach("output-size.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    test.info().annotations.push({
      type: "output-size",
      description: rows.map((r) => `${r.lines} lines: ${r.tokensOut} tokens, ${seconds(r.p50Ms)}`).join("; "),
    });

    expect(rows.at(-1)?.tokensOut ?? 0, "a longer input writes a longer answer").toBeGreaterThan(
      rows[0]?.tokensOut ?? 0,
    );
    for (const row of rows)
      expect(row.tokensOut, `${row.lines} lines`).toBeLessThanOrEqual(MAX_ANSWER_TOKENS);
  });

  test("@live truncation: an answer cut off by the token limit is rejected as malformed, never repaired and never shown", async () => {
    store.assertOpen();
    const golden = GOLDEN_CASES.find((g) => g.id === "explain-evidence-lines");
    if (!golden) throw new Error("the golden set lost explain-evidence-lines");
    const answer = await chat(buildMessages(golden.request), 25);
    const checked = checkOutput({
      assist: ASSISTS[golden.assistId],
      request: golden.request,
      rawText: answer.content,
      baseDocument: null,
    });

    expect(answer.tokensOut ?? 0, "the cap held").toBeLessThanOrEqual(26);
    expect(checked.ok, `a 25-token answer was accepted: ${answer.content}`).toBe(false);
    if (!checked.ok) expect(checked.failures[0]?.check).toBe("K1");
  });

  // Before the concurrency sweep on purpose: the free service rate-limits, and a burst of eight would starve this test.
  test("@live repeatability: the same request eight times is right at least six, and the time does not swing wildly", async () => {
    store.assertOpen();
    const samples: Sample[] = [];
    for (let run = 1; run <= 8; run += 1) {
      const s = await askModel({ ...FIND, id: "repeat" }, run);
      samples.push(s);
      store.record(s);
    }
    const times = samples.map((s) => s.latencyMs);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);

    test.info().annotations.push({
      type: "repeatability",
      description: `${samples.filter((s) => s.ok).length}/8 right; mean ${seconds(mean)}, sd ${seconds(sd)}`,
    });
    expect(
      samples.filter((s) => s.ok).length,
      samples.map((s) => `${s.ok ? "pass" : s.failure}`).join(", "),
    ).toBeGreaterThanOrEqual(6);
    expect(sd / mean, "coefficient of variation of latency").toBeLessThan(1);
    expect(percentile(times, 50)).toBeLessThanOrEqual(AI_LATENCY_P50_MS);
  });

  for (const level of [1, 2, 4, 8]) {
    test(`@live concurrency ${level}: ${level} request${level === 1 ? "" : "s"} at once, two rounds`, async () => {
      store.assertOpen();
      const rounds: { wallMs: number; samples: Sample[] }[] = [];
      for (let round = 1; round <= 2; round += 1) {
        const started = performance.now();
        const samples = await Promise.all(
          Array.from({ length: level }, (_, i) =>
            askModel({ ...FIND, id: `conc-${level}` }, round * 100 + i),
          ),
        );
        rounds.push({ wallMs: performance.now() - started, samples });
        for (const s of samples) store.record(s);
      }
      const all = rounds.flatMap((r) => r.samples);
      const latency = summarize(all.map((s) => s.latencyMs));
      const limited = all.filter((s) => s.failure === "rate-limited").length;
      const broken = all.filter(
        (s) => s.failure === "unreachable" || s.failure === "bad-response" || s.failure === "http-error",
      ).length;
      const calls = all.length;
      const throughput = calls / (rounds.reduce((t, r) => t + r.wallMs, 0) / 1000);

      await test.info().attach(`concurrency-${level}.json`, {
        body: JSON.stringify(
          { level, calls, limited, broken, latency, throughputPerSecond: Number(throughput.toFixed(2)) },
          null,
          2,
        ),
        contentType: "application/json",
      });
      test.info().annotations.push({
        type: `concurrency-${level}`,
        description: `p50 ${seconds(latency.p50Ms)}, p95 ${seconds(latency.p95Ms)}, ${limited} limited, ${broken} broken, ${throughput.toFixed(2)} calls/s`,
      });

      expect(broken, "the service errored or answered something that was not JSON").toBe(0);
      // The free service has a rate limit. Up to four at once must not hit it; eight may, but must say so plainly.
      expect(limited / calls, `${limited} of ${calls} were rate-limited`).toBeLessThanOrEqual(
        level <= 4 ? 0 : 0.5,
      );
      expect(latency.p95Ms, `p95 ${seconds(latency.p95Ms)} at ${level} at once`).toBeLessThanOrEqual(
        AI_LATENCY_P95_MS * (level <= 2 ? 1.5 : 2.5),
      );
      expect(latency.maxMs).toBeLessThanOrEqual(AI_LATENCY_HARD_MAX_MS + 2_000);
    });
  }

  test("@live every call in this file was inside the client's timeout, and none ran past it silently", () => {
    store.assertOpen();
    const slow = store.read().filter((s) => s.latencyMs > AI_LATENCY_HARD_MAX_MS + 2_000);
    expect(slow.map((s) => `${s.caseId}: ${seconds(s.latencyMs)}`)).toEqual([]);
  });
});
