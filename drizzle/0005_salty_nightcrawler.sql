ALTER TABLE "sessions" ADD COLUMN "kind" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "prev_token_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "prev_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_sessions_prev_token" ON "sessions" USING btree ("prev_token_hash");