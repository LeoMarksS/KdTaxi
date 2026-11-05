CREATE TABLE "chat_messages" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"ride_id" varchar(100) NOT NULL,
	"sender_id" varchar(100) NOT NULL,
	"sender_name" varchar(150) NOT NULL,
	"sender_photo" text,
	"text" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_text_length_check" CHECK (char_length("chat_messages"."text") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"destination" varchar(200) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_local" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"client_id" varchar(100) NOT NULL,
	"client_name" varchar(150) NOT NULL,
	"client_phone" varchar(30) NOT NULL,
	"client_photo" text,
	"client_avg_rating" double precision,
	"client_ride_count" integer,
	"driver_id" varchar(100),
	"driver_name" varchar(150),
	"driver_photo" text,
	"driver_avg_rating" double precision,
	"driver_ride_count" integer,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"vehicle_type" varchar(20) NOT NULL,
	"price" numeric(10, 2),
	"payment" varchar(20) DEFAULT 'dinheiro',
	"status" varchar(30) DEFAULT 'waiting' NOT NULL,
	"client_rating" integer,
	"driver_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "rides_vehicle_check" CHECK ("rides"."vehicle_type" in ('car', 'motorcycle')),
	CONSTRAINT "rides_payment_check" CHECK ("rides"."payment" is null or "rides"."payment" in ('pix', 'dinheiro')),
	CONSTRAINT "rides_status_check" CHECK ("rides"."status" in ('waiting', 'accepted', 'in_progress', 'finished', 'cancelled')),
	CONSTRAINT "rides_client_rating_check" CHECK ("rides"."client_rating" is null or ("rides"."client_rating" >= 1 and "rides"."client_rating" <= 5)),
	CONSTRAINT "rides_driver_rating_check" CHECK ("rides"."driver_rating" is null or ("rides"."driver_rating" >= 1 and "rides"."driver_rating" <= 5))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"password_hash" text NOT NULL,
	"mode" varchar(20) NOT NULL,
	"vehicle_type" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"photo" text,
	"push_token" text,
	"rating" double precision DEFAULT 0 NOT NULL,
	"ride_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_mode_check" CHECK ("users"."mode" in ('client', 'driver', 'admin')),
	CONSTRAINT "users_vehicle_check" CHECK ("users"."vehicle_type" is null or "users"."vehicle_type" in ('car', 'motorcycle'))
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_ride_timestamp_idx" ON "chat_messages" USING btree ("ride_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rules_destination_unique" ON "pricing_rules" USING btree (lower("destination")) WHERE "pricing_rules"."is_local" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rules_single_local_unique" ON "pricing_rules" USING btree ("is_local") WHERE "pricing_rules"."is_local" = true;--> statement-breakpoint
CREATE INDEX "rides_client_id_idx" ON "rides" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "rides_driver_id_idx" ON "rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_created_at_idx" ON "rides" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");