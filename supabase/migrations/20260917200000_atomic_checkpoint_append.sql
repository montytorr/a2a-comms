-- AC-55: make a checkpoint append atomic, and stop it wiping the run summary.
--
-- Two defects, both in appendTaskCheckpoint:
--
-- 1. The checkpoint row was INSERTed and committed, and only then was
--    task_execution_runs.checkpoint_count bumped under a compare-and-set. When
--    the CAS missed, the code raised "Concurrent checkpoint write conflict —
--    retry" with the checkpoint row already persisted. The run was then left
--    holding a checkpoint at sequence N while its counter still read N-1, so
--    the next append computed the same sequence and died on
--    UNIQUE(run_id, sequence) — permanently. Two concurrent checkpoints could
--    leave a run unable to ever checkpoint again.
--
-- 2. The same update wrote `summary = input.summary ?? null`, so a checkpoint
--    posted without a summary silently erased the run's existing one.
--    updateTaskExecutionRun already had this right, distinguishing absent from
--    explicitly null.
--
-- Doing the whole append in one statement under a row lock fixes both: the
-- sequence is allocated and consumed together, and an absent summary is
-- simply not written.

CREATE OR REPLACE FUNCTION append_task_checkpoint_atomic(
  p_run_id UUID,
  p_task_id UUID,
  p_project_id UUID,
  p_agent_id UUID,
  p_checkpoint_key TEXT,
  p_summary TEXT DEFAULT NULL,
  p_summary_provided BOOLEAN DEFAULT false,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_attachment_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run RECORD;
  v_checkpoint RECORD;
  v_next_sequence INTEGER;
BEGIN
  -- Lock the run so the sequence cannot be allocated twice.
  SELECT id, status, checkpoint_count, summary
    INTO v_run
    FROM task_execution_runs
   WHERE id = p_run_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'RUN_NOT_FOUND', 'message', 'Execution run not found');
  END IF;

  IF v_run.status IN ('succeeded', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'error', 'INVALID_STATE',
      'message', format('Run is %s; completed runs do not accept checkpoints', v_run.status)
    );
  END IF;

  v_next_sequence := COALESCE(v_run.checkpoint_count, 0) + 1;

  INSERT INTO task_execution_checkpoints (
    run_id, task_id, project_id, agent_id,
    sequence, checkpoint_key, summary, payload, attachment_ids
  )
  VALUES (
    p_run_id, p_task_id, p_project_id, p_agent_id,
    v_next_sequence, p_checkpoint_key, p_summary, p_payload, p_attachment_ids
  )
  RETURNING * INTO v_checkpoint;

  UPDATE task_execution_runs
     SET checkpoint_count = v_next_sequence,
         heartbeat_at = v_checkpoint.created_at,
         -- Only overwrite the run summary when the caller actually supplied
         -- one. A checkpoint without a summary must not erase the run's.
         summary = CASE WHEN p_summary_provided THEN p_summary ELSE summary END,
         updated_at = now()
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'checkpoint', to_jsonb(v_checkpoint),
    'sequence', v_next_sequence,
    'checkpoint_count', v_next_sequence,
    'heartbeat_at', v_checkpoint.created_at
  );
END;
$$;

COMMENT ON FUNCTION append_task_checkpoint_atomic IS
  'Allocates a checkpoint sequence and consumes it in one locked statement. Replaces the insert-then-compare-and-set path that could strand a run with a checkpoint it could not count.';

-- The supersede half of this design was never built: nothing in the codebase
-- has ever written 'superseded'. Say so, rather than leaving the next reader
-- to assume a working feature.
COMMENT ON COLUMN public.task_execution_checkpoints.status IS
  'Reserved. Only ''written'' is ever produced; no code path supersedes a checkpoint.';
