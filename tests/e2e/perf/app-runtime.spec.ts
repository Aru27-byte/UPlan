import type { Page } from "@playwright/test";

import { STAGES, stageLink } from "../support/app";
import { ms } from "../support/env";
import { expect, test } from "../support/fixtures";
import { heap, observePerformance, timeInteraction } from "../support/perf";
import { percentile, seconds } from "../support/stats";

// What the browser does after the page has loaded: how quickly a click is answered, whether the page leaks memory as a
// planner works for an hour, whether scrolling is smooth, and whether the map loads its tiles promptly. These are the
// measures a person feels as "snappy" or "sluggish" rather than "slow to load". Tagged @perf. Interaction timing is
// click to a painted change (two animation frames after the change), measured in the page's own clock.

const INTERACTION_P95 = 250; // ms; a response under a quarter of a second reads as immediate

function report(label: string, times: number[]): void {
  test.info().annotations.push({
    type: "interaction",
    description: `${label}: p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}`,
  });
  expect(percentile(times, 95), `${label} p95`).toBeLessThanOrEqual(ms(INTERACTION_P95));
}

async function repeat(n: number, once: () => Promise<number>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(await once());
  return out;
}

test.describe("interactions", () => {
  test("@perf the dashboard: opening and closing a row", async ({ page, sharedBlankProject }) => {
    await page.goto("/dashboard");
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: `Delete research: ${sharedBlankProject.title}` }) });
    const toggle = row.getByRole("heading", { level: 3 }).getByRole("button");
    const open = row.getByRole("link", { name: `Open overview: ${sharedBlankProject.title}` });
    const times = await repeat(10, async () => {
      const took = await timeInteraction(page, () => toggle.click(), open);
      await toggle.click();
      await open.waitFor({ state: "hidden" });
      return took;
    });
    report("open a dashboard row", times);
  });

  test("@perf the dashboard: the delete confirmation dialog opens", async ({ page, sharedBlankProject }) => {
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: `Delete research: ${sharedBlankProject.title}` });
    const times = await repeat(10, async () => {
      const took = await timeInteraction(page, () => trigger.click(), page.getByRole("dialog"));
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      return took;
    });
    report("open a confirmation dialog", times);
  });

  test("@perf a project page: opening a section", async ({ page, sharedBlankProject }) => {
    await page.goto(`/projects/${sharedBlankProject.id}/evidence`);
    const summary = page
      .locator("details", { has: page.getByRole("heading", { name: "Drafted from" }) })
      .locator("summary");
    const body = page.getByRole("link", { name: "Change the study area" });
    const times = await repeat(10, async () => {
      const took = await timeInteraction(page, () => summary.click(), body);
      await summary.click();
      await body.waitFor({ state: "hidden" });
      return took;
    });
    report("open a section", times);
  });

  test("@perf the profile: opening the settings panel and switching its tabs", async ({ page }) => {
    await page.goto("/profile");
    const gear = page.getByRole("button", { name: "Profile settings" });
    const dialog = page.getByRole("dialog", { name: "Profile settings" });
    const open = await repeat(8, async () => {
      const took = await timeInteraction(page, () => gear.click(), dialog);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      return took;
    });
    report("open the settings panel", open);

    await gear.click();
    const sources = dialog.getByRole("tab", { name: /Sources/ });
    const settings = dialog.getByRole("tab", { name: /Settings/ });
    const switching = await repeat(8, async () => {
      const took = await timeInteraction(
        page,
        () => sources.click(),
        dialog.getByRole("tab", { name: /Sources/, selected: true }),
      );
      await settings.click();
      await dialog.getByRole("tab", { name: /Settings/, selected: true }).waitFor();
      return took;
    });
    report("switch a settings tab", switching);
  });

  test("@perf the profile: typing in the search narrows the list as fast as a person types", async ({
    page,
  }) => {
    await page.goto("/profile");
    const search = page.getByLabel("Search resource types and regulations");
    const count = page.getByText(/^Showing \d+ of \d+ resource types$/);
    const times = await repeat(6, async () => {
      await search.fill("");
      const started = await page.evaluate(() => performance.now());
      await search.pressSequentially("buffer", { delay: 0 });
      await count.waitFor();
      return (await page.evaluate(() => performance.now())) - started;
    });
    report(
      "type six letters into the search",
      times.map((t) => t / 2),
    );
  });

  test("@perf a form: typing into a text area and a text box answers each key at once", async ({
    page,
    sharedBlankProject,
  }) => {
    await page.goto(`/projects/${sharedBlankProject.id}/evidence`);
    const box = page.getByLabel("Feedback on this section");
    const text = "The vintage of the stream layer should be stated first. ".repeat(4);
    const started = await page.evaluate(() => performance.now());
    await box.pressSequentially(text, { delay: 0 });
    const per = ((await page.evaluate(() => performance.now())) - started) / text.length;
    test.info().annotations.push({ type: "typing", description: `${per.toFixed(1)} ms per key` });
    expect(per, "ms per keystroke").toBeLessThanOrEqual(ms(25));
    await expect(box).toHaveValue(text);
  });

  test("@perf the phone menu opens at once", async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      storageState: testInfo.project.use.storageState,
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard");
      const menu = page.getByRole("button", { name: "Menu" });
      const nav = page.getByRole("navigation", { name: "Main" });
      const times = await repeat(8, async () => {
        const took = await timeInteraction(page, () => menu.click(), nav);
        await menu.click();
        await nav.waitFor({ state: "hidden" });
        return took;
      });
      report("open the phone menu", times);
    } finally {
      await context.close();
    }
  });
});

