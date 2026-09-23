// ============================================================
// Holloway — Core Types
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
/** Mirrors the `pending_approvals.status` CHECK constraint (see
 *  20260918170000_allow_consumed_approval_status.sql). `consumed` is an
 *  approval that was granted and then spent on the action it gated. */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed';
/** The `webhook_deliveries.status` values the delivery pipeline actually
 *  writes. NOTE: the table's CHECK constraint still only permits
 *  ('pending','success','failed') — `pending_retry` and `retrying` are written
 *  by src/lib/webhooks.ts and have no migration behind them. */
export type WebhookDeliveryStatus = 'pending' | 'pending_retry' | 'retrying' | 'success' | 'failed';
/** `receipt` and `approval` are non-turn types: they never consume a contract
 *  turn, stay available once the turn cap is reached, and never trigger the
 *  max-turn auto-close. See AC-47. */
export type MessageType = 'message' | 'request' | 'response' | 'update' | 'status' | 'receipt' | 'approval';

/** Message types that are bookkeeping about the conversation rather than a
 *  move within it. Kept in one place so the API, the CLI and the reactor
 *  cannot drift on which types are free. */
export const NON_TURN_MESSAGE_TYPES: ReadonlySet<MessageType> = new Set<MessageType>(['receipt', 'approval']);

export function consumesTurn(messageType: MessageType): boolean {
  return !NON_TURN_MESSAGE_TYPES.has(messageType);
}
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
  /** Agent name, user email, or system:<cause>. Null for rows closed before
   *  this was recorded, and for historical system closes with no audit row. */
  closed_by: string | null;
  closed_by_kind: 'agent' | 'user' | 'system' | null;
  expires_at: string | null;
  closed_at: string | null;
  /** When true the contract will not auto-close on max turns, and cannot be
   *  closed as complete, until the proposer records an approval. */
  completion_requires_approval: boolean;
  completion_approved_at: string | null;
  completion_approved_by: string | null;
  /** True when a gated contract was closed without its approval recorded:
   *  the work was not accepted (outcome `closed-unapproved`). */
  closed_without_approval: boolean;
  /** Why this contract has no task link. Null when linked, or created before
   *  a link (or a reason) was required. */
  unlinked_reason: string | null;
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
  /** What this message cost the contract, recorded when it was written. */
  requires_action?: boolean;
  consumes_turn?: boolean;
  /** The contract turn this message belongs to. A non-turn message carries the
   *  turn the contract stood at, so it is placed without advancing it. */
  turn_number?: number | null;
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
  /** Hold the contract open on max turns, and refuse a complete-close, until
   *  the proposer records an approval. Exhausting a turn budget is not the
   *  same as the work being accepted. */
  completion_requires_approval?: boolean;
  /**
   * Link the new contract to a project task in the same call. Both are required
   * together. Validated before the contract is created, so a rejected link
   * never leaves an unlinked contract behind.
   */
  project_id?: string;
  task_id?: string;
  /**
   * Required when project_id + task_id are not given, unless `continues` or
   * `supersedes` names a predecessor whose task link can be inherited. At
   * least 10 characters.
   */
  unlinked_reason?: string;
  /** The contract this one carries on. Recorded as a `continues` link, and
   *  the predecessor's task link is inherited when no task is given. */
  continues?: string;
  /** The contract this one replaces. Same rules as `continues`; at most one. */
  supersedes?: string;
}

export interface SendMessageRequest {
  message_type?: MessageType;
  content: Record<string, unknown>;
  /** Explicitly mark a message as needing no follow-up. Defaults to false for
   *  non-turn types and true otherwise, so old clients keep their behaviour. */
  requires_action?: boolean;
  /** Hand the next move to a person in the same request: opens a question on
   *  the operator channel and stores the message with requires_action false,
   *  because the peer is not expected to answer it. */
  needs_human?: {
    question: string;
    kind?: OperatorQuestionKind;
    blocking?: boolean;
  };
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
  /**
   * Proposer only, on a completion-gated contract whose approval was never
   * recorded: close it WITHOUT accepting the work. Requires a reason of at
   * least 10 characters. Recorded as outcome `closed-unapproved`.
   */
  without_approval?: boolean;
}

export interface ContractResponse extends Contract {
  proposer: Pick<Agent, 'id' | 'name' | 'display_name'>;
  participants: Array<{
    agent: Pick<Agent, 'id' | 'name' | 'display_name'>;
    role: ParticipantRole;
    status: ParticipantStatus;
  }>;
  attachments?: TaskAttachment[];
  /**
   * The project task this contract is linked to, or null when it is not linked.
   * A contract reaches a project only through a task, so this is also how you
   * find the contract's project.
   */
  linked_task?: LinkedTaskSummary | null;
  /**
   * Contracts this one succeeds, replaces, or handed execution to - and the
   * ones that did the same to it. Both directions, because a contract is
   * usually read from whichever end you happen to be holding.
   */
  related_contracts?: RelatedContractSummary[];
  /**
   * Whose move it is, from the point of view of the agent that asked. Always
   * present on an authenticated response; `null` only when no caller could be
   * identified.
   */
  turn_state?: ContractTurnStateSummary | null;
  /**
   * Standing instructions a human left on this contract. Re-read on every
   * contract read rather than delivered once, so a note written now takes
   * effect the next time an agent looks. Never a turn and never a wake.
   *
   * Present in full on a single-contract read. On a list read only the counts
   * are returned - see `operator_channel` - because embedding every note body
   * for every contract turns a list into a transcript.
   */
  operator_notes?: OperatorNoteSummary[];
  /**
   * Questions agents have put to a person on this contract. Full on a single
   * read, counted on a list read, same as the notes.
   */
  operator_questions?: OperatorQuestionSummary[];
  /** Counts, always present. The list read returns these and nothing else. */
  operator_channel?: OperatorChannelCounts;
}

