import { test, expect, type Page } from "@playwright/test";

import {
  createProject,
  deleteProject,
  goToStep,
  projectIdFromUrl,
  signInThroughTheForm,
  stageLink,
  uniqueTitle,
  waitForAnalysisToSettle,
} from "../support/app";
import { BASE_URL } from "../support/env";
import {
  downloadDocument,
  finishAndWait,
  reviewPhase,
  reviewPhasesThatNeedIt,
  shownSha256,
  versionRow,
} from "../support/journey";

// A planner's whole day with UPlan, in order, on one browser session that starts at the login form:
// sign in -> dashboard -> start research -> add the study area and footprint -> leave and come back -> review ->
// finish -> download -> change finished research -> publish the next version. Each test is one step of that day and
// the steps depend on each other, so they run in order and stop at the first failure (serial mode).
//
// Needs the worker (npm run worker:dev), a seeded city (npm run db:seed:local), and E2E_EMAIL / E2E_PASSWORD.

test.describe.configure({ mode: "serial" });

const title = uniqueTitle("journey");
let page: Page;
let projectId = ""; // set by step 2
let firstVersion: { sha256: string; byteLength: number };

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ baseURL: BASE_URL })).newPage();
});

test.afterAll(async () => {
  // The planner's Delete: the project leaves their list and its records are kept. Nothing to delete if step 2 never ran.
  if (projectId !== "") await deleteProject(page, title);
  await page.context().close();
});

test("1. signing in from the form lands on the dashboard", async () => {
  await signInThroughTheForm(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("2. New research from the dashboard creates a project and opens its Overview", async () => {
  await page.locator("main").getByRole("link", { name: "New research" }).first().click();
  await expect(page).toHaveURL(/\/projects\/new$/);

  projectId = await createProject(page, {
    title,
    applicationType: "Short subdivision",
    parcelOrAddress: "Fictional parcel for the journey spec",
    applicant: "Journey Test Applicant",
    projectManager: "Journey Test Manager",
    applicationFiledOn: "2026-03-02",
    targetDecisionOn: "2026-06-15",
  });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByRole("listitem").filter({ hasText: "Add the study area" })).toBeVisible();
});

test("3. the study area starts the analysis, and the phases that depend on it fill in", async () => {
  await goToStep(page, "site");
  await page.getByRole("button", { name: "Load sample study area" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
  await waitForAnalysisToSettle(page);

  for (const phase of ["site", "evidence", "screening", "studies"] as const) {
    await goToStep(page, phase);
    const drafted = page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) });
    await expect(drafted.locator("summary"), `${phase} should have a drafted output`).not.toContainText(
      /This phase needs a|Analysis is/,
    );
  }
  await goToStep(page, "impact");
  await expect(
    page
      .locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) })
      .locator("summary"),
  ).toContainText("This phase needs a footprint.");
});

test("4. the footprint, added over the study area, lets the Impact phase measure", async () => {
  await goToStep(page, "footprint");
  await page.getByRole("button", { name: "Load sample footprint" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sample footprint loaded." })).toBeVisible();
  await waitForAnalysisToSettle(page);

  await goToStep(page, "impact");
  const drafted = page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) });
  await expect(drafted.locator("summary")).not.toContainText(/This phase needs a|Analysis is/);
  await expect(page.getByRole("heading", { name: "Measured impact" })).toBeVisible();
  for (const phase of ["Site", "Evidence", "Screening", "Studies", "Footprint", "Impact"]) {
    await expect(stageLink(page, phase)).toContainText("Needs review");
  }
});

test("5. leaving the project and coming back from the dashboard picks up where the work stands", async () => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Help/ }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /Dashboard/ })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await expect(row).toContainText("0 of 6 phases reviewed");
  await row.getByRole("link", { name: `Resume research: ${title}` }).click();

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
});

