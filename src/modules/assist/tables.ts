import { pgTable, uuid, text, integer, jsonb, timestamp, bigint, check, index, unique, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/ai-assist.md, "Data model" (F24). A module's tables.ts never imports another module's tables, so
// the references to jurisdiction, decision, and profile_change are foreign keys added by hand in migration
// 0009, the way phase_review's are.

// One suggestion per phase output, kind, and subject. It is stored beside the analysis and never inside it:
// nothing that computes an output, a fingerprint, a review, or the document reads this table (F24 R1, R2).
export const aiSuggestion = pgTable(
  "ai_suggestion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id").notNull(),
    decisionId: uuid("decision_id"), // null for the city-level assists (the profile, a dataset)
    phase: text("phase").notNull(),
    assistId: text("assist_id").notNull(),
    kind: text("kind").notNull(),
    subjectKey: text("subject_key").notNull(),
    // The output this was made on (R10): a phase fingerprint, or the hash of a profile, a pasted text, or the
    // indexed code. Compared with the current one on render to show "out of date" with its reason.
    outputSha256: text("output_sha256").notNull(),
    // sha256 of the canonical JSON of `request`. Null only while the row is `running` and the request has not
    // been assembled yet (retrieval comes after the row claims the unique key, so a double submit is one call).
    inputSha256: text("input_sha256"),
    modelId: text("model_id").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    status: text("status").notNull(),
    request: jsonb("request").$type<unknown>(), // exactly what was sent (R8)
    responseRaw: text("response_raw"), // as returned, before any check
    content: jsonb("content").$type<unknown>(), // the validated shape; null unless ready
    checkFailures: jsonb("check_failures").$type<{ check: string; message: string }[]>().notNull().default(sql`'[]'::jsonb`),
    errorDetail: text("error_detail"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => appUser.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    check("ai_suggestion_phase_check", sql`${t.phase} in ('profile', 'evidence', 'screening', 'studies', 'impact')`),
    check(
      "ai_suggestion_kind_check",
      sql`${t.kind} in ('explain', 'questions', 'find', 'compare', 'metadata-draft', 'rule-draft')`,
    ),
    check("ai_suggestion_status_check", sql`${t.status} in ('running', 'ready', 'rejected', 'failed')`),
    check("ai_suggestion_prompt_version_check", sql`${t.promptVersion} > 0`),
    check("ai_suggestion_finished_shape", sql`(${t.status} = 'running') = (${t.finishedAt} is null)`),
    check(
      "ai_suggestion_ready_shape",
      sql`${t.status} <> 'ready' or (${t.content} is not null and ${t.inputSha256} is not null and jsonb_array_length(${t.checkFailures}) = 0)`,
    ),
    check(
      "ai_suggestion_rejected_shape",
      sql`${t.status} <> 'rejected' or (${t.responseRaw} is not null and jsonb_array_length(${t.checkFailures}) > 0)`,
    ),
    check("ai_suggestion_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
    // R13: one live suggestion per output, kind, and subject. A failed one frees the key so it can be asked again.
    uniqueIndex("ai_suggestion_one_live")
      .on(sql`coalesce(${t.decisionId}, ${t.jurisdictionId})`, t.assistId, t.subjectKey, t.outputSha256)
      .where(sql`${t.status} <> 'failed'`),
    index("ai_suggestion_usage").on(t.requestedBy, t.startedAt),
    index("ai_suggestion_city_usage").on(t.jurisdictionId, t.startedAt),
    index("ai_suggestion_by_decision").on(t.decisionId, t.phase, t.startedAt),
  ],
);

// A person's response to a suggestion (R14), and the confirmation of a draft (R7). Append-only.
export const aiSuggestionResponse = pgTable(
  "ai_suggestion_response",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => aiSuggestion.id),
    response: text("response").notNull(),
    note: text("note"),
    // Set when staff confirmed a draft: the profile change that carries it. Never a write to profile_version here.
    profileChangeId: uuid("profile_change_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "ai_suggestion_response_check",
      sql`${t.response} in ('dismissed', 'helpful', 'not-helpful', 'confirmed', 'rejected')`,
    ),
    check("ai_suggestion_response_note_shape", sql`${t.note} is null or length(${t.note}) between 1 and 2000`),
    index("ai_suggestion_response_by_suggestion").on(t.suggestionId, t.createdAt),
    // R7: a draft is confirmed once. Two staff confirming at the same moment cannot both succeed.
    uniqueIndex("ai_suggestion_one_confirmation").on(t.suggestionId).where(sql`${t.response} = 'confirmed'`),
  ],
);

// The city's own code text (or a checklist), as staff supplied it, split into sections and embedded, so Find can
// return the exact passage that answers a question (F24 PR2, SC3, ST1, IM3). The whole table is write-once:
// a revised ordinance is a new document, and an old one stays the record of what a suggestion was made from.
export const sourceDocument = pgTable(
  "source_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    contentSha256: text("content_sha256").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("source_document_one_per_text").on(t.jurisdictionId, t.contentSha256, t.embeddingModel),
    check("source_document_kind_check", sql`${t.kind} in ('code', 'checklist')`),
    check("source_document_title_shape", sql`length(btrim(${t.title})) between 1 and 200`),
    check("source_document_chunks_check", sql`${t.chunkCount} > 0`),
  ],
);

export const documentChunk = pgTable(
  "document_chunk",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocument.id),
    ordinal: integer("ordinal").notNull(),
    sectionPath: text("section_path").notNull(), // "21A.50.290": what a quote's section must equal
    body: text("body").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(), // nvidia/nemotron-3-embed-1b, first 1,024 of 2,048 (D27)
  },
  (t) => [
    unique("document_chunk_one_per_ordinal").on(t.sourceDocumentId, t.ordinal),
    check("document_chunk_ordinal_check", sql`${t.ordinal} >= 0`),
    index("document_chunk_embedding").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("document_chunk_section").on(t.sectionPath),
  ],
);
