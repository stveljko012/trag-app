CREATE TABLE "events_inbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_inbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dedupe_key" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "events_inbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"traccar_geofence_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"notes" text,
	"hourly_rate" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_traccar_geofence_id_unique" UNIQUE("traccar_geofence_id"),
	CONSTRAINT "locations_hourly_rate_non_negative" CHECK ("locations"."hourly_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_id_format" CHECK ("sessions"."id" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_role_valid" CHECK ("users"."role" IN ('owner', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "visits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"device_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"duration_s" integer,
	CONSTRAINT "visits_device_location_arrival_unique" UNIQUE("device_id","location_id","arrived_at"),
	CONSTRAINT "visits_left_after_arrival" CHECK ("visits"."left_at" IS NULL OR "visits"."left_at" >= "visits"."arrived_at"),
	CONSTRAINT "visits_duration_non_negative" CHECK ("visits"."duration_s" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_inbox_unprocessed_idx" ON "events_inbox" USING btree ("received_at") WHERE "events_inbox"."processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "visits_arrived_at_idx" ON "visits" USING btree ("arrived_at");--> statement-breakpoint
CREATE INDEX "visits_location_id_idx" ON "visits" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "visits_open_idx" ON "visits" USING btree ("device_id","location_id") WHERE "visits"."left_at" IS NULL;