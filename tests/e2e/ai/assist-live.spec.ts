import "../support/placeholder-env";

import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { z } from "zod";

import { normalizeForQuote, verdictWordIn } from "../../../src/modules/assist/checks";
import { digitRuns } from "../../../src/modules/assist/request";
import { GENERATE_MODEL_ID } from "../../../src/platform/model-client";
import {
  createSampleProject,
  deleteProject,
  goToStep,
  stageLink,
  waitForAnalysisToSettle,
} from "../support/app";
import {
  AI_LATENCY_HARD_MAX_MS,
  AI_LATENCY_P50_MS,
  AI_LATENCY_P95_MS,
  AUTH_FILE,
  BASE_URL,
} from "../support/env";
import { seconds, summarize } from "../support/stats";

// AI assist in the app, asked for real (TechDesign/ai-assist.md, F24 R3-R7, R10-R15). Each test presses Ask on a
// sample-data project (fictional, so nothing real is sent), then holds the card on screen to the promises the product
// makes about it. It needs the worker, the model key on the SERVER, and the seeded city. Tagged @live: it spends the
// free allowance (40 requests a person a day), about ten per run.
//
// The tests assert what must be true of ANY answer: that the card is labelled, that every quote is in what was sent,
// that every figure was sent, that nothing was sent that identifies the project, that the phase's own output did not
// move. Whether the model gives a GOOD answer is the model-eval spec's question. A rejected or failed answer is not a
// test failure here: the card has to say so honestly. But the share of asks that end in a shown answer, and how long
// each ask takes, are held to a budget in the last test.

const test = base;
test.describe.configure({ mode: "serial", timeout: 6 * 60_000 });

const SENT_SCHEMA = z.object({
  assistId: z.string(),
  kind: z.string(),
  promptVersion: z.number(),
  task: z.string(),
  question: z.string().nullable(),
  passages: z.array(z.object({ id: z.string(), label: z.string(), text: z.string() })),
  refs: z.array(z.object({ id: z.string(), kind: z.string() })),
  ruleValues: z.array(z.object({ path: z.string(), value: z.number() })),
});
type Sent = z.infer<typeof SENT_SCHEMA>;

type Card = {
  title: string;
  status: "Suggestion" | "Rejected by checks" | "Did not finish" | "Running";
  stamp: string;
  problems: string[];
  blocks: {
    heading: string | null;
    text: string;
    note: string | null;
    quotes: { text: string; source: string }[];
  }[];
  sent: Sent;
};

const STORE = join("test-results", "assist-live");
const ASKS_FILE = join(STORE, "asks.jsonl");
const AskSchema = z.object({ assist: z.string(), status: z.string(), latencyMs: z.number() });

let page: Page;
let projectId = "";
let projectTitle = "";
let identifying: string[] = []; // everything about the project that must never be sent

// ---------------------------------------------------------------------------------------------------------------

const panelOf = (phase: string): Locator => page.locator(`#assist-${phase}`);

async function openPanel(phase: string): Promise<Locator> {
  const panel = panelOf(phase);
  if (!(await panel.evaluate((el: HTMLDetailsElement) => el.open)))
    await panel.locator("summary").first().click();
  return panel;
}

function controlOf(panel: Locator, label: string): Locator {
  return panel
    .locator("li")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.locator("form") })
    .last();
}

async function readCard(card: Locator): Promise<Card> {
  const status = (await card.locator("header span.rounded-full").last().innerText()).trim();
  const sentText = await card.locator("details pre").textContent();
  if (sentText === null)
    throw new Error("A suggestion shows no record of what was sent to the model service.");
  const blocks = await card.locator("ol > li").evaluateAll((items) =>
    items.map((item) => ({
      heading: item.querySelector("p.font-semibold")?.textContent ?? null,
      text: [...item.querySelectorAll(":scope > p:not(.font-semibold):not(.text-xs)")]
        .map((p) => p.textContent ?? "")
        .join(" "),
      note: item.querySelector(":scope > p.text-xs")?.textContent ?? null,
      quotes: [...item.querySelectorAll("blockquote")].map((q) => ({
        text: (q.querySelector("p")?.textContent ?? "").replace(/^[“"]|[”"]$/g, ""),
        source: (q.querySelector("footer")?.textContent ?? "").replace(/^From:\s*/, ""),
      })),
    })),
  );
  return {
    title: (await card.locator("h3").first().innerText()).trim(),
    status: status as Card["status"],
    stamp: (
      await card
        .getByText(/^AI-assisted/)
        .first()
        .innerText()
    ).trim(),
    problems: await card.locator("ul.list-disc > li").allInnerTexts(),
    blocks,
    sent: SENT_SCHEMA.parse(JSON.parse(sentText)),
  };
}

