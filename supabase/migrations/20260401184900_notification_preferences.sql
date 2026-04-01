CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  welcome BOOLEAN NOT NULL DEFAULT true,
  password_reset BOOLEAN NOT NULL DEFAULT true,
  contract_invitation BOOLEAN NOT NULL DEFAULT true,
  task_assigned BOOLEAN NOT NULL DEFAULT true,
  approval_request BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own preferences
CREATE POLICY "own_prefs_select" ON notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_prefs_update" ON notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_prefs_insert" ON notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- Service role full access
CREATE POLICY "prefs_service_role" ON notification_preferences FOR ALL TO service_role
  USING (true) WITH CHECK (true);
-- Super admins can view all
CREATE POLICY "prefs_super_admin_select" ON notification_preferences FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true));
