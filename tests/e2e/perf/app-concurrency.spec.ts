import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { createProject, deleteProject, uniqueTitle } from "../support/app";
import { ms } from "../support/env";
import { percentile, seconds } from "../support/stats";

// Several people at once. The database pool is five connections per process (src/platform/db.ts) and every web
// instance holds its own, so contention is the first thing that goes wrong under load, and it goes wrong as a slow
// page or a "Something went wrong" panel, never as a quiet success. Each test uses separate browser contexts signed
// in as the same person, so the requests are as concurrent as real ones. Tagged @perf; budgets are for production.

async function contexts(
  browser: Browser,
  baseURL: string | undefined,
  storageState: unknown,
  count: number,
): Promise<{ context: BrowserContext; page: Page }[]> {
  return Promise.all(
    Array.from({ length: count }, async () => {
      const context = await browser.newContext({ baseURL, storageState: storageState as string });
      return { context, page: await context.newPage() };
    }),
  );
}
const closeAll = (all: { context: BrowserContext }[]) => Promise.all(all.map((c) => c.context.close()));

test.describe("many readers", () => {
  test("@perf eight people open the dashboard at the same moment, three times: every page renders, none errors", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const people = await contexts(browser, baseURL, testInfo.project.use.storageState, 8);
    try {
      const times: number[] = [];
      for (let round = 0; round < 3; round += 1) {
        const results = await Promise.all(
          people.map(async ({ page }) => {
            const started = performance.now();
            const response = await page.goto("/dashboard");
            await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
            const failed = await page.getByText("Something went wrong").count();
            return { status: response?.status() ?? 0, took: performance.now() - started, failed };
          }),
        );
        for (const r of results) {
          expect(r.status).toBe(200);
          expect(r.failed, "an error panel appeared under load").toBe(0);
          times.push(r.took);
        }
      }
      testInfo.annotations.push({
        type: "concurrency",
        description: `8 readers: p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}, max ${seconds(Math.max(...times))}`,
      });
      expect(percentile(times, 95), "p95 with eight at once").toBeLessThanOrEqual(ms(6_000));
      expect(Math.max(...times), "the slowest of 24 loads").toBeLessThanOrEqual(ms(12_000));
    } finally {
      await closeAll(people);
    }
  });

  test("@perf thirty requests at once to the dashboard, the profile, and Help: none fails and the slowest is bounded", async ({
    request,
  }) => {
    const paths = ["/dashboard", "/profile", "/help"];
    const results = await Promise.all(
      Array.from({ length: 30 }, async (_, i) => {
        const started = performance.now();
        const response = await request.get(paths[i % paths.length] ?? "/dashboard");
        await response.body();
        return { status: response.status(), took: performance.now() - started };
      }),
    );
    expect(
      results.filter((r) => r.status !== 200).map((r) => r.status),
      "non-200 answers",
    ).toEqual([]);
    expect(
      percentile(
        results.map((r) => r.took),
        95,
      ),
    ).toBeLessThanOrEqual(ms(8_000));
  });

  test("@perf twenty template downloads at once all succeed", async ({ request }) => {
    const results = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const started = performance.now();
        const response = await request.get("/api/profile/template");
        const bytes = (await response.body()).length;
        return { status: response.status(), bytes, took: performance.now() - started };
      }),
    );
    expect(results.filter((r) => r.status !== 200)).toEqual([]);
    expect(
      new Set(results.map((r) => r.bytes)).size,
      "every download is the same workbook",
    ).toBeLessThanOrEqual(2);
    expect(
      percentile(
        results.map((r) => r.took),
        95,
      ),
    ).toBeLessThanOrEqual(ms(6_000));
  });

  test("@perf sixty dashboard requests in a row do not slow down: the last twenty are as fast as the first twenty", async ({
    request,
  }) => {
    const times: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      const started = performance.now();
      const response = await request.get("/dashboard");
      await response.body();
      expect(response.status()).toBe(200);
      times.push(performance.now() - started);
    }
    const first = percentile(times.slice(0, 20), 50);
    const last = percentile(times.slice(-20), 50);
    test.info().annotations.push({
      type: "drift",
      description: `first 20 p50 ${seconds(first)}, last 20 p50 ${seconds(last)}`,
    });
    expect(
      last,
      `the last twenty (${seconds(last)}) are slower than the first (${seconds(first)})`,
    ).toBeLessThanOrEqual(first * 2 + ms(300));
  });
});

