-- AC-71 / AC-72: a side-channel between the humans and the agents on a contract.
--
-- Contracts are agent-only by construction. Every /api/v1 route authenticates
-- with HMAC over x-api-key/x-timestamp/x-signature/x-nonce and there is no
-- session path into it, so a human can only write a contract message by holding
-- an agent's signing secret. The result is that on a TASK an operator can leave
-- a comment an agent might find, and on a CONTRACT there is nothing at all.
--
-- Two directions, two tables, one surface.
--
--   contract_notes      human -> agent. Standing instructions, re-read on every
--                       read rather than delivered once. A note takes effect on
--                       the next read; it never interrupts and never consumes a
--                       turn. Plural and durable: the whole set is the standing
--                       context, which is why withdrawal is a soft delete and
--                       not a row vanishing from under an agent mid-contract.
--
--   contract_questions  agent -> human. The thing an agent has never been able
--                       to do: stop and ask. Today a worker that says it is
--                       stuck prints neither sanctioned marker, is classified
--                       WORKER INCOMPLETE, and is retried every fifteen minutes
--                       for twenty-four hours. Being blocked is indistinguish-
--                       able from crashing.
--
-- Deliberately NOT pending_approvals. That table has no contract, task or
-- project foreign key, so an approval can never be found from the thing it is
-- about; its reviewers must be cross-owner; and it is about platform ACTIONS
-- (kill switch, key rotation), not about a conversation. Overloading it would
-- put two unrelated lifecycles in one status column.

BEGIN;

-- ── human -> agent ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Withdrawn, not deleted. An agent that acted on a note needs the note to
  -- still exist when someone asks why it did that.
  withdrawn_at TIMESTAMPTZ,
  CHECK (length(btrim(body)) > 0)
);

COMMENT ON TABLE contract_notes IS
  'Human-authored standing instructions on a contract. Re-read on every contract read; never a turn, never a wake.';
COMMENT ON COLUMN contract_notes.withdrawn_at IS
  'Soft withdrawal. A withdrawn note stops being standing context but stays readable as the reason an agent acted.';

CREATE INDEX IF NOT EXISTS idx_contract_notes_live
  ON contract_notes (contract_id, created_at) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contract_notes_contract
  ON contract_notes (contract_id, created_at);

-- Acknowledgement is per agent, because "has this been read" has a different
-- answer for each participant and a single boolean would lie to all but one.
CREATE TABLE IF NOT EXISTS contract_note_acks (
  note_id UUID NOT NULL REFERENCES contract_notes(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, agent_id)
);

COMMENT ON TABLE contract_note_acks IS
  'Which agent has acknowledged which note. Advisory: an unacknowledged note is still in force.';

CREATE INDEX IF NOT EXISTS idx_contract_note_acks_agent ON contract_note_acks (agent_id);

-- ── agent -> human ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  asked_by_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- What the agent needs, in its own words about its own state:
  --   question    it would like an answer but can carry on without one
  --   validation  it has done something and wants a person to confirm before it
  --               is treated as done
  --   blocked     it cannot proceed at all
  kind TEXT NOT NULL CHECK (kind IN ('question', 'validation', 'blocked')),
  body TEXT NOT NULL,
  -- Whether the agent can proceed without an answer. Derived from kind by the
  -- CLI but stored explicitly, because the agent is the only thing that knows
  -- and a rule mapping kind to blocking would be guessing on its behalf.
  blocking BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'dismissed')),
  answer TEXT,
  answered_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  answered_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CHECK (length(btrim(body)) > 0),
  -- An answered question has an answer and a time; an open one has neither.
  CHECK (
    (status = 'open' AND answer IS NULL AND answered_at IS NULL)
    OR (status = 'answered' AND answer IS NOT NULL AND answered_at IS NOT NULL)
    OR (status = 'dismissed' AND answered_at IS NOT NULL)
  )
);

COMMENT ON TABLE contract_questions IS
  'An agent asking a person for an answer, a validation, or help while blocked. Answered from the dashboard.';
COMMENT ON COLUMN contract_questions.blocking IS
  'The agent says it cannot proceed. Drives turn_state = human, so nothing nags it for a move it cannot make.';

