-- AC-55: give a dead run somewhere to go, and unblock the task it was holding.
--
-- Heartbeats were written on every run update and nothing ever read them. The
-- only consumer of `heartbeat_at` was isExecutionStale() in a file named
-- task-execution-ui.ts, used to render a badge — so a run whose agent died was
-- noticed only if a human happened to open that task's page.
--
-- The consequence was worse than a missing warning. Nothing ever cleared
-- tasks.active_run_id, and POST /runs refuses to start a run while it is set,
-- so a dead agent blocked its task permanently with no automated recovery.
--
-- A silent run is CANCELLED, not FAILED. Silence is evidence that a run stopped
-- reporting, not that its work failed — the same distinction the contract
-- closure outcomes draw between a spent turn budget and accepted work. Marking
-- it failed would assert something the platform cannot know.

CREATE OR REPLACE FUNCTION reap_stale_execution_runs(
  p_stale_after_minutes INTEGER DEFAULT 15,
  p_limit INTEGER DEFAULT 200,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE (
  run_id UUID,
  task_id UUID,
  project_id UUID,
  agent_id UUID,
  previous_status TEXT,
  heartbeat_at TIMESTAMPTZ,
  silent_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - make_interval(mins => p_stale_after_minutes);
BEGIN
  CREATE TEMP TABLE _stale_runs ON COMMIT DROP AS
  SELECT r.id, r.task_id, r.project_id, r.agent_id, r.status, r.heartbeat_at,
         GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(r.heartbeat_at, r.started_at, r.created_at))) / 60)::INTEGER AS silent_minutes
    FROM task_execution_runs r
   WHERE r.status NOT IN ('succeeded', 'failed', 'cancelled')
     -- A run that has never heartbeated is judged from when it started, so a
     -- process that died before its first heartbeat is still reaped.
     AND COALESCE(r.heartbeat_at, r.started_at, r.created_at) < v_cutoff
   ORDER BY COALESCE(r.heartbeat_at, r.started_at, r.created_at) ASC
   LIMIT p_limit
     FOR UPDATE SKIP LOCKED;

  IF NOT p_dry_run THEN
    UPDATE task_execution_runs r
       SET status = 'cancelled',
           completed_at = now(),
           updated_at = now(),
           error_message = COALESCE(r.error_message,
             format('No heartbeat for %s minutes; cancelled by the stale-run sweep. This records that the run stopped reporting, not that its work failed.',
                    s.silent_minutes))
      FROM _stale_runs s
     WHERE r.id = s.id;

    -- Release the task. This is the half that matters: without it the task
    -- stays permanently unable to start another run.
    UPDATE tasks t
       SET active_run_id = NULL,
           execution_status = 'idle',
           execution_completed_at = now(),
           updated_at = now()
      FROM _stale_runs s
     WHERE t.id = s.task_id
       AND t.active_run_id = s.id;
  END IF;

  RETURN QUERY
  SELECT s.id, s.task_id, s.project_id, s.agent_id, s.status, s.heartbeat_at, s.silent_minutes
    FROM _stale_runs s;
END;
$$;

COMMENT ON FUNCTION reap_stale_execution_runs IS
  'Cancels execution runs that stopped heartbeating and releases the tasks they were holding. Returns the reaped rows so the caller can emit events for them.';
