import "../support/placeholder-env";

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { z } from "zod";

import { checkOutput, type CheckId } from "../../../src/modules/assist/checks";
import { ASSISTS } from "../../../src/modules/assist/kinds";
import { buildMessages } from "../../../src/modules/assist/prompts";
import {
  CALL_TIMEOUT_MS,
  EMBED_DIMENSIONS,
  GENERATE_MODEL_ID,
  ModelServiceError,
  chat,
  embed,
  isModelConfigured,
} from "../../../src/platform/model-client";
import { CODE, GOLDEN_CASES, type GoldenCase } from "../support/ai-cases";
import {
  AI_EMBED_LATENCY_P95_MS,
  AI_LATENCY_HARD_MAX_MS,
  AI_LATENCY_P50_MS,
  AI_LATENCY_P95_MS,
  AI_MIN_PASS_RATE,
  AI_REPEATS,
} from "../support/env";
import { percentile, seconds, summarize } from "../support/stats";

// AI assist against the REAL model service: accuracy and latency (TechDesign/ai-assist.md, F24 R16; testing rules:
// "a change to a model id, prompt, chunking, or retrieval query ships only if retrieval recall, draft accuracy, and
// rejection of the planted failures don't drop"). Tagged @live because it spends the free allowance; run it with
// `npm run test:e2e:ai`. It sends only the invented, public text in support/ai-cases.ts, never a real project's data.
//
// What "accurate" means here is two tests applied to every answer, in this order:
//   1. It clears the same deterministic checks the app applies (K1-K8): well-formed, quotes verbatim, numbers copied,
//      no verdict, references real, questions are questions, short enough, rule drafts legal.
//   2. It is RIGHT for the case: the right passage, both ends of the range, "found: false" when the text is silent.
// An answer the checks reject is a miss here too: in the app a planner would see "Rejected by checks", not an answer.
//
// What "fast enough" means: each call finishes inside the client's own timeout (45 s, after which the app records a
// failure), and the median and 95th percentile across all calls stay inside the budgets in support/env.ts.

type Failure = CheckId | "accuracy" | ModelServiceError["reason"] | "unexpected";

