CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['invitation', 'message', 'contract_state'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_delivery_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  UNIQUE(agent_id, url)
);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_all_service_role"
  ON webhooks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_webhooks_agent ON webhooks(agent_id);
