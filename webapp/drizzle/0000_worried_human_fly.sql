CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"iteration" text DEFAULT '',
	"release_date" text DEFAULT '',
	"remark" text DEFAULT '',
	"detail_remark" text DEFAULT '',
	"color" text,
	"text_color" text,
	"shape" text DEFAULT 'diamond',
	"week" integer,
	"year" integer,
	"feishu_record_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_feishu_record_id_unique" UNIQUE("feishu_record_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"uuid" text PRIMARY KEY NOT NULL,
	"view_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text DEFAULT '',
	"detail_remark" text DEFAULT '',
	"bg_color" text,
	"text_color" text,
	"row_height" integer,
	"show_separator_above" boolean,
	"feishu_record_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_feishu_record_id_unique" UNIQUE("feishu_record_id")
);
--> statement-breakpoint
CREATE TABLE "sync_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"record_id" text NOT NULL,
	"table_id" text,
	"action" text,
	"payload_hash" text,
	"raw_payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_uuid_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_records_record_id_idx" ON "sync_records" USING btree ("record_id");