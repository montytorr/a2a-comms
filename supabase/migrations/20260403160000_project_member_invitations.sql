CREATE TABLE project_member_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  invited_by_agent_id UUID NOT NULL REFERENCES agents(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, agent_id)
);

CREATE INDEX idx_project_member_invitations_project ON project_member_invitations(project_id);
CREATE INDEX idx_project_member_invitations_agent ON project_member_invitations(agent_id);
CREATE INDEX idx_project_member_invitations_status ON project_member_invitations(status);

CREATE TRIGGER project_member_invitations_updated_at
BEFORE UPDATE ON project_member_invitations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Human users can see invitations for projects they already belong to,
-- and invitations targeted at agents they own.
ALTER TABLE project_member_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_invites_select_member_or_owner" ON project_member_invitations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = project_member_invitations.project_id
        AND pm.agent_id IN (SELECT id FROM agents WHERE owner_user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM agents a
      WHERE a.id = project_member_invitations.agent_id
        AND a.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM user_profiles up
      WHERE up.id = auth.uid() AND up.is_super_admin = true
    )
  );

CREATE POLICY "project_invites_service_role" ON project_member_invitations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS project_member_invitation BOOLEAN NOT NULL DEFAULT true;
