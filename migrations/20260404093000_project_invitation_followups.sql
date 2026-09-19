ALTER TABLE project_member_invitations
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE project_member_invitations
SET expires_at = COALESCE(expires_at, created_at + interval '7 days')
WHERE expires_at IS NULL;

ALTER TABLE project_member_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE project_member_invitations
  DROP CONSTRAINT IF EXISTS project_member_invitations_status_check;

ALTER TABLE project_member_invitations
  ADD CONSTRAINT project_member_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS idx_project_member_invitations_expires_at
  ON project_member_invitations(status, expires_at)
  WHERE status = 'pending';
