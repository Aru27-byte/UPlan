CREATE TABLE "membership" (
	"user_id" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_user_id_jurisdiction_id_role_pk" PRIMARY KEY("user_id","jurisdiction_id","role"),
	CONSTRAINT "membership_role_check" CHECK ("membership"."role" in ('planner', 'reviewer'))
);
--> statement-breakpoint
CREATE TABLE "staff_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"profile_version_id" uuid,
	"profile_change_id" uuid,
	"rules_resolved_for" jsonb NOT NULL,
	"study_area_revision" integer NOT NULL,
	"footprint_revision" integer,
	"input_sha256" text NOT NULL,
	"status" text NOT NULL,
	"results" jsonb,
	"error_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "analysis_run_one_per_input" UNIQUE("decision_id","purpose","input_sha256"),
	CONSTRAINT "analysis_run_purpose_check" CHECK ("analysis_run"."purpose" in ('current', 'preview')),
	CONSTRAINT "analysis_run_current_shape" CHECK (("analysis_run"."purpose" = 'current') = ("analysis_run"."profile_version_id" is not null and "analysis_run"."profile_change_id" is null)),
	CONSTRAINT "analysis_run_preview_shape" CHECK (("analysis_run"."purpose" = 'preview') = ("analysis_run"."profile_change_id" is not null and "analysis_run"."profile_version_id" is null)),
	CONSTRAINT "analysis_run_running_shape" CHECK (("analysis_run"."status" = 'running') = ("analysis_run"."finished_at" is null)),
	CONSTRAINT "analysis_run_succeeded_shape" CHECK ("analysis_run"."status" <> 'succeeded' or "analysis_run"."results" is not null),
	CONSTRAINT "analysis_run_failed_shape" CHECK ("analysis_run"."status" <> 'failed' or "analysis_run"."error_detail" is not null),
	CONSTRAINT "analysis_run_status_check" CHECK ("analysis_run"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "analysis_run_dataset" (
	"analysis_run_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	CONSTRAINT "analysis_run_dataset_analysis_run_id_dataset_version_id_pk" PRIMARY KEY("analysis_run_id","dataset_version_id")
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"title" text NOT NULL,
	"permit_number" text,
	"application_type" text NOT NULL,
	"application_filed_on" date,
	"status" text NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_application_type_check" CHECK ("decision"."application_type" in ('subdivision', 'short_subdivision', 'clearing_grading')),
	CONSTRAINT "decision_status_check" CHECK ("decision"."status" in ('in_progress', 'report_released'))
);
--> statement-breakpoint
CREATE TABLE "decision_geometry" (
	"decision_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"revision" integer NOT NULL,
	"geom" geometry(MultiPolygon, 4326) NOT NULL,
	"source_note" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_geometry_decision_id_kind_revision_pk" PRIMARY KEY("decision_id","kind","revision"),
	CONSTRAINT "decision_geometry_kind_check" CHECK ("decision_geometry"."kind" in ('study_area', 'footprint')),
	CONSTRAINT "decision_geometry_revision_positive" CHECK ("decision_geometry"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "dataset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"license" text NOT NULL,
	"source_url" text NOT NULL,
	"coverage" geometry(MultiPolygon, 4326) NOT NULL,
	"current_version_id" uuid,
	"last_checked_at" timestamp with time zone,
	"known_limitation" text,
	"confidence_default" text NOT NULL,
	"confidence_rationale_default" text NOT NULL,
	"publisher_date_attribute" text,
	"source_as_of_note_default" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "dataset_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"status" text NOT NULL,
	"raw_object_key" text NOT NULL,
	"raw_sha256" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"source_as_of" text,
	"source_as_of_note" text,
	"confidence" text,
	"confidence_rationale" text,
	"processing_steps" jsonb NOT NULL,
	"feature_count" integer,
	"error_detail" text,
	CONSTRAINT "dataset_version_one_per_file" UNIQUE("dataset_id","raw_sha256"),
	CONSTRAINT "dataset_version_status_check" CHECK ("dataset_version"."status" in ('ingesting', 'ready', 'failed')),
	CONSTRAINT "dataset_version_date_or_note" CHECK ("dataset_version"."source_as_of" is not null or "dataset_version"."source_as_of_note" is not null),
	CONSTRAINT "dataset_version_confidence_check" CHECK ("dataset_version"."confidence" is null or "dataset_version"."confidence" in ('high', 'moderate', 'low')),
	CONSTRAINT "dataset_version_ready_shape" CHECK ("dataset_version"."status" <> 'ready' or ("dataset_version"."confidence" is not null and "dataset_version"."confidence_rationale" is not null and "dataset_version"."feature_count" is not null)),
	CONSTRAINT "dataset_version_failed_shape" CHECK ("dataset_version"."status" <> 'failed' or "dataset_version"."error_detail" is not null)
);
--> statement-breakpoint
CREATE TABLE "evidence_feature" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evidence_feature_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dataset_version_id" uuid NOT NULL,
	"source_feature_id" text NOT NULL,
	"geom" geometry(Geometry, 4326) NOT NULL,
	"attributes" jsonb NOT NULL,
	CONSTRAINT "evidence_feature_one_per_source_id" UNIQUE("dataset_version_id","source_feature_id")
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_dataset" (
	"jurisdiction_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"resource_type_key" text NOT NULL,
	"attribute_map" jsonb NOT NULL,
	CONSTRAINT "jurisdiction_dataset_jurisdiction_id_dataset_id_pk" PRIMARY KEY("jurisdiction_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "backup_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"error_detail" text,
	CONSTRAINT "backup_run_kind_check" CHECK ("backup_run"."kind" in ('full', 'diff')),
	CONSTRAINT "backup_run_status_check" CHECK ("backup_run"."status" in ('succeeded', 'failed')),
	CONSTRAINT "backup_run_failed_shape" CHECK ("backup_run"."status" <> 'failed' or "backup_run"."error_detail" is not null)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"singleton" boolean PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"time_zone" text NOT NULL,
	"analysis_srid" integer NOT NULL,
	"boundary" geometry(MultiPolygon, 4326) NOT NULL,
	"current_profile_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdiction_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "profile_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"base_version_id" uuid,
	"proposed_document" jsonb NOT NULL,
	"source" text NOT NULL,
	"upload_id" uuid,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"proposed_by" text NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "profile_change_source_check" CHECK ("profile_change"."source" in ('upload', 'edit', 'code_change')),
	CONSTRAINT "profile_change_status_check" CHECK ("profile_change"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "profile_change_reason_not_empty" CHECK (length("profile_change"."reason") > 0),
	CONSTRAINT "profile_change_decided_shape" CHECK (("profile_change"."status" = 'pending') = ("profile_change"."decided_by" is null and "profile_change"."decided_at" is null)),
	CONSTRAINT "profile_change_upload_shape" CHECK (("profile_change"."source" = 'upload') = ("profile_change"."upload_id" is not null)),
	CONSTRAINT "profile_change_no_self_approval" CHECK ("profile_change"."decided_by" is null or "profile_change"."decided_by" <> "profile_change"."proposed_by")
);
--> statement-breakpoint
CREATE TABLE "profile_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_sha256" text NOT NULL,
	"template_version" integer,
	"validation_errors" jsonb NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_upload_jurisdiction_hash" UNIQUE("jurisdiction_id","file_sha256"),
	CONSTRAINT "profile_upload_valid_or_errored" CHECK ("profile_upload"."template_version" is not null or jsonb_array_length("profile_upload"."validation_errors") > 0)
);
--> statement-breakpoint
CREATE TABLE "profile_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"document" jsonb NOT NULL,
	"document_sha256" text NOT NULL,
	"change_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_version_change_id_unique" UNIQUE("change_id"),
	CONSTRAINT "profile_version_jurisdiction_number" UNIQUE("jurisdiction_id","version_number"),
	CONSTRAINT "profile_version_number_positive" CHECK ("profile_version"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "records_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"scope" jsonb NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"object_key" text,
	"sha256" text,
	"error_detail" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "records_export_status_check" CHECK ("records_export"."status" in ('building', 'ready', 'failed')),
	CONSTRAINT "records_export_ready_shape" CHECK (("records_export"."status" = 'ready') = ("records_export"."object_key" is not null and "records_export"."sha256" is not null)),
	CONSTRAINT "records_export_failed_shape" CHECK ("records_export"."status" <> 'failed' or "records_export"."error_detail" is not null)
);
--> statement-breakpoint
CREATE TABLE "retention_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" text NOT NULL,
	"eligible_on" date NOT NULL,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"outcome" text,
	CONSTRAINT "retention_flag_one_per_record" UNIQUE("record_type","record_id"),
	CONSTRAINT "retention_flag_outcome_check" CHECK ("retention_flag"."outcome" is null or "retention_flag"."outcome" in ('keep', 'dispose')),
	CONSTRAINT "retention_flag_review_shape" CHECK (("retention_flag"."outcome" is null) = ("retention_flag"."reviewed_at" is null and "retention_flag"."reviewed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"status" text NOT NULL,
	"object_key" text NOT NULL,
	"pdf_sha256" text,
	"error_detail" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "report_decision_sequence" UNIQUE("decision_id","sequence_number"),
	CONSTRAINT "report_sequence_positive" CHECK ("report"."sequence_number" > 0),
	CONSTRAINT "report_status_check" CHECK ("report"."status" in ('releasing', 'released', 'failed')),
	CONSTRAINT "report_released_shape" CHECK (("report"."status" = 'released') = ("report"."pdf_sha256" is not null and "report"."released_at" is not null)),
	CONSTRAINT "report_failed_shape" CHECK ("report"."status" <> 'failed' or "report"."error_detail" is not null)
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_granted_by_app_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_granted_by_app_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_run_dataset" ADD CONSTRAINT "analysis_run_dataset_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_geometry" ADD CONSTRAINT "decision_geometry_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_geometry" ADD CONSTRAINT "decision_geometry_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_version" ADD CONSTRAINT "dataset_version_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_feature" ADD CONSTRAINT "evidence_feature_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_dataset" ADD CONSTRAINT "jurisdiction_dataset_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change" ADD CONSTRAINT "profile_change_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change" ADD CONSTRAINT "profile_change_upload_id_profile_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."profile_upload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change" ADD CONSTRAINT "profile_change_proposed_by_app_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change" ADD CONSTRAINT "profile_change_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_upload" ADD CONSTRAINT "profile_upload_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_upload" ADD CONSTRAINT "profile_upload_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_version" ADD CONSTRAINT "profile_version_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_version" ADD CONSTRAINT "profile_version_change_id_profile_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."profile_change"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records_export" ADD CONSTRAINT "records_export_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_flag" ADD CONSTRAINT "retention_flag_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");