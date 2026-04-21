ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS blocker_resolution_action TEXT,
  ADD COLUMN IF NOT EXISTS blocker_resolution_owner TEXT,
  ADD COLUMN IF NOT EXISTS blocker_resolution_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocker_resolution_status TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_blocker_resolution_due_at ON tasks(blocker_resolution_due_at);
