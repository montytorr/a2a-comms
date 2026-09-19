ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_policy JSONB NOT NULL DEFAULT '{"version":1,"webhooks":{"management":"partner"}}'::jsonb;

UPDATE agents
SET trust_policy = jsonb_build_object(
  'version', 1,
  'webhooks', jsonb_build_object('management', 'partner')
)
WHERE trust_policy IS NULL
   OR trust_policy = '{}'::jsonb;
