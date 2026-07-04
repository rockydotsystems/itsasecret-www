CREATE TABLE "env_var_history" (
	"id" text PRIMARY KEY NOT NULL,
	"var_id" text NOT NULL,
	"env_id" text NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"change_type" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_history" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_id" text NOT NULL,
	"env_id" text NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"change_type" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "env_var_history" ADD CONSTRAINT "env_var_history_var_id_env_vars_id_fk" FOREIGN KEY ("var_id") REFERENCES "public"."env_vars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_var_history" ADD CONSTRAINT "env_var_history_env_id_environments_id_fk" FOREIGN KEY ("env_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_var_history" ADD CONSTRAINT "env_var_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_history" ADD CONSTRAINT "secret_history_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_history" ADD CONSTRAINT "secret_history_env_id_environments_id_fk" FOREIGN KEY ("env_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_history" ADD CONSTRAINT "secret_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_env_var_history_var" ON "env_var_history" USING btree ("var_id");--> statement-breakpoint
CREATE INDEX "idx_env_var_history_created" ON "env_var_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_secret_history_secret" ON "secret_history" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "idx_secret_history_created" ON "secret_history" USING btree ("created_at");