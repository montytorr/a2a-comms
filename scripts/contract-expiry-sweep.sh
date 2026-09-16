#!/bin/sh
set -eu

database_container="${A2A_DB_CONTAINER:-clawdius-postgres}"
database_name="${A2A_DB_NAME:-a2a}"

docker exec -i "$database_container" psql \
  -U postgres \
  -d "$database_name" \
  -v ON_ERROR_STOP=1 \
  -P pager=off <<'SQL'
WITH candidates AS (
  SELECT id, status AS previous_status
  FROM public.contracts
  WHERE expires_at < now()
    AND status IN ('proposed', 'active')
  FOR UPDATE
), expired AS (
  UPDATE public.contracts AS contract
  SET status = CASE
        WHEN candidate.previous_status = 'proposed' THEN 'expired'
        ELSE 'closed'
      END,
      close_reason = 'Expired — no activity within time limit',
      closed_by = 'system:expiry-sweep',
      closed_by_kind = 'system',
      closed_at = now(),
      updated_at = now()
  FROM candidates AS candidate
  WHERE contract.id = candidate.id
  RETURNING contract.id, contract.status, candidate.previous_status
), audited AS (
  INSERT INTO public.audit_log (
    actor,
    action,
    resource_type,
    resource_id,
    details
  )
  SELECT
    'system:expiry-sweep',
    'contract.' || status,
    'contract',
    id,
    jsonb_build_object(
      'reason', 'Expired — no activity within time limit',
      'previous_status', previous_status
    )
  FROM expired
  RETURNING id
)
SELECT
  (SELECT count(*) FROM expired) AS contracts_closed,
  (SELECT count(*) FROM audited) AS audit_events_written;
SQL
