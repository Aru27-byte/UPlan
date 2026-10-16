import "./placeholder-env";

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { checkOutput } from "../../../src/modules/assist/checks";
import { ASSISTS, type SuggestionContent } from "../../../src/modules/assist/kinds";
import { buildMessages } from "../../../src/modules/assist/prompts";
import { ModelServiceError, chat } from "../../../src/platform/model-client";
import type { GoldenCase } from "./ai-cases";

// The machinery the live evaluation specs share: ask the real model one case once, judge the answer, and keep every
// outcome in a file. The file matters: a failed test restarts Playwright's worker, which would lose anything held in
// memory, and a summary has to see every call.

export const MAX_ANSWER_TOKENS = 1_200; // the same cap the app uses (src/modules/assist/run.ts)

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
] as const;
export const SampleSchema = z.object({
  caseId: z.string(),
  category: z.string().nullable(),
  assistId: z.string(),
  run: z.number().int(),
  ok: z.boolean(),
  failure: z.enum(FAILURES).nullable(),
  detail: z.string().nullable(),
  /** Things an ACCEPTED answer did that it must never do. Zero tolerance. */
  safety: z.array(z.string()),
  latencyMs: z.number(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
});
export type Sample = z.infer<typeof SampleSchema>;

export type Judged = GoldenCase & { category?: string; safety?: (content: SuggestionContent) => string[] };

export function createStore(name: string) {
  const dir = join("test-results", name);
  const samples = join(dir, "samples.jsonl");
  const gate = join(dir, "preflight-failed.txt");
  return {
    reset(): void {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(samples, "");
    },
    record(sample: Sample): void {
      appendFileSync(samples, `${JSON.stringify(sample)}\n`);
    },
    read(): Sample[] {
      return readFileSync(samples, "utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => SampleSchema.parse(JSON.parse(line)));
    },
    /** Written when the preflight fails, so the cases that follow fail at once instead of each waiting out 45 s. */
    close(reason: string): void {
      writeFileSync(gate, reason);
    },
    assertOpen(): void {
      if (existsSync(gate))
        throw new Error(`Not run: the preflight failed first. ${readFileSync(gate, "utf8")}`);
    },
  };
}

/** Asks the real model service once and judges the answer: the app's checks, then the case's accuracy, then its safety. */
export async function askModel(golden: Judged, run: number): Promise<Sample> {
  const base = {
    caseId: golden.id,
    category: golden.category ?? null,
    assistId: golden.assistId,
    run,
    safety: [] as string[],
  };
  const started = performance.now();
  let answer;
  try {
    answer = await chat(buildMessages(golden.request), MAX_ANSWER_TOKENS);
  } catch (err) {
    if (err instanceof ModelServiceError) {
      return {
        ...base,
        ok: false,
        failure: err.reason,
        detail: err.message,
        latencyMs: performance.now() - started,
        tokensIn: null,
        tokensOut: null,
      };
    }
    throw err;
  }
  const latencyMs = performance.now() - started;
  const tokens = { tokensIn: answer.tokensIn, tokensOut: answer.tokensOut };
  const checked = checkOutput({
    assist: ASSISTS[golden.assistId],
    request: golden.request,
    rawText: answer.content,
    baseDocument: golden.baseDocument,
  });
  if (!checked.ok) {
    return {
      ...base,
      ...tokens,
      latencyMs,
      ok: false,
      failure: checked.failures[0]?.check ?? "K1",
      detail: checked.failures.map((f) => f.message).join(" | "),
    };
  }
  // Safety is judged on what a planner could have seen, which is only an answer the checks accepted.
  const safety = golden.safety ? golden.safety(checked.content) : [];
  const problems = golden.verify(checked.content);
  return {
    ...base,
    ...tokens,
    latencyMs,
    safety,
    ok: problems.length === 0,
    failure: problems.length === 0 ? null : "accuracy",
    detail: problems.length === 0 ? null : problems.join("; "),
  };
}
