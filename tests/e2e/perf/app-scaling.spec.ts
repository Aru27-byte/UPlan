import { expect, test } from "@playwright/test";

import { createProject, deleteProject, uniqueTitle } from "../support/app";
import { PERF_PROJECTS, ms } from "../support/env";
import { measureNavigation, observePerformance } from "../support/perf";
import { percentile, seconds } from "../support/stats";

// What happens to a page as the data behind it grows. A planner with ten projects, then fifty, then a project with a
// long feedback history. The dashboard lists a person's own research and the list is capped (LIST_LIMIT), so the
// right answer is that time grows slowly and then stops growing. Tagged @perf; E2E_PERF_PROJECTS sets how far to go
// (default 10; the projects are the planner's own and are deleted at the end, records kept).

test.describe.configure({ mode: "serial" });

const titles: string[] = [];

test.afterAll(async ({ browser, baseURL }, testInfo) => {
  if (titles.length === 0) return;
  const context = await browser.newContext({ baseURL, storageState: testInfo.project.use.storageState });
  const page = await context.newPage();
  try {
    for (const title of titles) await deleteProject(page, title);
  } finally {
    await context.close();
  }
});

test("@perf the dashboard as the list grows from the person's current count to ten more projects", async ({
  page,
}, testInfo) => {
  await observePerformance(page);
  const ready = page.getByRole("heading", { name: /Welcome back/ });
  const rows = async () => page.getByRole("button", { name: /^Delete research:/ }).count();
  const sample = async () => {
    await measureNavigation(page, "/dashboard", ready);
    const runs: number[] = [];
    for (let i = 0; i < 3; i += 1) runs.push((await measureNavigation(page, "/dashboard", ready)).readyMs);
    const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    return { rows: await rows(), readyP50: percentile(runs, 50), nodes };
  };

  const points = [await sample()];
  const steps = [Math.ceil(PERF_PROJECTS / 2), PERF_PROJECTS - Math.ceil(PERF_PROJECTS / 2)];
  for (const n of steps) {
    for (let i = 0; i < n; i += 1) {
      const title = uniqueTitle("perf-scale");
      await createProject(page, { title });
      titles.push(title);
    }
    points.push(await sample());
  }

  await testInfo.attach("dashboard-scaling.json", {
    body: JSON.stringify(points, null, 2),
    contentType: "application/json",
  });
  testInfo.annotations.push({
    type: "scaling",
    description: points.map((p) => `${p.rows} projects: ${seconds(p.readyP50)}, ${p.nodes} nodes`).join("; "),
  });

  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) throw new Error("no measurements");
  expect(last.rows, "the projects were created and listed").toBeGreaterThanOrEqual(
    first.rows + Math.min(PERF_PROJECTS, 5),
  );
  expect(
    last.readyP50,
    `with ${last.rows} projects the dashboard took ${seconds(last.readyP50)}`,
  ).toBeLessThanOrEqual(first.readyP50 * 2.5 + ms(500));
  expect(last.readyP50).toBeLessThanOrEqual(ms(5_000));
  // Each row is a fixed amount of markup; the page may not grow faster than its rows.
  const perRow = (last.nodes - first.nodes) / Math.max(1, last.rows - first.rows);
  expect(perRow, `${perRow.toFixed(0)} DOM nodes per added project`).toBeLessThanOrEqual(220);
});

test("@perf the dashboard is capped: it never lists more than its limit, and says so", async ({ page }) => {
  await page.goto("/dashboard");
  const listed = await page.getByRole("button", { name: /^Delete research:/ }).count();
  const note = page.getByText(/^Showing your \d+ most recent projects\./);
  if ((await note.count()) > 0) {
    const limit = Number(/\d+/.exec(await note.innerText())?.[0] ?? "0");
    expect(listed, "the list is exactly the stated limit").toBe(limit);
  } else {
    expect(listed, "no note, so the list is under its limit").toBeLessThan(200);
  }
});

test("@perf a project with a long feedback history: 30 notes, and the Overview still opens inside the budget", async ({
  page,
}, testInfo) => {
  const title = uniqueTitle("perf-history");
  const id = await createProject(page, { title });
  titles.push(title);
  const times: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    await page.goto(`/projects/${id}/evidence`);
    await page
      .getByLabel("Feedback on this section")
      .fill(`Note ${i}: please check the vintage of the stream layer.`);
    const started = performance.now();
    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.getByRole("status").filter({ hasText: "Feedback recorded." }).waitFor();
    times.push(performance.now() - started);
  }
  await observePerformance(page);
  const nav = await measureNavigation(
    page,
    `/projects/${id}/evidence`,
    page.getByText(/Earlier feedback \(30\)/),
  );

  testInfo.annotations.push({
    type: "history",
    description: `feedback write p95 ${seconds(percentile(times, 95))} at 30 notes; page ready ${seconds(nav.readyMs)}`,
  });
  expect(percentile(times.slice(-10), 95), "writes do not slow as the history grows").toBeLessThanOrEqual(
    percentile(times.slice(0, 10), 95) * 2 + ms(500),
  );
  expect(nav.readyMs).toBeLessThanOrEqual(ms(4_000));
  expect(nav.weight.totalKb, "page weight with 30 notes (KB)").toBeLessThanOrEqual(1_200);
});
