CREATE TABLE "profile_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"upload_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_source_kind_check" CHECK ("profile_source"."kind" in ('url', 'excel')),
	CONSTRAINT "profile_source_label_not_empty" CHECK (length(btrim("profile_source"."label")) > 0),
	CONSTRAINT "profile_source_url_shape" CHECK (("profile_source"."kind" = 'url') = ("profile_source"."url" is not null)),
	CONSTRAINT "profile_source_upload_shape" CHECK (("profile_source"."kind" = 'excel') = ("profile_source"."upload_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "profile_change" DROP CONSTRAINT "profile_change_no_self_approval";--> statement-breakpoint
ALTER TABLE "profile_source" ADD CONSTRAINT "profile_source_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_source" ADD CONSTRAINT "profile_source_upload_id_profile_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."profile_upload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_source" ADD CONSTRAINT "profile_source_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;