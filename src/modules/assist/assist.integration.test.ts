import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts parses at import, so the key must exist before any module that imports it is loaded.
vi.hoisted(() => {
  process.env.NVIDIA_API_KEY = "test-key";
});

import { getCurrentProfile, ProfileDocumentSchema } from "@/modules/profiles";
import { getWorkflow } from "@/modules/workflow";
import { db } from "@/platform/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/platform/errors";

import { expectDbError } from "../../../tests/support/db-errors";
import { createAnalyzedSampleProject, createPerson, createReadyCity, type City, type Person } from "../../../tests/support/factories";

import { addSourceDocument } from "./documents";
import { PER_PERSON_DAILY_CAP, confirmRuleDraft, listPhaseSuggestions, requestSuggestion } from "./run";
import { ruleValuesOf } from "./rule-changes";

// TechDesign/ai-assist.md, "Verification". Integration tests against the real PostgreSQL (needs Docker; run
// with `npm run test:integration`). The model service is outside UPlan's infrastructure, so `fetch` is the one
// thing replaced: a recorded-shape response for each call. Every other path is real.

type Behaviour =
  | { kind: "answer"; answer: (request: { passages: { id: string; label: string; text: string }[]; ruleValues: { path: string; value: number }[] }) => unknown }
  | { kind: "status"; status: number };

let behaviour: Behaviour;
let chatCalls = 0;

function vectorFor(text: string): number[] {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return Array.from({ length: 2048 }, (_, i) => ((h + i) % 7) + 1);
}

// The request the app sent is the user message's data block; the stub reads it back the way a model would.
function parseSent(body: string) {
  const parsed: unknown = JSON.parse(body);
  const messages = (parsed as { messages: { role: string; content: string }[] }).messages;
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const passages = [...user.matchAll(/\[([^\]]+)\] ([^\n]*)\n([\s\S]*?)(?=\n\n\[|\n<\/data>)/g)].map((m) => ({
    id: m[1] ?? "",
    label: m[2] ?? "",
    text: m[3] ?? "",
  }));
  const ruleValues = [...user.matchAll(/^((?:bufferRules|studyTriggers|treeRules)\.[^ ]+) = ([\d.]+)$/gm)].map((m) => ({
    path: m[1] ?? "",
    value: Number(m[2]),
  }));
  return { passages, ruleValues };
}

beforeEach(() => {
  chatCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body: string }): Promise<Response> => {
      if (url.endsWith("/embeddings")) {
        const input = (JSON.parse(init.body) as { input: string[] }).input;
        return Promise.resolve(Response.json({ data: input.map((t, index) => ({ index, embedding: vectorFor(t) })) }));
      }
      chatCalls += 1;
      if (behaviour.kind === "status") return Promise.resolve(new Response("limit", { status: behaviour.status }));
      const content = JSON.stringify(behaviour.answer(parseSent(init.body)));
      return Promise.resolve(
        Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }),
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

let city: City;
beforeAll(async () => {
  city = await createReadyCity();
});

const explainFromFirstLine: Behaviour = {
  kind: "answer",
  answer: ({ passages }) => {
    const line = passages.find((p) => p.id === "line:0");
    if (!line) throw new Error("the request has no drafted headline");
    return { paragraphs: [{ text: "This restates the headline.", restates: ["line:0"], quotes: [{ sourceId: "line:0", text: line.text.slice(0, 25) }] }] };
  },
};

async function project() {
  const planner = await createPerson();
  const decision = await createAnalyzedSampleProject(planner, city);
  return { planner, decision };
}

describe("F24 R1, R3, R9, R10: a requested suggestion is stored beside the analysis", () => {
  it("R3: an explanation is stored ready, with the model, the request sent, and its quotes", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    const s = await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    expect(s.status).toBe("ready");
    expect(s.modelId).toMatch(/nemotron/);
    expect(s.request?.passages.length).toBeGreaterThan(0);
    expect(s.finishedAt).not.toBeNull();
    expect(chatCalls).toBe(1);
  });

  it("R1: asking changes no phase output, fingerprint, or review state", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    const before = (await getWorkflow(planner.actor, decision.id)).phases.map((p) => [p.phase, p.output?.contentSha256, p.state.kind]);
    await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    const after = (await getWorkflow(planner.actor, decision.id)).phases.map((p) => [p.phase, p.output?.contentSha256, p.state.kind]);
    expect(after).toEqual(before);
  });

  it("R10: a ready suggestion is final, even by SQL", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    const s = await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    await expectDbError(db.execute(sql`update ai_suggestion set content = '{}'::jsonb where id = ${s.id}`), /final and cannot change/);
    await expectDbError(db.execute(sql`delete from ai_suggestion where id = ${s.id}`), /append-only/);
  });

  it("R9: someone else's project is a NotFoundError, and a stranger cannot read its suggestions", async () => {
    behaviour = explainFromFirstLine;
    const { decision } = await project();
    const stranger = await createPerson();
    await expect(
      requestSuggestion(stranger.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null }),
    ).rejects.toThrow(/not found/);
    await expect(listPhaseSuggestions(stranger.actor, decision.id, "evidence")).rejects.toThrow(/not found/);
  });
});