test("6. three reviews, then the dashboard says three phases are left and Resume returns to the same project", async () => {
  for (const phase of ["site", "evidence", "screening"] as const) await reviewPhase(page, phase);

  await page.goto("/dashboard");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await expect(row).toContainText("3 of 6 phases reviewed");
  await expect(row.getByText("3 phases left for review").first()).toBeAttached();

  await row.getByRole("heading", { level: 3 }).getByRole("button").click();
  const status = row.getByRole("link", { name: /^(Site|Evidence|Screening|Studies|Footprint|Impact): / });
  await expect(status).toHaveCount(6);
  for (const name of ["Site", "Evidence", "Screening"])
    await expect(row.getByRole("link", { name: `${name}: Reviewed` })).toBeVisible();
  for (const name of ["Studies", "Footprint", "Impact"])
    await expect(row.getByRole("link", { name: `${name}: Needs review` })).toBeVisible();

  await row.getByRole("link", { name: `Resume research: ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/`));
  for (const name of ["Site", "Evidence", "Screening"])
    await expect(stageLink(page, name)).toContainText("Reviewed");
});

test("7. the Report step is not ready until the last phase is reviewed, then says it is", async () => {
  await goToStep(page, "report");
  await expect(page.getByText("The items above must be done first.")).toBeVisible();
  for (const name of ["Studies", "Footprint", "Impact"]) {
    await expect(page.getByRole("listitem").filter({ hasText: `Review the ${name} phase.` })).toBeVisible();
  }
  await expect(page.getByRole("listitem").filter({ hasText: "Review the Site phase." })).toHaveCount(0);

  for (const phase of ["studies", "footprint", "impact"] as const) await reviewPhase(page, phase);

  await goToStep(page, "report");
  await expect(page.getByText("Every phase is reviewed and the analysis is current.")).toBeVisible();
  await expect(page.getByText("The items above must be done first.")).toHaveCount(0);
  await expect(stageLink(page, "Report")).toContainText("Ready to finish");
});

test("8. finishing generates one document, stores it with its hash, and numbers it version 1", async () => {
  await finishAndWait(page, 1);

  await goToStep(page, "report");
  const row = versionRow(page, 1);
  await expect(row).toContainText("Latest");
  await expect(row).toContainText("First version.");
  await expect(page.getByRole("heading", { name: "Finish research" })).toHaveCount(0);

  const shown = await shownSha256(page, 1);
  const file = await downloadDocument(page, projectId, 1);
  expect(file.status).toBe(200);
  expect(file.contentType).toBe("application/pdf");
  expect(file.disposition).toMatch(/^attachment; filename="[^"]+\.pdf"$/);
  expect(file.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(file.bytes.length).toBeGreaterThan(5_000);
  expect(file.computedSha256, "the bytes served hash to the SHA-256 the server states").toBe(
    file.headerSha256,
  );
  expect(file.computedSha256, "the bytes served hash to the SHA-256 the Report step shows").toBe(shown);
  firstVersion = { sha256: file.computedSha256, byteLength: file.bytes.length };
});

test("9. a completed project is read-only: its phases can't be reviewed again and its details can't be edited", async () => {
  await goToStep(page, "site");
  const review = page.locator("section", { has: page.getByRole("heading", { name: "Your review" }) });
  await expect(review).toContainText(
    "Version 1 is published. Start a research change on the Overview to review or edit this phase.",
  );
  await expect(review.getByRole("button", { name: "Record review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load sample study area" })).toHaveCount(0);
  await expect(page.getByText("The study area is at revision")).toBeVisible();

  await goToStep(page, "overview");
  await expect(page.getByText("This research is completed.")).toBeVisible();
  await page.getByRole("heading", { name: "Project details" }).click();
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(0);
  await expect(page.getByText("Read-only while the project is completed")).toBeVisible();
});

test("10. the dashboard lists the project as Completed with its download and Re-research", async () => {
  await page.goto("/dashboard");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });

  await expect(row).toContainText("Completed · version 1");
  await expect(row.getByRole("link", { name: `Resume research: ${title}` })).toHaveCount(0);
  await expect(row.getByRole("button", { name: `Re-research: ${title}` })).toBeVisible();
  await row.getByRole("heading", { level: 3 }).getByRole("button").click();
  await expect(row.getByRole("link", { name: `Download document: ${title}` })).toHaveAttribute(
    "href",
    `/api/projects/${projectId}/documents/1`,
  );
});

