-- Fix: allow authenticated users to see agents that share contracts with them
-- Without this, PostgREST FK joins (messages→agents, contracts→agents) 500
-- because RLS blocks reading the other party's agent row.

BEGIN;

-- Allow seeing agents that participate in any contract where your agent also participates
CREATE POLICY "agents_select_shared_contract" ON agents FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT cp2.agent_id
      FROM contract_participants cp1
      JOIN contract_participants cp2 ON cp2.contract_id = cp1.contract_id
      JOIN agents a ON a.id = cp1.agent_id
      WHERE a.owner_user_id = auth.uid()
    )
  );

COMMIT;
