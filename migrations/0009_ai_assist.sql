-- F24 (TechDesign/ai-assist.md): AI assist tables, and the code-text index Find reads. Supabase provides
-- pgvector; the extension is created here so a fresh database has it (data-model.md, D21, D28).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ai_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"decision_id" uuid,
	"phase" text NOT NULL,
	"assist_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"output_sha256" text NOT NULL,
	"input_sha256" text,
	"model_id" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"status" text NOT NULL,
	"request" jsonb,
	"response_raw" text,
	"content" jsonb,
	"check_failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_detail" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_suggestion_phase_check" CHECK ("ai_suggestion"."phase" in ('profile', 'evidence', 'screening', 'studies', 'impact')),
	CONSTRAINT "ai_suggestion_kind_check" CHECK ("ai_suggestion"."kind" in ('explain', 'questions', 'find', 'compare', 'metadata-draft', 'rule-draft')),
	CONSTRAINT "ai_suggestion_status_check" CHECK ("ai_suggestion"."status" in ('running', 'ready', 'rejected', 'failed')),
	CONSTRAINT "ai_suggestion_prompt_version_check" CHECK ("ai_suggestion"."prompt_version" > 0),
	CONSTRAINT "ai_suggestion_finished_shape" CHECK (("ai_suggestion"."status" = 'running') = ("ai_suggestion"."finished_at" is null)),
	CONSTRAINT "ai_suggestion_ready_shape" CHECK ("ai_suggestion"."status" <> 'ready' or ("ai_suggestion"."content" is not null and "ai_suggestion"."input_sha256" is not null and jsonb_array_length("ai_suggestion"."check_failures") = 0)),
	CONSTRAINT "ai_suggestion_rejected_shape" CHECK ("ai_suggestion"."status" <> 'rejected' or ("ai_suggestion"."response_raw" is not null and jsonb_array_length("ai_suggestion"."check_failures") > 0)),
	CONSTRAINT "ai_suggestion_failed_shape" CHECK ("ai_suggestion"."status" <> 'failed' or "ai_suggestion"."error_detail" is not null)
);
--> statement-breakpoint
CREATE TABLE "ai_suggestion_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"response" text NOT NULL,
	"note" text,
	"profile_change_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_suggestion_response_check" CHECK ("ai_suggestion_response"."response" in ('dismissed', 'helpful', 'not-helpful', 'confirmed', 'rejected')),
	CONSTRAINT "ai_suggestion_response_note_shape" CHECK ("ai_suggestion_response"."note" is null or length("ai_suggestion_response"."note") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_chunk_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section_path" text NOT NULL,
	"body" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	CONSTRAINT "document_chunk_one_per_ordinal" UNIQUE("source_document_id","ordinal"),
	CONSTRAINT "document_chunk_ordinal_check" CHECK ("document_chunk"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content_sha256" text NOT NULL,
	"embedding_model" text NOT NULL,
	"chunk_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_document_one_per_text" UNIQUE("jurisdiction_id","content_sha256","embedding_model"),
	CONSTRAINT "source_document_kind_check" CHECK ("source_document"."kind" in ('code', 'checklist')),
	CONSTRAINT "source_document_title_shape" CHECK (length(btrim("source_document"."title")) between 1 and 200),
	CONSTRAINT "source_document_chunks_check" CHECK ("source_document"."chunk_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion_response" ADD CONSTRAINT "ai_suggestion_response_suggestion_id_ai_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."ai_suggestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion_response" ADD CONSTRAINT "ai_suggestion_response_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_source_document_id_source_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document" ADD CONSTRAINT "source_document_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestion_one_live" ON "ai_suggestion" USING btree (coalesce("decision_id", "jurisdiction_id"),"assist_id","subject_key","output_sha256") WHERE "ai_suggestion"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "ai_suggestion_usage" ON "ai_suggestion" USING btree ("requested_by","started_at");--> statement-breakpoint
CREATE INDEX "ai_suggestion_city_usage" ON "ai_suggestion" USING btree ("jurisdiction_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_suggestion_by_decision" ON "ai_suggestion" USING btree ("decision_id","phase","started_at");--> statement-breakpoint
CREATE INDEX "ai_suggestion_response_by_suggestion" ON "ai_suggestion_response" USING btree ("suggestion_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestion_one_confirmation" ON "ai_suggestion_response" USING btree ("suggestion_id") WHERE "ai_suggestion_response"."response" = 'confirmed';--> statement-breakpoint
CREATE INDEX "document_chunk_embedding" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_chunk_section" ON "document_chunk" USING btree ("section_path");
--> statement-breakpoint
-- Foreign keys to tables another module owns, added by hand because a module's tables.ts never imports another's.
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdiction"("id");--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "ai_suggestion_response" ADD CONSTRAINT "ai_suggestion_response_profile_change_id_fk" FOREIGN KEY ("profile_change_id") REFERENCES "profile_change"("id");--> statement-breakpoint
ALTER TABLE "source_document" ADD CONSTRAINT "source_document_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdiction"("id");--> statement-breakpoint

-- A suggestion that reached a final state stays as it is (F24 R10), and nothing is ever deleted: the request that
-- was sent and the model that answered are public records (F24 R17).
CREATE TRIGGER "ai_suggestion_final" BEFORE UPDATE ON "ai_suggestion"
	FOR EACH ROW WHEN (OLD.status <> 'running') EXECUTE FUNCTION forbid_final_row_change();--> statement-breakpoint
CREATE TRIGGER "ai_suggestion_no_delete" BEFORE DELETE ON "ai_suggestion"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "ai_suggestion_response_append_only" BEFORE UPDATE OR DELETE ON "ai_suggestion_response"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "source_document_append_only" BEFORE UPDATE OR DELETE ON "source_document"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "document_chunk_append_only" BEFORE UPDATE OR DELETE ON "document_chunk"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
