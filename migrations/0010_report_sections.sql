-- F21 (TechDesign/research-phases.md): versioned report sections replace phase reviews and section
-- feedback. A section version is the planner's adopted narrative, append-only, bound to the analysis
-- fingerprint it was built on. Drops the two tables it replaces.

CREATE TABLE "report_section_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"version_number" integer NOT NULL,
	"source" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_sha256" text NOT NULL,
	"output_sha256" text NOT NULL,
	"instruction" text,
	"suggestion_id" uuid,
	"source_version_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_section_version_phase_check" CHECK ("report_section_version"."phase" in ('site', 'evidence', 'screening', 'studies', 'footprint', 'impact')),
	CONSTRAINT "report_section_version_source_check" CHECK ("report_section_version"."source" in ('analysis', 'ai', 'revert')),
	CONSTRAINT "report_section_version_instruction_shape" CHECK ("report_section_version"."source" <> 'ai' or ("report_section_version"."instruction" is not null and length(btrim("report_section_version"."instruction")) between 1 and 2000)),
	CONSTRAINT "report_section_version_number_check" CHECK ("report_section_version"."version_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "report_section_version" ADD CONSTRAINT "report_section_version_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Foreign keys to tables another module owns, added by hand because a module's tables.ts never imports another's.
ALTER TABLE "report_section_version" ADD CONSTRAINT "report_section_version_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "report_section_version" ADD CONSTRAINT "report_section_version_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "ai_suggestion"("id");--> statement-breakpoint
ALTER TABLE "report_section_version" ADD CONSTRAINT "report_section_version_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "report_section_version"("id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_section_version_number" ON "report_section_version" USING btree ("decision_id","phase","version_number");--> statement-breakpoint
CREATE INDEX "report_section_version_by_phase" ON "report_section_version" USING btree ("decision_id","phase","created_at");--> statement-breakpoint
CREATE TRIGGER "report_section_version_append_only" BEFORE UPDATE OR DELETE ON "report_section_version"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint

DROP TABLE "phase_review";--> statement-breakpoint
DROP TABLE "report_section_feedback";--> statement-breakpoint

-- F24: the section chat binds a suggestion to the section content the planner was reading, and the two
-- section kinds can run on Site and Footprint as well.
ALTER TABLE "ai_suggestion" ADD COLUMN "section_sha256" text;--> statement-breakpoint
ALTER TABLE "ai_suggestion" DROP CONSTRAINT "ai_suggestion_phase_check";--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_phase_check" CHECK ("ai_suggestion"."phase" in ('profile', 'site', 'evidence', 'screening', 'studies', 'footprint', 'impact'));--> statement-breakpoint
ALTER TABLE "ai_suggestion" DROP CONSTRAINT "ai_suggestion_kind_check";--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_kind_check" CHECK ("ai_suggestion"."kind" in ('explain', 'questions', 'find', 'compare', 'metadata-draft', 'rule-draft', 'section-explain', 'section-edit'));--> statement-breakpoint
DROP INDEX "ai_suggestion_one_live";--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestion_one_live" ON "ai_suggestion" USING btree (coalesce("decision_id", "jurisdiction_id"),"assist_id","subject_key","output_sha256",coalesce("section_sha256", '')) WHERE "ai_suggestion"."status" <> 'failed';
