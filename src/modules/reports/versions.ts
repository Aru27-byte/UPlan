import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import type { Actor } from "@/modules/accounts";
import { getDecision } from "@/modules/decisions";
import { appUser } from "@/platform/auth-tables";
import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError } from "@/platform/errors";

import { ReportSnapshotSchema, type PhaseKey, type ReportSnapshot } from "./snapshot";
import { report } from "./tables";

// TechDesign/research-changes.md, "Downloading and history" (F22 R9, R12). Every function reaches the
// project through getDecision first, so someone else's project, a deleted one, and an absent one all read
// as "not found" (accounts-roles.md R7). The list never selects `pdf`: history stays fast however many
// versions exist.

export type DocumentVersion = {
  reportId: string;
  versionNumber: number;
  releasedAt: Date;
  publishedByName: string;
  changeNote: string | null;
  changedPhases: PhaseKey[];
  detailsChanged: boolean;
  previousVersion: number | null;
  usesSampleData: boolean;
  sizeBytes: number;
  pdfSha256: string;
  isLatest: boolean;
};

/** Every published version of a project's document, newest first (R9). */
export async function listDocumentVersions(actor: Actor, decisionId: string): Promise<DocumentVersion[]> {
  await getDecision(actor, decisionId);
  return listDocumentVersionsInternal(decisionId);
}

/**
 * The same list without the ownership read, for a caller that has just authorized the project itself
 * (the workflow module's getWorkflow, which reads the project first and would otherwise read it twice
 * in a row — one more database round trip on every page).
 */
export async function listDocumentVersionsInternal(decisionId: string): Promise<DocumentVersion[]> {
  const rows = await db
    .select({
      id: report.id,
      versionNumber: report.versionNumber,
      releasedAt: report.releasedAt,
      changeNote: report.changeNote,
      snapshot: report.snapshot,
      pdfSha256: report.pdfSha256,
      sizeBytes: sql<number>`octet_length(${report.pdf})`,
      publishedByName: appUser.name,
    })
    .from(report)
    .innerJoin(appUser, eq(appUser.id, report.requestedBy))
    .where(and(eq(report.decisionId, decisionId), eq(report.status, "released")))
    .orderBy(desc(report.versionNumber));

  return rows.map((r, index) => {
    // report_released_shape guarantees these on a released row; checked, not assumed.
    if (r.versionNumber === null || r.releasedAt === null || r.pdfSha256 === null) {
      throw new Error(`released report ${r.id} is missing its version, release time, or hash`);
    }
    const snapshot = ReportSnapshotSchema.parse(r.snapshot);
    return {
      reportId: r.id,
      versionNumber: r.versionNumber,
      releasedAt: r.releasedAt,
      publishedByName: r.publishedByName,
      changeNote: r.changeNote,
      changedPhases: snapshot.phases.filter((p) => p.changed).map((p) => p.phase),
      detailsChanged: snapshot.detailsChanged,
      previousVersion: snapshot.previousVersion,
      usesSampleData: snapshot.details.usesSampleData,
      sizeBytes: Number(r.sizeBytes), // octet_length arrives as a number or a numeric string
      pdfSha256: r.pdfSha256,
      isLatest: index === 0,
    };
  });
}

export type DocumentAttempt = { status: "releasing" | "released" | "failed"; errorDetail: string | null; requestedAt: Date };

/** The most recent attempt to publish, released or not: how the Report page shows "generating" and a failure with its reason. */
export async function getLatestAttempt(actor: Actor, decisionId: string): Promise<DocumentAttempt | null> {
  await getDecision(actor, decisionId);
  const [row] = await db
    .select({ status: report.status, errorDetail: report.errorDetail, requestedAt: report.requestedAt })
    .from(report)
    .where(eq(report.decisionId, decisionId))
    .orderBy(desc(report.sequenceNumber))
    .limit(1);
  if (!row) return null;
  if (row.status !== "releasing" && row.status !== "released" && row.status !== "failed") {
    throw new Error(`report has an unknown status: ${row.status}`);
  }
  return { status: row.status, errorDetail: row.errorDetail, requestedAt: row.requestedAt };
}

/**
 * The stored bytes of one version, with their hash recomputed and checked against the recorded one, so a
 * corrupted row is an error and never a bad download (R12).
 */
export async function getDocumentFile(
  actor: Actor,
  decisionId: string,
  versionNumber: number,
): Promise<{ bytes: Buffer; sha256: string; filename: string }> {
  const decision = await getDecision(actor, decisionId);
  const [row] = await db
    .select({ pdf: report.pdf, pdfSha256: report.pdfSha256 })
    .from(report)
    .where(and(eq(report.decisionId, decisionId), eq(report.versionNumber, versionNumber), eq(report.status, "released")));
  if (!row?.pdf || !row.pdfSha256) throw new NotFoundError("document version");
  const actual = createHash("sha256").update(row.pdf).digest("hex");
  if (actual !== row.pdfSha256) {
    throw new Error(`the stored bytes of document version ${versionNumber} do not match their recorded hash`);
  }
  const slug = decision.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return { bytes: row.pdf, sha256: row.pdfSha256, filename: `${slug}-v${versionNumber}.pdf` };
}

/**
 * The highest published version's snapshot, for workflow's change summary (F22 R5). System authority:
 * the caller holds the decision lock, inside the transaction it passes.
 */
export async function getLatestReleasedSnapshot(
  tx: DbOrTx,
  decisionId: string,
): Promise<{ versionNumber: number; snapshot: ReportSnapshot } | null> {
  const [row] = await tx
    .select({ versionNumber: report.versionNumber, snapshot: report.snapshot })
    .from(report)
    .where(and(eq(report.decisionId, decisionId), eq(report.status, "released")))
    .orderBy(desc(report.versionNumber))
    .limit(1);
  if (!row) return null;
  if (row.versionNumber === null) throw new Error("a released report has no version number");
  return { versionNumber: row.versionNumber, snapshot: ReportSnapshotSchema.parse(row.snapshot) };
}