/** Presses Ask on a control and waits for the card, or for the plain error the panel shows instead. */
async function ask(
  phase: string,
  label: string,
  opts: { subject?: number; question?: string } = {},
): Promise<{ card: Locator | null; error: string | null; latencyMs: number }> {
  const panel = await openPanel(phase);
  const control = controlOf(panel, label);
  await expect(control, `no "${label}" control on ${phase}`).toBeVisible();
  if (opts.subject !== undefined)
    await control.locator("select").first().selectOption({ index: opts.subject });
  if (opts.question !== undefined) await control.getByLabel("Your question").fill(opts.question);

  const cards = panel.locator("article");
  const before = await cards.count();
  const started = performance.now();
  await control.getByRole("button", { name: "Ask" }).click();

  const arrived = cards.nth(before);
  const failed = control.getByRole("alert");
  await expect(arrived.or(failed)).toBeVisible({ timeout: AI_LATENCY_HARD_MAX_MS + 15_000 });
  const latencyMs = performance.now() - started;
  if (await failed.isVisible()) return { card: null, error: (await failed.innerText()).trim(), latencyMs };
  return { card: arrived, error: null, latencyMs };
}

function record(assist: string, status: string, latencyMs: number): void {
  appendFileSync(ASKS_FILE, `${JSON.stringify({ assist, status, latencyMs })}\n`);
}

/** What a phase page says about itself, which no suggestion may change. */
async function snapshot(phase: string) {
  return {
    fingerprint: await page.locator('input[name="expectedContentSha256"]').inputValue(),
    drafted: await page
      .locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) })
      .innerText(),
    reviewState: await stageLink(page, phase[0]?.toUpperCase() + phase.slice(1)).innerText(),
  };
}

