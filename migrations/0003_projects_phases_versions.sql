-- Guard (TechDesign/research-changes.md, deployment-guide.md A15): a released report's PDF used to live
-- in Object Storage, and there is nothing here to copy it into the new `pdf` column. Refuse to run over
-- existing report rows instead of leaving rows that claim to be released with no document.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "report") THEN
		RAISE EXCEPTION 'report has rows whose PDFs live in Object Storage; see TechDesign/deployment-guide.md, "A15. Upgrading to projects, research phases, and document versions"';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "evidence_resolution" (
	"decision_id" uuid NOT NULL,
	"resource_type_key" text NOT NULL,
	"mapped_by" uuid NOT NULL,
	"not_mapped_by" uuid NOT NULL,
	"revision" integer NOT NULL,
	"relied_on" text NOT NULL,
	"rationale" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_resolution_decision_id_resource_type_key_mapped_by_not_mapped_by_revision_pk" PRIMARY KEY("decision_id","resource_type_key","mapped_by","not_mapped_by","revision"),
	CONSTRAINT "evidence_resolution_revision_positive" CHECK ("evidence_resolution"."revision" > 0),
	CONSTRAINT "evidence_resolution_relied_on_check" CHECK ("evidence_resolution"."relied_on" in ('mapped_by', 'not_mapped_by', 'neither')),
	CONSTRAINT "evidence_resolution_rationale_not_empty" CHECK (length(btrim("evidence_resolution"."rationale")) > 0),
	CONSTRAINT "evidence_resolution_distinct_pair" CHECK ("evidence_resolution"."mapped_by" <> "evidence_resolution"."not_mapped_by")
);
--> statement-breakpoint
CREATE TABLE "phase_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"content_sha256" text NOT NULL,
	"verdict" text NOT NULL,
	"note" text,
	"summary" jsonb NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phase_review_phase_check" CHECK ("phase_review"."phase" in ('site', 'evidence', 'screening', 'studies', 'footprint', 'impact')),
	CONSTRAINT "phase_review_verdict_check" CHECK ("phase_review"."verdict" in ('reviewed', 'revision_requested')),
	CONSTRAINT "phase_review_note_shape" CHECK ("phase_review"."verdict" <> 'revision_requested' or ("phase_review"."note" is not null and length(btrim("phase_review"."note")) > 0))
);
--> statement-breakpoint
ALTER TABLE "decision" DROP CONSTRAINT "decision_status_check";--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_released_shape";--> statement-breakpoint
-- Runs that already finished hold version 1 of the results document (impacts, evidence base, limits).
-- PostgreSQL fills existing rows with the default without an UPDATE, and the default is dropped at
-- once so nothing stands in for a missing version afterward (TechDesign/study-scoping.md).
ALTER TABLE "analysis_run" ADD COLUMN "results_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_run" ALTER COLUMN "results_version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "parcel_or_address" text;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "applicant" text;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "project_manager" text;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "target_decision_on" date;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "deleted_by" text;--> statement-breakpoint
-- authority and spatial_precision are claims a person makes once, when a dataset is set up
-- (TechDesign/evidence-review.md), so there is no default. The only datasets that can already exist
-- are the illustrative ones the local seed script created; each is set explicitly by key, and the
-- NOT NULL below fails, naming the column, if any other dataset is present.
ALTER TABLE "dataset" ADD COLUMN "authority" text;--> statement-breakpoint
ALTER TABLE "dataset" ADD COLUMN "spatial_precision" text;--> statement-breakpoint
ALTER TABLE "dataset" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "dataset" SET "authority" = 'local', "spatial_precision" = 'coarse', "is_sample" = true WHERE "key" LIKE 'sammamish-%-illustrative';--> statement-breakpoint
ALTER TABLE "dataset" ALTER COLUMN "authority" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset" ALTER COLUMN "spatial_precision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "version_number" integer;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "change_note" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "pdf" "bytea";--> statement-breakpoint
ALTER TABLE "evidence_resolution" ADD CONSTRAINT "evidence_resolution_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_review" ADD CONSTRAINT "phase_review_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phase_review_by_phase" ON "phase_review" USING btree ("decision_id","phase","reviewed_at");--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_deleted_by_app_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_by_owner" ON "decision" USING btree ("created_by","created_at" DESC NULLS LAST) WHERE "decision"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_results_version_positive" CHECK ("analysis_run"."results_version" > 0);--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_deleted_shape" CHECK (("decision"."deleted_at" is null) = ("decision"."deleted_by" is null));--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_status_check" CHECK ("decision"."status" in ('in_progress', 'finishing', 'report_released'));--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_authority_check" CHECK ("dataset"."authority" in ('federal', 'state', 'regional', 'county', 'local'));--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_spatial_precision_check" CHECK ("dataset"."spatial_precision" in ('site', 'parcel', 'regional', 'coarse'));--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_version_positive" CHECK ("report"."version_number" is null or "report"."version_number" > 0);--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_released_shape" CHECK (("report"."status" = 'released') = ("report"."pdf" is not null and "report"."pdf_sha256" is not null and "report"."released_at" is not null and "report"."version_number" is not null));