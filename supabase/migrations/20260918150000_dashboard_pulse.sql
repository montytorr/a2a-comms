-- AC-68: one query that says whether anything a dashboard page cares about moved.
--
-- Twenty of thirty pages re-render themselves on a 10-15s timer whether or not
-- anything changed. CAIRN-152 answered this question on the sibling dashboard
-- and the answer was that pages should not poll: a stream says only THAT
-- something moved, and the page then re-renders through its normal server path.
-- Its other lesson is in the shape of this function - ONE query, "because this
-- runs every few seconds for every open tab and four round trips would not do".
--
-- A fingerprint per DOMAIN, not per table, and a page watches only the domains
-- it displays. Two failure modes are being avoided at once, and they pull in
-- opposite directions:
--
--   too coarse - one fingerprint for everything refreshes a contract page
--                because an unrelated webhook was delivered: churn.
--   too narrow - a page displaying something the fingerprint does not cover
--                silently never updates for it, which is the bug this whole
--                exercise exists to fix, reintroduced.
--
-- So each domain is the union of the tables a page showing that domain renders:
-- task execution runs and comments move `tasks`, sprints and membership
-- invitations move `projects`, contract links move `contracts`. Anything
-- displayed on a dashboard page must be inside one of these unions.
--
-- Cost, stated rather than discovered later: count(*) is a sequential scan in
-- Postgres, and this runs at most once a second across all connected tabs
-- (readPulse caches). max() on a timestamp is cheap; the counts exist because a
-- status flip on a table with no updated_at moves nothing else. The largest
-- table here is audit_log at ~6k rows. If one of these reaches a size where a
-- scan a second matters, that is the line to revisit.

BEGIN;

CREATE OR REPLACE FUNCTION a2a_pulse()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH stamps AS (
    SELECT 'contracts'::text AS domain, max(updated_at) AS at, count(*) AS n FROM contracts
    UNION ALL SELECT 'contracts', max(created_at), count(*) FROM contract_links
    -- An acceptance sets status and responded_at together. This is the
    -- transition that started all of this: an invite accepted in another
    -- agent's session, invisible in an open tab until a manual reload.
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

COMMENT ON FUNCTION a2a_pulse() IS
  'One row of per-domain fingerprints. A page subscribes to the domains it displays and re-renders only when one of them changes.';

COMMIT;
