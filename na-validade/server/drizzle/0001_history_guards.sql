-- Quantities can never go negative or above what was received.
ALTER TABLE "lots" ADD CONSTRAINT "lots_quantity_check" CHECK ("initial_quantity" > 0 AND "quantity" >= 0 AND "quantity" <= "initial_quantity");
--> statement-breakpoint
ALTER TABLE "lot_movements" ADD CONSTRAINT "lot_movements_quantity_check" CHECK ("quantity" >= 0);
--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_withdrawn_check" CHECK ("status" <> 'withdrawn' OR ("withdrawn_at" IS NOT NULL AND "withdrawn_by" IS NOT NULL AND "withdrawal_reason" IS NOT NULL));
--> statement-breakpoint
-- Movement history and audit log are append-only, even for code with direct database access.
CREATE FUNCTION "forbid_history_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "lot_movements_append_only" BEFORE UPDATE OR DELETE ON "lot_movements" FOR EACH ROW EXECUTE FUNCTION "forbid_history_change"();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "forbid_history_change"();
