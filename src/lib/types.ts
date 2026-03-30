// ============================================================
// A2A Comms — Core Types
// ============================================================

export type ContractStatus = 'proposed' | 'active' | 'rejected' | 'expired' | 'cancelled' | 'closed';
export type ParticipantRole = 'proposer' | 'invitee';
export type ParticipantStatus = 'pending' | 'accepted' | 'rejected';
export type MessageType = 'message' | 'request' | 'response' | 'update' | 'status';

// ---- Database row types ----

export interface Agent {
  id: string;
  name: string;
  display_name: string;
  owner: string;
  owner_user_id?: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  max_concurrent_contracts: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  is_super_admin: boolean;
  created_at: string;
}

export interface ServiceKey {
  id: string;
  key_id: string;
  key_hash: string;
  signing_secret: string; // only returned at creation time
  agent_id: string | null;
  human_owner: string | null;
  label: string | null;
  is_active: boolean;
  created_at: string;
  rotated_at: string | null;
  expires_at: string | null;
}

export interface Contract {
  id: string;
  title: string;
  description: string | null;
  status: ContractStatus;
  proposer_id: string;
  max_turns: number;
  current_turns: number;
  message_schema: Record<string, unknown> | null;
  close_reason: string | null;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractParticipant {
  id: string;
  contract_id: string;
  agent_id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  responded_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  contract_id: string;
  sender_id: string;
  message_type: MessageType;
  content: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemConfig {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

// ---- API request/response types ----

export interface ProposeContractRequest {
  title: string;
  description?: string;
  invitees: string[]; // agent names
  max_turns?: number;
  expires_in_hours?: number;
  message_schema?: Record<string, unknown>;
}

export interface SendMessageRequest {
  message_type?: MessageType;
  content: Record<string, unknown>;
}

export interface RegisterAgentRequest {
  name: string;
  display_name: string;
  owner: string;
  description?: string;
  capabilities?: string[];
  protocols?: string[];
  max_concurrent_contracts?: number;
}

export interface UpdateAgentRequest {
  capabilities?: string[];
  protocols?: string[];
  max_concurrent_contracts?: number;
  description?: string;
}

export interface CloseContractRequest {
  reason?: string;
}

export interface ContractResponse extends Contract {
  proposer: Pick<Agent, 'id' | 'name' | 'display_name'>;
  participants: Array<{
    agent: Pick<Agent, 'id' | 'name' | 'display_name'>;
    role: ParticipantRole;
    status: ParticipantStatus;
  }>;
}

export interface MessageResponse extends Message {
  sender: Pick<Agent, 'id' | 'name' | 'display_name'>;
  turn_number: number;
  turns_remaining: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}

// ---- Auth context ----

export interface AuthContext {
  agent: Agent;
  keyId: string;
}

// ---- Webhook types ----

export type WebhookEventType = 'invitation' | 'message' | 'contract_state';

export interface Webhook {
  id: string;
  agent_id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_delivery_at: string | null;
  failure_count: number;
}

export interface RegisterWebhookRequest {
  url: string;
  secret: string;
  events?: WebhookEventType[];
}
