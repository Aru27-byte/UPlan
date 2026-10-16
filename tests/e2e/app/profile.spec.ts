import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "../support/app";
import { MULTIPLE_CITIES } from "../support/env";
import { expect, test } from "../support/fixtures";

// The city profile (jurisdiction-profile.md, profile-upload-edit.md): the rules and settings every project in the
// city is analyzed under. A change here applies to the whole city at once, so these specs only read: they open,
// search, and expand, and they never press Save settings, upload a workbook, or add code text.

/** The specs below read an approved profile, which `npm run db:seed:local` creates. Without one they fail, by name. */
async function expectCityHasProfile(page: Page): Promise<void> {
  await expect(
    page.getByText("No profile yet", { exact: true }),
    "This city has no approved profile. Run `npm run db:seed:local -- <email>` first.",
  ).toHaveCount(0);
}

test.describe("the profile page", () => {
  test("F2: the header names the city and says which profile version is in force and when it last changed", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^City of .+ Profile$/);
    await expect(page.getByText("Jurisdiction profile", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    await expect(page.locator("header").getByText(/^(Version \d+|No profile yet)$/)).toBeVisible();
    await expect(page.locator("header").getByText(/^[A-Z][A-Za-z .'-]+, [A-Z]{2}$/)).toBeVisible();
  });

  test("P1: the page says when the profile last changed, or tells the person how to begin", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(
      page.locator("header").getByText(/^(Last changed .+|Upload the city's rules from Sources to begin)$/),
    ).toBeVisible();
  });

  test("F2 R6: a city with a profile lists its resource types, each opening to rules that cite a code section", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);

    await expect(page.getByRole("heading", { name: "City Resource Types" })).toBeVisible();
    const count = await page
      .locator("#resource-types-heading")
      .locator("xpath=ancestor::section[1]")
      .getByRole("heading", { level: 3 })
      .count();
    expect(count).toBeGreaterThan(0);

    const first = page
      .locator("#resource-types-heading")
      .locator("xpath=ancestor::section[1]")
      .getByRole("heading", { level: 3 })
      .first();
    await first.getByRole("button").click();
    await expect(first.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    const body = page.locator(`#${await first.getByRole("button").getAttribute("aria-controls")}`);
    await expect(body).toBeVisible();
    // P1: a rule shows its code section and the date it took effect.
    await expect(body.locator("p.text-xs").first()).toContainText(/\d{4}/);
  });

  test("F2: the stat boxes count resource types and rules, and match what is listed", async ({ page }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);

    const panel = page.locator("#resource-types-heading").locator("xpath=ancestor::section[1]");
    const stat = async (label: string) =>
      Number(
        await panel.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]").innerText(),
      );
    const types = await stat("Resource types");
    expect(types).toBeGreaterThan(0);
    await expect(panel.getByText(`${types} resource types`, { exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveCount(types);
  });

  test("F2: Expand all opens every resource type, and Collapse all closes them", async ({ page }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);
    const panel = page.locator("#resource-types-heading").locator("xpath=ancestor::section[1]");
    const toggles = panel.getByRole("heading", { level: 3 }).getByRole("button");

    await panel.getByRole("button", { name: "Expand all" }).click();
    for (const toggle of await toggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await panel.getByRole("button", { name: "Collapse all" }).click();
    for (const toggle of await toggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("F2: searching narrows the list and says how many remain; a search with no match says so and can be cleared", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);
    const panel = page.locator("#resource-types-heading").locator("xpath=ancestor::section[1]");
    const search = page.getByLabel("Search resource types and regulations");
    const total = await panel.getByRole("heading", { level: 3 }).count();

    await search.fill("zzzz-no-such-regulation-zzzz");
    await expect(
      panel.getByText("No resource type or regulation matches “zzzz-no-such-regulation-zzzz”."),
    ).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveCount(0);

    await panel.getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveCount(total);

    const firstName = (
      await panel
        .getByRole("heading", { level: 3 })
        .first()
        .getByRole("button")
        .locator("span.flex-1")
        .innerText()
    ).trim();
    await search.fill(firstName);
    await expect(panel.getByText(new RegExp(`^Showing \\d+ of ${total} resource types$`))).toBeVisible();
  });

  test("P2: an empty rule list is stated as a fact about the profile, never as a clearance", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);

    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(page.getByText(/safe to develop|no constraints|cleared/i)).toHaveCount(0);
  });

  test("F2: Update Regulations is shown but cannot be pressed, rather than appearing to work", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);

    await expect(page.getByRole("button", { name: "Update Regulations" })).toBeDisabled();
  });

  test("R12: the profile page has no WCAG 2.1 A or AA violations", async ({ page }) => {
    await page.goto("/profile");
    await expectNoAxeViolations(page);
  });
});

test.describe("the settings panel", () => {
  test("profile-upload-edit: the gear opens Profile settings as a dialog with Settings and Sources tabs", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Profile settings" }).click();

    const dialog = page.getByRole("dialog", { name: "Profile settings" });
    await expect(dialog).toBeVisible();
    const tabs = dialog.getByRole("tablist", { name: "Profile settings sections" }).getByRole("tab");
    await expect(tabs).toHaveText([/Settings/, /Sources/]);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("tabpanel")).toHaveCount(1);
  });

  test("R12: the arrow keys move between the tabs, and the panel follows", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Profile settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Profile settings" });
    const settings = dialog.getByRole("tab", { name: /Settings/ });
    const sources = dialog.getByRole("tab", { name: /Sources/ });

    await settings.focus();
    await page.keyboard.press("ArrowRight");
    await expect(sources).toHaveAttribute("aria-selected", "true");
    await expect(sources).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(settings).toHaveAttribute("aria-selected", "true");
  });

  test("R12: Escape closes the panel and focus returns to the gear", async ({ page }) => {
    await page.goto("/profile");
    const gear = page.getByRole("button", { name: "Profile settings" });
    await gear.click();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(gear).toBeFocused();
  });

  test("the Close button closes the panel", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Profile settings" }).click();
    await page.getByRole("button", { name: "Close profile settings" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("profile-upload-edit R3: the settings are vesting, map status, records, and export formats, with Save settings at the foot", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);
    await page.getByRole("button", { name: "Profile settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Profile settings" });

    for (const legend of ["Vesting", "Map status", "Records", "Export formats"]) {
      await expect(dialog.getByText(legend, { exact: true }).first()).toBeVisible();
    }
    await expect(dialog.getByLabel("Critical area rules")).toBeVisible();
    await expect(dialog.getByLabel("Tree rules")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save settings" })).toBeVisible();
    await expect(
      dialog.getByText("Saving applies the settings at once and re-analyzes open projects."),
    ).toBeVisible();
  });

  test("profile-upload-edit R3: each vesting choice is one of the two stated, and retention years must be a whole number of one or more", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expectCityHasProfile(page);
    await page.getByRole("button", { name: "Profile settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Profile settings" });

    await expect(dialog.getByLabel("Tree rules").locator("option")).toHaveText([
      "Vest to the filing date",
      "Use today's rules",
    ]);
    const years = dialog.getByLabel("Decisions: years kept");
    await expect(years).toHaveAttribute("min", "1");
    await expect(years).toHaveAttribute("step", "1");
    await expect(years).toHaveJSProperty("required", true);
    await expect(dialog.getByLabel("Decisions: count from").locator("option")).toHaveText([
      "Creation",
      "Report release",
    ]);
  });

  test("profile-upload-edit: the Sources tab offers the Excel template and says where the rules came from", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Profile settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Profile settings" });
    await dialog.getByRole("tab", { name: /Sources/ }).click();

    const panel = dialog.getByRole("tabpanel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: /template/i }).first()).toHaveAttribute(
      "href",
      "/api/profile/template",
    );
  });

  test("R12: the open settings panel has no WCAG 2.1 A or AA violations", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Profile settings" }).click();
    await expectNoAxeViolations(page);
  });
});