test("11. a research change that changes nothing can't be published, and can be cancelled back to Completed", async () => {
  await page.goto("/dashboard");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await row.getByRole("button", { name: `Re-research: ${title}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start research change" }).click();

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/overview$`));
  const header = page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]");
  await expect(header.getByText("Research change open")).toBeVisible();
  const change = page.locator("details", {
    has: page.getByRole("heading", { name: "Research change from version 1" }),
  });
  await expect(change.locator("summary")).toContainText("Nothing changed yet");

  await goToStep(page, "report");
  await expect(page.getByRole("heading", { name: "Publish version 2" })).toBeVisible();
  await expect(page.getByText("Nothing has changed since the last published version.")).toBeVisible();
  await page.getByLabel("Reason for version 2 (required)").fill("Nothing changed, so this must be refused.");
  await page.getByRole("button", { name: "Publish version 2" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Nothing has changed since version 1. Cancel the research change instead." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generating the document" })).toHaveCount(0);

  await goToStep(page, "overview");
  await page.getByRole("button", { name: "Cancel research change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel research change" }).click();
  await expect(header.getByText("Completed · version 1")).toBeVisible();
  await expect(header.getByText("Research change open")).toHaveCount(0);
});

test("12. a real change needs the affected phase reviewed again and a reason, and publishes version 2", async () => {
  await page.goto("/dashboard");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await row.getByRole("button", { name: `Re-research: ${title}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start research change" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/overview$`));

  await page.getByRole("heading", { name: "Project details" }).click();
  await page.getByLabel("Target decision date").fill("2026-07-20");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Project details saved." })).toBeVisible();

  const change = page.locator("details", {
    has: page.getByRole("heading", { name: "Research change from version 1" }),
  });
  await expect(change.locator("summary")).toContainText("Changed");

  await goToStep(page, "site");
  await page.getByRole("button", { name: "Load sample study area" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
  await waitForAnalysisToSettle(page);
  await expect(stageLink(page, "Site")).toContainText("Needs review");

  await goToStep(page, "report");
  await expect(page.getByText("The items above must be done first.")).toBeVisible();
  await reviewPhasesThatNeedIt(page);

  await goToStep(page, "report");
  await expect(page.getByLabel("Reason for version 2 (required)")).toHaveJSProperty("required", true);
  await page
    .getByLabel("Reason for version 2 (required)")
    .fill("Moved the target decision date and redrew the study area.");
  await finishAndWait(page, 2);
});

test("13. both versions are kept: version 1 is byte-for-byte what it was, and version 2 says what changed", async () => {
  await goToStep(page, "report");

  await expect(versionRow(page, 2)).toContainText("Latest");
  await expect(versionRow(page, 2)).toContainText(
    "Moved the target decision date and redrew the study area.",
  );
  await expect(versionRow(page, 2)).toContainText(/Since version 1: .*changed\./);
  await expect(versionRow(page, 1)).not.toContainText("Latest");

  const v1 = await downloadDocument(page, projectId, 1);
  expect(v1.status).toBe(200);
  expect(v1.computedSha256, "version 1 never changes").toBe(firstVersion.sha256);
  expect(v1.bytes.length).toBe(firstVersion.byteLength);
  expect(await shownSha256(page, 1)).toBe(firstVersion.sha256);

  const v2 = await downloadDocument(page, projectId, 2);
  expect(v2.status).toBe(200);
  expect(v2.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(v2.computedSha256).toBe(v2.headerSha256);
  expect(v2.computedSha256).toBe(await shownSha256(page, 2));
  expect(v2.computedSha256, "a different document has a different hash").not.toBe(v1.computedSha256);

  const missing = await downloadDocument(page, projectId, 3);
  expect(missing.status).toBe(404);
});

test("14. the project is listed once on the dashboard, as version 2, and its address still opens it", async () => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: `Delete research: ${title}` })).toHaveCount(1);
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await expect(row).toContainText("Completed · version 2");

  await page.goto(`/projects/${projectId}/overview`);
  expect(projectIdFromUrl(page.url())).toBe(projectId);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
});
