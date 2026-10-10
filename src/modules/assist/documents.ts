import { createHash } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireStaff, type Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";
import { EMBED_MODEL_ID, embed } from "@/platform/model-client";

import type { CodePassage } from "./inputs";
import { documentChunk, sourceDocument } from "./tables";

// TechDesign/ai-assist.md, "Open items": on this hosting target the first source of code text is staff pasting
// or uploading it, because there is no worker to fetch and convert a PDF. The text is split into sections and
// embedded once, here, so Find only embeds the question (F24 PR2). Only public published text belongs here (C1).

/** A pasted chapter or two. Larger text is split into parts by the person, so one request fits one invocation. */
export const MAX_DOCUMENT_CHARS = 150_000;
// The embedder takes at most 512 tokens an input. Legal text is dense with numbers, so a piece is kept well
// under it; an input over the limit is an error (`truncate: NONE`), never silently cut.
const MAX_CHUNK_CHARS = 1_000;
const EMBED_BATCH = 16;

// "21A.50.290", "21.03.020": the number a section of the Sammamish Municipal Code begins with.
const SECTION_HEADING = /^\s*(?:SMC\s+)?(\d{1,2}[A-Z]?\.\d{1,3}\.\d{2,4})\b/;

export type TextChunk = { sectionPath: string; body: string };

function pack(paragraphs: string[]): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const raw of paragraphs) {
    const piece = raw.trim();
    if (piece.length === 0) continue;
    if (current.length > 0 && current.length + piece.length + 1 > MAX_CHUNK_CHARS) {
      pieces.push(current);
      current = "";
    }
    if (piece.length > MAX_CHUNK_CHARS) {
      // One paragraph over the limit: split it on sentence ends, then on length.
      for (const sentence of piece.split(/(?<=[.;:])\s+/)) {
        for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) {
          const part = sentence.slice(i, i + MAX_CHUNK_CHARS);
          if (current.length > 0 && current.length + part.length + 1 > MAX_CHUNK_CHARS) {
            pieces.push(current);
            current = "";
          }
          current = current.length > 0 ? `${current} ${part}` : part;
        }
      }
    } else {
      current = current.length > 0 ? `${current}\n${piece}` : piece;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/**
 * Splits code text at each section number it finds, then into pieces small enough to embed. A piece keeps its
 * section's number as its path, so a quote's section can be compared with it exactly (K5). Text with no section
 * numbers is numbered by part, which says plainly that no section was found rather than guessing one.
 */
export function chunkText(text: string): TextChunk[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: { path: string; lines: string[] }[] = [];
  for (const line of lines) {
    const heading = SECTION_HEADING.exec(line);
    if (heading?.[1] !== undefined) sections.push({ path: heading[1], lines: [line] });
    else if (sections.length === 0) sections.push({ path: "Before the first section", lines: [line] });
    else sections[sections.length - 1]?.lines.push(line);
  }
  const numbered = sections.some((s) => /^\d/.test(s.path));
  const chunks: TextChunk[] = [];
  let part = 0;
  for (const section of sections) {
    const pieces = pack(section.lines.join("\n").split(/\n{2,}/));
    for (const body of pieces) {
      part += 1;
      chunks.push({ sectionPath: numbered ? section.path : `Part ${part}`, body });
    }
  }
  return chunks;
}

const NewDocumentSchema = z.object({
  kind: z.enum(["code", "checklist"]),
  title: z.string().trim().min(1, "Give the document a title.").max(200, "Keep the title under 200 characters."),
  text: z.string().trim().min(40, "Paste the text of the code section or checklist.").max(MAX_DOCUMENT_CHARS, `Keep the text under ${MAX_DOCUMENT_CHARS.toLocaleString("en-US")} characters; add a long chapter in parts.`),
});
export type NewDocument = z.input<typeof NewDocumentSchema>;

/**
 * Splits and embeds the text, then writes the document and every chunk in one transaction. Embedding happens
 * first and holds no database lock (do-not.md: no lock across a model call). The same text twice is a
 * ConflictError by the unique key, not a second copy.
 */
export async function addSourceDocument(actor: Actor, jurisdictionId: string, input: NewDocument): Promise<{ id: string; chunkCount: number }> {
  requireStaff(actor);
  const parsed = NewDocumentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const { kind, title, text } = parsed.data;

  const chunks = chunkText(text);
  if (chunks.length === 0) throw new ValidationError("No text was found to index.");

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    vectors.push(...(await embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.body), "passage")));
  }

  try {
    return await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(sourceDocument)
        .values({
          jurisdictionId,
          kind,
          title,
          contentSha256: createHash("sha256").update(text).digest("hex"),
          embeddingModel: EMBED_MODEL_ID,
          chunkCount: chunks.length,
          createdBy: actor.userId,
        })
        .returning({ id: sourceDocument.id });
      if (!doc) throw new Error("insert into source_document unexpectedly returned no row");
      for (let i = 0; i < chunks.length; i += 50) {
        await tx.insert(documentChunk).values(
          chunks.slice(i, i + 50).map((c, j) => {
            const embedding = vectors[i + j];
            if (!embedding) throw new Error(`no embedding for chunk ${i + j}`);
            return { sourceDocumentId: doc.id, ordinal: i + j, sectionPath: c.sectionPath, body: c.body, embedding };
          }),
        );
      }
      return { id: doc.id, chunkCount: chunks.length };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("This exact text is already indexed for this city.");
    throw err;
  }
}