/** Everything a card promises, whatever the answer. Returns the card so a test can say more. */
async function expectHonestCard(locator: Locator, assistLabel: string): Promise<Card> {
  const card = await readCard(locator);

  expect(card.title.length, "a card has a title").toBeGreaterThan(0);
  expect(
    ["Suggestion", "Rejected by checks", "Did not finish"],
    `unexpected card status "${card.status}"`,
  ).toContain(card.status);
  expect(
    card.stamp,
    "every suggestion carries its label, its model, its date, and that it is not part of the analysis",
  ).toMatch(
    new RegExp(
      `^AI-assisted · ${GENERATE_MODEL_ID.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} · .+ · not part of the analysis$`,
    ),
  );
  await expect(locator.getByRole("button", { name: "Helpful" })).toBeVisible();
  await expect(locator.getByRole("button", { name: "Not helpful" })).toBeVisible();
  await expect(locator.getByRole("button", { name: "Dismiss" })).toBeVisible();

  // Privacy: what was sent is exactly the allow-listed shape, and holds nothing that identifies the project.
  expect(Object.keys(card.sent).sort()).toEqual([
    "assistId",
    "kind",
    "passages",
    "promptVersion",
    "question",
    "refs",
    "ruleValues",
    "task",
  ]);
  const sentText = JSON.stringify(card.sent);
  for (const secret of identifying)
    expect(sentText, `the request sent to the model service contains "${secret}"`).not.toContain(secret);
  expect(sentText, "a coordinate was sent").not.toMatch(/-?1[12]\d\.\d{3,}|\b4[67]\.\d{3,}/);
  expect(sentText, "a UUID was sent").not.toMatch(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/,
  );
  expect(sentText, "an email address was sent").not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);

  if (card.status === "Rejected by checks") {
    // Check, never repair: none of a rejected answer is shown as an answer, and the reason is.
    expect(card.blocks, "a rejected answer must show none of its text as an answer").toEqual([]);
    expect(card.problems[0]).toBe("This answer failed UPlan's checks, so none of it is shown as an answer.");
    expect(card.problems.length).toBeGreaterThan(1);
  } else if (card.status === "Did not finish") {
    expect(card.blocks).toEqual([]);
    expect(card.problems[0]).toMatch(
      /^(The model service did not answer \(.+\)\. Try again\.|The free model service is at its limit\. Try again later\.)$/,
    );
  } else {
    expect(card.blocks.length, `${assistLabel} showed an empty suggestion`).toBeGreaterThan(0);
    const passageByLabel = new Map(card.sent.passages.map((p) => [p.label, p.text]));
    const sentNumbers = new Set(
      [
        ...card.sent.passages.flatMap((p) => [p.text, p.label]),
        card.sent.question ?? "",
        ...card.sent.ruleValues.flatMap((v) => [v.path, String(v.value)]),
      ].flatMap(digitRuns),
    );
    for (const block of card.blocks) {
      // K2, re-checked on what is on screen: each quote is, word for word, in the passage it says it came from.
      for (const quote of block.quotes) {
        const source = passageByLabel.get(quote.source);
        expect(source, `a quote cites "${quote.source}", which was not sent`).toBeDefined();
        expect(
          normalizeForQuote(source ?? ""),
          `quote not found in ${quote.source}: "${quote.text}"`,
        ).toContain(normalizeForQuote(quote.text));
      }
      // K3 and K4, re-checked on the model's own words (quotes are the city's, so they are exempt).
      const prose = [block.heading ?? "", block.text].join(" ");
      for (const run of digitRuns(prose))
        expect(sentNumbers.has(run), `the number ${run} was not sent`).toBe(true);
      expect(verdictWordIn(prose), `"${prose}" carries a verdict`).toBeNull();
    }
  }
  return card;
}

// ---------------------------------------------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  rmSync(STORE, { recursive: true, force: true });
  mkdirSync(STORE, { recursive: true });
  writeFileSync(ASKS_FILE, "");

  page = await (await browser.newContext({ baseURL: BASE_URL, storageState: AUTH_FILE })).newPage();
  const project = await createSampleProject(page);
  projectId = project.id;
  projectTitle = project.title;
  await waitForAnalysisToSettle(page);

  // Everything recorded about the project that must never leave UPlan: read from its Overview as a planner sees it.
  await page.goto(`/projects/${projectId}/overview`);
  const glance = page.locator("section", { has: page.getByRole("heading", { name: "Project at a glance" }) });
  const values = await glance.locator("dd").allInnerTexts();
  identifying = [
    projectTitle,
    ...values
      .map((v) => v.trim())
      .filter(
        (v) =>
          v.length > 5 &&
          v !== "Not yet recorded" &&
          !/^(Subdivision|Short subdivision|Clearing and grading)$/.test(v),
      ),
  ];
});

test.afterAll(async () => {
  if (projectTitle !== "") await deleteProject(page, projectTitle);
  await page.context().close();
});

