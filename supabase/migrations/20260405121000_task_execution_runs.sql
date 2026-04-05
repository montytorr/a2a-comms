-- Long-running task semantics + durable checkpoints
-- Introduces execution-run lifecycle state for project tasks and checkpoint persistence.

CREATE TABLE task_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'starting', 'running', 'paused', 'handoff-needed', 'succeeded', 'failed', 'cancelled')
  ),
  attempt INT NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  checkpoint_count INT NOT NULL DEFAULT 0 CHECK (checkpoint_count >= 0),
  summary TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_execution_runs_task_created ON task_execution_runs(task_id, created_at DESC);
CREATE INDEX idx_task_execution_runs_project_created ON task_execution_runs(project_id, created_at DESC);
CREATE INDEX idx_task_execution_runs_agent_status ON task_execution_runs(agent_id, status);

CREATE TABLE task_execution_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES task_execution_runs(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sequence INT NOT NULL CHECK (sequence >= 1),
  checkpoint_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'written' CHECK (status IN ('written', 'superseded')),
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, sequence),
  UNIQUE(run_id, checkpoint_key)
);

CREATE INDEX idx_task_execution_checkpoints_run_sequence ON task_execution_checkpoints(run_id, sequence DESC);
CREATE INDEX idx_task_execution_checkpoints_task_created ON task_execution_checkpoints(task_id, created_at DESC);

ALTER TABLE tasks
  ADD COLUMN active_run_id UUID REFERENCES task_execution_runs(id) ON DELETE SET NULL,
  ADD COLUMN execution_status TEXT CHECK (
    execution_status IN ('idle', 'queued', 'running', 'paused', 'handoff-needed', 'succeeded', 'failed', 'cancelled')
  ),
  ADD COLUMN execution_started_at TIMESTAMPTZ,
  ADD COLUMN execution_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN execution_completed_at TIMESTAMPTZ,
  ADD COLUMN last_checkpoint_at TIMESTAMPTZ,
  ADD COLUMN last_checkpoint_summary TEXT,
  ADD COLUMN last_checkpoint_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE tasks
SET
  execution_status = CASE
    WHEN status = 'in-progress' THEN 'running'
    WHEN status = 'done' THEN 'succeeded'
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE 'idle'
  END,
  last_checkpoint_payload = COALESCE(last_checkpoint_payload, '{}'::jsonb);

ALTER TABLE tasks
  ALTER COLUMN execution_status SET DEFAULT 'idle',
  ALTER COLUMN execution_status SET NOT NULL,
  ALTER COLUMN last_checkpoint_payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN last_checkpoint_payload SET NOT NULL;

CREATE INDEX idx_tasks_active_run ON tasks(active_run_id);
CREATE INDEX idx_tasks_execution_status ON tasks(execution_status);

CREATE OR REPLACE FUNCTION touch_task_execution_run_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_execution_runs_updated_at
BEFORE UPDATE ON task_execution_runs
FOR EACH ROW EXECUTE FUNCTION touch_task_execution_run_updated_at();
