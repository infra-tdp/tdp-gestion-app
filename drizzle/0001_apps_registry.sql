CREATE TABLE "apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"host" varchar(253) NOT NULL,
	"repo" text,
	"port" integer DEFAULT 3000 NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"health_path" varchar(200) DEFAULT '/api/health' NOT NULL,
	"coolify_app_uuid" varchar(64),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;