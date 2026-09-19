-- Extend long-running execution semantics with explicit waiting states
-- and emit async completion/attention notifications for contract messages.

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_execution_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_execution_status_check CHECK (
    execution_status IN (
      'idle',
      'queued',
      'running',
      'pending-approval',
      'waiting',
      'blocked',
      'paused',
      'handoff-needed',
      'succeeded',
      'failed',
      'cancelled'
    )
  );

ALTER TABLE task_execution_runs
  DROP CONSTRAINT IF EXISTS task_execution_runs_status_check;

ALTER TABLE task_execution_runs
  ADD CONSTRAINT task_execution_runs_status_check CHECK (
    status IN (
      'queued',
      'starting',
      'running',
      'pending-approval',
      'waiting',
      'blocked',
      'paused',
      'handoff-needed',
      'succeeded',
      'failed',
      'cancelled'
    )
  );