describe("F24 R4–R6, R11: a wrong output or a failed call is shown as such", () => {
  it("R4: an answer whose quote is not in the passage is rejected, kept raw, and shows no content", async () => {
    behaviour = { kind: "answer", answer: () => ({ paragraphs: [{ text: "Fine.", restates: ["line:0"], quotes: [{ sourceId: "line:0", text: "words that are not in the line at all" }] }] }) };
    const { planner, decision } = await project();
    const s = await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    expect(s.status).toBe("rejected");
    expect(s.content).toBeNull();
    expect(s.checkFailures[0]?.check).toBe("K2");
  });

  it("R6: a verdict is rejected", async () => {
    behaviour = { kind: "answer", answer: () => ({ paragraphs: [{ text: "This site should be approved.", restates: ["line:0"], quotes: [] }] }) };
    const { planner, decision } = await project();
    const s = await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    expect(s.status).toBe("rejected");
    expect(s.checkFailures[0]?.check).toBe("K4");
  });

  it("R11: a rate limit is a shown failure, frees the key, and nothing replaces it", async () => {
    behaviour = { kind: "status", status: 429 };
    const { planner, decision } = await project();
    const input = { assistId: "EV1" as const, decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null };
    const failed = await requestSuggestion(planner.actor, input);
    expect(failed.status).toBe("failed");
    expect(failed.errorDetail).toBe("rate-limited");
    expect(failed.content).toBeNull();

    behaviour = explainFromFirstLine;
    const retried = await requestSuggestion(planner.actor, input);
    expect(retried.status).toBe("ready");
    expect(retried.id).not.toBe(failed.id);
  });

  it("R11: an unreachable service is recorded with its reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const { planner, decision } = await project();
    const s = await requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    expect(s.status).toBe("failed");
    expect(s.errorDetail).toMatch(/^unreachable/);
  });

  it("R4: asking about a row the analysis does not contain is refused before any call or row", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    await expect(
      requestSuggestion(planner.actor, { assistId: "SC1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: `row:wetlands:${randomUUID()}`, question: null, documentId: null, datasetId: null, suppliedText: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chatCalls).toBe(0);
    expect(await listPhaseSuggestions(planner.actor, decision.id, "screening")).toEqual([]);
  });
});

describe("F24 R12, R13: caps and double submission", () => {
  it("R13: two identical requests at once make one suggestion and one model call", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    const input = { assistId: "EV1" as const, decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null };
    const [a, b] = await Promise.all([requestSuggestion(planner.actor, input), requestSuggestion(planner.actor, input)]);
    expect(a.id).toBe(b.id);
    expect(chatCalls).toBe(1);
  });

  async function fillCap(person: Person, city: City, used: number) {
    for (let i = 0; i < used; i++) {
      await db.execute(sql`
        insert into ai_suggestion (jurisdiction_id, phase, assist_id, kind, subject_key, output_sha256, model_id, prompt_version, status, error_detail, requested_by, finished_at)
        values (${city.id}, 'evidence', 'EV1', 'explain', ${`cap-${i}-${randomUUID()}`}, 'x', 'm', 1, 'failed', 'test', ${person.userId}, now())`);
    }
  }

  it("R12: a person at the cap is told which cap, and no call is made", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    await fillCap(planner, city, PER_PERSON_DAILY_CAP);
    await expect(
      requestSuggestion(planner.actor, { assistId: "EV1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null }),
    ).rejects.toThrow(new RegExp(`${PER_PERSON_DAILY_CAP} of ${PER_PERSON_DAILY_CAP}`));
    expect(chatCalls).toBe(0);
  });

  it("R12: two different requests at one below the cap cannot both pass it", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    await fillCap(planner, city, PER_PERSON_DAILY_CAP - 1);
    const ask = (assistId: "EV1" | "IM1") =>
      requestSuggestion(planner.actor, { assistId, decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null });
    const results = await Promise.allSettled([ask("EV1"), ask("IM1")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("R13: a running row left by a killed function is marked interrupted and the request is made again", async () => {
    behaviour = explainFromFirstLine;
    const { planner, decision } = await project();
    const impact = (await getWorkflow(planner.actor, decision.id)).phases.find((p) => p.phase === "impact")?.output;
    if (!impact) throw new Error("the sample project has no impact output");
    // The dead function: a running row at the key this request will claim, started ten minutes ago.
    const dead = await db.execute<{ id: string }>(sql`
      insert into ai_suggestion (jurisdiction_id, decision_id, phase, assist_id, kind, subject_key, output_sha256, model_id, prompt_version, status, requested_by, started_at)
      values (${city.id}, ${decision.id}, 'impact', 'IM1', 'explain', '', ${impact.contentSha256}, 'm', 1, 'running', ${planner.userId}, now() - interval '10 minutes')
      returning id`);
    const deadId = dead.rows[0]?.id;
    const again = await requestSuggestion(planner.actor, {
      assistId: "IM1", decisionId: decision.id, jurisdictionId: city.id, subjectKey: "", question: null, documentId: null, datasetId: null, suppliedText: null,
    });
    expect(again.id).not.toBe(deadId);
    expect(again.status).toBe("ready");
    const old = await db.execute<{ status: string; error_detail: string }>(sql`select status, error_detail from ai_suggestion where id = ${deadId}`);
    expect(old.rows[0]).toEqual({ status: "failed", error_detail: "interrupted" });
  });
});

describe("F24 R7: a rule draft takes effect only when another staff member confirms it", () => {
  async function draftFor(requester: Person) {
    const doc = await addSourceDocument(requester.actor, city.id, {
      kind: "code",
      title: "Sammamish Municipal Code 21A.50 (test text)",
      text: `21A.50.290 Wetland buffers.\nThe standard buffer for wetlands is 175 feet.\n\n${randomUUID()}`,
    });
    const profile = await getCurrentProfile(city.id);
    if (!profile) throw new Error("the city has no profile");
    const rules = ruleValuesOf(ProfileDocumentSchema.parse(profile.document));
    const target = rules.find((r) => r.path.startsWith("bufferRules.") && r.value !== 175);
    if (!target) throw new Error("the sample profile has no buffer rule to draft against");
    behaviour = {
      kind: "answer",
      answer: ({ passages }) => {
        const p = passages.find((x) => x.text.includes("175 feet"));
        if (!p) throw new Error("the retrieved passages do not include the document");
        return { changes: [{ path: target.path, from: target.value, to: 175, sectionPath: p.label, quote: { sourceId: p.id, text: "The standard buffer for wetlands is 175 feet." } }] };
      },
    };
    const s = await requestSuggestion(requester.actor, {
      assistId: "PR1", decisionId: null, jurisdictionId: city.id, subjectKey: "", question: null, documentId: doc.id, datasetId: null, suppliedText: null,
    });
    return { s, target };
  }

  it("R7: the requester cannot confirm their own draft, and another staff member can, once", async () => {
    const requester = await createPerson({ staff: true });
    const { s } = await draftFor(requester);
    expect(s.status).toBe("ready");
    const input = { acceptedPaths: s.content && "changes" in s.content ? s.content.changes.map((c) => c.path) : [], effectiveOn: "2035-01-01", ordinance: "Ordinance O2035-1" };

    await expect(confirmRuleDraft(requester.actor, s.id, input)).rejects.toBeInstanceOf(ForbiddenError);

    const confirmer = await createPerson({ staff: true });
    const applied = await confirmRuleDraft(confirmer.actor, s.id, input);
    expect(applied.versionNumber).toBeGreaterThan(1);

    const rows = await db.execute<{ source: string; proposed_by: string; decided_by: string }>(
      sql`select c.source, c.proposed_by, c.decided_by from profile_change c join ai_suggestion_response r on r.profile_change_id = c.id where r.suggestion_id = ${s.id}`,
    );
    expect(rows.rows[0]).toEqual({ source: "code_change", proposed_by: requester.userId, decided_by: confirmer.userId });

    await expect(confirmRuleDraft(confirmer.actor, s.id, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("R7: two staff confirming the same draft at once: exactly one succeeds", async () => {
    const requester = await createPerson({ staff: true });
    const { s } = await draftFor(requester);
    const input = { acceptedPaths: s.content && "changes" in s.content ? s.content.changes.map((c) => c.path) : [], effectiveOn: "2036-01-01", ordinance: "Ordinance O2036-1" };
    const a = await createPerson({ staff: true });
    const b = await createPerson({ staff: true });
    const results = await Promise.allSettled([confirmRuleDraft(a.actor, s.id, input), confirmRuleDraft(b.actor, s.id, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("R7: a planner who is not staff cannot request a rule draft", async () => {
    behaviour = explainFromFirstLine;
    const planner = await createPerson();
    await expect(
      requestSuggestion(planner.actor, { assistId: "PR1", decisionId: null, jurisdictionId: city.id, subjectKey: "", question: null, documentId: randomUUID(), datasetId: null, suppliedText: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
