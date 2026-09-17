-- AC-48: persist what a message cost, instead of only announcing it.
--
-- 20260917150000 made receipts and approvals free, but it computed
-- consumes_turn and requires_action in flight and emitted them on the webhook
-- and API response only. Nothing was stored, so turn accounting could not be
-- audited or queried afterwards: you could not ask which messages in a
-- contract actually spent its budget, or which ones a recipient owed a reply
-- to. Now each row carries its own accounting.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS requires_action BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS consumes_turn BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS turn_number INTEGER;

COMMENT ON COLUMN public.messages.requires_action IS
  'False when the sender marked the message as needing no follow-up, and always false for receipts and approvals.';
COMMENT ON COLUMN public.messages.consumes_turn IS
  'False for receipts and approvals, which never increment contracts.current_turns.';
COMMENT ON COLUMN public.messages.turn_number IS
  'The contract turn this message belongs to. For a non-turn message it is the turn the contract stood at, so a receipt is placed in the conversation without advancing it.';

-- Every message that predates this consumed a turn, so its ordinal within the
-- contract is its turn number.
WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY contract_id ORDER BY created_at, id)::INTEGER AS ordinal
    FROM public.messages
   WHERE turn_number IS NULL
)
UPDATE public.messages AS message
   SET turn_number = numbered.ordinal
  FROM numbered
 WHERE message.id = numbered.id;

-- Defensive: the defaults above assume a turn-consuming message, which is
-- wrong for any receipt or approval already written between the two migrations.
UPDATE public.messages
   SET consumes_turn = false,
       requires_action = false
 WHERE message_type IN ('receipt', 'approval')
   AND (consumes_turn OR requires_action);

CREATE INDEX IF NOT EXISTS idx_messages_contract_turn_number
  ON public.messages (contract_id, turn_number, created_at);

-- Record the accounting on the row as it is written. p_requires_action is
-- appended with a default so existing four- and five-argument callers keep
-- working while the application rolls forward.
-- Both earlier signatures must go. Leaving the five-argument version from
-- 20260917150000 in place would let the running application's five-argument
-- call bind to the OLD body, which writes none of the accounting above, so the
-- columns would silently stay at their defaults.
DROP FUNCTION IF EXISTS insert_message_atomic(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS insert_message_atomic(UUID, UUID, TEXT, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION insert_message_atomic(
  p_contract_id UUID,
  p_sender_id UUID,
  p_message_type TEXT,
  p_content JSONB,
  p_approves_completion BOOLEAN DEFAULT false,
  p_requires_action BOOLEAN DEFAULT NULL
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
  v_requires_action BOOLEAN;
  v_approval_pending BOOLEAN;
  v_completes BOOLEAN;
  v_approved_at TIMESTAMPTZ;
  v_approved_by UUID;
BEGIN
  v_consumes_turn := p_message_type NOT IN ('receipt', 'approval');
  -- Bookkeeping never owes a reply; a request always does; anything else
  -- honours the caller, defaulting to actionable.
  v_requires_action := CASE
    WHEN NOT v_consumes_turn THEN false
    WHEN p_message_type = 'request' THEN true
    ELSE COALESCE(p_requires_action, true)
  END;

  SELECT id, status, current_turns, max_turns, expires_at, close_reason, closed_at,
         proposer_id, completion_requires_approval, completion_approved_at, completion_approved_by
    INTO v_contract
    FROM contracts
   WHERE id = p_contract_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'CONTRACT_NOT_FOUND', 'message', 'Contract not found');
  END IF;

  IF v_contract.status <> 'active' THEN
    RETURN jsonb_build_object(
      'error', 'INVALID_STATE',
      'message', format('Contract is %s, can only send messages to active contracts', v_contract.status)
    );
  END IF;

  IF v_consumes_turn AND v_contract.current_turns >= v_contract.max_turns THEN
    RETURN jsonb_build_object('error', 'MAX_TURNS', 'message', 'Max turns reached');
  END IF;

  IF p_approves_completion AND p_sender_id IS DISTINCT FROM v_contract.proposer_id THEN
    RETURN jsonb_build_object(
      'error', 'FORBIDDEN',
      'message', 'Only the contract proposer can approve completion'
    );
  END IF;

  v_new_turns := v_contract.current_turns + CASE WHEN v_consumes_turn THEN 1 ELSE 0 END;

  INSERT INTO messages (
    contract_id, sender_id, message_type, content,
    requires_action, consumes_turn, turn_number
  )
  VALUES (
    p_contract_id, p_sender_id, p_message_type, p_content,
    v_requires_action, v_consumes_turn, v_new_turns
  )
  RETURNING * INTO v_message;

  v_approved_at := v_contract.completion_approved_at;
  v_approved_by := v_contract.completion_approved_by;
  IF p_approves_completion AND v_approved_at IS NULL THEN
    v_approved_at := now();
    v_approved_by := p_sender_id;
  END IF;

  IF NOT v_consumes_turn THEN
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
      'requires_action', v_requires_action,
      'turn_number', v_message.turn_number,
      'new_turns', v_contract.current_turns,
      'max_turns', v_contract.max_turns,
      'max_reached', v_contract.current_turns >= v_contract.max_turns,
      'completion_approved_at', v_approved_at,
      'completed', v_completes
    );
  END IF;

  v_max_reached := (v_new_turns >= v_contract.max_turns);
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
    'requires_action', v_requires_action,
    'turn_number', v_message.turn_number,
    'new_turns', v_new_turns,
    'max_turns', v_contract.max_turns,
    'max_reached', v_max_reached,
    'awaiting_completion_approval', v_max_reached AND v_approval_pending,
    'completion_approved_at', v_approved_at
  );
END;
$$;
