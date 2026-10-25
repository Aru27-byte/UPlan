import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The public landing page's four sections (src/app/page.tsx). No requirement doc covers a marketing
// page, so these are named for the page. The two public projects give desktop and phone-width runs.

test("Landing: four sections, four phases, and a constant Assist column", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /From a drawn boundary to a released report/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Six critical area types/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Helps you help the environment/ }),
  ).toBeVisible();
  await expect(
    page.locator("aside:visible").getByText("With you on every step"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up the study area" }).last()).toBeVisible();
});

test("Landing: the Setup demo's switches hide and show a layer", async ({ page, isMobile }) => {
  test.skip(isMobile, "The pinned demo column is desktop only");
  await page.goto("/");
  await page.locator("#how").scrollIntoViewIfNeeded();

  const switches = page.locator('[role="switch"]:visible');
  await expect(switches).toHaveCount(6);
  await expect(switches.first()).toBeChecked();
  await page.locator("label[data-react-aria-pressable]:visible").first().click();
  await expect(switches.first()).not.toBeChecked();
});

test("Landing: the Analyze demo opens the Studies tab", async ({ page, isMobile }) => {
  test.skip(isMobile, "The pinned demo column is desktop only");
  await page.goto("/");
  await page.evaluate(() => {
    const section = document.getElementById("how");
    if (!section) throw new Error("no how-it-works section");
    window.scrollTo(0, section.offsetTop + section.offsetHeight * 0.55);
  });

  await expect(page.getByRole("tab", { name: "Screening" })).toBeVisible();
  await page.getByRole("tab", { name: "Studies" }).click();
  await expect(page.getByText("Wetland delineation")).toBeVisible();
  await expect(page.getByText("The city decides which studies an application needs.")).toBeVisible();
});

test("Landing: no WCAG 2.1 A or AA violations and no sideways scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(scrollsSideways).toBe(false);
});
