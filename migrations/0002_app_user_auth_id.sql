ALTER TABLE "app_user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "auth_id" uuid;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_auth_id_unique" UNIQUE("auth_id");