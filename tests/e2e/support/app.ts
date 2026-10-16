import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

import { ANALYSIS_TIMEOUT_MS, credentials } from "./env";

// Everything the specs share about driving UPlan's screens. Selectors are the accessible names the pages
// render (roles, labels, headings), so a spec reads the way a planner would describe the screen.

/** The stage rail, in order. `step` is the route segment; `group` is the heading of the column it sits in. */
export const STAGES = [
  { step: "overview", title: "Overview", group: "Set up" },
  { step: "site", title: "Site", group: "Set up" },
  { step: "evidence", title: "Evidence", group: "Assemble" },
  { step: "screening", title: "Screening", group: "Analyze" },
  { step: "studies", title: "Studies", group: "Analyze" },
  { step: "footprint", title: "Footprint", group: "Analyze" },
  { step: "impact", title: "Impact", group: "Analyze" },
  { step: "report", title: "Report", group: "Report" },
] as const;
export type Step = (typeof STAGES)[number]["step"];

/** The six phases a planner reviews. Overview and Report are not reviewed. */
export const PHASES = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TITLE: Record<Phase, string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

/** A zero UUID: well formed, owned by no one. */
export const UNKNOWN_PROJECT_ID = "00000000-0000-4000-8000-000000000000";

export function uniqueTitle(tag: string): string {
  return `E2E ${tag} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function signInThroughTheForm(page: Page, next?: string): Promise<void> {
  const { email, password } = credentials();
  await page.goto(next === undefined ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export function projectIdFromUrl(url: string): string {
  const match = /\/projects\/([0-9a-f-]{36})(?:\/|$)/.exec(url);
  if (!match?.[1]) throw new Error(`No project id in ${url}`);
  return match[1];
}

export type NewProject = {
  title: string;
  applicationType?: "Subdivision" | "Short subdivision" | "Clearing and grading";
  parcelOrAddress?: string;
  applicant?: string;
  projectManager?: string;
  applicationFiledOn?: string;
  targetDecisionOn?: string;
};

/** Fills and submits the New research form. Returns the new project's id, from the Overview URL it lands on. */
export async function createProject(page: Page, project: NewProject): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel("Title").fill(project.title);
  if (project.applicationType)
    await page.getByLabel("Application type").selectOption({ label: project.applicationType });
  if (project.parcelOrAddress) await page.getByLabel("Parcel or address").fill(project.parcelOrAddress);
  if (project.applicant) await page.getByLabel("Applicant").fill(project.applicant);
  if (project.projectManager) await page.getByLabel("Project manager").fill(project.projectManager);
  if (project.applicationFiledOn)
    await page.getByLabel("Application filed on").fill(project.applicationFiledOn);
  if (project.targetDecisionOn) await page.getByLabel("Target decision date").fill(project.targetDecisionOn);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/);
  return projectIdFromUrl(page.url());
}

/** "Start with sample data" from the New research page. Returns the project's id and its (fictional) title. */
export async function createSampleProject(page: Page): Promise<{ id: string; title: string }> {
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Start with sample data" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/);
  const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  if (title.trim() === "") throw new Error("The sample project opened with no title.");
  return { id: projectIdFromUrl(page.url()), title: title.trim() };
}

/** The stage rail's link for one step. */
export function stageLink(page: Page, title: string): Locator {
  return page
    .getByRole("navigation", { name: "Research stages" })
    .getByRole("link", { name: new RegExp(`\\b${title}\\b`) });
}

/**
 * Waits until the analysis banner is gone: a saved input starts an analysis in the worker, and the frame shows
 * a status banner (role "status") until it is current. Fails with the reason a planner would need if the worker
 * isn't running, instead of waiting out the whole test timeout.
 */
export async function waitForAnalysisToSettle(page: Page): Promise<void> {
  const pending = page.getByRole("status").filter({ hasText: /Analysis is (running|out of date)/ });
  const failed = page.getByRole("alert").filter({ hasText: "Analysis failed" });
  await expect
    .poll(
      async () => {
        if ((await failed.count()) > 0)
          throw new Error(`The analysis failed: ${(await failed.first().innerText()).trim()}`);
        return pending.count();
      },
      {
        message: `The analysis did not finish within ${ANALYSIS_TIMEOUT_MS / 1000}s. Is the worker running (npm run worker:dev)?`,
        timeout: ANALYSIS_TIMEOUT_MS,
        intervals: [1_000, 2_000, 3_000],
      },
    )
    .toBe(0);
}

/** Opens a step of a project through the stage rail, as a planner would. */
export async function goToStep(page: Page, step: Step): Promise<void> {
  const stage = STAGES.find((s) => s.step === step);
  if (!stage) throw new Error(`Unknown step ${step}`);
  await stageLink(page, stage.title).click();
  await expect(page).toHaveURL(new RegExp(`/projects/[0-9a-f-]{36}/${step}$`));
}

/** Soft-deletes a project from the dashboard, the way a planner does. Its records are kept by design. */
export async function deleteProject(page: Page, title: string): Promise<void> {
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: `Delete research: ${title}` });
  await expect(trigger, `No Delete button for "${title}" on the dashboard.`).toBeVisible();
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete research" }).click();
  await expect(trigger).toHaveCount(0);
}

/** WCAG 2.1 A and AA, the standard every page must meet (best-practices.md, Accessibility). */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrolls, "the page scrolls sideways").toBe(false);
}

/** Words no page may use about a development or a screen (P2, and the charter's "never makes the call"). */
export const VERDICT_PHRASES = [
  /safe to develop/i,
  /no constraints detected/i,
  /\bapproved?\b.{0,20}\bdevelopment\b/i,
  /\bwe recommend\b/i,
  /\bdeny\b/i,
];
