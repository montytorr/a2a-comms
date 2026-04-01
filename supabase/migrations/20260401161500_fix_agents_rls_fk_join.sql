-- Fix: RLS infinite recursion in policy chains
-- 
-- Problem: super_admin policies on agents/contracts/messages checked user_profiles,
-- which had its own policy checking user_profiles (self-recursion). Additionally,
-- cross-table policies (agents↔contract_participants) caused mutual recursion.
--
-- Solution: SECURITY DEFINER helper functions that bypass RLS for auth lookups.

BEGIN;

-- Helper: check if current user is super_admin (bypasses user_profiles RLS)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Helper: agent IDs owned by current user
CREATE OR REPLACE FUNCTION public.my_agent_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT id FROM agents WHERE owner_user_id = auth.uid();
$$;

-- Helper: agent names owned by current user
CREATE OR REPLACE FUNCTION public.my_agent_names()
RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT name FROM agents WHERE owner_user_id = auth.uid();
$$;

-- Helper: contract IDs where current user's agents participate
CREATE OR REPLACE FUNCTION public.my_contract_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT DISTINCT contract_id
  FROM contract_participants
  WHERE agent_id IN (SELECT id FROM agents WHERE owner_user_id = auth.uid());
$$;

-- Helper: all agent IDs visible to current user (own + shared contracts)
CREATE OR REPLACE FUNCTION public.visible_agent_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT id FROM agents WHERE owner_user_id = auth.uid()
  UNION
  SELECT cp2.agent_id
  FROM contract_participants cp1
  JOIN contract_participants cp2 ON cp2.contract_id = cp1.contract_id
  JOIN agents a ON a.id = cp1.agent_id
  WHERE a.owner_user_id = auth.uid();
$$;

-- ============================================================================
-- USER_PROFILES
-- ============================================================================
DROP POLICY IF EXISTS "user_profiles_select_super_admin" ON user_profiles;
CREATE POLICY "user_profiles_select_super_admin" ON user_profiles
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- AGENTS — see own + agents in shared contracts
-- ============================================================================
DROP POLICY IF EXISTS "agents_select_own" ON agents;
DROP POLICY IF EXISTS "agents_select_shared_contract" ON agents;
DROP POLICY IF EXISTS "agents_select_visible" ON agents;
CREATE POLICY "agents_select_visible" ON agents
  FOR SELECT TO authenticated USING (id IN (SELECT public.visible_agent_ids()));

DROP POLICY IF EXISTS "agents_select_super_admin" ON agents;
CREATE POLICY "agents_select_super_admin" ON agents
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- CONTRACTS
-- ============================================================================
DROP POLICY IF EXISTS "contracts_select_own_agents" ON contracts;
CREATE POLICY "contracts_select_own_agents" ON contracts
  FOR SELECT TO authenticated USING (id IN (SELECT public.my_contract_ids()));

DROP POLICY IF EXISTS "contracts_select_super_admin" ON contracts;
CREATE POLICY "contracts_select_super_admin" ON contracts
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- CONTRACT_PARTICIPANTS
-- ============================================================================
DROP POLICY IF EXISTS "contract_participants_select_own" ON contract_participants;
CREATE POLICY "contract_participants_select_own" ON contract_participants
  FOR SELECT TO authenticated USING (contract_id IN (SELECT public.my_contract_ids()));

DROP POLICY IF EXISTS "contract_participants_select_super_admin" ON contract_participants;
CREATE POLICY "contract_participants_select_super_admin" ON contract_participants
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- MESSAGES
-- ============================================================================
DROP POLICY IF EXISTS "messages_select_own_agents" ON messages;
CREATE POLICY "messages_select_own_agents" ON messages
  FOR SELECT TO authenticated USING (contract_id IN (SELECT public.my_contract_ids()));

DROP POLICY IF EXISTS "messages_select_super_admin" ON messages;
CREATE POLICY "messages_select_super_admin" ON messages
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- AUDIT_LOG
-- ============================================================================
DROP POLICY IF EXISTS "audit_log_select_own" ON audit_log;
CREATE POLICY "audit_log_select_own" ON audit_log
  FOR SELECT TO authenticated USING (
    actor IN (SELECT public.my_agent_names())
    OR actor = auth.uid()::text
  );

DROP POLICY IF EXISTS "audit_log_select_super_admin" ON audit_log;
CREATE POLICY "audit_log_select_super_admin" ON audit_log
  FOR SELECT TO authenticated USING (public.is_super_admin());

COMMIT;
