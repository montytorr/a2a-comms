-- AC-62: a real edge between two contracts.
--
-- Contracts already related to each other, but only as prose. When a handoff or
-- escalation contract was created, buildHandoffContractDescription wrote a
-- '## Prior handoff contracts' section listing up to five predecessor ids into
-- the new contract's *description string*, and the predecessors themselves were
-- found by matching text:
--
--   isLikelyHandoffContract = title.startsWith('handoff ·')
--                          || description.includes('## task handoff')
--
-- Both of those fields are caller-supplied (--handoff-title,
-- --handoff-description) and the description is editable after the fact
-- (PATCH /contracts/:id, AC-57), so the only record of a chain lived in the two
-- fields an operator is invited to overwrite.
--
-- The vocabulary is deliberately small and directional. Every row reads
-- "from_contract <link_type> to_contract":
--
--   continues     from carries on work to left unfinished (to closed without
--                 completing: turns exhausted, expired, closed by a participant)
--   supersedes    from replaces to (to was rejected, cancelled, or agreed on
--                 terms that turned out to be wrong)
--   delegates_to  from handed execution onward to to — written automatically by
--                 the handoff and escalation paths, which already hold both ids
--
-- There is deliberately no generic 'relates_to'. Generic relatedness is already
-- carried by the shared task (task_contracts), and a second way to say the same
-- thing drifts from the one that drives behaviour.

BEGIN;

CREATE TABLE IF NOT EXISTS contract_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  to_contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('continues', 'supersedes', 'delegates_to')),
  note TEXT,
  created_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_contract_id <> to_contract_id)
);

COMMENT ON TABLE contract_links IS
  'Directional contract-to-contract edges. Read a row as "from_contract <link_type> to_contract".';
COMMENT ON COLUMN contract_links.link_type IS
  'continues | supersedes | delegates_to. No generic relates_to: the shared task carries generic relatedness.';
COMMENT ON COLUMN contract_links.created_by_agent_id IS
  'The agent that recorded the link, or NULL when the server wrote it from a handoff/escalation path.';

-- One edge of a given type between an ordered pair. Re-linking is idempotent
-- rather than an error, which is what every caller actually wants.
CREATE UNIQUE INDEX IF NOT EXISTS contract_links_unique_directed
  ON contract_links (from_contract_id, to_contract_id, link_type);

CREATE INDEX IF NOT EXISTS idx_contract_links_from ON contract_links (from_contract_id, link_type);
CREATE INDEX IF NOT EXISTS idx_contract_links_to ON contract_links (to_contract_id, link_type);

-- Acyclicity, enforced where it belongs.
--
-- All three link types mean "one of these came after the other", so a cycle is
-- never a legitimate state: 'A continues B, B supersedes A' says A both precedes
-- and follows itself. The walk crosses link types for that reason. The graphs
-- are tiny — a handoff chain is a handful of rows — so the recursive check costs
-- nothing worth measuring.
CREATE OR REPLACE FUNCTION contract_links_reject_cycle()
RETURNS TRIGGER AS $$
DECLARE
  v_cycle BOOLEAN;
BEGIN
  WITH RECURSIVE reachable(contract_id, depth) AS (
    SELECT NEW.to_contract_id, 1
    UNION ALL
    SELECT cl.to_contract_id, r.depth + 1
      FROM contract_links cl
      JOIN reachable r ON cl.from_contract_id = r.contract_id
     WHERE r.depth < 64
  )
  SELECT EXISTS (SELECT 1 FROM reachable WHERE contract_id = NEW.from_contract_id)
    INTO v_cycle;

  IF v_cycle THEN
    RAISE EXCEPTION 'contract link would create a cycle: % -> %', NEW.from_contract_id, NEW.to_contract_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contract_links_no_cycles ON contract_links;
CREATE TRIGGER contract_links_no_cycles
  BEFORE INSERT ON contract_links
  FOR EACH ROW EXECUTE FUNCTION contract_links_reject_cycle();

-- Same posture as every other project/runtime table: service-role-backed API
-- routes write, authenticated dashboard sessions read.
ALTER TABLE contract_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'contract_links'
       AND policyname = 'contract_links_service_role_all'
  ) THEN
    CREATE POLICY contract_links_service_role_all ON contract_links
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'contract_links'
       AND policyname = 'contract_links_select_authenticated'
  ) THEN
    CREATE POLICY contract_links_select_authenticated ON contract_links
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMIT;
