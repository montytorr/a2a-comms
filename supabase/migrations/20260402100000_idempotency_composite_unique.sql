-- Fix P2: Idempotency key namespace scoping
-- The original schema uses `key` as sole PRIMARY KEY, meaning:
--   1. Different agents using the same idempotency key overwrite each other
--   2. The same key on different endpoints replays incorrect cached responses
-- Fix: composite primary key on (key, agent_id, endpoint)

-- Drop the existing primary key (single column on `key`)
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;

-- Add composite primary key
ALTER TABLE idempotency_keys ADD PRIMARY KEY (key, agent_id, endpoint);
