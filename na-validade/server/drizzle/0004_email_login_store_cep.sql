-- Everyone logs in with e-mail: CPF/CNPJ is no longer required for users.
ALTER TABLE "users" ALTER COLUMN "document" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "document_type" DROP NOT NULL;--> statement-breakpoint
-- Optional store postal code (CEP), used to fill the address.
ALTER TABLE "stores" ADD COLUMN "cep" text;
