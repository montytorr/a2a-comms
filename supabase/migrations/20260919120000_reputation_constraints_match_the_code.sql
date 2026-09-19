-- Bring reputation_ledger_events back in line with the code and the ledger.
--
-- Production allows one more value than either on both columns:
--
--   signal_key   + 'operator_feedback'
--   source_type  + 'operator_review'
--
-- No migration adds them, `ReputationSignalKey` and `ReputationEventSourceType`
-- in src/lib/types.ts do not contain them, nothing in src/ writes them, and the
-- table has zero rows. They were added to the live database by hand for
-- something that was never built, and the ledger never learned about it.
--
-- This is the third instance of the same failure in two days — the others were
-- pending_approvals.status (missing 'consumed', which the app wrote and the
-- database refused) and webhook_deliveries.status (the reverse: production
-- widened by hand, the ledger not told). All three existed because nothing
-- compares the schema the migrations produce against the schema that is
-- actually running. scripts/verify-schema.sh now does, and it is what found
-- this one.
--
-- Narrowing rather than widening, because here the drift is production's: the
-- values have no code behind them. Safe on any database, because a CHECK is
-- validated against existing rows when it is added — a deployment that somehow
-- does have such a row will fail loudly here rather than quietly disagree.

BEGIN;

ALTER TABLE public.reputation_ledger_events
  DROP CONSTRAINT IF EXISTS reputation_ledger_events_signal_key_check;
ALTER TABLE public.reputation_ledger_events
  ADD CONSTRAINT reputation_ledger_events_signal_key_check
  CHECK (signal_key IN (
    'delivery_reliability', 'approval_outcomes', 'collaboration_quality', 'security_hygiene'
  ));

ALTER TABLE public.reputation_ledger_events
  DROP CONSTRAINT IF EXISTS reputation_ledger_events_source_type_check;
ALTER TABLE public.reputation_ledger_events
  ADD CONSTRAINT reputation_ledger_events_source_type_check
  CHECK (source_type IN (
    'task_run', 'approval', 'security_incident', 'handoff', 'system'
  ));

COMMIT;
