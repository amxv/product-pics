ALTER TABLE "user" ADD COLUMN "total_photos_generated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "photo_generation_limit" integer DEFAULT 600 NOT NULL;