import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The public landing page's feature showcase (src/app/_landing/). No feature requirement doc covers a
// marketing page, so these are named for the page. A signed-out visit needs no Supabase project. The
// two projects in playwright.config.ts give the desktop and phone-width runs.

test("Landing showcase: six features, each opening its own panel", async ({ page }) => {
  await page.goto("/");

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(6);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Trace what the plan would clear");

  await page.getByRole("tab", { name: /Measure the impact/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Impact analysis");

  await page.getByRole("tab", { name: /A rulebook for each city/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Jurisdiction profile");
});

test("Landing showcase: layer chips hide and show what the footprint touches", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Wetlands: falls inside the footprint")).toBeVisible();
  await page.getByRole("button", { name: "Wetlands" }).click();
  await expect(page.getByText("Wetlands: hidden")).toBeVisible();
});

test("Landing showcase: an impact row opens to its rule, and a zero still gets a row", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Measure the impact/ }).click();

  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText("0.00 ac")).toBeVisible();
  await panel.getByRole("button", { name: /Steep slopes/ }).click();
  await expect(page.getByText(/Zero here describes the map, not the land/)).toBeVisible();
});

test("Landing showcase: confidence is stated in words, and the report can't be edited", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: /Every figure shows its source/ }).click();
  await page.getByRole("radio", { name: "Low" }).click();
  await expect(page.getByText(/not as a measurement/)).toBeVisible();

  await page.getByRole("tab", { name: /A report that can.t be quietly changed/ }).click();
  await page.getByRole("button", { name: "Try to edit this report" }).click();
  await expect(page.getByRole("status")).toContainText("Released reports can’t be edited");
});

test("Landing showcase: the page has no WCAG 2.1 A or AA violations and doesn't scroll sideways", async ({
  page,
}) => {
  // Reduced motion, so axe never samples a panel halfway through its fade-in (which blends colors).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("tab", { name: /Measure the impact/ }).click();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrollsSideways).toBe(false);
});
