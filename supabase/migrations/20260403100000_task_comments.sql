-- Task comments / activity feed
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_agent_id UUID REFERENCES agents(id),
  author_name TEXT,
  content TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment' CHECK (comment_type IN ('comment', 'status_change', 'assignment', 'system')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at DESC);
CREATE INDEX idx_task_comments_project ON task_comments(project_id);

-- RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Agents in the project can read comments
CREATE POLICY task_comments_read ON task_comments FOR SELECT
  USING (project_id IN (
    SELECT project_id FROM project_members WHERE agent_id = auth.uid()
  ));

-- Service role can do everything
CREATE POLICY task_comments_service ON task_comments FOR ALL
  USING (auth.role() = 'service_role');
