import { test, expect } from "@playwright/test";

import {
  createSampleProject,
  deleteProject,
  goToStep,
  projectIdFromUrl,
  signInThroughTheForm,
  stageLink,
  waitForAnalysisToSettle,
} from "../support/app";
import {
  downloadDocument,
  finishAndWait,
  reviewEveryPhase,
  shownSha256,
  versionRow,
} from "../support/journey";

// Two shorter journeys. The first is the door: where signing in sends a person, and what it refuses to do. The
// second is the fast way through the product: "Start with sample data", every phase, and the final document.

test.describe("where signing in leads (accounts-roles.md R10)", () => {
  test("a protected page asked for while signed out is where sign-in lands afterwards", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(
      (url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/profile",
    );

    await signInThroughTheForm(page, "/profile");

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^City of .+ Profile$/);
  });

  test("without a destination, sign-in lands on the dashboard", async ({ page }) => {
    await signInThroughTheForm(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  for (const hostile of [
    "//evil.example.test/steal",
    "https://evil.example.test/steal",
    "/\\evil.example.test",
    "javascript:alert(1)",
  ]) {
    test(`a destination of ${hostile} is ignored: sign-in stays on this site, at the dashboard`, async ({
      page,
      baseURL,
    }) => {
      await signInThroughTheForm(page, hostile);

      await expect(page).toHaveURL(/\/dashboard$/);
      expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? "").origin);
    });
  }

  test("a person who is already signed in can open a project's address directly, in a new tab", async ({
    page,
    context,
  }) => {
    await signInThroughTheForm(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    const { id, title } = await createSampleProject(page);
    try {
      const second = await context.newPage();
      await second.goto(`/projects/${id}/overview`);
      await expect(second.getByRole("heading", { level: 1 })).toHaveText(title);
      await second.close();

      // Returning to a project after the session is gone: sign in again and land on the same page.
      await context.clearCookies();
      await page.goto(`/projects/${id}/evidence`);
      await expect(page).toHaveURL(
        (url) => url.pathname === "/sign-in" && url.searchParams.get("next") === `/projects/${id}/evidence`,
      );
      await signInThroughTheForm(page, `/projects/${id}/evidence`);
      await expect(page).toHaveURL(new RegExp(`/projects/${id}/evidence$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    } finally {
      await deleteProject(page, title);
    }
  });

  test("a person who is signed out sees a project's address as the sign-in page, never as the project", async ({
    page,
  }) => {
    await page.goto("/projects/00000000-0000-4000-8000-000000000000/overview");
    await expect(page.getByRole("heading", { name: "Sign in to UPlan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
  });
});

test.describe("the sample-data way through", () => {
  test.describe.configure({ mode: "serial", timeout: 6 * 60_000 });

  test("Start with sample data, review all six phases, finish, and get a document that says it is a sample", async ({
    page,
  }) => {
    await signInThroughTheForm(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    const { id, title } = await createSampleProject(page);
    try {
      expect(projectIdFromUrl(page.url())).toBe(id);
      await expect(page.getByRole("note")).toContainText("This project uses sample data.");
      await waitForAnalysisToSettle(page);

      await reviewEveryPhase(page);
      await goToStep(page, "report");
      await expect(stageLink(page, "Report")).toContainText("Ready to finish");
      await finishAndWait(page, 1);

      await goToStep(page, "report");
      await expect(versionRow(page, 1)).toContainText("Sample data");
      const file = await downloadDocument(page, id, 1);
      expect(file.status).toBe(200);
      expect(file.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(file.computedSha256).toBe(file.headerSha256);
      expect(file.computedSha256).toBe(await shownSha256(page, 1));

      await page.goto("/dashboard");
      const row = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
      await expect(row).toContainText("Completed · version 1");
      await expect(row).toContainText("Sample data");
    } finally {
      await deleteProject(page, title);
    }
  });
});
