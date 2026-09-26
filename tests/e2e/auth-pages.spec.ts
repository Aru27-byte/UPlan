import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// TechDesign/accounts-roles.md — R10, R11, R12. A signed-out visit needs no Supabase project, so
// these run without one; the sign-in round trip itself is checked by hand against a development
// project. The two projects in playwright.config.ts give the desktop and phone-width runs.

test("R10: the sign-in page is an email-and-password form with a visible Register button", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Sign in to UPlan" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();
  await expect(page.getByText(/github|city account/i)).toHaveCount(0);
});

test("R10: a signed-out visit to a protected page lands on sign-in and remembers where it was going", async ({
  page,
}) => {
  await page.goto("/decisions");

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdecisions$/);
});

test("R10: the map's worker files stay reachable signed out, or the landing page's map stays blank", async ({
  request,
}) => {
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const response = await request.get(`/maplibre/${file}`, { maxRedirects: 0 });
    expect(response.status(), file).toBe(200);
  }
});

test("R11: the register page asks for name, email, and a confirmed password, and links back to sign-in", async ({
  page,
}) => {
  await page.goto("/register");

  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/staff give you access/)).toBeVisible();
});

test("R11: a mismatched confirmation is caught before anything is sent", async ({ page }) => {
  await page.goto("/register");

  await page.getByLabel("Full name").fill("Pat Planner");
  await page.getByLabel("Email").fill("pat@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse");
  await page.getByLabel("Confirm password").fill("something else");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("pat@example.test");
});

for (const path of ["/sign-in", "/register"]) {
  test(`R12: ${path} has no WCAG 2.1 A or AA violations and doesn't scroll sideways`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);

    const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(scrollsSideways).toBe(false);
  });
}

test("R12: the background stops moving for a visitor who prefers reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/sign-in");

  const animationName = await page
    .locator(".auth-glow-green")
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
  await context.close();
});
