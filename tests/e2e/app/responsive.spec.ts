import {
  STAGES,
  createProject,
  deleteProject,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
} from "../support/app";
import { expect, test } from "../support/fixtures";

// The same screens at desktop width and at phone width (the config runs this file under both). Charter: "one
// application in the browser and on phones". No page may scroll sideways, and the navigation must stay reachable
// when it folds into a menu (project-dashboard.md, "The shell"; accessibility rules).

const PAGES = ["/dashboard", "/projects/new", "/help", "/profile"] as const;

test.describe("layout", () => {
  for (const path of PAGES) {
    test(`R12: ${path} does not scroll sideways and has no WCAG 2.1 A or AA violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }

  for (const stage of STAGES) {
    test(`R12: the project's ${stage.title} step does not scroll sideways`, async ({
      page,
      blankProject,
    }) => {
      await page.goto(`/projects/${blankProject.id}/${stage.step}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);

      await expectNoHorizontalScroll(page);
    });
  }

  test("R12: the dashboard row's phase track fits the screen when a row is open", async ({
    page,
    blankProject,
  }) => {
    await page.goto("/dashboard");
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: `Delete research: ${blankProject.title}` }) });
    await row.getByRole("heading", { level: 3 }).getByRole("button").click();

    await expect(row.getByRole("link", { name: `Open overview: ${blankProject.title}` })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("R12: a long title wraps instead of pushing the page wider", async ({ page }) => {
    const title = `E2E ${"unbroken".repeat(18)} ${Date.now().toString(36)}`;
    await createProject(page, { title });
    try {
      await expectNoHorizontalScroll(page);
      await page.goto("/dashboard");
      await expectNoHorizontalScroll(page);
    } finally {
      await deleteProject(page, title);
    }
  });
});

test.describe("navigation", () => {
  test("the menu button appears only where the navigation folds, and says whether it is open", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/dashboard");
    const menu = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Main" });

    if (!isMobile) {
      await expect(menu).toBeHidden();
      await expect(nav).toBeVisible();
      return;
    }

    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-controls", "app-nav");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(3);

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
  });

  test("choosing a link in the menu goes there and closes the menu", async ({ page, isMobile }) => {
    await page.goto("/dashboard");
    if (isMobile) await page.getByRole("button", { name: "Menu" }).click();

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Help/ }).click();

    await expect(page).toHaveURL(/\/help$/);
    if (isMobile) {
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    }
  });

  test("New research is reachable from the menu on a phone and from the rail on a desktop", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/help");
    if (isMobile) await page.getByRole("button", { name: "Menu" }).click();

    await page.locator("aside").getByRole("link", { name: "New research" }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);
  });

  test("the stage rail is one column on a phone and all eight steps stay reachable", async ({
    page,
    blankProject,
    isMobile,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    const rail = page.getByRole("navigation", { name: "Research stages" });

    await expect(rail.getByRole("link")).toHaveCount(8);
    if (isMobile) {
      const boxes = await rail
        .getByRole("link")
        .evaluateAll((links) => links.map((l) => Math.round(l.getBoundingClientRect().left)));
      expect(new Set(boxes).size, "the steps stack in one column").toBe(1);
    }
    for (const link of await rail.getByRole("link").all()) await expect(link).toBeVisible();
  });
});

test.describe("map content as text", () => {
  test("accessibility rules: the Site page lists every map layer as text beside the map", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);

    await expect(page.getByRole("heading", { name: "Map workspace" })).toBeVisible();
    await expect(page.getByText("Every layer is also listed below the map as text.")).toBeVisible();
  });
});
