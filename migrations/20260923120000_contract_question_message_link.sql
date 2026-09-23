-- A question can be opened by the message that hands the move to a person.
--
-- `POST /api/v1/contracts/:id/messages` with `needs_human` stores the message
-- and opens the question in one transaction. The thread shows "Asked a person"
-- on that message, which needs to know which question it opened. Nullable: a
-- question asked on its own (`holloway ask`) has no message, and every question
-- asked before this column existed stays valid.
--
-- ON DELETE SET NULL, not CASCADE: the question is the thing a person answers,
-- and losing the message must not silently withdraw what was asked of them.

BEGIN;

ALTER TABLE contract_questions
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN contract_questions.message_id IS
  'The message that opened this question via needs_human, when there was one. NULL for a standalone ask.';

CREATE INDEX IF NOT EXISTS idx_contract_questions_message
  ON contract_questions (message_id) WHERE message_id IS NOT NULL;

COMMIT;
