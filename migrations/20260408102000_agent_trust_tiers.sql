ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'external'
  CHECK (trust_tier IN ('internal', 'partner', 'external'));

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_notes TEXT;

UPDATE agents
SET trust_tier = CASE
  WHEN owner_user_id = 'eb1f0989-1b9b-4576-9912-037a7fd298a3' THEN 'internal'
  WHEN owner_user_id IS NOT NULL THEN 'partner'
  ELSE 'external'
END
WHERE trust_tier IS NULL OR trust_tier = 'external';