export type SourceDocumentSummary = {
  id: string;
  kind: "code" | "checklist";
  title: string;
  contentSha256: string;
  chunkCount: number;
  createdAt: Date;
};

export async function listSourceDocuments(jurisdictionId: string): Promise<SourceDocumentSummary[]> {
  const rows = await db
    .select({
      id: sourceDocument.id,
      kind: sourceDocument.kind,
      title: sourceDocument.title,
      contentSha256: sourceDocument.contentSha256,
      chunkCount: sourceDocument.chunkCount,
      createdAt: sourceDocument.createdAt,
    })
    .from(sourceDocument)
    .where(eq(sourceDocument.jurisdictionId, jurisdictionId))
    .orderBy(desc(sourceDocument.createdAt));
  return rows.map((r) => ({ ...r, kind: z.enum(["code", "checklist"]).parse(r.kind) }));
}

/**
 * The hash a suggestion made from the city's indexed text is bound to (R10): when a document is added, a Find
 * made from the earlier text is out of date and says so. Sorted, so the order of upload doesn't matter.
 */
export async function indexedTextHash(jurisdictionId: string, documentId: string | null = null): Promise<string | null> {
  const docs = (await listSourceDocuments(jurisdictionId)).filter((d) => documentId === null || d.id === documentId);
  if (docs.length === 0) return null;
  return createHash("sha256").update(docs.map((d) => d.contentSha256).sort().join("\n")).digest("hex");
}

const ChunkRowSchema = z.object({ id: z.coerce.number(), section_path: z.string(), body: z.string() });

/**
 * The chunks nearest each query by cosine distance, de-duplicated, best first. One embedding call for all
 * queries. Scoped to the city's own documents, and to one document when a staff member chose one.
 */
export async function retrieveCodePassages(
  jurisdictionId: string,
  queries: string[],
  opts: { perQuery: number; limit: number; documentId: string | null },
): Promise<CodePassage[]> {
  if (queries.length === 0) return [];
  const vectors = await embed(queries, "query");
  const ranked = new Map<number, { passage: CodePassage; score: number }>();

  await db.transaction(async (tx) => {
    // pgvector's iterative scan keeps a filtered nearest-neighbour search from returning too few rows.
    await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
    for (const vector of vectors) {
      const literal = `[${vector.join(",")}]`;
      const rows = await tx.execute(sql`
        select c.id, c.section_path, c.body
        from document_chunk c
        join source_document d on d.id = c.source_document_id
        where d.jurisdiction_id = ${jurisdictionId}
          ${opts.documentId === null ? sql`` : sql`and d.id = ${opts.documentId}`}
        order by c.embedding <=> ${literal}::vector
        limit ${opts.perQuery}
      `);
      rows.rows.forEach((raw, rank) => {
        const row = ChunkRowSchema.parse(raw);
        const score = 1 / (rank + 1);
        const existing = ranked.get(row.id);
        if (!existing || existing.score < score) {
          ranked.set(row.id, { passage: { id: `chunk:${row.id}`, sectionPath: row.section_path, body: row.body }, score });
        }
      });
    }
  });

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || (a.passage.id < b.passage.id ? -1 : 1))
    .slice(0, opts.limit)
    .map((r) => r.passage);
}
