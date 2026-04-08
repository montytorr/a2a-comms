ALTER TABLE contract_participants
  DROP CONSTRAINT IF EXISTS contract_participants_role_check;

ALTER TABLE contract_participants
  ADD CONSTRAINT contract_participants_role_check
  CHECK (role IN ('proposer', 'invitee', 'observer'));
