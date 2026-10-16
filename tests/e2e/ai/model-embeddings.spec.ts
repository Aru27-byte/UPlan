import "../support/placeholder-env";

import { expect, test } from "@playwright/test";

import {
  EMBED_DIMENSIONS,
  EMBED_MODEL_ID,
  ModelServiceError,
  embed,
  isModelConfigured,
} from "../../../src/platform/model-client";
import { CODE } from "../support/ai-cases";
import { AI_EMBED_LATENCY_P95_MS } from "../support/env";
import { percentile, seconds } from "../support/stats";

// Retrieval, the half of AI assist that finds the passages a model is then asked to read (F24 R8: "find" assists
// retrieve code text by meaning). If the wrong passages come back, the model never sees the right one and "found:
// false" is a lie of omission. So the embedding model is held to retrieval quality, to its contract (size, length,
// order), and to a latency budget. Tagged @live: it calls NVIDIA's embedding endpoint with invented public text.

const cosine = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
const norm = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

/** The five code passages plus twelve that have nothing to do with them, as a real chapter would. */
const DISTRACTORS = [
  "Off-street parking shall be provided at a ratio of two spaces for each single-family dwelling unit.",
  "Signs shall not exceed thirty-two square feet in area and shall not be illuminated between midnight and six in the morning.",
  "A home occupation shall be conducted entirely within the dwelling and shall not employ more than one person who does not reside there.",
  "Fences in a required front yard shall not exceed forty-two inches in height.",
  "Noise from construction activity is exempt between the hours of seven in the morning and seven in the evening on weekdays.",
  "Stormwater runoff from new impervious surface shall be detained so that the peak rate does not exceed the pre-development rate.",
  "The minimum lot size in the R-4 zone is nine thousand six hundred square feet, and the maximum building height is thirty-five feet.",
  "Street trees shall be planted along every new public street at an interval of not more than forty feet.",
  "Utilities serving a new subdivision shall be placed underground unless the Director finds that undergrounding is infeasible.",
  "A temporary use permit may be issued for a period not exceeding one hundred eighty days in any calendar year.",
  "Accessory dwelling units are allowed on any lot with a detached single-family house, subject to the standards of this section.",
  "Applications for a variance shall be accompanied by a statement of the hardship that prevents compliance with this title.",
];
const CORPUS = [
  ...CODE.map((c) => ({ id: c.id, text: c.text })),
  ...DISTRACTORS.map((text, i) => ({ id: `other:${i + 1}`, text })),
];

const QUERIES: { name: string; query: string; expects: string }[] = [
  { name: "a direct question", query: "What is the buffer for a Category II wetland?", expects: "chunk:1" },
  {
    name: "a paraphrase with no shared nouns",
    query: "How much space must be left around a marsh of the second class?",
    expects: "chunk:1",
  },
  {
    name: "the rule's own words",
    query: "buffer of 150 feet shall be maintained from a Type F stream",
    expects: "chunk:2",
  },
  { name: "a number alone", query: "150 feet", expects: "chunk:2" },
  { name: "an acronym", query: "OHWM measurement for stream buffers", expects: "chunk:2" },
  {
    name: "a different word for the same thing",
    query: "How far back from a hillside with a forty percent grade must building stay?",
    expects: "chunk:3",
  },
  { name: "misspellings", query: "setbak from the top of a steap slop", expects: "chunk:3" },
  {
    name: "capital letters",
    query: "CAN UNTREATED STORMWATER SOAK INTO THE GROUND OVER AN AQUIFER",
    expects: "chunk:4",
  },
  { name: "an abbreviation", query: "CARA infiltration rules", expects: "chunk:4" },
  {
    name: "a question about a report",
    query: "Which reports must come with a subdivision application?",
    expects: "chunk:5",
  },
  { name: "a single word", query: "arborist", expects: "chunk:5" },
  {
    name: "a long, rambling question",
    query:
      "I am reviewing an application for a short plat on a parcel near a creek and I have read most of the chapter, but I cannot find where it says how wide the protected strip along a fish-bearing stream has to be",
    expects: "chunk:2",
  },
  {
    name: "a question in Spanish",
    query: "¿Qué retiro se exige desde la cima de una pendiente pronunciada?",
    expects: "chunk:3",
  },
  {
    name: "a statement, not a question",
    query: "Category I wetlands have a larger buffer than Category II wetlands.",
    expects: "chunk:1",
  },
];
const UNRELATED = [
  "What is the capital of France?",
  "How do I bake sourdough bread?",
  "Quarterly revenue grew by twelve percent.",
  "The quick brown fox jumps over the lazy dog.",
  "Translate this sentence into German.",
];

