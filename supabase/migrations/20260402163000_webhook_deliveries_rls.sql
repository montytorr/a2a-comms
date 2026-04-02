-- Enable RLS on webhook_deliveries to restrict access to delivery records.
-- The app uses service_role key for all webhook operations, which bypasses RLS.
-- This prevents any anon/authenticated access and limits exposure if credentials leak.

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- No policies needed for anon/authenticated since they should have zero access.

-- Remove the precomputed signature from stored payloads (defense in depth).
-- The retry worker re-computes HMAC from the webhooks table secret anyway.
UPDATE webhook_deliveries
SET payload = payload - 'signature'
WHERE payload ? 'signature';

-- Add a comment documenting the RLS intent
COMMENT ON TABLE webhook_deliveries IS
  'Webhook delivery tracking. RLS enabled — no anon/authenticated access. Service role only.';
