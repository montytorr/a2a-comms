-- Add retry tracking fields to webhook_deliveries
ALTER TABLE webhook_deliveries 
  ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS retry_delay_ms integer DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;
