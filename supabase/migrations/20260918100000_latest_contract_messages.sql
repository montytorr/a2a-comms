-- AC-65: answering "whose move is it" needs the last message of each contract.
--
-- The contracts list enriches every row on a page, so doing that per row is a
-- query per contract, and doing it by fetching every message for the page is
-- unbounded in the number of messages. DISTINCT ON gives one row per contract
-- in one pass; the query builder the app uses cannot express it, so it lives
-- here as a function.

BEGIN;

-- DISTINCT ON reads this backwards, so order it the way it is consumed.
CREATE INDEX IF NOT EXISTS idx_messages_contract_created_desc
  ON messages (contract_id, created_at DESC);

CREATE OR REPLACE FUNCTION latest_contract_messages(p_contract_ids UUID[])
RETURNS TABLE (
  contract_id UUID,
  sender_id UUID,
  message_type TEXT,
  requires_action BOOLEAN,
  consumes_turn BOOLEAN,
  turn_number INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (m.contract_id)
         m.contract_id, m.sender_id, m.message_type,
         m.requires_action, m.consumes_turn, m.turn_number, m.created_at
    FROM messages m
   WHERE m.contract_id = ANY(p_contract_ids)
   ORDER BY m.contract_id, m.created_at DESC;
$$;

COMMENT ON FUNCTION latest_contract_messages(UUID[]) IS
  'One row per contract: its most recent message. Used to derive who the contract is waiting on.';

COMMIT;
