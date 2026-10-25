-- F21: persist chat messages (both user and AI) for section chat history.
-- Each message belongs to a suggestion (AI response) or stands alone (user message before AI responds).

CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"suggestion_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"instruction" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_phase_check" CHECK ("chat_message"."phase" in ('site', 'evidence', 'screening', 'studies', 'footprint', 'impact')),
	CONSTRAINT "chat_message_role_check" CHECK ("chat_message"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "ai_suggestion"("id");--> statement-breakpoint
CREATE INDEX "chat_message_by_decision_phase" ON "chat_message" USING btree ("decision_id","phase","created_at");--> statement-breakpoint
CREATE INDEX "chat_message_by_suggestion" ON "chat_message" USING btree ("suggestion_id");