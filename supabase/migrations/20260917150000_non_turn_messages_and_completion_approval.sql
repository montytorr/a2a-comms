-- AC-47: non-turn acknowledgements and a completion-approval gate.
--
-- Two problems this closes:
--
-- 1. Every message consumed a contract turn, so acknowledging delivery cost the
--    same budget as doing work. Contracts burned turns on "received" and
--    "status noted" instead of on evidence and decisions.
-- 2. A contract could complete by exhausting its turns, with no recorded
--    statement from the proposer that the work was actually accepted.
--
-- 'receipt' and 'approval' are therefore non-turn message types: they never
-- increment current_turns, they remain available once the turn cap is reached,
-- and they never trigger the max-turn auto-close.

-- 1. Allow the two non-turn message types --------------------------------------
-- The original constraint is an inline CHECK from 001_initial_schema.sql, so its
-- name is whatever Postgres generated. Find it rather than assuming.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'messages'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%message_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END
$$;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('message', 'request', 'response', 'update', 'status', 'receipt', 'approval'));

-- 2. The completion-approval gate ----------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS completion_requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_approved_by UUID REFERENCES public.agents(id);

COMMENT ON COLUMN public.contracts.completion_requires_approval IS
  'When true, the contract cannot be closed as complete, and will not auto-close on max turns, until the proposer records an approval message.';
COMMENT ON COLUMN public.contracts.completion_approved_at IS
  'When the proposer recorded completion approval. Null means the gate is still open.';
COMMENT ON COLUMN public.contracts.completion_approved_by IS
  'The agent whose approval message satisfied the gate. Always the contract proposer.';

