-- Atomic turn accounting: RPC function to insert message + increment turn in one transaction
-- Prevents race conditions from concurrent POSTs reading stale current_turns
-- Uses SELECT FOR UPDATE to lock the contract row during the operation

CREATE OR REPLACE FUNCTION insert_message_atomic(
  p_contract_id UUID,
  p_sender_id UUID,
  p_message_type TEXT,
  p_content JSONB
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
BEGIN
  -- 1. Lock the contract row and read current state
  SELECT id, status, current_turns, max_turns, expires_at, close_reason, closed_at
    INTO v_contract
    FROM contracts
   WHERE id = p_contract_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'CONTRACT_NOT_FOUND',
      'message', 'Contract not found'
    );
  END IF;

  -- 2. Check contract is active
  IF v_contract.status <> 'active' THEN
    RETURN jsonb_build_object(
      'error', 'INVALID_STATE',
      'message', format('Contract is %s, can only send messages to active contracts', v_contract.status)
    );
  END IF;

  -- 3. Check max turns not already reached
  IF v_contract.current_turns >= v_contract.max_turns THEN
    RETURN jsonb_build_object(
      'error', 'MAX_TURNS',
      'message', 'Max turns reached'
    );
  END IF;

  -- 4. Insert the message
  INSERT INTO messages (contract_id, sender_id, message_type, content)
  VALUES (p_contract_id, p_sender_id, p_message_type, p_content)
  RETURNING * INTO v_message;

  -- 5. Increment current_turns atomically
  v_new_turns := v_contract.current_turns + 1;
  v_max_reached := (v_new_turns >= v_contract.max_turns);

  UPDATE contracts
     SET current_turns = v_new_turns,
         updated_at = now(),
         -- Auto-close if max turns reached
         status = CASE WHEN v_max_reached THEN 'closed' ELSE status END,
         close_reason = CASE WHEN v_max_reached THEN 'Max turns reached' ELSE close_reason END,
         closed_at = CASE WHEN v_max_reached THEN now() ELSE closed_at END
   WHERE id = p_contract_id;

  -- 6. Return results
  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message.id,
    'message_created_at', v_message.created_at,
    'new_turns', v_new_turns,
    'max_turns', v_contract.max_turns,
    'max_reached', v_max_reached
  );
END;
$$;