test.describe("Evidence", () => {
  test("@live F24 EV1: Explain this evidence returns a labelled, truthful card, once, without moving the phase", async () => {
    await goToStep(page, "evidence");
    const before = await snapshot("evidence");

    const panel = await openPanel("evidence");
    const control = controlOf(panel, "Explain this evidence");
    await expect(control).toBeVisible();
    const cards = panel.locator("article");
    const count = await cards.count();
    const started = performance.now();
    // A double press must make one request: the button disables itself while the first is in flight (F24 R10).
    await control.getByRole("button", { name: "Ask" }).dblclick();
    await expect(cards.nth(count)).toBeVisible({ timeout: AI_LATENCY_HARD_MAX_MS + 15_000 });
    const latencyMs = performance.now() - started;

    const card = await expectHonestCard(cards.nth(count), "Explain this evidence");
    record("EV1", card.status, latencyMs);
    await expect(cards, "pressing Ask twice made one suggestion").toHaveCount(count + 1);
    expect(card.title).toBe("Explain this evidence");

    // The figures a planner reads in the card are figures the drafted output already states on this page.
    if (card.status === "Suggestion") {
      const drafted = await page
        .locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) })
        .evaluate((el) => el.textContent ?? "");
      const pageNumbers = new Set(digitRuns(drafted));
      for (const run of digitRuns(card.blocks.map((b) => b.text).join(" "))) {
        expect(pageNumbers.has(run), `the card states ${run}, which the drafted output never does`).toBe(
          true,
        );
      }
    }

    // F24 R2: the phase's output, its fingerprint, and its review state are exactly as they were.
    expect(await snapshot("evidence")).toEqual(before);
    await expect(stageLink(page, "Evidence")).toContainText("Needs review");
  });

  test("@live F24 R13: a suggestion is kept as it was: reloading the page shows the same card, not a new answer", async () => {
    await goToStep(page, "evidence");
    const panel = await openPanel("evidence");
    const first = await panel.locator("article").first().innerText();

    await page.reload();
    const again = await (await openPanel("evidence")).locator("article").first().innerText();

    expect(again).toBe(first);
  });

  test("@live F24 R14: marking a suggestion helpful records who and when, keeps the note, and survives a reload", async () => {
    await goToStep(page, "evidence");
    const panel = await openPanel("evidence");
    const card = panel.locator("article").first();

    await card.getByLabel("Note (optional)").fill("Clear enough for a colleague.");
    await card.getByRole("button", { name: "Helpful" }).click();
    await expect(card.getByRole("status").filter({ hasText: "Your response was recorded." })).toBeVisible();

    await page.reload();
    const reloaded = (await openPanel("evidence")).locator("article").first();
    await expect(reloaded).toContainText(/Marked helpful · .+ · Clear enough for a colleague\./);
  });
});

test.describe("Screening", () => {
  test("@live F24 SC2: What might this screen miss? asks questions about information, each tied to a gap or limit it came from", async () => {
    await goToStep(page, "screening");
    const { card, error, latencyMs } = await ask("screening", "What might this screen miss?");
    expect(error, "assist is not set up on the server, or the ask failed before a card").toBeNull();
    if (!card) return;
    const parsed = await expectHonestCard(card, "What might this screen miss?");
    record("SC2", parsed.status, latencyMs);

    if (parsed.status === "Suggestion") {
      for (const block of parsed.blocks) {
        expect(block.text.trim(), "a question ends in a question mark").toMatch(/\?$/);
        expect(block.note ?? "", "every question says where it comes from").toMatch(/^Comes from: .+/);
      }
    }
    await expect(stageLink(page, "Screening")).toContainText("Needs review");
  });

  test("@live F24 SC1: Explain a row quotes the rule and never calls the row a concern", async () => {
    await goToStep(page, "screening");
    const { card, error, latencyMs } = await ask("screening", "Explain", { subject: 0 });
    expect(error).toBeNull();
    if (!card) return;
    const parsed = await expectHonestCard(card, "Explain");
    record("SC1", parsed.status, latencyMs);

    if (parsed.status === "Suggestion") {
      const prose = parsed.blocks.map((b) => b.text).join(" ");
      expect(prose).not.toMatch(/\b(is|are) (a|not a) concern\b/i);
      expect(parsed.title).toBe("Explain a screening row");
    }
  });

  test("@live F24 SC3: Where does the code say this? either quotes the code or says, plainly, that no code text has been added", async () => {
    await goToStep(page, "screening");
    const { card, error, latencyMs } = await ask("screening", "Where does the code say this?", {
      subject: 0,
    });

    if (error !== null) {
      // No code text indexed for this city: refused before anything was sent, and said so in words (F24 R8, R11).
      expect(error).toBe("No code text has been added for this city yet. Staff add it on the profile page.");
      return;
    }
    if (!card) throw new Error("neither a card nor an error appeared");
    const parsed = await expectHonestCard(card, "Where does the code say this?");
    record("SC3", parsed.status, latencyMs);
    if (parsed.status === "Suggestion") {
      const first = parsed.blocks[0];
      expect(
        first?.quotes.length ?? 0,
        "an answer is a quote or an honest 'no passage answers this'",
      ).toBeGreaterThan(0);
    }
  });
});

