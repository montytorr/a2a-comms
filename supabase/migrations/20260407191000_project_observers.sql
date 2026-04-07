CREATE TABLE IF NOT EXISTS project_observers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  invited_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_project_observers_project ON project_observers(project_id);
CREATE INDEX IF NOT EXISTS idx_project_observers_agent ON project_observers(agent_id);

ALTER TABLE project_observers ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_observers_read ON project_observers FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members WHERE agent_id = auth.uid()
    )
    OR auth.role() = 'authenticated'
  );

CREATE POLICY project_observers_service ON project_observers FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS task_comments_comment_type_check;
ALTER TABLE task_comments
  ADD CONSTRAINT task_comments_comment_type_check
  CHECK (comment_type IN ('comment', 'status_change', 'assignment', 'system', 'analysis'));
