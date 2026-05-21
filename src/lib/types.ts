// ============================================================
// A2A Comms — Core Types
// ============================================================

export type ContractStatus = 'proposed' | 'active' | 'rejected' | 'expired' | 'cancelled' | 'closed';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type SprintStatus = 'planned' | 'active' | 'completed';
export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskExecutionStatus = 'idle' | 'queued' | 'running' | 'pending-approval' | 'waiting' | 'blocked' | 'paused' | 'handoff-needed' | 'succeeded' | 'failed' | 'cancelled';
export type TaskExecutionRunStatus = 'queued' | 'starting' | 'running' | 'pending-approval' | 'waiting' | 'blocked' | 'paused' | 'handoff-needed' | 'succeeded' | 'failed' | 'cancelled';
export type TaskCheckpointStatus = 'written' | 'superseded';
export type ProjectMemberRole = 'owner' | 'member' | 'observer';
export type ProjectInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type ParticipantRole = 'proposer' | 'invitee' | 'observer';
export type ParticipantStatus = 'pending' | 'accepted' | 'rejected';
export type MessageType = 'message' | 'request' | 'response' | 'update' | 'status';
export type ReputationSignalKey = 'delivery_reliability' | 'approval_outcomes' | 'collaboration_quality' | 'security_hygiene';
export type ReputationConfidenceBand = 'none' | 'low' | 'medium' | 'high';
export type ReputationEventSourceType = 'task_run' | 'approval' | 'security_incident' | 'handoff' | 'system';

// ---- Database row types ----

export interface AgentPrivacyMetadata {
  version?: number;
  data_handling?: 'standard' | 'confidential' | 'restricted';
  retention_days?: number;
  allow_training?: boolean;
  allow_operator_exports?: boolean;
  redaction_level?: 'standard' | 'enhanced' | 'strict';
}

export interface ProjectPrivacyMetadata {
  version?: number;
  visibility?: 'standard' | 'confidential' | 'restricted';
  retention_mode?: 'standard' | 'short' | 'strict';
  retention_days?: number;
  allow_observer_access?: boolean;
  allow_exports?: boolean;
  redaction_level?: 'standard' | 'enhanced' | 'strict';
}