CREATE INDEX IF NOT EXISTS idx_contract_questions_open
  ON contract_questions (contract_id, created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_contract_questions_contract
  ON contract_questions (contract_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contract_questions_agent
  ON contract_questions (asked_by_agent_id, status);

-- ── pulse ───────────────────────────────────────────────────────────────────
--
-- Both belong to the `contracts` domain rather than a new pulse key: they are
-- displayed on contract pages, and every page that shows a contract already
-- watches `contracts`. A new key would need every one of those pages to opt in
-- again, and a page that forgot would silently never update for a note — which
-- is the exact failure the domain unions exist to prevent.

CREATE OR REPLACE FUNCTION a2a_pulse()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH stamps AS (
    SELECT 'contracts'::text AS domain, max(updated_at) AS at, count(*) AS n FROM contracts
    UNION ALL SELECT 'contracts', max(created_at), count(*) FROM contract_links
    UNION ALL SELECT 'contracts', max(updated_at), count(*) FROM contract_notes
    UNION ALL SELECT 'contracts', NULL, count(*) FROM contract_note_acks
    -- An answer flips status and sets answered_at together, so the max covers
    -- both the asking and the answering.
    UNION ALL SELECT 'contracts', greatest(max(created_at), max(answered_at)), count(*) FILTER (WHERE status = 'open') FROM contract_questions
    UNION ALL SELECT 'contracts', NULL, count(*) FROM contract_questions
    UNION ALL SELECT 'participants', max(responded_at), count(*) FILTER (WHERE status = 'accepted') FROM contract_participants
    UNION ALL SELECT 'participants', NULL, count(*) FROM contract_participants
    UNION ALL SELECT 'messages', max(created_at), count(*) FROM messages
    UNION ALL SELECT 'tasks', max(updated_at), count(*) FROM tasks
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_execution_runs
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_execution_checkpoints
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_comments
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_activity_events
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_dependencies
    UNION ALL SELECT 'tasks', max(linked_at), count(*) FROM task_contracts
    UNION ALL SELECT 'tasks', max(created_at), count(*) FROM task_attachments
    UNION ALL SELECT 'projects', max(updated_at), count(*) FROM projects
    UNION ALL SELECT 'projects', max(updated_at), count(*) FROM sprints
    UNION ALL SELECT 'projects', max(joined_at), count(*) FROM project_members
    UNION ALL SELECT 'projects', max(updated_at), count(*) FILTER (WHERE status = 'pending') FROM project_member_invitations
    UNION ALL SELECT 'projects', NULL, count(*) FROM project_member_invitations
    UNION ALL SELECT 'projects', max(created_at), count(*) FROM project_observers
    UNION ALL SELECT 'approvals', max(created_at), count(*) FILTER (WHERE status = 'pending') FROM pending_approvals
    UNION ALL SELECT 'approvals', NULL, count(*) FROM pending_approvals
    UNION ALL SELECT 'agents', max(updated_at), count(*) FROM agents
    UNION ALL SELECT 'audit', max(created_at), count(*) FROM audit_log
    UNION ALL SELECT 'webhooks', max(created_at), count(*) FROM webhooks
    UNION ALL SELECT 'webhooks', max(created_at), count(*) FILTER (WHERE status <> 'success') FROM webhook_deliveries
    UNION ALL SELECT 'webhooks', NULL, count(*) FROM webhook_deliveries
  )
  SELECT jsonb_object_agg(domain, fingerprint)
    FROM (
      SELECT domain,
             coalesce(max(at)::text, '-') || '/' || sum(n)::text AS fingerprint
        FROM stamps
       GROUP BY domain
    ) per_domain;
$$;

-- ── RLS, guarded on the role existing ───────────────────────────────────────
--
-- Production runs native Postgres with no Supabase roles, so an unguarded
-- CREATE POLICY would abort this migration and every migration after it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE NOTICE 'no service_role: skipping RLS on the operator channel, as on every other table here';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE contract_notes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE contract_note_acks ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE contract_questions ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_notes' AND policyname='contract_notes_service_role_all') THEN
    CREATE POLICY contract_notes_service_role_all ON contract_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_note_acks' AND policyname='contract_note_acks_service_role_all') THEN
    CREATE POLICY contract_note_acks_service_role_all ON contract_note_acks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_questions' AND policyname='contract_questions_service_role_all') THEN
    CREATE POLICY contract_questions_service_role_all ON contract_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_notes' AND policyname='contract_notes_select_authenticated') THEN
      CREATE POLICY contract_notes_select_authenticated ON contract_notes FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_note_acks' AND policyname='contract_note_acks_select_authenticated') THEN
      CREATE POLICY contract_note_acks_select_authenticated ON contract_note_acks FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_questions' AND policyname='contract_questions_select_authenticated') THEN
      CREATE POLICY contract_questions_select_authenticated ON contract_questions FOR SELECT TO authenticated USING (true);
    END IF;
  END IF;
END $$;

COMMIT;
