import { and, eq, isNull, sql } from "drizzle-orm";

import { requireReviewer, type Actor } from "@/modules/accounts";
import { getCurrentProfileForAnalysis, ProfileDocumentSchema } from "@/modules/profiles";
import { db } from "@/platform/db";
import { ConflictError } from "@/platform/errors";

import { retentionFlag } from "./tables";

type RecordType = "decision" | "report" | "profile-change" | "records-export";

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

async function anyDecisionWithFilingDate(jurisdictionId: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`select exists(select 1 from decision where jurisdiction_id = ${jurisdictionId} and application_filed_on is not null) as "exists"`,
  );
  return rows.rows[0]?.exists ?? false;
}

// Cross-module reads by raw SQL against each owning table (decisions/reports/profiles), rather
// than deep-importing another module's Drizzle table object — records only needs the id and the
// two possible base dates, never that module's domain logic (file-structure-and-imports.md).
async function listRecordsOfType(
  jurisdictionId: string,
  recordType: RecordType,
): Promise<{ id: string; createdAt: Date; reportReleasedAt: Date | null }[]> {
  const queries: Record<RecordType, ReturnType<typeof sql>> = {
    decision: sql`select id, created_at as "createdAt", null::timestamptz as "reportReleasedAt" from decision where jurisdiction_id = ${jurisdictionId}`,
    report: sql`select r.id, r.requested_at as "createdAt", r.released_at as "reportReleasedAt"
                from report r join decision d on d.id = r.decision_id where d.jurisdiction_id = ${jurisdictionId}`,
    "profile-change": sql`select id, proposed_at as "createdAt", null::timestamptz as "reportReleasedAt" from profile_change where jurisdiction_id = ${jurisdictionId}`,
    "records-export": sql`select id, requested_at as "createdAt", null::timestamptz as "reportReleasedAt" from records_export where jurisdiction_id = ${jurisdictionId}`,
  };
  const rows = await db.execute<{ id: string; createdAt: Date; reportReleasedAt: Date | null }>(
    queries[recordType],
  );
  return rows.rows;
}

/** The flag_retention job body — daily, per jurisdiction (R1, R2, R3 of records-export.md). */
export async function flagRetention(jurisdictionId: string): Promise<void> {
  const hasRealApplication = await anyDecisionWithFilingDate(jurisdictionId);
  if (!hasRealApplication) return; // R2: nothing to flag until a real application exists

  const profile = await getCurrentProfileForAnalysis(jurisdictionId);
  if (!profile) return;
  // Re-validate rather than `as`-cast: profile.document is untyped jsonb (conventions.md: "no
  // `as` casts on data from outside the process"), even though it was validated before storage.
  const document = ProfileDocumentSchema.parse(profile.document);

  for (const setting of document.settings.retention) {
    const records = await listRecordsOfType(jurisdictionId, setting.recordType);
    for (const record of records) {
      const baseDate = setting.countFrom === "created" ? record.createdAt : record.reportReleasedAt;
      if (!baseDate) continue; // e.g. countFrom = report-released, but no report yet
      await db
        .insert(retentionFlag)
        .values({
          jurisdictionId,
          recordType: setting.recordType,
          recordId: record.id,
          eligibleOn: addYears(baseDate.toISOString().slice(0, 10), setting.retainYears),
        })
        .onConflictDoNothing(); // unique (record_type, record_id): idempotent to rerun daily (R3)
    }
  }
}

export async function reviewFlag(
  actor: Actor,
  jurisdictionId: string,
  flagId: string,
  outcome: "keep" | "dispose",
) {
  requireReviewer(actor, jurisdictionId); // a compliance judgment, not a routine planner action
  const updated = await db
    .update(retentionFlag)
    .set({ reviewedBy: actor.userId, reviewedAt: sql`now()`, outcome })
    .where(and(eq(retentionFlag.id, flagId), isNull(retentionFlag.reviewedAt)))
    .returning();
  if (updated.length === 0) throw new ConflictError("this flag was already reviewed");
  // R3/R4: only reviewedBy/reviewedAt/outcome are ever written here. Nothing in this module deletes
  // a decision, report, profile_change, or export row — see records-export.md's Out of scope.
  return updated[0];
}

export async function listFlags(jurisdictionId: string) {
  return db.select().from(retentionFlag).where(eq(retentionFlag.jurisdictionId, jurisdictionId));
}