-- 3. Turn accounting that knows the difference ---------------------------------
-- The old four-argument function is dropped rather than left in place: adding a
-- defaulted parameter creates a second function, and existing four-argument
-- calls would stay bound to the old body and silently keep charging a turn for
-- receipts. Dropping it means a four-argument call resolves to the new function
-- via the default. CREATE OR REPLACE keeps this migration re-runnable; a bare
-- CREATE fails on the second pass once the five-argument function exists.
DROP FUNCTION IF EXISTS insert_message_atomic(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION insert_message_atomic(
  p_contract_id UUID,
  p_sender_id UUID,
  p_message_type TEXT,
  p_content JSONB,
  p_approves_completion BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
  v_message RECORD;
  v_new_turns INTEGER;
  v_max_reached BOOLEAN;
  v_consumes_turn BOOLEAN;
  v_approval_pending BOOLEAN;
  v_completes BOOLEAN;
  v_approved_at TIMESTAMPTZ;
  v_approved_by UUID;
BEGIN
  -- Receipts and approvals are bookkeeping about the conversation, not moves
  -- within it.
  v_consumes_turn := p_message_type NOT IN ('receipt', 'approval');

  -- 1. Lock the contract row and read current state
  SELECT id, status, current_turns, max_turns, expires_at, close_reason, closed_at,
         proposer_id, completion_requires_approval, completion_approved_at, completion_approved_by
    INTO v_contract
    FROM contracts
   WHERE id = p_contract_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'CONTRACT_NOT_FOUND', 'message', 'Contract not found');
  END IF;

  -- 2. Check contract is active
  IF v_contract.status <> 'active' THEN
    RETURN jsonb_build_object(
      'error', 'INVALID_STATE',
      'message', format('Contract is %s, can only send messages to active contracts', v_contract.status)
    );
  END IF;

  -- 3. Max turns blocks moves, never bookkeeping. A contract held open for an
  --    approval that has not arrived must still be able to receive that approval.
  IF v_consumes_turn AND v_contract.current_turns >= v_contract.max_turns THEN
    RETURN jsonb_build_object('error', 'MAX_TURNS', 'message', 'Max turns reached');
  END IF;

  -- 4. Only the proposer can satisfy the completion gate. The caller is trusted
  --    to have authenticated the sender; this re-checks the role it maps to.
  IF p_approves_completion AND p_sender_id IS DISTINCT FROM v_contract.proposer_id THEN
    RETURN jsonb_build_object(
      'error', 'FORBIDDEN',
      'message', 'Only the contract proposer can approve completion'
    );
  END IF;

  -- 5. Insert the message
  INSERT INTO messages (contract_id, sender_id, message_type, content)
  VALUES (p_contract_id, p_sender_id, p_message_type, p_content)
  RETURNING * INTO v_message;

  v_approved_at := v_contract.completion_approved_at;
  v_approved_by := v_contract.completion_approved_by;
  IF p_approves_completion AND v_approved_at IS NULL THEN
    v_approved_at := now();
    v_approved_by := p_sender_id;
  END IF;

  IF NOT v_consumes_turn THEN
    -- An approval that arrives once the budget is spent is the completion the
    -- contract was being held open for, so it closes here. An approval that
    -- arrives with turns still available records the gate and leaves the
    -- contract open: the participants may still have work to do.
    v_completes := p_approves_completion
               AND v_contract.completion_requires_approval
               AND v_contract.current_turns >= v_contract.max_turns;

    UPDATE contracts
       SET updated_at = now(),
           completion_approved_at = v_approved_at,
           completion_approved_by = v_approved_by,
           status = CASE WHEN v_completes THEN 'closed' ELSE status END,
           close_reason = CASE WHEN v_completes THEN 'Completed with proposer approval' ELSE close_reason END,
           closed_by = CASE WHEN v_completes THEN 'system:completion-approved' ELSE closed_by END,
           closed_by_kind = CASE WHEN v_completes THEN 'system' ELSE closed_by_kind END,
           closed_at = CASE WHEN v_completes THEN now() ELSE closed_at END
     WHERE id = p_contract_id;

    RETURN jsonb_build_object(
      'success', true,
      'message_id', v_message.id,
      'message_created_at', v_message.created_at,
      'consumes_turn', false,
      'new_turns', v_contract.current_turns,
      'max_turns', v_contract.max_turns,
      'max_reached', v_contract.current_turns >= v_contract.max_turns,
      'completion_approved_at', v_approved_at,
      'completed', v_completes
    );
  END IF;

  -- 6. Increment current_turns atomically
  v_new_turns := v_contract.current_turns + 1;
  v_max_reached := (v_new_turns >= v_contract.max_turns);

  -- Exhausting the budget is not the same as finishing the work. When approval
  -- is required and has not been recorded, hold the contract open so the
  -- proposer can still approve or the participants can request an extension.
  v_approval_pending := v_contract.completion_requires_approval AND v_approved_at IS NULL;

  UPDATE contracts
     SET current_turns = v_new_turns,
         updated_at = now(),
         completion_approved_at = v_approved_at,
         completion_approved_by = v_approved_by,
         status = CASE WHEN v_max_reached AND NOT v_approval_pending THEN 'closed' ELSE status END,
         close_reason = CASE WHEN v_max_reached AND NOT v_approval_pending THEN 'Max turns reached' ELSE close_reason END,
         closed_by = CASE WHEN v_max_reached AND NOT v_approval_pending THEN 'system:max-turns' ELSE closed_by END,
         closed_by_kind = CASE WHEN v_max_reached AND NOT v_approval_pending THEN 'system' ELSE closed_by_kind END,
         closed_at = CASE WHEN v_max_reached AND NOT v_approval_pending THEN now() ELSE closed_at END
   WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message.id,
    'message_created_at', v_message.created_at,
    'consumes_turn', true,
    'new_turns', v_new_turns,
    'max_turns', v_contract.max_turns,
    'max_reached', v_max_reached,
    'awaiting_completion_approval', v_max_reached AND v_approval_pending,
    'completion_approved_at', v_approved_at
  );
END;
$$;