export interface Agent {
  id: string;
  name: string;
  display_name: string;
  owner: string;
  owner_user_id?: string;
  trust_tier?: 'internal' | 'partner' | 'external';
  trust_notes?: string | null;
  trust_policy?: {
    version?: number;
    webhooks?: {
      management?: 'internal' | 'partner' | 'external';
    };
    observer_project_access?: {
      read?: 'internal' | 'partner' | 'external';
      download_project_attachments?: 'internal' | 'partner' | 'external';
    };
    project_participants?: {
      list_members?: 'internal' | 'partner' | 'external';
      list_observers?: 'internal' | 'partner' | 'external';
    };
    project_invitations?: {
      list_pending?: 'internal' | 'partner' | 'external';
    };
  } | null;
  privacy_metadata?: AgentPrivacyMetadata | null;
  reputation_snapshot?: AgentReputationSnapshot | null;
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

export interface ReputationSignalValue {
  key: ReputationSignalKey;
  value: number;
  sample_count: number;
  weighted_contribution?: number;
  last_event_at?: string | null;
  notes?: string[];
}

export interface ReputationScoreExplanation {
  score_version: number;
  score: number | null;
  confidence: number;
  confidence_band: ReputationConfidenceBand;
  gating: {
    minimum_events_for_provisional: number;
    minimum_events_for_stable: number;
    observed_events: number;
    is_visible: boolean;
    is_stable: boolean;
    reason?: string;
  };
  decay: {
    half_life_days: number;
    stale_after_days: number;
    evaluated_at: string;
    newest_event_at: string | null;
  };
  signals: ReputationSignalValue[];
  adjustments: {
    anti_gaming_penalty: number;
    manual_review_only: boolean;
    reasons: string[];
  };
}

export interface AgentReputationSnapshot {
  agent_id: string;
  score_version: number;
  score: number | null;
  confidence: number;
  confidence_band: ReputationConfidenceBand;
  stable: boolean;
  signals: ReputationSignalValue[];
  explanation: ReputationScoreExplanation;
  calculated_at: string;
}

export interface ReputationLedgerEvent {
  id: string;
  agent_id: string;
  occurred_at: string;
  recorded_at: string;
  source_type: ReputationEventSourceType;
  signal_key: ReputationSignalKey;
  value: number;
  weight_hint: number | null;
  source_id: string | null;
  project_id: string | null;
  task_id: string | null;
  contract_id: string | null;
  reviewer_agent_id: string | null;
  reviewer_user_id: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentReputationDetail extends AgentReputationSnapshot {
  ledger_events: ReputationLedgerEvent[];
  explanation_contract?: unknown;
  policy_guidance?: ReputationPolicyGuidance;
}

export interface ReputationPolicyGuidanceItem {
  id: string;
  severity: 'info' | 'warning' | 'elevated';
  title: string;
  summary: string;
  recommendation: string;
  rationale?: string;
}

export interface ReputationPolicyGuidance {
  advisory_only: true;
  generated_at: string;
  stable_enough: boolean;
  visible_score: boolean;
  score: number | null;
  confidence_band: ReputationConfidenceBand;
  recommended_posture: 'standard' | 'caution' | 'manual-review';
  items: ReputationPolicyGuidanceItem[];
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
  observers?: string[]; // agent names
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
  trust_tier?: 'internal' | 'partner' | 'external';
  trust_notes?: string | null;
  trust_policy?: Agent['trust_policy'];
  privacy_metadata?: AgentPrivacyMetadata | null;
}

export interface UpdateAgentRequest {
  capabilities?: string[];
  protocols?: string[];
  max_concurrent_contracts?: number;
  description?: string;
  trust_tier?: 'internal' | 'partner' | 'external';
  trust_notes?: string | null;
  trust_policy?: Agent['trust_policy'];
  privacy_metadata?: AgentPrivacyMetadata | null;
  deactivate?: boolean;
  deactivate_reason?: string | null;
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
  attachments?: TaskAttachment[];
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
  limit?: number;
}

export interface ApiError {
  error: string;
  code: string;
  details?: string | Array<{ field: string; message: string }>;
}

// ---- Auth context ----

export interface AuthContext {
  agent: Agent;
  keyId: string;
}

// ---- Webhook types ----

export type WebhookEventType =
  | 'invitation'
  | 'message'
  | 'contract.accepted'
  | 'contract.rejected'
  | 'contract.cancelled'
  | 'contract.closed'
  | 'contract.expired'
  | 'contract_state'
  | 'task.created'
  | 'task.updated'
  | 'task.blocker_stale'
  | 'sprint.created'
  | 'sprint.updated'
  | 'project.member_invited'
  | 'project.member_accepted'
  | 'project.member_declined'
  | 'project.member_cancelled'
  | 'project.member_expired'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.denied';

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

// ---- Projects & Tasks types ----

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  owner_user_id: string | null;
  created_by_agent_id: string | null;
  privacy_metadata?: ProjectPrivacyMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  agent_id: string;
  role: ProjectMemberRole;
  joined_at: string;
}

export interface ProjectObserver {
  id: string;
  project_id: string;
  agent_id: string;
  invited_by_agent_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ProjectMemberInvitation {
  id: string;
  project_id: string;
  agent_id: string;
  invited_by_agent_id: string;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  responded_at: string | null;
  reminder_sent_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  title: string;
  goal: string | null;
  status: SprintStatus;
  start_date: string | null;
  end_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  sprint_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_agent_id: string | null;
  reporter_agent_id: string | null;
  labels: string[];
  due_date: string | null;
  position: number;
  active_run_id?: string | null;
  execution_status?: TaskExecutionStatus;
  execution_started_at?: string | null;
  execution_heartbeat_at?: string | null;
  execution_completed_at?: string | null;
  last_checkpoint_at?: string | null;
  last_checkpoint_summary?: string | null;
  last_checkpoint_payload?: Record<string, unknown>;
  blocked_at?: string | null;
  blocker_follow_up_at?: string | null;
  blocker_followed_through_at?: string | null;
  blocker_escalated_at?: string | null;
  blocker_resolution_action?: string | null;
  blocker_resolution_owner?: string | null;
  blocker_resolution_due_at?: string | null;
  blocker_resolution_status?: 'follow-up' | 'escalate' | null;
  created_at: string;
  updated_at: string;
}

export type TaskDependencyType = 'blocks' | 'relates_to' | 'sequence_after';

export interface TaskDependency {
  id: string;
  blocking_task_id: string;
  blocked_task_id: string;
  dependency_type: TaskDependencyType;
  created_at: string;
}

export interface TaskContract {
  id: string;
  task_id: string;
  contract_id: string;
  linked_at: string;
}

export interface TaskExecutionRun {
  id: string;
  task_id: string;
  project_id: string;
  agent_id: string;
  status: TaskExecutionRunStatus;
  attempt: number;
  started_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
  checkpoint_count: number;
  summary: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  delegated_by_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  observer_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  broker_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachment {
  id: string;
  project_id: string;
  task_id: string | null;
  contract_id: string | null;
  run_id: string | null;
  checkpoint_id: string | null;
  uploader_agent_id: string | null;
  uploader_user_id?: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  sha256?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  preview_url?: string;
  download_url?: string;
}

export interface TaskExecutionCheckpoint {
  id: string;
  run_id: string;
  task_id: string;
  project_id: string;
  agent_id: string;
  sequence: number;
  checkpoint_key: string;
  status: TaskCheckpointStatus;
  summary: string | null;
  payload: Record<string, unknown>;
  attachment_ids?: string[];
  agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  delegated_by_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  observer_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  broker_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  created_at: string;
}

export interface TaskActivityEvent {
  id: string;
  project_id: string;
  task_id: string;
  actor_agent_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_agent?: Pick<Agent, 'id' | 'name' | 'display_name'> | null;
  actor_user?: Pick<UserProfile, 'id' | 'display_name'> | null;
}

// ---- Projects & Tasks API request types ----

export interface CreateProjectRequest {
  title: string;
  description?: string;
  members?: string[]; // agent IDs to add as members
  privacy_metadata?: ProjectPrivacyMetadata | null;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  privacy_metadata?: ProjectPrivacyMetadata | null;
}

export interface CreateSprintRequest {
  title: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpdateSprintRequest {
  title?: string;
  goal?: string;
  status?: SprintStatus;
  start_date?: string;
  end_date?: string;
  position?: number;
}

export interface EscalationContractRequest {
  brokers: string[];
  max_turns?: number;
  expires_in_hours?: number;
  title?: string;
  description?: string;
  escalation_reason?: string;
  requested_intervention?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  sprint_id?: string;
  priority?: TaskPriority;
  assignee_agent_id?: string;
  labels?: string[];
  due_date?: string;
  handoff_contract?: {
    invitees: string[];
    max_turns?: number;
    expires_in_hours?: number;
    title?: string;
    description?: string;
  };
  escalation_contract?: EscalationContractRequest;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  sprint_id?: string | null;
  assignee_agent_id?: string | null;
  labels?: string[];
  due_date?: string | null;
  position?: number;
  handoff_contract?: {
    invitees: string[];
    max_turns?: number;
    expires_in_hours?: number;
    title?: string;
    description?: string;
  };
  escalation_contract?: EscalationContractRequest;
}

export interface CreateTaskExecutionRunRequest {
  status?: TaskExecutionRunStatus;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskExecutionRunRequest {
  status?: TaskExecutionRunStatus;
  summary?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
  heartbeat?: boolean;
}

export interface CreateTaskExecutionCheckpointRequest {
  checkpoint_key: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  attachment_ids?: string[];
}
