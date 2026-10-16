import type { Page, Response } from "@playwright/test";

import { PHASE_TITLE, STAGES, expectNoAxeViolations, goToStep } from "../support/app";
import { expect, test } from "../support/fixtures";

// AI assist in the app, without asking the model anything (TechDesign/ai-assist.md, F24 R3, R9, R10, R15, R18). These
// are the promises about WHERE assist appears and WHAT it never does on its own: it is on four analysis phases and
// nowhere else, it says it is not part of the analysis, it runs only when a person presses Ask, and no page, script, or
// stored string carries the model key. The behavior of an answer is in assist-live.spec.ts.
//
// Uses the shared, analysed sample project (read-only here). Needs the worker.

const NOT_ANALYSIS =
  "AI-assisted text reads and quotes the sources shown. It is not part of the analysis, the phase's output or fingerprint, your review, or the final document.";
const NOT_CONFIGURED = "AI assist is not set up for this deployment.";

/** Every control a planner can use on each phase, as the panel labels it (src/modules/assist/kinds.ts, non-staff). */
const CONTROLS = {
  evidence: ["Explain this evidence", "Why might these differ?"],
  screening: ["Explain", "What might this screen miss?", "Where does the code say this?"],
  studies: ["Why is this study listed?", "Questions for the conference"],
  impact: ["Explain this impact", "What would narrow this range?", "Where does the code set this width?"],
} as const;
type AssistPhase = keyof typeof CONTROLS;
const ASSIST_PHASES = Object.keys(CONTROLS) as AssistPhase[];

const panelOf = (page: Page, phase: AssistPhase) => page.locator(`#assist-${phase}`);

async function openPanel(page: Page, phase: AssistPhase) {
  const panel = panelOf(page, phase);
  await panel.locator("summary").first().click();
  await expect(panel).toHaveJSProperty("open", true);
  return panel;
}

test.describe("where assist appears", () => {
  for (const phase of ASSIST_PHASES) {
    test(`F24 R18: ${PHASE_TITLE[phase]} has one assist panel, optional, beside the drafted output`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);

      const panel = panelOf(page, phase);
      await expect(panel).toHaveCount(1);
      await expect(panel.locator("summary")).toContainText("AI assist (optional)");
      await expect(panel.locator("summary")).toContainText(
        "Reads and quotes the text on this page. Asked for, never automatic, and never part of the analysis.",
      );
      // It sits after the drafted output and before the planner's review (F24 R18).
      const inOrder = await page.evaluate((id) => {
        const heading = (text: string) =>
          [...document.querySelectorAll("h2")].find((h) => h.textContent === text);
        const drafted = heading("Drafted output");
        const review = heading("Your review");
        const assist = document.getElementById(id);
        if (!drafted || !review || !assist) return false;
        const after = (a: Node, b: Node) =>
          (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        return after(drafted, assist) && after(assist, review);
      }, `assist-${phase}`);
      expect(inOrder, "the assist panel is between the drafted output and the review").toBe(true);
    });
  }
  for (const step of ["overview", "site", "footprint", "report"] as const) {
    test(`F24 R18: ${STAGES.find((s) => s.step === step)?.title} has no assist panel and no AI-assisted text`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${step}`);

      await expect(page.getByText("AI assist (optional)")).toHaveCount(0);
      await expect(page.getByText(/AI-assisted/)).toHaveCount(0);
      await expect(page.locator('[id^="assist-"]')).toHaveCount(0);
    });
  }

  test("F24: a planner can use every phase without assist: the review and the drafted output are there either way", async ({
    page,
    sharedSampleProject,
  }) => {
    for (const phase of ASSIST_PHASES) {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);
      await expect(page.getByRole("heading", { name: "Drafted output" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Record review" })).toBeVisible();
    }
  });
});

test.describe("what the panel says before anything is asked", () => {
  for (const phase of ASSIST_PHASES) {
    test(`F24 R3, R15: ${PHASE_TITLE[phase]} states that assist is not part of the analysis, and offers exactly its controls or says it is off`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);
      const panel = await openPanel(page, phase);

      await expect(panel).toContainText(NOT_ANALYSIS);
      const off = panel.getByRole("status").filter({ hasText: NOT_CONFIGURED });
      if ((await off.count()) > 0) {
        // Not set up: say so, offer nothing to press, and promise the phase still works (F24 R9, R11).
        await expect(off).toContainText("This phase works fully without it.");
        await expect(panel.getByRole("button", { name: "Ask" })).toHaveCount(0);
        return;
      }
      for (const label of CONTROLS[phase])
        await expect(panel.getByText(label, { exact: true })).toBeVisible();
    });
  }

  test("F24 R10: nothing has been asked on a fresh project, so no suggestion is on any phase", async ({
    page,
    sharedSampleProject,
  }) => {
    for (const phase of ASSIST_PHASES) {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);
      await openPanel(page, phase);
      await expect(page.getByRole("heading", { name: "Suggestions" })).toHaveCount(0);
      await expect(page.locator("article", { hasText: "AI-assisted" })).toHaveCount(0);
    }
  });

  test("F24 R10: loading, reloading, and moving between phases never asks the model for anything", async ({
    page,
    sharedSampleProject,
  }) => {
    const modelCalls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) modelCalls.push(request.url());
    });

    for (const phase of ASSIST_PHASES) {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);
      await page.reload();
    }
    await goToStep(page, "evidence");

    expect(modelCalls, "no Server Function ran, so nothing could have asked the model").toEqual([]);
  });

  test("F24 R11: the Ask button is the only way to ask, and it is a real button inside a form", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);
    const panel = await openPanel(page, "evidence");
    const asks = panel.getByRole("button", { name: "Ask" });

    for (const ask of await asks.all()) {
      await expect(ask).toHaveAttribute("type", "submit");
      expect(await ask.evaluate((el) => el.closest("form") !== null)).toBe(true);
    }
  });

  test("F24: every control tells the planner what it will and will not do", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/screening`);
    const panel = await openPanel(page, "screening");

    if ((await panel.getByRole("button", { name: "Ask" }).count()) > 0) {
      await expect(panel).toContainText("It never says a row is or is not a concern.");
      await expect(panel).toContainText("Questions only.");
    }
  });
});

