CREATE TABLE "driver_assignments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "driver_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"driver_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "driver_assignments_ends_after_start" CHECK ("driver_assignments"."ended_at" IS NULL OR "driver_assignments"."ended_at" > "driver_assignments"."started_at")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "drivers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_assignments_current_per_device" ON "driver_assignments" USING btree ("device_id") WHERE "driver_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_assignments_current_per_driver" ON "driver_assignments" USING btree ("driver_id") WHERE "driver_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "driver_assignments_device_started_idx" ON "driver_assignments" USING btree ("device_id","started_at");