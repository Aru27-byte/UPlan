import { z } from "zod";

import { env } from "./env";

// TechDesign/ai-assist.md, "Model roles" and D27: the one place UPlan calls a model service. NVIDIA's hosted
// API is OpenAI-compatible, so this is `fetch` and Zod, with no SDK. Only the `assist` and `code-tracking`
// modules import it (do-not.md), and only on the server, so the key never reaches a browser.
//
// Model ids are constants, not settings (best-practices.md): changing one is a pull request that must pass
// the evaluation set (F24 R16). A retired id fails explicitly as an `http-error`; there is no fallback model.

export const GENERATE_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";
export const EMBED_MODEL_ID = "nvidia/nv-embedqa-e5-v5";
export const EMBED_DIMENSIONS = 1024;

const BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Below the route segment's `maxDuration` (60 s), so a slow call is a recorded failure and not a killed function. */
export const CALL_TIMEOUT_MS = 45_000;

// The ways a call can fail, each shown to the person with its reason (F24 R11).
export type ModelFailureReason = "not-configured" | "rate-limited" | "timeout" | "unreachable" | "http-error" | "bad-response";

export class ModelServiceError extends Error {
  readonly reason: ModelFailureReason;
  readonly status: number | null;
  constructor(reason: ModelFailureReason, message: string, status: number | null = null) {
    super(message);
    this.name = "ModelServiceError";
    this.reason = reason;
    this.status = status;
  }
}

/** True when a key is set. Callers check this before writing anything, so an unconfigured deployment leaves no rows. */
export function isModelConfigured(): boolean {
  return env.NVIDIA_API_KEY !== undefined;
}

const ChatResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() }).optional(),
});

const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

async function post(path: string, body: unknown): Promise<unknown> {
  const key = env.NVIDIA_API_KEY;
  if (key === undefined) throw new ModelServiceError("not-configured", "AI assist is not set up for this deployment.");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ModelServiceError("timeout", `The model service did not answer within ${CALL_TIMEOUT_MS / 1000} seconds.`);
    }
    throw new ModelServiceError("unreachable", `The model service could not be reached: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status === 429) throw new ModelServiceError("rate-limited", "The free model service is at its limit.", 429);
  if (!res.ok) {
    // The body names the reason (a retired model id, a malformed request) and holds no secret.
    const detail = (await res.text()).slice(0, 300);
    throw new ModelServiceError("http-error", `The model service answered HTTP ${res.status}: ${detail}`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ModelServiceError("bad-response", "The model service's answer was not JSON.", res.status);
  }
}

export type ChatResult = { content: string; tokensIn: number | null; tokensOut: number | null };

/** One chat completion at temperature 0. The text is returned as the model wrote it; the caller checks it. */
export async function chat(messages: { role: "system" | "user"; content: string }[], maxTokens: number): Promise<ChatResult> {
  const raw = await post("/chat/completions", {
    model: GENERATE_MODEL_ID,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
    stream: false,
  });
  const parsed = ChatResponseSchema.safeParse(raw);
  const first = parsed.success ? parsed.data.choices[0] : undefined;
  if (!parsed.success || !first) throw new ModelServiceError("bad-response", "The model service's answer had an unexpected shape.");
  return {
    content: first.message.content,
    tokensIn: parsed.data.usage?.prompt_tokens ?? null,
    tokensOut: parsed.data.usage?.completion_tokens ?? null,
  };
}

/**
 * Embeds each text as a "passage" (indexing) or a "query" (a question); the embedder is trained for the two modes
 * and retrieval drops sharply if they are mixed up. A response whose length or vector size is not exactly what
 * was asked for is an error, never a truncation (ai-assist.md, "Model roles").
 */
export async function embed(texts: string[], inputType: "passage" | "query"): Promise<number[][]> {
  const raw = await post("/embeddings", {
    model: EMBED_MODEL_ID,
    input: texts,
    input_type: inputType,
    encoding_format: "float",
    truncate: "NONE", // an input too long for the model is an error to show, not text to cut silently
  });
  const parsed = EmbeddingResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.data.length !== texts.length) {
    throw new ModelServiceError("bad-response", "The embedding service returned a different number of vectors than texts sent.");
  }
  const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => {
    if (d.embedding.length !== EMBED_DIMENSIONS) {
      throw new ModelServiceError("bad-response", `The embedding service returned ${d.embedding.length} dimensions, not ${EMBED_DIMENSIONS}.`);
    }
    return d.embedding;
  });
}
