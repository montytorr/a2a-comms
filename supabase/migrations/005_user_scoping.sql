-- 005_user_scoping.sql
-- Add user scoping: owner_user_id on agents, user_profiles table with super_admin

-- Add owner_user_id to agents (links to Supabase auth user)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "user_profiles_service_role" ON user_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: set Cal as super admin, Mael as regular user
INSERT INTO user_profiles (id, display_name, is_super_admin) VALUES
  ('eb1f0989-1b9b-4576-9912-037a7fd298a3', 'Cal', true),
  ('d80083d8-4b17-4052-90fd-f2cb91fbff06', 'Mael', false)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_super_admin = EXCLUDED.is_super_admin;

-- Link existing agents to their auth users
UPDATE agents SET owner_user_id = 'eb1f0989-1b9b-4576-9912-037a7fd298a3' WHERE name = 'clawdius';
UPDATE agents SET owner_user_id = 'd80083d8-4b17-4052-90fd-f2cb91fbff06' WHERE name = 'b2';
