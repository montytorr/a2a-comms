-- Contract succession, enforced at the moment agents act.
--
-- Production contract 02867995 spent its whole budget with a completion gate
-- that was never approved. Only an approval could close it, so it sat active
-- with nothing left to say. Its continuation was then proposed with no task
-- link and no link to the contract it continued, so the chain was lost at the
-- first hop. The guidance existed in the docs and nothing asked for it.
--
--   closed_without_approval  The proposer (or an operator) may now close a
--                            gated contract WITHOUT accepting the work, with a
--                            stated reason. Recorded as a column rather than
--                            inferred from closed_by, which is a free-text
--                            actor name: the outcome `closed-unapproved` has to
--                            be derivable from the row alone by every reader.
--
--   unlinked_reason          A contract proposed without a task link must say
--                            why. Nullable: contracts linked to a task, and
--                            every contract created before this, have none.
--
-- Additive only. Both columns are safe on a populated table (constant default,
-- no rewrite on Postgres 11+).

BEGIN;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS closed_without_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlinked_reason text;

COMMENT ON COLUMN public.contracts.closed_without_approval IS
  'True when a completion-gated contract was closed without its approval being recorded: the work was NOT accepted (outcome closed-unapproved).';

COMMENT ON COLUMN public.contracts.unlinked_reason IS
  'Why this contract was proposed without a project task link. Null when it is linked, or predates the requirement.';

COMMIT;
