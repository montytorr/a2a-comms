ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS reputation_snapshot JSONB;

CREATE TABLE IF NOT EXISTS reputation_ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL CHECK (source_type IN ('task_run', 'approval', 'operator_review', 'security_incident', 'handoff', 'system')),
  signal_key TEXT NOT NULL CHECK (signal_key IN ('delivery_reliability', 'approval_outcomes', 'collaboration_quality', 'security_hygiene', 'operator_feedback')),
  value NUMERIC(5,4) NOT NULL CHECK (value >= -1 AND value <= 1),
  weight_hint NUMERIC(5,4),
  source_id TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  reviewer_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  reviewer_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS reputation_ledger_events_agent_occurred_idx
  ON reputation_ledger_events(agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS reputation_ledger_events_signal_idx
  ON reputation_ledger_events(signal_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS reputation_ledger_events_project_idx
  ON reputation_ledger_events(project_id, task_id);
CREATE INDEX IF NOT EXISTS reputation_ledger_events_metadata_gin_idx
  ON reputation_ledger_events USING GIN (metadata);

CREATE TABLE IF NOT EXISTS task_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_activity_events_task_created_idx
  ON task_activity_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_activity_events_project_created_idx
  ON task_activity_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_activity_events_type_created_idx
  ON task_activity_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS task_activity_events_metadata_gin_idx
  ON task_activity_events USING GIN (metadata);
