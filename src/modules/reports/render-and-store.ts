import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { markFinishFailed, markReportReleased } from "@/modules/decisions";
import { db } from "@/platform/db";
import { ConflictError } from "@/platform/errors";

import { renderReportHtml } from "./render";
import { ReportSnapshotSchema } from "./snapshot";
import { report } from "./tables";

// Deliberately its own file, never re-exported by index.ts: render.ts (imported below) pulls in
// `react-dom/server`, and Next.js 16 refuses to let that be reachable — even via a dynamic
// `import()` — from anything the app router's build graph can reach, route handlers included. These
// functions only ever run as a worker job (src/worker/tasks.ts imports them with a deep import,
// bypassing index.ts on purpose — see that file's comment), so they must stay out of every path a
// Next.js page or route handler's import graph could touch.

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * The release_report job body (TechDesign/research-changes.md, "The document job"). Two steps:
 * rendering, which has no side effect, and storing, which is one transaction that compare-and-sets the
 * row from `releasing` to `released`. So two attempts of one finish can't both store, and a retry
 * after success finds the row already released and does nothing (F10 R11).
 */
export async function renderAndStoreReport(reportId: string): Promise<void> {
  const [row] = await db.select().from(report).where(eq(report.id, reportId));
  if (!row) throw new Error(`report ${reportId} not found`);
  if (row.status !== "releasing") return; // already released, or already failed: nothing left to do

  const html = await renderReportHtml(reportId);
  const pdf = await printToPdf(html); // Playwright, tagged + outline — F10 R8
  const pdfSha256 = sha256(pdf);
  const snapshot = ReportSnapshotSchema.parse(row.snapshot);
  const expectedVersion = (snapshot.previousVersion ?? 0) + 1; // what the document printed

  await db.transaction(async (tx) => {
    const released = await tx
      .update(report)
      .set({
        status: "released",
        pdf,
        pdfSha256,
        releasedAt: sql`now()`,
        // Assigned only here, inside the one-in-flight window, so version numbers have no gaps; the
        // partial unique index on (decision_id, version_number) is the last guard (F22 R2).
        versionNumber: sql`(select coalesce(max(version_number), 0) + 1 from report where decision_id = ${row.decisionId})`,
      })
      .where(and(eq(report.id, reportId), eq(report.status, "releasing")))
      .returning({ versionNumber: report.versionNumber });
    const [stored] = released;
    if (!stored) throw new ConflictError("This document was already finished.");
    if (stored.versionNumber !== expectedVersion) {
      // The printed number and the stored number must be one number; rolling back leaves the row `releasing`.
      throw new Error(`report ${reportId} printed version ${expectedVersion} but would be stored as version ${String(stored.versionNumber)}`);
    }
    await markReportReleased(row.decisionId, tx); // finishing -> report_released, exactly one row
  });
}

/**
 * After the job's last retry (src/worker/tasks.ts): the failure is recorded and shown, the project
 * returns to in progress, and no version number is used (F22 R8). One transaction.
 */
export async function markReportFailed(reportId: string, message: string): Promise<void> {
  await db.transaction(async (tx) => {
    const failed = await tx
      .update(report)
      .set({ status: "failed", errorDetail: message })
      .where(and(eq(report.id, reportId), eq(report.status, "releasing")))
      .returning({ decisionId: report.decisionId });
    const [row] = failed;
    if (!row) return; // it was released or failed already: nothing to record
    await markFinishFailed(row.decisionId, tx);
  });
}

async function printToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({ tagged: true, outline: true }); // R8 of locked-report.md
  } finally {
    await browser.close();
  }
}