test.describe("embeddings: the contract", () => {
  test("@live the service is configured", () => {
    expect(isModelConfigured(), "NVIDIA_API_KEY is not set").toBe(true);
    expect(EMBED_MODEL_ID).toMatch(/^nvidia\//);
  });

  test("@live every vector is 1,024 finite numbers of unit length, the size the database column requires", async () => {
    const vectors = await embed(
      CORPUS.map((c) => c.text),
      "passage",
    );
    expect(vectors.length).toBe(CORPUS.length);
    for (const v of vectors) {
      expect(v.length).toBe(EMBED_DIMENSIONS);
      expect(v.every(Number.isFinite)).toBe(true);
      expect(Math.abs(norm(v) - 1)).toBeLessThan(1e-6);
    }
  });

  test("@live a batch comes back in the order it was sent: each text lands where it was put", async () => {
    const batch = await embed(
      CORPUS.map((c) => c.text),
      "passage",
    );
    for (const index of [0, 4, 9, CORPUS.length - 1]) {
      const [alone] = await embed([CORPUS[index]?.text ?? ""], "passage");
      expect(
        cosine(batch[index] ?? [], alone ?? []),
        `item ${index} of the batch is not the embedding of item ${index}`,
      ).toBeGreaterThan(0.99);
    }
  });

  test("@live the same text embeds to the same place on every call", async () => {
    const text = CODE[1]?.text ?? "";
    const runs = await Promise.all([
      embed([text], "passage"),
      embed([text], "passage"),
      embed([text], "passage"),
    ]);
    expect(cosine(runs[0]?.[0] ?? [], runs[1]?.[0] ?? [])).toBeGreaterThan(0.999);
    expect(cosine(runs[1]?.[0] ?? [], runs[2]?.[0] ?? [])).toBeGreaterThan(0.999);
  });

  test("@live a query and a passage are embedded differently, because the model is trained for the two modes", async () => {
    const text = "What is the buffer for a Category II wetland?";
    const [asQuery] = await embed([text], "query");
    const [asPassage] = await embed([text], "passage");
    expect(cosine(asQuery ?? [], asPassage ?? [])).toBeLessThan(0.999);
  });

  test("@live nothing in the vector is silently dropped: a text and the same text with trailing spaces are near-identical", async () => {
    const [a] = await embed([CODE[0]?.text ?? ""], "passage");
    const [b] = await embed([`${CODE[0]?.text ?? ""}   \n  `], "passage");
    expect(cosine(a ?? [], b ?? [])).toBeGreaterThan(0.98);
  });

  test("@live letter case barely moves a passage, and meaning moves it far more", async () => {
    const text = CODE[0]?.text ?? "";
    const [a, upper, other] = await embed([text, text.toUpperCase(), DISTRACTORS[0] ?? ""], "passage");
    expect(cosine(a ?? [], upper ?? [])).toBeGreaterThan(cosine(a ?? [], other ?? []) + 0.1);
  });
});

test.describe("embeddings: odd inputs end in a vector or an explicit error, never a silent one", () => {
  const ODD: [string, string][] = [
    ["an empty string", ""],
    ["a single space", " "],
    ["one character", "x"],
    ["only punctuation", "?!…"],
    ["emoji", "🌲🌲🌲 buffer 🌊"],
    ["Chinese", "二类湿地的标准缓冲区为100英尺"],
    ["right-to-left text", "المنطقة العازلة للأراضي الرطبة مائة قدم"],
    ["a few thousand characters", `${CODE.map((c) => c.text).join(" ")} `.repeat(12)],
    [
      "text far past any model's window",
      "A buffer of 150 feet shall be maintained from a Type F stream. ".repeat(2_500),
    ],
    ["control characters", "buffer\u0000\u0001\u0002 150 feet"],
    ["a null-ish word", "null undefined NaN"],
  ];
  for (const [name, text] of ODD) {
    test(`@live ${name}`, async () => {
      try {
        const [v] = await embed([text], "passage");
        expect(v?.length).toBe(EMBED_DIMENSIONS);
        expect(Math.abs(norm(v ?? []) - 1)).toBeLessThan(1e-6);
      } catch (err) {
        // An error is an honest answer. A thrown non-service error, or a vector of the wrong size, is not.
        expect(err).toBeInstanceOf(ModelServiceError);
        expect((err as ModelServiceError).message.length).toBeGreaterThan(10);
      }
    });
  }

  test("@live no texts at all is an error from the service or an empty answer, not a crash", async () => {
    try {
      const out = await embed([], "passage");
      expect(out).toEqual([]);
    } catch (err) {
      expect(err).toBeInstanceOf(ModelServiceError);
    }
  });
});

test.describe("embeddings: retrieval quality over 17 passages", () => {
  async function rank() {
    const passages = await embed(
      CORPUS.map((c) => c.text),
      "passage",
    );
    const out: { name: string; expects: string; rank: number; top: string; topSim: number; gap: number }[] =
      [];
    for (const q of QUERIES) {
      const [v] = await embed([q.query], "query");
      const scored = passages
        .map((p, i) => ({ id: CORPUS[i]?.id ?? "", sim: cosine(v ?? [], p) }))
        .sort((a, b) => b.sim - a.sim);
      const position = scored.findIndex((s) => s.id === q.expects) + 1;
      out.push({
        name: q.name,
        expects: q.expects,
        rank: position,
        top: scored[0]?.id ?? "",
        topSim: scored[0]?.sim ?? 0,
        gap: (scored[0]?.sim ?? 0) - (scored[1]?.sim ?? 0),
      });
    }
    return out;
  }

  test("@live recall@1 is at least 70%, recall@3 at least 90%, and the mean reciprocal rank at least 0.8", async () => {
    const results = await rank();
    const at1 = results.filter((r) => r.rank === 1).length / results.length;
    const at3 = results.filter((r) => r.rank >= 1 && r.rank <= 3).length / results.length;
    const mrr = results.reduce((s, r) => s + (r.rank > 0 ? 1 / r.rank : 0), 0) / results.length;
    const detail = results
      .map((r) => `${r.name}: wanted ${r.expects}, rank ${r.rank}, top ${r.top}`)
      .join("\n");

    test.info().annotations.push({
      type: "retrieval",
      description: `recall@1 ${(at1 * 100).toFixed(0)}%, recall@3 ${(at3 * 100).toFixed(0)}%, MRR ${mrr.toFixed(2)}`,
    });
    expect(at1, `recall@1\n${detail}`).toBeGreaterThanOrEqual(0.7);
    expect(at3, `recall@3\n${detail}`).toBeGreaterThanOrEqual(0.9);
    expect(mrr, `MRR\n${detail}`).toBeGreaterThanOrEqual(0.8);
  });

  for (const q of QUERIES) {
    test(`@live "${q.name}" finds ${q.expects} within the top 3`, async () => {
      const passages = await embed(
        CORPUS.map((c) => c.text),
        "passage",
      );
      const [v] = await embed([q.query], "query");
      const top = passages
        .map((p, i) => ({ id: CORPUS[i]?.id ?? "", sim: cosine(v ?? [], p) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3)
        .map((s) => s.id);
      expect(top, q.query).toContain(q.expects);
    });
  }

  test("@live a question the code does not touch scores below the questions it does answer", async () => {
    const passages = await embed(
      CORPUS.slice(0, 5).map((c) => c.text),
      "passage",
    );
    const best = async (query: string): Promise<number> => {
      const [v] = await embed([query], "query");
      return Math.max(...passages.map((p) => cosine(v ?? [], p)));
    };
    const related = await Promise.all(QUERIES.slice(0, 6).map((q) => best(q.query)));
    const unrelated = await Promise.all(UNRELATED.map(best));

    expect(
      percentile(unrelated, 50),
      `unrelated median ${percentile(unrelated, 50).toFixed(3)} vs related median ${percentile(related, 50).toFixed(3)}`,
    ).toBeLessThan(percentile(related, 50) - 0.05);
    expect(Math.max(...unrelated), "the best unrelated score is below the weakest related one").toBeLessThan(
      Math.min(...related) + 0.02,
    );
  });

  test("@live mixing up the two modes does not help: querying with passage-mode vectors is no better than query mode", async () => {
    const passages = await embed(
      CORPUS.map((c) => c.text),
      "passage",
    );
    const hits = async (mode: "query" | "passage") => {
      let n = 0;
      for (const q of QUERIES.slice(0, 8)) {
        const [v] = await embed([q.query], mode);
        const top = passages
          .map((p, i) => ({ id: CORPUS[i]?.id ?? "", sim: cosine(v ?? [], p) }))
          .sort((a, b) => b.sim - a.sim)[0]?.id;
        if (top === q.expects) n += 1;
      }
      return n;
    };
    expect(await hits("query")).toBeGreaterThanOrEqual(await hits("passage"));
  });
});

test.describe("embeddings: latency", () => {
  test("@live one question: p50 and p95 over twenty calls are inside the retrieval budget", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      await embed([QUERIES[i % QUERIES.length]?.query ?? ""], "query");
      times.push(performance.now() - started);
    }
    test.info().annotations.push({
      type: "latency",
      description: `p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}`,
    });
    expect(percentile(times, 95), `p95 ${seconds(percentile(times, 95))}`).toBeLessThanOrEqual(
      AI_EMBED_LATENCY_P95_MS,
    );
    expect(percentile(times, 50), `p50 ${seconds(percentile(times, 50))}`).toBeLessThanOrEqual(
      AI_EMBED_LATENCY_P95_MS / 2,
    );
  });

  const SIZES = [1, 4, 8, 16, 17, 32];
  test("@live batches of 1 to 32: time grows slower than the number of texts, and every batch succeeds", async () => {
    const timings: { n: number; ms: number }[] = [];
    for (const n of SIZES) {
      const texts = Array.from({ length: n }, (_, i) => CORPUS[i % CORPUS.length]?.text ?? "");
      const started = performance.now();
      const out = await embed(texts, "passage");
      timings.push({ n, ms: performance.now() - started });
      expect(out.length).toBe(n);
    }
    test.info().annotations.push({
      type: "batch-latency",
      description: timings.map((t) => `${t.n}: ${seconds(t.ms)}`).join(", "),
    });
    const one = timings[0]?.ms ?? 0;
    const biggest = timings.at(-1)?.ms ?? 0;
    expect(biggest, `32 texts took ${seconds(biggest)}; one took ${seconds(one)}`).toBeLessThan(one * 32);
    expect(biggest).toBeLessThanOrEqual(AI_EMBED_LATENCY_P95_MS * 3);
  });

  test("@live a long passage (about 8,000 characters) embeds inside the budget", async () => {
    const text = CODE.map((c) => c.text)
      .join(" ")
      .repeat(12)
      .slice(0, 8_000);
    const started = performance.now();
    await embed([text], "passage");
    expect(performance.now() - started).toBeLessThanOrEqual(AI_EMBED_LATENCY_P95_MS * 2);
  });

  test("@live parallel questions: eight at once all succeed and none takes more than three times the budget", async () => {
    const started = performance.now();
    const results = await Promise.allSettled(
      QUERIES.slice(0, 8).map(async (q) => {
        const s = performance.now();
        await embed([q.query], "query");
        return performance.now() - s;
      }),
    );
    const failed = results.filter((r) => r.status === "rejected");
    expect(failed.length, "parallel embeddings failed").toBe(0);
    const times = results.map((r) => (r.status === "fulfilled" ? r.value : 0));
    expect(Math.max(...times), `slowest of eight parallel calls`).toBeLessThanOrEqual(
      AI_EMBED_LATENCY_P95_MS * 3,
    );
    expect(performance.now() - started).toBeLessThanOrEqual(AI_EMBED_LATENCY_P95_MS * 4);
  });
});
