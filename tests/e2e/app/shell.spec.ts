import { STAGES, UNKNOWN_PROJECT_ID, expectNoAxeViolations } from "../support/app";
import { credentials } from "../support/env";
import { expect, test } from "../support/fixtures";

// The frame around every signed-in screen: navigation, the person's identity, the skip link, redirects, the
// Help page, and the one "Not found" every missing project reads as (project-dashboard.md, "The shell";
// accounts-roles.md R7).

test.describe("navigation shell", () => {
  test("F20: the shell names the signed-in person and offers the three places to go", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText(credentials().email, { exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText([/Dashboard/, /City profile/, /Help/]);
    await expect(nav.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dashboard");
    await expect(nav.getByRole("link", { name: /City profile/ })).toHaveAttribute("href", "/profile");
    await expect(nav.getByRole("link", { name: /Help/ })).toHaveAttribute("href", "/help");
  });

  test("F20 R6: the city's name sits under City profile in the navigation on every page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const cityName = (
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: /City profile/ })
        .innerText()
    ).split("\n")[1];
    expect(cityName?.trim(), "City profile shows the city's name beneath it").toBeTruthy();

    for (const path of ["/help", "/profile", "/projects/new"]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /City profile/ }),
      ).toContainText(cityName?.trim() ?? "");
    }
  });

  test("F20: the page you are on is marked current, and only that one", async ({ page }) => {
    for (const [path, current] of [
      ["/dashboard", "Dashboard"],
      ["/profile", "City profile"],
      ["/help", "Help"],
      ["/projects/new", "Dashboard"], // new research is part of the dashboard's area
    ] as const) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole("link", { name: new RegExp(current) })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("F20: New research in the navigation opens the new-research form", async ({ page }) => {
    await page.goto("/help");
    await page.locator("aside").getByRole("link", { name: "New research" }).click();

    await expect(page).toHaveURL(/\/projects\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New research" })).toBeVisible();
  });

  test("R12: the skip link is the first thing a keyboard reaches and it moves to the main content", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("F20: /projects is not a page of its own; it leads to the dashboard", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("F20 R6: the brand link in the top bar returns to the dashboard", async ({ page }) => {
    await page.goto("/help");
    await page.locator("aside").getByRole("link", { name: /UPlan/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("R12: the shell has no WCAG 2.1 A or AA violations on the dashboard, Help, and New research", async ({
    page,
  }) => {
    for (const path of ["/dashboard", "/help", "/projects/new"]) {
      await page.goto(path);
      await expectNoAxeViolations(page);
    }
  });
});

test.describe("a project that is not there", () => {
  for (const { step } of STAGES) {
    test(`accounts-roles R7: /projects/<unknown>/${step} reads as Not found inside the shell`, async ({
      page,
    }) => {
      await page.goto(`/projects/${UNKNOWN_PROJECT_ID}/${step}`);

      await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
      await expect(page.getByText("There is nothing at this address that you can open.")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      await page.getByRole("link", { name: "Back to the dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  }

  test("accounts-roles R7: an id that is not a UUID is the same Not found, never a crash", async ({
    page,
  }) => {
    await page.goto("/projects/not-a-uuid/overview");

    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("accounts-roles R7: a page that does not exist at all is a 404 inside the app", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
  });

  test("R7: the Not found page has no WCAG 2.1 A or AA violations", async ({ page }) => {
    await page.goto(`/projects/${UNKNOWN_PROJECT_ID}/overview`);
    await expectNoAxeViolations(page);
  });
});

test.describe("Help", () => {
  test("the page walks through the six phases in order, in plain words", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    const panel = page.locator("section", {
      has: page.getByRole("heading", { name: "A project moves through six phases" }),
    });
    const phases = panel.getByRole("listitem");
    await expect(phases).toHaveCount(6);
    await expect(phases).toHaveText([
      /^1\.\s*Site\./,
      /^2\.\s*Evidence\./,
      /^3\.\s*Screening\./,
      /^4\.\s*Studies\./,
      /^5\.\s*Footprint\./,
      /^6\.\s*Impact\./,
    ]);
  });

  test("P2 and the posture: Help says UPlan never makes the call, never clears land, and no model writes a draft", async ({
    page,
  }) => {
    await page.goto("/help");

    await expect(page.getByText("it never recommends developing or preserving")).toBeVisible();
    await expect(page.getByText("No language model writes it")).toBeVisible();
    await expect(
      page.getByText("It is not sign-off, and it says nothing about the development."),
    ).toBeVisible();
    await expect(page.getByText(/safe to develop/i)).toHaveCount(0);
  });

  test("Help explains how to finish, change finished research, delete, and what sample data is", async ({
    page,
  }) => {
    await page.goto("/help");

    for (const heading of [
      "What UPlan does",
      "Drafted output and your review",
      "Finishing, and changing finished research",
      "Sample data",
      "If something looks wrong",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByText("A published version never changes.")).toBeVisible();
  });
});
