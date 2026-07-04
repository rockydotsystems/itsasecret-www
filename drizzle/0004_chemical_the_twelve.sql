ALTER TABLE "env_vars" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "hidden_at" timestamp with time zone;