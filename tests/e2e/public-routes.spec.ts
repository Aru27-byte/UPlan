import { expect, test } from "@playwright/test";

import { STAGES, UNKNOWN_PROJECT_ID, expectNoAxeViolations, expectNoHorizontalScroll } from "./support/app";

// Every route a signed-out visitor can reach, and every route that must turn them away (accounts-roles.md R10).
// No sign-in and no Supabase project is needed: the proxy answers before any session is read.

test.describe("public API", () => {
  test("R10: /api/health answers with only `ok` and the names of failing checks, never internals", async ({
    request,
  }) => {
    const response = await request.get("/api/health", { maxRedirects: 0 });

    // 503 is a legitimate answer when a dependency is down; what matters is that the body and status agree.
    expect([200, 503]).toContain(response.status());
    const body: unknown = await response.json();
    expect(body).toEqual({ ok: expect.any(Boolean), failing: expect.any(Array) });
    const { ok, failing } = body as { ok: boolean; failing: unknown[] };
    expect(response.status()).toBe(ok ? 200 : 503);
    expect(ok).toBe(failing.length === 0);
    for (const name of failing) expect(typeof name).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/postgres|stack|select |password|secret|at \w+\.\w+ \(/i);
  });

  test("R10: /api/health is reachable without a session (it is exempt from the sign-in redirect)", async ({
    request,
  }) => {
    const response = await request.get("/api/health", { maxRedirects: 0 });
    expect(response.status()).not.toBe(307);
    expect(response.headers().location).toBeUndefined();
  });
});

// A representative path for every protected screen and API. The proxy is not the security boundary (each module
// function checks access again), but it is the first door, and a regression that opens it is worth catching.
const PROTECTED_PATHS = [
  "/dashboard",
  "/profile",
  "/help",
  "/projects",
  "/projects/new",
  ...STAGES.map((s) => `/projects/${UNKNOWN_PROJECT_ID}/${s.step}`),
  `/projects/${UNKNOWN_PROJECT_ID}`,
  "/api/profile/template",
  `/api/projects/${UNKNOWN_PROJECT_ID}/documents/1`,
  "/some/page/that/does/not/exist",
];

test.describe("signed-out redirects", () => {
  for (const path of PROTECTED_PATHS) {
    test(`R10: ${path} redirects to sign-in and remembers where it was going`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      const location = new URL(response.headers().location ?? "", "http://uplan.invalid");
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("next")).toBe(path);
    });
  }

  test("R10: following the redirect lands on the sign-in form, not an error page", async ({ page }) => {
    const path = `/projects/${UNKNOWN_PROJECT_ID}/impact`;
    await page.goto(path);

    await expect(page).toHaveURL(
      (url) => url.pathname === "/sign-in" && url.searchParams.get("next") === path,
    );
    await expect(page.getByRole("heading", { name: "Sign in to UPlan" })).toBeVisible();
  });
});

test.describe("landing page", () => {
  test("the page states the pilot, the spine, and what UPlan never does", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Develop or preserve. Decide with the evidence.");
    await expect(page.getByText("Piloting with the City of Sammamish, WA")).toBeVisible();
    await expect(page.getByText("Never clears land")).toBeVisible();
    await expect(page.getByText("Never makes the call")).toBeVisible();
    await expect(page.getByText("Provenance on every figure")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Verdicts rendered" })).toHaveText(/^0\s*Verdicts rendered$/);
  });

  test("every call to action leads to sign-in or register", async ({ page }) => {
    await page.goto("/");

    const launch = page.getByRole("link", { name: /Launch UPlan/ });
    await expect(launch).toHaveCount(2);
    for (const link of await launch.all()) await expect(link).toHaveAttribute("href", "/sign-in");
    await expect(page.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
    await expect(page.locator("footer").getByRole("link", { name: /Sign in/ })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("Launch UPlan opens the sign-in form", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Launch UPlan/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in to UPlan" })).toBeVisible();
  });

  test("R12: no WCAG 2.1 A or AA violations, and no sideways scroll", async ({ page }) => {
    await page.goto("/");
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("sign-in form", () => {
  test("R10: submitting an empty form is stopped by the browser and sends nothing", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(
      true,
    );
  });

  test("R10: an address that is not an email is stopped by the browser", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("whatever-it-is");
    await page.getByRole("button", { name: "Sign in" }).click();

    expect(await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(
      true,
    );
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("R1: wrong credentials show one plain message, keep the email, and clear the password", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("nobody-e2e@example.test");
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 20_000 });
    // Either Supabase said no, or it could not be reached; each reads differently and neither leaks a stack.
    await expect(alert).toHaveText(
      /That email and password don't match|Too many attempts|couldn't reach the sign-in service|Confirm your email/,
    );
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByLabel("Email")).toHaveValue("nobody-e2e@example.test");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("R12: the password can be shown and hidden, and the toggle says which state it is in", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("a-secret-value");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("R10: Register leads to the register form and Sign in leads back", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register$/);

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("R10: a confirmation-link failure notice is explained, with the way forward", async ({ page }) => {
    await page.goto("/sign-in?notice=confirm-failed");

    await expect(page.locator("main").getByRole("status")).toContainText(
      "We couldn't finish that confirmation link",
    );
    await expect(page.getByRole("status")).toContainText("try signing in");
  });

  test("R10: an unknown notice key shows nothing rather than echoing the query string", async ({ page }) => {
    await page.goto("/sign-in?notice=%3Cscript%3Ealert(1)%3C/script%3E");

    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator("script", { hasText: "alert(1)" })).toHaveCount(0);
  });
});

test.describe("register form", () => {
  test("R11: an address that is not an email is stopped by the browser", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Pat Planner");
    await page.getByLabel("Email").fill("pat-at-example");
    await page.getByLabel("Password", { exact: true }).fill("long enough password");
    await page.getByLabel("Confirm password").fill("long enough password");
    await page.getByRole("button", { name: "Create account" }).click();

    expect(await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(
      true,
    );
    await expect(page).toHaveURL(/\/register$/);
  });

  test("R11: a password shorter than eight characters is stopped before anything is sent", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Pat Planner");
    await page.getByLabel("Email").fill("pat@example.test");
    await page.getByLabel("Password", { exact: true }).pressSequentially("short");
    await page.getByLabel("Confirm password").pressSequentially("short");
    await page.getByRole("button", { name: "Create account" }).click();

    expect(
      await page
        .getByLabel("Password", { exact: true })
        .evaluate((el: HTMLInputElement) => el.validity.tooShort),
    ).toBe(true);
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
  });

  test("R11: the form says how long a password must be", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("At least 8 characters.")).toBeVisible();
  });
});
