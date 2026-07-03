CREATE TABLE "user_last_env" (
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"env_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_last_env_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "user_last_org" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_last_project" (
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_last_project_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
ALTER TABLE "user_last_env" ADD CONSTRAINT "user_last_env_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_env" ADD CONSTRAINT "user_last_env_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_env" ADD CONSTRAINT "user_last_env_env_id_environments_id_fk" FOREIGN KEY ("env_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_org" ADD CONSTRAINT "user_last_org_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_org" ADD CONSTRAINT "user_last_org_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_project" ADD CONSTRAINT "user_last_project_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_project" ADD CONSTRAINT "user_last_project_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_project" ADD CONSTRAINT "user_last_project_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;