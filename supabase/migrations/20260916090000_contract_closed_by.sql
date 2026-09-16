-- Record WHO closed a contract, not just why.
--
-- `close_reason` carried the actor's name in prose on some paths and not at
-- all on others, and the API path let any caller-supplied `reason` overwrite
-- it. The dashboard path discarded the identity entirely, writing a fixed
-- 'Closed by operator via UI'. The only durable record was audit_log.actor,
-- which the three system paths (expiry, kill switch, max turns) never wrote.
--
-- Text rather than a foreign key: closers are polymorphic — an agent, a
-- human operator, or the system itself. audit_log.actor already resolved the
-- same tension the same way. `closed_by_kind` keeps the three cases
-- distinguishable without a join.

alter table public.contracts
  add column if not exists closed_by text,
  add column if not exists closed_by_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contracts_closed_by_kind_check'
  ) then
    alter table public.contracts
      add constraint contracts_closed_by_kind_check
      check (closed_by_kind is null or closed_by_kind in ('agent', 'user', 'system'));
  end if;
end $$;

-- audit_log is the only place historical closers survive. resource_id had no
-- index, so this lookup would otherwise seq-scan the whole table per row.
create index if not exists idx_audit_log_resource on public.audit_log (resource_type, resource_id);

-- Backfill from the audit trail where it exists. Contracts closed by expiry,
-- the kill switch or the max-turns trigger wrote no audit row and stay null;
-- they are correctly attributed by the application changes that accompany
-- this migration, from here on.
update public.contracts c
set
  closed_by = a.actor,
  closed_by_kind = case when a.actor like '%@%' then 'user' else 'agent' end
from (
  select distinct on (resource_id) resource_id, actor
  from public.audit_log
  where action = 'contract.close' and resource_type = 'contract'
  order by resource_id, created_at desc
) a
where c.id = a.resource_id
  and c.closed_by is null;

comment on column public.contracts.closed_by is
  'Agent name, user email, or system:<cause>. Null for historical rows closed before this column existed with no audit trail.';


-- The max-turns auto-close is a stored function, not application code, so it
-- has to be redefined here to attribute the close. Body is otherwise
-- unchanged from 20260402000000_atomic_turn_accounting.sql.
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
         closed_by = CASE WHEN v_max_reached THEN 'system:max-turns' ELSE closed_by END,
         closed_by_kind = CASE WHEN v_max_reached THEN 'system' ELSE closed_by_kind END,
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