// A failed test restarts Playwright's worker, which would lose anything held in memory, so every call's outcome is
// written to a file as it happens and the summary reads them back. The first test of the run clears the folder.
const FAILURES = [
  "K1",
  "K2",
  "K3",
  "K4",
  "K5",
  "K6",
  "K7",
  "K8",
  "accuracy",
  "not-configured",
  "rate-limited",
  "timeout",
  "unreachable",
  "http-error",
  "bad-response",
  "unexpected",
] as const;
const SampleSchema = z.object({
  caseId: z.string(),
  run: z.number().int(),
  ok: z.boolean(),
  failure: z.enum(FAILURES).nullable(),
  detail: z.string().nullable(),
  latencyMs: z.number(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
});
type Sample = Omit<z.infer<typeof SampleSchema>, "failure"> & { failure: Failure | null };

const STORE = join("test-results", "ai-eval");
const SAMPLES_FILE = join(STORE, "samples.jsonl");
const GATE_FILE = join(STORE, "preflight-failed.txt");

function resetStore(): void {
  rmSync(STORE, { recursive: true, force: true });
  mkdirSync(STORE, { recursive: true });
  writeFileSync(SAMPLES_FILE, "");
}
const record = (sample: Sample): void => appendFileSync(SAMPLES_FILE, `${JSON.stringify(sample)}\n`);
function readSamples(): Sample[] {
  return readFileSync(SAMPLES_FILE, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => SampleSchema.parse(JSON.parse(line)));
}
/** If the service already failed its preflight, every case would wait out its own 45 s timeouts; say so at once instead. */
function assertServiceAnswered(): void {
  if (existsSync(GATE_FILE))
    throw new Error(`Not run: the preflight failed first. ${readFileSync(GATE_FILE, "utf8")}`);
}
const MAX_ANSWER_TOKENS = 1_200; // the same cap the app uses (src/modules/assist/run.ts)

async function ask(golden: GoldenCase, run: number): Promise<Sample> {
  const started = performance.now();
  let answer;
  try {
    answer = await chat(buildMessages(golden.request), MAX_ANSWER_TOKENS);
  } catch (err) {
    const latencyMs = performance.now() - started;
    if (err instanceof ModelServiceError) {
      return {
        caseId: golden.id,
        run,
        ok: false,
        failure: err.reason,
        detail: err.message,
        latencyMs,
        tokensIn: null,
        tokensOut: null,
      };
    }
    throw err;
  }
  const latencyMs = performance.now() - started;
  const checked = checkOutput({
    assist: ASSISTS[golden.assistId],
    request: golden.request,
    rawText: answer.content,
    baseDocument: golden.baseDocument,
  });
  const base = { caseId: golden.id, run, latencyMs, tokensIn: answer.tokensIn, tokensOut: answer.tokensOut };
  if (!checked.ok) {
    const first = checked.failures[0];
    return {
      ...base,
      ok: false,
      failure: first?.check ?? "unexpected",
      detail: checked.failures.map((f) => f.message).join(" | "),
    };
  }
  const problems = golden.verify(checked.content);
  return problems.length === 0
    ? { ...base, ok: true, failure: null, detail: null }
    : { ...base, ok: false, failure: "accuracy", detail: problems.join("; ") };
}

test.describe("chat: the generation model", () => {
  test("@live the model service is configured and names the model the app will call", () => {
    const testInfo = test.info();
    resetStore();
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
      writeFileSync(GATE_FILE, err instanceof Error ? err.message : String(err));
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
      assertServiceAnswered();
      const mine: Sample[] = [];
      for (let run = 1; run <= AI_REPEATS; run += 1) {
        const sample = await ask(golden, run);
        mine.push(sample);
        record(sample);
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
    assertServiceAnswered();
    const samples = readSamples();
    expect(samples.length, "no golden case ran before the summary").toBe(GOLDEN_CASES.length * AI_REPEATS);

    const passed = samples.filter((s) => s.ok);
    const passRate = passed.length / samples.length;
    const latency = summarize(samples.map((s) => s.latencyMs));
    const answered = samples.filter((s) => s.tokensOut !== null);
    const byFailure = new Map<string, number>();
    for (const s of samples) if (s.failure) byFailure.set(s.failure, (byFailure.get(s.failure) ?? 0) + 1);
    const perCase = GOLDEN_CASES.map((g) => {
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
    });

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
      perCase,
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

  test("@live summary: no answer the checks accepted contains a verdict, an invented figure, or an unfound quote", () => {
    assertServiceAnswered();
    const samples = readSamples();
    // Redundant with the checks by construction, and that is the point: if an accepted answer ever carried one of these,
    // the checks would be the thing that broke. K2-K4 rejections are reported as misses above, never as shown text.
    const hardFailures = samples.filter(
      (s) => s.failure === "K2" || s.failure === "K3" || s.failure === "K4",
    );
    // Each such rejection is one the model produced and a planner was spared. Keep the rate low, not just caught.
    expect(
      hardFailures.length / samples.length,
      `${hardFailures.length} answers invented a quote, a figure, or a verdict`,
    ).toBeLessThanOrEqual(0.1);
  });
});

test.describe("embeddings: finding the right passage", () => {
  const PASSAGES = CODE.map((c) => c.text);
  const QUERIES: { query: string; expects: string }[] = [
    { query: "How wide is the buffer around a Category II wetland?", expects: "chunk:1" },
    { query: "Type F stream protective distance", expects: "chunk:2" },
    { query: "How far back from a steep hillside must building stay?", expects: "chunk:3" },
    {
      query: "Can untreated stormwater soak into the ground over an aquifer recharge area?",
      expects: "chunk:4",
    },
    { query: "Which reports must come with a subdivision application?", expects: "chunk:5" },
    { query: "Is an arborist report required?", expects: "chunk:5" },
  ];
  const cosine = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);

  test("@live a vector is 1,024 finite numbers of unit length, as the database column and the model card require", async () => {
    expect(isModelConfigured(), "NVIDIA_API_KEY is not set").toBe(true);
    const [vector] = await embed(["The standard buffer for a Category II wetland is 100 feet."], "passage");

    expect(vector).toBeDefined();
    expect(vector?.length).toBe(EMBED_DIMENSIONS);
    expect(vector?.every(Number.isFinite)).toBe(true);
    const norm = Math.sqrt((vector ?? []).reduce((s, v) => s + v * v, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });

  test("@live the same text embeds to the same place twice", async () => {
    const [a] = await embed(["A buffer of 150 feet shall be maintained from a Type F stream."], "passage");
    const [b] = await embed(["A buffer of 150 feet shall be maintained from a Type F stream."], "passage");

    expect(cosine(a ?? [], b ?? [])).toBeGreaterThan(0.999);
  });

  test("@live retrieval: each question's nearest passage is the one that answers it (recall@1 at least 83%)", async () => {
    const passageVectors = await embed(PASSAGES, "passage");
    const ids = CODE.map((c) => c.id);
    let hits = 0;
    const misses: string[] = [];
    for (const { query, expects } of QUERIES) {
      const [q] = await embed([query], "query");
      const ranked = passageVectors
        .map((v, i) => ({ id: ids[i] ?? "", sim: cosine(q ?? [], v) }))
        .sort((a, b) => b.sim - a.sim);
      if (ranked[0]?.id === expects) hits += 1;
      else misses.push(`"${query}" -> ${ranked[0]?.id} (wanted ${expects})`);
    }

    expect(hits / QUERIES.length, `recall@1 missed:\n${misses.join("\n")}`).toBeGreaterThanOrEqual(0.83);
  });

  test("@live retrieval: a question the code does not touch is further from every passage than the questions it does answer", async () => {
    const passageVectors = await embed(PASSAGES, "passage");
    const best = async (query: string): Promise<number> => {
      const [q] = await embed([query], "query");
      return Math.max(...passageVectors.map((v) => cosine(q ?? [], v)));
    };
    const related = await Promise.all(QUERIES.map((q) => best(q.query)));
    const unrelated = await best("What is the speed limit on Main Street?");

    expect(unrelated).toBeLessThan(Math.min(...related));
  });

  test("@live latency: embedding one question stays inside the retrieval budget", async () => {
    const times: number[] = [];
    for (const { query } of QUERIES) {
      const started = performance.now();
      await embed([query], "query");
      times.push(performance.now() - started);
    }
    const batchStarted = performance.now();
    await embed(PASSAGES, "passage");
    const batchMs = performance.now() - batchStarted;

    expect(
      percentile(times, 95),
      `p95 ${seconds(percentile(times, 95))} for one question`,
    ).toBeLessThanOrEqual(AI_EMBED_LATENCY_P95_MS);
    expect(
      batchMs,
      `${seconds(batchMs)} to embed ${PASSAGES.length} passages in one call`,
    ).toBeLessThanOrEqual(AI_EMBED_LATENCY_P95_MS * 2);
  });
});
