CREATE TABLE "report_section_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"step" text NOT NULL,
	"note" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_section_feedback_step_check" CHECK ("report_section_feedback"."step" in ('overview', 'site', 'evidence', 'screening', 'studies', 'footprint', 'impact')),
	CONSTRAINT "report_section_feedback_note_shape" CHECK (length(btrim("report_section_feedback"."note")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "report_section_feedback" ADD CONSTRAINT "report_section_feedback_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_section_feedback" ADD CONSTRAINT "report_section_feedback_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
CREATE INDEX "report_section_feedback_by_step" ON "report_section_feedback" USING btree ("decision_id","step","created_at");--> statement-breakpoint
CREATE TRIGGER "report_section_feedback_append_only" BEFORE UPDATE OR DELETE ON "report_section_feedback"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();