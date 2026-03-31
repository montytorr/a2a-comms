-- Migration: Shared nonce replay protection and rate limiting (Supabase)
-- Required for multi-instance deployments where in-memory Maps don't work.
-- These tables use the service role key (RLS disabled).

-- ── Nonce cache for HMAC replay protection ──
CREATE TABLE IF NOT EXISTS nonce_cache (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_nonce_cache_expires_at ON nonce_cache (expires_at);

-- TTL cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS void AS $$
BEGIN
  DELETE FROM nonce_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Rate limit buckets ──
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at ON rate_limit_buckets (reset_at);

-- TTL cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_buckets()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_buckets WHERE reset_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic rate limit check-and-increment
-- Returns the new count and reset_at after incrementing.
CREATE OR REPLACE FUNCTION rate_limit_increment(
  p_key TEXT,
  p_window_ms BIGINT
)
RETURNS TABLE(new_count INT, bucket_reset_at TIMESTAMPTZ) AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_reset TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
  -- Upsert: insert new bucket or increment existing (reset if expired)
  INSERT INTO rate_limit_buckets (key, count, reset_at)
  VALUES (p_key, 1, v_reset)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limit_buckets.reset_at < v_now THEN 1
      ELSE rate_limit_buckets.count + 1
    END,
    reset_at = CASE
      WHEN rate_limit_buckets.reset_at < v_now THEN v_reset
      ELSE rate_limit_buckets.reset_at
    END
  RETURNING rate_limit_buckets.count, rate_limit_buckets.reset_at
  INTO new_count, bucket_reset_at;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disable RLS (service role only access)
ALTER TABLE nonce_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No policies = service role only (anon/authenticated get nothing)
