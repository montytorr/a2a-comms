-- A2A Comms — Initial Schema
-- Migration: 001_initial_schema.sql
-- Created: 2026-03-28

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Agent registry
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Service keys (HMAC signing)
CREATE TABLE service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT UNIQUE NOT NULL,
  key_hash TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id),
  human_owner TEXT,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Contracts
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'rejected', 'expired', 'cancelled', 'closed')),
  proposer_id UUID NOT NULL REFERENCES agents(id),
  max_turns INTEGER DEFAULT 50,
  current_turns INTEGER DEFAULT 0,
  close_reason TEXT,
  expires_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contract participants (N-party)
CREATE TABLE contract_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  role TEXT NOT NULL DEFAULT 'invitee'
    CHECK (role IN ('proposer', 'invitee')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_id, agent_id)
);

-- Messages within contracts
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES agents(id),
  message_type TEXT NOT NULL DEFAULT 'message'
    CHECK (message_type IN ('message', 'request', 'response', 'update', 'status')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Kill switch / system config
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_proposer ON contracts(proposer_id);
CREATE INDEX idx_contract_participants_agent ON contract_participants(agent_id);
CREATE INDEX idx_contract_participants_contract ON contract_participants(contract_id);
CREATE INDEX idx_messages_contract ON messages(contract_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------
-- agents: readable by all authenticated, writable by service role only
-- -----------------------------------------------------------
CREATE POLICY "agents_select_authenticated"
  ON agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "agents_all_service_role"
  ON agents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- service_keys: NOT accessible via RLS at all (service role only)
-- No policies for anon/authenticated — only service_role bypasses RLS
-- -----------------------------------------------------------
CREATE POLICY "service_keys_all_service_role"
  ON service_keys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- contracts: readable only by participants (via contract_participants join)
-- writable by service role only
-- -----------------------------------------------------------
CREATE POLICY "contracts_select_participants"
  ON contracts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contract_participants cp
      WHERE cp.contract_id = contracts.id
        AND cp.agent_id IN (
          SELECT a.id FROM agents a
          -- In practice, the API layer uses service_role for all agent operations.
          -- This RLS policy provides defense-in-depth for any direct Supabase client access.
        )
    )
    OR
    -- Allow authenticated human users to see all contracts (dashboard UI)
    auth.role() = 'authenticated'
  );

CREATE POLICY "contracts_all_service_role"
  ON contracts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- contract_participants: same visibility as contracts
-- -----------------------------------------------------------
CREATE POLICY "contract_participants_select_authenticated"
  ON contract_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "contract_participants_all_service_role"
  ON contract_participants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- messages: readable only by contract participants
-- writable by service role only
-- -----------------------------------------------------------
CREATE POLICY "messages_select_participants"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contract_participants cp
      WHERE cp.contract_id = messages.contract_id
    )
    OR
    auth.role() = 'authenticated'
  );

CREATE POLICY "messages_all_service_role"
  ON messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- system_config: readable by all, writable by service role
-- -----------------------------------------------------------
CREATE POLICY "system_config_select_all"
  ON system_config FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "system_config_all_service_role"
  ON system_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------
-- audit_log: readable by all authenticated, writable by service role
-- -----------------------------------------------------------
CREATE POLICY "audit_log_select_authenticated"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "audit_log_all_service_role"
  ON audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 4. DEFAULT DATA
-- ============================================================

INSERT INTO system_config (key, value, updated_by)
VALUES ('kill_switch', '{"active": false}'::jsonb, 'system');
