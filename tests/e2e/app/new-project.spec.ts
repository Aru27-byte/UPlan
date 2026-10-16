import { createProject, deleteProject, expectNoAxeViolations, uniqueTitle } from "../support/app";
import { expect, test } from "../support/fixtures";

// New research (project-dashboard.md F20 R9): one short form. Only the title and the application type are
// required; the rest can be recorded whenever it is known.

test.describe("the form", () => {
  test("F20 R9: the page names the city whose rules apply and lists every field", async ({ page }) => {
    await page.goto("/projects/new");

    await expect(page.getByRole("heading", { level: 1, name: "New research" })).toBeVisible();
    await expect(page.getByText(/^The rules of .+, [A-Z]{2} apply to this project\.$/)).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");

    for (const label of [
      "Title",
      "Application type",
      "Parcel or address",
      "Applicant",
      "Project manager",
      "Application filed on",
      "Target decision date",
    ]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    await expect(page.getByLabel("Title")).toHaveJSProperty("required", true);
    await expect(page.getByLabel("Application type")).toHaveJSProperty("required", true);
    await expect(page.getByLabel("Parcel or address")).toHaveJSProperty("required", false);
  });

  test("F20 R9: the three application types are offered, and Subdivision is the default", async ({
    page,
  }) => {
    await page.goto("/projects/new");
    const type = page.getByLabel("Application type");

    await expect(type.locator("option")).toHaveText([
      "Subdivision",
      "Short subdivision",
      "Clearing and grading",
    ]);
    await expect(type).toHaveValue("subdivision");
  });

  test("F20 R9: text fields carry the length limits the server enforces", async ({ page }) => {
    await page.goto("/projects/new");

    await expect(page.getByLabel("Title")).toHaveAttribute("maxlength", "200");
    for (const label of ["Parcel or address", "Applicant", "Project manager"]) {
      await expect(page.getByLabel(label)).toHaveAttribute("maxlength", "300");
    }
  });

  test("F20 R9: an empty title is stopped by the browser and nothing is created", async ({ page }) => {
    await page.goto("/projects/new");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(/\/projects\/new$/);
    expect(await page.getByLabel("Title").evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(
      true,
    );
  });

  test("F20 R9: a title of only spaces passes the browser and is refused by the server with a plain message", async ({
    page,
  }) => {
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill("     ");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /title/i })).toHaveText("The title is required.");
    await expect(page).toHaveURL(/\/projects\/new$/);
  });

  test("F20 R9: Cancel returns to the dashboard without creating anything", async ({ page }) => {
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill(uniqueTitle("cancelled"));
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("R12: the form has no WCAG 2.1 A or AA violations", async ({ page }) => {
    await page.goto("/projects/new");
    await expectNoAxeViolations(page);
  });
});

test.describe("creating a project", () => {
  test("F20 R9: a title alone is enough, and every other detail reads Not yet recorded", async ({ page }) => {
    const title = uniqueTitle("minimal");
    await createProject(page, { title });
    try {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      const glance = page.locator("section", {
        has: page.getByRole("heading", { name: "Project at a glance" }),
      });
      for (const label of [
        "Parcel or address",
        "Applicant",
        "Project manager",
        "Application filed on",
        "Target decision date",
      ]) {
        await expect(
          glance.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]"),
        ).toHaveText("Not yet recorded");
      }
      await expect(
        glance.locator("dt", { hasText: "Application type" }).locator("xpath=following-sibling::dd[1]"),
      ).toHaveText("Subdivision");
    } finally {
      await deleteProject(page, title);
    }
  });

  test("F5 R10: every detail typed on the form is recorded and shown", async ({ page }) => {
    const title = uniqueTitle("full");
    await createProject(page, {
      title,
      applicationType: "Short subdivision",
      parcelOrAddress: "Parcel 0000000000, 1 Test Way",
      applicant: "Fictional Homes LLC",
      projectManager: "Pat Planner",
      applicationFiledOn: "2026-03-02",
      targetDecisionOn: "2026-06-15",
    });
    try {
      const glance = page.locator("section", {
        has: page.getByRole("heading", { name: "Project at a glance" }),
      });
      const value = (label: string) =>
        glance.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
      await expect(value("Application type")).toHaveText("Short subdivision");
      await expect(value("Parcel or address")).toHaveText("Parcel 0000000000, 1 Test Way");
      await expect(value("Applicant")).toHaveText("Fictional Homes LLC");
      await expect(value("Project manager")).toHaveText("Pat Planner");
      await expect(value("Application filed on")).toHaveText("2026-03-02");
      await expect(value("Target decision date")).toHaveText("2026-06-15");
      await expect(page.getByText(/Short subdivision · Parcel 0000000000, 1 Test Way/)).toBeVisible();
    } finally {
      await deleteProject(page, title);
    }
  });

  for (const [type, expected] of [
    ["Subdivision", "Subdivision"],
    ["Short subdivision", "Short subdivision"],
    ["Clearing and grading", "Clearing and grading"],
  ] as const) {
    test(`F5: the ${type} type is recorded and named in the project header`, async ({ page }) => {
      const title = uniqueTitle("type");
      await createProject(page, { title, applicationType: type });
      try {
        await expect(
          page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]"),
        ).toContainText(expected);
      } finally {
        await deleteProject(page, title);
      }
    });
  }

  test("F20 R10: pressing Create twice quickly makes one project, not two", async ({ page }) => {
    const title = uniqueTitle("double");
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Create project" }).dblclick();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/);

    try {
      await page.goto("/dashboard");
      await expect(page.getByRole("button", { name: `Delete research: ${title}` })).toHaveCount(1);
    } finally {
      await deleteProject(page, title);
    }
  });

  test("security: a title with markup is shown as text and never run", async ({ page }) => {
    const title = `E2E <img src=x onerror="window.__xss=1"> ${Date.now().toString(36)}`;
    await createProject(page, { title });
    try {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
      await expect(page.locator("main img[src='x']")).toHaveCount(0);
    } finally {
      await deleteProject(page, title);
    }
  });

  test("F20 R9: the new project appears on the dashboard with nothing reviewed", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: `Delete research: ${blankProject.title}` })).toBeVisible();
  });
});
