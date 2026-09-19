-- Bring the migration ledger back in line with what the code writes, and with
-- what production already has.
--
-- 20260401072400_webhook_deliveries.sql declared
--   CHECK (status IN ('pending','success','failed'))
-- and no migration has widened it since. But src/lib/webhooks.ts writes
-- 'pending_retry' (lines 116 and 149) for a first attempt that failed and is
-- queued for the retry worker, and 'retrying' while that worker has it.
--
-- Production accepts all five, because the constraint was widened there BY HAND
-- and the change never came back into the ledger. So the live database and this
-- repo disagree, and anyone deploying fresh from these migrations gets the
-- narrow constraint — at which point every retryable webhook delivery fails its
-- status write silently, since the db client turns a constraint violation into
-- {data: null, error} rather than throwing. Deliveries would simply stop being
-- retried, with nothing to show for it.
--
-- This is the same shape as 20260918170000 (the 'consumed' approval status):
-- an application writing a value its own schema refuses. That one had never
-- fired. This one fires on every failed delivery, and only escapes notice here
-- because production was patched out of band.

BEGIN;

ALTER TABLE public.webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_status_check;

ALTER TABLE public.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_status_check
  CHECK (status IN ('pending', 'pending_retry', 'retrying', 'success', 'failed'));

COMMIT;