test.describe("Studies and Impact", () => {
  test("@live F24 ST2: Questions for the conference asks what information would show, never what an applicant must do", async () => {
    await goToStep(page, "studies");
    const { card, error, latencyMs } = await ask("studies", "Questions for the conference");
    expect(error).toBeNull();
    if (!card) return;
    const parsed = await expectHonestCard(card, "Questions for the conference");
    record("ST2", parsed.status, latencyMs);

    if (parsed.status === "Suggestion") {
      for (const block of parsed.blocks)
        expect(block.text).not.toMatch(/\b(must|required?|shall|ensure|submit)\b/i);
    }
  });

  test("@live F24 IM1: Explain this impact copies every figure, and the phase's output and review do not move", async () => {
    await goToStep(page, "impact");
    const before = await snapshot("impact");
    const { card, error, latencyMs } = await ask("impact", "Explain this impact");
    expect(error).toBeNull();
    if (!card) return;
    const parsed = await expectHonestCard(card, "Explain this impact");
    record("IM1", parsed.status, latencyMs);

    if (parsed.status === "Suggestion") {
      const prose = parsed.blocks.map((b) => b.text).join(" ");
      expect(prose).not.toMatch(
        /\b(large|small|minor|major|severe|significant impact|acceptable|unacceptable)\b/i,
      );
      // Both ends of any range appear when the range does: a '0.42 to 1.17' on the page is '0.42' and '1.17' here.
      const drafted = await page
        .locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) })
        .evaluate((el) => el.textContent ?? "");
      const ranges = [...drafted.matchAll(/(\d[\d,.]*)\s*(?:to|and|–|-)\s*(\d[\d,.]*)/g)].map(
        (m) => [m[1], m[2]] as const,
      );
      for (const [low, high] of ranges.slice(0, 2)) {
        if (prose.includes(low ?? "") || prose.includes(high ?? "")) {
          expect(prose, `only one end of the range ${low}-${high} was given`).toContain(low ?? "");
          expect(prose).toContain(high ?? "");
        }
      }
    }
    expect(await snapshot("impact")).toEqual(before);
  });

  test("@live F24 IM2: What would narrow this range? either asks about the field-rated fact or says there is no range to ask about", async () => {
    await goToStep(page, "impact");
    const panel = await openPanel("impact");
    const control = controlOf(panel, "What would narrow this range?");
    await expect(control).toBeVisible();

    if ((await control.getByRole("button", { name: "Ask" }).count()) === 0) {
      await expect(control).toContainText("No impact in this analysis is a range.");
      return;
    }
    const { card, error, latencyMs } = await ask("impact", "What would narrow this range?", { subject: 0 });
    expect(error).toBeNull();
    if (!card) return;
    const parsed = await expectHonestCard(card, "What would narrow this range?");
    record("IM2", parsed.status, latencyMs);
    if (parsed.status === "Suggestion") {
      for (const block of parsed.blocks) expect(block.text).not.toMatch(/\b(likely|probably|assum\w+)\b/i);
    }
  });
});

test.describe("the city profile", () => {
  test("@live F24 PR2: Find in the code refuses without code text, and with it returns a quote or an honest 'none answers'", async () => {
    await page.goto("/profile");
    const panel = page.locator("#assist-profile");
    await panel.locator("summary").first().click();
    const control = controlOf(panel, "Find in the code");
    await expect(control).toBeVisible();

    if ((await control.getByRole("button", { name: "Ask" }).count()) === 0) {
      await expect(control).toContainText(
        "Staff have not added any code text yet. Add it below, and AI assist can quote it.",
      );
      return;
    }
    const question = "What is the standard buffer for a Category II wetland?";
    const before = await panel.locator("article").count();
    const started = performance.now();
    await control.getByLabel("Your question").fill(question);
    await control.getByRole("button", { name: "Ask" }).click();
    const arrived = panel.locator("article").nth(before);
    await expect(arrived).toBeVisible({ timeout: AI_LATENCY_HARD_MAX_MS + 15_000 });
    record("PR2", (await readCard(arrived)).status, performance.now() - started);

    const parsed = await expectHonestCard(arrived, "Find in the code");
    // The question is the one thing a planner types that leaves UPlan, and it is shown as sent.
    expect(parsed.sent.question).toBe(question);
  });
});

