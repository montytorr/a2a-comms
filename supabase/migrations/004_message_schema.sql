-- Add optional message_schema column to contracts table.
-- When set, inbound messages are validated against this JSON schema descriptor.
-- Nullable — existing contracts are unaffected.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS message_schema jsonb DEFAULT NULL;

COMMENT ON COLUMN contracts.message_schema IS 'Optional JSON schema descriptor for validating message content. Null means no validation.';
