import type { Page } from "@playwright/test";

import { waitForAnalysisToSettle, stageLink } from "../support/app";
import { expect, test } from "../support/fixtures";

// The planner's review of a phase (research-phases.md R5-R8, R12): a record that they read THIS output. It is not
// sign-off and not approval. Each test owns a freshly analysed sample project, because a review is a permanent
// record. Needs the worker (npm run worker:dev).

const reviewPanel = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Your review" }) });
const historyOf = (page: Page) =>
  page.locator("details", { has: page.getByRole("heading", { name: "History" }) });

test.describe("recording a review", () => {
  test("R5: Reviewed records who read the output and when, and the phase reads Reviewed", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/site`);
    const review = reviewPanel(page);
    await expect(review.getByRole("radio", { name: /Reviewed\. I read this output/ })).toBeChecked();

    await review.getByRole("button", { name: "Record review" }).click();

    await expect(review.getByRole("status").filter({ hasText: "Review recorded." })).toBeVisible();
    await expect(review.getByText(/^Latest review: Reviewed by .+ on .+\.$/)).toBeVisible();
    await expect(review.getByText("Reviewed", { exact: true }).first()).toBeVisible();
    await expect(stageLink(page, "Site")).toContainText("Reviewed");
  });

  test("R8: the History lists every review, newest first, with the summary that was reviewed", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/site`);
    const review = reviewPanel(page);

    await review.getByLabel("Note (optional)").fill("First read.");
    await review.getByRole("button", { name: "Record review" }).click();
    await expect(review.getByRole("status").filter({ hasText: "Review recorded." })).toBeVisible();
    await review.getByLabel("Note (optional)").fill("Second read.");
    await review.getByRole("button", { name: "Record review" }).click();
    await expect(review.getByText(/Second read\./)).toBeVisible();

    const history = historyOf(page);
    await expect(history.locator("summary")).toContainText(
      "2 reviews, newest first. Reviews are never edited or deleted.",
    );
    await history.locator("summary").click();
    const entries = history
      .getByRole("listitem")
      .filter({ has: page.getByText("The summary that was reviewed") });
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText("Second read.");
    await expect(entries.last()).toContainText("First read.");
    await entries.first().getByText("The summary that was reviewed").click();
    await expect(entries.first().locator("li").first()).toBeVisible();
  });

  test("R6: Request a revision needs a note, says so, and the browser stops an empty one", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/evidence`);
    const review = reviewPanel(page);
    await expect(review.getByLabel("Note (optional)")).toHaveJSProperty("required", false);

    await review.getByRole("radio", { name: /Request a revision\./ }).check();
    await expect(review.getByLabel("What needs work (required)")).toHaveJSProperty("required", true);
    await review.getByRole("button", { name: "Record review" }).click();

    expect(
      await review
        .getByLabel("What needs work (required)")
        .evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing),
    ).toBe(true);
    await expect(review.getByRole("status")).toHaveCount(0);
    await expect(stageLink(page, "Evidence")).toContainText("Needs review");
  });

  test("R6: a revision request with a note is recorded, tells the planner what to do next, and shows the note", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/evidence`);
    const review = reviewPanel(page);

    await review.getByRole("radio", { name: /Request a revision\./ }).check();
    await review
      .getByLabel("What needs work (required)")
      .fill("Two sources disagree and I have not recorded which I rely on.");
    await review.getByRole("button", { name: "Record review" }).click();

    await expect(
      review
        .getByRole("status")
        .filter({ hasText: "Revision requested. Change an input above, then review the new draft." }),
    ).toBeVisible();
    await expect(
      review.getByText(/^Latest review: Revision requested by .+ on .+ — “Two sources disagree/),
    ).toBeVisible();
    await expect(stageLink(page, "Evidence")).toContainText("Revision requested");
  });

  test("R5: a review says nothing about the development, and says so on the panel", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/screening`);

    await expect(reviewPanel(page)).toContainText(
      "A review records that you read this output. It is not sign-off, and it says nothing about the development.",
    );
  });

  test("R9: reviewing one phase does not review any other", async ({ page, ownSampleProject }) => {
    await page.goto(`/projects/${ownSampleProject.id}/studies`);
    await reviewPanel(page).getByRole("button", { name: "Record review" }).click();
    await expect(stageLink(page, "Studies")).toContainText("Reviewed");

    for (const other of ["Site", "Evidence", "Screening", "Footprint", "Impact"]) {
      await expect(stageLink(page, other)).toContainText("Needs review");
    }
  });
});

test.describe("a review follows the output it was made on", () => {
  test("R7: changing the study area after a review asks for a new review and shows what changed", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/site`);
    await reviewPanel(page).getByRole("button", { name: "Record review" }).click();
    await expect(stageLink(page, "Site")).toContainText("Reviewed");

    // A new revision of the study area is a new input: the output's fingerprint moves, so the old review no longer covers it.
    await page.getByRole("button", { name: "Load sample study area" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();

    await expect(stageLink(page, "Site")).toContainText("Needs review");
    await expect(page.getByText(/What changed since your review on/)).toBeVisible();
    await expect(reviewPanel(page).getByRole("button", { name: "Record review" })).toBeVisible();
    // The earlier review is kept; it is history, not deleted.
    await historyOf(page).locator("summary").click();
    await expect(historyOf(page)).toContainText("1 review, newest first");
  });

  test("R7: a change re-runs the analysis, and the downstream phases settle on the new inputs", async ({
    page,
    ownSampleProject,
  }) => {
    await page.goto(`/projects/${ownSampleProject.id}/site`);
    await page.getByRole("button", { name: "Load sample study area" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();

    await waitForAnalysisToSettle(page);
    await page.goto(`/projects/${ownSampleProject.id}/evidence`);
    const drafted = page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) });
    await expect(drafted.locator("summary")).not.toContainText(/This phase needs a|Analysis is/);
  });
});
