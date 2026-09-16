import { defineConfig, devices } from "@playwright/test";

// Release 1 end-to-end coverage per .claude/rules/testing-and-verification.md: upload a profile,
// approve it, create a decision, trace a footprint, see the impact, release the report — each spec
// also runs @axe-core/playwright for WCAG 2.1 AA, and the map/footprint specs also run at phone width.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
