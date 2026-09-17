import { createServerClient } from '@/lib/supabase/server';
import type { DatabaseError as PostgrestError } from '@/lib/db/client';

export const TASK_EXECUTION_STATUSES = [
  'idle',
  'queued',
  'running',
  'pending-approval',
  'waiting',
  'blocked',
  'paused',
  'handoff-needed',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const TASK_EXECUTION_RUN_STATUSES = [
  'queued',
  'starting',
  'running',
  'pending-approval',
  'waiting',
  'blocked',
  'paused',
  'handoff-needed',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type TaskExecutionStatus = typeof TASK_EXECUTION_STATUSES[number];
export type TaskExecutionRunStatus = typeof TASK_EXECUTION_RUN_STATUSES[number];

export interface TaskExecutionRunRow {
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
  created_at: string;
  updated_at: string;
}

export interface TaskExecutionCheckpointRow {
  id: string;
  run_id: string;
  task_id: string;
  project_id: string;
  agent_id: string;
  sequence: number;
  checkpoint_key: string;
  status: 'written' | 'superseded';
  summary: string | null;
  payload: Record<string, unknown>;
  attachment_ids?: string[];
  created_at: string;
}

export interface TaskExecutionSnapshot {
  execution_status: TaskExecutionStatus;
  active_run_id: string | null;
  execution_started_at: string | null;
  execution_heartbeat_at: string | null;
  execution_completed_at: string | null;
  last_checkpoint_at: string | null;
  last_checkpoint_summary: string | null;
  last_checkpoint_payload: Record<string, unknown>;
}

export function isTaskExecutionStatus(value: string): value is TaskExecutionStatus {
  return (TASK_EXECUTION_STATUSES as readonly string[]).includes(value);
}

export function isTaskExecutionRunStatus(value: string): value is TaskExecutionRunStatus {
  return (TASK_EXECUTION_RUN_STATUSES as readonly string[]).includes(value);
}

export function mapRunStatusToTaskStatus(status: TaskExecutionRunStatus): TaskExecutionStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'starting':
    case 'running':
      return 'running';
    case 'pending-approval':
      return 'pending-approval';
    case 'waiting':
      return 'waiting';
    case 'blocked':
      return 'blocked';
    case 'paused':
      return 'paused';
    case 'handoff-needed':
      return 'handoff-needed';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

export function deriveTaskExecutionSnapshot(input: {
  activeRunId?: string | null;
  status?: TaskExecutionRunStatus | null;
  startedAt?: string | null;
  heartbeatAt?: string | null;
  completedAt?: string | null;
  checkpointAt?: string | null;
  checkpointSummary?: string | null;
  checkpointPayload?: Record<string, unknown> | null;
}): TaskExecutionSnapshot {
  const runStatus = input.status ?? null;
  return {
    execution_status: runStatus ? mapRunStatusToTaskStatus(runStatus) : 'idle',
    active_run_id: input.activeRunId ?? null,
    execution_started_at: input.startedAt ?? null,
    execution_heartbeat_at: input.heartbeatAt ?? null,
    execution_completed_at: input.completedAt ?? null,
    last_checkpoint_at: input.checkpointAt ?? null,
    last_checkpoint_summary: input.checkpointSummary ?? null,
    last_checkpoint_payload: input.checkpointPayload ?? {},
  };
}

export async function listTaskExecutionRuns(taskId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('task_execution_runs')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as TaskExecutionRunRow[];
}

function isMissingAttachmentIdsColumn(error: PostgrestError | null) {
  return !!error && /attachment_ids/i.test(error.message || '');
}

async function selectTaskExecutionCheckpoints(
  build: (selectClause: string) => Promise<{ data: unknown; error: PostgrestError | null }>
) {
  const withAttachments = await build('*');
  if (!isMissingAttachmentIdsColumn(withAttachments.error)) {
    return withAttachments;
  }

  const fallback = await build('id, run_id, task_id, project_id, agent_id, sequence, checkpoint_key, status, summary, payload, created_at');
  if (fallback.error) return fallback;

  if (Array.isArray(fallback.data)) {
    return {
      ...fallback,
      data: fallback.data.map((row: unknown) => ({ ...(row as Record<string, unknown>), attachment_ids: [] })),
    };
  }

  return {
    ...fallback,
    data: fallback.data
      ? { ...(fallback.data as Record<string, unknown>), attachment_ids: [] }
      : fallback.data,
  };
}

export async function listTaskExecutionCheckpoints(runId: string) {
  const supabase = createServerClient();
  const { data, error } = await selectTaskExecutionCheckpoints(async (selectClause) =>
    (await supabase
      .from('task_execution_checkpoints')
      .select(selectClause)
      .eq('run_id', runId)
      .order('sequence', { ascending: false })) as { data: unknown; error: PostgrestError | null }
  );

  if (error) throw error;
  return (data || []) as TaskExecutionCheckpointRow[];
}

export async function createTaskExecutionRun(input: {
  taskId: string;
  projectId: string;
  agentId: string;
  status?: TaskExecutionRunStatus;
  attempt?: number;
  summary?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  // Matches the POST /runs route, which defaults to 'starting', and the
  // README. This defaulted to 'queued' — harmless in practice because the
  // route always passes a status, but it made the library disagree with the
  // documented behaviour for anyone reading it as the spec.
  const status = input.status ?? 'starting';
  const startedAt = status === 'queued' ? null : now;
  const completedAt = ['succeeded', 'failed', 'cancelled'].includes(status) ? now : null;
  const heartbeatAt = ['starting', 'running', 'pending-approval', 'waiting', 'blocked', 'paused', 'handoff-needed'].includes(status) ? now : null;

  const { data, error } = await supabase
    .from('task_execution_runs')
    .insert({
      task_id: input.taskId,
      project_id: input.projectId,
      agent_id: input.agentId,
      status,
      attempt: input.attempt ?? 1,
      started_at: startedAt,
      heartbeat_at: heartbeatAt,
      completed_at: completedAt,
      summary: input.summary ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error || !data) throw error;

  await syncTaskExecutionSnapshot({
    taskId: input.taskId,
    activeRunId: data.id,
    status: data.status,
    startedAt: data.started_at,
    heartbeatAt: data.heartbeat_at,
    completedAt: data.completed_at,
    checkpointAt: null,
    checkpointSummary: null,
    checkpointPayload: {},
  });

  return data as TaskExecutionRunRow;
}

export async function updateTaskExecutionRun(input: {
  runId: string;
  taskId: string;
  status?: TaskExecutionRunStatus;
  summary?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  heartbeat?: boolean;
}) {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from('task_execution_runs')
    .select('*')
    .eq('id', input.runId)
    .single();

  if (existingError || !existing) throw existingError;

  const updates: Record<string, unknown> = {};
  if (input.status) {
    updates.status = input.status;
    if (!existing.started_at && input.status !== 'queued') updates.started_at = now;
    if (['starting', 'running', 'pending-approval', 'waiting', 'blocked', 'paused', 'handoff-needed'].includes(input.status)) {
      updates.heartbeat_at = now;
    }
    if (['succeeded', 'failed', 'cancelled'].includes(input.status)) {
      updates.completed_at = now;
    } else {
      updates.completed_at = null;
    }
  }
  if (input.summary !== undefined) updates.summary = input.summary;
  if (input.errorMessage !== undefined) updates.error_message = input.errorMessage;
  if (input.metadata !== undefined) updates.metadata = input.metadata;
  if (input.heartbeat) updates.heartbeat_at = now;

  const { data, error } = await supabase
    .from('task_execution_runs')
    .update(updates)
    .eq('id', input.runId)
    .select()
    .single();

  if (error || !data) throw error;

  const latestCheckpoint = await getLatestTaskCheckpoint(input.taskId, input.runId);
  await syncTaskExecutionSnapshot({
    taskId: input.taskId,
    activeRunId: ['succeeded', 'failed', 'cancelled'].includes(data.status) ? null : data.id,
    status: data.status,
    startedAt: data.started_at,
    heartbeatAt: data.heartbeat_at,
    completedAt: data.completed_at,
    checkpointAt: latestCheckpoint?.created_at ?? null,
    checkpointSummary: latestCheckpoint?.summary ?? null,
    checkpointPayload: latestCheckpoint?.payload ?? {},
  });

  return data as TaskExecutionRunRow;
}

export async function appendTaskCheckpoint(input: {
  runId: string;
  taskId: string;
  projectId: string;
  agentId: string;
  checkpointKey: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  attachmentIds?: string[];
}) {
  const supabase = createServerClient();
  const checkpointPayload = input.payload ?? {};

  // Allocating the sequence and consuming it used to be two statements: the
  // checkpoint was inserted and committed, then the run's checkpoint_count was
  // bumped under a compare-and-set. A missed CAS threw with the row already
  // written, leaving a checkpoint the run could not count — and the next append
  // reused that sequence and died on the unique constraint, permanently. One
  // locked statement does both now.
  const { data: result, error } = await supabase.rpc('append_task_checkpoint_atomic', {
    p_run_id: input.runId,
    p_task_id: input.taskId,
    p_project_id: input.projectId,
    p_agent_id: input.agentId,
    p_checkpoint_key: input.checkpointKey,
    p_summary: input.summary ?? null,
    // Distinguishes "no summary given" from "explicitly cleared", so a
    // checkpoint without one no longer erases the run's summary.
    p_summary_provided: input.summary !== undefined,
    p_payload: checkpointPayload,
    p_attachment_ids: input.attachmentIds ?? [],
  });

  if (error) throw error;
  if (result?.error) {
    throw new Error(result.message || result.error);
  }

  const typedCheckpoint = result.checkpoint as TaskExecutionCheckpointRow;

  const { data: updatedRun } = await supabase
    .from('task_execution_runs')
    .select('id, status, started_at, heartbeat_at, completed_at')
    .eq('id', input.runId)
    .single();

  if (updatedRun) {
    await syncTaskExecutionSnapshot({
      taskId: input.taskId,
      activeRunId: updatedRun.id,
      status: updatedRun.status,
      startedAt: updatedRun.started_at,
      heartbeatAt: updatedRun.heartbeat_at,
      completedAt: updatedRun.completed_at,
      checkpointAt: typedCheckpoint.created_at,
      checkpointSummary: typedCheckpoint.summary,
      checkpointPayload,
    });
  }

  return typedCheckpoint;
}

export async function getLatestTaskCheckpoint(taskId: string, runId?: string) {
  const supabase = createServerClient();
  const { data, error } = await selectTaskExecutionCheckpoints(async (selectClause) => {
    let query = supabase
      .from('task_execution_checkpoints')
      .select(selectClause)
      .eq('task_id', taskId)
      .order('sequence', { ascending: false })
      .limit(1);

    if (runId) query = query.eq('run_id', runId);
    return (await query.maybeSingle()) as { data: unknown; error: PostgrestError | null };
  });

  if (error) throw error;
  return (data || null) as TaskExecutionCheckpointRow | null;
}

export async function syncTaskExecutionSnapshot(input: {
  taskId: string;
  activeRunId?: string | null;
  status?: TaskExecutionRunStatus | null;
  startedAt?: string | null;
  heartbeatAt?: string | null;
  completedAt?: string | null;
  checkpointAt?: string | null;
  checkpointSummary?: string | null;
  checkpointPayload?: Record<string, unknown> | null;
}) {
  const supabase = createServerClient();
  const snapshot = deriveTaskExecutionSnapshot(input);

  const { error } = await supabase
    .from('tasks')
    .update(snapshot)
    .eq('id', input.taskId);

  if (error) throw error;
}
