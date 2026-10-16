import { createHash } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

import { PHASES, PHASE_TITLE, goToStep, stageLink, type Phase } from "./app";
import { DOCUMENT_TIMEOUT_MS } from "./env";

// Steps a planner repeats in every whole-workflow spec.

/** Opens one phase through the rail and records "Reviewed" at its current output. */
export async function reviewPhase(page: Page, phase: Phase, note?: string): Promise<void> {
  await goToStep(page, phase);
  const review = page.locator("section", { has: page.getByRole("heading", { name: "Your review" }) });
  if (note) await review.getByLabel("Note (optional)").fill(note);
  await review.getByRole("button", { name: "Record review" }).click();
  await expect(review.getByRole("status").filter({ hasText: "Review recorded." })).toBeVisible();
  await expect(stageLink(page, PHASE_TITLE[phase])).toContainText("Reviewed");
}

export async function reviewEveryPhase(page: Page): Promise<void> {
  for (const phase of PHASES) await reviewPhase(page, phase);
}

/**
 * After a research change only the phases whose output changed ask for a new review; the rest keep theirs.
 * Reads each phase's state from the stage rail and reviews exactly those that say "Needs review".
 */
export async function reviewPhasesThatNeedIt(page: Page): Promise<void> {
  for (const phase of PHASES) {
    const state = await stageLink(page, PHASE_TITLE[phase]).innerText();
    if (state.includes("Needs review")) await reviewPhase(page, phase);
  }
}

/** Presses Finish (or Publish) on the Report step and waits until the document is published. */
export async function finishAndWait(page: Page, version: number): Promise<void> {
  await goToStep(page, "report");
  const button = page.getByRole("button", {
    name: version === 1 ? "Finish research and generate the document" : `Publish version ${version}`,
  });
  await button.click();
  await expect(page.getByRole("heading", { name: "Generating the document" })).toBeVisible();
  const header = page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]");
  await expect(
    header.getByText(`Completed · version ${version}`),
    `Version ${version} was not published within ${DOCUMENT_TIMEOUT_MS / 1000}s. Is the worker running (npm run worker:dev)?`,
  ).toBeVisible({ timeout: DOCUMENT_TIMEOUT_MS });
}

export type DownloadedDocument = {
  status: number;
  contentType: string | undefined;
  disposition: string | undefined;
  headerSha256: string | undefined;
  bytes: Buffer;
  computedSha256: string;
};

/** Downloads a published version through the signed-in session, as the Download button does. */
export async function downloadDocument(
  page: Page,
  projectId: string,
  version: number,
): Promise<DownloadedDocument> {
  const response = await page.request.get(`/api/projects/${projectId}/documents/${version}`);
  const bytes = await response.body();
  return {
    status: response.status(),
    contentType: response.headers()["content-type"],
    disposition: response.headers()["content-disposition"],
    headerSha256: response.headers()["x-content-sha256"],
    bytes,
    computedSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** The row of the Report step's versions table for one version. */
export function versionRow(page: Page, version: number): Locator {
  return page
    .getByRole("rowheader", { name: new RegExp(`^Version ${version}\\b`) })
    .locator("xpath=ancestor::tr[1]");
}

/** The SHA-256 the Report step prints for a version. */
export async function shownSha256(page: Page, version: number): Promise<string> {
  const text = await versionRow(page, version).innerText();
  const match = /SHA-256\s+([0-9a-f]{64})/.exec(text);
  if (!match?.[1]) throw new Error(`The Report step shows no SHA-256 for version ${version}.`);
  return match[1];
}
