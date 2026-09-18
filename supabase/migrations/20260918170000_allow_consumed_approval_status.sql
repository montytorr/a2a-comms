-- Let an approval be marked consumed, which the application has always tried
-- to do and the database has always refused.
--
-- 20260401072401_pending_approvals.sql declared
--   CHECK (status IN ('pending','approved','denied'))
-- and nothing has widened it since. But consumeApproval()
-- (src/lib/approvals.ts) writes status='consumed' after a CAS on 'approved',
-- PendingApproval declares the value, and the dashboard filters on it.
--
-- The db client catches the constraint violation and returns {data:null,error}
-- rather than throwing, so the write failed silently and consumeApproval
-- simply returned null. In activateKillSwitch() that null arrives AFTER
-- system_config.kill_switch has already been flipped on and BEFORE the open
-- contracts are closed, and is turned into a throw — leaving the platform
-- half-killed, with a retry that fails the same way every time.
--
-- Never fired in production only because no approval has ever been approved
-- there: SELECT status, count(*) FROM pending_approvals -> denied | 2.
--
-- Proven against production inside a rolled-back transaction before writing
-- this: INSERT status='approved' succeeded, UPDATE SET status='consumed'
-- raised pending_approvals_status_check.

BEGIN;

ALTER TABLE public.pending_approvals
  DROP CONSTRAINT IF EXISTS pending_approvals_status_check;

ALTER TABLE public.pending_approvals
  ADD CONSTRAINT pending_approvals_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'consumed'));

COMMIT;
