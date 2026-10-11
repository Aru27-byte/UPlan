import { z } from "zod";

import { env } from "./env";

// TechDesign/ai-assist.md, "Model roles" and D27: the one place UPlan calls a model service. NVIDIA's hosted
// API is OpenAI-compatible, so this is `fetch` and Zod, with no SDK. Only the `assist` and `code-tracking`
// modules import it (do-not.md), and only on the server, so the key never reaches a browser.
//
// Model ids are constants, not settings (best-practices.md): changing one is a pull request that must pass
// the evaluation set (F24 R16). A retired id fails explicitly as an `http-error`; there is no fallback model.

export const GENERATE_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";
// nv-embedqa-e5-v5 was retired on 2026-08-25 (HTTP 410). Nemotron 3 Embed 1B returns 2,048 dimensions, and its
// model card allows keeping only the first 1,024 or 512 of them when the vector is L2-normalized again after the
// cut. The database column is vector(1024) and pgvector cannot index more than 2,000 dimensions, so the first
// 1,024 are kept here, at the one place a vector enters UPlan.
export const EMBED_MODEL_ID = "nvidia/nemotron-3-embed-1b";
export const EMBED_NATIVE_DIMENSIONS = 2048;
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

/**
 * One chat completion. The text is returned as the model wrote it; the caller checks it.
 *
 * Nemotron 3 Ultra is a reasoning model. Thinking is turned off here: every assist fills a fixed shape
 * from supplied text, so there is nothing to deliberate over, and reasoning tokens would spend the free
 * allowance and the token cap before any answer is written. The vendor recommends temperature 1.0 and top_p
 * 0.95 for both modes (model card), so those are used; a suggestion is stored and shown as stored, never
 * regenerated, so run-to-run variation is already part of the design (ai-assist.md, "Risks").
 */
export async function chat(messages: { role: "system" | "user"; content: string }[], maxTokens: number): Promise<ChatResult> {
  const raw = await post("/chat/completions", {
    model: GENERATE_MODEL_ID,
    messages,
    temperature: 1.0,
    top_p: 0.95,
    max_tokens: maxTokens,
    chat_template_kwargs: { enable_thinking: false },
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

/** Keeps the first EMBED_DIMENSIONS values and L2-normalizes the result, as the model card requires. */
function sliceAndNormalize(vector: number[]): number[] {
  const kept = vector.slice(0, EMBED_DIMENSIONS);
  const norm = Math.sqrt(kept.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) throw new ModelServiceError("bad-response", "The embedding service returned an all-zero vector.");
  return kept.map((v) => v / norm);
}

/**
 * Embeds each text as a "passage" (indexing) or a "query" (a question). The model is trained for the two modes
 * and the vendor says the caller adds the prefix itself, so it is added here: retrieval drops sharply if the two
 * are mixed up. A response whose count or vector size is not what the model is documented to return is an error,
 * never a truncation (ai-assist.md, "Model roles"); only the documented 2,048 to 1,024 cut is made, deliberately.
 */
export async function embed(texts: string[], inputType: "passage" | "query"): Promise<number[][]> {
  const raw = await post("/embeddings", {
    model: EMBED_MODEL_ID,
    input: texts.map((t) => `${inputType}: ${t}`),
    encoding_format: "float",
  });
  const parsed = EmbeddingResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.data.length !== texts.length) {
    throw new ModelServiceError("bad-response", "The embedding service returned a different number of vectors than texts sent.");
  }
  const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => {
    if (d.embedding.length !== EMBED_NATIVE_DIMENSIONS) {
      throw new ModelServiceError(
        "bad-response",
        `The embedding service returned ${d.embedding.length} dimensions, not the ${EMBED_NATIVE_DIMENSIONS} ${EMBED_MODEL_ID} is documented to return.`,
      );
    }
    return sliceAndNormalize(d.embedding);
  });
}