test.describe("a suggestion goes stale when its phase moves", () => {
  test("@live F24 R13: after the study area changes, the old Evidence suggestion says it is out of date and is kept, not rewritten", async () => {
    await goToStep(page, "evidence");
    const panel = await openPanel("evidence");
    const before = await panel.locator("article").first().innerText();

    await goToStep(page, "site");
    await page.getByRole("button", { name: "Load sample study area" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
    await waitForAnalysisToSettle(page);

    await goToStep(page, "evidence");
    const card = (await openPanel("evidence")).locator("article").first();
    await expect(card).toContainText("Out of date.");
    await expect(card).toContainText("The phase's output changed after this was made.");
    await expect(card).toContainText("Ask again to get a suggestion for what is on the page now.");
    // The words of the old answer are untouched; only the warning was added.
    expect((await card.innerText()).replace(/Out of date\.[\s\S]*?now\.\s*/, "")).toBe(before);
  });
});

test.describe("across every ask", () => {
  test("@live latency and yield: asks finish inside the budget, and most end in a shown answer", async () => {
    const testInfo = test.info();
    const asks = readFileSync(ASKS_FILE, "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => AskSchema.parse(JSON.parse(l)));
    expect(asks.length, "no ask completed, so there is nothing to measure").toBeGreaterThan(0);

    const latency = summarize(asks.map((a) => a.latencyMs));
    const shown = asks.filter((a) => a.status === "Suggestion").length;
    const overhead = 5_000; // the page refresh and render around the model call
    await testInfo.attach("assist-live-report.json", {
      body: JSON.stringify({ model: GENERATE_MODEL_ID, asks, latency, shown }, null, 2),
      contentType: "application/json",
    });
    testInfo.annotations.push({
      type: "assist-live",
      description: `${shown}/${asks.length} shown; p50 ${seconds(latency.p50Ms)}, p95 ${seconds(latency.p95Ms)}, max ${seconds(latency.maxMs)}`,
    });

    expect(latency.maxMs, `slowest ask took ${seconds(latency.maxMs)}`).toBeLessThanOrEqual(
      AI_LATENCY_HARD_MAX_MS + 10_000,
    );
    expect(latency.p50Ms, `median ask ${seconds(latency.p50Ms)}`).toBeLessThanOrEqual(
      AI_LATENCY_P50_MS + overhead,
    );
    expect(latency.p95Ms, `p95 ask ${seconds(latency.p95Ms)}`).toBeLessThanOrEqual(
      AI_LATENCY_P95_MS + overhead,
    );
    expect(
      shown / asks.length,
      `${shown} of ${asks.length} asks ended in a shown answer; the rest were rejected by the checks or did not finish`,
    ).toBeGreaterThanOrEqual(2 / 3);
  });

  test("@live F24 R2: after all of it, no phase's output or review moved because of a suggestion", async () => {
    await page.goto(`/projects/${projectId}/overview`);
    for (const name of ["Site", "Evidence", "Screening", "Studies", "Footprint", "Impact"]) {
      await expect(stageLink(page, name)).toContainText("Needs review");
    }
    await expect(stageLink(page, "Report")).toContainText("Not ready");
    await expect(
      page.getByRole("status").filter({ hasText: /Analysis is (running|out of date)/ }),
    ).toHaveCount(0);
  });

  test("@live F24 R2: the Report step knows nothing of any suggestion", async () => {
    await page.goto(`/projects/${projectId}/report`);
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/AI-assisted|suggestion|model service/i);
  });
});
