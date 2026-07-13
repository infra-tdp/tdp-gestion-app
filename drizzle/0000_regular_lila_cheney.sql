CREATE TYPE "public"."role" AS ENUM('ADMIN', 'INFRA', 'DEV', 'STORE', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."staging_status" AS ENUM('pending', 'provisioning', 'active', 'error', 'destroying', 'destroyed');--> statement-breakpoint
CREATE TYPE "public"."tofu_action" AS ENUM('plan', 'apply');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" integer NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"method" varchar(10) DEFAULT 'GET' NOT NULL,
	"expected_status" integer DEFAULT 200 NOT NULL,
	"interval_seconds" integer DEFAULT 60 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"read" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssh_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staging_envs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"requested_by" integer NOT NULL,
	"image_tag" varchar(128) DEFAULT 'latest' NOT NULL,
	"branch" varchar(160) NOT NULL,
	"status" "staging_status" DEFAULT 'pending' NOT NULL,
	"coolify_app_uuid" varchar(64),
	"backup_key" text,
	"url" text,
	"devbox_port" integer,
	"pr_number" integer,
	"pr_url" text,
	"error_message" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staging_envs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staging_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"env_id" integer NOT NULL,
	"step" varchar(80) NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tofu_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"stack" varchar(120) NOT NULL,
	"action" "tofu_action" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"triggered_by" integer NOT NULL,
	"git_sha" varchar(64),
	"log" text DEFAULT '' NOT NULL,
	"exit_code" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'VIEWER' NOT NULL,
	"store_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "monitor_checks" ADD CONSTRAINT "monitor_checks_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_envs" ADD CONSTRAINT "staging_envs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_events" ADD CONSTRAINT "staging_events_env_id_staging_envs_id_fk" FOREIGN KEY ("env_id") REFERENCES "public"."staging_envs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tofu_runs" ADD CONSTRAINT "tofu_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;