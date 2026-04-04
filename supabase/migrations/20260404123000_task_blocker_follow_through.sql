ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocker_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocker_followed_through_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocker_escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_blocked_at ON tasks(blocked_at);
CREATE INDEX IF NOT EXISTS idx_tasks_blocker_follow_up_at ON tasks(blocker_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_tasks_blocker_followed_through_at ON tasks(blocker_followed_through_at);
CREATE INDEX IF NOT EXISTS idx_tasks_blocker_escalated_at ON tasks(blocker_escalated_at);

WITH active_blocked_tasks AS (
  SELECT DISTINCT td.blocked_task_id
  FROM task_dependencies td
  JOIN tasks blocking ON blocking.id = td.blocking_task_id
  WHERE blocking.status NOT IN ('done', 'cancelled')
)
UPDATE tasks t
SET blocked_at = COALESCE(t.blocked_at, t.updated_at)
FROM active_blocked_tasks abt
WHERE t.id = abt.blocked_task_id
  AND t.blocked_at IS NULL;
