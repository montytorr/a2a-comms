-- Add payload storage to webhook_deliveries for crash-resilient re-delivery.
-- Nullable for backward compatibility with existing rows.
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN webhook_deliveries.payload IS
  'Stores the full event, webhook URL, secret, and pre-computed signature so the recovery sweep can re-deliver orphaned deliveries.';