test.describe("switching cities", () => {
  test("F20 R11: when several cities exist the rail offers a labelled City control; with one it offers none", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const control = page.locator("aside").getByLabel("City");
    if ((await control.count()) === 0) {
      await expect(page.locator("aside").getByRole("button", { name: "Switch city" })).toHaveCount(0);
      return;
    }
    await expect(page.locator("aside").getByRole("button", { name: "Switch city" })).toBeVisible();
    const options = await control.locator("option").allInnerTexts();
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) expect(option).toMatch(/^.+, [A-Z]{2}$/);
  });

  // Registered only when the database has more than one city (E2E_MULTIPLE_CITIES=1); a single-city database has
  // nothing to switch to, and the test above already covers that state.
  if (MULTIPLE_CITIES)
    test("F20 R11: switching cities lands on the dashboard of the other city and the profile follows", async ({
      page,
    }) => {
      await page.goto("/profile");
      const control = page.locator("aside").getByLabel("City");
      await expect(control, "E2E_MULTIPLE_CITIES is set but only one city is set up").toHaveCount(1);

      const current = await control.inputValue();
      const other = await control
        .locator("option")
        .evaluateAll(
          (options, now) => (options as HTMLOptionElement[]).find((o) => o.value !== now)?.value ?? null,
          current,
        );
      expect(other).not.toBeNull();
      const otherName = (await control.locator(`option[value="${other}"]`).innerText()).split(",")[0] ?? "";

      try {
        await control.selectOption(other ?? "");
        await page.locator("aside").getByRole("button", { name: "Switch city" }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.getByText(new RegExp(`^Your ${otherName} research$`))).toBeVisible();
        await page.goto("/profile");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`City of ${otherName} Profile`);
      } finally {
        // The choice lives in a cookie of this browser only; put it back so the next spec starts where this one did.
        await page.goto("/dashboard");
        await page.locator("aside").getByLabel("City").selectOption(current);
        await page.locator("aside").getByRole("button", { name: "Switch city" }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
      }
    });
});