test.describe("assist never reaches the analysis or the document", () => {
  test("F24 R2: the drafted output, the review state, and the fingerprint do not depend on whether assist is open", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/impact`);
    const fingerprint = () => page.locator('input[name="expectedContentSha256"]').inputValue();
    const drafted = () =>
      page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) }).innerText();
    const before = { fingerprint: await fingerprint(), drafted: await drafted() };

    await openPanel(page, "impact");
    const after = { fingerprint: await fingerprint(), drafted: await drafted() };

    expect(after).toEqual(before);
  });

  test("F24 R2: the Report step and the version history mention no suggestion", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/report`);
    const text = await page.locator("main").innerText();

    expect(text).not.toMatch(/AI-assisted|AI assist|suggestion|model service/i);
  });
});

test.describe("the model key stays on the server", () => {
  test("do-not: no page, script, or API answer the browser receives contains a model key", async ({
    page,
    sharedSampleProject,
  }) => {
    const leaks: string[] = [];
    const scan = async (response: Response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!/html|javascript|json|text/.test(type)) return;
      const body = await response.text().catch(() => "");
      if (/nvapi-[A-Za-z0-9_-]{20,}/.test(body) || body.includes("NVIDIA_API_KEY"))
        leaks.push(response.url());
    };
    page.on("response", (response) => void scan(response));

    for (const phase of ASSIST_PHASES) {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);
      await openPanel(page, phase);
    }
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    expect(leaks, "a response carried the model key or its variable name").toEqual([]);
  });
});

test.describe("the city profile's assist panel", () => {
  test("F24 PR2: the profile page has an assist panel for the city's rules, with Find in the code for anyone signed in", async ({
    page,
  }) => {
    await page.goto("/profile");

    const panel = page.locator("#assist-profile");
    await expect(panel.locator("summary")).toContainText("AI assist for the city's rules (optional)");
    await panel.locator("summary").first().click();
    await expect(panel).toContainText(NOT_ANALYSIS);
    if ((await panel.getByRole("status").filter({ hasText: NOT_CONFIGURED }).count()) === 0) {
      await expect(panel.getByText("Find in the code", { exact: true })).toBeVisible();
    }
  });

  test("F24 PR2: with no code text added, Find says so and offers no Ask; with some, it asks for a question", async ({
    page,
  }) => {
    await page.goto("/profile");
    const panel = page.locator("#assist-profile");
    await panel.locator("summary").first().click();
    if ((await panel.getByRole("status").filter({ hasText: NOT_CONFIGURED }).count()) > 0) {
      await expect(panel.getByRole("button", { name: "Ask" })).toHaveCount(0);
      return;
    }

    const noText = panel.getByText(
      "Staff have not added any code text yet. Add it below, and AI assist can quote it.",
    );
    if ((await noText.count()) > 0) {
      await expect(panel.getByRole("button", { name: "Ask" })).toHaveCount(0);
    } else {
      await expect(panel.getByLabel("Your question")).toHaveJSProperty("required", true);
      await expect(panel.getByLabel("Your question")).toHaveAttribute("maxlength", "300");
    }
  });

  test("R12: the assist panels, opened, have no WCAG 2.1 A or AA violations", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);
    await openPanel(page, "evidence");
    await expectNoAxeViolations(page);

    await page.goto("/profile");
    await page.locator("#assist-profile summary").first().click();
    await expectNoAxeViolations(page);
  });
});
