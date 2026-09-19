-- Second backfill pass for contracts.closed_by.
--
-- The first pass (20260916090000) recovered the closer from audit_log, which
-- only covers the paths that wrote an audit row. The rest — cancellations and
-- the three system closes — recorded the actor in `close_reason` prose and
-- nowhere else. That prose is machine-written and deterministic, so it can be
-- read back rather than left null.
--
-- Prose forms, all produced by code in this repo:
--   'Cancelled by proposer (<agent>)'  api/v1/contracts/[id]/cancel
--   'Rejected by <agent>'              api/v1/contracts/[id]/reject
--   'Closed by <agent>'                api/v1/contracts/[id]/close (default)
--   'Max turns reached'                insert_message_atomic
--   'Contract expired' / 'Expired before activation'   _helpers.ts
--   'Expired — no activity within time limit'          contract-expiry-sweep.sh
--   'System kill switch activated'     kill-switch/actions.ts
--
-- 'Closed by operator via UI' is deliberately NOT matched: it names no actor,
-- and any row that had one was already recovered from audit_log.

update public.contracts
set
  closed_by = case
    when close_reason like 'Cancelled by proposer (%)'
      then substring(close_reason from '\(([^)]+)\)')
    when close_reason like 'Rejected by %'
      then substring(close_reason from 'Rejected by (.+)$')
    when close_reason like 'Closed by %' and close_reason <> 'Closed by operator via UI'
      then substring(close_reason from 'Closed by (.+)$')
    when close_reason = 'Max turns reached'              then 'system:max-turns'
    when close_reason = 'System kill switch activated'   then 'system:kill-switch'
    when close_reason like 'Expired%no activity%'        then 'system:expiry-sweep'
    when close_reason in ('Contract expired', 'Expired before activation')
                                                         then 'system:expiry'
  end,
  closed_by_kind = case
    when close_reason = 'Max turns reached'              then 'system'
    when close_reason = 'System kill switch activated'   then 'system'
    when close_reason like 'Expired%'                    then 'system'
    when close_reason = 'Contract expired'               then 'system'
    else 'agent'
  end
where closed_by is null
  and close_reason is not null
  and close_reason <> 'Closed by operator via UI'
  and (
    close_reason like 'Cancelled by proposer (%)'
    or close_reason like 'Rejected by %'
    or close_reason like 'Closed by %'
    or close_reason = 'Max turns reached'
    or close_reason = 'System kill switch activated'
    or close_reason like 'Expired%'
    or close_reason = 'Contract expired'
  );
