-- Product suggestions are now Portuguese-only: drop cached ones that may be in other languages.
TRUNCATE TABLE "external_product_cache";
