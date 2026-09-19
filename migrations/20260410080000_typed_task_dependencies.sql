ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS dependency_type TEXT NOT NULL DEFAULT 'blocks'
  CHECK (dependency_type IN ('blocks', 'relates_to', 'sequence_after'));

WITH normalized_pairs AS (
  SELECT
    LEAST(blocking_task_id, blocked_task_id) AS task_a,
    GREATEST(blocking_task_id, blocked_task_id) AS task_b
  FROM task_dependencies
  WHERE dependency_type = 'relates_to'
)
DELETE FROM task_dependencies td
USING normalized_pairs np
WHERE td.dependency_type = 'relates_to'
  AND LEAST(td.blocking_task_id, td.blocked_task_id) = np.task_a
  AND GREATEST(td.blocking_task_id, td.blocked_task_id) = np.task_b
  AND td.ctid NOT IN (
    SELECT MIN(td2.ctid)
    FROM task_dependencies td2
    WHERE td2.dependency_type = 'relates_to'
      AND LEAST(td2.blocking_task_id, td2.blocked_task_id) = np.task_a
      AND GREATEST(td2.blocking_task_id, td2.blocked_task_id) = np.task_b
  );

DROP INDEX IF EXISTS idx_task_deps_blocking;
DROP INDEX IF EXISTS idx_task_deps_blocked;

ALTER TABLE task_dependencies
  DROP CONSTRAINT IF EXISTS task_dependencies_blocking_task_id_blocked_task_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS task_dependencies_unique_directed
  ON task_dependencies (blocking_task_id, blocked_task_id, dependency_type);

CREATE UNIQUE INDEX IF NOT EXISTS task_dependencies_unique_relates_pair
  ON task_dependencies (
    LEAST(blocking_task_id, blocked_task_id),
    GREATEST(blocking_task_id, blocked_task_id),
    dependency_type
  )
  WHERE dependency_type = 'relates_to';

CREATE INDEX IF NOT EXISTS idx_task_deps_blocking ON task_dependencies(blocking_task_id, dependency_type);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocked ON task_dependencies(blocked_task_id, dependency_type);
