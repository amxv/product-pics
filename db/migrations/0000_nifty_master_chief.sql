CREATE TYPE "public"."batch_status" AS ENUM('uploading', 'uploaded', 'processing', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."demographic" AS ENUM('baby', 'boy', 'girl', 'man', 'woman');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."runpod_job_status" AS ENUM('in_queue', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploaded', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"demographic" "demographic" NOT NULL,
	"age_range" text NOT NULL,
	"status" "batch_status" DEFAULT 'uploading' NOT NULL,
	"total_images" integer DEFAULT 0 NOT NULL,
	"completed_images" integer DEFAULT 0 NOT NULL,
	"failed_images" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "generated_image" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"uploaded_image_id" text NOT NULL,
	"r2_key" text,
	"status" "generation_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"background" text,
	"runpod_job_id" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "runpod_job" (
	"id" text PRIMARY KEY NOT NULL,
	"generated_image_id" text NOT NULL,
	"job_id" text NOT NULL,
	"status" "runpod_job_status" DEFAULT 'in_queue' NOT NULL,
	"prompt" text NOT NULL,
	"background" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"result_url" text,
	CONSTRAINT "runpod_job_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "uploaded_image" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_image_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_image" ADD CONSTRAINT "generated_image_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_image" ADD CONSTRAINT "generated_image_uploaded_image_id_uploaded_image_id_fk" FOREIGN KEY ("uploaded_image_id") REFERENCES "public"."uploaded_image"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runpod_job" ADD CONSTRAINT "runpod_job_generated_image_id_generated_image_id_fk" FOREIGN KEY ("generated_image_id") REFERENCES "public"."generated_image"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_image" ADD CONSTRAINT "uploaded_image_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE cascade ON UPDATE no action;
