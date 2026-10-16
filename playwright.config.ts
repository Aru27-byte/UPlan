import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { AUTH_FILE, BASE_URL } from "./tests/e2e/support/env";

// .env holds the model key and the app's settings. The AI evaluation specs import the real model client, which
// validates the whole environment at import time, so they need the same file the app reads.
if (existsSync(".env")) process.loadEnvFile(".env");

// End-to-end coverage per .claude/rules/testing-and-verification.md. Four layers, each its own project:
//
//   public-*    No sign-in: landing, sign-in, register, redirects, public APIs.     No credentials needed.
//   app-*       One screen or function at a time, signed in (the "unit" layer).      E2E_EMAIL, E2E_PASSWORD
//   journeys    A planner's whole workflow across screens, starting at the login form. E2E_EMAIL, E2E_PASSWORD, a worker
//   ai-*        AI assist: guardrails (offline), accuracy and latency against the real model service (@live).
//
// The signed-in layers need a registered person (register once at /register) and a city with a profile and
// sample evidence (`npm run db:seed:local -- <email>`). Anything that waits for an analysis also needs the worker
// (`npm run worker:dev`). A missing variable fails the run with a message naming it; nothing falls back to a default.
//
//   npm run test:e2e        everything except the @live specs (they spend the free model allowance)
//   npm run test:e2e:ai     the AI layer, including the @live specs
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // A cold serverless function or a first dev compile can take several seconds; a slow page is not a failed one.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts" },

    // Signed out. The two device profiles give the desktop and phone-width runs the sign-in specs rely on.
    {
      name: "public-desktop",
      testIgnore: ["app/**", "journeys/**", "ai/**", "auth.setup.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-phone",
      testIgnore: ["app/**", "journeys/**", "ai/**", "auth.setup.ts"],
      use: { ...devices["Pixel 7"] },
    },

    // Signed in, one function at a time.
    {
      name: "app-desktop",
      testMatch: "app/**/*.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
    {
      name: "app-phone",
      testMatch: "app/responsive.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
    },

    // Whole workflows. Each journey starts from the sign-in form, so none uses the saved session.
    {
      name: "journeys",
      testMatch: "journeys/**/*.spec.ts",
      dependencies: ["setup"],
      timeout: 6 * 60_000,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },

    // AI assist. `ai-model` talks to the model service from Node and needs no browser or sign-in; `ai-ui` drives
    // the app. Both run one at a time so latency is measured on one request, not on a queue of them.
    {
      name: "ai-model",
      testMatch: "ai/model-*.spec.ts",
      timeout: 5 * 60_000,
      workers: 1,
    },
    {
      name: "ai-ui",
      testMatch: "ai/assist-*.spec.ts",
      dependencies: ["setup"],
      timeout: 6 * 60_000,
      workers: 1,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
  ],
  // E2E_BASE_URL points the run at a server that is already up (a dev server, a Vercel preview); without it
  // Playwright builds and starts the app itself.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 5 * 60_000,
      },
});