test.describe("memory", () => {
  test("@perf a planner working through every step five times: the heap, the DOM, and the listeners stop growing", async ({
    page,
    sharedSampleProject,
  }, testInfo) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);
    const lap = async () => {
      for (const { step, title } of STAGES) {
        if (step === "overview") continue;
        await stageLink(page, title).click();
        await page.waitForURL(new RegExp(`/${step}$`));
        await page.getByRole("heading", { level: 1 }).waitFor();
      }
      await stageLink(page, "Overview").click();
      await page.waitForURL(/\/overview$/);
    };
    await lap(); // the first lap loads the code and warms the caches
    const afterFirst = await heap(page);
    for (let i = 0; i < 4; i += 1) await lap();
    const afterFifth = await heap(page);

    testInfo.annotations.push({
      type: "memory",
      description: `lap 1: ${afterFirst.heapMb.toFixed(1)} MB, ${afterFirst.nodes} nodes, ${afterFirst.listeners} listeners; lap 5: ${afterFifth.heapMb.toFixed(1)} MB, ${afterFifth.nodes} nodes, ${afterFifth.listeners} listeners`,
    });
    expect(afterFirst.heapMb, "the heap was read").toBeGreaterThan(1);
    expect(afterFifth.heapMb, "heap growth over four more laps").toBeLessThanOrEqual(
      afterFirst.heapMb * 1.5 + 5,
    );
    expect(afterFifth.nodes, "DOM growth over four more laps").toBeLessThanOrEqual(
      afterFirst.nodes * 1.25 + 200,
    );
    expect(afterFifth.listeners, "listener growth over four more laps").toBeLessThanOrEqual(
      afterFirst.listeners * 1.25 + 100,
    );
  });

  test("@perf opening and closing the settings panel twenty times leaves no extra nodes behind", async ({
    page,
  }) => {
    await page.goto("/profile");
    const gear = page.getByRole("button", { name: "Profile settings" });
    const dialog = page.getByRole("dialog", { name: "Profile settings" });
    await gear.click();
    await page.keyboard.press("Escape");
    const before = await heap(page);
    for (let i = 0; i < 20; i += 1) {
      await gear.click();
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
    const after = await heap(page);
    expect(after.nodes, "DOM nodes after 20 opens").toBeLessThanOrEqual(before.nodes + 50);
    expect(after.listeners, "listeners after 20 opens").toBeLessThanOrEqual(before.listeners + 50);
  });
});

test.describe("smoothness", () => {
  /** Scrolls the page to the bottom over about two seconds and counts the frames that took longer than 50 ms. */
  async function dropped(page: Page): Promise<{ frames: number; slow: number; worstMs: number }> {
    return page.evaluate(
      () =>
        new Promise<{ frames: number; slow: number; worstMs: number }>((resolve) => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          const start = performance.now();
          let last = start;
          let frames = 0;
          let slow = 0;
          let worst = 0;
          const tick = (now: number) => {
            const gap = now - last;
            last = now;
            frames += 1;
            if (gap > 50) slow += 1;
            worst = Math.max(worst, gap);
            const t = Math.min(1, (now - start) / 2_000);
            window.scrollTo(0, max * t);
            if (t < 1) requestAnimationFrame(tick);
            else resolve({ frames, slow, worstMs: worst });
          };
          requestAnimationFrame(tick);
        }),
    );
  }

  for (const step of ["evidence", "screening", "impact", "report"] as const) {
    test(`@perf scrolling the ${step} page with data: at most 5% of frames take over 50 ms`, async ({
      page,
      sharedSampleProject,
    }) => {
      await observePerformance(page);
      await page.goto(`/projects/${sharedSampleProject.id}/${step}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      for (const summary of await page.locator("details:not([open]) > summary").all()) await summary.click();
      const result = await dropped(page);

      test.info().annotations.push({
        type: "scroll",
        description: `${step}: ${result.slow}/${result.frames} slow frames, worst ${result.worstMs.toFixed(0)} ms`,
      });
      expect(result.frames, "the scroll ran").toBeGreaterThan(20);
      expect(result.slow / result.frames).toBeLessThanOrEqual(0.05);
      expect(result.worstMs).toBeLessThanOrEqual(ms(250));
    });
  }
});

test.describe("the map", () => {
  test("@perf the Site page's map draws, and the tiles it asks for arrive promptly and without error", async ({
    page,
    sharedSampleProject,
  }, testInfo) => {
    const tiles: { url: string; ms: number; status: number }[] = [];
    page.on("requestfinished", async (request) => {
      const url = request.url();
      if (!/\/api\/tiles\/|\/basemap\//.test(url)) return;
      const response = await request.response();
      const timing = request.timing();
      tiles.push({ url, ms: timing.responseEnd, status: response?.status() ?? 0 });
    });
    const started = Date.now();
    await page.goto(`/projects/${sharedSampleProject.id}/site`);
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.waitForLoadState("networkidle");
    const drawn = Date.now() - started;

    testInfo.annotations.push({
      type: "map",
      description: `canvas and network idle in ${seconds(drawn)}; ${tiles.length} tile requests, p95 ${
        tiles.length
          ? seconds(
              percentile(
                tiles.map((t) => t.ms),
                95,
              ),
            )
          : "n/a"
      }`,
    });
    expect(tiles.length, "the map asked for tiles").toBeGreaterThan(0);
    expect(
      tiles.filter((t) => t.status >= 400),
      "tile requests that failed",
    ).toEqual([]);
    expect(
      percentile(
        tiles.map((t) => t.ms),
        95,
      ),
      "p95 tile request",
    ).toBeLessThanOrEqual(ms(2_000));
    expect(drawn, "map drawn and idle").toBeLessThanOrEqual(ms(8_000));
  });

  test("@perf the map's content is also on the page as text, so a slow map never hides the data", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/site`);
    await expect(page.getByText("Every layer is also listed below the map as text.")).toBeVisible();
  });
});
