ALTER TYPE "public"."withdrawal_reason" ADD VALUE 'sold';--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "promo_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "promo_discount" integer;
