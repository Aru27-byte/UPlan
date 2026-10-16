import { expect, test as setup } from "@playwright/test";

import { signInThroughTheForm } from "./support/app";
import { AUTH_FILE } from "./support/env";

// Signs in once through the real form and saves the session, so the signed-in specs start on the dashboard.
// The journeys sign in again themselves, because logging in is the first step of the workflow they cover.
setup("sign in as the E2E person and save the session", async ({ page }) => {
  await signInThroughTheForm(page);
  await expect(page, "Sign-in did not reach the dashboard. Check E2E_EMAIL and E2E_PASSWORD.").toHaveURL(
    /\/dashboard$/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
  await page.context().storageState({ path: AUTH_FILE });
});
