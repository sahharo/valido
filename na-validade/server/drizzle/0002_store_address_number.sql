ALTER TABLE "stores" ADD COLUMN "address_number" text;--> statement-breakpoint
-- Product names are now fetched in Portuguese first: drop cached suggestions so they are looked up again.
TRUNCATE TABLE "external_product_cache";
