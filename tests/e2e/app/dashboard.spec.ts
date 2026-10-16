import type { Page } from "@playwright/test";

import { createProject, deleteProject, expectNoAxeViolations, uniqueTitle } from "../support/app";
import { expect, test } from "../support/fixtures";

// The dashboard (project-dashboard.md F20 R1-R5, R7): the page a person lands on after signing in, one expandable
// table of their own research, and the actions that fit each state. Counts and words only; no percentage or score.

/** The dashboard's count box, or 0 when the person has no projects and the page shows its empty state instead of the table. */
async function countOf(page: Page, label: "In progress" | "Completed"): Promise<number> {
  const box = page.locator("dt", { hasText: label });
  if ((await box.count()) === 0) return 0;
  return Number(await box.locator("xpath=following-sibling::dd[1]").innerText());
}

/** The row (list item) whose delete button names this project. */
function rowOf(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
}

test.describe("header and actions", () => {
  test("F20 R1: the page greets the person by first name and says whose research it lists", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back, \S+/);
    await expect(page.getByText(/^Your .+ research$/)).toBeVisible();
  });

  test("F20 R1: View city profile and New research lead where they say", async ({ page }) => {
    await page.goto("/dashboard");
    const main = page.locator("main");

    await expect(main.getByRole("link", { name: "View city profile" })).toHaveAttribute("href", "/profile");
    await expect(main.getByRole("link", { name: "New research" }).first()).toHaveAttribute(
      "href",
      "/projects/new",
    );

    await main.getByRole("link", { name: "View city profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("F20 R7: there is no percentage, score, or rating anywhere on the dashboard", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: `Delete research: ${blankProject.title}` })).toBeVisible();

    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/\b(score|rating|grade)\b/i);
  });

  test("R12: the dashboard has no WCAG 2.1 A or AA violations with a project listed", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: `Delete research: ${blankProject.title}` })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("the research table", () => {
  test("F20 R3: a new project is listed with phases reviewed, phases left, and when it was updated", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");

    const row = rowOf(page, blankProject.title);
    await expect(row.getByRole("heading", { level: 3 })).toContainText(blankProject.title);
    await expect(row).toContainText(/0 of \d+ phases reviewed/);
    await expect(row.getByText(/\d+ phases? left for review/).first()).toBeAttached();
    await expect(row).toContainText(/Updated .+/);
    await expect(row.getByText("Sample data")).toHaveCount(0);
  });

  test("F20 R3: the In progress count goes up by one when a project is started", async ({ page }) => {
    await page.goto("/dashboard");
    const before = await countOf(page, "In progress");

    const title = uniqueTitle("count");
    await createProject(page, { title });
    await page.goto("/dashboard");
    try {
      expect(await countOf(page, "In progress")).toBe(before + 1);
      expect(await countOf(page, "Completed")).toBeGreaterThanOrEqual(0);
    } finally {
      await deleteProject(page, title);
    }
  });

  test("F20 R2: a row opens and closes, and its toggle says which", async ({ page, blankProject }) => {
    await page.goto("/dashboard");
    const row = rowOf(page, blankProject.title);
    const toggle = row.getByRole("heading", { level: 3 }).getByRole("button");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(row.getByRole("link", { name: `Open overview: ${blankProject.title}` })).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(row.getByRole("link", { name: `Open overview: ${blankProject.title}` })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("F20 R2: an open row shows each phase's state", async ({ page, blankProject }) => {
    await page.goto("/dashboard");
    const row = rowOf(page, blankProject.title);
    await row.getByRole("heading", { level: 3 }).getByRole("button").click();

    // A project with no study area has nothing drafted, so every phase is still to do.
    const phases = row.getByRole("list").last().getByRole("link");
    await expect(phases).toHaveCount(6);
    await expect(phases).toHaveText([
      /1\. Site/,
      /2\. Evidence/,
      /3\. Screening/,
      /4\. Studies/,
      /5\. Footprint/,
      /6\. Impact/,
    ]);
    for (const [index, name] of [
      "Site",
      "Evidence",
      "Screening",
      "Studies",
      "Footprint",
      "Impact",
    ].entries()) {
      await expect(phases.nth(index)).toHaveAttribute("aria-label", `${name}: To do`);
    }
    await expect(
      row.locator("dt", { hasText: "Phases left for review" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("6");
  });

  test("F20 R4: an in-progress row offers Resume, which opens the project at its next step", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    await rowOf(page, blankProject.title)
      .getByRole("link", { name: `Resume research: ${blankProject.title}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/(overview|site)$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
  });

  test("F20 R4: Open overview opens the project's overview", async ({ page, blankProject }) => {
    await page.goto("/dashboard");
    const row = rowOf(page, blankProject.title);
    await row.getByRole("heading", { level: 3 }).getByRole("button").click();
    await row.getByRole("link", { name: `Open overview: ${blankProject.title}` }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/overview$`));
  });

  test("F20 R3: with two projects, the one touched last comes first when both have the same phases left", async ({
    page,
  }) => {
    const first = uniqueTitle("order-a");
    const second = uniqueTitle("order-b");
    await createProject(page, { title: first });
    await createProject(page, { title: second });
    try {
      await page.goto("/dashboard");
      const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
      const at = (title: string) => headings.findIndex((h) => h.includes(title));
      expect(at(first), "the first project is listed").toBeGreaterThanOrEqual(0);
      expect(at(second), "the second project is listed").toBeGreaterThanOrEqual(0);
      expect(at(second)).toBeLessThan(at(first));
    } finally {
      await deleteProject(page, first);
      await deleteProject(page, second);
    }
  });
});

test.describe("deleting research", () => {
  test("F20 R5: Delete asks first and says the records are kept", async ({ page, blankProject }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: `Delete research: ${blankProject.title}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: `Delete “${blankProject.title}” from view?` }),
    ).toBeVisible();
    await expect(dialog).toContainText("UPlan keeps every record it holds");
  });

  test("F20 R5: Cancel focuses first, closes the dialog, and deletes nothing", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: `Delete research: ${blankProject.title}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(rowOf(page, blankProject.title)).toBeVisible();
  });

  test("F20 R5: Escape closes the dialog and gives focus back to the button that opened it", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: `Delete research: ${blankProject.title}` });
    await trigger.click();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(rowOf(page, blankProject.title)).toBeVisible();
  });

  test("F20 R5: confirming removes the project from the list, and its address then reads as Not found", async ({
    page,
  }) => {
    const title = uniqueTitle("delete");
    const id = await createProject(page, { title });

    await deleteProject(page, title);
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: `Delete research: ${title}` })).toHaveCount(0);

    await page.goto(`/projects/${id}/overview`);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  });
});
