ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS stale_blocker BOOLEAN NOT NULL DEFAULT true;
