import { createServerClient } from '@/lib/supabase/server';

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
  actor_agent?: { id: string; name: string; display_name: string } | null;
  actor_user?: { id: string; display_name: string } | null;
}

export interface CreateTaskActivityEventInput {
  projectId: string;
  taskId: string;
  actorAgentId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

function isMissingTaskActivityTable(error: { message?: string } | null) {
  return !!error && /(task_activity_events|relation .* does not exist)/i.test(error.message || '');
}

export async function listTaskActivityEvents(taskId: string, limit = 50) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('task_activity_events')
    .select('*, actor_agent:agents!task_activity_events_actor_agent_id_fkey(id, name, display_name), actor_user:user_profiles!task_activity_events_actor_user_id_fkey(id, display_name)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTaskActivityTable(error)) return [] as TaskActivityEvent[];
    throw error;
  }

  return (data || []) as TaskActivityEvent[];
}

export async function appendTaskActivityEvent(input: CreateTaskActivityEventInput) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('task_activity_events')
    .insert({
      project_id: input.projectId,
      task_id: input.taskId,
      actor_agent_id: input.actorAgentId ?? null,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      summary: input.summary,
      metadata: input.metadata ?? {},
      created_at: input.createdAt ?? new Date().toISOString(),
    })
    .select('*, actor_agent:agents!task_activity_events_actor_agent_id_fkey(id, name, display_name), actor_user:user_profiles!task_activity_events_actor_user_id_fkey(id, display_name)')
    .single();

  if (error) {
    if (isMissingTaskActivityTable(error)) return null;
    throw error;
  }

  return data as TaskActivityEvent;
}
