import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { profileSource } from "./tables";

export type ProfileSource = typeof profileSource.$inferSelect;

// A source's name, and a web address that can be opened from the page. Only http and https: the address is
// rendered as a link, and a javascript: or data: address must never become one.
const LabelSchema = z.string().trim().min(1, "Give the source a name.").max(120, "Keep the source name under 120 characters.");
const UrlSchema = z.url({ protocol: /^https?$/, error: "Enter a full web address starting with https://" });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues.map((i) => i.message).join(" "));
  return result.data;
}

/** Every source of the city's rules, oldest first (profile-upload-edit.md R12). */
export async function listSources(jurisdictionId: string): Promise<ProfileSource[]> {
  return db
    .select()
    .from(profileSource)
    .where(eq(profileSource.jurisdictionId, jurisdictionId))
    .orderBy(asc(profileSource.createdAt), asc(profileSource.id));
}

export async function addUrlSource(actor: Actor, jurisdictionId: string, input: { label: string; url: string }) {
  const label = parse(LabelSchema, input.label);
  const url = parse(UrlSchema, input.url);
  await db.insert(profileSource).values({ jurisdictionId, kind: "url", label, url, createdBy: actor.userId });
}

/** Renames a source, and for a web source changes its address. `url` is ignored for an Excel source, which has none. */
export async function updateSource(jurisdictionId: string, sourceId: string, input: { label: string; url: string | null }) {
  const label = parse(LabelSchema, input.label);
  const [existing] = await db
    .select({ kind: profileSource.kind })
    .from(profileSource)
    .where(and(eq(profileSource.id, sourceId), eq(profileSource.jurisdictionId, jurisdictionId)));
  if (!existing) throw new NotFoundError("source");
  const values = existing.kind === "url" ? { label, url: parse(UrlSchema, input.url) } : { label };
  const updated = await db
    .update(profileSource)
    .set(values)
    .where(and(eq(profileSource.id, sourceId), eq(profileSource.jurisdictionId, jurisdictionId)))
    .returning({ id: profileSource.id });
  if (updated.length !== 1) throw new NotFoundError("source");
}

export async function removeSource(jurisdictionId: string, sourceId: string) {
  const removed = await db
    .delete(profileSource)
    .where(and(eq(profileSource.id, sourceId), eq(profileSource.jurisdictionId, jurisdictionId)))
    .returning({ id: profileSource.id });
  if (removed.length !== 1) throw new NotFoundError("source");
}

/**
 * Records the workbook behind an Excel source, inside the transaction that applied it. With a `sourceId` the
 * workbook replaces the one behind that source and the source is renamed; without one a new source is added.
 */
export async function saveExcelSource(
  tx: DbOrTx,
  actor: Actor,
  jurisdictionId: string,
  uploadId: string,
  target: { sourceId: string | null; label: string },
) {
  const label = parse(LabelSchema, target.label);
  if (target.sourceId === null) {
    await tx.insert(profileSource).values({ jurisdictionId, kind: "excel", label, uploadId, createdBy: actor.userId });
    return;
  }
  const updated = await tx
    .update(profileSource)
    .set({ label, uploadId })
    .where(
      and(
        eq(profileSource.id, target.sourceId),
        eq(profileSource.jurisdictionId, jurisdictionId),
        eq(profileSource.kind, "excel"),
      ),
    )
    .returning({ id: profileSource.id });
  if (updated.length !== 1) throw new NotFoundError("source");
}
