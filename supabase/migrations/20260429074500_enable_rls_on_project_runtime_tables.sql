-- Enable RLS on A2A project/runtime tables that were added after the initial policy pass.
-- Access to these tables is intentionally mediated through service-role-backed API routes
-- and explicit authenticated dashboard policies, not raw anon table access.

BEGIN;

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_execution_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'idempotency_keys', 'pending_approvals', 'projects', 'project_members',
    'sprints', 'tasks', 'task_dependencies', 'task_contracts',
    'task_execution_runs', 'task_execution_checkpoints',
    'reputation_ledger_events', 'task_activity_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = t || '_service_role_all'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role_all', t);
    END IF;
  END LOOP;
END $$;

-- Dashboard/user-facing read policies. Writes remain through existing server actions/API
-- using the service role, unless a table already has a narrower policy elsewhere.
DO $$
DECLARE
  item text[];
  policy_name text;
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ARRAY['projects', 'projects_select_authenticated'],
    ARRAY['project_members', 'project_members_select_authenticated'],
    ARRAY['sprints', 'sprints_select_authenticated'],
    ARRAY['tasks', 'tasks_select_authenticated'],
    ARRAY['task_dependencies', 'task_dependencies_select_authenticated'],
    ARRAY['task_contracts', 'task_contracts_select_authenticated'],
    ARRAY['task_execution_runs', 'task_execution_runs_select_authenticated'],
    ARRAY['task_execution_checkpoints', 'task_execution_checkpoints_select_authenticated'],
    ARRAY['reputation_ledger_events', 'reputation_ledger_events_select_authenticated'],
    ARRAY['task_activity_events', 'task_activity_events_select_authenticated'],
    ARRAY['pending_approvals', 'pending_approvals_select_authenticated']
  ] LOOP
    policy_name := item[2];
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = item[1]
        AND policyname = policy_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', policy_name, item[1]);
    END IF;
  END LOOP;
END $$;

COMMIT;
