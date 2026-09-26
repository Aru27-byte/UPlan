DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "sso_provider" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "image";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "updated_at";