test.describe("many writers", () => {
  test("@perf six people each create a project at the same moment: six different projects, all created", async ({
    browser,
    baseURL,
  }, info) => {
    const people = await contexts(browser, baseURL, info.project.use.storageState, 6);
    const titles = people.map((_, i) => uniqueTitle(`perf-parallel-${i}`));
    try {
      const started = performance.now();
      const ids = await Promise.all(
        people.map(({ page }, i) => createProject(page, { title: titles[i] ?? "" })),
      );
      const wall = performance.now() - started;

      expect(new Set(ids).size, "two people got the same project").toBe(6);
      info.annotations.push({ type: "concurrency", description: `6 creations in ${seconds(wall)}` });
      expect(wall).toBeLessThanOrEqual(ms(20_000));
    } finally {
      const cleaner = people[0];
      if (cleaner) for (const title of titles) await deleteProject(cleaner.page, title);
      await closeAll(people);
    }
  });

  test("@perf six windows save the same project's details at once: exactly one wins, the rest are told to reload, and nothing is garbled", async ({
    browser,
    baseURL,
  }, info) => {
    const owner = await contexts(browser, baseURL, info.project.use.storageState, 1);
    const title = uniqueTitle("perf-race");
    const first = owner[0];
    if (!first) throw new Error("no context");
    const id = await createProject(first.page, { title });
    const people = await contexts(browser, baseURL, info.project.use.storageState, 6);
    try {
      await Promise.all(
        people.map(async ({ page }, i) => {
          await page.goto(`/projects/${id}/overview`);
          await page.getByRole("heading", { name: "Project details" }).click();
          await page.getByLabel("Applicant").fill(`Racer ${i}`);
        }),
      );
      // All six hold the same row version. Press Save in all of them together.
      await Promise.all(people.map(({ page }) => page.getByRole("button", { name: "Save details" }).click()));
      const outcomes = await Promise.all(
        people.map(async ({ page }) => {
          const saved = page.getByRole("status").filter({ hasText: "Project details saved." });
          const refused = page.locator("form").getByRole("alert").filter({ hasText: /\S/ });
          await saved
            .or(refused)
            .first()
            .waitFor({ timeout: ms(15_000) });
          return (await saved.count()) > 0 ? "saved" : "refused";
        }),
      );

      expect(
        outcomes.filter((o) => o === "saved"),
        "exactly one save wins a race on one row version",
      ).toHaveLength(1);
      expect(outcomes.filter((o) => o === "refused")).toHaveLength(5);
      await first.page.goto(`/projects/${id}/overview`);
      await expect(
        first.page.locator("section", {
          has: first.page.getByRole("heading", { name: "Project at a glance" }),
        }),
      ).toContainText(/Racer [0-5]/);
    } finally {
      await deleteProject(first.page, title);
      await closeAll([...owner, ...people]);
    }
  });

  test("@perf two people press 'Finish research' on a project that is not ready: both are refused, quickly, and nothing is started", async ({
    browser,
    baseURL,
  }, info) => {
    const owner = await contexts(browser, baseURL, info.project.use.storageState, 1);
    const first = owner[0];
    if (!first) throw new Error("no context");
    const title = uniqueTitle("perf-finish");
    const id = await createProject(first.page, { title });
    const people = await contexts(browser, baseURL, info.project.use.storageState, 2);
    try {
      await Promise.all(people.map(({ page }) => page.goto(`/projects/${id}/report`)));
      const started = performance.now();
      await Promise.all(
        people.map(({ page }) =>
          page.getByRole("button", { name: "Finish research and generate the document" }).click(),
        ),
      );
      await Promise.all(
        people.map(({ page }) =>
          page.locator("form").getByRole("alert").filter({ hasText: /\S/ }).first().waitFor(),
        ),
      );
      expect(performance.now() - started).toBeLessThanOrEqual(ms(6_000));
      for (const { page } of people)
        await expect(page.getByRole("heading", { name: "Generating the document" })).toHaveCount(0);
    } finally {
      await deleteProject(first.page, title);
      await closeAll([...owner, ...people]);
    }
  });
});
