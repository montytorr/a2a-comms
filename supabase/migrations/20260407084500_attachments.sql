-- Attachment / artifact support for tasks, contracts, and execution checkpoints

CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  run_id UUID REFERENCES task_execution_runs(id) ON DELETE SET NULL,
  checkpoint_id UUID REFERENCES task_execution_checkpoints(id) ON DELETE SET NULL,
  uploader_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  uploader_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
  storage_bucket TEXT NOT NULL DEFAULT 'artifacts',
  storage_path TEXT NOT NULL UNIQUE,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (task_id IS NOT NULL OR contract_id IS NOT NULL),
  CHECK (
    task_id IS NULL
    OR project_id = (SELECT t.project_id FROM tasks t WHERE t.id = task_id)
  ),
  CHECK (
    run_id IS NULL
    OR task_id IS NOT NULL
  ),
  CHECK (
    checkpoint_id IS NULL
    OR run_id IS NOT NULL
  )
);

CREATE INDEX idx_task_attachments_project_created ON task_attachments(project_id, created_at DESC);
CREATE INDEX idx_task_attachments_task_created ON task_attachments(task_id, created_at DESC);
CREATE INDEX idx_task_attachments_contract_created ON task_attachments(contract_id, created_at DESC);
CREATE INDEX idx_task_attachments_run_created ON task_attachments(run_id, created_at DESC);
CREATE INDEX idx_task_attachments_checkpoint_created ON task_attachments(checkpoint_id, created_at DESC);

ALTER TABLE task_execution_checkpoints
  ADD COLUMN attachment_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_attachments_select_authenticated"
  ON task_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "task_attachments_all_service_role"
  ON task_attachments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