/**
 * A recent contract between exactly the same agents that ended (or ran out of
 * turns) without its work being accepted, and that nothing yet continues.
 */
export interface LikelyPredecessorSummary {
  id: string;
  title: string;
  status: ContractStatus;
  current_turns: number;
  max_turns: number;
}

/** POST /v1/contracts. The contract, plus a nudge when it looks like an
 *  unrecorded continuation. Never blocks the proposal. */
export interface ProposeContractResponse extends ContractResponse {
  likely_predecessors: LikelyPredecessorSummary[];
  succession_hint: string | null;
}

/** Mirrors ContractTurnState in contract-turn-state.ts, which derives it. */
export interface ContractTurnStateSummary {
  /**
   * `human` means an agent has said it is blocked and asked a person. Nothing
   * is owed by either agent until that question is answered, so the inbox must
   * not nag anyone for a move they have already said they cannot make.
   */
  awaiting: 'you' | 'peer' | 'nobody' | 'human';
  reason: string;
  awaiting_agent_id: string | null;
  awaiting_agent_name: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  last_requires_action: boolean | null;
}

/**
 * The contract-to-contract vocabulary. Read every link as
 * "from_contract <link_type> to_contract".
 *
 * There is deliberately no generic `relates_to`: the shared task already
 * carries generic relatedness, and a second way to say the same thing drifts
 * from the one that drives behaviour.
 */
export type ContractLinkType = 'continues' | 'supersedes' | 'delegates_to';

/** `outgoing` - this contract is the `from` end. `incoming` - it is the `to` end. */
export type ContractLinkDirection = 'outgoing' | 'incoming';

export interface RelatedContractSummary {
  contract_id: string;
  title: string;
  status: ContractStatus;
  link_type: ContractLinkType;
  direction: ContractLinkDirection;
  note: string | null;
  linked_at: string;
  /** Null when the server wrote the link from a handoff or escalation path. */
  linked_by_agent_id: string | null;
}

/** What an agent needs from a person. */
export type OperatorQuestionKind = 'question' | 'validation' | 'blocked';

export type OperatorQuestionStatus = 'open' | 'answered' | 'dismissed';

export interface OperatorNoteSummary {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  /** Set once withdrawn. A withdrawn note is history, not standing context. */
  withdrawn_at: string | null;
  /**
   * Whether the agent that asked has acknowledged this note. Advisory - an
   * unacknowledged note is still in force. Null when no agent was identified.
   */
  acknowledged?: boolean | null;
}

export interface OperatorQuestionSummary {
  id: string;
  kind: OperatorQuestionKind;
  body: string;
  /** The agent says it cannot proceed without an answer. */
  blocking: boolean;
  status: OperatorQuestionStatus;
  asked_by_agent_id: string;
  asked_by_agent_name: string | null;
  created_at: string;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
}

export interface OperatorChannelCounts {
  notes: number;
  /** Live notes this agent has not acknowledged. Null when no agent was identified. */
  unacknowledged_notes: number | null;
  open_questions: number;
  /** Open questions whose asker said it cannot proceed. */
  blocking_questions: number;
}

export interface LinkedTaskSummary {
  task_id: string;
  task_title: string | null;
  task_status: string | null;
  project_id: string;
  project_title: string | null;
}

export interface MessageResponse extends Message {
  sender: Pick<Agent, 'id' | 'name' | 'display_name'>;
  turn_number: number;
  turns_remaining: number;
  /** False for receipts and approvals, which leave the turn budget untouched. */
  consumes_turn: boolean;
  requires_action: boolean;
  /** Present when this message satisfied a completion-approval gate. */
  completion_approved_at?: string | null;
  /** Present, and true, when this message spent the last of the turn budget
   *  (the same moment `X-Contract-Status: exhausted` is sent). */
  budget_exhausted?: boolean;
  /** What the sender can do next, worded for their role. Present with
   *  `budget_exhausted`. */
  next_steps?: string[];
  /** The operator-channel question opened by `needs_human`. */
  question_id?: string;
  /** Present when the message hands the move to a person in prose but opened
   *  no question: says nobody was notified and how to fix it. */
  human_handoff_hint?: string;
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
  | 'contract.question_asked'
  | 'contract.question_answered'
  | 'contract.note_added'
  | 'contract.expired'
  | 'contract_state'
  | 'task.created'
  | 'task.updated'
  | 'task.blocker_stale'
  | 'task.run_stale'
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
