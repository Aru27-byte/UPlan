import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDecisionForAnalysis, markReportReleased } from "@/modules/decisions";
import { db } from "@/platform/db";
import { headIfExists, putIfAbsent } from "@/platform/object-storage";

import { renderReportHtml } from "./render";
import { report } from "./tables";

// Deliberately its own file, never re-exported by index.ts: render.ts (imported below) pulls in
// `react-dom/server`, and Next.js 16 refuses to let that be reachable — even via a dynamic
// `import()` — from anything the app router's build graph can reach, route handlers included. This
// function only ever runs as a worker job (src/worker/tasks.ts imports it with a deep import,
// bypassing index.ts on purpose — see that file's comment), so it must stay out of every path a
// Next.js page or route handler's import graph could touch, including release.ts (which pages do
// import, for `releaseReport`).

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** The release_report job body. */
export async function renderAndStoreReport(reportId: string): Promise<void> {
  const [row] = await db.select().from(report).where(eq(report.id, reportId));
  if (!row) throw new Error(`report ${reportId} not found`);

  const decision = await getDecisionForAnalysis(row.decisionId);
  const objectKey = `${decision.jurisdictionId}/${row.decisionId}/${row.id}.pdf`; // matches data-model.md's key pattern
  const already = await headIfExists("reports", objectKey);
  if (already?.metadata.sha256) {
    await finalizeReleased(reportId, row.decisionId, objectKey, already.metadata.sha256); // R11: idempotent retry, never re-renders
    return;
  }

  const html = await renderReportHtml(reportId);
  const pdf = await printToPdf(html); // Playwright, tagged + outline — see render.ts
  const pdfSha256 = sha256(pdf);
  await putIfAbsent("reports", objectKey, pdf, { metadata: { sha256: pdfSha256 } });
  await finalizeReleased(reportId, row.decisionId, objectKey, pdfSha256);
}

async function finalizeReleased(
  reportId: string,
  decisionId: string,
  objectKey: string,
  pdfSha256: string,
): Promise<void> {
  const updated = await db
    .update(report)
    .set({ status: "released", objectKey, pdfSha256, releasedAt: sql`now()` })
    .where(and(eq(report.id, reportId), eq(report.status, "releasing"))) // compare-and-set; report_final trigger blocks any further change
    .returning({ id: report.id });
  if (updated.length > 0) await markReportReleased(decisionId); // the one place decision.status reaches 'report_released'
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
