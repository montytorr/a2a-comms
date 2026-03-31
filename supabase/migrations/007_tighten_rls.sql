-- Migration 007: Tighten RLS policies for browser-client access
-- Previously, authenticated users could read ALL rows. Now they only see
-- data related to agents they own, with a super_admin bypass.

BEGIN;

-- ============================================================================
-- 1. AGENTS — only see agents you own
-- ============================================================================
DROP POLICY IF EXISTS "agents_select_authenticated" ON agents;

CREATE POLICY "agents_select_own" ON agents FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "agents_select_super_admin" ON agents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

-- ============================================================================
-- 2. CONTRACTS — only see contracts where your agents participate
-- ============================================================================
DROP POLICY IF EXISTS "contracts_select_participants" ON contracts;

CREATE POLICY "contracts_select_own_agents" ON contracts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contract_participants cp
      JOIN agents a ON a.id = cp.agent_id
      WHERE cp.contract_id = contracts.id
      AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "contracts_select_super_admin" ON contracts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

-- ============================================================================
-- 3. CONTRACT_PARTICIPANTS — see participants for contracts your agents are in
-- ============================================================================
DROP POLICY IF EXISTS "contract_participants_select_authenticated" ON contract_participants;

CREATE POLICY "contract_participants_select_own" ON contract_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = contract_participants.agent_id
      AND a.owner_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM contract_participants cp2
      JOIN agents a ON a.id = cp2.agent_id
      WHERE cp2.contract_id = contract_participants.contract_id
      AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "contract_participants_select_super_admin" ON contract_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

-- ============================================================================
-- 4. MESSAGES — only for contracts involving your agents
-- ============================================================================
DROP POLICY IF EXISTS "messages_select_participants" ON messages;

CREATE POLICY "messages_select_own_agents" ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contract_participants cp
      JOIN agents a ON a.id = cp.agent_id
      WHERE cp.contract_id = messages.contract_id
      AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "messages_select_super_admin" ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

-- ============================================================================
-- 5. AUDIT_LOG — only entries for your agents or your user id
-- ============================================================================
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;

CREATE POLICY "audit_log_select_own" ON audit_log FOR SELECT TO authenticated
  USING (
    actor = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM agents a
      WHERE a.owner_user_id = auth.uid()
      AND (
        audit_log.resource_id = a.id
        OR audit_log.actor = a.name
      )
    )
  );

CREATE POLICY "audit_log_select_super_admin" ON audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

-- ============================================================================
-- 6. USER_PROFILES — only read your own profile
-- ============================================================================
-- Drop any existing broad policy first
DROP POLICY IF EXISTS "user_profiles_select_authenticated" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;

CREATE POLICY "user_profiles_select_own" ON user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Super admins can see all profiles (needed for admin dashboard)
CREATE POLICY "user_profiles_select_super_admin" ON user_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_super_admin = true
    )
  );

COMMIT;
